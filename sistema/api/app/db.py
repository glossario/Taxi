"""Banco PostgreSQL: modelos e sessão."""
import time
from datetime import datetime, date

from sqlalchemy import (JSON, Boolean, Date, DateTime, ForeignKey, Integer, String, Text, create_engine, func)
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
    __tablename__ = 'auditoria'
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    quando: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    usuario: Mapped[str] = mapped_column(String(200))
    acao: Mapped[str] = mapped_column(String(100))
    ref: Mapped[str] = mapped_column(String(100), default='')
    antes: Mapped[str] = mapped_column(Text, default='')
    depois: Mapped[str] = mapped_column(Text, default='')


def auditar(s, usuario, acao, ref='', antes='', depois=''):
    s.add(Auditoria(usuario=usuario, acao=acao, ref=ref, antes=str(antes), depois=str(depois)))


def criar_tabelas():
    for tentativa in range(30):  # o banco pode demorar alguns segundos na primeira subida
        try:
            Base.metadata.create_all(engine)
            return
        except Exception:  # noqa: BLE001
            if tentativa == 29:
                raise
            time.sleep(2)
