"""Mobilab — API e telas (fase 1): login AD, solicitações e aprovação do gestor pelo link do e-mail."""
import hashlib
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from html import escape as esc
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import select
from starlette.middleware.sessions import SessionMiddleware

from . import auth, config, mail
from .db import Aprovacao, Sessao, Solicitacao, auditar, criar_tabelas

@asynccontextmanager
async def _vida(_app):
    criar_tabelas()
    yield


app = FastAPI(title='Mobilab', docs_url=None, redoc_url=None, openapi_url=None, lifespan=_vida)
app.add_middleware(SessionMiddleware, secret_key=config.SECRET_KEY, session_cookie='mobilab', max_age=12 * 3600,
                   same_site='lax', https_only=config.COOKIE_SEGURO)
PROTO = Path('/app/prototipo')
if PROTO.exists():
    app.mount('/prototipo', StaticFiles(directory=PROTO, html=True), name='prototipo')




@app.middleware('http')
async def _cabecalhos(request: Request, call_next):
    resp = await call_next(request)
    resp.headers['X-Content-Type-Options'] = 'nosniff'
    resp.headers['X-Frame-Options'] = 'DENY'
    resp.headers['Referrer-Policy'] = 'no-referrer'  # o token do link de aprovação não vaza para outros sites
    return resp


# ---------------- utilidades ----------------
def agora():
    return datetime.now(config.FUSO)


def hash_token(t: str) -> str:
    return hashlib.sha256(t.encode()).hexdigest()


def logado(request: Request):
    return request.session.get('u')


def ir(request: Request, destino: str, ok: str = '', erro: str = ''):
    """Redireciona guardando o aviso na sessão (nunca na URL, para ninguém montar link com texto falso)."""
    if ok or erro:
        request.session['aviso'] = ['ok' if ok else 'erro', ok or erro]
    return RedirectResponse(destino, status_code=303)


def aviso(request: Request):
    a = request.session.pop('aviso', None)
    return f'<div class="{"ok-b" if a[0] == "ok" else "er-b"}">{esc(a[1])}</div>' if a else ''


def pagina(titulo, corpo, u=None, largo=False):
    topo = ''
    if u:
        topo = (f'<div class="apv-top"><span class="w-brand"><b style="color:#4a8f1f">NATU</b><b style="color:#1e3a6e">LAB</b></span>'
                f'<span>{esc(u["nome"])} · {esc(u["perfil"])} · <a href="/sair">Sair</a></span></div>')
    else:
        topo = ('<div class="apv-top"><span class="w-brand"><b style="color:#4a8f1f">NATU</b><b style="color:#1e3a6e">LAB</b></span>'
                f'<span>{esc(titulo)}</span></div>')
    return HTMLResponse(f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(titulo)} · Mobilab</title><link rel="stylesheet" href="/prototipo/styles.css">
<style>.w-brand{{font-size:22px;letter-spacing:.5px}} .apv-card.largo{{max-width:1100px}} .tbl{{width:100%;border-collapse:collapse;font-size:14px}}
.tbl th,.tbl td{{text-align:left;padding:8px 6px;border-bottom:1px solid #eef0ea;vertical-align:top}} .tbl th{{color:#6b7280;font-size:12px;text-transform:uppercase}}
.frm{{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:12px 0}} .frm label{{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#374151}}
.frm input,.frm select,.frm textarea{{padding:9px 10px;border:1.5px solid #e5e7e0;border-radius:9px;font:inherit}} .frm .full{{grid-column:1/-1}}
.st{{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef0ea;font-size:12px;font-weight:600}} .st-gestor{{background:#fff3d6;color:#92400e}}
.st-analise{{background:#e6efff;color:#1e3a6e}} .st-recusada{{background:#fdecec;color:#8a1f1f}} .st-confirmada{{background:#eef7e6;color:#2f5d12}}
.ok-b{{background:#eef7e6;color:#2f5d12;padding:10px 14px;border-radius:10px;margin:10px 0}} .er-b{{background:#fdecec;color:#8a1f1f;padding:10px 14px;border-radius:10px;margin:10px 0}}
h2{{font-size:17px;margin:22px 0 6px}}</style></head>
<body><div class="apv-wrap"><div class="apv-card{' largo' if largo else ''}">{topo}{corpo}
<p class="apv-ft">Mobilab · Facilities Natulab</p></div></div></body></html>""")


def st(s):
    return f'<span class="st st-{esc(s)}">{esc(config.STATUS.get(s, s))}</span>'


# ---------------- login ----------------
@app.get('/login', response_class=HTMLResponse)
def tela_login(request: Request):
    teste = ''
    if config.LOGIN_TESTE:
        teste = ('<div class="er-b"><b>Modo de teste</b> (AD ainda não configurado): digite '
                 '<code>colaborador</code>, <code>facilities</code> ou <code>ti</code> no usuário — senha não é conferida.</div>')
    return pagina('Entrar', f"""<h1>Bem-vindo de volta</h1><p class="apv-sub">Entre com seu usuário e senha da rede Natulab.</p>{teste}
      {aviso(request)}
      <form method="post" action="/login" class="frm" style="grid-template-columns:1fr">
        <label>Usuário<input name="usuario" autocomplete="username" required autofocus placeholder="nome.sobrenome"></label>
        <label>Senha<input name="senha" type="password" autocomplete="current-password" {'' if config.LOGIN_TESTE else 'required'}></label>
        <button class="btn green lg" type="submit">Entrar</button></form>""")


@app.post('/login')
def fazer_login(request: Request, usuario: str = Form(''), senha: str = Form('')):
    try:
        u = auth.login(usuario, senha)
    except auth.LoginInvalido as ex:
        return ir(request, '/login', erro=str(ex))
    request.session.clear()
    request.session['u'] = u
    with Sessao() as s:
        auditar(s, u['email'], 'Login', '', '', 'AD' if config.LDAP_SERVER else 'teste')
        s.commit()
    return RedirectResponse('/', status_code=303)


@app.get('/sair')
def sair(request: Request):
    request.session.clear()
    return RedirectResponse('/login', status_code=303)


# ---------------- início ----------------
@app.get('/', response_class=HTMLResponse)
def inicio(request: Request):
    u = logado(request)
    if not u:
        return RedirectResponse('/login', status_code=303)
    with Sessao() as s:
        q = select(Solicitacao).order_by(Solicitacao.id.desc()).limit(200)
        if u['perfil'] == 'colaborador':
            q = q.where(Solicitacao.solicitante_email == u['email'])
        rs = s.scalars(q).all()
    g = u.get('gestor') or {}
    opts = ''.join(f'<option value="{k}">{esc(v)}</option>' for k, v in config.SITES.items())
    linhas = ''.join(
        f'<tr><td><b>{esc(r.codigo)}</b></td><td>{esc(config.TIPOS.get(r.tipo, r.tipo))}</td><td>{r.data.strftime("%d/%m/%Y")} {esc(r.hora)}</td>'
        f'<td>{esc(config.local_nome(r.origem))} → {esc(config.local_nome(r.destino))}</td>'
        f'{"" if u["perfil"] == "colaborador" else f"<td>{esc(r.solicitante_nome)}<br><small>{esc(r.centro_custo)}</small></td>"}'
        f'<td>{st(r.status)}{f"<br><small>{esc(r.motivo)}</small>" if r.motivo else ""}</td></tr>' for r in rs)
    amanha = (agora() + timedelta(days=1)).date().isoformat()
    corpo = f"""<h1>Olá, {esc(u['nome'].split(' ')[0])}!</h1>
      <p class="apv-sub">{esc(u.get('cc') or 'Setor não informado no AD')} · Gestor imediato: <b>{esc(g.get('nome') or 'não informado no AD')}</b>
      {f"&lt;{esc(g.get('email'))}&gt;" if g.get('email') else ''}</p>
      {aviso(request)}
      <h2>Nova solicitação</h2>
      <form method="post" action="/solicitacoes" class="frm">
        <label>Tipo<select name="tipo"><option value="inter">Táxi intermunicipal (precisa do gestor)</option><option value="cidade">Táxi na cidade</option></select></label>
        <label>Data<input type="date" name="data" value="{amanha}" required></label>
        <label>Horário<input type="time" name="hora" value="08:00" required></label>
        <label>Passageiros<input type="number" name="pax" min="1" max="7" value="1" required></label>
        <label>Origem<select name="origem">{opts}</select></label>
        <label>Destino<input name="destino" required maxlength="200" placeholder="Ex.: Laboratório Central – Salvador"></label>
        <label class="full">Justificativa<textarea name="justificativa" rows="2" required maxlength="1000"></textarea></label>
        <div class="full"><button class="btn green" type="submit">Enviar solicitação</button></div>
      </form>
      <h2>{'Minhas solicitações' if u['perfil'] == 'colaborador' else 'Solicitações'}</h2>
      {f'''<table class="tbl"><thead><tr><th>Código</th><th>Tipo</th><th>Quando</th><th>Trecho</th>{'' if u['perfil'] == 'colaborador' else '<th>Solicitante</th>'}<th>Status</th></tr></thead>
      <tbody>{linhas}</tbody></table>''' if rs else '<p class="apv-sub">Nenhuma solicitação ainda.</p>'}
      <p class="apv-sub" style="margin-top:18px">As demais telas (Agenda, Painel da Noemia, Viagens, Grade, Custos) ainda estão no
      <a href="/prototipo/">protótipo</a> e vão sendo ligadas a este sistema.</p>"""
    return pagina('Início', corpo, u, largo=True)


@app.post('/solicitacoes')
def criar(request: Request, tarefas: BackgroundTasks, tipo: str = Form(...), data: str = Form(...), hora: str = Form(...),
          pax: int = Form(1), origem: str = Form(...), destino: str = Form(...), justificativa: str = Form(...)):
    u = logado(request)
    if not u:
        return RedirectResponse('/login', status_code=303)
    if tipo not in ('inter', 'cidade') or origem not in config.SITES or not (1 <= pax <= 7):
        return ir(request, '/', erro='Dados inválidos.')
    try:
        d = date.fromisoformat(data)
        datetime.strptime(hora, '%H:%M')
    except ValueError:
        return ir(request, '/', erro='Data ou horário inválido.')
    quando = datetime.combine(d, datetime.strptime(hora, '%H:%M').time(), config.FUSO)
    if quando <= agora():
        return ir(request, '/', erro='A data e o horário precisam ser no futuro.')
    destino, justificativa = destino.strip()[:200], justificativa.strip()[:1000]
    if not destino or not justificativa:
        return ir(request, '/', erro='Informe destino e justificativa.')
    g = u.get('gestor') or {}
    gestor = config.precisa_gestor(tipo)
    if gestor and not g.get('email'):
        return ir(request, '/', erro='Seu gestor imediato não está cadastrado no AD. Fale com a TI.')
    with Sessao() as s:
        r = Solicitacao(tipo=tipo, status='gestor' if gestor else 'analise', solicitante_email=u['email'], solicitante_nome=u['nome'],
                        centro_custo=u.get('cc') or '', gestor_nome=g.get('nome', ''), gestor_email=g.get('email', ''),
                        data=d, hora=hora, origem=origem, destino=destino, pax=pax, justificativa=justificativa, dados={})
        s.add(r)
        s.flush()
        r.codigo = f'SOL-{1000 + r.id}'
        auditar(s, u['email'], 'Solicitação criada', r.codigo, '', config.STATUS[r.status])
        envio = None
        if gestor:
            token = secrets.token_urlsafe(32)
            s.add(Aprovacao(solicitacao_id=r.id, token_hash=hash_token(token), gestor_nome=r.gestor_nome, gestor_email=r.gestor_email,
                            expira_em=quando))
            assunto, texto, html = mail.modelo_aprovacao(r, f'{config.APP_URL}/aprovar/{token}')
            e = mail.registrar(s, r.gestor_email, assunto, 'aprovacao', r.id)
            auditar(s, 'sistema', 'Enviada ao gestor para aprovação', r.codigo, '', r.gestor_email)
            envio = (e.id, r.gestor_email, assunto, texto, html)
        s.commit()
        cod = r.codigo
    if envio:
        tarefas.add_task(mail.enviar, *envio)
        return ir(request, '/', ok=f'{cod} enviada. O gestor recebeu o pedido de aprovação por e-mail.')
    return ir(request, '/', ok=f'{cod} enviada para a análise do Facilities.')


# ---------------- aprovação pelo link do e-mail (sem login: o token do link é a credencial) ----------------
def _busca_aprov(s, token, travar=False):
    q = select(Aprovacao).where(Aprovacao.token_hash == hash_token(token))
    if travar:
        q = q.with_for_update()
    return s.scalars(q).first()


def _tela_aprov(a, aviso=''):
    if not a:
        return pagina('Aprovação de viagem', '<div class="apv-msg bad"><b>Link inválido.</b><p>Confira se abriu o link do e-mail mais recente. '
                      'Em caso de dúvida, fale com o Facilities.</p></div>')
    r = a.solicitacao
    det = f"""<dl class="apv-dl">
      <div><dt>Solicitação</dt><dd>{esc(r.codigo)} — {esc(config.TIPOS.get(r.tipo, r.tipo))}</dd></div>
      <div><dt>Data e horário</dt><dd>{r.data.strftime('%d/%m/%Y')} às {esc(r.hora)}</dd></div>
      <div><dt>Trecho</dt><dd>{esc(config.local_nome(r.origem))} → {esc(config.local_nome(r.destino))}</dd></div>
      <div><dt>Passageiros</dt><dd>{r.pax}</dd></div></dl>"""
    head = (f'<h1>{esc(r.solicitante_nome)}</h1><p class="apv-sub">{esc(r.centro_custo)} · solicitou um transporte que precisa da sua aprovação'
            f'{", " + esc(a.gestor_nome.split(" ")[0]) if a.gestor_nome else ""}.</p>')
    if a.decidido_em:
        quando = a.decidido_em.astimezone(config.FUSO).strftime('%d/%m/%Y às %H:%M')
        msg = (f'<div class="apv-msg {"ok" if a.aprovado else "bad"}"><b>{"Aprovada" if a.aprovado else "Reprovada"} por {esc(a.gestor_nome)} em {quando}.</b>'
               f'{f"<p>Motivo: {esc(a.motivo)}</p>" if a.motivo else ""}<p>{esc(aviso) or "Nada mais a fazer por aqui."}</p></div>')
        return pagina('Aprovação de viagem', head + det + msg)
    if a.expira_em <= agora() or r.status != 'gestor':
        return pagina('Aprovação de viagem', head + det + '<div class="apv-msg bad"><b>Este link expirou.</b><p>A viagem já passou ou a solicitação '
                      'não está mais aguardando aprovação.</p></div>')
    return pagina('Aprovação de viagem', f"""{head}{det}
      <div class="apv-just"><small>Justificativa</small><p>{esc(r.justificativa)}</p></div>
      <form method="post"><div class="apv-acts">
        <button class="btn green lg" name="decisao" value="aprovar" type="submit">Aprovar</button>
        <button class="btn red lg" type="button" onclick="document.getElementById('apmot').hidden=false;this.parentNode.hidden=true">Reprovar</button></div>
        <div id="apmot" hidden><label class="field"><span>Motivo da reprovação <small>(opcional)</small></span>
          <textarea name="motivo" rows="3" maxlength="500"></textarea></label>
          <div class="apv-acts"><button class="btn red" name="decisao" value="reprovar" type="submit">Confirmar reprovação</button></div></div>
      </form>""")


@app.get('/aprovar/{token}', response_class=HTMLResponse)
def ver_aprovacao(token: str):
    # GET só MOSTRA: filtros de segurança do e-mail abrem links sozinhos e não podem aprovar nada.
    with Sessao() as s:
        a = _busca_aprov(s, token)
        if a:
            a.solicitacao  # carrega antes de fechar a sessão
        return _tela_aprov(a)


@app.post('/aprovar/{token}', response_class=HTMLResponse)
def decidir(token: str, request: Request, tarefas: BackgroundTasks, decisao: str = Form(...), motivo: str = Form('')):
    with Sessao() as s:
        a = _busca_aprov(s, token, travar=True)  # trava a linha: dois cliques ao mesmo tempo não decidem duas vezes
        if not a:
            return _tela_aprov(None)
        r = a.solicitacao
        if a.decidido_em or a.expira_em <= agora() or r.status != 'gestor' or decisao not in ('aprovar', 'reprovar'):
            return _tela_aprov(a, 'Esta solicitação já tinha sido decidida.' if a.decidido_em else '')
        ok = decisao == 'aprovar'
        motivo = motivo.strip()[:500] if not ok else ''
        a.decidido_em, a.aprovado, a.motivo = agora(), ok, motivo
        a.ip = (request.client.host if request.client else '')[:64]
        antes = config.STATUS[r.status]
        r.status = 'analise' if ok else 'recusada'
        if not ok:
            r.motivo = f'Reprovada pelo gestor {a.gestor_nome}' + (f': {motivo}' if motivo else '')
        auditar(s, a.gestor_email, 'Aprovada pelo gestor' if ok else 'Reprovada pelo gestor', r.codigo, antes, config.STATUS[r.status])
        assunto, texto, html = mail.modelo_decisao(r, ok, motivo)
        e = mail.registrar(s, r.solicitante_email, assunto, 'decisao', r.id)
        s.commit()
        tarefas.add_task(mail.enviar, e.id, r.solicitante_email, assunto, texto, html)
        return _tela_aprov(a, 'Obrigado! O colaborador foi avisado por e-mail.')


@app.get('/api/saude')
def saude():
    with Sessao() as s:
        s.execute(select(1))
    return JSONResponse({'ok': True, 'ldap': bool(config.LDAP_SERVER), 'login_teste': config.LOGIN_TESTE, 'smtp': config.SMTP_ENVIAR})
