"""Login pelo AD local (LDAP). Traz nome, e-mail, setor e gestor imediato (atributo manager)."""
from ldap3 import BASE, SUBTREE, Connection, Server
from ldap3.core.exceptions import LDAPException
from ldap3.utils.conv import escape_filter_chars

from . import config


class LoginInvalido(Exception):
    pass


# Usuários fictícios — só existem com LDAP_SERVER vazio e LOGIN_TESTE=1.
USUARIOS_TESTE = {
    'colaborador': {'email': 'colaborador.teste@natulab.com.br', 'nome': 'Colaborador Teste', 'cc': '3020 – Garantia da Qualidade',
                    'gestor': {'nome': 'Alyson Jesus', 'email': 'alysonjesus@natulab.com.br'}, 'perfil': 'colaborador'},
    'gestor': {'email': 'alysonjesus@natulab.com.br', 'nome': 'Alyson Jesus', 'cc': '4010 – Tecnologia da Informação',
               'gestor': {'nome': '', 'email': ''}, 'perfil': 'colaborador', 'gestor_de': True},
    'facilities': {'email': 'facilities.teste@natulab.com.br', 'nome': 'Noemia', 'cc': 'Facilities',
                   'gestor': {'nome': '', 'email': ''}, 'perfil': 'facilities'},
    'ti': {'email': 'ti.teste@natulab.com.br', 'nome': 'TI Natulab', 'cc': '4010 – Tecnologia da Informação',
           'gestor': {'nome': '', 'email': ''}, 'perfil': 'ti'},
}


def _attr(e, nome):
    v = e[nome].value if nome in e and e[nome] else None
    if isinstance(v, list):
        v = v[0] if v else None
    return str(v) if v else ''


def login_ldap(usuario: str, senha: str) -> dict:
    usuario = (usuario or '').strip()
    # Senha vazia faz "bind anônimo" e o AD aceita — por isso é recusada antes de tudo.
    if not usuario or not senha:
        raise LoginInvalido('Informe usuário e senha.')
    upn = usuario if '@' in usuario else f'{usuario}@{config.LDAP_DOMAIN}'
    srv = Server(config.LDAP_SERVER, connect_timeout=5)
    try:
        conn = Connection(srv, user=upn, password=senha, receive_timeout=10, raise_exceptions=False)
        if not conn.bind():
            raise LoginInvalido('Usuário ou senha inválidos.')
        sam = upn.split('@')[0]
        filtro = f'(&(objectClass=user)(|(userPrincipalName={escape_filter_chars(upn)})(sAMAccountName={escape_filter_chars(sam)})))'
        conn.search(config.LDAP_BASE_DN, filtro, SUBTREE, attributes=['displayName', 'mail', 'department', 'manager'])
        if not conn.entries:
            raise LoginInvalido('Usuário não encontrado no AD.')
        e = conn.entries[0]
        gestor = {'nome': '', 'email': ''}
        mgr = _attr(e, 'manager')
        if mgr:
            conn.search(mgr, '(objectClass=*)', BASE, attributes=['displayName', 'mail'])
            if conn.entries:
                gestor = {'nome': _attr(conn.entries[0], 'displayName'), 'email': _attr(conn.entries[0], 'mail').lower()}
        email = (_attr(e, 'mail') or upn).lower()
        conn.unbind()
    except LDAPException as ex:
        raise LoginInvalido(f'Não foi possível falar com o AD ({type(ex).__name__}).') from ex
    return {'email': email, 'nome': _attr(e, 'displayName') or sam, 'cc': _attr(e, 'department'),
            'gestor': gestor, 'perfil': config.perfil_de(email)}


def login(usuario: str, senha: str) -> dict:
    if config.LDAP_SERVER:
        return login_ldap(usuario, senha)
    if config.LOGIN_TESTE and usuario in USUARIOS_TESTE:
        return dict(USUARIOS_TESTE[usuario])
    if config.LOGIN_TESTE:
        raise LoginInvalido('Modo de teste: use os botões Colaborador, Gestor, Facilities ou TI abaixo.')
    raise LoginInvalido('Login pelo AD ainda não configurado (LDAP_SERVER vazio).')
