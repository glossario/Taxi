"""Mobilab — API e telas (fase 1): login AD, solicitações e aprovação do gestor (e-mail e tela do gestor).

Quem aprova intermunicipal é SÓ o gestor imediato. O Facilities acompanha e pode notificar o gestor para agilizar.
"""
import hashlib
import re
import secrets
from contextlib import asynccontextmanager
from datetime import date, datetime, timedelta
from html import escape as esc
from pathlib import Path

from fastapi import BackgroundTasks, FastAPI, Form, Request
from fastapi.responses import HTMLResponse, JSONResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload
from starlette.middleware.sessions import SessionMiddleware

from . import auth, config, mail, ponte
from .db import Aprovacao, Sessao, Solicitacao, auditar, criar_tabelas

FONTE = ('<link rel="preconnect" href="https://fonts.googleapis.com">'
         '<link href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;600;700;800;900&display=swap" rel="stylesheet">')
LEMBRETE_MIN = 60  # intervalo mínimo entre notificações ao gestor (minutos)


@asynccontextmanager
async def _vida(_app):
    criar_tabelas()
    yield


app = FastAPI(title='Mobilab', docs_url=None, redoc_url=None, openapi_url=None, lifespan=_vida)
app.include_router(ponte.rota)
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


def ha_quanto(dt):
    m = int((agora() - dt).total_seconds() // 60)
    if m < 1:
        return 'agora'
    if m < 60:
        return f'há {m} min'
    if m < 48 * 60:
        return f'há {m // 60} h'
    return f'há {m // 1440} dias'


def quando_txt(r):
    return f'{r.data.strftime("%d/%m/%Y")} {r.hora}'


def trecho(r):
    return f'{esc(config.local_nome(r.origem))} → {esc(config.local_nome(r.destino))}'


def st(s):
    return f'<span class="st st-{esc(s)}">{esc(config.STATUS.get(s, s))}</span>'


CSS = """.w-brand{font-size:22px;letter-spacing:.5px} .apv-card.largo{max-width:1180px} .tbl{width:100%;border-collapse:collapse;font-size:14px}
.tbl th,.tbl td{text-align:left;padding:9px 6px;border-bottom:1px solid #eef0ea;vertical-align:top} .tbl th{color:#6b7280;font-size:12px;text-transform:uppercase}
.frm{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin:12px 0} .frm label{display:flex;flex-direction:column;gap:4px;font-size:13px;color:#374151}
.frm input,.frm select,.frm textarea{padding:9px 10px;border:1.5px solid #e5e7e0;border-radius:9px;font:inherit} .frm .full{grid-column:1/-1}
.st{display:inline-block;padding:2px 8px;border-radius:999px;background:#eef0ea;font-size:12px;font-weight:600;white-space:nowrap} .st-gestor{background:#fff3d6;color:#92400e}
.st-analise{background:#e6efff;color:#1e3a6e} .st-recusada{background:#fdecec;color:#8a1f1f} .st-confirmada{background:#eef7e6;color:#2f5d12}
.ok-b{background:#eef7e6;color:#2f5d12;padding:10px 14px;border-radius:10px;margin:10px 0} .er-b{background:#fdecec;color:#8a1f1f;padding:10px 14px;border-radius:10px;margin:10px 0}
h2{font-size:17px;margin:24px 0 8px} .nav{display:flex;gap:6px;align-items:center;flex-wrap:wrap} .nav a{padding:6px 12px;border-radius:999px;text-decoration:none;color:#374151;font-weight:600;font-size:14px}
.nav a.on{background:#eef7e6;color:#2f5d12} .nav .n{display:inline-block;min-width:18px;padding:0 6px;margin-left:4px;border-radius:999px;background:#d97706;color:#fff;font-size:11px;text-align:center}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin:14px 0}
.kp{border:1px solid #e5e7e0;border-radius:14px;padding:14px 16px;background:#fff} .kp small{display:block;color:#6b7280;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.04em}
.kp b{font-size:28px;color:#1f2937} .kp.warn{background:#fff8e6;border-color:#f5d68a} .kp.ok{background:#f3f9ee} .kp.bad{background:#fdf2f2}
.apcards{display:grid;grid-template-columns:repeat(auto-fit,minmax(330px,1fr));gap:14px}
.apc{border:1px solid #e5e7e0;border-left:4px solid #d97706;border-radius:14px;padding:16px;background:#fff}
.apc h3{margin:0 0 2px;font-size:17px} .apc .sub{color:#6b7280;font-size:13px;margin:0 0 10px} .apc dl{margin:0 0 10px;display:grid;gap:4px;font-size:14px}
.apc dl div{display:grid;grid-template-columns:110px 1fr} .apc dt{color:#6b7280} .apc dd{margin:0;font-weight:600}
.apc .just{background:#f7f8f4;border-radius:10px;padding:8px 10px;font-size:14px;margin-bottom:12px}
.apc form{display:flex;gap:8px;flex-wrap:wrap;align-items:flex-start} .apc textarea{width:100%;box-sizing:border-box;padding:8px;border:1.5px solid #e5e7e0;border-radius:9px;font:inherit}
.apc details{flex-basis:100%} .apc summary{cursor:pointer;color:#8a1f1f;font-weight:600;font-size:14px;padding:6px 0}
.muted{color:#6b7280;font-size:13px} .btn.sm{padding:6px 10px;font-size:13px}"""


def pagina(titulo, corpo, u=None, largo=False, aba='', pend=0):
    marca = '<span class="w-brand"><b style="color:#4a8f1f">NATU</b><b style="color:#1e3a6e">LAB</b></span>'
    if u:
        links = [('inicio', '/', 'Início')]
        if u.get('gestor_de'):
            links.append(('aprov', '/aprovacoes', f'Aprovações{f"<span class=n>{pend}</span>" if pend else ""}'))
        nav = ''.join(f'<a class="{"on" if k == aba else ""}" href="{h}">{t}</a>' for k, h, t in links)
        topo = (f'<div class="apv-top">{marca}<nav class="nav">{nav}</nav>'
                f'<span>{esc(u["nome"])} · {esc(u["perfil"])} · <a href="/sair">Sair</a></span></div>')
    else:
        topo = f'<div class="apv-top">{marca}<span>{esc(titulo)}</span></div>'
    return HTMLResponse(f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{esc(titulo)} · Mobilab</title>{FONTE}<link rel="stylesheet" href="/prototipo/styles.css"><style>{CSS}</style></head>
<body><div class="apv-wrap"><div class="apv-card{' largo' if largo else ''}">{topo}{corpo}
<p class="apv-ft">Mobilab · Facilities Natulab</p></div></div></body></html>""")


def pendentes_do_gestor(s, email):
    return s.scalar(select(func.count()).select_from(Solicitacao).where(
        Solicitacao.gestor_email == email, Solicitacao.status == 'gestor')) or 0


def marcar_gestor(s, u):
    """Quem aparece como gestor imediato em alguma solicitação ganha a aba Aprovações."""
    if not u.get('gestor_de'):
        u['gestor_de'] = bool(s.scalar(select(func.count()).select_from(Solicitacao).where(Solicitacao.gestor_email == u['email'])))
    return u


# ---------------- login ----------------
def _do_prototipo(nome):
    """Arte e marca vêm do próprio protótipo (app.js) — a tela de login fica idêntica à aprovada."""
    try:
        m = re.search(rf'const {nome} = `(.*?)`;', (PROTO / 'app.js').read_text(encoding='utf-8'), re.S)
        return m.group(1) if m else ''
    except OSError:
        return ''


@app.get('/login', response_class=HTMLResponse)
def tela_login(request: Request):
    a = request.session.pop('aviso', None)
    erro = f'<div id="lerr" class="err">{esc(a[1])}</div>' if a else '<div id="lerr" class="err" hidden></div>'
    demo = ''
    if config.LOGIN_TESTE:
        demo = """<div class="demo"><p><b>Modo de teste</b> (AD ainda não ligado): a senha não é conferida. Entre como:</p>
        <div class="chips"><button type="button" data-u="colaborador">Colaborador</button><button type="button" data-u="gestor">Gestor</button>
          <button type="button" data-u="facilities">Facilities</button><button type="button" data-u="ti">TI / Administração</button></div></div>"""
    ano = agora().year
    return HTMLResponse(f"""<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mobilab</title>{FONTE}<link rel="stylesheet" href="/prototipo/styles.css"></head><body>
  <div class="login-wrap"><div class="login">
    <section class="login-hero">
      <h1>Mobilab</h1>
      <div class="sub">Táxi e Moto Táxi corporativo</div>
      <div class="art">{_do_prototipo('heroArt')}</div>
      <div class="hero-foot">
        <div class="contact"><span><b>SAC</b> 0800 730 7370</span><span>|</span><b>natulab.com.br</b></div>
        <div class="hero-tag">Bem-estar todos os dias</div>
        <div class="hero-bottom">
          <div class="lead">Solicite, acompanhe e organize seus deslocamentos entre os sites.</div>
          <span class="hero-pill">Natulab</span>
        </div>
      </div>
    </section>
    <section class="login-form">
      <div class="login-top">{_do_prototipo('brand')}<span class="chip-brand"><i></i>Mobilab</span></div>
      <h2>Bem-vindo de volta</h2>
      <p class="hint">Entre com o seu usuário e senha da rede Natulab.</p>
      <form id="lf" method="post" action="/login">
        <div class="field"><label for="em">Usuário ou e-mail</label><input class="input" id="em" name="usuario" placeholder="nome.sobrenome ou seuemail@natulab.com.br" autocomplete="username" required autofocus></div>
        <div class="field"><label for="pw">Senha</label><div class="pw"><input class="input" id="pw" name="senha" type="password" placeholder="Digite sua senha" autocomplete="current-password" {'' if config.LOGIN_TESTE else 'required'}>
          <button type="button" id="eye" aria-label="Mostrar senha"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>
        <div class="row-between"><span></span><a class="link-strong" href="#" id="forgot">Esqueci minha senha</a></div>
        <button class="btn-primary" type="submit">Entrar</button>
        {erro}
      </form>
      {demo}
      <div class="login-foot">Copyright © {ano} Mobilab · Natulab</div>
    </section>
  </div></div>
<script>
document.getElementById('eye').onclick=function(){{var p=document.getElementById('pw');p.type=p.type==='password'?'text':'password';}};
document.getElementById('forgot').onclick=function(e){{e.preventDefault();var l=document.getElementById('lerr');l.textContent='A senha é a mesma da rede Natulab. Para trocar ou desbloquear, fale com a TI.';l.hidden=false;}};
document.querySelectorAll('.demo button').forEach(function(b){{b.onclick=function(){{document.getElementById('em').value=b.dataset.u;document.getElementById('lf').submit();}};}});
</script></body></html>""")


@app.post('/login')
def fazer_login(request: Request, usuario: str = Form(''), senha: str = Form('')):
    try:
        u = auth.login(usuario, senha)
    except auth.LoginInvalido as ex:
        return ir(request, '/login', erro=str(ex))
    request.session.clear()
    with Sessao() as s:
        marcar_gestor(s, u)
        auditar(s, u['email'], 'Login', '', '', 'AD' if config.LDAP_SERVER else 'teste')
        s.commit()
    request.session['u'] = u
    return RedirectResponse('/', status_code=303)  # gestor entra na mesma tela do colaborador; Aprovações é uma aba


@app.get('/sair')
def sair(request: Request):
    request.session.clear()
    return RedirectResponse('/login', status_code=303)


# ---------------- início (colaborador / Facilities / TI) ----------------
def form_nova():
    opts = ''.join(f'<option value="{k}">{esc(v)}</option>' for k, v in config.SITES.items())
    amanha = (agora() + timedelta(days=1)).date().isoformat()
    return f"""<h2>Nova solicitação</h2>
      <form method="post" action="/solicitacoes" class="frm">
        <label>Tipo<select name="tipo"><option value="inter">Táxi intermunicipal (precisa do gestor)</option><option value="cidade">Táxi na cidade</option></select></label>
        <label>Data<input type="date" name="data" value="{amanha}" required></label>
        <label>Horário<input type="time" name="hora" value="08:00" required></label>
        <label>Passageiros<input type="number" name="pax" min="1" max="7" value="1" required></label>
        <label>Origem<select name="origem">{opts}</select></label>
        <label>Destino<input name="destino" required maxlength="200" placeholder="Ex.: Laboratório Central – Salvador"></label>
        <label class="full">Justificativa<textarea name="justificativa" rows="2" required maxlength="1000"></textarea></label>
        <div class="full"><button class="btn green" type="submit">Enviar solicitação</button></div>
      </form>"""


def ultima_notif(r):
    aps = sorted(r.aprovacoes, key=lambda a: a.criado_em)
    return aps[-1].criado_em if aps else r.criado_em, max(0, len(aps) - 1)


# ---------------- telas do protótipo servidas pelo sistema (dados no servidor) ----------------
def _arquivo(nome, tipo):
    from fastapi.responses import Response
    return Response((PROTO / nome).read_bytes(), media_type=tipo, headers={'Cache-Control': 'no-cache'})


@app.get('/', response_class=HTMLResponse)
def spa():
    html = (PROTO / 'index.html').read_text(encoding='utf-8')
    # Mesmo index do protótipo; só liga o modo servidor antes do app.js.
    return HTMLResponse(html.replace('<script src="app.js"></script>', '<script>window.MOBILAB_API = true;</script><script src="/app.js"></script>')
                        .replace('href="styles.css"', 'href="/styles.css"'), headers={'Cache-Control': 'no-cache'})


@app.get('/app.js')
def spa_js():
    return _arquivo('app.js', 'application/javascript; charset=utf-8')


@app.get('/styles.css')
def spa_css():
    return _arquivo('styles.css', 'text/css; charset=utf-8')


@app.get('/classico', response_class=HTMLResponse)
def inicio(request: Request):
    u = logado(request)
    if not u:
        return RedirectResponse('/login', status_code=303)
    staff = u['perfil'] in ('facilities', 'ti')
    with Sessao() as s:
        q = select(Solicitacao).options(selectinload(Solicitacao.aprovacoes)).order_by(Solicitacao.id.desc()).limit(300)
        if not staff:
            q = q.where(Solicitacao.solicitante_email == u['email'])
        rs = s.scalars(q).all()
        pend = pendentes_do_gestor(s, u['email']) if u.get('gestor_de') else 0
    g = u.get('gestor') or {}
    cont = lambda stt: sum(1 for r in rs if r.status == stt)  # noqa: E731
    kpis = f"""<div class="kpis">
        <div class="kp warn"><small>Aguardando gestor</small><b>{cont('gestor')}</b></div>
        <div class="kp"><small>Em análise</small><b>{cont('analise')}</b></div>
        <div class="kp ok"><small>Confirmadas</small><b>{cont('confirmada')}</b></div>
        <div class="kp bad"><small>Reprovadas / recusadas</small><b>{cont('recusada')}</b></div></div>"""
    bloco_gestor = ''
    if staff:
        ag = [r for r in rs if r.status == 'gestor']
        linhas_ag = ''
        for r in sorted(ag, key=lambda x: (x.data, x.hora)):
            ult, n = ultima_notif(r)
            pode = (agora() - ult) >= timedelta(minutes=LEMBRETE_MIN)
            linhas_ag += (f'<tr><td><b>{esc(r.codigo)}</b></td><td>{esc(quando_txt(r))}</td><td>{trecho(r)}</td>'
                          f'<td>{esc(r.solicitante_nome)}<br><small class="muted">{esc(r.centro_custo)}</small></td>'
                          f'<td>{esc(r.gestor_nome)}<br><small class="muted">{esc(r.gestor_email)}</small></td>'
                          f'<td>pedido {ha_quanto(r.criado_em)}{f"<br><small class=muted>{n} lembrete(s), último {ha_quanto(ult)}</small>" if n else ""}</td>'
                          f'<td><form method="post" action="/solicitacoes/{esc(r.codigo)}/notificar"><button class="btn sm" {"" if pode else "disabled"} '
                          f'title="{"Reenvia o e-mail de aprovação ao gestor" if pode else f"Aguarde {LEMBRETE_MIN} min entre lembretes"}">Notificar gestor</button></form></td></tr>')
        bloco_gestor = f"""<h2>Aguardando o gestor</h2>
          <p class="muted">Quem aprova é o gestor imediato do solicitante. Você acompanha aqui e pode <b>notificar o gestor</b> para agilizar.</p>
          {f'''<table class="tbl"><thead><tr><th>Código</th><th>Quando</th><th>Trecho</th><th>Solicitante</th><th>Gestor</th><th>Espera</th><th></th></tr></thead>
          <tbody>{linhas_ag}</tbody></table>''' if ag else '<p class="muted">Nenhuma solicitação aguardando gestor.</p>'}"""
    linhas = ''.join(
        f'<tr><td><b>{esc(r.codigo)}</b></td><td>{esc(config.TIPOS.get(r.tipo, r.tipo))}</td><td>{esc(quando_txt(r))}</td><td>{trecho(r)}</td>'
        f'{f"<td>{esc(r.solicitante_nome)}<br><small class=muted>{esc(r.centro_custo)}</small></td>" if staff else ""}'
        f'<td>{st(r.status)}{f"<br><small class=muted>{esc(r.motivo)}</small>" if r.motivo else ""}'
        f'{f"<br><small class=muted>com {esc(r.gestor_nome)}</small>" if r.status == "gestor" and not staff else ""}</td></tr>' for r in rs)
    corpo = f"""<h1>Olá, {esc(u['nome'].split(' ')[0])}!</h1>
      <p class="apv-sub">{esc(u.get('cc') or 'Setor não informado no AD')} · Gestor imediato: <b>{esc(g.get('nome') or 'não informado no AD')}</b>
      {f"&lt;{esc(g.get('email'))}&gt;" if g.get('email') else ''}</p>
      {aviso(request)}{kpis}{bloco_gestor}{'' if staff else form_nova()}
      <h2>{'Todas as solicitações' if staff else 'Minhas solicitações'}</h2>
      {f'''<table class="tbl"><thead><tr><th>Código</th><th>Tipo</th><th>Quando</th><th>Trecho</th>{'<th>Solicitante</th>' if staff else ''}<th>Status</th></tr></thead>
      <tbody>{linhas}</tbody></table>''' if rs else '<p class="muted">Nenhuma solicitação ainda.</p>'}
      {form_nova() if staff else ''}
      <p class="muted" style="margin-top:18px">As demais telas (Agenda, Painel, Viagens, Grade, Custos) ainda estão no
      <a href="/prototipo/">protótipo</a> (simulação — lá nenhum e-mail é enviado de verdade) e vão sendo ligadas a este sistema.</p>"""
    return pagina('Início', corpo, u, largo=True, aba='inicio', pend=pend)


def _novo_pedido_aprovacao(s, r, quando_viagem, lembrete=False):
    token = secrets.token_urlsafe(32)
    s.add(Aprovacao(solicitacao_id=r.id, token_hash=hash_token(token), gestor_nome=r.gestor_nome, gestor_email=r.gestor_email,
                    expira_em=quando_viagem))
    assunto, texto, html = mail.modelo_aprovacao(r, f'{config.APP_URL}/aprovar/{token}', lembrete)
    e = mail.registrar(s, r.gestor_email, assunto, 'lembrete' if lembrete else 'aprovacao', r.id)
    return (e.id, r.gestor_email, assunto, texto, html)


def viagem_em(r):
    return datetime.combine(r.data, datetime.strptime(r.hora, '%H:%M').time(), config.FUSO)


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
                        centro_custo=u.get('cc') or '', gestor_nome=g.get('nome', ''), gestor_email=(g.get('email') or '').lower(),
                        data=d, hora=hora, origem=origem, destino=destino, pax=pax, justificativa=justificativa, dados={})
        s.add(r)
        s.flush()
        r.codigo = f'SOL-{1000 + r.id}'
        auditar(s, u['email'], 'Solicitação criada', r.codigo, '', config.STATUS[r.status])
        envio = None
        if gestor:
            envio = _novo_pedido_aprovacao(s, r, quando)
            auditar(s, 'sistema', 'Enviada ao gestor para aprovação', r.codigo, '', r.gestor_email)
        s.commit()
        cod = r.codigo
    if envio:
        tarefas.add_task(mail.enviar, *envio)
        return ir(request, '/', ok=f'{cod} enviada. O gestor ({g.get("nome")}) recebeu o pedido de aprovação por e-mail.')
    return ir(request, '/', ok=f'{cod} enviada para a análise do Facilities.')


@app.post('/solicitacoes/{codigo}/notificar')
def notificar(codigo: str, request: Request, tarefas: BackgroundTasks):
    u = logado(request)
    if not u or u['perfil'] not in ('facilities', 'ti'):
        return ir(request, '/', erro='Só o Facilities pode notificar o gestor.')
    with Sessao() as s:
        r = s.scalars(select(Solicitacao).options(selectinload(Solicitacao.aprovacoes))
                      .where(Solicitacao.codigo == codigo).with_for_update()).first()
        if not r or r.status != 'gestor':
            return ir(request, '/', erro='Essa solicitação não está aguardando o gestor.')
        ult, _ = ultima_notif(r)
        if agora() - ult < timedelta(minutes=LEMBRETE_MIN):
            return ir(request, '/', erro=f'O gestor foi avisado {ha_quanto(ult)}. Aguarde {LEMBRETE_MIN} min entre lembretes.')
        if viagem_em(r) <= agora():
            return ir(request, '/', erro='O horário da viagem já passou.')
        envio = _novo_pedido_aprovacao(s, r, viagem_em(r), lembrete=True)
        auditar(s, u['email'], 'Gestor notificado (lembrete)', r.codigo, '', r.gestor_email)
        s.commit()
    tarefas.add_task(mail.enviar, *envio)
    return ir(request, '/', ok=f'Lembrete enviado para {r.gestor_nome} ({r.gestor_email}).')


# ---------------- decisão do gestor (mesma regra para o link do e-mail e para a tela do gestor) ----------------
def aplicar_decisao(s, r, ok, motivo, por_email, ip=''):
    motivo = '' if ok else (motivo or '').strip()[:500]
    for a in r.aprovacoes:  # todos os links pendentes dessa solicitação passam a mostrar a decisão
        if not a.decidido_em:
            a.decidido_em, a.aprovado, a.motivo, a.ip = agora(), ok, motivo, ip[:64]
    antes = config.STATUS[r.status]
    r.status = 'analise' if ok else 'recusada'
    if not ok:
        r.motivo = f'Reprovada pelo gestor {r.gestor_nome}' + (f': {motivo}' if motivo else '')
    auditar(s, por_email, 'Aprovada pelo gestor' if ok else 'Reprovada pelo gestor', r.codigo, antes, config.STATUS[r.status])
    assunto, texto, html = mail.modelo_decisao(r, ok, motivo)
    e = mail.registrar(s, r.solicitante_email, assunto, 'decisao', r.id)
    return (e.id, r.solicitante_email, assunto, texto, html)


# ---------------- tela do gestor ----------------
@app.get('/aprovacoes', response_class=HTMLResponse)
def tela_gestor(request: Request):
    u = logado(request)
    if not u:
        return RedirectResponse('/login', status_code=303)
    with Sessao() as s:
        rs = s.scalars(select(Solicitacao).options(selectinload(Solicitacao.aprovacoes))
                       .where(Solicitacao.gestor_email == u['email']).order_by(Solicitacao.data, Solicitacao.hora)).all()
    pend = [r for r in rs if r.status == 'gestor' and viagem_em(r) > agora()]
    venc = [r for r in rs if r.status == 'gestor' and viagem_em(r) <= agora()]
    dec = sorted([r for r in rs if r.status != 'gestor'], key=lambda r: r.atualizado_em, reverse=True)
    aprovadas = sum(1 for r in dec if any(a.aprovado for a in r.aprovacoes))
    reprovadas = sum(1 for r in dec if any(a.aprovado is False for a in r.aprovacoes))

    def cartao(r):
        _, n = ultima_notif(r)
        return f"""<article class="apc"><h3>{esc(r.solicitante_nome)}</h3>
          <p class="sub">{esc(r.centro_custo)} · pedido {ha_quanto(r.criado_em)}{f' · <b>{n} lembrete(s) do Facilities</b>' if n else ''}</p>
          <dl><div><dt>Solicitação</dt><dd>{esc(r.codigo)} — {esc(config.TIPOS.get(r.tipo, r.tipo))}</dd></div>
            <div><dt>Quando</dt><dd>{esc(quando_txt(r))}</dd></div><div><dt>Trecho</dt><dd>{trecho(r)}</dd></div>
            <div><dt>Passageiros</dt><dd>{r.pax}</dd></div></dl>
          <div class="just"><span class="muted">Justificativa:</span> {esc(r.justificativa)}</div>
          <form method="post" action="/aprovacoes/{esc(r.codigo)}">
            <button class="btn green" name="decisao" value="aprovar">Aprovar</button>
            <details><summary>Reprovar</summary><textarea name="motivo" rows="2" maxlength="500" placeholder="Motivo (opcional)"></textarea>
              <button class="btn red sm" name="decisao" value="reprovar" style="margin-top:6px">Confirmar reprovação</button></details>
          </form></article>"""

    hist = ''.join(f'<tr><td><b>{esc(r.codigo)}</b></td><td>{esc(r.solicitante_nome)}</td><td>{esc(quando_txt(r))}</td><td>{trecho(r)}</td>'
                   f'<td>{st(r.status)}{f"<br><small class=muted>{esc(r.motivo)}</small>" if r.motivo else ""}</td></tr>' for r in dec[:100])
    corpo = f"""<h1>Aprovações da sua equipe</h1>
      <p class="apv-sub">Viagens intermunicipais de quem tem você como gestor imediato no AD. Você também pode aprovar pelo botão do e-mail.</p>
      {aviso(request)}
      <div class="kpis"><div class="kp warn"><small>Aguardando você</small><b>{len(pend)}</b></div>
        <div class="kp ok"><small>Aprovadas</small><b>{aprovadas}</b></div><div class="kp bad"><small>Reprovadas</small><b>{reprovadas}</b></div>
        <div class="kp"><small>Expiradas sem resposta</small><b>{len(venc)}</b></div></div>
      <h2>Aguardando sua aprovação</h2>
      {f'<div class="apcards">{"".join(cartao(r) for r in pend)}</div>' if pend else '<p class="muted">Nada pendente. 🎉</p>'}
      <h2>Já decididas</h2>
      {f'<table class="tbl"><thead><tr><th>Código</th><th>Solicitante</th><th>Quando</th><th>Trecho</th><th>Status</th></tr></thead><tbody>{hist}</tbody></table>'
        if dec else '<p class="muted">Nenhuma ainda.</p>'}"""
    return pagina('Aprovações', corpo, u, largo=True, aba='aprov', pend=len(pend))


@app.post('/aprovacoes/{codigo}')
def decidir_tela(codigo: str, request: Request, tarefas: BackgroundTasks, decisao: str = Form(...), motivo: str = Form('')):
    u = logado(request)
    if not u:
        return RedirectResponse('/login', status_code=303)
    with Sessao() as s:
        r = s.scalars(select(Solicitacao).options(selectinload(Solicitacao.aprovacoes))
                      .where(Solicitacao.codigo == codigo).with_for_update()).first()
        if not r or r.gestor_email != u['email']:  # só o gestor imediato daquela solicitação decide
            return ir(request, '/aprovacoes', erro='Você não é o gestor desta solicitação.')
        if r.status != 'gestor' or decisao not in ('aprovar', 'reprovar'):
            return ir(request, '/aprovacoes', erro=f'{codigo} já tinha sido decidida.')
        if viagem_em(r) <= agora():
            return ir(request, '/aprovacoes', erro='O horário dessa viagem já passou.')
        ok = decisao == 'aprovar'
        envio = aplicar_decisao(s, r, ok, motivo, u['email'], request.client.host if request.client else '')
        s.commit()
    tarefas.add_task(mail.enviar, *envio)
    return ir(request, '/aprovacoes', ok=f'{codigo} {"aprovada" if ok else "reprovada"}. {r.solicitante_nome} foi avisado(a) por e-mail.')


# ---------------- aprovação pelo link do e-mail (sem login: o token do link é a credencial) ----------------
def _busca_aprov(s, token, travar=False):
    q = select(Aprovacao).where(Aprovacao.token_hash == hash_token(token))
    if travar:
        q = q.with_for_update()
    return s.scalars(q).first()


def _tela_aprov(a, aviso_txt=''):
    if not a:
        return pagina('Aprovação de viagem', '<div class="apv-msg bad"><b>Link inválido.</b><p>Confira se abriu o link do e-mail mais recente. '
                      'Em caso de dúvida, fale com o Facilities.</p></div>')
    r = a.solicitacao
    det = f"""<dl class="apv-dl">
      <div><dt>Solicitação</dt><dd>{esc(r.codigo)} — {esc(config.TIPOS.get(r.tipo, r.tipo))}</dd></div>
      <div><dt>Data e horário</dt><dd>{r.data.strftime('%d/%m/%Y')} às {esc(r.hora)}</dd></div>
      <div><dt>Trecho</dt><dd>{trecho(r)}</dd></div>
      <div><dt>Passageiros</dt><dd>{r.pax}</dd></div></dl>"""
    head = (f'<h1>{esc(r.solicitante_nome)}</h1><p class="apv-sub">{esc(r.centro_custo)} · solicitou um transporte que precisa da sua aprovação'
            f'{", " + esc(a.gestor_nome.split(" ")[0]) if a.gestor_nome else ""}.</p>')
    if a.decidido_em:
        quando = a.decidido_em.astimezone(config.FUSO).strftime('%d/%m/%Y às %H:%M')
        msg = (f'<div class="apv-msg {"ok" if a.aprovado else "bad"}"><b>{"Aprovada" if a.aprovado else "Reprovada"} por {esc(a.gestor_nome)} em {quando}.</b>'
               f'{f"<p>Motivo: {esc(a.motivo)}</p>" if a.motivo else ""}<p>{esc(aviso_txt) or "Nada mais a fazer por aqui."}</p></div>')
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
        a = _busca_aprov(s, token, travar=True)
        if not a:
            return _tela_aprov(None)
        r = s.scalars(select(Solicitacao).options(selectinload(Solicitacao.aprovacoes))
                      .where(Solicitacao.id == a.solicitacao_id).with_for_update()).first()  # trava: dois cliques não decidem duas vezes
        if a.decidido_em or a.expira_em <= agora() or r.status != 'gestor' or decisao not in ('aprovar', 'reprovar'):
            return _tela_aprov(a, 'Esta solicitação já tinha sido decidida.' if a.decidido_em else '')
        envio = aplicar_decisao(s, r, decisao == 'aprovar', motivo, a.gestor_email, request.client.host if request.client else '')
        s.commit()
        tarefas.add_task(mail.enviar, *envio)
        return _tela_aprov(a, 'Obrigado! O colaborador foi avisado por e-mail.')


@app.get('/api/saude')
def saude():
    with Sessao() as s:
        s.execute(select(1))
    return JSONResponse({'ok': True, 'ldap': bool(config.LDAP_SERVER), 'login_teste': config.LOGIN_TESTE, 'smtp': config.SMTP_ENVIAR})
