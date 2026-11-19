"""Ponte entre as telas do protótipo e o servidor.

As telas (prototipo/app.js) continuam iguais. Em vez do localStorage, o estado fica no PostgreSQL e é o mesmo para todos.
O servidor:
  - faz o login (AD/LDAP ou usuários de teste) e diz quem é o usuário;
  - confere cada gravação: só o gestor imediato aprova/reprova; ninguém troca o gestor; colaborador só cria pedido em nome próprio;
  - envia de verdade (noreply) os e-mails que as telas geram, só para pessoas conhecidas (quem já entrou no sistema e seus gestores);
  - gera o link de aprovação com token (no estado compartilhado nunca fica token).
"""
import copy
import hashlib
import hmac
import secrets
import time
from datetime import datetime, timedelta
from html import escape
from types import SimpleNamespace

from fastapi import APIRouter, BackgroundTasks, Request
from fastapi.responses import JSONResponse
from sqlalchemy import JSON, Boolean, DateTime, Integer, String, Text, func, select, text
from sqlalchemy.orm import Mapped, mapped_column

from . import auth, config, mail
from .db import Base, Sessao, auditar

rota = APIRouter()
LEMBRETE_MIN = 60


class Estado(Base):
    __tablename__ = 'estado'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    versao: Mapped[int] = mapped_column(Integer, default=0)
    dados: Mapped[dict | None] = mapped_column(JSON)
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class Pessoa(Base):
    """Usuários conhecidos. A TI define o perfil e pode bloquear o acesso. Também é a lista de quem pode receber e-mail."""
    __tablename__ = 'pessoas'
    email: Mapped[str] = mapped_column(String(200), primary_key=True)
    nome: Mapped[str] = mapped_column(String(200), default='')
    origem: Mapped[str] = mapped_column(String(30), default='')
    perfil: Mapped[str | None] = mapped_column(String(15))  # vazio = padrão (configuração / colaborador)
    ativo: Mapped[bool] = mapped_column(Boolean, default=True)
    ultimo_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    cc: Mapped[str] = mapped_column(String(200), default='')
    login: Mapped[str] = mapped_column(String(100), default='', index=True)
    cargo: Mapped[str] = mapped_column(String(200), default='')
    gestor_email: Mapped[str] = mapped_column(String(200), default='')
    gestor_nome: Mapped[str] = mapped_column(String(200), default='')
    ou: Mapped[str] = mapped_column(String(300), default='')
    travado: Mapped[bool] = mapped_column(Boolean, default=False)  # editado pela TI: o AD não sobrescreve nome/setor/cargo/gestor
    matricula: Mapped[str] = mapped_column(String(30), default='', index=True)  # base do RH: setor e gestor vêm do RH
    sem_email: Mapped[bool] = mapped_column(Boolean, default=False)  # conta sem caixa de e-mail (identificada pelo UPN)
    senha_hash: Mapped[str] = mapped_column(String(200), default='')  # login por senha do Mobilab (antes do Entra). Só o hash (scrypt).


PERFIS = ('colaborador', 'facilities', 'ti')


def migrar():
    """Colunas novas em tabelas que já existiam (create_all não altera tabela existente)."""
    from .db import engine
    with engine.begin() as c:
        for col in ("perfil varchar(15)", "ativo boolean not null default true", "ultimo_login timestamptz", "cc varchar(200) not null default ''",
                    "login varchar(100) not null default ''", "cargo varchar(200) not null default ''", "gestor_email varchar(200) not null default ''",
                    "gestor_nome varchar(200) not null default ''", "ou varchar(300) not null default ''", "travado boolean not null default false",
                    "matricula varchar(30) not null default ''", "sem_email boolean not null default false",
                    "senha_hash varchar(200) not null default ''"):
            c.execute(text(f'alter table pessoas add column if not exists {col}'))


class Envio(Base):
    __tablename__ = 'envios'
    id: Mapped[str] = mapped_column(String(40), primary_key=True)  # id do e-mail no estado (EM-n)
    para: Mapped[str] = mapped_column(String(200))
    assunto: Mapped[str] = mapped_column(String(300))
    kind: Mapped[str] = mapped_column(String(30), default='')
    ref: Mapped[str] = mapped_column(String(100), default='')
    situacao: Mapped[str] = mapped_column(String(15), default='pendente')  # pendente|enviado|erro|desligado|bloqueado|limite
    erro: Mapped[str] = mapped_column(Text, default='')
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class TokenAprov(Base):
    __tablename__ = 'tokens_aprov'
    hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    req_id: Mapped[str] = mapped_column(String(30), index=True)
    gestor_email: Mapped[str] = mapped_column(String(200))
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    usado: Mapped[bool] = mapped_column(Boolean, default=False)


def agora():
    return datetime.now(config.FUSO)


def _h(t):
    return hashlib.sha256(t.encode()).hexdigest()


def usuario_tela(u):
    """Usuário da sessão no formato que as telas usam (S.user)."""
    cargo = {'facilities': 'Facilities', 'ti': 'TI / Administração do sistema'}.get(u['perfil'], 'Gestor' if u.get('gestor_de') else (u.get('cc') or 'Colaborador'))
    return {'email': u['email'], 'nome': u['nome'], 'cargo': cargo, 'role': u['perfil'], 'cc': u.get('cc') or '',
            'gestor': bool(u.get('gestor_de')), 'chefe': u.get('gestor') or {'nome': '', 'email': ''}}


def conhecer(s, u):
    for email, nome, origem in ((u['email'], u['nome'], 'login'), ((u.get('gestor') or {}).get('email'), (u.get('gestor') or {}).get('nome'), 'gestor-ad')):
        if email and not s.get(Pessoa, email.lower()):
            s.add(Pessoa(email=email.lower(), nome=nome or '', origem=origem, ativo=True))
    s.flush()
    p = s.get(Pessoa, u['email'])
    g = u.get('gestor') or {}
    if not p.travado and not p.matricula:  # sem edição manual e fora da base do RH: o que veio do AD atualiza o cadastro
        p.nome, p.cc = u['nome'] or p.nome, u.get('cc') or p.cc
        if g.get('email'):
            p.gestor_email, p.gestor_nome = g['email'].lower(), g.get('nome') or p.gestor_nome
    p.ultimo_login = agora()
    u['nome'], u['cc'] = p.nome or u['nome'], p.cc or u.get('cc', '')
    u['gestor'] = {'nome': p.gestor_nome, 'email': p.gestor_email} if p.gestor_email else g
    if not p.perfil and u.get('perfil') in ('facilities', 'ti'):
        p.perfil = u['perfil']
    if p.origem != 'login':
        p.origem = 'login'


def perfil_efetivo(p, padrao):
    return p.perfil if p and p.perfil in PERFIS else padrao


def _estado(s, travar=False):
    q = select(Estado).where(Estado.id == 1)
    if travar:
        q = q.with_for_update()
    e = s.scalars(q).first()
    if not e:
        e = Estado(id=1, versao=0, dados=None)
        s.add(e)
        s.flush()
    return e


# ---------------- sessão ----------------
@rota.get('/api/eu')
def eu(request: Request):
    u = request.session.get('u')
    return {'user': usuario_tela(u) if u else None, 'login_teste': config.LOGIN_TESTE}


@rota.post('/api/login')
async def api_login(request: Request):
    corpo = await request.json()
    try:
        u = auth.login(str(corpo.get('usuario', '')), str(corpo.get('senha', '')))
    except auth.LoginInvalido as ex:
        u = _teste_usuario_ad(str(corpo.get('usuario', ''))) if config.LOGIN_TESTE else None
        if not u:
            return JSONResponse({'erro': 'Modo de teste: digite o login ou o e-mail de um usuário importado do AD (ou use os botões abaixo).'
                                 if config.LOGIN_TESTE else str(ex)}, status_code=401)
    with Sessao() as s:
        p = s.get(Pessoa, u['email'])
        if p and not p.ativo:
            return JSONResponse({'erro': 'Seu acesso ao Mobilab está bloqueado. Fale com a TI.'}, status_code=403)
        u['perfil'] = perfil_efetivo(p, u['perfil'])  # perfil definido pela TI vale mais que o padrão
        if p and not p.perfil and u['perfil'] != 'colaborador':
            p.perfil = u['perfil']  # registra o perfil vindo da configuração para aparecer certo na lista
        dados = _estado(s).dados or {}
        if not u.get('gestor_de'):
            u['gestor_de'] = any((r.get('gestor') or {}).get('email', '').lower() == u['email'] for r in dados.get('reqs', [])) or \
                bool(s.scalar(select(func.count()).select_from(Pessoa).where(Pessoa.gestor_email == u['email'], Pessoa.ativo.is_(True))))
        conhecer(s, u)
        auditar(s, u['email'], 'Login', '', '', 'AD' if config.LDAP_SERVER else ('teste' if config.LOGIN_TESTE else 'senha do Mobilab'))
        s.commit()
    request.session.clear()
    request.session['u'] = u
    return {'user': usuario_tela(u)}


# ---------------- estado ----------------
@rota.get('/api/estado')
def ler_estado(request: Request, v: int = -1):
    if not request.session.get('u'):
        return JSONResponse({'erro': 'Entre novamente.'}, status_code=401)
    with Sessao() as s:
        e = _estado(s)
        s.commit()
        if v == e.versao:
            return {'versao': e.versao, 'igual': True}
        return {'versao': e.versao, 'estado': e.dados}


class Recusa(Exception):
    pass


def _validar(u, antigo, novo):
    """Regras que as telas não podem burlar."""
    velhos = {r['id']: r for r in (antigo or {}).get('reqs', [])}
    staff = u['perfil'] in ('facilities', 'ti')
    chefe = u.get('gestor') or {}
    for r in novo.get('reqs', []):
        r.pop('tok', None)  # token de aprovação nunca fica no estado compartilhado
        o = velhos.get(r.get('id'))
        if o is None:  # pedido novo
            if not staff and str(r.get('email', '')).lower() != u['email']:
                raise Recusa('Você só pode criar solicitações em seu nome.')
            if r.get('tipo') == 'inter':
                if not chefe.get('email'):
                    raise Recusa('Seu gestor imediato não está cadastrado no AD. Fale com a TI.')
                r['status'] = 'gestor'
                r['gestor'] = {'nome': chefe.get('nome', ''), 'email': chefe['email'].lower()}
                r.pop('aprov', None)
            continue
        if o.get('gestor'):
            r['gestor'] = o['gestor']  # ninguém troca o gestor de um pedido
        ge = str((o.get('gestor') or {}).get('email', '')).lower()
        if o.get('status') == 'gestor' and r.get('status') != 'gestor':
            ok_gestor = u['email'] == ge and r.get('status') in ('analise', 'recusada')
            ok_cancel = r.get('status') == 'cancelada' and (u['email'] == str(o.get('email', '')).lower() or staff)
            if not (ok_gestor or ok_cancel):
                raise Recusa('Só o gestor imediato pode aprovar ou reprovar esta solicitação.')
        if r.get('aprov') != o.get('aprov') and u['email'] != ge:
            raise Recusa('Só o gestor imediato pode aprovar ou reprovar esta solicitação.')


@rota.put('/api/estado')
async def gravar_estado(request: Request, tarefas: BackgroundTasks):
    u = request.session.get('u')
    if not u:
        return JSONResponse({'erro': 'Entre novamente.'}, status_code=401)
    corpo = await request.json()
    novo = corpo.get('estado') or {}
    novo.pop('user', None)
    novo.pop('week', None)
    with Sessao() as s:
        e = _estado(s, travar=True)
        if int(corpo.get('versao', -1)) != e.versao:
            return JSONResponse({'erro': 'conflito', 'versao': e.versao, 'estado': e.dados}, status_code=409)
        try:
            _validar(u, e.dados, novo)
        except Recusa as ex:
            return JSONResponse({'erro': str(ex), 'versao': e.versao, 'estado': e.dados}, status_code=403)
        envios = _novos_emails(s, e.dados, novo)
        e.dados = copy.deepcopy(novo)
        e.versao += 1
        s.commit()
        versao = e.versao
    for env in envios:
        tarefas.add_task(_enviar, *env)
    return {'versao': versao}


# ---------------- e-mails gerados pelas telas → envio real ----------------
def _ns_req(r):
    return SimpleNamespace(codigo=r.get('id', ''), tipo=r.get('tipo', ''), data=datetime.strptime(r['data'], '%Y-%m-%d').date(), hora=r.get('hora', ''),
                           origem=r.get('origem', ''), destino=r.get('destino', ''), pax=r.get('pax', ''), justificativa=r.get('just', ''),
                           solicitante_nome=r.get('nome', ''), centro_custo=r.get('cc', ''), gestor_nome=(r.get('gestor') or {}).get('nome', ''))


def _novos_emails(s, antigo, novo):
    vistos = {m.get('id') for m in (antigo or {}).get('emails', [])}
    reqs = {r['id']: r for r in novo.get('reqs', [])}
    saida = []
    for m in novo.get('emails', []):
        if m.get('id') in vistos or s.get(Envio, m.get('id')):
            continue
        para = str(m.get('para', '')).lower()
        ref = (m.get('refs') or [''])[0]
        env = Envio(id=m['id'], para=para, assunto=str(m.get('assunto', ''))[:300], kind=m.get('kind') or 'confirmacao', ref=ref)
        s.add(env)
        pd = s.get(Pessoa, para)
        if not pd:
            env.situacao, env.erro = 'bloqueado', 'Destinatário desconhecido (ainda não entrou no sistema nem é gestor de quem entrou).'
            continue
        if pd.sem_email:
            env.situacao, env.erro = 'sem_email', 'Pessoa sem caixa de e-mail: vê o aviso só no Mobilab.'
            continue
        if m.get('kind') == 'aprovacao':
            r = reqs.get(ref)
            if not r or r.get('status') != 'gestor':
                env.situacao = 'bloqueado'
                continue
            para = env.para = str((r.get('gestor') or {}).get('email', '')).lower()  # vale o gestor do cadastro, não o que a tela mandou
            pg = s.get(Pessoa, para)
            if not pg or pg.sem_email:
                env.situacao = 'bloqueado' if not pg else 'sem_email'
                continue
            ult = s.scalars(select(Envio).where(Envio.ref == ref, Envio.kind == 'aprovacao', Envio.situacao == 'enviado')
                            .order_by(Envio.criado_em.desc())).first()
            if ult and agora() - ult.criado_em < timedelta(minutes=LEMBRETE_MIN):
                env.situacao, env.erro = 'limite', f'Gestor avisado há menos de {LEMBRETE_MIN} min.'
                continue
            token = secrets.token_urlsafe(32)
            viagem = datetime.combine(datetime.strptime(r['data'], '%Y-%m-%d').date(), datetime.strptime(r['hora'], '%H:%M').time(), config.FUSO)
            s.add(TokenAprov(hash=_h(token), req_id=r['id'], gestor_email=para, expira_em=viagem))
            assunto, texto, html = mail.modelo_aprovacao(_ns_req(r), f'{config.APP_URL}/#aprovar/{token}', lembrete=str(m.get('assunto', '')).startswith('Lembrete'))
        else:
            assunto = str(m.get('assunto', ''))
            texto = str(m.get('corpo', ''))
            corpo = (f'<h1 style="margin:0 0 12px;font-size:20px;color:#1f2937">{escape(assunto)}</h1>'
                     f'<div style="white-space:pre-wrap;color:#374151;line-height:1.5">{escape(texto)}</div>'
                     f'<p style="margin:18px 0 0"><a href="{escape(config.APP_URL)}/" style="color:#4a8f1f;font-weight:700">Abrir o Mobilab</a></p>')
            html = mail._moldura('SOLICITAÇÃO DE VIAGEM', corpo)
        saida.append((m['id'], para, assunto, texto, html))
    return saida


def _enviar(env_id, para, assunto, texto, html):
    with Sessao() as s:
        e = mail.registrar(s, para, assunto, 'tela')
        s.commit()
        eid = e.id
    mail.enviar(eid, para, assunto, texto, html)
    with Sessao() as s:
        from .db import Email
        e, env = s.get(Email, eid), s.get(Envio, env_id)
        if env and e:
            env.situacao, env.erro = e.situacao, (e.erro or '')[:500] if e.situacao == 'erro' else ''
        s.commit()


# ---------------- aprovação pelo link do e-mail (sem login: o token é a credencial) ----------------
def _por_token(s, tok):
    t = s.get(TokenAprov, _h(tok))
    if not t:
        return None, None, None
    e = _estado(s, travar=True)
    reqs = (e.dados or {}).get('reqs', [])
    r = next((x for x in reqs if x.get('id') == t.req_id), None)
    return t, e, r


def _publico(r):
    campos = ('id', 'tipo', 'nome', 'cc', 'data', 'hora', 'origem', 'destino', 'pax', 'just', 'status', 'aprov', 'gestor', 'bv', 'excecao', 'perna', 'par')
    return {k: r.get(k) for k in campos if k in r} if r else None


@rota.get('/api/aprovar/{tok}')
def ver_token(tok: str):
    with Sessao() as s:
        t, e, r = _por_token(s, tok)
        s.rollback()
        if not r:
            return JSONResponse({'erro': 'invalido'}, status_code=404)
        pr = next((x for x in e.dados.get('reqs', []) if x.get('id') == r.get('par')), None)
        expirado = t.expira_em <= agora() and r.get('status') == 'gestor'
        return {'r': _publico(r), 'par': _publico(pr), 'expirado': expirado}


@rota.post('/api/aprovar/{tok}')
async def decidir_token(tok: str, request: Request, tarefas: BackgroundTasks):
    corpo = await request.json()
    ok = bool(corpo.get('ok'))
    motivo = '' if ok else str(corpo.get('motivo', '')).strip()[:500]
    with Sessao() as s:
        t, e, r = _por_token(s, tok)
        if not r:
            return JSONResponse({'erro': 'invalido'}, status_code=404)
        if r.get('status') != 'gestor' or t.expira_em <= agora():
            s.rollback()
            return {'r': _publico(r)}
        dados = copy.deepcopy(e.dados)
        reqs = dados['reqs']
        r = next(x for x in reqs if x['id'] == t.req_id)
        par = next((x for x in reqs if x.get('id') == r.get('par')), None)
        alvo = [x for x in (r, par) if x and x.get('status') == 'gestor']
        quando = agora().strftime('%d/%m/%Y, %H:%M:%S')
        for x in alvo:
            nome_g = (x.get('gestor') or {}).get('nome', '')
            x['aprov'] = {'ok': ok, 'quando': quando, 'ts': int(time.time() * 1000), 'por': nome_g, 'motivo': motivo}
            if ok:
                x['status'] = 'analise'
            else:
                x['status'] = 'recusada'
                x['motivo'] = f'Reprovada pelo gestor {nome_g}' + (f': {motivo}' if motivo else '')
            dados.setdefault('log', []).insert(0, {'t': quando, 'user': nome_g, 'acao': 'Aprovada pelo gestor' if ok else 'Reprovada pelo gestor',
                                                   'ref': x['id'], 'antes': 'Aguardando gestor', 'depois': 'Em análise' if ok else x['motivo']})
        if not ok:  # mesmo e-mail que a tela gera na recusa (aparece também no sininho do colaborador)
            L = [f"Olá, {r.get('nome', '').split(' ')[0]}!", '', 'Sua solicitação não pôde ser atendida pelo Facilities.', '']
            for x in alvo:
                L += [f"{x['id']} — {config.TIPOS.get(x.get('tipo'), x.get('tipo'))}: {config.local_nome(x.get('origem'))} → {config.local_nome(x.get('destino'))}",
                      f"Data e horário pedidos: {x['data'][8:10]}/{x['data'][5:7]} {x['hora']}"]
            L += ['', f"Motivo: {alvo[0]['motivo']}", 'Se precisar, faça uma nova solicitação em outro horário ou fale com o Facilities.', '', 'Mobilab · Facilities Natulab']
            em = dados.setdefault('emails', [])
            em.append({'id': f'EM-{len(em) + 1}', 'para': r.get('email'), 'nome': r.get('nome'), 'refs': [x['id'] for x in alvo], 'quando': quando,
                       'lida': False, 'kind': 'recusada', 'assunto': f"Recusada: sua solicitação {', '.join(x['id'] for x in alvo)}", 'corpo': '\n'.join(L)})
        t.usado = True
        envios = _novos_emails(s, e.dados, dados)
        e.dados = dados
        e.versao += 1
        auditar(s, t.gestor_email, 'Aprovada pelo gestor (e-mail)' if ok else 'Reprovada pelo gestor (e-mail)', r['id'], 'Aguardando gestor', r['status'])
        s.commit()
    for env in envios:
        tarefas.add_task(_enviar, *env)
    return {'r': _publico(r)}


# ---------------- gestão de usuários (só TI) ----------------
def _ti(request):
    u = request.session.get('u')
    return u if u and u.get('perfil') == 'ti' else None


def _linha_usuario(p):
    return {'email': p.email, 'nome': p.nome, 'cc': p.cc, 'origem': p.origem, 'ativo': p.ativo, 'cargo': p.cargo, 'gestor': p.gestor_nome,
            'gestor_email': p.gestor_email, 'login': p.login, 'travado': p.travado, 'matricula': p.matricula, 'sem_email': p.sem_email,
            'perfil': p.perfil or '', 'padrao': config.perfil_de(p.email),
            'ultimo_login': p.ultimo_login.astimezone(config.FUSO).strftime('%d/%m/%Y %H:%M') if p.ultimo_login else ''}


@rota.get('/api/usuarios')
def listar_usuarios(request: Request):
    if not _ti(request):
        return JSONResponse({'erro': 'Só a TI gerencia usuários.'}, status_code=403)
    with Sessao() as s:
        return {'usuarios': [_linha_usuario(p) for p in s.scalars(select(Pessoa).order_by(Pessoa.nome, Pessoa.email)).all()]}


@rota.post('/api/usuarios')
async def salvar_usuario(request: Request):
    u = _ti(request)
    if not u:
        return JSONResponse({'erro': 'Só a TI gerencia usuários.'}, status_code=403)
    c = await request.json()
    email = str(c.get('email', '')).strip().lower()
    if '@' not in email or len(email) > 200 or ' ' in email:
        return JSONResponse({'erro': 'Informe um e-mail válido.'}, status_code=400)
    perfil = c.get('perfil')
    if perfil not in (None, '', *PERFIS):
        return JSONResponse({'erro': 'Perfil inválido.'}, status_code=400)
    with Sessao() as s:
        p = s.get(Pessoa, email)
        antes = _linha_usuario(p) if p else {}
        if not p:
            p = Pessoa(email=email, nome=str(c.get('nome', '')).strip()[:200], origem='cadastro-ti', ativo=True)
            s.add(p)
        if 'nome' in c and str(c['nome']).strip():
            p.nome = str(c['nome']).strip()[:200]
        dados_mudaram = False
        for campo, tam in (('cc', 200), ('cargo', 200), ('login', 100)):
            if campo in c:
                v = str(c[campo] or '').strip()[:tam]
                dados_mudaram |= v != getattr(p, campo)
                setattr(p, campo, v)
        if 'gestor_email' in c:
            ge = str(c['gestor_email'] or '').strip().lower()
            if ge == email:
                s.rollback()
                return JSONResponse({'erro': 'A pessoa não pode ser gestora de si mesma.'}, status_code=400)
            gp = s.get(Pessoa, ge) if ge else None
            if ge and not gp:
                s.rollback()
                return JSONResponse({'erro': 'Gestor não encontrado. Escolha alguém da lista de usuários.'}, status_code=400)
            dados_mudaram |= ge != p.gestor_email
            p.gestor_email, p.gestor_nome = ge, (gp.nome if gp else '')
        if 'travado' in c:
            p.travado = bool(c['travado'])
        elif dados_mudaram or ('nome' in c and antes and c['nome'] != antes.get('nome')):
            p.travado = True  # editou à mão: a próxima importação do AD não desfaz
        if perfil is not None:
            p.perfil = perfil or None
        if 'ativo' in c:
            p.ativo = bool(c['ativo'])
        if email == u['email'] and (not p.ativo or (p.perfil and p.perfil != 'ti')):
            s.rollback()
            return JSONResponse({'erro': 'Você não pode tirar o seu próprio acesso de TI.'}, status_code=400)
        s.flush()
        auditar(s, u['email'], 'Usuário alterado' if antes else 'Usuário cadastrado', email, antes, _linha_usuario(p))
        s.commit()
        return {'usuario': _linha_usuario(p)}


@rota.get('/api/pessoas')
def listar_colegas(request: Request):
    """Para 'Adicionar colega' na reserva: só nome, e-mail e setor de quem está ativo (qualquer usuário logado)."""
    if not request.session.get('u'):
        return JSONResponse({'erro': 'Faça login novamente.'}, status_code=401)
    with Sessao() as s:
        ps = s.scalars(select(Pessoa).where(Pessoa.ativo.is_(True), Pessoa.email != ADMIN_EMAIL).order_by(Pessoa.nome)).all()
        return {'pessoas': [{'nome': p.nome or p.email, 'email': p.email, 'cc': p.cc} for p in ps]}


@rota.post('/api/usuarios/senha')
async def definir_senha(request: Request):
    """Só a TI (administrador) define a senha do Mobilab de um colaborador. A senha nunca é guardada nem registrada, só o hash."""
    u = _ti(request)
    if not u:
        return JSONResponse({'erro': 'Só o administrador (TI) pode mudar senhas.'}, status_code=403)
    c = await request.json()
    email = str(c.get('email', '')).strip().lower()
    senha = str(c.get('senha', ''))
    if len(senha) < 8 or len(senha) > 128:
        return JSONResponse({'erro': 'A senha precisa ter de 8 a 128 caracteres.'}, status_code=400)
    if senha.strip() != senha:
        return JSONResponse({'erro': 'A senha não pode começar nem terminar com espaço.'}, status_code=400)
    with Sessao() as s:
        p = s.get(Pessoa, email)
        if not p:
            return JSONResponse({'erro': 'Usuário não encontrado.'}, status_code=404)
        p.senha_hash = gerar_hash(senha)
        for chave in (p.email, (p.login or '').lower()):
            _FALHAS.pop(chave, None)  # destrava quem errou demais
        auditar(s, u['email'], 'Senha alterada pela TI', email, '', 'nova senha definida')
        s.commit()
    return {'ok': True}


# ---------------- testes com usuários reais (só com LOGIN_TESTE=1 e sem LDAP) ----------------
def _teste_usuario_ad(chave):
    """Entra como um usuário importado do AD, sem senha. Só existe no modo de teste."""
    chave = chave.strip().lower()
    if not chave or config.LDAP_SERVER:
        return None
    with Sessao() as s:
        p = s.get(Pessoa, chave) or s.scalars(select(Pessoa).where(func.lower(Pessoa.login) == chave.split('@')[0])).first()
        if not p or p.origem not in ('ad', 'rh', 'login') or not p.login:
            return None
        return {'email': p.email, 'nome': p.nome, 'cc': p.cc, 'perfil': p.perfil or config.perfil_de(p.email),
                'gestor': {'nome': p.gestor_nome, 'email': p.gestor_email}}


def importar_ad(lista):
    """Importa/atualiza usuários vindos do AD. Não mexe em perfil nem em bloqueio feito pela TI."""
    novos = atualizados = 0
    with Sessao() as s:
        for x in lista:
            email = str(x.get('email', '')).strip().lower()
            if '@' not in email:
                continue
            p = s.get(Pessoa, email)
            if not p:
                p = Pessoa(email=email, ativo=True)
                s.add(p)
                novos += 1
            else:
                atualizados += 1
            p.login, p.ou = x.get('login', '') or p.login, x.get('ou', '')
            if not p.travado and not p.matricula:  # editado pela TI ou vindo do RH: mantém
                p.nome, p.cc, p.cargo = x.get('nome') or p.nome, x.get('setor', ''), x.get('cargo', '')
                p.gestor_email, p.gestor_nome = str(x.get('gestor_email', '')).lower(), x.get('gestor_nome', '')
            if p.origem != 'login':
                p.origem = 'ad'
        auditar(s, 'sistema', 'Importação do AD', '', '', f'{novos} novos, {atualizados} atualizados')
        s.commit()
    return novos, atualizados


def setor_bonito(t):
    """'GARANTIA DA QUALIDADE' → 'Garantia da Qualidade' (mantém siglas curtas como P & D)."""
    pal = str(t or '').split()
    return ' '.join(w.lower() if w.lower() in ('de', 'da', 'do', 'das', 'dos', 'e') and i else (w if len(w) <= 2 else w.capitalize())
                    for i, w in enumerate(pal))


def importar_rh(lista, remover_fora=True):
    """Importa a lista conferida (base do RH + contas do AD). Setor e gestor vêm do RH.
    remover_fora: apaga quem foi importado antes só pelo AD e não está na lista (nunca entrou, não foi editado)."""
    novos = atualizados = removidos = 0
    emails = set()
    with Sessao() as s:
        for x in lista:
            email = str(x['email']).strip().lower()
            emails.add(email)
            p = s.get(Pessoa, email)
            if not p:
                p = Pessoa(email=email, ativo=True)
                s.add(p)
                novos += 1
            else:
                atualizados += 1
            p.login, p.ou, p.sem_email = x.get('login') or p.login, x.get('ou', ''), bool(x.get('sem_email'))
            p.matricula = str(x.get('matricula') or p.matricula or '')
            if not p.travado:
                p.nome = x.get('nome') or p.nome
                p.cc = setor_bonito(x['setor']) if x.get('matricula') else (x.get('setor') or p.cc)
                p.cargo = x.get('cargo') or p.cargo
                if x.get('gestor_email') != email:
                    p.gestor_email = str(x.get('gestor_email') or '').lower()
            if p.origem not in ('login', 'cadastro-ti'):
                p.origem = 'rh' if x.get('matricula') else 'ad'
        s.flush()
        nomes = {p.email: p.nome for p in s.scalars(select(Pessoa)).all()}
        for p in s.scalars(select(Pessoa).where(Pessoa.email.in_(emails))).all():
            p.gestor_nome = nomes.get(p.gestor_email, '') if p.gestor_email in nomes else ''
            if p.gestor_email and p.gestor_email not in nomes:
                p.gestor_email = ''
        if remover_fora:
            for p in s.scalars(select(Pessoa).where(Pessoa.origem == 'ad', Pessoa.ultimo_login.is_(None), Pessoa.travado.is_(False))).all():
                if p.email not in emails:
                    s.delete(p)
                    removidos += 1
        auditar(s, 'sistema', 'Importação RH + AD', '', '', f'{novos} novos, {atualizados} atualizados, {removidos} removidos')
        s.commit()
    return novos, atualizados, removidos


# ---------------- senha do Mobilab (enquanto o login Microsoft/Entra não está ligado) ----------------
_FALHAS = {}  # usuário -> [horários das tentativas erradas]; trava após 5 erros em 15 min
ADMIN_EMAIL = 'admin@mobilab.local'


def gerar_hash(senha):
    sal = secrets.token_bytes(16)
    h = hashlib.scrypt(senha.encode(), salt=sal, n=2 ** 14, r=8, p=1, dklen=32)
    return f'scrypt${sal.hex()}${h.hex()}'


def conferir_hash(senha, guardado):
    try:
        tipo, sal, h = guardado.split('$')
        if tipo != 'scrypt':
            return False
        calc = hashlib.scrypt(senha.encode(), salt=bytes.fromhex(sal), n=2 ** 14, r=8, p=1, dklen=32)
        return hmac.compare_digest(calc.hex(), h)
    except (ValueError, AttributeError):
        return False


def login_local(usuario, senha):
    chave = (usuario or '').strip().lower()
    if not chave or not senha:
        raise auth.LoginInvalido('Informe usuário (ou e-mail) e senha.')
    t = time.time()
    falhas = [x for x in _FALHAS.get(chave, []) if t - x < 900]
    if len(falhas) >= 5:
        raise auth.LoginInvalido('Muitas tentativas erradas. Aguarde 15 minutos ou fale com a TI.')
    with Sessao() as s:
        p = s.get(Pessoa, chave) or s.scalars(select(Pessoa).where(func.lower(Pessoa.login) == chave.split('@')[0])).first()
        ok = bool(p and p.senha_hash and conferir_hash(senha, p.senha_hash))
        if not ok:
            _FALHAS[chave] = falhas + [t]
            raise auth.LoginInvalido('Usuário ou senha inválidos.')
        _FALHAS.pop(chave, None)
        return {'email': p.email, 'nome': p.nome, 'cc': p.cc, 'perfil': p.perfil or config.perfil_de(p.email),
                'gestor': {'nome': p.gestor_nome, 'email': p.gestor_email}}


def senhas_aleatorias():
    """Cria/atualiza a conta de administrador e troca a senha de TODOS por senhas aleatórias que ninguém conhece
    (o texto não é guardado). Devolve só a senha do administrador."""
    alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'
    senha_admin = '-'.join(''.join(secrets.choice(alfabeto) for _ in range(5)) for _ in range(4))
    with Sessao() as s:
        adm = s.get(Pessoa, ADMIN_EMAIL)
        if not adm:
            adm = Pessoa(email=ADMIN_EMAIL)
            s.add(adm)
        adm.nome, adm.login, adm.perfil, adm.ativo, adm.origem = 'Administrador Mobilab', 'admin', 'ti', True, 'cadastro-ti'
        adm.sem_email, adm.travado, adm.cc = True, True, 'Tecnologia da Informacao'
        adm.senha_hash = gerar_hash(senha_admin)
        n = 0
        for p in s.scalars(select(Pessoa).where(Pessoa.email != ADMIN_EMAIL)).all():
            p.senha_hash = gerar_hash(secrets.token_urlsafe(24))
            n += 1
        auditar(s, 'sistema', 'Senhas aleatórias', '', '', f'{n} usuários com senha aleatória; conta admin criada/atualizada')
        s.commit()
    return senha_admin, n
