"""Configuração lida do ambiente (.env via docker compose)."""
import os
from zoneinfo import ZoneInfo


def _lista(nome):
    return {x.strip().lower() for x in os.getenv(nome, '').split(',') if x.strip()}


DATABASE_URL = os.environ['DATABASE_URL']
SECRET_KEY = os.environ.get('SECRET_KEY', '')
if len(SECRET_KEY) < 24 or SECRET_KEY.startswith('troque'):
    raise SystemExit('Defina SECRET_KEY no .env (mínimo 24 caracteres). Veja .env.example.')
APP_URL = os.getenv('APP_URL', 'http://localhost:8080').rstrip('/')
COOKIE_SEGURO = os.getenv('COOKIE_SEGURO', '0') == '1'  # ligar quando estiver em HTTPS (VPS)
FUSO = ZoneInfo('America/Bahia')

NOREPLY_PATH = os.getenv('NOREPLY_PATH', '/run/secrets/noreply')
SMTP_HOST = os.getenv('SMTP_HOST', 'smtp.office365.com')
SMTP_PORT = int(os.getenv('SMTP_PORT', '587'))
SMTP_ENVIAR = os.getenv('SMTP_ENVIAR', '1') == '1'
# Testes com usuários reais: todo e-mail vai para este endereço (o assunto mostra quem receberia). Vazio = envio normal.
EMAIL_REDIRECIONAR = os.getenv('EMAIL_REDIRECIONAR', '').strip().lower()

LDAP_SERVER = os.getenv('LDAP_SERVER', '').strip()
LDAP_DOMAIN = os.getenv('LDAP_DOMAIN', 'natulab.com.br').strip()
LDAP_BASE_DN = os.getenv('LDAP_BASE_DN', '').strip()
LOGIN_TESTE = not LDAP_SERVER and os.getenv('LOGIN_TESTE', '0') == '1'

PERFIL_FACILITIES = _lista('PERFIL_FACILITIES')
PERFIL_TI = _lista('PERFIL_TI')

SITES = {'MED': 'Natulab Medicamentos', 'CD': 'CD Natulab', 'SUP': 'Natulab Suplementos'}
TIPOS = {'grade': 'Entre sites', 'cidade': 'Táxi na cidade', 'inter': 'Táxi intermunicipal', 'moto': 'Moto Táxi (envio de itens)'}
STATUS = {'gestor': 'Aguardando gestor', 'analise': 'Em análise', 'confirmada': 'Confirmada', 'recusada': 'Recusada',
          'reagendada': 'Reagendada', 'andamento': 'Em andamento', 'concluida': 'Concluída', 'cancelada': 'Cancelada',
          'naorealizada': 'Não realizada'}


def precisa_gestor(tipo):
    """Decisão do dono (2026-11-16): só intermunicipal exige aprovação do gestor imediato."""
    return tipo == 'inter'


def perfil_de(email):
    e = (email or '').lower()
    if e in PERFIL_TI:
        return 'ti'
    if e in PERFIL_FACILITIES:
        return 'facilities'
    return 'colaborador'


def local_nome(v):
    return SITES.get(v, v)
