"""Banco PostgreSQL: modelos e sessão."""
import hashlib
import json
import time
from datetime import datetime, date, timezone

from sqlalchemy import (JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, create_engine, func, select, text)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship, sessionmaker

from . import config

engine = create_engine(config.DATABASE_URL, pool_pre_ping=True)
Sessao = sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


class Solicitacao(Base):
    __tablename__ = 'solicitacoes'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    codigo: Mapped[str | None] = mapped_column(String(20), unique=True)
    tipo: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(15), index=True)
    solicitante_email: Mapped[str] = mapped_column(String(200), index=True)
    solicitante_nome: Mapped[str] = mapped_column(String(200))
    centro_custo: Mapped[str] = mapped_column(String(200), default='')
    gestor_nome: Mapped[str] = mapped_column(String(200), default='')
    gestor_email: Mapped[str] = mapped_column(String(200), default='')
    data: Mapped[date] = mapped_column(Date)
    hora: Mapped[str] = mapped_column(String(5))
    origem: Mapped[str] = mapped_column(String(200))
    destino: Mapped[str] = mapped_column(String(200))
    pax: Mapped[int] = mapped_column(Integer, default=1)
    justificativa: Mapped[str] = mapped_column(Text, default='')
    motivo: Mapped[str] = mapped_column(Text, default='')
    dados: Mapped[dict] = mapped_column(JSON, default=dict)  # campos extras (retorno, bagagem, itens…)
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    atualizado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    aprovacoes: Mapped[list['Aprovacao']] = relationship(back_populates='solicitacao')


class Aprovacao(Base):
    """Pedido de aprovação ao gestor. O link do e-mail carrega um token; no banco fica só o hash dele."""
    __tablename__ = 'aprovacoes'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    solicitacao_id: Mapped[int] = mapped_column(ForeignKey('solicitacoes.id'), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    gestor_nome: Mapped[str] = mapped_column(String(200))
    gestor_email: Mapped[str] = mapped_column(String(200))
    expira_em: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    decidido_em: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    aprovado: Mapped[bool | None] = mapped_column(Boolean)
    motivo: Mapped[str] = mapped_column(Text, default='')
    ip: Mapped[str] = mapped_column(String(64), default='')
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    solicitacao: Mapped[Solicitacao] = relationship(back_populates='aprovacoes')


class Email(Base):
    __tablename__ = 'emails'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    para: Mapped[str] = mapped_column(String(200))
    assunto: Mapped[str] = mapped_column(String(300))
    tipo: Mapped[str] = mapped_column(String(30))
    solicitacao_id: Mapped[int | None] = mapped_column(ForeignKey('solicitacoes.id'))
    situacao: Mapped[str] = mapped_column(String(15), default='pendente')  # pendente | enviado | erro | desligado
    erro: Mapped[str] = mapped_column(Text, default='')
    criado_em: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Auditoria(Base):
    """Trilha de auditoria (21 CFR Part 11 §11.10(e)): gerada só pelo servidor, com data/hora do servidor (UTC),
    quem fez, o quê, em qual registro e campo, valor anterior e novo. Não pode ser alterada nem apagada (gatilho no banco)
    e cada linha guarda o hash da anterior: qualquer adulteração quebra a corrente e aparece em "Verificar integridade"."""
    __tablename__ = 'auditoria'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quando: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    usuario: Mapped[str] = mapped_column(String(200))
    nome: Mapped[str] = mapped_column(String(200), default='')
    acao: Mapped[str] = mapped_column(String(100))
    ref: Mapped[str] = mapped_column(String(100), default='')
    campo: Mapped[str] = mapped_column(String(100), default='')
    antes: Mapped[str] = mapped_column(Text, default='')
    depois: Mapped[str] = mapped_column(Text, default='')
    motivo: Mapped[str] = mapped_column(Text, default='')  # por que alterou (obrigatório para alterar dado já gravado)
    hash_ant: Mapped[str] = mapped_column(String(64), default='')
    hash: Mapped[str] = mapped_column(String(64), default='')


TRAVA_AUDITORIA = 731100  # trava do Postgres que põe as gravações da trilha em fila (a corrente de hash não se embaralha)


def _txt(v):
    if v is None:
        return ''
    return v if isinstance(v, str) else json.dumps(v, ensure_ascii=False, sort_keys=True, default=str)


def hash_auditoria(ant, quando, usuario, nome, acao, ref, campo, antes, depois, motivo=''):
    itens = [ant, quando.astimezone(timezone.utc).isoformat(), usuario or '', nome or '', acao or '', ref or '', campo or '', antes or '', depois or '']
    if motivo:  # linhas antigas (sem motivo) mantêm o mesmo hash
        itens.append(motivo)
    base = json.dumps(itens, ensure_ascii=False)
    return hashlib.sha256(base.encode()).hexdigest()


def auditar(s, usuario, acao, ref='', antes='', depois='', nome='', campo='', motivo=''):
    s.execute(text(f'select pg_advisory_xact_lock({TRAVA_AUDITORIA})'))
    ant = s.scalar(select(Auditoria.hash).order_by(Auditoria.id.desc()).limit(1)) or ''
    a = Auditoria(quando=datetime.now(timezone.utc), usuario=str(usuario or '')[:200], nome=str(nome or '')[:200], acao=str(acao)[:100],
                  ref=str(ref or '')[:100], campo=str(campo or '')[:100], antes=_txt(antes), depois=_txt(depois), motivo=str(motivo or '')[:500], hash_ant=ant)
    a.hash = hash_auditoria(ant, a.quando, a.usuario, a.nome, a.acao, a.ref, a.campo, a.antes, a.depois, a.motivo)
    s.add(a)
    s.flush()


def verificar_auditoria(s):
    """Refaz a corrente de hash do começo ao fim. Devolve (total, id da 1ª linha adulterada ou None)."""
    ant, n = '', 0
    for a in s.execute(select(Auditoria).order_by(Auditoria.id).execution_options(yield_per=2000)).scalars():
        n += 1
        if a.hash_ant != ant or a.hash != hash_auditoria(ant, a.quando, a.usuario, a.nome, a.acao, a.ref, a.campo, a.antes, a.depois, a.motivo):
            return n, a.id
        ant = a.hash
    return n, None


def migrar_auditoria():
    """Colunas novas, corrente de hash para as linhas antigas e o gatilho que impede alterar/apagar a trilha."""
    with engine.begin() as c:
        for col in ("nome varchar(200) not null default ''", "campo varchar(100) not null default ''",
                    "hash_ant varchar(64) not null default ''", "hash varchar(64) not null default ''", "motivo text not null default ''"):
            c.execute(text(f'alter table auditoria add column if not exists {col}'))
        trava = c.scalar(text("select count(*) from pg_trigger where tgname = 'auditoria_imutavel'"))
        if not trava:  # 1ª vez: encadeia o que já existia e só então tranca
            ant = ''
            for row in c.execute(text('select id, quando, usuario, nome, acao, ref, campo, antes, depois, motivo from auditoria order by id')).all():
                h = hash_auditoria(ant, row.quando, row.usuario, row.nome, row.acao, row.ref, row.campo, row.antes, row.depois, row.motivo)
                c.execute(text('update auditoria set hash_ant = :a, hash = :h where id = :i'), {'a': ant, 'h': h, 'i': row.id})
                ant = h
            c.execute(text("""create or replace function auditoria_imutavel() returns trigger language plpgsql as $$
                begin raise exception 'A trilha de auditoria não pode ser alterada nem apagada (21 CFR Part 11).'; end $$"""))
            c.execute(text('create trigger auditoria_imutavel before update or delete on auditoria for each row execute function auditoria_imutavel()'))
            c.execute(text('create trigger auditoria_sem_truncate before truncate on auditoria for each statement execute function auditoria_imutavel()'))


def criar_tabelas():
    for tentativa in range(30):  # o banco pode demorar alguns segundos na primeira subida
        try:
            Base.metadata.create_all(engine)
            return
        except Exception:  # noqa: BLE001
            if tentativa == 29:
                raise
            time.sleep(2)
