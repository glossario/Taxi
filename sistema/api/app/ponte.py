"""Ponte entre as telas do protótipo e o servidor.

As telas (prototipo/app.js) continuam iguais. Em vez do localStorage, o estado fica no PostgreSQL e é o mesmo para todos.
O servidor:
  - faz o login (AD/LDAP ou usuários de teste) e diz quem é o usuário;
  - confere cada gravação: só o gestor imediato aprova/reprova; ninguém troca o gestor; colaborador só cria pedido em nome próprio;
  - envia de verdade (noreply) os e-mails que as telas geram, só para pessoas conhecidas (quem já entrou no sistema e seus gestores);
  - gera o link de aprovação com token (no estado compartilhado nunca fica token).
"""
import copy
import csv
import hashlib
import io
import json
import hmac
import re
import secrets
import time
from datetime import datetime, timedelta, timezone
from html import escape
from types import SimpleNamespace

from fastapi import APIRouter, BackgroundTasks, Request
from urllib.parse import quote

from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse, Response
from sqlalchemy import JSON, Boolean, DateTime, Integer, LargeBinary, String, Text, func, select, text
from sqlalchemy.orm import Mapped, mapped_column

from . import auth, config, entra, mail
from .db import Auditoria, Base, Sessao, auditar, verificar_auditoria

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


class Foto(Base):
    """Foto de perfil vinda do Entra ID (Microsoft). dados vazio = a pessoa não tem foto (tenta de novo depois de alguns dias)."""
    __tablename__ = 'fotos'
    email: Mapped[str] = mapped_column(String(200), primary_key=True)
    dados: Mapped[bytes | None] = mapped_column(LargeBinary)
    tipo: Mapped[str] = mapped_column(String(40), default='image/jpeg')
    em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


def guardar_foto(s, email, foto):
    f = s.get(Foto, email) or Foto(email=email)
    f.dados, f.tipo = (foto[0], foto[1]) if foto else (None, 'image/jpeg')
    f.em = datetime.now(timezone.utc)
    s.add(f)


PERFIS = ('colaborador', 'facilities', 'ti', 'ti_jr')  # ti = Administrador, ti_jr = Admin Júnior; Super Admin = só a conta do Mobilab
ADMINS = ('ti', 'ti_jr')


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
    sup = u['email'] == ADMIN_EMAIL
    cargo = 'Super Admin' if sup else {'facilities': 'Facilities', 'ti': 'Administrador', 'ti_jr': 'Admin Júnior'}.get(u['perfil'], 'Gestor' if u.get('gestor_de') else (u.get('cc') or 'Colaborador'))
    return {'email': u['email'], 'nome': u['nome'], 'cargo': cargo, 'role': u['perfil'], 'super': sup, 'cc': u.get('cc') or '',
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
    if not p.perfil and u.get('perfil') in ('facilities', 'ti', 'ti_jr'):
        p.perfil = u['perfil']
    if p.origem != 'login':
        p.origem = 'login'


LIDERANCA = re.compile(r'\b(l[ií]der|coordenador|coordenadora|gerente|diretor|diretora|presidente)\b', re.I)


def e_lider(cargo):
    """Cargos que aprovam: Líder, Coordenador(a), Gerente, Diretor(a) e Presidente (topo da cadeia)."""
    return bool(LIDERANCA.search(cargo or ''))


def aprovador_de(s, p):
    """Sobe pela cadeia de gestores (gestor_email) até achar alguém ativo com cargo de liderança.
    Se ninguém na cadeia tiver, fica o gestor imediato (o Facilities acompanha)."""
    if not p:
        return None
    vistos, atual = {p.email}, p.gestor_email
    for _ in range(10):
        if not atual or atual in vistos:
            break
        g = s.get(Pessoa, atual)
        if not g:
            break
        if g.ativo and e_lider(g.cargo):
            return {'nome': g.nome, 'email': g.email}
        vistos.add(atual)
        atual = g.gestor_email
    return {'nome': p.gestor_nome, 'email': p.gestor_email} if p.gestor_email else None


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
    return {'user': usuario_tela(u) if u else None, 'login_teste': config.LOGIN_TESTE, 'entra': entra.ligado()}


@rota.post('/api/login')
async def api_login(request: Request):
    corpo = await request.json()
    try:
        u = auth.login(str(corpo.get('usuario', '')), str(corpo.get('senha', '')))
    except auth.LoginInvalido as ex:
        u = _teste_usuario_ad(str(corpo.get('usuario', ''))) if config.LOGIN_TESTE else None
        if not u:
            with Sessao() as s:
                auditar(s, str(corpo.get('usuario', ''))[:200].strip().lower() or '(vazio)', 'Login recusado', depois=f'senha do Mobilab: {ex}')
                s.commit()
            return JSONResponse({'erro': 'Modo de teste: digite o login ou o e-mail de um usuário importado do AD (ou use os botões abaixo).'
                                 if config.LOGIN_TESTE else str(ex)}, status_code=401)
    como = 'AD' if config.LDAP_SERVER else ('teste' if config.LOGIN_TESTE else 'senha do Mobilab')
    erro = abrir_sessao(request, u, como)
    if erro:
        return JSONResponse({'erro': erro}, status_code=403)
    return {'user': usuario_tela(request.session['u'])}


def abrir_sessao(request, u, como):
    """Depois de conferida a identidade (senha, AD ou Microsoft): aplica bloqueio e perfil e grava a sessão. Devolve o erro ou None."""
    with Sessao() as s:
        p = s.get(Pessoa, u['email'])
        if p and not p.ativo:
            auditar(s, u['email'], 'Login recusado', nome=u.get('nome', ''), depois=f'{como}: acesso bloqueado')
            s.commit()
            return 'Seu acesso ao Mobilab está bloqueado. Fale com a TI.'
        u['perfil'] = perfil_efetivo(p, u['perfil'])  # perfil definido pela TI vale mais que o padrão
        if p and not p.perfil and u['perfil'] != 'colaborador':
            p.perfil = u['perfil']  # registra o perfil vindo da configuração para aparecer certo na lista
        dados = _estado(s).dados or {}
        conhecer(s, u)
        p = s.get(Pessoa, u['email'])
        # quem aprova: o 1º líder/coordenador/gerente/diretor acima na hierarquia (pula gestor imediato sem cargo de liderança)
        u['gestor'] = aprovador_de(s, p) or u.get('gestor') or {}
        # vê a aba Aprovações: quem tem cargo de liderança ou já tem solicitação esperando por ele
        u['gestor_de'] = e_lider(p.cargo) or any(r.get('status') == 'gestor' and (r.get('gestor') or {}).get('email', '').lower() == u['email']
                                                 for r in dados.get('reqs', []))  # só solicitação AGUARDANDO a pessoa; já decidida não conta
        auditar(s, u['email'], 'Login', '', '', como, nome=u.get('nome', ''))
        s.commit()
    request.session.clear()
    request.session['u'] = u
    return None


# ---------------- login com a conta Microsoft (Entra ID) ----------------
@rota.get('/auth/entra')
def entra_inicio(request: Request):
    if not entra.ligado():
        return RedirectResponse('/?erro=' + quote('O login com a conta Microsoft ainda não está ligado.'), status_code=303)
    st, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    request.session['entra'] = {'state': st, 'nonce': nonce, 't': time.time()}
    return RedirectResponse(entra.url_login(st, nonce), status_code=303)


@rota.get('/auth/callback')
def entra_retorno(request: Request, code: str = '', state: str = '', error: str = '', error_description: str = ''):
    def falha(msg):
        return RedirectResponse('/?erro=' + quote(msg), status_code=303)
    pa = request.session.get('assinar')
    if pa and state and hmac.compare_digest(state, pa.get('state', '')):  # volta da assinatura eletrônica (janelinha)
        request.session.pop('assinar', None)
        return _concluir_assinatura(request, pa, code, error, error_description)
    pend = request.session.pop('entra', None)
    if error:
        return falha('Login cancelado.' if error == 'access_denied' else f'A Microsoft recusou o login: {error_description[:160] or error}')
    if not pend or not code or not hmac.compare_digest(state, pend.get('state', '')) or time.time() - pend.get('t', 0) > 900:
        return falha('O login expirou. Clique em “Entrar com a conta Microsoft” de novo.')
    try:
        d = entra.concluir_login(code, pend['nonce'])
    except entra.ErroEntra as ex:
        with Sessao() as s:
            auditar(s, '(conta Microsoft)', 'Login recusado', depois=f'conta Microsoft: {ex}')
            s.commit()
        return falha(str(ex))
    with Sessao() as s:  # a pessoa pode estar cadastrada pelo e-mail, pelo UPN ou pelo login de rede
        p = s.get(Pessoa, d['email']) or (s.get(Pessoa, d['upn']) if d['upn'] else None) or \
            s.scalars(select(Pessoa).where(func.lower(Pessoa.login) == d['login'])).first()
        email = p.email if p else d['email']
        if p and d['login'] and not p.login:
            p.login = d['login']
            s.commit()
    if not email or '@' not in email:
        return falha('Não foi possível identificar o e-mail da sua conta Microsoft.')
    if d.get('foto') is not False:  # foto de perfil do Entra (ou o registro de que a pessoa não tem)
        try:
            with Sessao() as s:
                guardar_foto(s, email, d.get('foto'))
                s.commit()
        except Exception as ex:  # foto nunca impede o login
            print('Foto de perfil não gravada:', ex, flush=True)
    u = {'email': email, 'nome': d['nome'], 'cc': d['cc'], 'perfil': config.perfil_de(email), 'gestor': d['gestor']}
    erro = abrir_sessao(request, u, 'conta Microsoft')
    return falha(erro) if erro else RedirectResponse('/', status_code=303)


def sincronizar_entra(quem='sistema'):
    """Atualiza quem já está no Mobilab com os dados do Entra (nome, setor, cargo, gestor, login).
    O bloqueio vem do Entra: conta desativada lá fica bloqueada aqui (e volta quando reativada).
    Não cria ninguém (contas de serviço/salas ficam de fora; a pessoa entra no 1º login) e não mexe em perfil,
    quem foi editado pela TI (travado) nem em setor/gestor de quem vem da base do RH."""
    contas = entra.listar_usuarios()
    por_email = {}
    for x in contas:
        for k in {x['email'], x['upn']}:
            if k:
                por_email[k] = x
    por_login = {x['login']: x for x in contas if x['login']}
    atual = desativadas = 0
    with Sessao() as s:
        for p in s.scalars(select(Pessoa).where(Pessoa.email != ADMIN_EMAIL)).all():
            x = por_email.get(p.email) or por_login.get((p.login or '').lower())
            if not x:
                continue
            atual += 1
            desativadas += not x['ativo']
            p.ativo = x['ativo']
            p.login = p.login or x['login']
            if x['ou']:
                p.ou = x['ou']
            if not p.travado and not p.matricula:
                p.nome, p.cc, p.cargo = x['nome'] or p.nome, x['setor'] or p.cc, x['cargo'] or p.cargo
                if x['gestor_email']:
                    p.gestor_email, p.gestor_nome = x['gestor_email'], x['gestor_nome']
        total = s.scalar(select(func.count()).select_from(Pessoa)) - 1
        res = {'contas_entra': len(contas), 'atualizados': atual, 'sem_conta_entra': total - atual, 'conta_desativada_no_entra': desativadas}
        auditar(s, quem, 'Sincronização Entra ID', '', '', res)
        s.commit()
    return res


@rota.post('/api/usuarios/sincronizar-entra')
def sincronizar_entra_api(request: Request):
    u = _ti(request)
    if not u:
        return JSONResponse({'erro': 'Só a TI sincroniza usuários.'}, status_code=403)
    try:
        return sincronizar_entra(u['email'])
    except entra.ErroEntra as ex:
        return JSONResponse({'erro': str(ex)}, status_code=502)


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


CANCEL_MIN = 30  # cancelar até 30 min antes não custa; depois, a corrida já alocada continua cobrada


def _cobranca_cancelamento(r, o):
    """Só o servidor decide se o cancelamento é cobrado (pela hora do servidor)."""
    if o is None:
        r.pop('cobrar', None)
        return
    if r.get('status') == 'cancelada' and o.get('status') != 'cancelada':
        try:
            saida = datetime.strptime(f"{o['data']} {o['hora']}", '%Y-%m-%d %H:%M').replace(tzinfo=config.FUSO)
        except (KeyError, ValueError):
            saida = None
        tarde = bool(saida and o.get('veiculo') and o.get('motorista') and o.get('status') in ('confirmada', 'andamento')
                     and agora() >= saida - timedelta(minutes=CANCEL_MIN))
        r['cobrar'] = tarde
        if tarde:  # mantém veículo e motorista para a corrida entrar nos custos
            r['veiculo'], r['motorista'], r['data'], r['hora'] = o['veiculo'], o['motorista'], o['data'], o['hora']
            r['cancelada_em'] = agora().strftime('%d/%m/%Y %H:%M')
    else:
        if o.get('cobrar') is None:
            r.pop('cobrar', None)
        else:
            r['cobrar'] = o['cobrar']
        if o.get('cancelada_em'):
            r['cancelada_em'] = o['cancelada_em']


def _validar(u, antigo, novo, s):
    """Regras que as telas não podem burlar."""
    velhos = {r['id']: r for r in (antigo or {}).get('reqs', [])}
    staff = u['perfil'] in ('facilities', 'ti', 'ti_jr')
    for r in novo.get('reqs', []):
        r.pop('tok', None)  # token de aprovação nunca fica no estado compartilhado
        o = velhos.get(r.get('id'))
        r['assinaturas'] = list((o or {}).get('assinaturas') or [])  # só o servidor grava assinaturas
        _cobranca_cancelamento(r, o)
        if o is None:  # pedido novo
            chefe = u.get('gestor') or {}
            dono = str(r.get('email', '')).lower()
            if dono == u['email']:
                r.pop('por', None)
            else:  # pedido para outra pessoa: precisa estar ativa no cadastro; o nome vem do cadastro,
                # o centro de custo continua o de quem pediu, e fica registrado quem pediu
                p = s.get(Pessoa, dono)
                if not p or not p.ativo or dono == ADMIN_EMAIL:
                    raise Recusa('Escolha a pessoa na lista de usuários ativos do Mobilab.')
                eu = s.get(Pessoa, u['email'])
                r['email'], r['nome'], r['cc'] = p.email, p.nome or p.email, (eu.cc if eu else '') or u.get('cc', '')
                r['por'] = {'nome': u.get('nome', ''), 'email': u['email']}
                chefe = aprovador_de(s, p) or {}
            if r.get('tipo') == 'inter':
                if not chefe.get('email'):
                    raise Recusa('Quem vai viajar não tem gestor (liderança) cadastrado para aprovar. Fale com a TI.')
                r['status'] = 'gestor'
                r['gestor'] = {'nome': chefe.get('nome', ''), 'email': chefe['email'].lower()}
                r.pop('aprov', None)
            continue
        if o.get('gestor'):
            r['gestor'] = o['gestor']  # ninguém troca o gestor de um pedido
        ge = str((o.get('gestor') or {}).get('email', '')).lower()
        if o.get('status') == 'gestor' and r.get('status') != 'gestor':
            ok_gestor = u['email'] == ge and r.get('status') in ('analise', 'recusada')
            ok_cancel = r.get('status') == 'cancelada' and (u['email'] in (str(o.get('email', '')).lower(), str((o.get('por') or {}).get('email', '')).lower()) or staff)
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
            _validar(u, e.dados, novo, s)
        except Recusa as ex:
            return JSONResponse({'erro': str(ex), 'versao': e.versao, 'estado': e.dados}, status_code=403)
        mud = mudancas(e.dados, novo)
        pede_motivo, assinar = exigencias(u, e.dados, novo, mud)
        motivo = str(corpo.get('motivo') or '').strip()[:500]
        a = _assinatura(corpo.get('assinatura'), u['email']) if assinar else None
        falta = _precisa(pede_motivo, assinar, u['email'], len(motivo) >= 5, a)
        if falta:  # nada é gravado: a tela pede o motivo e/ou a assinatura e manda de novo
            s.rollback()
            return JSONResponse({'erro': 'confirmar', 'precisa': falta}, status_code=428)
        if a:
            _aplicar_assinaturas(s, novo.get('reqs', []), assinar, a, corpo.get('assinatura'))
        envios = _novos_emails(s, e.dados, novo)
        auditar_estado(s, u, mud, motivo if pede_motivo else '')
        e.dados = copy.deepcopy(novo)
        e.versao += 1
        s.commit()
        versao = e.versao
    for env in envios:
        tarefas.add_task(_enviar, *env)
    return {'versao': versao}


# ---------------- trilha de auditoria dos registros (21 CFR Part 11 §11.10(e)) ----------------
# Gerada pelo servidor comparando o que estava gravado com o que chegou: cada criação, exclusão e cada campo alterado
# vira uma linha com quem, quando, registro, campo, valor anterior e novo. O "log" que as telas mantêm não vale como trilha.
REGISTROS = {  # parte dos dados: (nome do registro, criado, alterado, excluído)
    'reqs': ('Solicitação', 'criada', 'alterada', 'excluída'),
    'motoristas': ('Motorista', 'cadastrado', 'alterado', 'removido'),
    'grade': ('Horário da grade', 'criado', 'alterado', 'removido'),
    'tarifas': ('Tarifa', 'criada', 'alterada', 'removida'),
}
# Dados da solicitação: mudar depois de gravado exige motivo. Os demais campos são passos do fluxo
# (status, veículo, motorista, aprovação...) e a própria ação já é o registro do porquê.
DADOS_REQ = {'tipo', 'data', 'hora', 'origem', 'destino', 'pax', 'bag', 'just', 'nome', 'email', 'cc', 'acomp', 'nomes', 'carga',
             'item', 'vol', 'tam', 'recebedor', 'bv'}
SEM_TRILHA = {'assinaturas'}  # assinaturas têm linha própria na trilha


def _por_chave(v):
    if isinstance(v, dict):
        return {str(k): x for k, x in v.items()}
    out = {}
    for i, x in enumerate(v or []):
        k = str(x.get('id')) if isinstance(x, dict) and x.get('id') not in (None, '') else f'#{i + 1}'
        out[k] = x
    return out


def mudancas(antigo, novo):
    """Lista o que mudou entre o gravado e o que chegou: criações, exclusões e cada campo alterado."""
    out = []
    for parte, (rot, criado, alterado, excluido) in REGISTROS.items():
        a, b = _por_chave((antigo or {}).get(parte)), _por_chave(novo.get(parte))
        if a == b:
            continue
        for k in sorted(b.keys() - a.keys()):
            out.append({'parte': parte, 'tipo': 'criado', 'acao': f'{rot} {criado}', 'ref': k, 'campo': '', 'antes': '', 'depois': b[k]})
        for k in sorted(a.keys() - b.keys()):
            out.append({'parte': parte, 'tipo': 'excluido', 'acao': f'{rot} {excluido}', 'ref': k, 'campo': '', 'antes': a[k], 'depois': ''})
        for k in sorted(a.keys() & b.keys()):
            x, y = a[k], b[k]
            if x == y:
                continue
            if isinstance(x, dict) and isinstance(y, dict):
                for c in sorted(set(x) | set(y)):
                    if c not in SEM_TRILHA and x.get(c) != y.get(c):
                        out.append({'parte': parte, 'tipo': 'alterado', 'acao': f'{rot} {alterado}', 'ref': k, 'campo': c, 'antes': x.get(c), 'depois': y.get(c)})
            else:
                out.append({'parte': parte, 'tipo': 'alterado', 'acao': f'{rot} {alterado}', 'ref': k, 'campo': '', 'antes': x, 'depois': y})
    return out


def _curto(v, n=60):
    t = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, default=str)
    return t if len(t) <= n else t[:n] + '…'


def exigencias(u, antigo, novo, mud):
    """O que esta gravação precisa antes de valer: motivo (alteração/exclusão de dado já gravado) e assinatura eletrônica
    (decisões: aprovação/reprovação do gestor, confirmação/recusa do Facilities)."""
    com_motivo = {m['ref'] for m in mud if m['parte'] == 'reqs' and m['campo'] == 'motivo'}  # a ação trouxe o próprio motivo
    pede_motivo = []
    for m in mud:
        if m['tipo'] == 'criado':
            continue
        if m['parte'] == 'reqs' and m['tipo'] == 'alterado' and (m['campo'] not in DADOS_REQ or m['ref'] in com_motivo):
            continue
        pede_motivo.append(f"{m['acao']} {m['ref']}" + (f" · {m['campo']}: {_curto(m['antes'])} → {_curto(m['depois'])}" if m['campo'] else ''))
    velhos = {r.get('id'): r for r in (antigo or {}).get('reqs', [])}
    assinar = []
    for r in novo.get('reqs', []):
        o = velhos.get(r.get('id'))
        if not o or o.get('status') == r.get('status'):
            continue
        de, para = o.get('status'), r.get('status')
        ge = str((o.get('gestor') or {}).get('email', '')).lower()
        if de == 'gestor' and para in ('analise', 'recusada') and u['email'] == ge:
            sig = 'Aprovação da viagem pelo gestor' if para == 'analise' else 'Reprovação da viagem pelo gestor'
        elif de in ('analise', 'reagendada') and para == 'confirmada':
            sig = 'Confirmação da viagem pelo Facilities'
        elif de not in ('gestor', 'recusada') and para == 'recusada':
            sig = 'Recusa da solicitação pelo Facilities'
        else:
            continue
        assinar.append({'ref': r['id'], 'significado': sig})
    return pede_motivo, assinar


def auditar_estado(s, u, mud, motivo=''):
    for m in mud:
        auditar(s, u['email'], m['acao'], m['ref'], m['antes'], m['depois'], nome=u.get('nome', ''), campo=m['campo'], motivo=motivo)


# ---------------- assinatura eletrônica (21 CFR Part 11 §11.50, §11.70, §11.200) ----------------
# Cada decisão é assinada na hora: a pessoa se identifica de novo (conta Microsoft com nova digitação de credenciais,
# ou a senha da conta do Mobilab). A assinatura vale uma vez, por 5 minutos, só para quem se identificou, e fica gravada
# no próprio registro (nome, e-mail, data/hora, significado) e na trilha de auditoria.
_ASSIN = {}
ASSIN_VALIDADE = 300


def _nova_assinatura(email, nome, metodo):
    t = time.time()
    for k in [k for k, v in _ASSIN.items() if t - v['t'] > ASSIN_VALIDADE]:
        _ASSIN.pop(k, None)
    i = secrets.token_urlsafe(24)
    _ASSIN[i] = {'email': email.lower(), 'nome': nome, 't': t, 'metodo': metodo}
    return i


def _assinatura(i, email):
    a = _ASSIN.get(str(i or ''))
    return a if a and a['email'] == (email or '').lower() and time.time() - a['t'] <= ASSIN_VALIDADE else None


def _aplicar_assinaturas(s, reqs, assinar, a, i):
    """Grava a assinatura em cada registro decidido e na trilha; a assinatura não pode ser usada de novo."""
    _ASSIN.pop(i, None)
    quando = agora()
    por_id = {r.get('id'): r for r in reqs}
    for x in assinar:
        r = por_id.get(x['ref'])
        if not r:
            continue
        reg = {'nome': a['nome'], 'email': a['email'], 'quando': quando.strftime('%d/%m/%Y %H:%M:%S'), 'fuso': quando.strftime('%z'),
               'significado': x['significado'], 'metodo': a['metodo']}
        r.setdefault('assinaturas', []).append(reg)
        auditar(s, a['email'], 'Assinatura eletrônica', x['ref'], '', f"{a['nome']} <{a['email']}> · {x['significado']} · {a['metodo']}",
                nome=a['nome'], campo='assinatura')


def _metodo_assinatura(email):
    return 'senha' if email == ADMIN_EMAIL else 'microsoft'


def _precisa(pede_motivo, assinar, email, motivo_ok, assinatura_ok):
    falta = {}
    if pede_motivo and not motivo_ok:
        falta['motivo'] = pede_motivo[:30]
    if assinar and not assinatura_ok:
        falta['assinar'] = assinar
        falta['metodo'] = _metodo_assinatura(email)
    return falta


@rota.post('/api/assinar/senha')
async def assinar_com_senha(request: Request):
    """Assinatura da conta do Mobilab (sem conta Microsoft): usuário logado + a senha de novo."""
    u = request.session.get('u')
    if not u:
        return JSONResponse({'erro': 'Entre novamente.'}, status_code=401)
    senha = str((await request.json()).get('senha', ''))
    chave = 'assinar:' + u['email']
    t = time.time()
    falhas = [x for x in _FALHAS.get(chave, []) if t - x < 900]
    if len(falhas) >= 5:
        return JSONResponse({'erro': 'Muitas tentativas erradas. Aguarde 15 minutos.'}, status_code=429)
    with Sessao() as s:
        p = s.get(Pessoa, u['email'])
        if not (p and p.senha_hash and senha and conferir_hash(senha, p.senha_hash)):
            _FALHAS[chave] = falhas + [t]
            auditar(s, u['email'], 'Assinatura recusada', '', '', 'senha incorreta', nome=u.get('nome', ''))
            s.commit()
            return JSONResponse({'erro': 'Senha incorreta.'}, status_code=401)
    _FALHAS.pop(chave, None)
    return {'assinatura': _nova_assinatura(u['email'], u.get('nome', ''), 'senha do Mobilab')}


@rota.get('/auth/assinar')
def assinar_microsoft(request: Request, tok: str = ''):
    """Abre (numa janelinha) o login da Microsoft pedindo as credenciais de novo, só para assinar."""
    if not entra.ligado():
        return _pagina_assinatura(erro='O login com a conta Microsoft não está ligado.')
    email, nome = '', ''
    if tok:  # página do e-mail do gestor: quem assina é o gestor do pedido
        with Sessao() as s:
            t, e, r = _por_token(s, tok)
            s.rollback()
            if t:
                email, nome = t.gestor_email, ((r or {}).get('gestor') or {}).get('nome', '')
    elif request.session.get('u'):
        email, nome = request.session['u']['email'], request.session['u'].get('nome', '')
    if not email:
        return _pagina_assinatura(erro='Não foi possível identificar quem assina. Entre no Mobilab de novo.')
    st, nonce = secrets.token_urlsafe(24), secrets.token_urlsafe(24)
    request.session['assinar'] = {'state': st, 'nonce': nonce, 't': time.time(), 'email': email.lower(), 'nome': nome}
    return RedirectResponse(entra.url_login(st, nonce, reautenticar=email), status_code=303)


def _pagina_assinatura(i='', erro=''):
    msg = json.dumps({'tipo': 'mobilab-assinatura', 'id': i, 'erro': erro})
    txt = escape(erro or 'Identidade confirmada. Esta janela vai fechar.')
    return HTMLResponse(f"""<!doctype html><meta charset="utf-8"><title>Assinatura · Mobilab</title>
<body style="font-family:system-ui,sans-serif;padding:24px;color:#1f2937"><p>{txt}</p>
<script>try{{window.opener&&window.opener.postMessage({msg},location.origin)}}catch(e){{}};{'' if erro else 'setTimeout(()=>window.close(),300);'}</script></body>""")


def _concluir_assinatura(request, pa, code, error, error_description):
    if error:
        return _pagina_assinatura(erro='Assinatura cancelada.' if error == 'access_denied' else f'A Microsoft recusou: {error_description[:160] or error}')
    if time.time() - pa.get('t', 0) > 900 or not code:
        return _pagina_assinatura(erro='A assinatura expirou. Tente de novo.')
    try:
        d = entra.concluir_login(code, pa['nonce'])
    except entra.ErroEntra as ex:
        return _pagina_assinatura(erro=str(ex))
    esperado = pa['email']
    with Sessao() as s:
        p = s.get(Pessoa, esperado)
        mesmo = esperado in (d['email'], d['upn']) or bool(p and p.login and d['login'] == p.login.lower())
        if not mesmo or (d.get('auth_time') and time.time() - d['auth_time'] > 600):
            auditar(s, esperado, 'Assinatura recusada', '', '', f"conta Microsoft diferente de quem assina ({d['email']})" if not mesmo
                    else 'credenciais não foram digitadas agora', nome=pa.get('nome', ''))
            s.commit()
            return _pagina_assinatura(erro='Entre com a sua própria conta Microsoft para assinar.' if not mesmo else 'Digite as credenciais de novo para assinar.')
    return _pagina_assinatura(i=_nova_assinatura(esperado, d['nome'] or pa.get('nome', ''), 'conta Microsoft'))


def _filtro_auditoria(q, de, ate):
    w = []
    if de:
        w.append(Auditoria.quando >= datetime.fromisoformat(de).replace(tzinfo=config.FUSO))
    if ate:
        w.append(Auditoria.quando < datetime.fromisoformat(ate).replace(tzinfo=config.FUSO) + timedelta(days=1))
    if q and q.strip():
        t = f'%{q.strip().lower()}%'
        w.append(func.lower(Auditoria.usuario + ' ' + Auditoria.nome + ' ' + Auditoria.acao + ' ' + Auditoria.ref + ' ' + Auditoria.campo + ' '
                            + Auditoria.antes + ' ' + Auditoria.depois + ' ' + Auditoria.motivo).like(t))
    return w


def _linha_auditoria(a):
    local = a.quando.astimezone(config.FUSO)
    return {'id': a.id, 'quando': local.strftime('%d/%m/%Y %H:%M:%S'), 'fuso': local.strftime('%z'), 'utc': a.quando.astimezone(timezone.utc).isoformat(),
            'usuario': a.usuario, 'nome': a.nome, 'acao': a.acao, 'ref': a.ref, 'campo': a.campo, 'antes': a.antes, 'depois': a.depois, 'motivo': a.motivo, 'hash': a.hash}


@rota.get('/api/auditoria')
def listar_auditoria(request: Request, q: str = '', de: str = '', ate: str = '', antes_de: int = 0, limite: int = 300):
    if not _ti(request):
        return JSONResponse({'erro': 'Só o Administrador e o Super Admin veem a trilha de auditoria.'}, status_code=403)
    try:
        w = _filtro_auditoria(q, de, ate)
    except ValueError:
        return JSONResponse({'erro': 'Data inválida.'}, status_code=400)
    total_w = list(w)
    if antes_de:
        w.append(Auditoria.id < antes_de)
    limite = max(1, min(limite, 1000))
    with Sessao() as s:
        rows = s.scalars(select(Auditoria).where(*w).order_by(Auditoria.id.desc()).limit(limite + 1)).all()
        total = s.scalar(select(func.count()).select_from(Auditoria).where(*total_w))
    return {'linhas': [_linha_auditoria(a) for a in rows[:limite]], 'mais': len(rows) > limite, 'total': total}


COLS_AUD = [('id', 'Nº'), ('quando', 'Data/hora (local)'), ('fuso', 'Fuso'), ('utc', 'Data/hora (UTC)'), ('usuario', 'Usuário'), ('nome', 'Nome'),
            ('acao', 'Ação'), ('ref', 'Registro'), ('campo', 'Campo'), ('antes', 'Valor anterior'), ('depois', 'Valor novo'), ('motivo', 'Motivo'),
            ('hash', 'Hash SHA-256')]


def _exportacao(request, q, de, ate, formato):
    """Lê a trilha filtrada, confere a integridade de toda a corrente e registra a exportação. Devolve (usuário, linhas, cabeçalho) ou erro."""
    u = _ti(request)
    if not u:
        return JSONResponse({'erro': 'Só o Administrador e o Super Admin exportam a trilha de auditoria.'}, status_code=403), None, None
    try:
        w = _filtro_auditoria(q, de, ate)
    except ValueError:
        return JSONResponse({'erro': 'Data inválida.'}, status_code=400), None, None
    with Sessao() as s:
        linhas = [_linha_auditoria(a) for a in s.execute(select(Auditoria).where(*w).order_by(Auditoria.id).execution_options(yield_per=2000)).scalars()]
        n, quebra = verificar_auditoria(s)
        auditar(s, u['email'], 'Trilha de auditoria exportada', '', '', {'formato': formato, 'busca': q, 'de': de, 'ate': ate, 'linhas': len(linhas)},
                nome=u.get('nome', ''))
        s.commit()
    agora_l = datetime.now(config.FUSO)
    cab = {'gerado': agora_l.strftime('%d/%m/%Y %H:%M:%S') + f" (UTC{agora_l.strftime('%z')[:3]}:{agora_l.strftime('%z')[3:]})",
           'por': f"{u.get('nome', '')} <{u['email']}>", 'filtros': f"busca: {q or '—'} · de: {de or '—'} · até: {ate or '—'}",
           'total': len(linhas), 'integridade': f'íntegra ({n} registros conferidos)' if quebra is None else f'ADULTERADA a partir do registro {quebra}',
           'arquivo': f"mobilab-auditoria-{agora_l.strftime('%Y%m%d-%H%M')}"}
    return u, linhas, cab


@rota.get('/api/auditoria.xlsx')
def exportar_auditoria_xlsx(request: Request, q: str = '', de: str = '', ate: str = ''):
    from openpyxl import Workbook
    from openpyxl.styles import Alignment, Font, PatternFill
    u, linhas, cab = _exportacao(request, q, de, ate, 'xlsx')
    if linhas is None:
        return u
    wb = Workbook()
    ws = wb.active
    ws.title = 'Trilha'
    ws.append([t for _, t in COLS_AUD])
    for c in ws[1]:
        c.font, c.fill = Font(bold=True, color='FFFFFF'), PatternFill('solid', fgColor='343936')
    for d in linhas:
        ws.append([d[k] for k, _ in COLS_AUD])
    larg = {'Nº': 7, 'Data/hora (local)': 20, 'Fuso': 7, 'Data/hora (UTC)': 30, 'Usuário': 30, 'Nome': 26, 'Ação': 28, 'Registro': 16, 'Campo': 14,
            'Valor anterior': 40, 'Valor novo': 40, 'Motivo': 34, 'Hash SHA-256': 66}
    for i, (_, t) in enumerate(COLS_AUD, start=1):
        ws.column_dimensions[ws.cell(1, i).column_letter].width = larg.get(t, 18)
    for row in ws.iter_rows(min_row=2):
        for c in row:
            c.alignment = Alignment(wrap_text=True, vertical='top')
    ws.freeze_panes = 'A2'
    ws.auto_filter.ref = ws.dimensions
    info = wb.create_sheet('Sobre')
    for k, v in (('Relatório', 'Trilha de auditoria — Mobilab (21 CFR Part 11)'), ('Gerado em', cab['gerado']), ('Gerado por', cab['por']),
                 ('Filtros', cab['filtros']), ('Registros exportados', cab['total']), ('Integridade da trilha', cab['integridade']),
                 ('Observação', 'Cópia exata dos registros do servidor. Cada linha traz o hash SHA-256 encadeado com a anterior.')):
        info.append([k, v])
        info.cell(info.max_row, 1).font = Font(bold=True)
    info.column_dimensions['A'].width, info.column_dimensions['B'].width = 24, 90
    buf = io.BytesIO()
    wb.save(buf)
    return Response(buf.getvalue(), media_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    headers={'Content-Disposition': f'attachment; filename="{cab["arquivo"]}.xlsx"'})


def _latin1(v, n=None):
    t = str(v if v is not None else '')
    for a, b in (('→', '->'), ('…', '...'), ('–', '-'), ('—', '-'), ('“', '"'), ('”', '"'), ('‘', "'"), ('’', "'"), ('✓', 'OK'), ('✕', 'X'), ('·', '-')):
        t = t.replace(a, b)
    t = t.encode('latin-1', 'replace').decode('latin-1')
    return t if n is None or len(t) <= n else t[:n] + '...'


@rota.get('/api/auditoria.pdf')
def exportar_auditoria_pdf(request: Request, q: str = '', de: str = '', ate: str = ''):
    from fpdf import FPDF
    u, linhas, cab = _exportacao(request, q, de, ate, 'pdf')
    if linhas is None:
        return u

    class Pdf(FPDF):
        def header(self):
            self.set_font('Helvetica', 'B', 12)
            self.set_text_color(52, 57, 54)
            self.cell(0, 6, _latin1('Trilha de auditoria — Mobilab'), new_x='LMARGIN', new_y='NEXT')
            self.set_font('Helvetica', '', 7.5)
            self.set_text_color(70, 70, 70)
            self.cell(0, 4, _latin1(f"Gerado em {cab['gerado']} por {cab['por']} · {cab['filtros']} · {cab['total']} registros · integridade: {cab['integridade']}"),
                      new_x='LMARGIN', new_y='NEXT')
            self.ln(2)

        def footer(self):
            self.set_y(-10)
            self.set_font('Helvetica', '', 7)
            self.set_text_color(110, 110, 110)
            self.cell(0, 5, _latin1(f'Mobilab · Natulab — cópia dos registros do servidor (21 CFR Part 11) · página {self.page_no()} de {{nb}}'), align='C')

    pdf = Pdf(orientation='L', unit='mm', format='A4')
    pdf.set_auto_page_break(True, margin=12)
    pdf.set_margins(8, 8, 8)
    pdf.add_page()
    pdf.set_font('Helvetica', '', 6.5)
    pdf.set_text_color(20, 20, 20)
    cols = [('id', 'Nº', 8), ('quando', 'Data/hora', 22), ('usuario', 'Usuário', 38), ('acao', 'Ação', 30), ('ref', 'Registro', 18), ('campo', 'Campo', 16),
            ('antes', 'Valor anterior', 44), ('depois', 'Valor novo', 44), ('motivo', 'Motivo', 34), ('hash', 'Hash (início)', 27)]
    with pdf.table(col_widths=[c[2] for c in cols], text_align='LEFT', line_height=3.2, first_row_as_headings=True) as tab:
        h = tab.row()
        for _, t, _w in cols:
            h.cell(_latin1(t))
        for d in linhas:
            r = tab.row()
            for k, _t, _w in cols:
                v = d[k]
                if k == 'quando':
                    v = f"{d['quando']} UTC{d['fuso'][:3]}"
                elif k == 'usuario':
                    v = f"{d['nome']}\n{d['usuario']}" if d['nome'] else d['usuario']
                elif k == 'hash':
                    v = (d['hash'] or '')[:16]
                r.cell(_latin1(v, 400))
    return Response(bytes(pdf.output()), media_type='application/pdf', headers={'Content-Disposition': f'attachment; filename="{cab["arquivo"]}.pdf"'})


@rota.get('/api/auditoria/verificar')
def verificar_trilha(request: Request):
    u = _ti(request)
    if not u:
        return JSONResponse({'erro': 'Só o Administrador e o Super Admin verificam a trilha.'}, status_code=403)
    with Sessao() as s:
        n, quebra = verificar_auditoria(s)
        auditar(s, u['email'], 'Integridade da trilha verificada', '', '',
                'íntegra' if quebra is None else f'adulterada a partir do registro {quebra}', nome=u.get('nome', ''))
        s.commit()
    return {'total': n, 'integra': quebra is None, 'quebra': quebra}


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
                     f'<p style="margin:18px 0 0"><a href="{escape(config.APP_URL)}/" style="color:#4a8314;font-weight:700">Abrir o Mobilab</a></p>')
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
    campos = ('id', 'tipo', 'nome', 'cc', 'data', 'hora', 'origem', 'destino', 'pax', 'just', 'status', 'aprov', 'gestor', 'bv', 'excecao', 'perna', 'par', 'assinaturas')
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
        sig = 'Aprovação da viagem pelo gestor' if ok else 'Reprovação da viagem pelo gestor'
        a = _assinatura(corpo.get('assinatura'), t.gestor_email)
        if not a:  # a decisão do gestor também é assinada (conta Microsoft com as credenciais digitadas de novo)
            s.rollback()
            return JSONResponse({'erro': 'confirmar', 'precisa': {'assinar': [{'ref': r['id'], 'significado': sig}], 'metodo': 'microsoft'}}, status_code=428)
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
        _aplicar_assinaturas(s, reqs, [{'ref': x['id'], 'significado': sig} for x in alvo], a, corpo.get('assinatura'))
        auditar_estado(s, {'email': t.gestor_email, 'nome': a['nome']}, mudancas(e.dados, dados))
        envios = _novos_emails(s, e.dados, dados)
        e.dados = dados
        e.versao += 1
        auditar(s, t.gestor_email, 'Aprovada pelo gestor (e-mail)' if ok else 'Reprovada pelo gestor (e-mail)', r['id'], 'Aguardando gestor', r['status'])
        s.commit()
    for env in envios:
        tarefas.add_task(_enviar, *env)
    return {'r': _publico(r)}


# ---------------- fotos de perfil (Entra ID) ----------------
_FOTO_SEM_PERMISSAO = {'ate': 0.0}
FOTO_REPETIR = timedelta(days=7)


@rota.get('/api/foto')
def foto_pessoa(request: Request, e: str = ''):
    """Foto de perfil de um colaborador. A da própria pessoa é gravada no login Microsoft; a dos outros vem do Graph
    quando o aplicativo tem a permissão User.Read.All (sem ela, a tela mostra as iniciais)."""
    if not request.session.get('u'):
        return Response(status_code=401)
    e = (e or '').strip().lower()
    sem = Response(status_code=404, headers={'Cache-Control': 'no-store'})  # sem foto: não guardar (pode aparecer no próximo login)
    if '@' not in e or len(e) > 200:
        return sem
    with Sessao() as s:
        f = s.get(Foto, e)
        vencida = f is None or (f.dados is None and (f.em is None or datetime.now(timezone.utc) - f.em > FOTO_REPETIR))
        if vencida and e != ADMIN_EMAIL and entra.ligado() and time.time() > _FOTO_SEM_PERMISSAO['ate']:
            try:
                guardar_foto(s, e, entra.foto_app(e))
                s.commit()
                f = s.get(Foto, e)
            except entra.SemPermissao:
                _FOTO_SEM_PERMISSAO['ate'] = time.time() + 3600  # sem consentimento ainda: não insiste por 1 hora
            except entra.ErroEntra:
                pass
        if not f or not f.dados:
            return sem
        return Response(f.dados, media_type=f.tipo or 'image/jpeg', headers={'Cache-Control': 'private, max-age=86400'})


# ---------------- gestão de usuários (só TI) ----------------
def _ti(request):
    """Administrador ou Super Admin (altera). O Admin Júnior não passa aqui."""
    u = request.session.get('u')
    return u if u and u.get('perfil') == 'ti' else None


def _ti_consulta(request):
    """Qualquer nível de administração, inclusive o Admin Júnior (só consulta)."""
    u = request.session.get('u')
    return u if u and u.get('perfil') in ADMINS else None


def _linha_usuario(p):
    return {'email': p.email, 'nome': p.nome, 'cc': p.cc, 'origem': p.origem, 'ativo': p.ativo, 'cargo': p.cargo, 'gestor': p.gestor_nome,
            'gestor_email': p.gestor_email, 'login': p.login, 'travado': p.travado, 'matricula': p.matricula, 'sem_email': p.sem_email,
            'perfil': p.perfil or '', 'padrao': config.perfil_de(p.email),
            'ultimo_login': p.ultimo_login.astimezone(config.FUSO).strftime('%d/%m/%Y %H:%M') if p.ultimo_login else ''}


@rota.get('/api/usuarios')
def listar_usuarios(request: Request):
    if not _ti_consulta(request):
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
    if email == ADMIN_EMAIL and perfil not in (None, 'ti'):
        return JSONResponse({'erro': 'A conta do Mobilab é sempre Super Admin.'}, status_code=400)
    sou_super = u['email'] == ADMIN_EMAIL
    with Sessao() as s:
        p = s.get(Pessoa, email)
        if not sou_super and (email == ADMIN_EMAIL or perfil in ADMINS or (p and perfil_efetivo(p, config.perfil_de(email)) in ADMINS)):
            return JSONResponse({'erro': 'Só o Super Admin cria, altera ou rebaixa administradores.'}, status_code=403)
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
        # bloqueio não é feito aqui: vem do Entra ID (sincronização diária); a conta do Mobilab fica sempre ativa e TI
        if email == ADMIN_EMAIL:
            p.ativo, p.perfil = True, 'ti'
        if email == u['email'] and (not p.ativo or (p.perfil and p.perfil != 'ti')):
            s.rollback()
            return JSONResponse({'erro': 'Você não pode tirar o seu próprio acesso de TI.'}, status_code=400)
        s.flush()
        depois = _linha_usuario(p)
        mud_u = [k for k in sorted(set(antes) & set(depois)) if k != 'ultimo_login' and antes[k] != depois[k]]
        motivo = str(c.get('motivo') or '').strip()[:500]
        if mud_u and len(motivo) < 5:  # alterar cadastro já gravado exige motivo
            s.rollback()
            return JSONResponse({'erro': 'confirmar', 'precisa': {'motivo': [f'Usuário alterado {email} · {k}: {_curto(antes[k])} → {_curto(depois[k])}' for k in mud_u]}},
                                status_code=428)
        if not antes:
            auditar(s, u['email'], 'Usuário cadastrado', email, '', depois, nome=u.get('nome', ''))
        for k in mud_u:
            auditar(s, u['email'], 'Usuário alterado', email, antes[k], depois[k], nome=u.get('nome', ''), campo=k, motivo=motivo)
        s.commit()
        return {'usuario': _linha_usuario(p)}


@rota.get('/api/pessoas')
def listar_colegas(request: Request):
    """Para 'Adicionar colega' na reserva: só nome, e-mail e setor de quem está ativo (qualquer usuário logado)."""
    if not request.session.get('u'):
        return JSONResponse({'erro': 'Faça login novamente.'}, status_code=401)
    with Sessao() as s:
        ps = s.scalars(select(Pessoa).where(Pessoa.ativo.is_(True), Pessoa.email != ADMIN_EMAIL).order_by(Pessoa.nome)).all()
        return {'pessoas': [{'nome': p.nome or p.email, 'email': p.email, 'cc': p.cc, 'aprovador': aprovador_de(s, p) or {}} for p in ps]}


@rota.post('/api/usuarios/senha')
async def definir_senha(request: Request):
    """Só a TI (administrador) define a senha do Mobilab de um colaborador. A senha nunca é guardada nem registrada, só o hash."""
    u = _ti(request)
    if not u:
        return JSONResponse({'erro': 'Só o administrador (TI) pode mudar senhas.'}, status_code=403)
    c = await request.json()
    email = str(c.get('email', '')).strip().lower()
    senha = str(c.get('senha', ''))
    if u['email'] != ADMIN_EMAIL:
        return JSONResponse({'erro': 'Só o Super Admin troca a senha da conta do Mobilab.'}, status_code=403)
    if email != ADMIN_EMAIL:
        return JSONResponse({'erro': 'A senha dos colaboradores é a da conta Microsoft (Entra ID). Só a conta do Mobilab tem senha aqui.'}, status_code=400)
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
        auditar(s, u['email'], 'Senha alterada pela TI', email, '', 'nova senha definida (só o hash é guardado)', nome=u.get('nome', ''), campo='senha')
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
