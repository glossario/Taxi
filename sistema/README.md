# Mobilab — sistema real (fase 1)

Python (FastAPI) + PostgreSQL em Docker. Por enquanto roda na máquina local; depois vai para a VPS.

## O que já funciona
- Login pelo **AD local (LDAP)**: nome, e-mail, setor (`department`) e gestor imediato (`manager`).
  - Enquanto o AD não estiver configurado, existe um **modo de teste**: `colaborador`, `facilities` ou `ti`, sem senha.
- **Solicitação** de táxi na cidade e de táxi intermunicipal.
- **Aprovação do gestor pelo e-mail** (somente intermunicipal):
  - O e-mail sai do **noreply** pelo `smtp.office365.com`.
  - O link leva direto à página de Aprovar / Reprovar, sem login.
  - Abrir o link **não aprova nada**. A decisão só vale com o clique no botão, porque os filtros de segurança do e-mail abrem os links sozinhos.
  - Cada link vale **uma vez só** e expira no horário da viagem.
  - No banco fica só o hash do token do link.
  - O colaborador é avisado por e-mail quando a solicitação é aprovada ou reprovada.
- **Registros:** auditoria de cada ação e histórico de cada e-mail (enviado, erro ou desligado).

As demais telas (Agenda, Painel, Viagens, Grade, Custos) continuam no protótipo, em `/prototipo/`, e vão sendo ligadas aos poucos.

## Como subir
1. Crie o arquivo de configuração e preencha `DB_PASSWORD` e `SECRET_KEY`:
   ```
   cp .env.example .env
   ```
2. Deixe o usuário e a senha do noreply em `../../noreply.txt` (pasta `taxi`, fora do repositório), na linha 1 e na linha 2.
3. Suba os containers:
   ```
   docker compose up -d --build
   ```
4. Abra http://localhost:8080.

## Configuração
- **Para o gestor abrir o link de outro computador:** coloque em `APP_URL` o IP da sua máquina na rede, por exemplo `http://192.168.0.50:8080`.
  - O Windows pode pedir para liberar a porta 8080 no firewall.
- **Envio de e-mail:**
  - `SMTP_ENVIAR=1` envia de verdade.
  - `SMTP_ENVIAR=0` não envia e guarda o texto do e-mail na tabela `emails`, para teste.
- **AD (LDAP):** preencha `LDAP_SERVER`, `LDAP_DOMAIN` e `LDAP_BASE_DN`.
  - Use **`ldaps://`**. Com `ldap://` a senha trafega aberta na rede.
  - Com `LDAP_SERVER` preenchido, o modo de teste é desligado sozinho.
- **Perfis:** `PERFIL_FACILITIES` e `PERFIL_TI` recebem e-mails separados por vírgula.

## Na VPS (depois)
- Coloque o sistema atrás de HTTPS (Caddy ou Nginx).
- Configure `COOKIE_SEGURO=1` e `APP_URL=https://...`.
- O banco fica só dentro do Docker: a porta 5432 não é publicada.
