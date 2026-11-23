"""Login com a conta Microsoft (Entra ID) e leitura dos usuários pelo Microsoft Graph.

As credenciais vêm de um arquivo fora do repositório (secret do docker: /run/secrets/entra), no formato
    tenant_id=...
    client_id=...
    client_secret=...
Fluxo de login: código de autorização (OpenID Connect). O id_token é recebido direto do endpoint de token da
Microsoft (canal TLS autenticado com o segredo), então basta conferir emissor, público, locatário, nonce e validade.
"""
import base64
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

from . import config

CAMINHO = os.getenv('ENTRA_PATH', '/run/secrets/entra')
LOGIN = 'https://login.microsoftonline.com'
GRAPH = 'https://graph.microsoft.com/v1.0'
REDIRECT = config.APP_URL + '/auth/callback'


class ErroEntra(Exception):
    pass


def _credenciais():
    try:
        with open(CAMINHO, encoding='utf-8-sig') as f:
            kv = dict(linha.split('=', 1) for linha in f.read().splitlines() if '=' in linha)
    except OSError:
        return None
    c = {k.strip(): v.strip() for k, v in kv.items()}
    return c if c.get('tenant_id') and c.get('client_id') and c.get('client_secret') else None


def ligado():
    return _credenciais() is not None


def _pedir(url, dados=None, token=None, extra=None):
    req = urllib.request.Request(url, data=urllib.parse.urlencode(dados).encode() if dados else None)
    if token:
        req.add_header('Authorization', f'Bearer {token}')
    for k, v in (extra or {}).items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            return json.loads(r.read().decode())
    except urllib.error.HTTPError as ex:
        try:
            corpo = json.loads(ex.read().decode())
        except ValueError:
            corpo = {}
        err = corpo.get('error')
        msg = err.get('message') if isinstance(err, dict) else (corpo.get('error_description') or err)
        raise ErroEntra(f'Microsoft respondeu {ex.code}: {str(msg or "")[:200]}') from None
    except (urllib.error.URLError, TimeoutError) as ex:
        raise ErroEntra(f'Sem conexão com a Microsoft: {ex}') from None


# ---------------- login ----------------
def url_login(state, nonce):
    c = _credenciais()
    q = {'client_id': c['client_id'], 'response_type': 'code', 'redirect_uri': REDIRECT, 'response_mode': 'query',
         'scope': 'openid profile email User.Read', 'state': state, 'nonce': nonce, 'prompt': 'select_account'}
    return f"{LOGIN}/{c['tenant_id']}/oauth2/v2.0/authorize?{urllib.parse.urlencode(q)}"


def _payload(jwt):
    p = jwt.split('.')[1]
    return json.loads(base64.urlsafe_b64decode(p + '=' * (-len(p) % 4)))


def concluir_login(code, nonce):
    """Troca o código pelos tokens e devolve os dados da pessoa (claims + perfil do Graph)."""
    c = _credenciais()
    if not c:
        raise ErroEntra('Login Microsoft não configurado.')
    t = _pedir(f"{LOGIN}/{c['tenant_id']}/oauth2/v2.0/token", {
        'client_id': c['client_id'], 'client_secret': c['client_secret'], 'grant_type': 'authorization_code',
        'code': code, 'redirect_uri': REDIRECT, 'scope': 'openid profile email User.Read'})
    if 'id_token' not in t:
        raise ErroEntra('A Microsoft não devolveu a identificação da conta.')
    cl = _payload(t['id_token'])
    agora = time.time()
    if cl.get('aud') != c['client_id'] or cl.get('tid') != c['tenant_id'] or c['tenant_id'] not in str(cl.get('iss', '')):
        raise ErroEntra('Conta de outra organização. Use a sua conta Natulab.')
    if cl.get('nonce') != nonce or not (cl.get('exp', 0) > agora - 60):
        raise ErroEntra('Login expirado. Tente de novo.')
    me = {}
    try:  # setor, cargo e login de rede da própria pessoa (permissão User.Read)
        me = _pedir(f'{GRAPH}/me?$select=displayName,mail,userPrincipalName,department,jobTitle,onPremisesSamAccountName,accountEnabled',
                    token=t.get('access_token'))
    except ErroEntra:
        pass
    gestor = {}
    try:
        g = _pedir(f'{GRAPH}/me/manager?$select=displayName,mail,userPrincipalName', token=t.get('access_token'))
        gestor = {'nome': g.get('displayName') or '', 'email': (g.get('mail') or g.get('userPrincipalName') or '').lower()}
    except ErroEntra:
        pass
    upn = (me.get('userPrincipalName') or cl.get('preferred_username') or cl.get('upn') or '').lower()
    return {'email': (me.get('mail') or cl.get('email') or upn).lower(), 'upn': upn,
            'login': (me.get('onPremisesSamAccountName') or upn.split('@')[0]).lower(),
            'nome': me.get('displayName') or cl.get('name') or upn, 'cc': me.get('department') or '',
            'cargo': me.get('jobTitle') or '', 'gestor': gestor, 'oid': cl.get('oid', '')}


# ---------------- sincronização (permissão de aplicativo User.Read.All) ----------------
def _token_app():
    c = _credenciais()
    if not c:
        raise ErroEntra('Login Microsoft não configurado.')
    t = _pedir(f"{LOGIN}/{c['tenant_id']}/oauth2/v2.0/token", {
        'client_id': c['client_id'], 'client_secret': c['client_secret'], 'grant_type': 'client_credentials',
        'scope': 'https://graph.microsoft.com/.default'})
    return t['access_token']


def listar_usuarios():
    """Todas as contas de pessoas (Member) do Entra, com setor, cargo, gestor e se a conta está ativa."""
    tk = _token_app()
    sel = 'displayName,mail,userPrincipalName,department,jobTitle,accountEnabled,onPremisesSamAccountName,onPremisesDistinguishedName,userType'
    url = f'{GRAPH}/users?$select={sel}&$expand=manager($select=displayName,mail,userPrincipalName)&$top=999'
    out = []
    while url:
        j = _pedir(url, token=tk)
        for x in j.get('value', []):
            if x.get('userType') not in (None, 'Member'):
                continue
            upn = (x.get('userPrincipalName') or '').lower()
            m = x.get('manager') or {}
            out.append({'email': (x.get('mail') or upn).lower(), 'upn': upn,
                        'login': (x.get('onPremisesSamAccountName') or upn.split('@')[0]).lower(),
                        'nome': x.get('displayName') or '', 'setor': x.get('department') or '', 'cargo': x.get('jobTitle') or '',
                        'ativo': bool(x.get('accountEnabled')), 'ou': x.get('onPremisesDistinguishedName') or '',
                        'gestor_email': (m.get('mail') or m.get('userPrincipalName') or '').lower(), 'gestor_nome': m.get('displayName') or ''})
        url = j.get('@odata.nextLink')
    return out
