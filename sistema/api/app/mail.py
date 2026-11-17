"""Envio de e-mail pelo noreply (smtp.office365.com, STARTTLS). A senha vem de um arquivo secreto, nunca do código."""
import smtplib
import ssl
from email.message import EmailMessage
from html import escape

from . import config
from .db import Email, Sessao


def _credenciais():
    with open(config.NOREPLY_PATH, encoding='utf-8-sig') as f:
        linhas = [l.strip() for l in f.read().splitlines() if l.strip()]
    if len(linhas) < 2:
        raise RuntimeError('Arquivo do noreply deve ter usuário (linha 1) e senha (linha 2).')
    return linhas[0], linhas[1]


def enviar(email_id: int, para: str, assunto: str, texto: str, html: str):
    """Roda em segundo plano. Registra o resultado na tabela emails (sem nunca gravar a senha)."""
    situacao, erro = 'enviado', ''
    if not config.SMTP_ENVIAR:  # modo de teste: não envia e guarda o texto (com o link) para conferência
        situacao, erro = 'desligado', f'Envio desligado (SMTP_ENVIAR=0). Conteúdo:\n{texto}'
    else:
        try:
            user, senha = _credenciais()
            m = EmailMessage()
            m['From'] = f'Mobilab · Natulab <{user}>'
            m['To'] = para
            m['Subject'] = assunto
            m.set_content(texto)
            m.add_alternative(html, subtype='html')
            with smtplib.SMTP(config.SMTP_HOST, config.SMTP_PORT, timeout=30) as s:
                s.starttls(context=ssl.create_default_context())
                s.login(user, senha)
                s.send_message(m)
        except Exception as ex:  # noqa: BLE001
            situacao, erro = 'erro', f'{type(ex).__name__}: {ex}'[:500]
    with Sessao() as s:
        e = s.get(Email, email_id)
        if e:
            e.situacao, e.erro = situacao, erro[:4000]
            s.commit()


def registrar(s, para, assunto, tipo, solicitacao_id=None) -> Email:
    e = Email(para=para, assunto=assunto, tipo=tipo, solicitacao_id=solicitacao_id)
    s.add(e)
    s.flush()
    return e


# ---------- modelos de e-mail ----------
def _linha(k, v):
    return (f'<tr><td style="padding:6px 0;color:#6b7280;font-size:13px;width:140px;vertical-align:top">{escape(k)}</td>'
            f'<td style="padding:6px 0;font-weight:600;color:#1f2937">{escape(v)}</td></tr>')


def _moldura(titulo_tag, corpo):
    return f"""<!doctype html><html><body style="margin:0;background:#f3f4ef;font-family:Segoe UI,Arial,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4ef;padding:28px 12px"><tr><td align="center">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#fff;border-radius:16px;border:1px solid #e5e7e0">
<tr><td style="padding:22px 28px 6px">
  <span style="font-size:22px;font-weight:800;color:#4a8f1f;letter-spacing:.5px">NATU</span><span style="font-size:22px;font-weight:800;color:#1e3a6e;letter-spacing:.5px">LAB</span>
  <span style="float:right;font-size:12px;font-weight:700;color:#6b7280;letter-spacing:.06em;line-height:30px">{escape(titulo_tag)}</span></td></tr>
<tr><td style="padding:10px 28px 0">{corpo}</td></tr>
<tr><td style="padding:22px 28px;color:#9ca3af;font-size:12px;border-top:1px solid #eef0ea">Este é um e-mail automático — não responda. · Mobilab · Facilities Natulab</td></tr>
</table></td></tr></table></body></html>"""


def _detalhes(r):
    return [('Solicitação', f'{r.codigo} — {config.TIPOS.get(r.tipo, r.tipo)}'),
            ('Data e horário', f'{r.data.strftime("%d/%m/%Y")} às {r.hora}'),
            ('Trecho', f'{config.local_nome(r.origem)} → {config.local_nome(r.destino)}'),
            ('Passageiros', str(r.pax))]


def modelo_aprovacao(r, link, lembrete=False):
    det = _detalhes(r)
    texto = '\n'.join([f'Olá, {r.gestor_nome.split(" ")[0] if r.gestor_nome else ""}!', '',
                       f'{r.solicitante_nome} ({r.centro_custo}) solicitou um transporte que precisa da sua aprovação:', '',
                       *[f'{k}: {v}' for k, v in det], f'Justificativa: {r.justificativa}', '',
                       f'Para aprovar ou reprovar, acesse: {link}', '', 'Este é um e-mail automático — não responda.'])
    corpo = f"""<h1 style="margin:0 0 4px;font-size:22px;color:#1f2937">{escape(r.solicitante_nome)}</h1>
  <p style="margin:0 0 14px;color:#6b7280">{escape(r.centro_custo)} · solicitou um transporte que precisa da sua aprovação.</p>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">{''.join(_linha(k, v) for k, v in det)}</table>
  <div style="background:#f7f8f4;border-radius:12px;padding:12px 14px;margin:16px 0 20px">
    <div style="font-size:11px;font-weight:700;color:#6b7280;letter-spacing:.05em">JUSTIFICATIVA</div>
    <div style="margin-top:4px;color:#1f2937">{escape(r.justificativa)}</div></div>
  <table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:#4a8f1f;border-radius:10px">
    <a href="{escape(link)}" style="display:inline-block;padding:14px 28px;color:#fff;font-weight:700;text-decoration:none;font-size:15px">Analisar solicitação</a></td></tr></table>
  <p style="margin:14px 0 0;font-size:12px;color:#6b7280">Ao clicar, você vai direto para a página onde aprova ou reprova a solicitação.</p>"""
    assunto = f'{"Lembrete: " if lembrete else ""}Aprovação pendente: {r.codigo} de {r.solicitante_nome}'
    if lembrete:
        corpo = ('<div style="background:#fff3d6;color:#92400e;border-radius:10px;padding:10px 14px;margin-bottom:14px;font-weight:600">'
                 'O Facilities está aguardando a sua decisão sobre esta viagem.</div>' + corpo)
        texto = 'LEMBRETE — o Facilities está aguardando a sua decisão.\n\n' + texto
    return assunto, texto, _moldura('APROVAÇÃO DE VIAGEM', corpo)


def modelo_decisao(r, aprovado, motivo):
    if aprovado:
        assunto = f'{r.codigo} aprovada pelo gestor'
        msg = f'Sua solicitação foi aprovada por {r.gestor_nome} e seguiu para o Facilities, que vai confirmar o motorista.'
    else:
        assunto = f'{r.codigo} reprovada pelo gestor'
        msg = f'Sua solicitação foi reprovada por {r.gestor_nome}.' + (f' Motivo: {motivo}' if motivo else '')
    det = _detalhes(r)
    texto = '\n'.join([f'Olá, {r.solicitante_nome.split(" ")[0]}!', '', msg, '', *[f'{k}: {v}' for k, v in det]])
    corpo = (f'<h1 style="margin:0 0 8px;font-size:20px;color:#1f2937">{escape(assunto)}</h1>'
             f'<p style="margin:0 0 14px;color:#374151">{escape(msg)}</p>'
             f'<table role="presentation" cellpadding="0" cellspacing="0" width="100%">{"".join(_linha(k, v) for k, v in det)}</table>')
    return assunto, texto, _moldura('SOLICITAÇÃO DE VIAGEM', corpo)
