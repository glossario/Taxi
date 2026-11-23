'use strict';
/* Protótipo navegável — Mobilab — Gestão de Táxi e Moto Táxi (Natulab).
   SIMULAÇÃO: sem backend, sem AD real. Dados ficam no navegador (localStorage). */

// ---------------- Parâmetros (no sistema real: configuráveis — RF-19) ----------------
const SITES = { MED: 'Natulab Medicamentos', CD: 'CD Natulab', SUP: 'Natulab Suplementos' };
const SITE_SHORT = { MED: 'MED', CD: 'CD', SUP: 'SUP' };
// Grade inicial (tabela informada). Editável pelo Facilities e pela TI na tela “Grade e rotas”.
const SEED_GRADE = [
  ['07:10', 0], ['08:00', 1], ['08:40', 0], ['09:30', 1], ['11:00', 0], ['11:40', 1],
  ['13:45', 0], ['14:20', 1], ['15:00', 0], ['15:40', 1], ['16:20', 0], ['17:00', 1],
].map(([hora, dir], i) => ({ id: `G${i + 1}`, hora, paradas: dir ? ['SUP', 'CD', 'MED'] : ['MED', 'CD', 'SUP'], ativo: true }));
const SLOT_CAP = 7;                       // Spin — limite do horário quando passa do padrão
const CAP_PADRAO = 4;                     // padrão: carro de 4 vagas; acima disso a viagem vai de Spin
// Vagas de referência: até 4 ocupados = carro (4); a partir daí a Spin (7) assume.
const capSlot = (occ) => (occ >= CAP_PADRAO ? SLOT_CAP : CAP_PADRAO);
const veicPrevisto = (occ) => (occ >= CAP_PADRAO ? 'Spin' : 'Carro');
const EXPEDIENTE = ['07:30', '17:00'];    // DEC-02 em aberto
const BAG = {
  nenhuma: { l: 'Sem bagagem', p: 0 },
  pequena: { l: 'Pequena (mochila/pasta)', p: 1 },
  media: { l: 'Média (mala de mão)', p: 2 },
  grande: { l: 'Grande (mala/caixa)', p: 3 },
};
const TIPOS = { grade: 'Entre sites', cidade: 'Táxi na cidade', inter: 'Táxi intermunicipal', moto: 'Moto Táxi (envio de itens)' };
// Moto Táxi = envio de ITENS (não leva pessoas). Site 1 = Natulab Medicamentos e Life = Natulab Suplementos (confirmado):
// um cadastro só de locais; os apelidos continuam reconhecidos.
const SITE_APELIDO = { MED: 'Site 1', SUP: 'Life' };
const ALIAS_LOC = { S1: 'MED', LIFE: 'SUP', 'site 1': 'MED', site1: 'MED', life: 'SUP', cd: 'CD' };
const ITEM_TAM = {
  pequeno: { l: 'Pequeno (envelope, caixinha)', p: 1 },
  medio: { l: 'Médio (caixa até ~40 cm)', p: 2 },
  grande: { l: 'Grande (ocupa o baú todo)', p: 4 },
};
const MOTO_CARGA = 4;     // pontos de carga por moto
const MOTO_TOL_MIN = 60;  // janela para agrupar envios no mesmo trajeto (tolerância em validação — DEC-05)
const ANTEC_MIN = { grade: 60, cidade: 60, inter: 48 * 60, moto: null };
const STATUS = {
  gestor: 'Aguardando gestor',
  analise: 'Em análise', confirmada: 'Confirmada', recusada: 'Recusada', reagendada: 'Reagendada',
  andamento: 'Em andamento', concluida: 'Concluída', cancelada: 'Cancelada', naorealizada: 'Não realizada',
};
const ATIVOS = ['gestor', 'analise', 'confirmada', 'reagendada', 'andamento'];
// Diretório corporativo (AD) — SIMULADO. No sistema real, nome, e-mail, centro de custo e GESTOR IMEDIATO vêm do AD.
const AD_GESTORES = {
  1000: ['Marina Torres', 'marina.torres'], 2010: ['Paula Nunes', 'paula.nunes'], 3020: ['Ricardo Alves', 'ricardo.alves'],
  4010: ['Fernanda Lopes', 'fernanda.lopes'], 4030: ['Sérgio Dantas', 'sergio.dantas'], 5030: ['Tatiane Moura', 'tatiane.moura'],
  6010: ['Otávio Lins', 'otavio.lins'], 7010: ['Beatriz Sales', 'beatriz.sales'], 8010: ['Henrique Paiva', 'henrique.paiva'],
};
const gestorDe = (cc) => { const g = AD_GESTORES[String(cc || '').slice(0, 4)] || ['Gestor imediato', 'gestor']; return { nome: g[0], email: `${g[1]}@natulab.com.br` }; };
// Aprovação do gestor imediato: somente táxi intermunicipal (decisão do dono, 16/11).
const precisaGestor = (r) => r.tipo === 'inter';
const chefeDe = () => (S.user && S.user.chefe && S.user.chefe.email ? S.user.chefe : gestorDe(S.user.cc));
const VEICULOS = [
  { id: 'V1', nome: 'Chevrolet Spin', placa: 'RFA-1A23', tipo: 'carro', cap: 7, bag: 6 },
  { id: 'V2', nome: 'Onix Sedan', placa: 'RFB-2B34', tipo: 'carro', cap: 4, bag: 4 },
  { id: 'V3', nome: 'HB20 Hatch', placa: 'RFC-3C45', tipo: 'carro', cap: 4, bag: 2 },
  { id: 'M1', nome: 'Moto 01', placa: 'PKM-4D56', tipo: 'moto', cap: 0, bag: 4 },
  { id: 'M2', nome: 'Moto 02', placa: 'PKM-5E67', tipo: 'moto', cap: 0, bag: 4 },
];
// Motoristas NÃO acessam o sistema: o Facilities cadastra nome + WhatsApp e envia a viagem por lá.
const SEED_MOTORISTAS = [
  { id: 'D1', nome: 'João Batista', tipo: 'carro', fone: '75999990001', ativo: true },
  { id: 'D2', nome: 'Rita Oliveira', tipo: 'carro', fone: '75999990002', ativo: true },
  { id: 'D3', nome: 'Marcos Silva', tipo: 'moto', fone: '75999990003', ativo: true },
  { id: 'D4', nome: 'Paulo Santos', tipo: 'moto', fone: '75999990004', ativo: true },
];
// Valores das rotas (cadastrados pela Noemia em Grade e rotas → Valores das rotas). Valores de EXEMPLO.
// Chave = par de locais (sem sentido). Táxi e moto têm valores próprios.
// Destinos fora das unidades também ficam aqui (chave = unidade | destino em minúsculas), com o nome para exibir.
const SEED_TARIFAS = { 'CD|MED': { carro: 50, moto: 15 }, 'MED|SUP': { carro: 75, moto: 20 }, 'CD|SUP': { carro: 30, moto: 15 },
  'MED|centro – cartório de notas': { carro: 38, moto: null, nome: 'Centro – Cartório de Notas' } };
const DURACAO_MIN = 60; // intervalo mínimo entre viagens do mesmo veículo/motorista (RF-14)

// ---------------- Utilidades ----------------
const $ = (s, el = document) => el.querySelector(s);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const at = (dateStr, hm) => { const [y, m, d] = dateStr.split('-').map(Number); const [h, mi] = hm.split(':').map(Number); return new Date(y, m - 1, d, h, mi); };
const isWeekday = (d) => d.getDay() >= 1 && d.getDay() <= 5;
const fmtDay = (d) => d.toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' });
const fmtDate = (s) => { const [y, m, d] = s.split('-'); return `${d}/${m}/${y}`; };
const fmtDT = (s, h) => `${fmtDay(at(s, h))} ${h}`;
const nowStamp = () => new Date().toLocaleString('pt-BR');
const mondayOf = (d) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); const dow = x.getDay() || 7; return addDays(x, 1 - dow); };
const workday = (offset) => { let d = new Date(); d = new Date(d.getFullYear(), d.getMonth(), d.getDate()); while (!isWeekday(d)) d = addDays(d, 1); let n = offset; while (n > 0) { d = addDays(d, 1); if (isWeekday(d)) n--; } return ymd(d); };
const siteName = (code) => SITES[ALIAS_LOC[code] || code] || code;
// Normaliza local para comparar/agrupar: código cadastrado ou texto livre que coincide com um nome cadastrado → código.
const normLoc = (v) => {
  const s = String(v).trim();
  if (SITES[s]) return s;
  if (ALIAS_LOC[s]) return ALIAS_LOC[s];
  const t = s.toLowerCase().replace(/\s+/g, ' ');
  if (ALIAS_LOC[t]) return ALIAS_LOC[t];
  const hit = Object.entries(SITES).find(([k, n]) => n.toLowerCase() === t || (SITE_APELIDO[k] || '').toLowerCase() === t);
  return hit ? hit[0] : t;
};
const tamCurto = (t) => ITEM_TAM[t].l.split(' ')[0].toLowerCase();
const cargaPts = (r) => (r.tipo === 'moto' ? ITEM_TAM[r.tam].p * r.vol : BAG[r.bag].p);
const resumo = (r) => (r.tipo === 'moto' ? `${r.vol}× ${r.item} (${tamCurto(r.tam)})` : `${r.pax} pax · ${BAG[r.bag].l.split(' ')[0]}`);
const veic = (id) => VEICULOS.find((v) => v.id === id);
const mot = (id) => S.motoristas.find((m) => m.id === id);
const fmtFone = (d) => (d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d);
const initials = (n) => n.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');

// ---------------- Estado ----------------
const KEY = 'mobilab-sim-v8';
let S;
function load() { try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; } catch (e) { return null; } }
function save() {
  if (window.MOBILAB_API) { if (S && S.user) Srv.gravar(); return; }
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { /* sem storage: segue em memória */ }
}
// Modo servidor: mesmas telas, dados no PostgreSQL (iguais para todos), login pelo AD e e-mails de verdade.
const Srv = {
  versao: -1, teste: false, timer: null, gravando: false, pendente: false, sujo: false,
  async iniciar() {
    S = { user: null, reqs: [], log: [], emails: [] };
    if (/^aprovar\//.test(location.hash.replace('#', ''))) { route(); return; } // link do e-mail do gestor: sem login
    try {
      const eu = await (await fetch('/api/eu', { cache: 'no-store' })).json();
      Srv.teste = !!eu.login_teste;
      Srv.entra = !!eu.entra;
      if (!eu.user) { route(); return; }
      await Srv.carregar(eu.user);
    } catch (e) { route(); toast('Sem conexão com o servidor do Mobilab.'); }
  },
  async carregar(user) {
    const r = await fetch('/api/estado', { cache: 'no-store' });
    if (r.status === 401) { S.user = null; route(); return; }
    const j = await r.json();
    Srv.versao = j.versao;
    S = j.estado || estadoInicial();
    S.user = user; S.week = 0;
    if (!j.estado) save(); // primeiro uso: grava a base (grade, motoristas, valores)
    route();
    Srv.vigiar();
  },
  gravar() { this.sujo = true; clearTimeout(this.timer); this.timer = setTimeout(() => this.enviar(), 120); },
  async enviar() {
    if (this.gravando) { this.pendente = true; return; }
    this.gravando = true;
    const { user, week, ...est } = S;
    try {
      const r = await fetch('/api/estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versao: this.versao, estado: est }) });
      const j = await r.json();
      if (r.ok) { this.versao = j.versao; this.sujo = false; }
      else if (r.status === 401) { this.sujo = false; S.user = null; route(); toast('Sua sessão expirou. Entre novamente.'); }
      else { this.sujo = false; this.aplicar(j); toast(r.status === 409 ? 'Outra pessoa alterou os dados agora — a tela foi atualizada. Confira e repita a ação.' : (j.erro || 'Não foi possível salvar.')); }
    } catch (e) { toast('Sem conexão com o servidor — a última ação não foi salva.'); }
    this.gravando = false;
    if (this.pendente) { this.pendente = false; this.enviar(); }
  },
  aplicar(j) {
    if (!j || !j.estado) return;
    const u = S.user, w = S.week;
    this.versao = j.versao; S = j.estado; S.user = u; S.week = w;
    route();
  },
  vigiar() { // traz o que os outros fizeram (sem atrapalhar quem está digitando ou com janela aberta)
    if (this.vigia) return;
    this.vigia = setInterval(async () => {
      if (!S.user || this.gravando || this.sujo || !$('#modal').hidden) return;
      const ae = document.activeElement;
      if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
      try { const j = await (await fetch(`/api/estado?v=${this.versao}`, { cache: 'no-store' })).json(); if (!j.igual && j.estado) this.aplicar(j); } catch (e) { /* tenta de novo */ }
    }, 15000);
  },
  async entrar(usuario, senha) {
    const r = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ usuario, senha }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.erro || 'Não foi possível entrar.');
    await Srv.carregar(j.user);
  },
};
// Base do sistema real: grade, motoristas e valores das rotas — sem as solicitações de exemplo.
function estadoInicial() {
  const b = seed();
  return { ...b, user: null, reqs: [], log: [], emails: [], seq: { ...b.seq, req: 1000, os: 0 } };
}

function seed() {
  const d0 = workday(0), d1 = workday(1), d2 = workday(2), d3 = workday(3);
  const item = (desc, vol, tam, recebedor) => ({ item: desc, vol, tam, recebedor, pax: 0, bag: 'nenhuma' });
  const r = (o) => ({ veiculo: null, motorista: null, os: null, excecao: false, motivo: '', criado: nowStamp(), ...o });
  const reqs = [
    r({ id: 'SOL-1041', tipo: 'grade', nome: 'Ana Souza', email: 'ana.souza@natulab.com.br', cc: '4010 – Tecnologia da Informação', data: d1, hora: '08:40', origem: 'MED', destino: 'SUP', pax: 2, bag: 'nenhuma', just: 'Suporte presencial na linha de envase', status: 'analise' }),
    r({ id: 'SOL-1042', tipo: 'grade', nome: 'Bruno Lima', email: 'bruno.lima@natulab.com.br', cc: '3020 – Garantia da Qualidade', data: d1, hora: '08:40', origem: 'MED', destino: 'CD', pax: 2, bag: 'pequena', just: 'Auditoria interna no CD', status: 'analise' }),
    r({ id: 'SOL-1043', tipo: 'grade', nome: 'Carla Mendes', email: 'carla.mendes@natulab.com.br', cc: '5030 – Logística', data: d1, hora: '13:45', origem: 'MED', destino: 'SUP', pax: 2, bag: 'media', just: 'Inventário', status: 'analise' }),
    r({ id: 'SOL-1044', tipo: 'grade', nome: 'Diego Rocha', email: 'diego.rocha@natulab.com.br', cc: '3020 – Garantia da Qualidade', data: d1, hora: '13:45', origem: 'CD', destino: 'SUP', pax: 3, bag: 'pequena', just: 'Coleta de amostras', status: 'analise' }),
    r({ id: 'SOL-1045', tipo: 'grade', nome: 'Helena Costa', email: 'helena.costa@natulab.com.br', cc: '2010 – Recursos Humanos', data: d0, hora: '15:00', origem: 'MED', destino: 'SUP', pax: 3, bag: 'nenhuma', just: 'Treinamento de integração', status: 'confirmada', veiculo: 'V1', motorista: 'D1' }),
    r({ id: 'SOL-1046', tipo: 'cidade', nome: 'Elisa Prado', email: 'elisa.prado@natulab.com.br', cc: '6010 – Comercial', data: d2, hora: '10:00', origem: 'MED', destino: 'Centro – Cartório de Notas', pax: 1, bag: 'nenhuma', just: 'Reconhecimento de firma em contrato', status: 'analise' }),
    r({ id: 'SOL-1047', tipo: 'moto', nome: 'Felipe Andrade', email: 'felipe.andrade@natulab.com.br', cc: '4030 – Suprimentos', data: d0, hora: '14:30', origem: 'MED', destino: 'Correios – Agência Centro', ...item('Documentos fiscais', 1, 'pequeno', 'Balcão dos Correios'), just: 'Postagem de documentos fiscais', status: 'confirmada', veiculo: 'M1', motorista: 'D3', os: 'OS-2026-000121' }),
    r({ id: 'SOL-1048', tipo: 'inter', nome: 'Gustavo Reis', email: 'gustavo.reis@natulab.com.br', cc: '1000 – Diretoria', data: d3, hora: '06:00', origem: 'MED', destino: 'Aeroporto de Salvador', pax: 2, bag: 'grande', just: 'Viagem para auditoria de fornecedor', status: 'analise' }),
    r({ id: 'SOL-1049', tipo: 'moto', nome: 'Ivo Pereira', email: 'ivo.pereira@natulab.com.br', cc: '7010 – Pesquisa e Desenvolvimento', data: d1, hora: '09:00', origem: 'SUP', destino: 'Laboratório parceiro – Centro', ...item('Amostras para análise externa', 1, 'medio', 'Recepção do laboratório'), just: 'Análise externa de lote', status: 'analise' }),
    r({ id: 'SOL-1050', tipo: 'moto', nome: 'Jéssica Alves', email: 'jessica.alves@natulab.com.br', cc: '8010 – Financeiro', data: d1, hora: '13:30', origem: 'MED', destino: 'Agência bancária – Centro', ...item('Documentos bancários', 1, 'pequeno', 'Gerente PJ'), just: 'Entrega de documentos bancários', status: 'confirmada', veiculo: 'M1', motorista: 'D3', os: 'OS-2026-000122' }),
    r({ id: 'SOL-1051', tipo: 'moto', nome: 'Kátia Ramos', email: 'katia.ramos@natulab.com.br', cc: '4030 – Suprimentos', data: d1, hora: '10:00', origem: 'MED', destino: 'CD', ...item('Envelope com notas fiscais', 1, 'pequeno', 'Recebimento do CD'), just: 'Conferência de entrada de mercadoria', status: 'analise' }),
    r({ id: 'SOL-1052', tipo: 'moto', nome: 'Lucas Martins', email: 'lucas.martins@natulab.com.br', cc: '3020 – Garantia da Qualidade', data: d1, hora: '10:30', origem: 'MED', destino: 'CD', ...item('Caixa pequena de amostras de retenção', 1, 'pequeno', 'Laboratório CQ – CD'), just: 'Transferência de amostras', status: 'analise' }),
  ];
  reqs.find((x) => x.id === 'SOL-1047').wpp = nowStamp();
  // Exemplos para a Visão geral: aprovação do gestor, retornos, cancelada e uma viagem acontecendo agora.
  const hoje = ymd(new Date()), agora = new Date(Date.now() - 20 * 60000);
  const hAgora = `${pad(agora.getHours())}:${pad(agora.getMinutes())}`;
  const g = (cc) => ({ gestor: gestorDe(cc), aprovPedido: nowStamp() });
  Object.assign(reqs.find((x) => x.id === 'SOL-1048'), { status: 'gestor', ...g('1000 – Diretoria') });
  reqs.push(
    r({ id: 'SOL-1053', tipo: 'inter', nome: 'Mariana Lopes', email: 'mariana.lopes@natulab.com.br', cc: '6010 – Comercial', data: d2, hora: '07:00', origem: 'MED', destino: 'Feira de Santana – Cliente Farmavida', pax: 1, bag: 'pequena', just: 'Visita técnica a cliente', status: 'analise', ...g('6010'), aprov: { ok: true, quando: nowStamp(), ts: Date.now() - 50 * 60000, por: 'Otávio Lins', motivo: '' } }),
    r({ id: 'SOL-1054', tipo: 'inter', nome: 'Nelson Prado', email: 'nelson.prado@natulab.com.br', cc: '5030 – Logística', data: d1, hora: '07:30', origem: 'CD', destino: 'Alagoinhas – Despachante', pax: 1, bag: 'nenhuma', just: 'Documentação de veículo', status: 'recusada', ...g('5030'), aprov: { ok: false, quando: nowStamp(), ts: Date.now() - 90 * 60000, por: 'Tatiane Moura', motivo: 'Pode ser resolvido por e-mail' }, motivo: 'Reprovada pelo gestor Tatiane Moura: Pode ser resolvido por e-mail' }),
    r({ id: 'SOL-1055', tipo: 'grade', nome: 'Olívia Santos', email: 'olivia.santos@natulab.com.br', cc: '2010 – Recursos Humanos', data: d1, hora: '09:30', origem: 'SUP', destino: 'MED', pax: 1, bag: 'nenhuma', just: 'Entrevista', status: 'cancelada', motivo: 'Cancelada pelo solicitante' }),
    r({ id: 'SOL-1056', tipo: 'cidade', nome: 'Pedro Araújo', email: 'pedro.araujo@natulab.com.br', cc: '4030 – Suprimentos', data: hoje, hora: hAgora, origem: 'MED', destino: 'Centro – Fornecedor de embalagens', pax: 1, bag: 'nenhuma', just: 'Aprovação de amostra de embalagem', status: 'confirmada', veiculo: 'V2', motorista: 'D2', wpp: nowStamp() }),
    r({ id: 'SOL-1057', tipo: 'inter', nome: 'Quésia Lima', email: 'quesia.lima@natulab.com.br', cc: '3020 – Garantia da Qualidade', data: d1, hora: '08:15', origem: 'MED', destino: 'Laboratório Central – Salvador', pax: 1, bag: 'pequena', just: 'Entrega urgente de laudo', status: 'gestor', ...g('3020') }),
  );
  // Viagens já concluídas no mês, para o relatório de custos (inclui o exemplo do dono: TI até o CD e Garantia até a Life).
  const dias = (k) => ymd(addDays(new Date(), -k));
  const fz = (o) => r({ status: 'concluida', wpp: nowStamp(), bag: 'nenhuma', ...o });
  reqs.push(
    fz({ id: 'SOL-1058', tipo: 'grade', nome: 'Ana Souza', email: 'ana.souza@natulab.com.br', cc: '4010 – Tecnologia da Informação', data: dias(9), hora: '08:40', origem: 'MED', destino: 'CD', pax: 1, just: 'Inventário de equipamentos', veiculo: 'V2', motorista: 'D1' }),
    fz({ id: 'SOL-1059', tipo: 'grade', nome: 'Bruno Lima', email: 'bruno.lima@natulab.com.br', cc: '3020 – Garantia da Qualidade', data: dias(9), hora: '08:40', origem: 'MED', destino: 'SUP', pax: 1, just: 'Auditoria de linha', veiculo: 'V2', motorista: 'D1' }),
    fz({ id: 'SOL-1060', tipo: 'cidade', nome: 'Elisa Prado', email: 'elisa.prado@natulab.com.br', cc: '6010 – Comercial', data: dias(3), hora: '10:00', origem: 'MED', destino: 'Centro – Cartório de Notas', pax: 1, just: 'Reconhecimento de firma', veiculo: 'V3', motorista: 'D2' }),
    fz({ id: 'SOL-1061', tipo: 'moto', nome: 'Kátia Ramos', email: 'katia.ramos@natulab.com.br', cc: '4030 – Suprimentos', data: dias(2), hora: '10:30', origem: 'MED', destino: 'CD', ...item('Notas fiscais', 1, 'pequeno', 'Recebimento do CD'), just: 'Conferência', veiculo: 'M1', motorista: 'D3', os: 'OS-2026-000118' }),
    fz({ id: 'SOL-1062', tipo: 'moto', nome: 'Lucas Martins', email: 'lucas.martins@natulab.com.br', cc: '3020 – Garantia da Qualidade', data: dias(2), hora: '10:30', origem: 'MED', destino: 'CD', ...item('Amostras de retenção', 1, 'pequeno', 'Laboratório CQ – CD'), just: 'Transferência', veiculo: 'M1', motorista: 'D3', os: 'OS-2026-000118' }),
  );
  return {
    user: null, reqs, motoristas: SEED_MOTORISTAS.map((m) => ({ ...m })), grade: SEED_GRADE.map((g) => ({ ...g, paradas: [...g.paradas] })),
    log: [], seq: { req: 1062, os: 122, mot: 4, grade: SEED_GRADE.length }, week: 0,
    tarifas: JSON.parse(JSON.stringify(SEED_TARIFAS)),
  };
}

function audit(acao, ref, antes, depois) {
  S.log.unshift({ t: nowStamp(), user: S.user ? S.user.nome : '—', acao, ref, antes: antes ?? '', depois: depois ?? '' });
}

// ---------------- Regras de negócio ----------------
function inExpediente(d) {
  if (!isWeekday(d)) return false;
  const hm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return hm >= EXPEDIENTE[0] && hm < EXPEDIENTE[1];
}
/* Fora do expediente → primeiro horário permitido é o 2º horário da próxima grade operacional (seção 7.3). */
function offHoursTarget(now = new Date()) {
  if (inExpediente(now)) return null;
  let d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (!isWeekday(d) || hm >= EXPEDIENTE[1]) { d = addDays(d, 1); while (!isWeekday(d)) d = addDays(d, 1); }
  const g = grade();
  return { data: ymd(d), hora: (g[1] || g[0] || { hora: EXPEDIENTE[0] }).hora };
}
function minAllowedGrade() {
  const now = new Date();
  const byAntec = new Date(now.getTime() + ANTEC_MIN.grade * 60000);
  const off = offHoursTarget(now);
  if (!off) return byAntec;
  const t = at(off.data, off.hora);
  return t > byAntec ? t : byAntec;
}
function slotOcc(data, hora, ignoreId) {
  return S.reqs.filter((r) => r.tipo === 'grade' && r.data === data && r.hora === hora && ATIVOS.includes(r.status) && r.id !== ignoreId)
    .reduce((s, r) => s + Number(r.pax), 0);
}
// Chegada prevista de um horário da grade = saída seguinte (a saída de um site significa que o carro já chegou lá).
const chegadaDe = (hora) => { const g = grade().find((x) => x.hora > hora); return g ? g.hora : null; };
const grade = () => S.grade.filter((g) => g.ativo).sort((a, b) => a.hora.localeCompare(b.hora));
const slotOf = (hora) => S.grade.find((g) => g.ativo && g.hora === hora);
const periodo = (h) => (h < '12:00' ? 'Manhã' : h < '18:00' ? 'Tarde' : 'Noite');
const rotaTxt = (p, short) => p.map((c) => (short ? SITE_SHORT[c] : siteName(c))).join(' → ');
function trechoOk(paradas, o, d) { const i = paradas.indexOf(o), j = paradas.indexOf(d); return i >= 0 && j > i; }
function nextCompatibleSlot(data, hora, origem, destino, pax) {
  const min = minAllowedGrade();
  let d = at(data, '00:00');
  for (let k = 0; k < 15; k++, d = addDays(d, 1)) {
    if (!isWeekday(d)) continue;
    const ds = ymd(d);
    for (const { hora: h, paradas } of grade()) {
      const t = at(ds, h);
      if (t <= at(data, hora) || t < min) continue;
      if (!trechoOk(paradas, origem, destino)) continue;
      if (slotOcc(ds, h) + pax <= SLOT_CAP) return { data: ds, hora: h };
    }
  }
  return null;
}
// Duração que a solicitação ocupa veículo/motorista. Bate-volta avulso: ida + espera + volta.
const durOf = (r) => (r.bv && r.tipo !== 'grade' ? r.bv.espera + 2 * DURACAO_MIN : DURACAO_MIN);
function busy(kind, id, data, hora, ignoreIds = [], dur = DURACAO_MIN) {
  const t = at(data, hora).getTime();
  return S.reqs.some((r) => {
    if (ignoreIds.includes(r.id) || !['confirmada', 'reagendada', 'andamento'].includes(r.status) || r[kind] !== id || r.data !== data) return false;
    const tr = at(r.data, r.hora).getTime();
    return t < tr + durOf(r) * 60000 && tr < t + dur * 60000; // intervalos se sobrepõem
  });
}
function newReqId() { S.seq.req += 1; return `SOL-${S.seq.req}`; }
function newOsId() { S.seq.os += 1; return `OS-2026-${String(S.seq.os).padStart(6, '0')}`; }

// ---------------- Render base ----------------
const app = () => $('#app');
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200); }
function openModal(html) { const m = $('#modal'); $('.modal-card', m).innerHTML = html; m.hidden = false; }
function closeModal() { $('#modal').hidden = true; }
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('#modal').hidden && UI.vx && route.page === 'visao') { UI.vx = null; route(); }
  else if ($('#modal').hidden && UI.sel && route.page === 'agenda') { UI.sel = null; route(); }
  else closeModal();
});
document.addEventListener('click', (e) => { const m = $('#menu'); if (m && !m.hidden && !e.target.closest('.user-wrap')) m.hidden = true; });
const pill = (st) => `<span class="pill st-${esc(st)}">${esc(STATUS[st] || st)}</span>`;
const brand = `<a class="brand" href="#"><span class="w">NATU<span>LAB</span></span><span class="s">FARMACÊUTICA</span></a>`;

function route() {
  const h = location.hash.replace('#', '') || '';
  const ap = h.match(/^aprovar\/([A-Za-z0-9_-]+)$/);
  if (ap) { route.page = 'aprovar'; return renderAprovar(ap[1]); } // link do e-mail do gestor: cai direto na aprovação
  if (!S.user) return renderLogin();
  const home = { colaborador: 'agenda', facilities: 'visao', ti: 'inicio' }[S.user.role];
  const allowed = navDe(S.user).map(([k]) => k);
  const page = allowed.includes(h) ? h : home;
  if (page !== 'visao') UI.vx = null; // sair da tela expandida ao trocar de página
  route.page = page;
  ({ visao: renderVisao, agenda: renderAgenda, minhas: renderMinhas, painel: renderPainel, viagens: renderViagens, solicitacoes: renderTodas, motoristas: renderMotoristas,
    grade: renderGrade, custos: renderCustos, historico: renderHistorico, cadastros: renderCadastros, aprovacoes: renderAprovacoes,
    inicio: renderInicioTI, usuarios: renderUsuarios })[page](page);
}
window.addEventListener('hashchange', route);

// Perfis → telas. TI / Administração do sistema tem acesso a tudo.
const NAV_COLAB = [['agenda', 'Agenda'], ['minhas', 'Minhas solicitações']];
const NAV_FAC = [['visao', 'Visão geral'], ['painel', 'Painel'], ['viagens', 'Viagens'], ['solicitacoes', 'Solicitações'], ['motoristas', 'Motoristas'], ['grade', 'Grade e rotas'], ['custos', 'Custos']];
// Gestor imediato (vem do AD) vê as mesmas abas do colaborador + Aprovações.
const navDe = (u) => [...NAV[u.role], ...(u.gestor ? [['aprovacoes', 'Aprovações']] : [])];
const NAV = {
  colaborador: NAV_COLAB,
  facilities: NAV_FAC,
  ti: [['inicio', 'Início'], ...NAV_FAC, ...NAV_COLAB, ['historico', 'Histórico'], ['usuarios', 'Usuários'], ['cadastros', 'Cadastros']],
};
// Ícones (traço, herdam a cor do texto)
const ICO = {
  cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.6 3.4-5.5 6.5-5.5s5.7 1.9 6.5 5.5"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18.5 14.8c1.6.8 2.6 2.6 3 5.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  left: '<path d="M15 5l-7 7 7 7"/>', right: '<path d="M9 5l7 7-7 7"/>', down: '<path d="M6 9l6 6 6-6"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  grid: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  list: '<path d="M9 6h11M9 12h11M9 18h11M4 6h.01M4 12h.01M4 18h.01"/>',
  route: '<circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6 8.5-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1-4.4 4.2-6.5 8-6.5s7 2.1 8 6.5"/>',
  car: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="16" r="1.5"/><circle cx="16.5" cy="16" r="1.5"/><path d="M5 11h14"/>',
  moto: '<circle cx="5.5" cy="16.5" r="3"/><circle cx="18.5" cy="16.5" r="3"/><path d="M5.5 16.5l4-6h5l4 6M12 10.5l-1-3h-2M15 7.5h3"/>',
  send: '<path d="M21 3L10 14"/><path d="M21 3l-7 18-4-7-7-4z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  money: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9.5v.01M18 14.5v.01"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1"/>',
  history: '<path d="M3.5 12a8.5 8.5 0 1 0 2.5-6"/><path d="M3 4v4h4"/><path d="M12 8v4l3 2"/>',
  shield: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-4.5"/>',
  userplus: '<circle cx="10" cy="8" r="3.5"/><path d="M3 20c.8-3.8 3.6-5.8 7-5.8 1.4 0 2.7.3 3.8 1"/><path d="M18 14v6M15 17h6"/>',
};
const ico = (n, s = 18) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICO[n]}</svg>`;

function openAjuda() {
  openModal(`
    <h3>Política de transporte</h3>
    <p class="sub">Regras usadas nesta simulação (em validação com o Facilities).</p>
    <ul class="help-list">
      <li><b>Grade entre sites:</b> escolha um horário na Agenda e solicite com pelo menos <b>1 hora</b> de antecedência.</li>
      <li><b>Fora do expediente</b> (${EXPEDIENTE[0]}–${EXPEDIENTE[1]}, seg–sex): a solicitação vai para o <b>2º horário</b> do próximo dia útil.</li>
      <li><b>Horário da grade = saída.</b> A saída seguinte de um site indica que o carro já chegou lá (é a chegada prevista).</li>
      <li><b>Embarque:</b> chegue ao ponto com pelo menos <b>5 minutos</b> de antecedência.</li>
      <li><b>Intermunicipal:</b> precisa da aprovação do <b>gestor imediato</b> (do AD) antes de ir para o Facilities.</li>
      <li><b>Capacidade:</b> cada horário tem <b>${CAP_PADRAO} vagas</b> (carro). Se passar de ${CAP_PADRAO} passageiros, a viagem vai de <b>Spin</b> (até ${SLOT_CAP}). Ocupação conta solicitações em análise e confirmadas.</li>
      <li><b>Táxi na cidade:</b> 1 h de antecedência · <b>Intermunicipal:</b> 48 h · <b>Moto Táxi:</b> envio de itens (prazo a definir).</li>
      <li>Toda solicitação passa pela análise do <b>Facilities</b>; você acompanha o status em “Minhas solicitações”.</li>
    </ul>
    <div class="modal-acts"><button class="btn green" id="cx">Entendi</button></div>`);
  $('#cx').onclick = closeModal;
}

function shell(page, content) {
  // TI acessa tudo pelo Início (ícones); na barra fica só o Início e a tela aberta.
  const nav = S.user.role === 'ti' ? navDe(S.user).filter(([k]) => k === 'inicio' || k === page) : navDe(S.user);
  const nAprov = S.user.gestor ? S.reqs.filter((r) => r.status === 'gestor' && r.gestor && r.gestor.email === S.user.email).length : 0;
  const nMinhas = S.reqs.filter((r) => r.email === S.user.email && ATIVOS.includes(r.status)).length;
  const nNovas = minhasMsgs().filter((e) => !e.lida).length;
  app().innerHTML = `
    <header class="topbar">
      ${brand}
      <nav>${nav.map(([k, l]) => `<a href="#${k}" class="${k === page ? 'on' : ''}">${l}${k === 'minhas' && nMinhas ? ` <span class="count">${nMinhas}</span>` : ''}${k === 'aprovacoes' && nAprov ? ` <span class="count">${nAprov}</span>` : ''}</a>`).join('')}
        <a href="#" id="ajuda">Ajuda</a></nav>
      <span class="spacer"></span>
      ${window.MOBILAB_API ? (Srv.teste ? '<span class="badge-sim">TESTE</span>' : '') : '<span class="badge-sim">SIMULAÇÃO</span>'}
      <button class="icon-btn bell" id="bell" aria-label="Mensagens do Facilities${nNovas ? ` (${nNovas} novas)` : ''}" title="Mensagens do Facilities">${ico('bell', 18)}${nNovas ? `<span class="dot">${nNovas}</span>` : ''}</button>
      <div class="user-wrap">
        <button class="user" id="umenu" aria-haspopup="true" aria-expanded="false"><span class="avatar">${esc(initials(S.user.nome))}</span>
          <span class="who"><b>${esc(S.user.nome)}</b>${esc(S.user.cargo)}</span>${ico('down', 16)}</button>
        <div class="menu" id="menu" hidden>
          ${window.MOBILAB_API ? '' : '<button id="reset">Restaurar dados de exemplo</button>'}
          <button id="logout">Sair</button>
        </div>
      </div>
    </header>
    <main>${content}</main>`;
  $('#ajuda').onclick = (e) => { e.preventDefault(); openAjuda(); };
  $('#bell').onclick = openCaixa;
  $('#umenu').onclick = () => { const m = $('#menu'); m.hidden = !m.hidden; $('#umenu').setAttribute('aria-expanded', String(!m.hidden)); };
  $('#logout').onclick = () => {
    if (window.MOBILAB_API) { fetch('/sair').finally(() => { location.hash = ''; location.reload(); }); return; }
    audit('Logout', S.user.email); S.user = null; save(); location.hash = ''; route();
  };
  if ($('#reset')) $('#reset').onclick = () => { if (confirm('Restaurar os dados de exemplo da simulação?')) { const u = S.user; S = seed(); S.user = u; save(); route(); toast('Dados de exemplo restaurados.'); } };
}

// ---------------- Login ----------------
const heroArt = `
<svg viewBox="0 0 640 420" role="img" aria-label="Rota entre os sites Natulab">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#1b3a7a"/><stop offset="1" stop-color="#2d5bd1"/></linearGradient></defs>
  <path d="M70 300 C 180 120, 300 360, 420 190 S 545 110, 555 120" fill="none" stroke="#0b2a8f" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 22" opacity=".55"/>
  <g transform="translate(70 300)"><circle r="34" fill="#fff"/><circle r="22" fill="url(#g)"/><text y="70" text-anchor="middle" font-size="20" font-weight="800" fill="#0b2a8f">Medicamentos</text></g>
  <g transform="translate(330 270)"><circle r="34" fill="#fff"/><circle r="22" fill="url(#g)"/><text y="70" text-anchor="middle" font-size="20" font-weight="800" fill="#0b2a8f">CD Natulab</text></g>
  <g transform="translate(555 120)"><circle r="34" fill="#fff"/><circle r="22" fill="url(#g)"/><text y="70" text-anchor="middle" font-size="20" font-weight="800" fill="#0b2a8f">Suplementos</text></g>
  <g transform="translate(160 120)">
    <rect x="0" y="20" width="190" height="80" rx="22" fill="#fff"/>
    <path d="M18 20 L50 -18 H150 L182 20 Z" fill="#fff"/>
    <path d="M60 -8 H100 V20 H40 Z M110 -8 H145 L168 20 H110 Z" fill="#cfe6ff"/>
    <rect x="0" y="52" width="190" height="10" fill="#4a8f22"/>
    <circle cx="45" cy="100" r="22" fill="#13295a"/><circle cx="45" cy="100" r="9" fill="#fff"/>
    <circle cx="150" cy="100" r="22" fill="#13295a"/><circle cx="150" cy="100" r="9" fill="#fff"/>
  </g>
  <g transform="translate(420 300)">
    <circle cx="0" cy="40" r="26" fill="#13295a"/><circle cx="0" cy="40" r="10" fill="#fff"/>
    <circle cx="110" cy="40" r="26" fill="#13295a"/><circle cx="110" cy="40" r="10" fill="#fff"/>
    <path d="M0 40 L40 0 H80 L110 40" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M38 0 L52 -28 H70" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
    <rect x="44" y="-10" width="44" height="16" rx="8" fill="#4a8f22"/>
  </g>
</svg>`;

const LOGO_NATULAB = `<svg viewBox="0 0 399.96 156.55" xmlns="http://www.w3.org/2000/svg"><path fill="#73bc25" d="M25.88,64.16l17.08,37.59c2.32,5.08,4.21,5.8,9.93,5.8h9.62v-56.25h-9.46l.07,45.29h-.98c-1.46,0-1.93-.9-2.43-1.85l-17.11-37.64c-2.31-5.04-4.29-5.8-9.93-5.8h-9.62v56.25h10.13l-.2-45.19h.98c1.09,0,1.64,1.21,1.9,1.8Z"></path><path fill="#73bc25" d="M86.31,95.08c.35-.91.99-1.36,1.95-1.36h21.26c.96,0,1.6.45,1.95,1.37l4.03,10.26c.54,1.46,1.66,2.2,3.34,2.2h8.98l-22.85-54.2c-.64-1.56-1.58-2.22-3.13-2.22h-5.89c-1.57,0-2.48.64-3.13,2.21l-22.93,54.21h8.97c1.68,0,2.81-.73,3.34-2.18l4.11-10.29ZM90.62,83.44l7.32-20.02h1.81l7.32,20.01c.19.54.14,1.05-.14,1.46-.27.38-.71.6-1.22.6h-13.73c-.51,0-.96-.22-1.22-.6-.28-.4-.33-.92-.14-1.45Z"></path><path fill="#73bc25" d="M171.82,51.3h-46.87l.89,6.59c.24,1.87.88,2.47,2.62,2.47h14.78v47.19h10.29v-47.19h14.85c1.74,0,2.37-.6,2.61-2.46l.83-6.6Z"></path><path fill="#73bc25" d="M226.71,51.3h-10.29v35.95c0,8.34-3.75,11.9-12.54,11.9h-2.46c-8.79,0-12.54-3.56-12.54-11.9v-35.95h-10.29v35.54c0,14.84,6.99,21.46,22.67,21.46h2.83c15.63,0,22.6-6.62,22.6-21.46v-35.54Z"></path><path fill="#73bc25" d="M313.08,17.84c-2.02-2.47-5-3.89-8.2-3.89-2.42,0-4.8.85-6.68,2.38-2.19,1.79-3.55,4.32-3.83,7.13-.1,1.01-.06,2.03.12,3,.49,2.65-.35,5.38-2.25,7.3-1.56,1.58-3.68,2.45-5.86,2.45-.47,0-.94-.04-1.41-.12-.66-.11-1.33-.17-1.99-.17-2.77,0-5.33.95-7.62,2.81-5.64,4.6-6.62,12.75-2.2,18.18,2.36,2.9,5.92,4.56,9.74,4.56.56,0,1.4-.12,1.75-.12,2.09,0,4.02,1.11,5.16,2.85,1.14,1.75,1.35,3.94.55,5.87-.81,1.94-.82,4.09-.05,6.05,1.22,3.11,4.18,5.12,7.52,5.13,1.01,0,2.01-.19,2.96-.56,4.15-1.63,6.19-6.33,4.56-10.48-1.1-2.8-3.53-4.69-6.49-5.06-2.05-.25-3.85-1.5-4.81-3.33-.96-1.83-.96-4.02,0-5.85.05-.09.09-.19.14-.29.62-1.14,1.62-4.17,1.72-5.74.09-1.44-.07-2.88-.49-4.3-.78-2.61-.22-5.44,1.5-7.56,1.57-1.94,3.93-3.05,6.4-3.05.23,0,.46,0,.69.03.29.02.59.04.89.04,2.42,0,4.79-.85,6.68-2.38,4.52-3.68,5.19-10.36,1.51-14.87Z"></path><g fill="#2a4a18"><path d="M65.23,140.97c-.68,0-1.03-.34-1.03-1.03v-11.7c0-1.26.29-2.17.88-2.73.59-.55,1.55-.83,2.91-.83h6.46c.68,0,1.03.34,1.02,1.03v.49c0,.69-.34,1.03-1.02,1.03h-6.16c-1.11,0-1.4.39-1.4,1.21v3.05h6.62c.69,0,1.03.34,1.03,1.03v.49c0,.68-.34,1.03-1.03,1.03h-6.62v5.91c0,.68-.34,1.03-1.03,1.03h-.65Z"></path><path d="M98.53,140.97c-.6,0-.99-.28-1.15-.86l-1.13-3.71h-7.78l-1.14,3.71c-.16.58-.55.86-1.16.86h-.66c-.73,0-1.08-.44-.84-1.16l3.56-11.58c.43-1.38.94-2.35,1.57-2.92.61-.57,1.47-.86,2.56-.86s1.98.28,2.61.86,1.14,1.54,1.53,2.92l3.57,11.58c.21.72-.12,1.16-.86,1.16h-.67ZM89.23,133.91h6.25l-1.64-5.35c-.39-1.27-.76-1.65-1.49-1.65s-1.09.38-1.48,1.65l-1.64,5.35Z"></path><path d="M123.18,139.74c.44.72.16,1.24-.67,1.24h-1.04c-.55,0-.95-.23-1.22-.71l-3.48-6.07h-2.97v5.75c0,.68-.34,1.03-1.03,1.03h-.65c-.68,0-1.03-.34-1.03-1.03v-11.7c0-1.26.29-2.17.88-2.73.59-.55,1.55-.83,2.91-.83h1.97c2.15,0,3.68.29,4.87,1.02,1.18.72,1.77,1.96,1.77,3.73,0,2.64-1.32,4.04-3.9,4.54l3.59,5.76ZM113.79,131.66h3.3c1.36,0,2.31-.18,2.86-.54.55-.36.83-.92.83-1.69s-.27-1.33-.82-1.69c-.55-.35-1.52-.53-2.88-.53h-2.17c-.88,0-1.14.47-1.14,1.21v3.23Z"></path><path d="M135.08,140.97c-.7,0-1.05-.39-.97-1.09l1.53-12.4c.26-2.19,1.09-3.04,2.84-3.04.87,0,1.53.23,1.98.69.45.47.78,1.25,1.02,2.35l2.09,10.31c.06.38.2.56.4.56.2,0,.33-.18.39-.56l2.09-10.31c.23-1.1.58-1.88,1.03-2.35.45-.45,1.1-.69,1.97-.69,1.76,0,2.57.84,2.85,3.04l1.53,12.4c.09.7-.27,1.09-.97,1.09h-.7c-.65,0-1-.32-1.08-.97l-1.48-12.39c-.02-.15-.11-.22-.26-.22-.13,0-.22.06-.26.2l-2.28,11.17c-.31,1.55-1.21,2.2-2.85,2.2s-2.53-.65-2.86-2.2l-2.28-11.17c-.02-.13-.11-.2-.27-.2-.13,0-.22.07-.25.22l-1.49,12.39c-.07.65-.43.97-1.08.97h-.67Z"></path><path d="M177.69,140.97c-.6,0-.99-.28-1.15-.86l-1.13-3.71h-7.78l-1.14,3.71c-.16.58-.55.86-1.16.86h-.66c-.73,0-1.08-.44-.84-1.16l3.56-11.58c.43-1.38.94-2.35,1.57-2.92.61-.57,1.47-.86,2.56-.86s1.98.28,2.61.86,1.14,1.54,1.53,2.92l3.57,11.58c.21.72-.12,1.16-.86,1.16h-.67ZM168.39,133.91h6.25l-1.64-5.35c-.39-1.27-.76-1.65-1.49-1.65s-1.09.38-1.48,1.65l-1.64,5.35Z"></path><path d="M199.83,124.91c.59.16.88.54.88,1.16v.5c0,.72-.45,1.05-1.2.87-5.65-1.31-7.66.77-7.65,5.37-.01,4.63,1.99,6.67,7.65,5.39.73-.18,1.2.13,1.2.86v.5c0,.62-.32,1.03-.97,1.19-4.41,1.08-7.65.16-9.41-2.64-.89-1.41-1.33-3.17-1.33-5.29.01-6.44,4.22-9.64,10.83-7.91Z"></path><path d="M222.81,138.43c.68,0,1.03.34,1.03,1.03v.49c0,.68-.34,1.03-1.03,1.03h-6.93c-1.36,0-2.33-.28-2.91-.84-.59-.55-.88-1.46-.88-2.72v-9.17c0-1.26.29-2.17.88-2.73.59-.55,1.55-.83,2.91-.83h6.46c.68,0,1.03.34,1.02,1.03v.49c0,.69-.34,1.03-1.02,1.03h-6.16c-1.11,0-1.4.39-1.4,1.21v3.05h6.29c.68,0,1.03.34,1.03,1.03v.48c0,.69-.34,1.03-1.03,1.03h-6.29v3.19c0,.82.28,1.21,1.4,1.21h6.62ZM218.32,121.73l-2.51,1.1c-.59.26-1.03.15-1.33-.36-.29-.48-.13-.89.48-1.25l2.64-1.44c.47-.26.93-.27,1.41-.01l2.68,1.46c.61.34.77.76.48,1.25-.31.5-.76.61-1.33.36l-2.51-1.1Z"></path><path d="M248.18,124.68c.68,0,1.03.34,1.03,1.03v8.79c0,2.29-.54,3.98-1.63,5.07s-2.86,1.63-5.35,1.63-4.26-.55-5.34-1.64c-1.09-1.09-1.63-2.77-1.63-5.06v-8.79c0-.68.34-1.03,1.03-1.03h.65c.69,0,1.03.34,1.03,1.03v8.98c0,2.73,1.29,3.95,4.26,3.95s4.27-1.22,4.27-3.95v-8.98c0-.68.34-1.03,1.03-1.03h.65Z"></path><path d="M272.63,124.68c.69,0,1.03.34,1.03,1.03v.5c0,.69-.34,1.03-1.03,1.03h-4.45v12.7c0,.68-.34,1.03-1.03,1.03h-.67c-.69,0-1.03-.34-1.03-1.03v-12.7h-4.45c-.69,0-1.03-.34-1.03-1.03v-.5c0-.68.34-1.03,1.03-1.03h11.64Z"></path><path d="M285.75,140.97c-.68,0-1.03-.34-1.03-1.03v-14.24c0-.68.34-1.03,1.03-1.03h.66c.69,0,1.03.34,1.03,1.03v14.24c0,.68-.34,1.03-1.03,1.03h-.66Z"></path><path d="M310.25,124.91c.59.16.88.54.88,1.16v.5c0,.72-.45,1.05-1.2.87-5.65-1.31-7.66.77-7.65,5.37-.01,4.63,1.99,6.67,7.65,5.39.73-.18,1.2.13,1.2.86v.5c0,.62-.32,1.03-.97,1.19-4.41,1.08-7.65.16-9.41-2.64-.89-1.41-1.33-3.17-1.33-5.29.01-6.44,4.22-9.64,10.83-7.91Z"></path><path d="M335.35,140.97c-.6,0-.99-.28-1.15-.86l-1.13-3.71h-7.78l-1.14,3.71c-.16.58-.55.86-1.16.86h-.66c-.73,0-1.08-.44-.84-1.16l3.56-11.58c.43-1.38.94-2.35,1.57-2.92.61-.57,1.47-.86,2.56-.86s1.98.28,2.61.86,1.14,1.54,1.53,2.92l3.57,11.58c.21.72-.12,1.16-.86,1.16h-.67ZM326.05,133.91h6.25l-1.64-5.35c-.39-1.27-.76-1.65-1.49-1.65s-1.09.38-1.48,1.65l-1.64,5.35Z"></path></g><path fill="#2a4a18" d="M275.38,107.64h-26.51c-8.96,0-13.29-4.81-13.29-14.51v-41.84h11.84v40.8c0,3.69,1.23,4.89,4.98,4.89h18.56c2.17,0,3.18.96,3.47,3.21l.94,7.45Z"></path><path fill="#2a4a18" d="M378.85,78.06v-.56c3.83-1.68,5.92-5.29,5.92-9.86v-2.16c0-9.14-5.2-14.19-15.67-14.19h-30.33v56.35h31.56c12.06,0,16.61-6.33,16.61-14.67v-2.81c0-6.57-2.82-10.74-8.09-12.1ZM368.45,61.95c3.39,0,4.98,1.6,4.98,5.05v1.76c0,3.45-1.59,5.05-4.98,5.05h-17.84v-11.86h17.84ZM375.09,91.77c0,3.53-1.52,5.21-5.27,5.21h-19.21v-13.14h19.21c3.76,0,5.27,1.76,5.27,5.21v2.73Z"></path><path fill="#2a4a18" d="M314.81,53.35c-.64-1.56-1.58-2.22-3.13-2.22h-8.41l12.18,32.3c.19.54.14,1.05-.14,1.46-.27.38-.71.6-1.22.6l-21.76-.2c-2.81-.03-5.35,1.64-6.44,4.23l-7.63,18.04h8.97c1.68,0,2.81-.73,3.34-2.18l4.11-10.29c.35-.91.99-1.36,1.95-1.36h21.26c.96,0,1.6.45,1.95,1.37l4.03,10.26c.54,1.46,1.66,2.2,3.34,2.2h8.98l-21.38-54.2Z"></path></svg>`;

function renderLogin() {
  app().innerHTML = `
  <div class="lg-fundo"><div class="lg-tela">
    <section class="lg-marca" aria-label="Natulab">
      <div class="lg-logo">${LOGO_NATULAB}</div>
      <div class="lg-servicos">
        <p class="lg-frase">Táxi e Moto Táxi corporativo da Natulab.</p>
        <ul><li><b>Mobilab</b><small>Solicite, acompanhe e organize seus deslocamentos entre os sites.</small></li></ul>
      </div>
      <p class="lg-rodape escuro">Copyright © ${new Date().getFullYear()} Mobilab · Natulab · SAC 0800 730 7370</p>
    </section>
    <section class="lg-acesso">
      <div class="lg-form">
        <h1>Mobilab</h1>
        <p class="lg-sub">Informe suas credenciais abaixo para acessar sua conta.</p>
        <form id="lf" novalidate>
          <div class="lg-campo"><label for="em">E-mail</label><input class="lg-input" id="em" type="email" placeholder="seuemail@exemplo.com" autocomplete="username"></div>
          <div class="lg-campo"><label for="pw">Senha</label><div class="lg-senha"><input class="lg-input" id="pw" type="password" placeholder="Digite sua senha" autocomplete="current-password">
            <button type="button" id="eye" aria-label="Mostrar senha"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>
          <div class="lg-linha"><label class="lg-lembrar"><input type="checkbox" checked> Lembrar de mim</label><a class="lg-link" href="#" id="forgot">Esqueci minha senha</a></div>
          <button class="btn-primary lg-entrar" type="submit">Entrar</button>
          <div id="lerr" class="lg-erro" hidden></div>
        </form>
        ${window.MOBILAB_API && Srv.entra ? `<div class="lg-ou"><span>ou</span></div>
        <a class="lg-ms" href="/auth/entra"><svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>Entrar com a conta Microsoft</a>` : ''}
        <div class="demo lg-demo">
          <p><b>Simulação:</b> qualquer senha funciona. Entre como:</p>
          <div class="chips">
            <button data-em="colaborador@natulab.com.br">Colaborador</button>
            <button data-em="ricardo.alves@natulab.com.br">Gestor</button>
            <button data-em="facilities@natulab.com.br">Facilities</button>
            <button data-em="ti@natulab.com.br">TI / Administração</button>
          </div>
        </div>
      </div>
      <p class="lg-rodape">natulab.com.br · Bem-estar todos os dias</p>
    </section>
  </div></div>`;
  $('#eye').onclick = () => { const p = $('#pw'); p.type = p.type === 'password' ? 'text' : 'password'; };
  $('#forgot').onclick = (e) => { e.preventDefault(); toast('Na versão final o acesso é pela conta corporativa (AD) — sem senha própria.'); };
  const TESTE_SRV = { 'colaborador@natulab.com.br': 'colaborador', 'ricardo.alves@natulab.com.br': 'gestor', 'facilities@natulab.com.br': 'facilities', 'ti@natulab.com.br': 'ti' };
  if (window.MOBILAB_API) {
    const qs = new URLSearchParams(location.search), msgErro = qs.get('erro'); // erro vindo do login Microsoft
    if (msgErro) { const l = $('#lerr'); l.textContent = msgErro; l.hidden = false; history.replaceState(null, '', location.pathname + location.hash); }
    const dm = $('.demo');
    if (!Srv.teste) dm.hidden = true; else dm.querySelector('p').innerHTML = '<b>Modo de teste</b> (AD ainda não ligado): a senha não é conferida. Digite o login ou e-mail de <b>qualquer usuário do AD</b>, ou entre como:';
  }
  document.querySelectorAll('.demo button').forEach((b) => { b.onclick = () => { $('#em').value = window.MOBILAB_API ? TESTE_SRV[b.dataset.em] : b.dataset.em; $('#pw').value = 'demo'; $('#lf').requestSubmit(); }; });
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    if (window.MOBILAB_API) {
      const err = $('#lerr'), bt = $('#lf .btn-primary');
      if (!$('#em').value.trim() || (!$('#pw').value && !Srv.teste)) { err.textContent = 'Informe usuário (ou e-mail) e senha.'; err.hidden = false; return; }
      bt.disabled = true; err.hidden = true;
      try { location.hash = ''; await Srv.entrar($('#em').value.trim(), $('#pw').value); } catch (ex) { err.textContent = ex.message; err.hidden = false; bt.disabled = false; }
      return;
    }
    const em = $('#em').value.trim().toLowerCase();
    const err = $('#lerr');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em) || !$('#pw').value) { err.textContent = 'Informe um e-mail válido e a senha.'; err.hidden = false; return; }
    if (em.includes('facilities')) S.user = { email: em, nome: 'Equipe Facilities', cargo: 'Facilities', role: 'facilities' };
    else if (Object.values(AD_GESTORES).some(([, e]) => `${e}@natulab.com.br` === em)) {
      const [cc, [nome]] = Object.entries(AD_GESTORES).find(([, [, e]]) => `${e}@natulab.com.br` === em);
      S.user = { email: em, nome, cargo: 'Gestor', role: 'colaborador', gestor: true, cc: cc === '3020' ? '3020 – Garantia da Qualidade' : cc };
    } else if (em.startsWith('ti@')) S.user = { email: em, nome: 'Equipe TI', cargo: 'TI / Administração do sistema', role: 'ti', cc: '4010 – Tecnologia da Informação' };
    else {
      const nome = em.split('@')[0].split(/[._-]/).filter(Boolean).map((p) => p[0].toUpperCase() + p.slice(1)).join(' ');
      S.user = { email: em, nome, cargo: 'Tecnologia da Informação', role: 'colaborador', cc: '4010 – Tecnologia da Informação' };
    }
    const cad = (S.usuarios || []).find((x) => x.email === em);
    if (cad && !cad.ativo) { S.user = null; err.textContent = 'Seu acesso ao Mobilab está bloqueado. Fale com a TI.'; err.hidden = false; return; }
    if (cad && cad.perfil) S.user.role = cad.perfil;
    audit('Login', em);
    save();
    location.hash = '';
    route();
  };
}

// ---------------- Colaborador: Agenda ----------------
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const SITE_CURTO = { MED: 'Medicamentos', CD: 'CD', SUP: 'Suplementos' };
const curto = (c) => SITE_CURTO[c] || siteName(c);
const UI = { per: 'todos', view: 'grade', sel: null, faixa: 'semana', dia: null, mes: 0 }; // estado só da tela (não persiste)
const proxUtil = (d, passo = 1) => { let x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); while (!isWeekday(x)) x = addDays(x, passo); return x; };

function weekLabel(a, b) {
  if (a.getMonth() === b.getMonth()) return `${pad(a.getDate())} – ${pad(b.getDate())} de ${MESES[b.getMonth()]}, ${b.getFullYear()}`;
  return `${pad(a.getDate())} ${MESES[a.getMonth()].slice(0, 3)} – ${pad(b.getDate())} ${MESES[b.getMonth()].slice(0, 3)}, ${b.getFullYear()}`;
}
const SLOT_LBL = { disp: 'Disponível', poucas: 'Poucas vagas', lotado: 'Lotado', indisp: 'Fora do prazo' };
function slotInfo(ds, slot, min, mine) {
  const occ = slotOcc(ds, slot.hora);
  const cap = capSlot(occ);
  const livres = Math.max(0, cap - occ);
  const my = mine.find((r) => r.tipo === 'grade' && r.data === ds && r.hora === slot.hora && ATIVOS.includes(r.status));
  let cls = 'disp';
  if (my) cls = 'minha';
  else if (at(ds, slot.hora) < min) cls = 'indisp';
  else if (!livres) cls = 'lotado';
  else if (livres <= 2) cls = 'poucas';
  return { occ, livres, cap, veic: veicPrevisto(occ), my, cls, pct: Math.min(100, Math.round((occ / cap) * 100)), lbl: my ? STATUS[my.status] : SLOT_LBL[cls] };
}
const vagasTxt = (n) => (n ? `${n} ${n === 1 ? 'vaga' : 'vagas'}` : 'Lotado');

function painelSlot(sel, min, mine) {
  const slot = sel && slotOf(sel.h);
  if (!slot) {
    return `<div class="det-empty">${ico('cal', 28)}<b>Selecione um horário</b><p>Clique em um horário da agenda para ver a rota, as vagas e o veículo antes de solicitar.</p></div>`;
  }
  const inf = slotInfo(sel.d, slot, min, mine);
  const conf = S.reqs.filter((r) => r.tipo === 'grade' && r.data === sel.d && r.hora === sel.h && ['confirmada', 'andamento', 'concluida'].includes(r.status));
  const v = veic((conf.find((r) => r.veiculo) || {}).veiculo);
  const m = mot((conf.find((r) => r.motorista) || {}).motorista);
  const p = slot.paradas;
  const stops = p.map((c, i) => `<li class="${i === 0 ? 'ini' : i === p.length - 1 ? 'fim' : 'mid'}">
      <small>${i === 0 ? 'Saída' : i === p.length - 1 ? 'Destino' : 'Parada'}</small><b>${esc(siteName(c))}</b>${i === 0 ? `<span>${esc(sel.h)}</span>` : i === p.length - 1 && chegadaDe(sel.h) ? `<span>chega até ${esc(chegadaDe(sel.h))}</span>` : ''}</li>`).join('');
  const res = rascunho(sel);
  const reservando = !inf.my && !['indisp', 'lotado'].includes(inf.cls);
  const pax = 1 + res.acomp.length;
  const capN = reservando ? capSlot(inf.occ + pax) : inf.cap; // passou de 4: a viagem vai de Spin
  const ficam = capN - inf.occ - pax;
  const barra = Array.from({ length: capN }, (_, i) => `<i class="${i < inf.occ ? 'oc' : reservando && i < inf.occ + pax ? 'eu' : ''}"></i>`).join('');
  let acao;
  if (inf.my) acao = `<button class="btn-cta" id="go" data-act="ver">Ver minha solicitação</button>`;
  else if (inf.cls === 'indisp') acao = `<button class="btn-cta" disabled>Fora do prazo de solicitação</button><p class="cta-note">Antecedência mínima de 1 h ou regra de expediente.</p>`;
  else if (inf.cls === 'lotado') acao = `<button class="btn-cta" disabled>Horário lotado</button><p class="cta-note">Escolha outro horário ou use a solicitação avulsa.</p>`;
  else if (ficam < 0) acao = `<button class="btn-cta" disabled>Vagas insuficientes</button><p class="cta-note">Este horário não comporta ${pax} pessoas. Tire alguém da reserva ou escolha outro horário.</p>`;
  else acao = `<button class="btn-cta" id="go" data-act="sol">${pax > 1 ? `Reservar ${pax} vagas` : 'Reservar minha vaga'}</button>`;
  const pessoa = (x, i) => {
    const d = ccPartes(x.cc);
    return `<li><span class="rs-n"><b>${esc(x.nome)}${i < 0 ? ' <em>(você)</em>' : x.visitante ? ' <em>(visitante)</em>' : ''}</b><small>${esc(x.visitante ? 'Lançado no seu centro de custo' : d.dep || 'Sem departamento')}</small></span>
      <span class="rs-cc">${x.visitante ? '' : esc(d.cod ? `CC ${d.cod}` : 'Departamento sem centro de custo')}</span>
      ${i < 0 ? '<span></span>' : `<button type="button" class="rs-x" data-tira="${i}" aria-label="Tirar ${esc(x.nome)} da reserva">${ico('x', 14)}</button>`}</li>`;
  };
  const reserva = reservando ? `
    <div class="rs">
      <div class="rs-t">Sua reserva <span>(você e quem vai junto)</span></div>
      <div class="rs-box">
        <ul>${pessoa({ nome: S.user.nome, cc: S.user.cc }, -1)}${res.acomp.map(pessoa).join('')}</ul>
        <div class="rs-add">
          <div class="rs-busca"><input class="input" id="rsq" placeholder="Adicionar colega: digite o nome ou o departamento" autocomplete="off" aria-label="Adicionar colega"><div class="rs-sug" id="rssug" hidden></div></div>
          <div class="rs-vis" id="rsvis" hidden><input class="input" id="rsvn" placeholder="Nome do visitante" maxlength="120"><button type="button" class="btn sm green" id="rsvok">Adicionar</button></div>
          <div class="rs-dica"><small>Cada pessoa é lançada no centro de custo do seu departamento.</small><a href="#" id="rsv">Adicionar visitante</a></div>
        </div>
      </div>
      <label class="check rs-carga"><input type="checkbox" id="rscg" ${res.carga ? 'checked' : ''}> <span>Vou levar carga no porta-malas</span></label>
      ${res.carga ? `<div class="f"><label for="rscgt">O que vai levar</label><input class="input" id="rscgt" value="${esc(res.cargaTxt)}" placeholder="Ex.: caixa de amostras" maxlength="200"></div>` : ''}
    </div>` : '';
  return `
    <div class="det-h"><div><span class="eyebrow">Horário fixo</span><div class="det-t">${esc(sel.h)}</div>
      <span class="sp sp-${inf.cls}"><i></i>${esc(inf.lbl)}</span></div>
      <div class="det-h-info"><div class="note">Chegue ao ponto de embarque pelo menos 5 minutos antes.</div></div>
      <button class="icon-btn" id="detx" aria-label="Fechar detalhes">${ico('x', 18)}</button></div>
    <div class="det-corpo">
      <ol class="tl">${stops}</ol>
      <div class="det-cards">
        <div><small>Data</small><b>${esc(diaRel(sel.d))}</b><span>${esc(fmtDate(sel.d))}</span></div>
        <div><small>Vagas</small><b>${inf.livres} de ${inf.cap} livres</b><span>${reservando ? (ficam >= 0 ? `ficam ${ficam} com a sua reserva` : `faltam ${-ficam} para a sua reserva`) : esc(p.map(curto).join(' → '))}</span><div class="vg-bar">${barra}</div></div>
        <div><small>Carro</small>${v ? `<b>${esc(v.nome)}</b><span>${esc(v.placa)}</span>` : `<em>A definir pelo aprovador</em><span>previsto: ${esc(veicPrevisto(reservando ? inf.occ + pax : inf.occ))}</span>`}</div>
        <div><small>Motorista</small>${m ? `<b>${esc(m.nome)}</b>` : '<em>A definir pelo aprovador</em>'}</div>
      </div>
      ${reserva}
    </div>
    <div class="det-pe">${acao}<a href="#" class="det-link" id="pol">Ver política de transporte</a></div>`;
}

// ---- Rascunho da reserva no painel (quem vai junto + carga). Fica só na tela até virar solicitação.
function rascunho(sel) {
  const k = `${sel.d}|${sel.h}`;
  if (!UI.res || UI.res.k !== k) UI.res = { k, acomp: [], carga: false, cargaTxt: '' };
  return UI.res;
}
const ccPartes = (cc) => { // "4010 – Tecnologia da Informação" → { cod: '4010', dep: 'Tecnologia da Informação' }
  const t = String(cc || '').trim(), mm = t.match(/^(\d{3,})\s*[–-]?\s*(.*)$/);
  return mm ? { cod: mm[1], dep: mm[2] || t } : { cod: '', dep: t };
};
const diaRel = (ds) => {
  const hoje = ymd(new Date()), amanha = ymd(addDays(new Date(), 1));
  return ds === hoje ? 'Hoje' : ds === amanha ? 'Amanhã' : DIAS[at(ds, '12:00').getDay()];
};
const semAcento = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Lista de colegas para "Adicionar colega" (nome, e-mail e setor de quem está ativo)
async function colegas() {
  if (UI.colegas) return UI.colegas;
  if (window.MOBILAB_API) {
    const r = await fetch('/api/pessoas', { cache: 'no-store' }); const j = await r.json();
    if (!r.ok) throw new Error(j.erro || 'Não foi possível carregar os colegas.');
    UI.colegas = j.pessoas;
  } else UI.colegas = (await Usr.listar()).filter((u) => u.ativo).map((u) => ({ nome: u.nome, email: u.email, cc: u.cc }));
  return UI.colegas;
}
function ligarReserva() {
  const q = $('#rsq');
  if (!q) return;
  const res = UI.res, sug = $('#rssug');
  const redesenha = () => { const det = $('#det'), y = det && $('.det-corpo', det) ? $('.det-corpo', det).scrollTop : 0; route(); const c = $('#det .det-corpo'); if (c) c.scrollTop = y; };
  document.querySelectorAll('[data-tira]').forEach((b) => { b.onclick = () => { res.acomp.splice(Number(b.dataset.tira), 1); redesenha(); }; });
  let lista = [];
  const mostra = async () => {
    const t = semAcento(q.value.trim());
    if (t.length < 2) { sug.hidden = true; return; }
    let todos;
    try { todos = await colegas(); } catch (e) { sug.innerHTML = `<div class="rs-vazio">${esc(e.message)}</div>`; sug.hidden = false; return; }
    const ja = new Set([S.user.email, ...res.acomp.map((x) => x.email).filter(Boolean)]);
    lista = todos.filter((x) => !ja.has(x.email) && semAcento(`${x.nome} ${x.cc}`).includes(t)).slice(0, 8);
    sug.innerHTML = lista.length ? lista.map((x, i) => `<button type="button" data-i="${i}"><b>${esc(x.nome)}</b><small>${esc(ccPartes(x.cc).dep || '—')}</small></button>`).join('')
      : '<div class="rs-vazio">Ninguém encontrado. Se não é da Natulab, use “Adicionar visitante”.</div>';
    sug.hidden = false;
    sug.querySelectorAll('[data-i]').forEach((b) => { b.onmousedown = (e) => { e.preventDefault(); const x = lista[Number(b.dataset.i)]; res.acomp.push({ nome: x.nome, email: x.email, cc: x.cc }); redesenha(); }; });
  };
  q.oninput = () => { clearTimeout(ligarReserva.t); ligarReserva.t = setTimeout(mostra, 150); };
  q.onblur = () => setTimeout(() => { sug.hidden = true; }, 150);
  q.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const b = sug.querySelector('[data-i]'); if (b) b.onmousedown(e); } };
  $('#rsv').onclick = (e) => { e.preventDefault(); $('#rsvis').hidden = false; $('#rsvn').focus(); };
  const addVis = () => { const n = $('#rsvn').value.trim(); if (!n) return; res.acomp.push({ nome: n, visitante: true, cc: S.user.cc }); redesenha(); };
  $('#rsvok').onclick = addVis;
  $('#rsvn').onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addVis(); } };
  $('#rscg').onchange = (e) => { res.carga = e.target.checked; redesenha(); if (res.carga) { const i = $('#rscgt'); if (i) i.focus(); } };
  const cg = $('#rscgt'); if (cg) cg.oninput = () => { res.cargaTxt = cg.value; };
}

function renderAgenda(page) {
  const hojeD = new Date();
  let days, navTit, navTxt;
  if (UI.faixa === 'dia') {
    const d = UI.dia ? at(UI.dia, '00:00') : proxUtil(hojeD);
    days = [d];
    navTit = ymd(d) === ymd(hojeD) ? 'Hoje' : 'Dia';
    navTxt = `${DIAS[d.getDay()]}, ${pad(d.getDate())} de ${MESES[d.getMonth()]}`;
  } else if (UI.faixa === 'mes') {
    const m0 = new Date(hojeD.getFullYear(), hojeD.getMonth() + UI.mes, 1);
    days = [];
    for (let d = m0; d.getMonth() === m0.getMonth(); d = addDays(d, 1)) if (isWeekday(d)) days.push(d);
    navTit = UI.mes === 0 ? 'Mês atual' : UI.mes < 0 ? 'Mês anterior' : 'Próximo mês';
    navTxt = `${MESES[m0.getMonth()].replace(/^./, (c) => c.toUpperCase())} de ${m0.getFullYear()}`;
  } else {
    const base = addDays(mondayOf(hojeD), S.week * 7);
    days = [0, 1, 2, 3, 4].map((i) => addDays(base, i));
    navTit = S.week === 0 ? 'Semana atual' : S.week < 0 ? 'Semana anterior' : 'Próxima semana';
    navTxt = weekLabel(days[0], days[4]);
  }
  const min = minAllowedGrade();
  const off = offHoursTarget();
  const todayStr = ymd(new Date());
  const mine = S.reqs.filter((r) => r.email === S.user.email);
  const g = grade().filter((s) => UI.per === 'todos' || periodo(s.hora) === UI.per);
  if (UI.sel && !days.some((d) => ymd(d) === UI.sel.d)) UI.sel = null;

  const novas = minhasMsgs().filter((e) => !e.lida);

  const card = (ds, s) => {
    const i = slotInfo(ds, s, min, mine);
    const sel = UI.sel && UI.sel.d === ds && UI.sel.h === s.hora;
    const p = s.paradas, via = p.slice(1, -1).map(curto).join(', ');
    return `<button class="sc s-${i.cls}${sel ? ' sel' : ''}" data-d="${ds}" data-h="${s.hora}" title="${esc(rotaTxt(p))}">
      <span class="sc-top"><span class="t">${s.hora}</span>${i.my ? `<span class="tag">${esc(i.lbl)}</span>` : `<span class="vg">${ico('users', 14)}${vagasTxt(i.livres)}</span>`}</span>
      <span class="sc-r"><span>${esc(curto(p[0]))}</span> <span><i>→</i> ${esc(curto(p[p.length - 1]))}</span></span>
      <span class="sc-m"><span>${via ? `via ${esc(via)}` : 'direto'}</span><span>${i.veic}</span></span>
      <span class="bar"><i style="width:${i.pct}%"></i></span></button>`;
  };
  const aberto = (ds, s) => slotInfo(ds, s, min, mine).cls !== 'indisp'; // a viagem já marcada pela pessoa continua aparecendo
  const col = (d) => {
    const ds = ymd(d), hoje = ds === todayStr;
    const vis = g.filter((s) => aberto(ds, s)); // horário que já passou (não dá mais para solicitar) some da agenda
    const encerrado = g.length && !vis.length;
    let html = `<section class="day${hoje ? ' today' : ''}${encerrado ? ' encerrado' : ''}"><div class="day-h"><b>${DIAS[d.getDay()]}</b>${hoje ? '<span class="hoje">Hoje</span>' : ''}<small>${pad(d.getDate())} ${MESES[d.getMonth()].slice(0, 3)}</small></div><div class="day-b">`;
    if (!g.length) html += '<div class="empty">Nenhum horário.</div>';
    ['Manhã', 'Tarde', 'Noite'].forEach((per) => {
      const ss = vis.filter((s) => periodo(s.hora) === per);
      if (!ss.length) return;
      html += `<div class="per"><span>${per}</span><small>${ss.length} ${ss.length === 1 ? 'horário' : 'horários'}</small></div>${ss.map((s) => card(ds, s)).join('')}`;
    });
    return html + '</div></section>';
  };
  const lista = () => `<div class="card lst-wrap"><div class="table-wrap"><table class="lst"><thead><tr><th>Dia</th><th>Horário</th><th>Rota</th><th>Vagas</th><th>Situação</th></tr></thead><tbody>
    ${days.map((d) => g.filter((s) => aberto(ymd(d), s)).map((s) => {
      const ds = ymd(d), i = slotInfo(ds, s, min, mine), sel = UI.sel && UI.sel.d === ds && UI.sel.h === s.hora;
      return `<tr class="sc s-${i.cls}${sel ? ' sel' : ''}" data-d="${ds}" data-h="${s.hora}" tabindex="0"><td>${DIAS[d.getDay()]} <small>${fmtDate(ds)}</small></td><td><b>${s.hora}</b></td>
        <td>${esc(s.paradas.map(curto).join(' → '))}</td><td>${vagasTxt(i.livres)}</td><td><span class="sp sp-${i.cls}"><i></i>${esc(i.lbl)}</span></td></tr>`;
    }).join('')).join('')}</tbody></table></div></div>`;
  // Mês: um quadradinho por dia útil com o que ainda dá para solicitar; clicar abre o dia
  const mesGrid = () => {
    const vazios = (days[0].getDay() + 6) % 7; // segunda = 0
    const cel = (d) => {
      const ds = ymd(d), vis = g.filter((s) => aberto(ds, s));
      const meus = mine.filter((r) => r.tipo === 'grade' && r.data === ds && ATIVOS.includes(r.status)).length;
      const vagas = vis.reduce((n, s) => n + slotInfo(ds, s, min, mine).livres, 0);
      const enc = g.length && !vis.length;
      return `<button class="mc${ds === todayStr ? ' today' : ''}${enc ? ' encerrado' : ''}" data-dia="${ds}">
        <span class="mc-d">${pad(d.getDate())}${ds === todayStr ? ' <span class="hoje">Hoje</span>' : ''}</span>
        ${enc ? '<small>Encerrado</small>' : `<b>${vis.length} ${vis.length === 1 ? 'horário' : 'horários'}</b><small>${vagasTxt(vagas)}</small>`}
        ${meus ? `<span class="tag">${meus} ${meus === 1 ? 'minha viagem' : 'minhas viagens'}</span>` : ''}</button>`;
    };
    return `<div class="mes">${['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'].map((x) => `<div class="mes-h">${x}</div>`).join('')}
      ${'<div></div>'.repeat(vazios)}${days.map(cel).join('')}</div>`;
  };
  const seg = (k, l) => `<button class="seg-b${UI.per === k ? ' on' : ''}" data-per="${k}">${l}</button>`;
  const segF = (k, l) => `<button class="seg-b${UI.faixa === k ? ' on' : ''}" data-faixa="${k}">${l}</button>`;

  shell(page, `
    <div class="hero">
      <div><span class="eyebrow">Mobilidade corporativa</span><h1>Olá, ${esc(S.user.nome)}</h1>
        <p>Encontre um horário, confira os detalhes da rota e solicite sua vaga.</p></div>
      <button class="btn-cta inline" id="avulsa">${ico('plus', 18)} Solicitação avulsa</button>
    </div>
    ${novas.length ? `<div class="notif">
      <div class="notif-h"><span class="si green">${ico('mail', 20)}</span><div><b>${novas.every((e) => !e.kind) ? (novas.length === 1 ? 'Viagem confirmada' : `${novas.length} viagens confirmadas`) : `${novas.length} ${novas.length === 1 ? 'mensagem nova' : 'mensagens novas'} do Facilities`}</b>
        <small>Enviadas também para o seu e-mail: confirmações, recusas e remarcações.</small></div></div>
      ${novas.slice(0, 3).map((e) => `<button class="mail-row nova k-${e.kind || 'ok'}" data-em="${esc(e.id)}"><i></i><span><b>${esc(e.assunto)}</b><small>${esc(e.quando)} · ${esc(e.refs.join(', '))}</small></span><span class="lnk">Abrir</span></button>`).join('')}
    </div>` : ''}
    ${off ? `<div class="banner warn">${ico('clock', 18)}<div><b>Fora do expediente do Facilities.</b> Solicitações da grade feitas agora vão para o <b>2º horário do próximo dia útil: ${esc(fmtDT(off.data, off.hora))}</b>.</div></div>` : ''}
    <div class="toolbar">
      <div class="wk">
        <button class="icon-btn" id="prev" aria-label="Anterior">${ico('left')}</button>
        <div class="wk-box">${ico('cal', 18)}<span><small>${navTit}</small><b>${navTxt}</b></span></div>
        <button class="icon-btn" id="next" aria-label="Próximo">${ico('right')}</button>
        <button class="btn" id="hoje">Hoje</button>
      </div>
      <div class="wk">
        <span class="lbl">${ico('filter', 16)} Período</span>
        <div class="seg">${seg('todos', 'Todos')}${seg('Manhã', 'Manhã')}${seg('Tarde', 'Tarde')}</div>
        <div class="seg">${segF('dia', 'Dia')}${segF('semana', 'Semana')}${segF('mes', 'Mês')}</div>
        <div class="seg view"><button class="seg-b${UI.view === 'grade' ? ' on' : ''}" data-view="grade" aria-label="Ver em grade">${ico('grid', 16)}</button><button class="seg-b${UI.view === 'lista' ? ' on' : ''}" data-view="lista" aria-label="Ver em lista">${ico('list', 16)}</button></div>
      </div>
    </div>
    <div class="ag-body">
      <div class="ag-main">${UI.view !== 'grade' ? lista() : UI.faixa === 'mes' ? mesGrid() : `<div class="cal-scroll"><div class="week${UI.faixa === 'dia' ? ' um' : ''}">${days.map(col).join('')}</div></div>`}</div>
      ${UI.sel ? `<div class="det-fundo" id="detf"></div><aside class="det gaveta" id="det" role="dialog" aria-label="Detalhes do horário">${painelSlot(UI.sel, min, mine)}</aside>` : ''}
    </div>`);

  const andar = (n) => {
    if (UI.faixa === 'dia') { const d = proxUtil(addDays(days[0], n), n); UI.dia = ymd(d); route(); }
    else if (UI.faixa === 'mes') { UI.mes += n; route(); }
    else { S.week += n; save(); route(); }
  };
  $('#prev').onclick = () => andar(-1);
  $('#next').onclick = () => andar(1);
  $('#hoje').onclick = () => { S.week = 0; UI.dia = null; UI.mes = 0; save(); route(); };
  document.querySelectorAll('[data-faixa]').forEach((b) => { b.onclick = () => { UI.faixa = b.dataset.faixa; route(); }; });
  document.querySelectorAll('.mc').forEach((b) => { b.onclick = () => { UI.faixa = 'dia'; UI.dia = b.dataset.dia; route(); }; });
  $('#avulsa').onclick = openAvulsa;
  document.querySelectorAll('[data-per]').forEach((b) => { b.onclick = () => { UI.per = b.dataset.per; route(); }; });
  document.querySelectorAll('[data-view]').forEach((b) => { b.onclick = () => { UI.view = b.dataset.view; route(); }; });
  document.querySelectorAll('.notif .mail-row').forEach((b) => { b.onclick = () => openEmail(b.dataset.em); });
  const pick = (el) => { UI.sel = { d: el.dataset.d, h: el.dataset.h }; route(); };
  document.querySelectorAll('.sc').forEach((el) => {
    el.onclick = () => pick(el);
    el.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(el); } };
  });
  const go = $('#go');
  if (go) go.onclick = () => { // com solicitação ativa, openSlot abre o detalhe dela
    const res = UI.res && UI.res.k === `${UI.sel.d}|${UI.sel.h}` ? UI.res : null;
    if (go.dataset.act !== 'sol' || !res) return openSlot(UI.sel.d, UI.sel.h);
    if (res.carga && !res.cargaTxt.trim()) { toast('Informe o que vai levar no porta-malas.'); const i = $('#rscgt'); if (i) i.focus(); return; }
    openSlot(UI.sel.d, UI.sel.h, { pax: 1 + res.acomp.length, acomp: res.acomp.slice(), carga: res.carga ? res.cargaTxt.trim() : '', bag: res.carga ? 'media' : 'nenhuma' });
  };
  const fecha = () => { UI.sel = null; route(); };
  const x = $('#detx'); if (x) x.onclick = fecha;
  const fundo = $('#detf'); if (fundo) fundo.onclick = fecha;
  ligarReserva();
  const pol = $('#pol'); if (pol) pol.onclick = (e) => { e.preventDefault(); openAjuda(); };
}

function trechoOptions(rt, sel) {
  const out = [];
  for (let i = 0; i < rt.length; i++) for (let j = i + 1; j < rt.length; j++) {
    const v = `${rt[i]}|${rt[j]}`;
    out.push(`<option value="${v}" ${v === sel ? 'selected' : ''}>${siteName(rt[i])} → ${siteName(rt[j])}</option>`);
  }
  return out.join('');
}
const siteOptions = (sel) => Object.entries(SITES).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('') + `<option value="OUTRO" ${sel === 'OUTRO' ? 'selected' : ''}>Outro (informar)</option>`;
const locOptions = (sel) => Object.entries(SITES).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}${SITE_APELIDO[k] ? ` (${SITE_APELIDO[k]})` : ''}</option>`).join('') + '<option value="OUTRO">Outro (informar)</option>';
const bagOptions = (sel) => Object.entries(BAG).map(([k, b]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${b.l}</option>`).join('');

// Retorno da grade: horários posteriores à ida cuja rota cobre o trecho da volta (de → para).
function retornoSlots(data, hora, rd, de, para, pax) {
  if (!rd || !isWeekday(at(rd, '12:00'))) return [];
  const min = minAllowedGrade();
  return grade().filter((g) => trechoOk(g.paradas, de, para) && at(rd, g.hora) > at(data, hora)).map((g) => {
    const occ = slotOcc(rd, g.hora);
    const meu = S.reqs.some((r) => r.email === S.user.email && r.tipo === 'grade' && r.data === rd && r.hora === g.hora && ATIVOS.includes(r.status));
    const why = at(rd, g.hora) < min ? 'fora do prazo' : meu ? 'você já tem solicitação' : occ + pax > SLOT_CAP ? 'sem vagas' : '';
    return { hora: g.hora, paradas: g.paradas, occ, why };
  });
}
const ESPERAS = [30, 60, 90, 120, 180, 240];
const fmtMin = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`);
const addMin = (hm, m) => { const [h, mi] = hm.split(':').map(Number); const t = h * 60 + mi + m; return `${pad(Math.floor(t / 60) % 24)}:${pad(t % 60)}`; };
const modoRet = () => { const r = document.querySelector('input[name="rm"]:checked'); return (r && r.value) || 'nao'; };
// Bloco de retorno compartilhado: Sem retorno · Bate-volta · Retorno em outro horário + "Voltar para".
function retornoHtml(kind) {
  const g = kind === 'grade';
  const op = (v, t, d, on) => `<label class="ret-o"><input type="radio" name="rm" value="${v}" ${on ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`;
  return `
      <div class="f full ret-box ${g ? '' : 'c-carro'}"><span class="ret-l">Retorno</span><div class="ret-opts">
        ${op('nao', 'Sem retorno', 'Somente ida', true)}
        ${op('bv', 'Bate-volta', g ? 'Volta no 1º horário da grade após o tempo no destino (contado da chegada)' : 'O motorista aguarda e traz de volta', false)}
        ${op('outro', 'Retorno em outro horário', g ? 'Escolha o horário de volta (mesmo dia)' : 'Nova corrida mais tarde, no mesmo dia', false)}
      </div></div>
      <div class="f r-bv" hidden><label for="rpe">Tempo no destino</label><select id="rpe">${ESPERAS.map((m) => `<option value="${m}" ${m === 60 ? 'selected' : ''}>até ${fmtMin(m)}</option>`).join('')}</select></div>
      <div class="f r-on" hidden><label for="rvo">Voltar para</label><select id="rvo"></select><input id="rvot" placeholder="Endereço / local de volta" hidden style="margin-top:6px"></div>
      <div class="f r-ou" hidden><label for="rth">Horário do retorno <small>(mesmo dia)</small></label>${g ? '<select id="rth"></select><input id="rtht" type="time" value="17:00" hidden>' : '<input id="rth" type="time" value="17:00">'}</div>
      <div class="f full r-on" hidden><div class="ret-info" id="rtinfo"></div></div>`;
}
const showRet = (m, off) => {
  document.querySelectorAll('.r-bv').forEach((e) => { e.hidden = off || m !== 'bv'; });
  document.querySelectorAll('.r-ou').forEach((e) => { e.hidden = off || m !== 'outro'; });
  document.querySelectorAll('.r-on').forEach((e) => { e.hidden = off || m === 'nao'; });
};
const parDe = (r) => r.par && S.reqs.find((x) => x.id === r.par);
const pernaTxt = (r) => (r.perna === 'ida' ? 'Ida' : r.perna === 'volta' ? 'Retorno' : r.bv ? 'Bate-volta' : '');
const bvTxt = (r) => (r.bv ? `Bate-volta: aguarda até ${fmtMin(r.bv.espera)} no destino e volta para ${siteName(r.bv.volta)}` : '');

function openSlot(data, hora, preset) {
  const existing = S.reqs.find((r) => r.email === S.user.email && r.tipo === 'grade' && r.data === data && r.hora === hora && ATIVOS.includes(r.status));
  if (existing) return openDetalhe(existing.id);
  const slot = slotOf(hora);
  if (!slot) { toast('Este horário não está mais ativo na grade.'); return; }
  const occ = slotOcc(data, hora);
  const p = preset || {};
  openModal(`
    <h3>Solicitar — ${esc(fmtDT(data, hora))}</h3>
    <p class="sub">Rota: ${esc(rotaTxt(slot.paradas))} · ocupação atual ${occ}/${capSlot(occ)} (${veicPrevisto(occ)})</p>
    <form id="sf" class="form-grid">
      <div class="f"><label>Solicitante</label><input readonly value="${esc(S.user.nome)}"></div>
      <div class="f"><label>Centro de custo</label><input readonly value="${esc(S.user.cc)}"><small>Carregado do cadastro corporativo</small></div>
      <div class="f full"><label for="tr">Trecho</label><select id="tr">${trechoOptions(slot.paradas, p.trecho)}</select></div>
      <div class="f"><label for="px">Passageiros</label><input id="px" type="number" min="1" max="${SLOT_CAP}" value="${esc(p.pax || 1)}"><small>Incluindo você. Até ${CAP_PADRAO}: carro · acima: Spin (máx. ${SLOT_CAP})</small></div>
      <div class="f"><label for="bg">Bagagem</label><select id="bg">${bagOptions(p.bag || 'nenhuma')}</select></div>
      ${p.acomp && p.acomp.length ? `<div class="f full"><label>Quem vai junto <small>(cada um no centro de custo do seu departamento)</small></label>
        <div class="acomp-l">${p.acomp.map((x) => `<span>${esc(x.nome)}<small>${esc(x.visitante ? 'visitante · seu centro de custo' : ccPartes(x.cc).dep || '—')}</small></span>`).join('')}</div>
        <input id="nm" type="hidden" value="${esc(p.acomp.map((x) => x.nome).join(', '))}"></div>`
      : `<div class="f full"><label for="nm">Nomes dos acompanhantes <small>(opcional)</small></label><input id="nm" value="${esc(p.nomes || '')}" placeholder="Ex.: Maria Santos, José Lima"></div>`}
      ${p.carga ? `<div class="f full"><label>Carga no porta-malas</label><input readonly value="${esc(p.carga)}"></div>` : ''}
      <div class="f full"><label for="js">Justificativa</label><textarea id="js" placeholder="Motivo do deslocamento">${esc(p.just || '')}</textarea></div>
      ${retornoHtml('grade')}
    </form>
    <div id="sfmsg"></div>
    <div class="modal-acts"><button class="btn" id="cx">Cancelar</button><button class="btn green" id="ok">Enviar solicitação</button></div>`);
  $('#cx').onclick = closeModal;
  // Volta pela grade: de = destino da ida; para = unidade escolhida em "Voltar para".
  const pax0 = () => parseInt($('#px').value, 10) || 1;
  const bvSlot = () => { // bate-volta: 1º horário livre no mesmo dia após o tempo no destino
    const [, d] = $('#tr').value.split('|');
    const lim = at(data, addMin(chegadaDe(hora) || hora, Number($('#rpe').value))); // conta a partir da chegada
    return retornoSlots(data, hora, data, d, $('#rvo').value, pax0()).find((s) => !s.why && at(data, s.hora) >= lim);
  };
  const lerRet = () => { const [, d] = $('#tr').value.split('|'); return retornoSlots(data, hora, data, d, $('#rvo').value, pax0()); };
  const syncRet = () => {
    const m = modoRet();
    showRet(m, false);
    if (m === 'nao') return;
    const [o, d] = $('#tr').value.split('|');
    const prevV = $('#rvo').value;
    const opts = [...Object.keys(SITES).filter((k) => k !== d), 'OUTRO'];
    const vSel = opts.includes(prevV) ? prevV : o;
    $('#rvo').innerHTML = opts.map((k) => `<option value="${k}" ${k === vSel ? 'selected' : ''}>${k === 'OUTRO' ? 'Outro (informar)' : esc(siteName(k))}</option>`).join('');
    const volta = vSel;
    const fora = volta === 'OUTRO'; // fora da grade: a volta vira táxi na cidade
    $('#rvot').hidden = !fora;
    $('#rth').hidden = fora; $('#rtht').hidden = !fora;
    if (fora) {
      const txt = $('#rvot').value.trim() || 'endereço informado';
      const hTaxi = m === 'bv' ? addMin(chegadaDe(hora) || hora, Number($('#rpe').value)) : $('#rtht').value;
      $('#rtinfo').innerHTML = `Volta de <b>táxi na cidade</b>: ${esc(siteName(d))} → <b>${esc(txt)}</b> às <b>${esc(hTaxi || '--:--')}</b> (fora da grade).`;
      return;
    }
    if (m === 'bv') {
      const s = bvSlot();
      $('#rtinfo').innerHTML = s ? `Volta <b>${esc(siteName(d))} → ${esc(siteName(volta))}</b> às <b>${s.hora}</b> — 1º horário da grade após ${fmtMin(Number($('#rpe').value))} no destino (chegada prevista até ${esc(chegadaDe(hora) || hora)}).`
        : `<span class="bad-t">Nenhum horário da grade de ${esc(siteName(d))} para ${esc(siteName(volta))} neste dia depois de ${fmtMin(Number($('#rpe').value))}. Escolha “Retorno em outro horário”.</span>`;
      return;
    }
    const ls = lerRet();
    const prev = $('#rth').value;
    const firstOk = (ls.find((s) => !s.why) || {}).hora;
    // "Outro horário": fora da grade → volta de táxi na cidade, no horário que a pessoa informar
    const sel = prev === 'OUTRO' || !firstOk ? 'OUTRO' : ls.some((x) => x.hora === prev && !x.why) ? prev : firstOk;
    $('#rth').innerHTML = ls.map((s) => `<option value="${s.hora}" ${s.why ? 'disabled' : ''} ${s.hora === sel ? 'selected' : ''}>${s.hora} — ${esc(rotaTxt(s.paradas, true))}${s.why ? ` (${s.why})` : ` · ${capSlot(s.occ) - s.occ} vagas`}</option>`).join('')
      + `<option value="OUTRO" ${sel === 'OUTRO' ? 'selected' : ''}>Outro horário (informar) — táxi</option>`;
    const taxiH = sel === 'OUTRO';
    $('#rtht').hidden = !taxiH;
    $('#rtinfo').innerHTML = taxiH
      ? `Volta de <b>táxi na cidade</b>: ${esc(siteName(d))} → <b>${esc(siteName(volta))}</b> às <b>${esc($('#rtht').value || '--:--')}</b> (fora dos horários da grade).`
      : `Volta: <b>${esc(siteName(d))} → ${esc(siteName(volta))}</b>`;
  };
  document.querySelectorAll('input[name="rm"]').forEach((e) => { e.onchange = syncRet; });
  ['#tr', '#px', '#rvo', '#rpe', '#rtht', '#rth'].forEach((s) => { $(s).onchange = syncRet; });
  $('#rvot').oninput = syncRet;
  $('#ok').onclick = () => {
    const [origem, destino] = $('#tr').value.split('|');
    const pax = parseInt($('#px').value, 10);
    const form = { trecho: $('#tr').value, pax, bag: $('#bg').value, nomes: $('#nm').value.trim(), just: $('#js').value.trim() };
    const msg = $('#sfmsg');
    if (!Number.isInteger(pax) || pax < 1 || pax > SLOT_CAP) { msg.innerHTML = `<div class="msg-box bad">Informe entre 1 e ${SLOT_CAP} passageiros.</div>`; return; }
    const nAc = p.acomp ? p.acomp.length : 0;
    if (pax < 1 + nAc) { msg.innerHTML = `<div class="msg-box bad">São ${1 + nAc} pessoas na reserva (você + ${nAc}). Informe pelo menos ${1 + nAc} passageiros.</div>`; return; }
    if (p.acomp) form.acomp = p.acomp;
    if (p.carga) form.carga = p.carga;
    if (!form.just) { msg.innerHTML = '<div class="msg-box bad">Informe a justificativa.</div>'; return; }
    if (at(data, hora) < minAllowedGrade()) { msg.innerHTML = '<div class="msg-box bad">Este horário não respeita a antecedência mínima de 1 hora / regra de expediente.</div>'; return; }
    if (slotOcc(data, hora) + pax > SLOT_CAP) {
      const alt = nextCompatibleSlot(data, hora, origem, destino, pax);
      msg.innerHTML = `<div class="msg-box warn"><b>Sem vagas suficientes neste horário</b> (${slotOcc(data, hora)}/${SLOT_CAP} + ${pax}).
        ${alt ? `Próximo horário compatível: <b>${esc(fmtDT(alt.data, alt.hora))}</b>.<div class="modal-acts"><button class="btn navy" id="alt">Solicitar em ${esc(fmtDT(alt.data, alt.hora))}</button></div>` : 'Nenhum horário compatível nos próximos dias — use a solicitação avulsa.'}</div>`;
      if (alt) $('#alt').onclick = () => openSlot(alt.data, alt.hora, form);
      return;
    }
    let ret = null;
    const modo = modoRet();
    if (modo !== 'nao') {
      const volta = $('#rvo').value;
      if (volta === 'OUTRO') {
        const txt = $('#rvot').value.trim();
        if (!txt) { msg.innerHTML = '<div class="msg-box bad">Informe o endereço/local de volta.</div>'; return; }
        if (normLoc(txt) === destino) { msg.innerHTML = '<div class="msg-box bad">A volta precisa ser para um local diferente do destino da ida.</div>'; return; }
        const espera = Number($('#rpe').value);
        const hT = modo === 'bv' ? addMin(chegadaDe(hora) || hora, espera) : $('#rtht').value;
        if (!hT || at(data, hT) <= at(data, hora) || hT < hora) { msg.innerHTML = '<div class="msg-box bad">O horário de retorno precisa ser depois da ida, no mesmo dia.</div>'; return; }
        ret = { data, hora: hT, volta: txt, taxi: true, bv: modo === 'bv' ? { espera, volta: txt } : null };
      } else if (!SITES[volta] || volta === destino) { msg.innerHTML = '<div class="msg-box bad">Escolha para qual unidade voltar (diferente do destino da ida).</div>'; return; }
      else if (modo === 'bv') {
        const s = bvSlot();
        if (!s) { msg.innerHTML = '<div class="msg-box bad">Não há horário de volta na grade para esse bate-volta. Escolha “Retorno em outro horário”.</div>'; return; }
        ret = { data, hora: s.hora, volta, bv: { espera: Number($('#rpe').value), volta } };
      } else {
        const rh = $('#rth').value;
        if (rh === 'OUTRO') {
          const hT = $('#rtht').value;
          if (!hT || hT <= hora) { msg.innerHTML = '<div class="msg-box bad">O horário de retorno precisa ser depois da ida, no mesmo dia.</div>'; return; }
          ret = { data, hora: hT, volta, taxi: true };
        } else {
          const s = lerRet().find((x) => x.hora === rh);
          if (!rh || !s) { msg.innerHTML = '<div class="msg-box bad">Escolha um horário de retorno disponível.</div>'; return; }
          if (s.why) { msg.innerHTML = `<div class="msg-box bad">Retorno às ${esc(rh)} indisponível: ${esc(s.why)}.</div>`; return; }
          ret = { data, hora: rh, volta };
        }
      }
    }
    const novo = (d, h, o, de) => ({
      id: newReqId(), tipo: 'grade', nome: S.user.nome, email: S.user.email, cc: S.user.cc, data: d, hora: h, origem: o, destino: de, pax, bag: form.bag,
      nomes: form.nomes, just: form.just, status: 'analise', veiculo: null, motorista: null, os: null, excecao: false, motivo: '', criado: nowStamp(),
      ...(form.acomp && form.acomp.length ? { acomp: form.acomp.map((x) => ({ nome: x.nome, email: x.email || '', cc: x.visitante ? S.user.cc : x.cc || '', visitante: !!x.visitante })) } : {}),
      ...(form.carga ? { carga: form.carga } : {}),
    });
    const r = novo(data, hora, origem, destino);
    S.reqs.push(r);
    audit('Solicitação criada', r.id, '', `${TIPOS.grade} ${fmtDT(data, hora)} · ${pax} pax`);
    if (ret) {
      const r2 = novo(ret.data, ret.hora, destino, ret.volta);
      Object.assign(r, { perna: 'ida', par: r2.id }); Object.assign(r2, { perna: 'volta', par: r.id });
      if (ret.taxi) r2.tipo = 'cidade'; // volta para fora da grade = táxi na cidade
      if (ret.bv) { r.bv = ret.bv; if (!ret.taxi) r2.bv = ret.bv; }
      S.reqs.push(r2);
      audit('Solicitação criada (retorno)', r2.id, '', `${TIPOS[r2.tipo]} ${fmtDT(ret.data, ret.hora)} · retorno de ${r.id}`);
    }
    UI.res = null; UI.sel = null;
    save(); closeModal(); route();
    toast(ret ?`${r.id} (ida) e ${r.par} (retorno) enviadas — aguardando análise.` : `${r.id} enviada — aguardando análise do Facilities.`);
  };
}

function openAvulsa() {
  const minDate = ymd(new Date());
  openModal(`
    <h3>Solicitação avulsa</h3>
    <p class="sub">Táxi na cidade, intermunicipal ou moto táxi.</p>
    <form class="form-grid">
      <div class="f full"><label for="tp">Tipo</label><select id="tp">
        <option value="cidade">Táxi na cidade (antecedência mín. 1 h)</option>
        <option value="inter">Táxi intermunicipal (antecedência mín. 48 h)</option>
        <option value="moto">Moto Táxi (antecedência a definir — DEC-14)</option></select></div>
      <div class="f"><label for="dt">Data</label><input id="dt" type="date" min="${minDate}" value="${minDate}"></div>
      <div class="f"><label for="hr" id="hrl">Horário de embarque</label><input id="hr" type="time" value="${pad((new Date().getHours() + 2) % 24)}:00"></div>
      <div class="f c-carro"><label for="og">Origem</label><select id="og">${siteOptions('MED')}</select><input id="ogt" placeholder="Endereço / local de embarque" hidden style="margin-top:6px"></div>
      <div class="f c-carro"><label for="ds">Destino</label><select id="ds">${siteOptions('OUTRO')}</select><input id="dst" placeholder="Endereço / local de destino" style="margin-top:6px"></div>
      <div class="f c-carro"><label for="px">Passageiros</label><input id="px" type="number" min="1" max="7" value="1"></div>
      <div class="f c-carro"><label for="bg">Bagagem</label><select id="bg">${bagOptions('nenhuma')}</select></div>
      ${retornoHtml('avulsa')}
      <div class="f c-moto" hidden><label for="mo">Retirar em</label><select id="mo">${locOptions('MED')}</select><input id="mot" placeholder="Endereço / local de retirada" hidden style="margin-top:6px"></div>
      <div class="f c-moto" hidden><label for="md">Entregar em</label><select id="md">${locOptions('CD')}</select><input id="mdt" placeholder="Endereço / local de entrega" hidden style="margin-top:6px"></div>
      <div class="f full c-moto" hidden><label for="mi">O que será enviado?</label><input id="mi" placeholder="Ex.: envelope com notas fiscais, caixa de amostras, documentos para assinatura"></div>
      <div class="f c-moto" hidden><label for="mv">Quantidade de volumes</label><input id="mv" type="number" min="1" max="20" value="1"></div>
      <div class="f c-moto" hidden><label for="mt2">Tamanho</label><select id="mt2">${Object.entries(ITEM_TAM).map(([k, t]) => `<option value="${k}">${t.l}</option>`).join('')}</select></div>
      <div class="f full c-moto" hidden><label for="mr">Quem recebe no destino?</label><input id="mr" placeholder="Nome ou setor de quem recebe"></div>
      <div class="f full"><label for="js">Justificativa</label><textarea id="js"></textarea></div>
      <div class="f full" id="gnote" hidden><div class="msg-box warn" style="margin:0">Este pedido precisa da <b>aprovação do seu gestor imediato</b> (${esc(chefeDe().nome)}, conforme o AD) antes de ir para o Facilities.</div></div>
      <div class="f full" id="exc" hidden><label class="check"><input type="checkbox" id="exck"> <span>Solicitar como <b>exceção</b> ao prazo (requer autorização do Facilities — DEC-12)</span></label></div>
    </form>
    <div id="avmsg"></div>
    <div class="modal-acts"><button class="btn" id="cx">Cancelar</button><button class="btn green" id="ok">Enviar solicitação</button></div>`);
  const syncTipo = () => {
    const moto = $('#tp').value === 'moto';
    document.querySelectorAll('.c-moto').forEach((e) => { e.hidden = !moto; });
    document.querySelectorAll('.c-carro').forEach((e) => { e.hidden = moto; });
    $('#hrl').textContent = moto ? 'Horário de retirada' : 'Horário de embarque';
    $('#gnote').hidden = $('#tp').value !== 'inter';
    syncARet();
  };
  $('#rvo').innerHTML = siteOptions('MED');
  let rvoTocado = false;
  function syncARet() {
    const m = modoRet(), moto = $('#tp').value === 'moto';
    showRet(m, moto);
    if (moto || m === 'nao') return;
    if (!rvoTocado) $('#rvo').value = $('#og').value; // padrão: voltar para onde embarcou
    $('#rvot').hidden = $('#rvo').value !== 'OUTRO';
    const de = valLoc('#ds', '#dst') || 'destino', para = valLoc('#rvo', '#rvot') || '—';
    const esp = Number($('#rpe').value);
    $('#rtinfo').innerHTML = m === 'bv'
      ? `O motorista aguarda até <b>${fmtMin(esp)}</b> em <b>${esc(siteName(de))}</b> e leva para <b>${esc(siteName(para))}</b>. Volta prevista por volta das <b>${esc(addMin($('#hr').value || '00:00', esp + DURACAO_MIN))}</b>.`
      : `Volta: <b>${esc(siteName(de))} → ${esc(siteName(para))}</b>`;
  }
  document.querySelectorAll('input[name="rm"]').forEach((e) => { e.onchange = syncARet; });
  $('#rvo').onchange = () => { rvoTocado = true; syncARet(); };
  ['#rpe', '#hr', '#dt'].forEach((s) => { $(s).onchange = syncARet; });
  ['#dst', '#rvot'].forEach((s) => { $(s).oninput = syncARet; });
  const PARES = [['#mo', '#mot'], ['#md', '#mdt'], ['#og', '#ogt'], ['#ds', '#dst']];
  const syncOutro = () => PARES.forEach(([s, t]) => { $(t).hidden = $(s).value !== 'OUTRO'; });
  const valLoc = (s, t) => ($(s).value === 'OUTRO' ? $(t).value.trim() : $(s).value);
  $('#tp').onchange = () => { syncTipo(); $('#exc').hidden = true; $('#avmsg').innerHTML = ''; };
  PARES.forEach(([s]) => { $(s).onchange = () => { syncOutro(); syncARet(); }; });
  $('#cx').onclick = closeModal;
  $('#ok').onclick = () => {
    const tipo = $('#tp').value, data = $('#dt').value, hora = $('#hr').value;
    const just = $('#js').value.trim();
    const msg = $('#avmsg');
    const bad = (t) => { msg.innerHTML = `<div class="msg-box bad">${t}</div>`; };
    let campos;
    if (tipo === 'moto') {
      const origem = valLoc('#mo', '#mot');
      const destino = valLoc('#md', '#mdt');
      const vol = parseInt($('#mv').value, 10), tam = $('#mt2').value;
      const it = $('#mi').value.trim(), recebedor = $('#mr').value.trim();
      if (!data || !hora || !origem || !destino || !it || !recebedor || !just) return bad('Preencha data, horário, retirada, entrega, o que será enviado, quem recebe e a justificativa.');
      if (normLoc(origem) === normLoc(destino)) return bad('Retirada e entrega devem ser locais diferentes.');
      if (!Number.isInteger(vol) || vol < 1 || vol > 20) return bad('Volumes: entre 1 e 20.');
      if (ITEM_TAM[tam].p * vol > MOTO_CARGA) return bad(`Não cabe em uma moto (${ITEM_TAM[tam].p * vol} de ${MOTO_CARGA} pts de carga). Divida o envio ou solicite um táxi.`);
      campos = { origem, destino, item: it, vol, tam, recebedor, pax: 0, bag: 'nenhuma' };
    } else {
      const origem = valLoc('#og', '#ogt');
      const destino = valLoc('#ds', '#dst');
      const pax = parseInt($('#px').value, 10);
      if (!data || !hora || !origem || !destino || !just) return bad('Preencha data, horário, origem, destino e justificativa.');
      if (normLoc(origem) === normLoc(destino)) return bad('Origem e destino devem ser locais diferentes.');
      if (!Number.isInteger(pax) || pax < 1 || pax > 7) return bad('Passageiros: entre 1 e 7.');
      campos = { origem, destino, pax, bag: $('#bg').value };
    }
    let ret = null;
    const modo = tipo === 'moto' ? 'nao' : modoRet();
    if (modo !== 'nao') {
      const volta = valLoc('#rvo', '#rvot');
      if (!volta) return bad('Informe para onde voltar.');
      if (normLoc(volta) === normLoc(campos.destino)) return bad('A volta precisa ser para um local diferente do destino da ida.');
      if (modo === 'bv') ret = { bv: { espera: Number($('#rpe').value), volta } };
      else {
        const rh = $('#rth').value;
        if (!rh) return bad('Informe o horário do retorno.');
        if (rh <= hora) return bad('O retorno precisa ser depois da ida, no mesmo dia.');
        ret = { data, hora: rh, volta };
      }
    }
    const diffMin = (at(data, hora) - new Date()) / 60000;
    if (diffMin < 0) { msg.innerHTML = '<div class="msg-box bad">Data/horário no passado.</div>'; return; }
    const need = ANTEC_MIN[tipo];
    let excecao = false;
    if (need != null && diffMin < need) {
      if (!$('#exck').checked) {
        $('#exc').hidden = false;
        msg.innerHTML = `<div class="msg-box warn">Antecedência mínima para <b>${esc(TIPOS[tipo])}</b> é de ${need >= 60 ? need / 60 + ' h' : need + ' min'}. Faltam só ${Math.max(0, Math.floor(diffMin / 60))} h ${Math.max(0, Math.floor(diffMin % 60))} min. Escolha outro horário ou marque como exceção.</div>`;
        return;
      }
      excecao = true;
    }
    const r = {
      id: newReqId(), tipo, nome: S.user.nome, email: S.user.email, cc: S.user.cc, data, hora, ...campos,
      just, status: 'analise', veiculo: null, motorista: null, os: null, excecao, motivo: '', criado: nowStamp(),
    };
    if (ret && ret.bv) { r.bv = ret.bv; ret = null; } // bate-volta avulso = uma corrida só (motorista aguarda)
    if (precisaGestor(r)) Object.assign(r, { status: 'gestor', gestor: { ...chefeDe() }, aprovPedido: nowStamp() });
    S.reqs.push(r);
    if (r.gestor) pedirAprovacao(r);
    audit('Solicitação criada', r.id, '', `${TIPOS[tipo]} ${fmtDT(data, hora)}${excecao ? ' · EXCEÇÃO de prazo' : ''}`);
    if (ret) {
      const r2 = { ...r, id: newReqId(), data: ret.data, hora: ret.hora, origem: r.destino, destino: ret.volta, excecao: false, perna: 'volta', par: r.id };
      Object.assign(r, { perna: 'ida', par: r2.id });
      S.reqs.push(r2);
      audit('Solicitação criada (retorno)', r2.id, '', `${TIPOS[tipo]} ${fmtDT(ret.data, ret.hora)} · retorno de ${r.id}`);
    }
    save(); closeModal(); route();
    toast(r.gestor ? `${r.id} enviada para aprovação do seu gestor (${r.gestor.nome}).`
      : ret ? `${r.id} (ida) e ${r.par} (retorno) enviadas — aguardando análise.` : `${r.id} enviada${r.bv ? ' (bate-volta)' : ''}${excecao ? ' como exceção' : ''} — aguardando análise.`);
  };
}

function openDetalhe(id) {
  const r = S.reqs.find((x) => x.id === id);
  const v = veic(r.veiculo), m = mot(r.motorista);
  const canCancel = S.user.role === 'colaborador' && ['analise', 'gestor'].includes(r.status);
  const par = parDe(r);
  openModal(`
    <h3>${esc(r.id)} ${pill(r.status)}</h3>
    <p class="sub">${esc(TIPOS[r.tipo])}${pernaTxt(r) ? ` · <b>${pernaTxt(r)}${r.bv && r.perna ? ' (bate-volta)' : ''}</b>` : ''}${r.excecao ? ' · <b>exceção de prazo</b>' : ''} · criada em ${esc(r.criado)}</p>
    ${par ? `<div class="par-box">${r.perna === 'ida' ? 'Retorno' : 'Ida'}: <b>${esc(par.id)}</b> · ${esc(fmtDT(par.data, par.hora))} · ${esc(siteName(par.origem))} → ${esc(siteName(par.destino))} ${pill(par.status)}
      <button class="btn sm" id="vpar">Ver</button></div>` : ''}
    <div class="form-grid">
      <div class="f"><label>Data/horário</label><div>${esc(fmtDT(r.data, r.hora))}</div></div>
      <div class="f"><label>Trecho</label><div>${esc(siteName(r.origem))} → ${esc(siteName(r.destino))}</div></div>
      ${r.tipo === 'moto' ? `
      <div class="f full"><label>O que será enviado</label><div>${esc(r.item)} — ${esc(r.vol)} volume(s), ${esc(ITEM_TAM[r.tam].l)}</div></div>
      <div class="f full"><label>Quem recebe</label><div>${esc(r.recebedor)}</div></div>` : `
      <div class="f"><label>Passageiros</label><div>${esc(r.pax)}${r.acomp && r.acomp.length ? ` <small>(${r.acomp.map((x) => `${esc(x.nome)} — ${esc(x.visitante ? 'visitante' : ccPartes(x.cc).dep || 'sem setor')}`).join('; ')})</small>` : r.nomes ? ` <small>(${esc(r.nomes)})</small>` : ''}</div></div>
      ${r.carga ? `<div class="f"><label>Carga no porta-malas</label><div>${esc(r.carga)}</div></div>` : ''}
      <div class="f"><label>Bagagem</label><div>${esc(BAG[r.bag].l)}</div></div>`}
      <div class="f"><label>Veículo</label><div>${v ? `${esc(v.nome)} · ${esc(v.placa)}` : '<small>A definir pelo Facilities</small>'}</div></div>
      <div class="f"><label>Motorista</label><div>${m ? esc(m.nome) : '<small>A definir pelo Facilities</small>'}</div></div>
      ${r.bv && !r.perna ? `<div class="f full"><label>Retorno</label><div>${esc(bvTxt(r))} · volta prevista ~${esc(addMin(r.hora, r.bv.espera + DURACAO_MIN))}</div></div>` : ''}
      ${r.gestor ? `<div class="f full"><label>Aprovação do gestor imediato (AD)</label><div>${esc(r.gestor.nome)} · ${r.aprov ? (r.aprov.ok ? `✓ aprovada em ${esc(r.aprov.quando)}` : `✕ reprovada em ${esc(r.aprov.quando)}${r.aprov.motivo ? ` — ${esc(r.aprov.motivo)}` : ''}`) : 'aguardando resposta'}</div></div>` : ''}
      ${r.mail ? `<div class="f full"><label>Aviso por e-mail</label><div>✉ Último aviso enviado para ${esc(r.email)} em ${esc(r.mail)}</div></div>` : ''}
      ${r.os ? `<div class="f full"><label>Ordem de serviço</label><div><b>${esc(r.os)}</b></div></div>` : ''}
      <div class="f full"><label>Justificativa</label><div>${esc(r.just)}</div></div>
      ${r.motivo ? `<div class="f full"><label>Motivo / observação do Facilities</label><div>${esc(r.motivo)}</div></div>` : ''}
    </div>
    <div class="modal-acts">${canCancel ? '<button class="btn red" id="cancel">Cancelar solicitação</button>' : ''}<button class="btn" id="cx">Fechar</button></div>`);
  $('#cx').onclick = closeModal;
  if (par) $('#vpar').onclick = () => openDetalhe(par.id);
  if (canCancel) $('#cancel').onclick = () => {
    const alvo = [r];
    if (par && ['analise', 'gestor'].includes(par.status) && confirm(`Cancelar também ${r.perna === 'ida' ? 'o retorno' : 'a ida'} ${par.id}?`)) alvo.push(par);
    alvo.forEach((x) => { audit('Cancelada pelo solicitante', x.id, STATUS[x.status], 'Cancelada'); x.status = 'cancelada'; x.motivo = 'Cancelada pelo solicitante'; });
    save(); closeModal(); route(); toast(`${alvo.map((x) => x.id).join(' e ')} cancelada${alvo.length > 1 ? 's' : ''}.`);
  };
}

function renderMinhas(page) {
  const mine = S.reqs.filter((r) => r.email === S.user.email).sort((a, b) => at(b.data, b.hora) - at(a.data, a.hora));
  shell(page, `
    <div class="page-head"><div><h1>Minhas solicitações</h1><p>Acompanhe o status. Cancelamento disponível enquanto estiver em análise (política em definição — DEC-13).</p></div>
      <button class="btn green" id="avulsa">+ Solicitação avulsa</button></div>
    <div class="card table-wrap">${mine.length ? `<table><thead><tr><th>Nº</th><th>Tipo</th><th>Quando</th><th>Trecho</th><th>Passageiros / itens</th><th>Status</th><th></th></tr></thead><tbody>
      ${mine.map((r) => `<tr><td><b>${esc(r.id)}</b>${r.os ? `<small>${esc(r.os)}</small>` : ''}</td><td><span class="tipo">${esc(TIPOS[r.tipo])}</span>${r.perna ? `<small>${pernaTxt(r)} · par ${esc(r.par)}</small>` : r.bv ? '<small>Bate-volta</small>' : ''}</td>
        <td>${esc(fmtDT(r.data, r.hora))}</td><td>${esc(siteName(r.origem))} → ${esc(siteName(r.destino))}</td><td>${esc(resumo(r))}</td><td>${pill(r.status)}${r.mail ? `<small>✉ aviso enviado por e-mail</small>` : ""}</td>
        <td><button class="btn sm" data-id="${esc(r.id)}">Detalhes</button></td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Você ainda não fez solicitações. Vá até a <a href="#agenda">Agenda</a> e escolha um horário.</div>'}</div>`);
  $('#avulsa').onclick = openAvulsa;
  document.querySelectorAll('[data-id]').forEach((b) => { b.onclick = () => openDetalhe(b.dataset.id); });
}

// ---------------- Facilities ----------------
function vehicleOptions(tipo, pax, bagPts, data, hora, ignoreIds, dur) {
  const vs = VEICULOS.filter((v) => v.tipo === tipo);
  const ok = (v) => v.cap >= pax && v.bag >= bagPts && !busy('veiculo', v.id, data, hora, ignoreIds, dur);
  // padrão: o menor veículo que comporta — a Spin só é sugerida quando passa de 4 passageiros
  const best = vs.filter(ok).sort((x, y) => x.cap - y.cap || x.bag - y.bag)[0];
  return vs.map((v) => {
    const fits = v.cap >= pax && v.bag >= bagPts;
    const occ = busy('veiculo', v.id, data, hora, ignoreIds, dur);
    const why = !fits ? (v.cap < pax ? ' — capacidade insuficiente' : ' — porta-malas insuficiente') : occ ? ' — já alocado neste horário' : '';
    const cap = v.tipo === 'moto' ? `carga ${v.bag} pts` : `${v.cap} pax · bag ${v.bag}`;
    return `<option value="${v.id}" ${!fits || occ ? 'disabled' : ''}${best && best.id === v.id ? ' selected' : ''}>${esc(v.nome)} (${cap})${v.tipo === 'moto' && !fits ? ' — carga insuficiente' : why}</option>`;
  }).join('');
}
function driverOptions(tipo, data, hora, ignoreIds, dur) {
  const list = S.motoristas.filter((m) => m.tipo === tipo && m.ativo);
  if (!list.length) return '<option value="" disabled selected>Nenhum motorista ativo — cadastre em “Motoristas”</option>';
  return list.map((m) => {
    const occ = busy('motorista', m.id, data, hora, ignoreIds, dur);
    return `<option value="${m.id}" ${occ ? 'disabled' : ''}>${esc(m.nome)}${occ ? ' — ocupado' : ''}</option>`;
  }).join('');
}

function renderPainel(page) {
  const pend = S.reqs.filter((r) => r.status === 'analise');
  const today = ymd(new Date());
  const confHoje = S.reqs.filter((r) => r.data === today && ['confirmada', 'andamento', 'concluida'].includes(r.status));
  const gradeConf = S.reqs.filter((r) => r.tipo === 'grade' && r.status === 'confirmada' && r.veiculo);
  const occAvg = gradeConf.length ? Math.round(gradeConf.reduce((s, r) => s + r.pax / veic(r.veiculo).cap, 0) / gradeConf.length * 100) : 0;
  const aEnviar = viagens().filter((v) => v.st === 'enviar').length;

  // agrupamento por horário da grade
  const groups = {};
  pend.filter((r) => r.tipo === 'grade').forEach((r) => { (groups[`${r.data} ${r.hora}`] ||= []).push(r); });
  const groupKeys = Object.keys(groups).sort();
  const groupHtml = groupKeys.map((k) => {
    const rs = groups[k]; const [data, hora] = k.split(' ');
    const pax = rs.reduce((s, r) => s + r.pax, 0);
    const bagPts = rs.reduce((s, r) => s + BAG[r.bag].p, 0);
    const ids = rs.map((r) => r.id);
    const anyVeh = VEICULOS.some((v) => v.tipo === 'carro' && v.cap >= pax && v.bag >= bagPts && !busy('veiculo', v.id, data, hora, ids));
    const setores = [...new Set(rs.map((r) => r.cc.split('–')[1]?.trim() || r.cc))];
    return `<div class="group ${anyVeh ? 'ok' : 'bad'}" data-k="${esc(k)}">
      <div class="group-h"><b>${esc(fmtDT(data, hora))}</b><span class="tipo">${rs.length > 1 ? `Sugestão de agrupamento: ${esc(setores.join(' + '))}` : 'Solicitação única'}</span></div>
      <ul>${rs.map((r) => `<li><span><b>${esc(r.id)}</b> · ${esc(r.nome)} <small style="display:inline;color:var(--muted)">(${esc(r.cc)})</small>${r.perna ? ` <span class="tag">${pernaTxt(r)} · ${esc(r.par)}</span>` : ''}</span><span>${esc(SITE_SHORT[r.origem])}→${esc(SITE_SHORT[r.destino])} · ${r.pax} pax · ${esc(BAG[r.bag].l.split(' ')[0])}</span></li>`).join('')}</ul>
      <div class="meter"><span>Total: <b>${pax} passageiros</b></span><span>Bagagem: <b>${bagPts} pts</b></span><span>Veículo: <b>${pax > CAP_PADRAO ? 'Spin (passou de ' + CAP_PADRAO + ')' : 'carro de ' + CAP_PADRAO + ' vagas'}</b></span></div>
      ${anyVeh ? `<div class="assign"><select class="sv">${vehicleOptions('carro', pax, bagPts, data, hora, ids)}</select><select class="sd">${driverOptions('carro', data, hora, ids)}</select>
        <button class="btn green sm ok-g">Confirmar ${rs.length > 1 ? 'grupo' : ''}</button><button class="btn sm red no-g">Recusar</button></div>`
      : `<div class="alert">Nenhum veículo comporta ${pax} passageiros / ${bagPts} pts de bagagem. Separe as solicitações ou sugira o próximo horário.</div>
         <div class="assign">${rs.map((r) => `<button class="btn sm mv" data-id="${esc(r.id)}">Mover ${esc(r.id)} p/ próximo horário</button>`).join('')}</div>`}
    </div>`;
  }).join('') || '<div class="empty">Nenhuma solicitação da grade pendente.</div>';

  // Moto Táxi: envios com mesmo dia, mesma retirada e mesma entrega, dentro da janela, que cabem em uma moto
  const clusters = motoClusters(pend);
  const motoHtml = clusters.map((c, i) => {
    const ids = c.rs.map((r) => r.id);
    const horas = [...new Set(c.rs.map((r) => r.hora))].sort();
    const saida = horas[horas.length - 1];
    const varios = c.rs.length > 1;
    return `<div class="group ok" data-m="${i}">
      <div class="group-h"><b>${esc(fmtDay(at(c.data, '00:00')))} · ${esc(siteName(c.origem))} → ${esc(siteName(c.destino))}</b>
        <span class="tipo">${varios ? `Sugestão: ${c.rs.length} envios em 1 viagem` : 'Envio único'}</span></div>
      <ul>${c.rs.map((r) => `<li><span><b>${esc(r.id)}</b> · ${esc(r.hora)} · ${esc(r.nome)} <small style="display:inline;color:var(--muted)">(${esc(r.cc)})</small><br>
          📦 ${esc(resumo(r))} → recebe: ${esc(r.recebedor)}${r.excecao ? ' · <b style="color:var(--red)">fora do prazo</b>' : ''}</span>
          ${varios ? `<button class="btn sm red rx" data-id="${esc(r.id)}">Recusar este</button>` : ''}</li>`).join('')}</ul>
      <div class="meter"><span>Carga: <b>${c.pts}/${MOTO_CARGA} pts</b></span>${varios ? `<span>Pedidos entre <b>${horas[0]}</b> e <b>${saida}</b></span>` : ''}</div>
      <div class="assign">
        <label class="f" style="display:flex;align-items:center;gap:6px;margin:0"><small>Saída</small><select class="sh">${horas.map((h) => `<option ${h === saida ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
        <select class="sv">${vehicleOptions('moto', 0, c.pts, c.data, saida, ids)}</select><select class="sd">${driverOptions('moto', c.data, saida, ids)}</select>
        <button class="btn green sm ok-m">${varios ? 'Agrupar e gerar OS' : 'Aprovar e gerar OS'}</button><button class="btn sm red no-m">Recusar${varios ? ' todos' : ''}</button></div>
    </div>`;
  }).join('') || '<div class="empty">Nenhum envio de Moto Táxi pendente.</div>';

  const av = pend.filter((r) => r.tipo !== 'grade' && r.tipo !== 'moto').sort((a, b) => at(a.data, a.hora) - at(b.data, b.hora));
  const avHtml = av.map((r) => {
    const t = r.tipo === 'moto' ? 'moto' : 'carro';
    return `<div class="group" data-id="${esc(r.id)}">
      <div class="group-h"><b>${esc(r.id)} · ${esc(TIPOS[r.tipo])}</b><span>${esc(fmtDT(r.data, r.hora))}</span></div>
      <ul><li><span>${esc(r.nome)} <small style="display:inline;color:var(--muted)">(${esc(r.cc)})</small></span><span>${r.pax} pax · ${esc(BAG[r.bag].l.split(' ')[0])}</span></li>
        <li><span>${esc(siteName(r.origem))} → ${esc(siteName(r.destino))}${r.perna ? ` <span class="tag">${pernaTxt(r)} · ${esc(r.par)}</span>` : ''}</span></li>
        ${r.bv ? `<li><span><b>🔁 ${esc(bvTxt(r))}</b> — veículo e motorista ficam reservados ~${fmtMin(durOf(r))}</span></li>` : ''}<li><span><i>${esc(r.just)}</i></span></li></ul>
      ${r.excecao ? '<div class="alert">⚠ Pedido fora do prazo mínimo — requer autorização excepcional.</div>' : ''}
      <div class="assign"><select class="sv">${vehicleOptions(t, r.pax, BAG[r.bag].p, r.data, r.hora, [r.id], durOf(r))}</select><select class="sd">${driverOptions(t, r.data, r.hora, [r.id], durOf(r))}</select>
        <button class="btn green sm ok-a">${r.tipo === 'moto' ? 'Aprovar e gerar OS' : 'Aprovar'}</button><button class="btn sm red no-a">Recusar</button></div>
    </div>`;
  }).join('') || '<div class="empty">Nenhuma solicitação avulsa pendente.</div>';

  shell(page, `
    <div class="page-head"><div><h1>Painel do Facilities</h1><p>Analise, agrupe e atribua veículo e motorista. A decisão final é sempre do Facilities.</p></div></div>
    <div class="kpis">
      <div class="kpi"><div class="v">${pend.length}</div><div class="l">Pendentes de análise</div></div>
      <div class="kpi"><div class="v">${confHoje.length}</div><div class="l">Viagens hoje</div></div>
      <div class="kpi"><div class="v">${occAvg}%</div><div class="l">Ocupação média (grade confirmada)</div></div>
      <a class="kpi" href="#viagens" style="text-decoration:none"><div class="v">${aEnviar}</div><div class="l">Viagens a enviar no WhatsApp →</div></a>
    </div>
    <div class="grid-2">
      <section class="card"><h2 class="section-t">Grade entre sites</h2><p class="section-s">Solicitações do mesmo horário agrupadas. Veículos incompatíveis (capacidade, bagagem ou já alocados) ficam bloqueados.</p>${groupHtml}</section>
      <div>
        <section class="card" style="margin-bottom:16px"><h2 class="section-t">Moto Táxi — envio de itens</h2><p class="section-s">Envios no mesmo dia, mesma retirada e mesma entrega, com até ${MOTO_TOL_MIN} min de diferença e que cabem em uma moto, aparecem juntos. A saída é o horário mais tarde do grupo, para todos os itens estarem prontos.</p>${motoHtml}</section>
        <section class="card"><h2 class="section-t">Táxi avulso</h2><p class="section-s">Táxi na cidade e intermunicipal.</p>${avHtml}</section>
      </div>
    </div>`);

  document.querySelectorAll('.group[data-m]').forEach((g) => {
    const c = clusters[Number(g.dataset.m)];
    const ids = c.rs.map((r) => r.id);
    const refresh = () => {
      const h = $('.sh', g).value;
      $('.sv', g).innerHTML = vehicleOptions('moto', 0, c.pts, c.data, h, ids);
      $('.sd', g).innerHTML = driverOptions('moto', c.data, h, ids);
    };
    $('.sh', g).onchange = refresh;
    $('.ok-m', g).onclick = () => {
      const h = $('.sh', g).value, v = $('.sv', g).value, d = $('.sd', g).value;
      if (!v || !d || $('.sv', g).selectedOptions[0]?.disabled || $('.sd', g).selectedOptions[0]?.disabled) { toast('Selecione moto e motociclista disponíveis.'); return; }
      if (busy('veiculo', v, c.data, h, ids) || busy('motorista', d, c.data, h, ids)) { toast('Conflito de agenda da moto/motociclista.'); return; }
      const os = newOsId();
      c.rs.forEach((r) => {
        if (r.hora !== h) {
          audit('Horário de retirada ajustado', r.id, r.hora, `${h} (agrupado em ${os})`);
          r.motivo = `Retirada ajustada de ${r.hora} para ${h} para seguir junto com ${ids.filter((x) => x !== r.id).join(', ')}.`;
          r.hora = h;
        }
        Object.assign(r, { status: 'confirmada', veiculo: v, motorista: d, os });
        audit('Confirmada', r.id, 'Em análise', `${veic(v).nome} · ${mot(d).nome} · ${os}`);
      });
      audit('OS gerada', os, '', `${ids.join(' + ')} · ${mot(d).nome}`);
      S.reqs.filter((x) => x.data === c.data && x.hora === h && x.veiculo === v && x.motorista === d).forEach((x) => { x.wpp = null; });
      save(); route(); toast(`${os} gerada para ${ids.join(' + ')}. Envie ao motociclista em “Viagens”.`);
    };
    $('.no-m', g).onclick = () => recusar(c.rs);
    g.querySelectorAll('.rx').forEach((b) => { b.onclick = () => recusar([S.reqs.find((x) => x.id === b.dataset.id)]); });
  });

  document.querySelectorAll('.group[data-k]').forEach((g) => {
    const rs = groups[g.dataset.k];
    const okb = $('.ok-g', g), nob = $('.no-g', g);
    if (okb) okb.onclick = () => {
      const v = $('.sv', g).value, d = $('.sd', g).value;
      const [data, hora] = g.dataset.k.split(' ');
      const ids = rs.map((r) => r.id);
      if (!v || !d || $('.sv', g).selectedOptions[0]?.disabled || $('.sd', g).selectedOptions[0]?.disabled) { toast('Selecione veículo e motorista disponíveis.'); return; }
      if (busy('veiculo', v, data, hora, ids) || busy('motorista', d, data, hora, ids)) { toast('Conflito de agenda de veículo/motorista.'); return; }
      rs.forEach((r) => { r.status = 'confirmada'; r.veiculo = v; r.motorista = d; audit('Confirmada', r.id, 'Em análise', `${veic(v).nome} · ${mot(d).nome}${rs.length > 1 ? ` · grupo ${ids.join('+')}` : ''}`); });
      // se já existia viagem enviada no mesmo carro/horário, ela muda: exige reenvio
      S.reqs.filter((x) => x.data === data && x.hora === hora && x.veiculo === v && x.motorista === d).forEach((x) => { x.wpp = null; });
      save(); route(); toast(`${ids.join(' + ')} confirmada(s) — ${veic(v).nome}. Envie ao motorista em “Viagens”.`);
    };
    if (nob) nob.onclick = () => recusar(rs);
    g.querySelectorAll('.mv').forEach((b) => { b.onclick = () => mover(b.dataset.id); });
  });
  document.querySelectorAll('.group[data-id]').forEach((g) => {
    const r = S.reqs.find((x) => x.id === g.dataset.id);
    $('.ok-a', g).onclick = () => {
      const v = $('.sv', g).value, d = $('.sd', g).value;
      if (!v || !d || $('.sv', g).selectedOptions[0]?.disabled || $('.sd', g).selectedOptions[0]?.disabled) { toast('Selecione veículo e motorista disponíveis.'); return; }
      r.status = 'confirmada'; r.veiculo = v; r.motorista = d;
      if (r.tipo === 'moto') {
        r.os = newOsId();
        audit('OS gerada', r.os, '', `${r.id} · ${mot(d).nome}`);
      }
      audit('Confirmada', r.id, 'Em análise', `${veic(v).nome} · ${mot(d).nome}${r.excecao ? ' · exceção autorizada' : ''}`);
      save(); route(); toast(`${r.id} aprovada${r.os ? ` — ${r.os}` : ''}. Envie ao motorista em “Viagens”.`);
    };
    $('.no-a', g).onclick = () => recusar([r]);
  });
}

function motoClusters(pend) {
  const ms = pend.filter((r) => r.tipo === 'moto').sort((a, b) => at(a.data, a.hora) - at(b.data, b.hora));
  const out = [];
  for (const r of ms) {
    const c = out.find((x) => x.data === r.data && normLoc(x.origem) === normLoc(r.origem) && normLoc(x.destino) === normLoc(r.destino)
      && (at(r.data, r.hora) - at(x.data, x.rs[0].hora)) / 60000 <= MOTO_TOL_MIN && x.pts + cargaPts(r) <= MOTO_CARGA);
    if (c) { c.rs.push(r); c.pts += cargaPts(r); } else out.push({ data: r.data, origem: r.origem, destino: r.destino, rs: [r], pts: cargaPts(r) });
  }
  return out;
}

function recusar(rs) {
  const motivo = prompt('Motivo da recusa (obrigatório):');
  if (!motivo || !motivo.trim()) return;
  rs.forEach((r) => { r.status = 'recusada'; r.motivo = motivo.trim(); audit('Recusada', r.id, 'Em análise', motivo.trim()); });
  const n = emailStatus(rs, 'recusada', { motivo: motivo.trim() }).length;
  save(); route(); toast(`${rs.map((r) => r.id).join(', ')} recusada(s) — e-mail enviado a ${n} colaborador${n > 1 ? 'es' : ''}.`);
}
function mover(id) {
  const r = S.reqs.find((x) => x.id === id);
  const alt = nextCompatibleSlot(r.data, r.hora, r.origem, r.destino, r.pax);
  if (!alt) { toast('Nenhum horário compatível encontrado.'); return; }
  if (!confirm(`Mover ${r.id} para ${fmtDT(alt.data, alt.hora)}? O colaborador será avisado e precisa dar ciência.`)) return;
  const antes = fmtDT(r.data, r.hora);
  r.data = alt.data; r.hora = alt.hora; r.status = 'reagendada'; r.motivo = `Reagendada de ${antes} por falta de capacidade — aguardando ciência do colaborador.`;
  audit('Reagendada', r.id, antes, fmtDT(alt.data, alt.hora));
  emailStatus([r], 'reagendada', { antes });
  save(); route(); toast(`${r.id} reagendada para ${fmtDT(alt.data, alt.hora)} — colaborador avisado por e-mail.`);
}

function renderTodas(page) {
  const f = renderTodas.f || (renderTodas.f = { st: '', tp: '', q: '' });
  const rows = S.reqs.filter((r) => (!f.st || r.status === f.st) && (!f.tp || r.tipo === f.tp) &&
    (!f.q || `${r.id} ${r.nome} ${r.cc} ${siteName(r.origem)} ${siteName(r.destino)} ${r.item || ''}`.toLowerCase().includes(f.q.toLowerCase())))
    .sort((a, b) => at(a.data, a.hora) - at(b.data, b.hora));
  shell(page, `
    <div class="page-head"><div><h1>Solicitações</h1><p>${rows.length} registro(s) no filtro atual.</p></div><button class="btn navy" id="csv">Exportar CSV</button></div>
    <div class="filters">
      <select id="fst"><option value="">Todos os status</option>${Object.entries(STATUS).map(([k, v]) => `<option value="${k}" ${f.st === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <select id="ftp"><option value="">Todos os tipos</option>${Object.entries(TIPOS).map(([k, v]) => `<option value="${k}" ${f.tp === k ? 'selected' : ''}>${v}</option>`).join('')}</select>
      <input id="fq" placeholder="Buscar nº, nome, centro de custo…" value="${esc(f.q)}">
    </div>
    <div class="card table-wrap">${rows.length ? `<table><thead><tr><th>Nº</th><th>Tipo</th><th>Quando</th><th>Solicitante</th><th>Trecho</th><th>Passageiros / itens</th><th>Veículo / motorista</th><th>Status</th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-id="${esc(r.id)}" style="cursor:pointer"><td><b>${esc(r.id)}</b>${r.os ? `<small>${esc(r.os)}</small>` : ''}</td><td><span class="tipo">${esc(TIPOS[r.tipo])}</span>${r.perna ? `<small>${pernaTxt(r)} · par ${esc(r.par)}</small>` : r.bv ? '<small>Bate-volta</small>' : ''}</td>
        <td>${esc(fmtDT(r.data, r.hora))}</td><td>${esc(r.nome)}<small>${esc(r.cc)}</small></td><td>${esc(siteName(r.origem))} → ${esc(siteName(r.destino))}</td>
        <td>${esc(resumo(r))}</td><td>${r.veiculo ? `${esc(veic(r.veiculo).nome)}<small>${esc(mot(r.motorista).nome)}</small>` : '—'}</td><td>${pill(r.status)}${r.mail ? `<small>✉ aviso enviado por e-mail</small>` : ""}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Nenhum registro.</div>'}</div>`);
  $('#fst').onchange = (e) => { f.st = e.target.value; route(); };
  $('#ftp').onchange = (e) => { f.tp = e.target.value; route(); };
  $('#fq').onchange = (e) => { f.q = e.target.value; route(); };
  document.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => openDetalhe(tr.dataset.id); });
  $('#csv').onclick = () => exportCsv(rows);
}

function exportCsv(rows) {
  const head = ['numero', 'tipo', 'data', 'hora', 'solicitante', 'centro_custo', 'origem', 'destino', 'passageiros', 'bagagem', 'item', 'volumes', 'tamanho', 'recebedor', 'justificativa', 'veiculo', 'motorista', 'os', 'status', 'excecao'];
  const q = (v) => { let s = String(v ?? ''); if (/^[=+\-@]/.test(s)) s = `'${s}`; return `"${s.replace(/"/g, '""')}"`; };
  const lines = rows.map((r) => [r.id, TIPOS[r.tipo], fmtDate(r.data), r.hora, r.nome, r.cc, siteName(r.origem), siteName(r.destino),
    r.tipo === 'moto' ? '' : r.pax, r.tipo === 'moto' ? '' : BAG[r.bag].l, r.item || '', r.vol || '', r.tam ? ITEM_TAM[r.tam].l : '', r.recebedor || '',
    r.just, r.veiculo ? veic(r.veiculo).nome : '', r.motorista ? mot(r.motorista).nome : '', r.os || '', STATUS[r.status], r.excecao ? 'sim' : 'não'].map(q).join(';'));
  const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `solicitacoes_${ymd(new Date())}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  audit('Exportação CSV', `${rows.length} registros`, '', 'filtros aplicados na tela');
  save();
  toast(`${rows.length} registro(s) exportado(s).`);
}

function renderHistorico(page) {
  shell(page, `
    <div class="page-head"><div><h1>Histórico / auditoria</h1><p>Acesso restrito a TI / Administração do sistema. Quem fez, quando, valor anterior e novo valor (RF-15).</p></div></div>
    <div class="card table-wrap">${S.log.length ? `<table><thead><tr><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Referência</th><th>Antes</th><th>Depois</th></tr></thead><tbody>
      ${S.log.map((l) => `<tr><td>${esc(l.t)}</td><td>${esc(l.user)}</td><td><b>${esc(l.acao)}</b></td><td>${esc(l.ref)}</td><td>${esc(l.antes)}</td><td>${esc(l.depois)}</td></tr>`).join('')}</tbody></table>`
    : '<div class="empty">Sem eventos ainda. Aprove, recuse ou crie solicitações para ver a trilha.</div>'}</div>`);
}

function renderCadastros(page) {
  const tbl = (head, rows) => `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  shell(page, `
    <div class="page-head"><div><h1>Cadastros e parâmetros</h1><p>Mantidos pela TI / Administração do sistema, sem alteração de código (RF-19). Na simulação, apenas consulta.</p></div></div>
    <p class="section-s">Grade e rotas: tela <a href="#grade">Grade e rotas</a> (editável pelo Facilities e pela TI). Motoristas: tela <a href="#motoristas">Motoristas</a> (cadastrados pelo Facilities).</p>
    <div class="grid-2">
      <div>
        <section class="card" style="margin-bottom:16px"><h2 class="section-t">Veículos</h2><p class="section-s">Capacidades a validar com a frota (DEC-08)</p>
          ${tbl(['Veículo', 'Placa', 'Tipo', 'Passageiros', 'Bagagem (pts)'], VEICULOS.map((v) => [`<b>${esc(v.nome)}</b>`, esc(v.placa), v.tipo === 'moto' ? 'Moto' : 'Carro', v.cap, v.bag]))}</section>
      </div>
      <div>
        <section class="card"><h2 class="section-t">Parâmetros</h2>
          ${tbl(['Parâmetro', 'Valor'], [
            ['Antecedência — entre sites / táxi na cidade', '1 h'], ['Antecedência — intermunicipal', '48 h'], ['Antecedência — moto táxi', '<small>a definir (DEC-14)</small>'],
            ['Expediente do Facilities', `${EXPEDIENTE[0]}–${EXPEDIENTE[1]} <small>(DEC-02)</small>`], ['Fora do expediente', '2º horário da próxima grade'],
            ['Intervalo mínimo entre viagens (veículo/motorista)', `${DURACAO_MIN} min`], ['Vagas por horário da grade', `${CAP_PADRAO} (carro) · acima disso Spin até ${SLOT_CAP}`],
            ['Bagagem (pontos)', Object.values(BAG).map((b) => `${esc(b.l.split(' ')[0])} ${b.p}`).join(' · ')]])}</section>
      </div>
    </div>`);
}

// ---------------- Viagens (envio ao motorista via WhatsApp) ----------------
const VG_LABEL = { enviar: ['A enviar', 'st-analise'], enviada: ['Enviada', 'st-reagendada'], concluida: ['Concluída', 'st-concluida'], naorealizada: ['Não realizada', 'st-recusada'] };
function viagens() {
  const map = {};
  S.reqs.filter((r) => ['confirmada', 'andamento', 'concluida', 'naorealizada'].includes(r.status) && r.veiculo && r.motorista)
    .forEach((r) => { (map[[r.data, r.hora, r.veiculo, r.motorista].join('|')] ||= []).push(r); });
  return Object.entries(map).map(([k, rs]) => {
    const st = rs.every((r) => r.status === 'concluida') ? 'concluida' : rs.every((r) => r.status === 'naorealizada') ? 'naorealizada'
      : rs.every((r) => r.wpp) ? 'enviada' : 'enviar';
    return { k, rs, data: rs[0].data, hora: rs[0].hora, veiculo: rs[0].veiculo, motorista: rs[0].motorista, tipo: rs[0].tipo, st };
  }).sort((a, b) => at(a.data, a.hora) - at(b.data, b.hora));
}
const paxTxt = (r) => `${r.nome}${r.pax > 1 ? ` +${r.pax - 1}` : ''}`;
function wppMsg(v) {
  const ve = veic(v.veiculo);
  const moto = v.tipo === 'moto';
  const L = [`*Mobilab · Natulab — ${moto ? 'Serviço de Moto Táxi' : 'Viagem confirmada'}*`, '', `📅 ${fmtDT(v.data, v.hora)}`];
  if (v.tipo === 'grade') {
    const slot = slotOf(v.hora);
    if (slot) L.push(`🛣️ Rota: ${rotaTxt(slot.paradas)}`);
    L.push(`🚗 ${ve.nome} · ${ve.placa}`, '', '*Passageiros:*');
    v.rs.forEach((r) => L.push(`• ${paxTxt(r)} — embarca em ${siteName(r.origem)}, desce em ${siteName(r.destino)}`));
    L.push('', `Total: ${v.rs.reduce((s, r) => s + r.pax, 0)} passageiro(s)`);
  } else if (moto) {
    const oss = [...new Set(v.rs.map((r) => r.os).filter(Boolean))];
    if (oss.length) L.push(`🧾 OS: ${oss.join(', ')}`);
    L.push(`🏍️ ${ve.nome} · ${ve.placa}`);
    const rotas = [...new Set(v.rs.map((r) => `${siteName(r.origem)} → ${siteName(r.destino)}`))];
    if (rotas.length === 1) L.push(`📍 ${rotas[0]}`);
    L.push('', `*Itens (${v.rs.length}):*`);
    v.rs.forEach((r) => L.push(`• ${r.vol}× ${r.item} (${tamCurto(r.tam)}) — retirar com ${r.nome}${rotas.length > 1 ? ` em ${siteName(r.origem)}` : ''}; entregar a ${r.recebedor}${rotas.length > 1 ? ` em ${siteName(r.destino)}` : ''}`));
  } else {
    const r = v.rs[0];
    L.push(`🚗 ${ve.nome} · ${ve.placa}`, `📍 Embarque: ${siteName(r.origem)}`, `🏁 Destino: ${siteName(r.destino)}`, `👥 ${paxTxt(r)}`, `📝 ${r.just}`);
    if (r.bv) L.push(`🔁 *Bate-volta:* aguardar até ${fmtMin(r.bv.espera)} no destino e levar o passageiro para ${siteName(r.bv.volta)}`);
  }
  const bags = v.rs.filter((r) => r.bag !== 'nenhuma').map((r) => BAG[r.bag].l);
  if (bags.length) L.push(`🧳 Bagagem: ${bags.join(', ')}`);
  L.push('', `Ref.: ${v.rs.map((r) => r.id).join(', ')}`, 'Dúvidas: falar com o Facilities.');
  return L.join('\n');
}

// ---------------- E-mail de confirmação ao colaborador (SIMULADO: no sistema real sai pelo e-mail corporativo) ----------------
const caixa = () => (S.emails || (S.emails = []));
function emailConfirmacao(v, reenvio) {
  const ve = veic(v.veiculo), m = mot(v.motorista);
  const porPessoa = {};
  v.rs.forEach((r) => { (porPessoa[r.email] || (porPessoa[r.email] = [])).push(r); });
  return Object.values(porPessoa).map((rs) => {
    const r0 = rs[0], moto = r0.tipo === 'moto';
    const L = [`Olá, ${r0.nome.split(' ')[0]}!`, '', moto ? 'Seu envio por Moto Táxi foi confirmado pelo Facilities.' : 'Sua viagem foi confirmada pelo Facilities.', '', `Data e horário: ${fmtDT(v.data, v.hora)}`];
    rs.forEach((r) => {
      L.push(moto ? `Retirada em ${siteName(r.origem)} → entrega em ${siteName(r.destino)} (${r.vol}× ${r.item}; recebe: ${r.recebedor})`
        : `Trecho: ${siteName(r.origem)} → ${siteName(r.destino)} · ${r.pax} passageiro(s)`);
      if (r.bv) L.push(bvTxt(r));
      if (r.perna) L.push(`${pernaTxt(r)} — vinculada a ${r.par}`);
      if (r.os) L.push(`OS: ${r.os}`);
    });
    if (v.tipo === 'grade') { const s = slotOf(v.hora); if (s) L.push(`Rota: ${rotaTxt(s.paradas)}`); }
    L.push(`${moto ? 'Moto' : 'Veículo'}: ${ve.nome} · placa ${ve.placa}`, `${moto ? 'Motociclista' : 'Motorista'}: ${m.nome}`, '',
      moto ? 'Deixe o item pronto e identificado no horário da retirada.' : 'Chegue ao ponto de embarque com pelo menos 5 minutos de antecedência.',
      '', `Ref.: ${rs.map((r) => r.id).join(', ')}`, 'Mobilab · Facilities Natulab');
    const em = {
      id: `EM-${caixa().length + 1}`, para: r0.email, nome: r0.nome, refs: rs.map((r) => r.id), quando: nowStamp(), lida: false,
      assunto: `${reenvio ? 'Atualização' : 'Confirmada'}: ${moto ? 'envio por Moto Táxi' : 'sua viagem'} — ${fmtDT(v.data, v.hora)}`, corpo: L.join('\n'),
    };
    caixa().push(em);
    rs.forEach((r) => { r.mail = em.quando; });
    audit('E-mail de confirmação ao colaborador', em.refs.join(', '), '', r0.email);
    return em;
  });
}
// Recusa / remarcação: o colaborador também é avisado por e-mail (um e-mail por pessoa).
function emailStatus(rs, kind, info) {
  const porPessoa = {};
  rs.forEach((r) => { (porPessoa[r.email] || (porPessoa[r.email] = [])).push(r); });
  return Object.values(porPessoa).map((grp) => {
    const r0 = grp[0];
    const recusa = kind === 'recusada';
    const L = [`Olá, ${r0.nome.split(' ')[0]}!`, '', recusa ? 'Sua solicitação não pôde ser atendida pelo Facilities.' : 'Sua solicitação foi remarcada pelo Facilities.', ''];
    grp.forEach((r) => {
      L.push(`${r.id} — ${TIPOS[r.tipo]}: ${siteName(r.origem)} → ${siteName(r.destino)}`);
      L.push(recusa ? `Data e horário pedidos: ${fmtDT(r.data, r.hora)}` : `Novo horário: ${fmtDT(r.data, r.hora)} (antes: ${info.antes})`);
    });
    L.push('', recusa ? `Motivo: ${info.motivo}` : 'Abra o Mobilab para dar ciência do novo horário. Se ele não servir, cancele e faça uma nova solicitação.',
      recusa ? 'Se precisar, faça uma nova solicitação em outro horário ou fale com o Facilities.' : '', '', 'Mobilab · Facilities Natulab');
    const em = {
      id: `EM-${caixa().length + 1}`, para: r0.email, nome: r0.nome, refs: grp.map((r) => r.id), quando: nowStamp(), lida: false, kind,
      assunto: recusa ? `Recusada: sua solicitação ${grp.map((r) => r.id).join(', ')}` : `Remarcada: ${grp[0].id} para ${fmtDT(grp[0].data, grp[0].hora)}`,
      corpo: L.filter((x, i, a) => !(x === '' && a[i - 1] === '')).join('\n'),
    };
    caixa().push(em);
    grp.forEach((r) => { r.mail = em.quando; });
    audit(`E-mail de ${recusa ? 'recusa' : 'remarcação'} ao colaborador`, em.refs.join(', '), '', r0.email);
    return em;
  });
}
const minhasMsgs = () => caixa().filter((e) => e.para === S.user.email).slice().reverse();
function openEmail(id) {
  const e = caixa().find((x) => x.id === id);
  if (!e) return;
  if (!e.lida) { e.lida = true; save(); }
  openModal(`
    <div class="mail-h"><span class="si ${e.kind === 'recusada' ? 'red' : e.kind ? 'amber' : 'green'}">${ico('mail', 20)}</span><div><h3>${esc(e.assunto)}</h3>
      <p class="sub">De: <b>Mobilab · Natulab</b> &lt;${esc(REMETENTE)}&gt; · Para: ${esc(e.para)} · ${esc(e.quando)}</p></div></div>
    <div class="mail-body">${esc(e.corpo)}</div>
    ${e.kind === 'aprovacao' ? (() => { const r = S.reqs.find((x) => x.id === e.refs[0]); return r ? `<div class="mail-cta"><a class="btn green" href="${window.MOBILAB_API ? '#aprovacoes' : linkAprov(r)}" id="apvlink">Analisar solicitação</a></div>` : ''; })() : ''}
    <p class="section-s" style="margin-top:10px">Simulação: no sistema real esta mensagem chega na caixa de e-mail corporativa ${e.kind === 'aprovacao' ? 'do gestor' : 'do colaborador'}.</p>
    <div class="modal-acts">${e.refs[0] && S.reqs.some((r) => r.id === e.refs[0] && r.email === S.user.email) ? `<button class="btn" id="vsol">Ver solicitação ${esc(e.refs[0])}</button>` : ''}<button class="btn green" id="cx">Fechar</button></div>`);
  $('#cx').onclick = () => { closeModal(); route(); };
  const al = $('#apvlink'); if (al) al.onclick = () => closeModal();
  const vs = $('#vsol'); if (vs) vs.onclick = () => openDetalhe(e.refs[0]);
}
function openCaixa() {
  const ms = minhasMsgs();
  openModal(`
    <h3>Mensagens do Facilities</h3>
    <p class="sub">Cópia dos e-mails enviados a você: confirmação (viagem fechada com o motorista), recusa e remarcação.</p>
    ${ms.length ? `<div class="mail-list">${ms.map((e) => `<button class="mail-row ${e.lida ? '' : 'nova'} k-${e.kind || 'ok'}" data-em="${esc(e.id)}"><i></i><span><b>${esc(e.assunto)}</b><small>${esc(e.quando)} · ${esc(e.refs.join(', '))}</small></span></button>`).join('')}</div>`
      : '<div class="empty">Nenhuma confirmação recebida ainda.</div>'}
    <div class="modal-acts"><button class="btn" id="cx">Fechar</button></div>`);
  $('#cx').onclick = () => { closeModal(); route(); };
  document.querySelectorAll('.mail-row').forEach((b) => { b.onclick = () => openEmail(b.dataset.em); });
}

function openWpp(v) {
  const m = mot(v.motorista);
  openModal(`
    <h3>Enviar ao motorista</h3>
    <p class="sub">Para <b>${esc(m.nome)}</b> · WhatsApp ${esc(fmtFone(m.fone))}</p>
    <div class="f"><label for="wmsg">Mensagem <small>(pode ajustar antes de enviar)</small></label><textarea id="wmsg" style="min-height:260px;font-family:inherit">${esc(wppMsg(v))}</textarea></div>
    <p class="section-s" style="margin-top:8px">Na simulação os números são fictícios. O WhatsApp abre com o texto pronto — o envio é feito por você.
      Ao enviar, ${[...new Set(v.rs.map((r) => r.nome))].length > 1 ? `os colaboradores (${esc([...new Set(v.rs.map((r) => r.nome))].join(', '))}) recebem` : `<b>${esc(v.rs[0].nome)}</b> recebe`} a <b>confirmação por e-mail</b> e o aviso no painel.</p>
    <div class="modal-acts">
      <button class="btn" id="cx">Fechar</button>
      <button class="btn" id="cp">Copiar texto</button>
      <button class="btn" id="mk">Marcar como enviada</button>
      <a class="btn green" id="wa" target="_blank" rel="noopener" href="#" style="text-decoration:none">Abrir WhatsApp</a>
    </div>`);
  const marcar = () => {
    const ts = nowStamp();
    const reenvio = v.rs.some((r) => r.wpp);
    v.rs.forEach((r) => { r.wpp = ts; });
    audit('Enviada ao motorista (WhatsApp)', v.rs.map((r) => r.id).join(', '), '', `${m.nome} · ${fmtFone(m.fone)}`);
    const ems = emailConfirmacao(v, reenvio); // viagem fechada com o motorista → confirmação ao colaborador
    save();
    return ems.length;
  };
  const aviso = (n) => `E-mail de confirmação enviado a ${n} colaborador${n > 1 ? 'es' : ''}.`;
  $('#cx').onclick = closeModal;
  $('#cp').onclick = async () => { try { await navigator.clipboard.writeText($('#wmsg').value); toast('Texto copiado.'); } catch (e) { $('#wmsg').select(); toast('Selecione e copie com Ctrl+C.'); } };
  $('#mk').onclick = () => { const n = marcar(); closeModal(); route(); toast(`Viagem marcada como enviada. ${aviso(n)}`); };
  $('#wa').onclick = () => {
    $('#wa').href = `https://wa.me/55${m.fone}?text=${encodeURIComponent($('#wmsg').value)}`;
    const n = marcar(); setTimeout(() => { closeModal(); route(); toast(aviso(n)); }, 300);
  };
}

function renderViagens(page) {
  const f = renderViagens.f || (renderViagens.f = 'abertas');
  const all = viagens();
  const cont = (s) => all.filter((v) => v.st === s).length;
  const nAbertas = cont('enviar') + cont('enviada');
  const TABS = [['abertas', 'Abertas', nAbertas], ['enviar', 'A enviar', cont('enviar')], ['enviada', 'Enviadas', cont('enviada')],
    ['concluida', 'Concluídas', cont('concluida')], ['naorealizada', 'Não realizadas', cont('naorealizada')]];
  const list = all.filter((v) => (f === 'abertas' ? ['enviar', 'enviada'].includes(v.st) : v.st === f));
  const MES3 = (ds) => MESES[at(ds, '12:00').getMonth()].slice(0, 3);
  const VST = { enviar: ['A enviar', 'vst-enviar'], enviada: ['Enviada', 'vst-enviada'], concluida: ['Concluída', 'vst-concluida'], naorealizada: ['Não realizada', 'vst-nao'] };

  const trajeto = (v) => {
    if (v.tipo === 'grade') { const s = slotOf(v.hora); if (s) return [siteName(s.paradas[0]), s.paradas.slice(1).map((c) => siteName(c)).join(' → ')]; }
    const os = [...new Set(v.rs.map((r) => siteName(r.origem)))], ds = [...new Set(v.rs.map((r) => siteName(r.destino)))];
    return [os.join(', '), `→ ${ds.join(', ')}`];
  };
  const linhaSol = (r, v) => `<li class="${r.faltou ? 'faltou' : ''}"><b class="sid">${esc(r.id)}</b><span class="dotsep">•</span><span>${esc(r.nome)}</span>
      ${r.tipo === 'moto' ? `<small>${r.os ? `${esc(r.os)} · ` : ''}${esc(`${r.vol}× ${r.item}`)} → ${esc(r.recebedor)}</small>`
        : `<small>${esc(siteName(r.origem))} → ${esc(siteName(r.destino))} · ${r.pax} pax${r.bag !== 'nenhuma' ? ` · bagagem ${esc(BAG[r.bag].l.split(' ')[0].toLowerCase())}` : ''}${r.perna ? ` · ${pernaTxt(r)}` : r.bv ? ' · bate-volta' : ''}</small>`}
      ${r.faltou ? '<span class="tag-falta">Não compareceu — fora da divisão</span>' : ''}
      ${r.tipo !== 'moto' && v.st !== 'naorealizada' ? `<button class="btn-mini falta" data-id="${esc(r.id)}">${r.faltou ? 'Desfazer: compareceu' : 'Não compareceu'}</button>` : ''}</li>`;

  const card = (v, i) => {
    const m = mot(v.motorista), ve = veic(v.veiculo), [lbl, cls] = VST[v.st];
    const d = at(v.data, v.hora), aberta = ['enviar', 'enviada'].includes(v.st);
    const [t1, t2] = trajeto(v);
    const busca = [v.rs.map((r) => `${r.id} ${r.nome} ${r.os || ''} ${siteName(r.origem)} ${siteName(r.destino)}`).join(' '), m.nome, ve.nome, ve.placa, TIPOS[v.tipo]].join(' ').toLowerCase();
    const mails = [...new Set(v.rs.filter((r) => r.mail).map((r) => r.nome))];
    const rt = ratear(v);
    return `<article class="vc ${cls}" data-i="${i}" data-q="${esc(busca)}">
      <header class="vc-h">
        <div class="vc-date"><small>${DIAS[d.getDay()].slice(0, 3)}</small><b>${pad(d.getDate())}</b></div>
        <div class="vc-tt"><span>${DIAS[d.getDay()].slice(0, 3)}, ${d.getDate()} ${MES3(v.data)} <i>•</i> ${esc(v.hora)}</span><h3>${esc(TIPOS[v.tipo].replace(' (envio de itens)', ''))}</h3></div>
        <span class="vst ${cls}"><i></i>${lbl}</span>
      </header>
      <div class="vc-grid">
        <div class="vc-f">${ico('user', 18)}<div><small>${v.tipo === 'moto' ? 'Motociclista' : 'Motorista'}</small><b>${esc(m.nome)}</b><span>${esc(fmtFone(m.fone))}</span></div></div>
        <div class="vc-f">${ico(v.tipo === 'moto' ? 'moto' : 'car', 18)}<div><small>Veículo</small><b>${esc(ve.nome)}</b><span>${esc(ve.placa)}</span></div></div>
        <div class="vc-f">${ico('route', 18)}<div><small>Trajeto</small><b>${esc(t1)}</b><span>${esc(t2)}</span></div></div>
      </div>
      <div class="vc-cost">
        <div class="vc-val">
          <small>Valor da corrida</small>
          ${rt.padrao != null ? `<div class="fixo"><b>${brl(rt.padrao)}</b><em>valor fixo da rota</em></div>`
            : `<div class="fixo sem"><b>Sem valor</b><em>destino sem valor cadastrado — cadastre em <a href="#grade">Grade e rotas</a></em></div>`}
          <small class="mt">Acréscimo <span class="opt">(espera, pedágio…)</span></small>
          <div class="acr-row"><span class="money sm">R$ <input class="vacr" type="number" min="0" step="0.01" inputmode="decimal" value="${rt.acrescimo || ''}" placeholder="0,00" ${v.st === 'naorealizada' ? 'disabled' : ''} aria-label="Acréscimo"></span>
            <input class="vmot" placeholder="Motivo do acréscimo" value="${esc(rt.motivoAcr)}" ${v.st === 'naorealizada' ? 'disabled' : ''} aria-label="Motivo do acréscimo"></div>
          ${rt.acrescimo && !rt.motivoAcr ? '<em class="warn-t">Informe o motivo do acréscimo</em>' : ''}
          ${rt.total != null ? `<div class="vc-tot">Total <b>${brl(rt.total)}</b>${rt.acrescimo ? ` <em>(${brl(rt.base)} + ${brl(rt.acrescimo)})</em>` : ''}</div>` : ''}
        </div>
        <div class="vc-rat"><small>Divisão por setor</small>${rt.ninguem ? '<span class="warn-t">Ninguém compareceu — sem cobrança</span>' : rt.total != null ? `<div class="chips">${rateioChips(rt)}</div>${rt.legs.length > 1 ? `<span class="legs">${rt.legs.map((l) => `${esc(siteName(l.de))} → ${esc(siteName(l.para))}: ${brl(l.valor)} (${l.ccs.map(setorCurto).map(esc).join(' + ')})`).join(' · ')}</span>` : ''}` : '<span class="warn-t">Aguardando o valor</span>'}</div>
      </div>
      <footer class="vc-ft">
        <div class="vc-sols"><ul>${v.rs.map((r) => linhaSol(r, v)).join('')}</ul>
          ${v.rs[0].wpp ? `<p class="ok">${ico('check', 14)} Enviada pelo WhatsApp em ${esc(v.rs[0].wpp)}</p>` : `<p class="warn">${ico('clock', 14)} Ainda não enviada ao motorista — ao enviar, o colaborador recebe a confirmação por e-mail.</p>`}
          ${mails.length ? `<p class="ok">${ico('mail', 14)} Confirmação por e-mail enviada a ${esc(mails.join(', '))}</p>` : ''}
          ${v.rs.some((r) => r.motivo && v.st === 'naorealizada') ? `<p class="bad">${esc(v.rs[0].motivo)}</p>` : ''}</div>
        ${aberta ? `<div class="vc-acts">
          <button class="btn-send wpp">${ico('send', 16)} ${v.st === 'enviada' ? 'Reenviar' : 'Enviar'}</button>
          <button class="btn-out fim">${ico('check', 16)} Concluir</button>
          <button class="btn-link nr">Não realizada</button></div>` : ''}
      </footer>
    </article>`;
  };

  shell(page, `
    <div class="pg-head">
      <div><nav class="crumb"><span>Operação</span>${ico('right', 12)}<b>Viagens</b></nav>
        <h1>Viagens</h1><p>Acompanhe os deslocamentos, envie as informações aos motoristas e registre cada conclusão.</p></div>
      <div class="mini-kpis">
        <div class="mk warn"><small>A enviar</small><b>${cont('enviar')}</b></div>
        <div class="mk"><small>Em aberto</small><b>${nAbertas}</b></div>
        <div class="mk"><small>Enviadas</small><b>${cont('enviada')}</b></div>
      </div>
    </div>
    <div class="toolbar vtools">
      <div class="seg">${TABS.map(([k, l, n]) => `<button class="seg-b${f === k ? ' on' : ''}" data-f="${k}">${l} (${n})</button>`).join('')}</div>
      <label class="search">${ico('search', 16)}<input id="vq" placeholder="Buscar viagem, pessoa, motorista, placa…" value="${esc(renderViagens.q || '')}" aria-label="Buscar viagem"></label>
    </div>
    <div class="vlist">${list.length ? list.map(card).join('') : '<div class="card empty">Nenhuma viagem neste filtro. Confirme solicitações no <a href="#painel">Painel</a>.</div>'}
      <div class="card empty" id="vnone" hidden>Nenhuma viagem encontrada para a busca.</div></div>`);

  document.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { renderViagens.f = b.dataset.f; route(); }; });
  const filtra = () => {
    const q = ($('#vq').value || '').trim().toLowerCase();
    renderViagens.q = q;
    let n = 0;
    document.querySelectorAll('.vc').forEach((c) => { const ok = !q || c.dataset.q.includes(q); c.hidden = !ok; if (ok) n++; });
    if (list.length) $('#vnone').hidden = n > 0;
  };
  $('#vq').oninput = filtra;
  filtra();
  document.querySelectorAll('.vc').forEach((g) => {
    const v = list[Number(g.dataset.i)];
    const w = $('.wpp', g), fim = $('.fim', g), nr = $('.nr', g);
    if (w) w.onclick = () => openWpp(v);
    g.querySelectorAll('.falta').forEach((b) => {
      b.onclick = () => {
        const r = v.rs.find((x) => x.id === b.dataset.id);
        r.faltou = !r.faltou;
        audit(r.faltou ? 'Não compareceu' : 'Comparecimento restaurado', r.id, '', `${r.nome} (${setorCurto(r.cc)}) ${r.faltou ? 'fora' : 'de volta'} da divisão do valor`);
        save(); route(); toast(r.faltou ? `${r.nome} marcado como ausente — o valor fica com quem foi.` : `${r.nome} voltou para a divisão.`);
      };
    });
    const va = $('.vacr', g), vmo = $('.vmot', g);
    const salvaAcr = () => {
      const raw = String(va.value).trim().replace(',', '.');
      const n = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(n) || n < 0) { toast('Acréscimo inválido.'); return; }
      S.extras = S.extras || {};
      const antes = S.extras[v.k] ? `${brl(S.extras[v.k].valor)} ${S.extras[v.k].motivo || ''}` : 'sem acréscimo';
      const motivo = vmo.value.trim();
      if (n === 0 && !motivo) delete S.extras[v.k]; else S.extras[v.k] = { valor: Math.round(n * 100) / 100, motivo };
      audit('Acréscimo na viagem', v.rs.map((r) => r.id).join(', '), antes, n ? `${brl(n)} ${motivo}` : 'sem acréscimo');
      save(); route(); toast(n ? `Acréscimo de ${brl(n)} lançado.` : 'Acréscimo removido.');
    };
    if (va) va.onchange = salvaAcr;
    if (vmo) vmo.onchange = salvaAcr;
    if (fim) fim.onclick = () => {
      v.rs.forEach((r) => { audit('Concluída', r.id, STATUS[r.status], 'Concluída'); r.status = 'concluida'; });
      save(); route(); toast('Viagem concluída.');
    };
    if (nr) nr.onclick = () => {
      const mo = prompt('Motivo (viagem não realizada):');
      if (!mo || !mo.trim()) return;
      v.rs.forEach((r) => { audit('Não realizada', r.id, STATUS[r.status], mo.trim()); r.status = 'naorealizada'; r.motivo = mo.trim(); });
      save(); route(); toast('Registrada como não realizada.');
    };
  });
}

// ---------------- Motoristas (cadastro pelo Facilities) ----------------
const futurasAtivas = (pred) => S.reqs.filter((r) => ['gestor', 'analise', 'confirmada', 'reagendada'].includes(r.status) && r.data >= ymd(new Date()) && pred(r));

function renderMotoristas(page) {
  const list = [...S.motoristas].sort((a, b) => (b.ativo - a.ativo) || a.nome.localeCompare(b.nome));
  shell(page, `
    <div class="page-head"><div><h1>Motoristas</h1><p>Cadastro do Facilities. O WhatsApp é usado para enviar as viagens — motoristas não acessam o sistema.</p></div>
      <button class="btn green" id="novo">+ Novo motorista</button></div>
    <div class="card table-wrap"><table><thead><tr><th>Nome</th><th>Tipo</th><th>WhatsApp</th><th>Situação</th><th>Próximas viagens</th><th></th></tr></thead><tbody>
      ${list.map((m) => `<tr><td><b>${esc(m.nome)}</b></td><td>${m.tipo === 'moto' ? 'Motociclista' : 'Motorista (carro)'}</td><td>${esc(fmtFone(m.fone))}</td>
        <td>${m.ativo ? '<span class="pill st-confirmada">Ativo</span>' : '<span class="pill st-concluida">Inativo</span>'}</td>
        <td>${futurasAtivas((r) => r.motorista === m.id).length}</td>
        <td style="white-space:nowrap"><button class="btn sm ed" data-id="${esc(m.id)}">Editar</button> <button class="btn sm tg" data-id="${esc(m.id)}">${m.ativo ? 'Desativar' : 'Ativar'}</button></td></tr>`).join('')}
    </tbody></table></div>
    <p class="section-s" style="margin-top:12px">Telefones são dados pessoais (LGPD): visíveis apenas para Facilities e TI.</p>`);
  $('#novo').onclick = () => openMotorista();
  document.querySelectorAll('.ed').forEach((b) => { b.onclick = () => openMotorista(b.dataset.id); });
  document.querySelectorAll('.tg').forEach((b) => {
    b.onclick = () => {
      const m = mot(b.dataset.id);
      if (m.ativo) {
        const n = futurasAtivas((r) => r.motorista === m.id && r.status !== 'analise').length;
        if (n) { toast(`${m.nome} tem ${n} viagem(ns) futura(s). Reatribua antes de desativar.`); return; }
      }
      m.ativo = !m.ativo;
      audit(m.ativo ? 'Motorista ativado' : 'Motorista desativado', m.nome, m.ativo ? 'Inativo' : 'Ativo', m.ativo ? 'Ativo' : 'Inativo');
      save(); route();
    };
  });
}

function openMotorista(id) {
  const m = id ? mot(id) : { nome: '', tipo: 'carro', fone: '', ativo: true };
  openModal(`
    <h3>${id ? 'Editar motorista' : 'Novo motorista'}</h3>
    <p class="sub">Dados usados para atribuir viagens e enviar pelo WhatsApp.</p>
    <div class="form-grid">
      <div class="f full"><label for="mn">Nome</label><input id="mn" value="${esc(m.nome)}"></div>
      <div class="f"><label for="mt">Tipo</label><select id="mt"><option value="carro" ${m.tipo === 'carro' ? 'selected' : ''}>Motorista (carro)</option><option value="moto" ${m.tipo === 'moto' ? 'selected' : ''}>Motociclista</option></select></div>
      <div class="f"><label for="mf">WhatsApp (com DDD)</label><input id="mf" inputmode="tel" placeholder="(75) 99999-0000" value="${esc(m.fone ? fmtFone(m.fone) : '')}"></div>
    </div>
    <div id="mmsg"></div>
    <div class="modal-acts"><button class="btn" id="cx">Cancelar</button><button class="btn green" id="ok">Salvar</button></div>`);
  $('#cx').onclick = closeModal;
  $('#ok').onclick = () => {
    const nome = $('#mn').value.trim(), tipo = $('#mt').value;
    let fone = $('#mf').value.replace(/\D/g, '');
    if (fone.length === 13 && fone.startsWith('55')) fone = fone.slice(2);
    const msg = $('#mmsg');
    if (!nome) { msg.innerHTML = '<div class="msg-box bad">Informe o nome.</div>'; return; }
    if (fone.length < 10 || fone.length > 11) { msg.innerHTML = '<div class="msg-box bad">WhatsApp inválido: informe DDD + número (10 ou 11 dígitos).</div>'; return; }
    const dup = S.motoristas.find((x) => x.fone === fone && x.id !== id);
    if (dup) { msg.innerHTML = `<div class="msg-box bad">Este número já está cadastrado para ${esc(dup.nome)}.</div>`; return; }
    if (id && tipo !== m.tipo && futurasAtivas((r) => r.motorista === id && r.status !== 'analise').length) {
      msg.innerHTML = '<div class="msg-box bad">Há viagens futuras atribuídas — não é possível mudar o tipo agora.</div>'; return;
    }
    if (id) {
      const antes = `${m.nome} · ${m.tipo} · ${fmtFone(m.fone)}`;
      Object.assign(m, { nome, tipo, fone });
      audit('Motorista alterado', m.id, antes, `${nome} · ${tipo} · ${fmtFone(fone)}`);
    } else {
      S.seq.mot += 1;
      const novo = { id: `D${S.seq.mot}`, nome, tipo, fone, ativo: true };
      S.motoristas.push(novo);
      audit('Motorista cadastrado', novo.id, '', `${nome} · ${tipo} · ${fmtFone(fone)}`);
    }
    save(); closeModal(); route(); toast('Motorista salvo.');
  };
}

// ---------------- Grade e rotas (Facilities e TI) ----------------
// Valor fixo da corrida de um horário da grade: até cada parada, contado da saída (vem de "Valores das rotas").
function valorGradeHtml(p) {
  return p.slice(1).map((c) => {
    const t = tarifa(p[0], c, 'carro');
    return `<span>até ${esc(curto(c))} <b>${t == null ? '<em class="warn-t">sem valor</em>' : brl(t)}</b></span>`;
  }).join('');
}
function renderGrade(page) {
  const list = [...S.grade].sort((a, b) => a.hora.localeCompare(b.hora));
  shell(page, `
    <div class="page-head"><div><h1>Grade e rotas</h1><p>Horários fixos entre os sites. Alterações valem imediatamente para a agenda dos colaboradores.</p></div>
      <button class="btn green" id="novo">+ Novo horário</button></div>
    <div class="card table-wrap"><table><thead><tr><th>Horário</th><th>Período</th><th>Origem</th><th>Parada</th><th>Destino</th><th>Valor da corrida (fixo)</th><th>Situação</th><th>Solicitações futuras</th><th></th></tr></thead><tbody>
      ${list.map((g) => {
        const p = g.paradas, via = p.length === 3 ? siteName(p[1]) : '—';
        return `<tr style="${g.ativo ? '' : 'opacity:.55'}"><td><b>${esc(g.hora)}</b></td><td>${periodo(g.hora)}</td><td>${esc(siteName(p[0]))}</td><td>${esc(via)}</td><td>${esc(siteName(p[p.length - 1]))}</td><td class="gv">${valorGradeHtml(p)}</td>
          <td>${g.ativo ? '<span class="pill st-confirmada">Ativo</span>' : '<span class="pill st-concluida">Inativo</span>'}</td>
          <td>${futurasAtivas((r) => r.tipo === 'grade' && r.hora === g.hora).length}</td>
          <td style="white-space:nowrap"><button class="btn sm ed" data-id="${g.id}">Editar</button> <button class="btn sm tg" data-id="${g.id}">${g.ativo ? 'Desativar' : 'Ativar'}</button></td></tr>`;
      }).join('')}
    </tbody></table></div>
    <p class="section-s" style="margin-top:12px">Dias de operação: segunda a sexta (DEC-01 em validação). Horários com solicitações futuras não podem ser alterados nem desativados — reagende-as antes.</p>
    <div style="margin-top:18px">${valoresRotasHtml()}</div>`);
  $('#novo').onclick = () => openGrade();
  bindValoresRotas();
  document.querySelectorAll('.ed').forEach((b) => { b.onclick = () => openGrade(b.dataset.id); });
  document.querySelectorAll('.tg').forEach((b) => {
    b.onclick = () => {
      const g = S.grade.find((x) => x.id === b.dataset.id);
      if (g.ativo) {
        const n = futurasAtivas((r) => r.tipo === 'grade' && r.hora === g.hora).length;
        if (n) { toast(`Há ${n} solicitação(ões) futura(s) às ${g.hora}. Reagende antes de desativar.`); return; }
      } else if (S.grade.some((x) => x.ativo && x.hora === g.hora)) { toast(`Já existe um horário ativo às ${g.hora}.`); return; }
      g.ativo = !g.ativo;
      audit(g.ativo ? 'Horário ativado' : 'Horário desativado', `${g.hora} ${rotaTxt(g.paradas, true)}`, g.ativo ? 'Inativo' : 'Ativo', g.ativo ? 'Ativo' : 'Inativo');
      save(); route();
    };
  });
}

function openGrade(id) {
  const g = id ? S.grade.find((x) => x.id === id) : { hora: '', paradas: ['MED', 'CD', 'SUP'], ativo: true };
  const p = g.paradas;
  const opts = (sel, vazio) => `${vazio ? `<option value="">${vazio}</option>` : ''}${Object.entries(SITES).map(([k, v]) => `<option value="${k}" ${k === sel ? 'selected' : ''}>${v}</option>`).join('')}`;
  openModal(`
    <h3>${id ? `Editar horário ${esc(g.hora)}` : 'Novo horário'}</h3>
    <p class="sub">Defina o horário de saída e a rota.</p>
    <div class="form-grid">
      <div class="f full"><label for="gh">Horário de saída</label><input id="gh" type="time" value="${esc(g.hora)}"></div>
      <div class="f"><label for="go">Origem</label><select id="go">${opts(p[0])}</select></div>
      <div class="f"><label for="gd">Destino</label><select id="gd">${opts(p[p.length - 1])}</select></div>
      <div class="f full"><label for="gv">Parada intermediária</label><select id="gv">${opts(p.length === 3 ? p[1] : '', 'Sem parada (direto)')}</select></div>
    </div>
    <div id="gmsg"></div>
    <div class="modal-acts"><button class="btn" id="cx">Cancelar</button><button class="btn green" id="ok">Salvar</button></div>`);
  $('#cx').onclick = closeModal;
  $('#ok').onclick = () => {
    const hora = $('#gh').value, o = $('#go').value, d = $('#gd').value, v = $('#gv').value;
    const msg = $('#gmsg');
    const bad = (t) => { msg.innerHTML = `<div class="msg-box bad">${t}</div>`; };
    if (!/^\d{2}:\d{2}$/.test(hora)) return bad('Informe o horário.');
    if (o === d) return bad('Origem e destino devem ser diferentes.');
    if (v && (v === o || v === d)) return bad('A parada intermediária deve ser diferente da origem e do destino.');
    if (S.grade.some((x) => x.ativo && x.hora === hora && x.id !== id)) return bad(`Já existe um horário ativo às ${hora}.`);
    const paradas = v ? [o, v, d] : [o, d];
    if (id) {
      const mudou = hora !== g.hora || paradas.join() !== g.paradas.join();
      const n = futurasAtivas((r) => r.tipo === 'grade' && r.hora === g.hora).length;
      if (mudou && n) return bad(`Há ${n} solicitação(ões) futura(s) neste horário. Reagende-as antes de alterar.`);
      const antes = `${g.hora} ${rotaTxt(g.paradas, true)}`;
      Object.assign(g, { hora, paradas });
      audit('Horário alterado', g.id, antes, `${hora} ${rotaTxt(paradas, true)}`);
    } else {
      S.seq.grade += 1;
      const novo = { id: `G${S.seq.grade}`, hora, paradas, ativo: true };
      S.grade.push(novo);
      audit('Horário criado', novo.id, '', `${hora} ${rotaTxt(paradas, true)}`);
    }
    save(); closeModal(); route(); toast('Grade atualizada.');
  };
}

// ---------------- Custos: valor da corrida e rateio por setor ----------------
const brl = (n) => (n == null || Number.isNaN(n) ? '—' : Number(n).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }));
const setorCurto = (cc) => (String(cc || '').split('–')[1] || cc || '—').trim();
const parKey = (a, b) => [a, b].sort().join('|');
const tabTarifas = () => S.tarifas || (S.tarifas = JSON.parse(JSON.stringify(SEED_TARIFAS)));
function tarifa(a, b, modal) {
  a = normLoc(a); b = normLoc(b);
  if (a === b) return 0;
  if (!SITES[a] && !SITES[b]) return null; // entre dois endereços fora das unidades: sem valor fixo
  // unidade ↔ destino fora das unidades: vale o valor cadastrado em Grade e rotas → Outros destinos
  const t = tabTarifas()[parKey(a, b)];
  const v = t ? t[modal] : null;
  return v === null || v === undefined || v === '' ? null : Number(v);
}
// Rateio de uma viagem (grupo de solicitações no mesmo carro/moto).
// Grade: o valor de cada trecho = valor da origem da rota até o fim do trecho − valor até o começo dele (acumulado a partir da 1ª parada).
// Cada trecho é dividido IGUALMENTE entre os SETORES que estão no carro naquele trecho.
// Ex.: Site 1→CD = 50 e Site 1→Life = 75. TI desce no CD e Garantia vai até a Life:
//      trecho Site 1→CD (50) = 25 TI + 25 Garantia; trecho CD→Life (75−50 = 25) = Garantia sozinha → Garantia 50, TI 25.
// O valor da rota é FIXO e só é cadastrado em Grade e rotas (inclusive destinos fora das unidades).
// Acréscimos (espera, pedágio…) são lançados pela Noemia na viagem e divididos na mesma proporção dos trechos.
function ratear(v) {
  const modal = v.tipo === 'moto' ? 'moto' : 'carro';
  // Quem não compareceu não entra na divisão: a viagem fica só com os setores que foram.
  const rs = v.rs.filter((r) => !r.faltou);
  if (!rs.length) return { total: 0, padrao: 0, manual: false, partes: {}, legs: [], modal, ninguem: true };
  const legs = [];
  if (v.tipo === 'grade') {
    const slot = slotOf(v.hora);
    const p = slot ? slot.paradas : [rs[0].origem, rs[0].destino];
    for (let k = 0; k < p.length - 1; k++) {
      const ccs = [...new Set(rs.filter((r) => p.indexOf(r.origem) <= k && p.indexOf(r.destino) > k).map((r) => r.cc))];
      if (!ccs.length) continue;
      const a = tarifa(p[0], p[k], modal), b = tarifa(p[0], p[k + 1], modal);
      legs.push({ de: p[k], para: p[k + 1], custo: a == null || b == null ? null : Math.max(0, b - a), ccs });
    }
  } else if (v.tipo === 'moto') {
    const r0 = rs[0];
    legs.push({ de: r0.origem, para: r0.destino, custo: tarifa(r0.origem, r0.destino, 'moto'), ccs: [...new Set(rs.map((r) => r.cc))] });
  } else {
    rs.forEach((r) => {
      let c = tarifa(r.origem, r.destino, 'carro');
      if (r.bv && c != null) { const c2 = tarifa(r.destino, r.bv.volta, 'carro'); c = c2 == null ? null : c + c2; }
      legs.push({ de: r.origem, para: r.bv ? r.bv.volta : r.destino, custo: c, ccs: [r.cc] });
    });
  }
  if (!legs.length) legs.push({ de: rs[0].origem, para: rs[0].destino, custo: null, ccs: [...new Set(rs.map((r) => r.cc))] });
  const padrao = legs.every((l) => l.custo != null) ? legs.reduce((t, l) => t + l.custo, 0) : null;
  const base = padrao; // valor sempre FIXO, vindo de Grade e rotas (a viagem não edita o valor)
  const ex = (S.extras || {})[v.k] || {};
  const acrescimo = Number(ex.valor) > 0 ? Number(ex.valor) : 0;
  const total = base == null ? null : base + acrescimo;
  const manual = false;
  const partes = {};
  if (total != null) {
    const cents = Math.round(total * 100);
    const base = padrao ? legs.map((l) => l.custo) : legs.map(() => 1); // rota de valor zero: divide igual entre os trechos
    const soma = base.reduce((a, b) => a + b, 0) || 1;
    // Parte exata de cada setor (em centavos) e arredondamento pelo maior resto: a soma sempre bate com o total.
    const exato = {};
    legs.forEach((l, i) => {
      const legCents = (cents * base[i]) / soma;
      l.valor = Math.round(legCents) / 100;
      l.ccs.forEach((cc) => { exato[cc] = (exato[cc] || 0) + legCents / l.ccs.length; });
    });
    const ccsOrd = Object.keys(exato);
    ccsOrd.forEach((cc) => { partes[cc] = Math.floor(exato[cc] + 1e-9); });
    let resto = cents - ccsOrd.reduce((t, cc) => t + partes[cc], 0);
    [...ccsOrd].sort((x, y) => (exato[y] - partes[y]) - (exato[x] - partes[x])).forEach((cc) => { if (resto > 0) { partes[cc] += 1; resto -= 1; } });
    ccsOrd.forEach((cc) => { partes[cc] /= 100; });
  }
  return { total, padrao, base, acrescimo, motivoAcr: ex.motivo || '', manual, partes, legs, modal };
}
const rateioChips = (rt) => Object.entries(rt.partes).map(([cc, val]) => `<span class="chip-r"><b>${esc(setorCurto(cc))}</b> ${brl(val)}</span>`).join('');

function renderCustos(page) {
  const mes = renderCustos.mes || ymd(new Date()).slice(0, 7);
  const prev = !!renderCustos.prev;
  let body = '';
  {
    const vs = viagens().filter((v) => v.data.slice(0, 7) === mes && (v.st === 'concluida' || (prev && ['enviar', 'enviada'].includes(v.st))) && v.rs.some((r) => !r.faltou)); // ninguém foi = sem cobrança
    const porSetor = {};
    let total = 0;
    const semValor = [];
    vs.forEach((v) => {
      const rt = ratear(v);
      if (rt.total == null) { semValor.push(v); return; }
      total += rt.total;
      Object.entries(rt.partes).forEach(([cc, val]) => {
        const sx = porSetor[cc] || (porSetor[cc] = { valor: 0, itens: [] });
        sx.valor += val; sx.itens.push({ v, val, rt });
      });
    });
    const setores = Object.entries(porSetor).sort((a, b) => b[1].valor - a[1].valor);
    renderCustos.dados = { setores, mes };
    const [ano, mm] = mes.split('-');
    body = `
      <div class="cost-bar">
        <label class="f-inline">Mês <input type="month" id="cmes" value="${esc(mes)}"></label>
        <label class="check"><input type="checkbox" id="cprev" ${prev ? 'checked' : ''}> <span>Incluir viagens ainda não concluídas (previsão)</span></label>
        <span class="spacer"></span>
        <button class="btn" id="ccsv">Exportar CSV</button>
      </div>
      <div class="mini-kpis cost-kpis">
        <div class="mk"><small>Total do mês</small><b>${brl(total)}</b></div>
        <div class="mk"><small>Viagens</small><b>${vs.length - semValor.length}</b></div>
        <div class="mk"><small>Setores</small><b>${setores.length}</b></div>
        <div class="mk ${semValor.length ? 'warn' : ''}"><small>Sem valor</small><b>${semValor.length}</b></div>
      </div>
      ${semValor.length ? `<div class="banner warn">${ico('info', 18)}<div><b>${semValor.length} viagem(ns) sem valor</b> — rota sem valor cadastrado. Cadastre o valor em <a href="#grade">Grade e rotas</a>: ${semValor.map((v) => esc(v.rs.map((r) => r.id).join('+'))).join(', ')}.</div></div>` : ''}
      <div class="card cost-card">
        <h2 class="section-t">Quanto cada setor deve — ${esc(MESES[Number(mm) - 1])} de ${esc(ano)}</h2>
        <p class="section-s">${prev ? 'Concluídas + previsão das viagens em aberto.' : 'Somente viagens concluídas.'} Clique no setor para ver as viagens.</p>
        ${setores.length ? `<div class="cost-list">${setores.map(([cc, sx]) => `
          <details class="cost-row"><summary><span class="cs-n"><b>${esc(setorCurto(cc))}</b><small>${esc(cc)}</small></span>
            <span class="cs-q">${sx.itens.length} viagem(ns)</span><span class="cs-bar"><i style="width:${total ? Math.round((sx.valor / total) * 100) : 0}%"></i></span><b class="cs-v">${brl(sx.valor)}</b></summary>
            <table class="cost-t"><thead><tr><th>Data</th><th>Tipo</th><th>Trajeto</th><th>Solicitações do setor</th><th>Divisão da viagem</th><th>Valor da viagem</th><th>Parte do setor</th></tr></thead><tbody>
            ${sx.itens.sort((a, b) => at(a.v.data, a.v.hora) - at(b.v.data, b.v.hora)).map(({ v, val, rt }) => `<tr>
              <td>${fmtDate(v.data)} <small>${esc(v.hora)}</small></td><td>${esc(TIPO_CURTO[v.tipo])}${v.st !== 'concluida' ? ' <small>(previsão)</small>' : ''}</td>
              <td>${rt.legs.map((l) => `${esc(siteName(l.de))} → ${esc(siteName(l.para))}${l.valor != null ? ` <small>${brl(l.valor)} · ${l.ccs.map(setorCurto).map(esc).join(' + ')}</small>` : ''}`).join('<br>')}</td>
              <td>${esc(v.rs.filter((r) => r.cc === cc).map((r) => `${r.id} ${r.nome}`).join(', '))}</td>
              <td><div class="chips">${rateioChips(rt)}</div></td>
              <td>${brl(rt.total)} <small>${'fixo'}${rt.acrescimo ? ` + acréscimo ${brl(rt.acrescimo)}${rt.motivoAcr ? ` (${esc(rt.motivoAcr)})` : ''}` : ''}</small></td><td><b>${brl(val)}</b></td></tr>`).join('')}
            </tbody></table></details>`).join('')}
          <div class="cost-total"><span>Total</span><b>${brl(total)}</b></div></div>`
          : '<div class="empty">Nenhuma viagem com valor neste mês.</div>'}
      </div>`;
  }
  shell(page, `
    <div class="pg-head"><div><nav class="crumb"><span>Operação</span>${ico('right', 12)}<b>Custos</b></nav><h1>Custos por setor</h1>
      <p>Valor de cada corrida, divisão entre os setores e o que cada setor deve no mês.</p></div></div>
    <p class="section-s">Os valores fixos das rotas ficam em <a href="#grade">Grade e rotas</a>; acréscimos (espera, pedágio…) são lançados em <a href="#viagens">Viagens</a>.</p>
    ${body}`);
  const cm = $('#cmes'); if (cm) cm.onchange = () => { if (cm.value) { renderCustos.mes = cm.value; route(); } };
  const cp = $('#cprev'); if (cp) cp.onchange = () => { renderCustos.prev = cp.checked; route(); };
  const cc = $('#ccsv'); if (cc) cc.onclick = () => csvCustos(renderCustos.dados);
}
// Valores das rotas: ficam em Grade e rotas (valor fixo por trecho). Acréscimos são lançados em Viagens.
function valoresRotasHtml() {
    const pares = [];
    const ks = Object.keys(SITES);
    for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) pares.push([ks[i], ks[j]]);
    const nome = (k) => `${siteName(k)}${SITE_APELIDO[k] ? ` (${SITE_APELIDO[k]})` : ''}`;
    const t = tabTarifas();
    // Outros destinos: os já cadastrados + os que aparecem em viagens e ainda não têm valor (pendentes).
    const outros = {};
    Object.entries(t).forEach(([k, v]) => { const [x, y] = k.split('|'); if (SITES[x] && SITES[y]) return; const u = SITES[x] ? x : y; outros[k] = { u, nome: v.nome || (u === x ? y : x), pend: false }; });
    viagens().filter((v) => v.st !== 'naorealizada').forEach((v) => v.rs.forEach((r) => {
      [[r.origem, r.destino], ...(r.bv ? [[r.destino, r.bv.volta]] : [])].forEach(([o, d]) => {
        const no = normLoc(o), nd = normLoc(d);
        if (!SITES[no] === !SITES[nd]) return; // só unidade ↔ fora
        const u = SITES[no] ? no : nd, fora = SITES[no] ? d : o, k = parKey(u, normLoc(fora));
        if (!outros[k]) outros[k] = { u, nome: String(fora).trim(), pend: true };
      });
    }));
    const outrosOrd = Object.entries(outros).sort((x, y) => (y[1].pend - x[1].pend) || x[1].nome.localeCompare(y[1].nome));
    const nPend = outrosOrd.filter(([k]) => { const v = t[k]; return !v || v.carro == null; }).length;
    const linha = (k, rotulo, v, extra = '') => `<tr data-k="${esc(k)}" ${extra}><td>${rotulo}</td>
            <td><input class="tv" data-m="carro" type="number" min="0" step="0.01" inputmode="decimal" value="${v.carro ?? ''}" aria-label="Valor táxi"></td>
            <td><input class="tv" data-m="moto" type="number" min="0" step="0.01" inputmode="decimal" value="${v.moto ?? ''}" aria-label="Valor moto"></td></tr>`;
    // Exemplo ao vivo com a tabela atual
    const ex = ratear({ tipo: 'grade', hora: (grade().find((g) => g.paradas[0] === 'MED' && g.paradas[g.paradas.length - 1] === 'SUP') || {}).hora, k: '__exemplo__',
      rs: [{ origem: 'MED', destino: 'CD', cc: '4010 – Tecnologia da Informação' }, { origem: 'MED', destino: 'SUP', cc: '3020 – Garantia da Qualidade' }] });
    return `
      <div class="grid-2">
        <section class="card"><h2 class="section-t">Valores das rotas</h2>
          <p class="section-s">Valor <b>fixo</b> de cada corrida (vale para os dois sentidos). <b>Só é alterado aqui</b> — em Viagens a Noemia lança apenas acréscimos (espera, pedágio…).</p>
          <table class="tar-t"><thead><tr><th>Entre as unidades</th><th>Táxi (R$)</th><th>Moto (R$)</th></tr></thead><tbody>
          ${pares.map(([a, b]) => linha(parKey(a, b), `${esc(nome(a))} ↔ ${esc(nome(b))}`, t[parKey(a, b)] || {})).join('')}
          </tbody></table>
          <table class="tar-t tar-o"><thead><tr><th>Outros destinos ${nPend ? `<em class="warn-t">· ${nPend} sem valor</em>` : ''}</th><th>Táxi (R$)</th><th>Moto (R$)</th></tr></thead><tbody>
          ${outrosOrd.map(([k, o]) => linha(k, `${esc(curto(o.u))} ↔ ${esc(o.nome)}${(!t[k] || t[k].carro == null) ? ' <em class="warn-t">sem valor</em>' : ''}${t[k] ? ` <button class="btn-mini tdel" data-k="${esc(k)}" title="Remover destino">Remover</button>` : ''}`, t[k] || {}, `data-nome="${esc(o.nome)}"`)).join('')}
          <tr class="tar-new"><td><select id="tnu" aria-label="Unidade">${Object.keys(SITES).map((k) => `<option value="${k}">${esc(curto(k))}</option>`).join('')}</select>
            <input id="tnd" placeholder="Novo destino (ex.: Centro – Banco)" aria-label="Novo destino"></td>
            <td><input id="tnc" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Valor táxi do novo destino"></td>
            <td><input id="tnm" type="number" min="0" step="0.01" inputmode="decimal" aria-label="Valor moto do novo destino"></td></tr>
          </tbody></table>
          <div id="tarmsg"></div>
          <div class="modal-acts"><button class="btn green" id="tsave">Salvar valores</button></div>
        </section>
        <section class="card"><h2 class="section-t">Como o valor é dividido</h2>
          <ul class="help-list">
            <li>Cada viagem é dividida <b>igualmente entre os setores</b> que estão no carro (não por pessoa).</li>
            <li>Quem <b>não compareceu</b> sai da divisão: a viagem fica só com os setores que foram. Viagem não realizada não é cobrada.</li>
            <li>Bate-volta: pela tabela é ida + volta; se houver espera cobrada, a Noemia lança como acréscimo.</li>
            <li>Na grade, a conta é <b>por trecho</b>: o valor até cada parada é contado a partir da saída da rota. Quem desce antes não paga o resto do caminho.</li>
            <li>O valor da rota é <b>fixo</b>. Acréscimos lançados na viagem são divididos na mesma proporção dos trechos.</li>
            <li>Táxi avulso: o setor do solicitante paga sozinho. Moto agrupada: dividida entre os setores dos envios.</li>
          </ul>
          <div class="ex-box"><b>Exemplo com a tabela atual</b>
            <p>TI vai do Site 1 até o CD e Garantia vai do Site 1 até a Life, no mesmo carro.</p>
            ${ex.total != null ? `<ul>${ex.legs.map((l) => `<li>${esc(siteName(l.de))} → ${esc(siteName(l.para))}: <b>${brl(l.valor)}</b> ÷ ${l.ccs.length} = ${l.ccs.map((cc) => `${esc(setorCurto(cc))} ${brl(l.valor / l.ccs.length)}`).join(' · ')}</li>`).join('')}</ul>
              <div class="chips">${rateioChips(ex)}</div>` : '<p class="bad-t">Preencha os valores Site 1 ↔ CD e Site 1 ↔ Life para ver o exemplo.</p>'}
          </div>
        </section>
      </div>`;
}
function bindValoresRotas() {
  const ts = $('#tsave');
  if (ts) ts.onclick = () => {
    const novo = {};
    let erro = '';
    document.querySelectorAll('.tar-t tr[data-k]').forEach((tr) => {
      const o = {};
      tr.querySelectorAll('.tv').forEach((inp) => {
        const raw = String(inp.value).trim().replace(',', '.');
        if (raw === '') { o[inp.dataset.m] = null; return; }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) erro = 'Valores devem ser números maiores ou iguais a zero.';
        o[inp.dataset.m] = Math.round(n * 100) / 100;
      });
      if (tr.dataset.nome) { if (o.carro == null && o.moto == null) return; o.nome = tr.dataset.nome; }
      novo[tr.dataset.k] = o;
    });
    const nd = ($('#tnd') || {}).value ? $('#tnd').value.trim() : '';
    if (nd) {
      const u = $('#tnu').value;
      if (SITES[normLoc(nd)]) erro = 'Esse destino já é uma unidade — use a tabela de cima.';
      const o = { nome: nd };
      [['carro', '#tnc'], ['moto', '#tnm']].forEach(([m, id]) => {
        const raw = String($(id).value).trim().replace(',', '.');
        if (raw === '') { o[m] = null; return; }
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) erro = 'Valores devem ser números maiores ou iguais a zero.';
        o[m] = Math.round(n * 100) / 100;
      });
      if (o.carro == null && o.moto == null) erro = erro || 'Informe o valor do novo destino.';
      novo[parKey(u, normLoc(nd))] = o;
    }
    if (erro) { $('#tarmsg').innerHTML = `<div class="msg-box bad">${erro}</div>`; return; }
    const antes = JSON.stringify(tabTarifas());
    S.tarifas = novo;
    audit('Valores das rotas alterados', 'Tabela de valores', antes, JSON.stringify(novo));
    save(); route(); toast('Valores das rotas salvos.');
  };
  document.querySelectorAll('.tdel').forEach((b) => {
    b.onclick = () => {
      const t = tabTarifas(), k = b.dataset.k;
      if (!t[k]) return;
      const antes = JSON.stringify(t[k]);
      delete t[k];
      audit('Destino removido dos valores', k, antes, '');
      save(); route(); toast('Destino removido.');
    };
  });
}

function csvCustos(d) {
  if (!d || !d.setores.length) { toast('Nada para exportar.'); return; }
  const q = (v) => { let x = String(v ?? ''); if (/^[=+\-@]/.test(x)) x = `'${x}`; return `"${x.replace(/"/g, '""')}"`; };
  const num = (n) => Number(n).toFixed(2).replace('.', ',');
  const head = ['setor', 'centro_custo', 'data', 'hora', 'tipo', 'solicitacoes', 'valor_viagem', 'parte_do_setor'];
  const lines = [];
  d.setores.forEach(([cc, sx]) => sx.itens.forEach(({ v, val, rt }) => lines.push([setorCurto(cc), cc, fmtDate(v.data), v.hora, TIPOS[v.tipo], v.rs.map((r) => r.id).join(' '), num(rt.total), num(val)].map(q).join(';'))));
  d.setores.forEach(([cc, sx]) => lines.push([setorCurto(cc), cc, 'TOTAL DO MÊS', '', '', '', '', num(sx.valor)].map(q).join(';')));
  const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `custos_por_setor_${d.mes}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  audit('Exportação CSV (custos)', d.mes, '', `${d.setores.length} setores`); save();
  toast('Relatório exportado.');
}

// ---------------- Aprovação do gestor imediato (vem do AD) ----------------
// Link do e-mail: token aleatório por solicitação (vale para ida e volta ligadas). Só serve enquanto aguarda o gestor.
function tokenAprov(r) {
  if (!r.tok) {
    const b = new Uint8Array(18);
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) crypto.getRandomValues(b); else for (let i = 0; i < b.length; i++) b[i] = Math.floor(Math.random() * 256);
    r.tok = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
    const pr = parDe(r); if (pr) pr.tok = r.tok;
  }
  return r.tok;
}
const linkAprov = (r) => `#aprovar/${tokenAprov(r)}`;
function emailAprovacao(r) { // e-mail que o gestor recebeu (gera se a solicitação veio dos dados de exemplo)
  let e = caixa().find((x) => x.kind === 'aprovacao' && x.refs[0] === r.id);
  if (!e) { pedirAprovacao(r); e = caixa()[caixa().length - 1]; save(); }
  return e;
}
function pedirAprovacao(r) {
  const L = [`Olá, ${r.gestor.nome.split(' ')[0]}!`, '', `${r.nome} (${r.cc}) solicitou um transporte que precisa da sua aprovação:`, '',
    `${r.id} — ${TIPOS[r.tipo]}${r.excecao ? ' (fora do prazo mínimo)' : ''}`, `Data e horário: ${fmtDT(r.data, r.hora)}`,
    `Trecho: ${siteName(r.origem)} → ${siteName(r.destino)} · ${r.pax} passageiro(s)`, `Justificativa: ${r.just}`, '',
    'Clique em "Analisar solicitação" para aprovar ou reprovar.', 'Este é um e-mail automático — não responda.', '', 'Mobilab · Facilities Natulab'];
  tokenAprov(r);
  caixa().push({ id: `EM-${caixa().length + 1}`, para: r.gestor.email, nome: r.gestor.nome, refs: [r.id], quando: nowStamp(), lida: false, kind: 'aprovacao',
    assunto: `Aprovação pendente: ${r.id} de ${r.nome}`, corpo: L.join('\n') });
  audit('Enviada ao gestor para aprovação', r.id, '', `${r.gestor.nome} <${r.gestor.email}>`);
}
function decisaoGestor(r, ok, motivo) {
  const rs = [r, parDe(r)].filter((x) => x && x.status === 'gestor');
  const quando = nowStamp(), ts = Date.now();
  rs.forEach((x) => {
    x.aprov = { ok, quando, ts, por: x.gestor.nome, motivo: motivo || '' };
    if (ok) { x.status = 'analise'; audit('Aprovada pelo gestor', x.id, 'Aguardando gestor', x.gestor.nome); }
    else { x.status = 'recusada'; x.motivo = `Reprovada pelo gestor ${x.gestor.nome}${motivo ? `: ${motivo}` : ''}`; audit('Reprovada pelo gestor', x.id, 'Aguardando gestor', x.motivo); }
  });
  if (!ok) emailStatus(rs, 'recusada', { motivo: rs[0].motivo });
  save();
}

const REMETENTE = 'noreply@natulab.com.br'; // envio via smtp.office365.com (porta 587, STARTTLS)
const TIPO_CURTO = { grade: 'Grade', cidade: 'Táxi', inter: 'Intermunicipal', moto: 'Moto' };
function renderVisao(page) {
  const now = new Date(), hoje = ymd(now), amanha = ymd(addDays(now, 1));
  const base = isWeekday(now) ? mondayOf(now) : mondayOf(addDays(now, 2)); // fim de semana: mostra a próxima semana útil
  const ini = ymd(base), fim = ymd(addDays(base, 6));
  const vivos = ['gestor', 'analise', 'confirmada', 'reagendada', 'andamento'];
  const byDH = (a, b) => at(a.data, a.hora) - at(b.data, b.hora);
  const emCurso = (r) => r.status === 'andamento' || (r.status === 'confirmada' && r.data === hoje && at(r.data, r.hora) <= now && now < new Date(at(r.data, r.hora).getTime() + durOf(r) * 60000));
  const agoraL = S.reqs.filter(emCurso).sort(byDH);
  const CATS = {
    agora: { tit: 'Acontecendo agora', sub: 'viagens em curso', ic: 'route', cls: 'v-agora', ls: agoraL, o: { agora: true }, vazio: 'Nenhuma viagem em andamento agora.' },
    hoje: { tit: 'Hoje', sub: fmtDate(hoje), ic: 'clock', cls: 'v-hoje', ls: S.reqs.filter((r) => r.data === hoje && !emCurso(r) && [...vivos, 'concluida'].includes(r.status)).sort(byDH), o: {}, vazio: 'Sem mais viagens hoje.' },
    amanha: { tit: 'Amanhã', sub: fmtDate(amanha), ic: 'cal', cls: 'v-amanha', ls: S.reqs.filter((r) => r.data === amanha && vivos.includes(r.status)).sort(byDH), o: {}, vazio: 'Nada programado para amanhã.' },
    semana: { tit: 'Esta semana', sub: `${fmtDate(ini).slice(0, 5)} a ${fmtDate(fim).slice(0, 5)}`, ic: 'cal', cls: 'v-semana', ls: S.reqs.filter((r) => r.data >= ini && r.data <= fim && vivos.includes(r.status)).sort(byDH), o: { porDia: true }, vazio: 'Nada programado nesta semana.' },
    aprov: { tit: 'Em aprovação', sub: 'aguardando o gestor imediato', ic: 'users', cls: 'v-aprov', ls: S.reqs.filter((r) => r.status === 'gestor').sort(byDH), o: { dia: true }, vazio: 'Nenhum pedido aguardando gestor.' },
    ret: { tit: 'Retornos de aprovação', sub: 'respostas dos gestores', ic: 'mail', cls: 'v-ret', ls: S.reqs.filter((r) => r.aprov).sort((a, b) => (b.aprov.ts || 0) - (a.aprov.ts || 0)), o: { dia: true, ret: true }, vazio: 'Nenhuma resposta ainda.' },
    canc: { tit: 'Canceladas e recusadas', sub: 'desta semana em diante', ic: 'x', cls: 'v-canc', ls: S.reqs.filter((r) => ['cancelada', 'recusada', 'naorealizada'].includes(r.status) && r.data >= ini).sort((a, b) => byDH(b, a)), o: { dia: true, canc: true }, vazio: 'Nenhum cancelamento.' },
  };
  const diaTxt = (ds) => (ds === hoje ? 'Hoje' : ds === amanha ? 'Amanhã' : `${DIAS[at(ds, '12:00').getDay()].slice(0, 3)} ${fmtDate(ds).slice(0, 5)}`);
  const destTxt = (r) => (r.tipo === 'moto' ? `${siteName(r.origem)} → ${siteName(r.destino)} · ${r.vol}× ${r.item}` : `${siteName(r.origem)} → ${siteName(r.destino)}`);
  // Quem aprova é o gestor; o Facilities só acompanha e pode notificar para agilizar.
  const simBtns = (r) => `<button class="btn sm g-not" data-id="${esc(r.id)}" title="Reenvia o pedido de aprovação ao gestor">${ico('bell', 14)} Notificar gestor</button>`;
  // Texto de situação complementar (gestor, retorno de aprovação, motivo, veículo)
  const extraTxt = (r, o) => {
    const v = veic(r.veiculo), m = mot(r.motorista);
    if (o.agora || emCurso(r)) return { c: 'ok', h: `🚗 ${esc(v ? v.nome : '')}${m ? ` · ${esc(m.nome)}` : ''} · até ~${esc(addMin(r.hora, durOf(r)))}` };
    if (r.status === 'gestor') return { c: 'warn', h: `Gestor: <b>${esc(r.gestor.nome)}</b>${r.aprovPedido ? ` · pedido em ${esc(r.aprovPedido.slice(0, 17))}` : ''}${r.excecao ? ' · fora do prazo' : ''}` };
    if (o.ret && r.aprov) return { c: r.aprov.ok ? 'ok' : 'bad', h: `${r.aprov.ok ? '✓ Aprovado' : '✕ Reprovado'} por <b>${esc(r.aprov.por)}</b> · ${esc(r.aprov.quando.slice(0, 17))}${r.aprov.motivo ? ` — ${esc(r.aprov.motivo)}` : ''}` };
    if (['cancelada', 'recusada', 'naorealizada'].includes(r.status)) return { c: 'bad', h: esc(r.motivo || '') };
    if (v) return { c: '', h: `${esc(v.nome)}${m ? ` · ${esc(m.nome)}` : ''}${r.wpp ? ' · ✓ WhatsApp' : ' · a enviar'}${r.mail ? ' · ✉ e-mail' : ''}` };
    if (r.aprov && r.aprov.ok) return { c: 'ok', h: `✓ Aprovado por ${esc(r.aprov.por)} · aguardando análise do Facilities` };
    return { c: '', h: r.status === 'analise' ? 'Aguardando análise do Facilities' : '' };
  };

  const item = (r, o = {}) => {
    const x = extraTxt(r, o);
    return `<div class="vi" data-id="${esc(r.id)}" tabindex="0" role="button">
      <span class="vi-t">${o.dia ? `<small>${esc(diaTxt(r.data))}</small>` : ''}${esc(r.hora)}</span>
      <span class="vi-b"><span class="vi-l"><b>${esc(r.nome)}</b><span class="tp tp-${r.tipo}">${TIPO_CURTO[r.tipo]}</span>${r.perna ? `<span class="tp">${pernaTxt(r)}</span>` : r.bv ? '<span class="tp">Bate-volta</span>' : ''}</span>
        <small>${esc(r.id)} · ${esc(destTxt(r))}${r.tipo !== 'moto' && r.pax ? ` · ${r.pax} pax` : ''}</small>
        ${x.h ? `<small class="vi-x ${x.c}">${x.h}${o.ret && r.aprov && r.aprov.ok && r.status === 'analise' ? ' · <a href="#painel">analisar no Painel →</a>' : ''}</small>` : ''}
        ${r.status === 'gestor' ? `<span class="vi-acts">${simBtns(r)}</span>` : ''}</span>
      <span class="vi-s">${o.agora ? '<span class="pill st-andamento">Em andamento</span>' : pill(r.status)}</span></div>`;
  };
  const corpo = (k) => {
    const c = CATS[k];
    if (!c.ls.length) return `<div class="vp-empty">${c.vazio}</div>`;
    if (!c.o.porDia) return c.ls.map((r) => item(r, c.o)).join('');
    let out = '', dia = '';
    c.ls.forEach((r) => { if (r.data !== dia) { dia = r.data; out += `<div class="vp-day">${esc(diaTxt(dia))} <small>${fmtDate(dia)}</small></div>`; } out += item(r); });
    return out;
  };
  const painel = (k) => {
    const c = CATS[k];
    return `<section class="vp ${c.cls}"><button class="vp-h" data-x="${k}" title="Expandir ${esc(c.tit)}" aria-label="Expandir ${esc(c.tit)}">
      <span class="vp-i">${ico(c.ic, 18)}</span><span><b>${c.tit}</b><small>${c.sub}</small></span><span class="n">${c.ls.length}</span><span class="vp-x">${ico('expand', 16)}</span></button>
      <div class="vp-b">${corpo(k)}</div></section>`;
  };

  // ---------- Tela expandida: todas as solicitações da caixa escolhida ----------
  const expandida = (k) => {
    const c = CATS[k];
    const q = (UI.vq || '').toLowerCase();
    const linhas = c.ls.filter((r) => !q || `${r.id} ${r.nome} ${r.cc} ${siteName(r.origem)} ${siteName(r.destino)} ${r.item || ''} ${(r.gestor || {}).nome || ''} ${STATUS[r.status]}`.toLowerCase().includes(q));
    const row = (r) => {
      const x = extraTxt(r, c.o);
      return `<tr class="vx-r" data-id="${esc(r.id)}" tabindex="0">
        <td><b>${esc(diaTxt(r.data))}</b><small>${fmtDate(r.data)}</small></td><td><b>${esc(r.hora)}</b></td>
        <td><b class="sid">${esc(r.id)}</b>${r.par ? `<small>${pernaTxt(r)} · ${esc(r.par)}</small>` : r.bv ? '<small>Bate-volta</small>' : ''}</td>
        <td>${esc(r.nome)}<small>${esc(r.cc)}</small></td>
        <td><span class="tp tp-${r.tipo}">${TIPO_CURTO[r.tipo]}</span>${r.excecao ? '<small>fora do prazo</small>' : ''}</td>
        <td>${esc(siteName(r.origem))} → ${esc(siteName(r.destino))}<small>${esc(r.tipo === 'moto' ? `${r.vol}× ${r.item} · recebe: ${r.recebedor}` : `${r.pax} pax${r.bag !== 'nenhuma' ? ` · ${BAG[r.bag].l.split(' ')[0].toLowerCase()}` : ''}`)}</small></td>
        <td>${r.gestor ? `${esc(r.gestor.nome)}<small>${r.aprov ? (r.aprov.ok ? '✓ aprovou' : '✕ reprovou') + ` · ${esc(r.aprov.quando.slice(0, 17))}` : 'aguardando'}</small>` : '<small>—</small>'}</td>
        <td>${k === 'agora' ? '<span class="pill st-andamento">Em andamento</span>' : pill(r.status)}</td>
        <td class="vx-obs ${x.c}">${x.h || '<small>—</small>'}</td>
        <td class="vx-a">${r.status === 'gestor' ? simBtns(r) : ''}<button class="btn sm vx-open" data-id="${esc(r.id)}">Abrir</button></td></tr>`;
    };
    return `
      <div class="vx-head">
        <button class="btn vx-back" id="vxback">${ico('left', 16)} Visão geral</button>
        <div><span class="eyebrow">Visão geral › ${esc(c.tit)}</span><h1>${esc(c.tit)} <span class="vx-n">${c.ls.length}</span></h1><p>${esc(c.sub)}</p></div>
        <div class="vx-tools">
          <label class="search">${ico('search', 16)}<input id="vxq" placeholder="Buscar nº, pessoa, setor, destino, gestor…" value="${esc(UI.vq || '')}" aria-label="Buscar"></label>
          <button class="btn" id="vxcsv">Exportar CSV</button>
        </div>
      </div>
      <div class="seg vx-tabs">${Object.entries(CATS).map(([kk, cc]) => `<button class="seg-b${kk === k ? ' on' : ''}" data-x="${kk}">${cc.tit} (${cc.ls.length})</button>`).join('')}</div>
      <div class="card vx-card"><div class="table-wrap"><table class="vx-t">
        <thead><tr><th>Dia</th><th>Hora</th><th>Nº</th><th>Solicitante</th><th>Tipo</th><th>Trecho</th><th>Gestor (AD)</th><th>Situação</th><th>Detalhe</th><th></th></tr></thead>
        <tbody>${linhas.length ? linhas.map(row).join('') : `<tr><td colspan="10" class="empty">${q ? 'Nada encontrado para a busca.' : c.vazio}</td></tr>`}</tbody></table></div></div>`;
  };

  const k = UI.vx && CATS[UI.vx] ? UI.vx : null;
  shell(page, k ? expandida(k) : `
    <div class="vg-head">
      <div><span class="eyebrow">Facilities · tudo em uma tela</span><h1>Visão geral</h1></div>
      <div class="vg-meta"><span>${esc(DIAS[now.getDay()])}, ${fmtDate(hoje)} · ${pad(now.getHours())}:${pad(now.getMinutes())}</span>
        <span class="lbl">Clique no título de uma caixa para ver tudo · aprovações vêm do gestor imediato (AD simulado)</span>
        <a class="btn sm" href="#painel">Abrir Painel de análise</a></div>
    </div>
    <div class="vgrid">${['agora', 'hoje', 'amanha', 'semana', 'aprov', 'ret', 'canc'].map(painel).join('')}</div>`);

  // ---------- eventos ----------
  document.querySelectorAll('[data-x]').forEach((b) => { b.onclick = () => { UI.vx = b.dataset.x; UI.vq = ''; route(); window.scrollTo && window.scrollTo(0, 0); }; });
  document.querySelectorAll('.vi').forEach((el) => {
    el.onclick = (e) => { if (e.target.closest('button, a')) return; openDetalhe(el.dataset.id); };
    el.onkeydown = (e) => { if (e.key === 'Enter') openDetalhe(el.dataset.id); };
  });
  document.querySelectorAll('.vx-r').forEach((el) => {
    el.onclick = (e) => { if (e.target.closest('button, a')) return; openDetalhe(el.dataset.id); };
    el.onkeydown = (e) => { if (e.key === 'Enter') openDetalhe(el.dataset.id); };
  });
  document.querySelectorAll('.vx-open').forEach((b) => { b.onclick = () => openDetalhe(b.dataset.id); });
  const back = $('#vxback'); if (back) back.onclick = () => { UI.vx = null; UI.vq = ''; route(); };
  const vq = $('#vxq');
  if (vq) vq.oninput = () => { // filtra as linhas na hora, sem redesenhar
    const q = vq.value.trim().toLowerCase(); UI.vq = q;
    document.querySelectorAll('.vx-r').forEach((tr) => { tr.hidden = !!q && !tr.textContent.toLowerCase().includes(q); });
  };
  const csv = $('#vxcsv'); if (csv && k) csv.onclick = () => exportCsv(CATS[k].ls);
  document.querySelectorAll('.g-not').forEach((b) => {
    b.onclick = () => {
      const r = S.reqs.find((x) => x.id === b.dataset.id);
      pedirAprovacao(r);
      const em = caixa()[caixa().length - 1];
      em.assunto = `Lembrete: ${em.assunto}`;
      audit('Gestor notificado (lembrete)', r.id, '', r.gestor.email);
      save(); route(); toast(`Lembrete enviado para ${r.gestor.nome}.`);
    };
  });
}
// Página aberta pelo botão do e-mail do gestor. O clique só ABRE a página (filtros de segurança do e-mail
// costumam abrir links sozinhos); a decisão vale quando o gestor clica em Aprovar ou Reprovar aqui.
function renderAprovar(tok) {
  if (window.MOBILAB_API) {
    const url = `/api/aprovar/${encodeURIComponent(tok)}`;
    fetch(url, { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).then((j) => telaAprov(j && j.r, j && j.par, j && j.expirado, async (ok, motivo) => {
      const x = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok, motivo }) }).catch(() => null);
      if (!x || !x.ok) toast('Não foi possível registrar. Tente de novo.');
      renderAprovar(tok);
    })).catch(() => telaAprov(null));
    return;
  }
  const r = S.reqs.find((x) => x.tok && x.tok === tok && !(x.perna === 'volta' && parDe(x)));
  telaAprov(r, r && parDe(r), false, (ok, motivo) => { decisaoGestor(r, ok, motivo); renderAprovar(tok); });
}
function telaAprov(r, pr, expirado, decidir) {
  const casca = (inner) => {
    app().innerHTML = `<div class="apv-wrap"><div class="apv-card">
      <div class="apv-top">${brand}<span>Aprovação de viagem</span></div>${inner}
      <p class="apv-ft">Mobilab · Facilities Natulab — ${S.user ? '<a href="#">voltar ao sistema</a>' : 'você pode fechar esta página.'}</p></div></div>`;
  };
  if (!r) { casca('<div class="apv-msg bad"><b>Link inválido ou expirado.</b><p>Confira se abriu o link mais recente do e-mail. Em caso de dúvida, fale com o Facilities.</p></div>'); return; }
  const det = (x) => `<dl class="apv-dl">
      <div><dt>Solicitação</dt><dd>${esc(x.id)} — ${esc(TIPOS[x.tipo])}${x.excecao ? ' <em class="warn-t">fora do prazo mínimo</em>' : ''}</dd></div>
      <div><dt>Data e horário</dt><dd>${esc(fmtDT(x.data, x.hora))}</dd></div>
      <div><dt>Trecho</dt><dd>${esc(siteName(x.origem))} → ${esc(siteName(x.destino))}${x.bv ? ` · bate-volta para ${esc(siteName(x.bv.volta))}` : ''}</dd></div>
      <div><dt>Passageiros</dt><dd>${esc(x.pax)}</dd></div></dl>`;
  const head = `<h1>${esc(r.nome)}</h1><p class="apv-sub">${esc(r.cc)} · solicitou um transporte que precisa da sua aprovação, ${esc(r.gestor.nome.split(' ')[0])}.</p>`;
  if (r.status !== 'gestor') {
    const a = r.aprov;
    casca(`${head}${det(r)}<div class="apv-msg ${a && a.ok ? 'ok' : 'bad'}"><b>${a ? `${a.ok ? 'Aprovada' : 'Reprovada'} por ${esc(a.por)} em ${esc(a.quando)}` : 'Esta solicitação não está mais aguardando aprovação.'}</b>${a && a.motivo ? `<p>Motivo: ${esc(a.motivo)}</p>` : ''}<p>Nada mais a fazer por aqui.</p></div>`);
    return;
  }
  if (expirado) { casca(`${head}${det(r)}<div class="apv-msg bad"><b>Este link expirou.</b><p>O horário da viagem já passou.</p></div>`); return; }
  casca(`${head}${det(r)}${pr && pr.status === 'gestor' ? `<p class="apv-sub"><b>Retorno:</b></p>${det(pr)}` : ''}
    <div class="apv-just"><small>Justificativa</small><p>${esc(r.just)}</p></div>
    <div class="apv-acts"><button class="btn green lg" id="apok">${ico('check', 18)} Aprovar</button><button class="btn red lg" id="apno">Reprovar</button></div>
    <div id="apmot" hidden><label class="field"><span>Motivo da reprovação <small>(opcional)</small></span><textarea id="apmt" rows="3" placeholder="Ex.: reunião pode ser on-line"></textarea></label>
      <div class="apv-acts"><button class="btn" id="apcan">Cancelar</button><button class="btn red" id="apconf">Confirmar reprovação</button></div></div>`);
  const trava = () => document.querySelectorAll('.apv-card button').forEach((b) => { b.disabled = true; });
  $('#apok').onclick = () => { trava(); decidir(true, ''); };
  $('#apno').onclick = () => { $('#apmot').hidden = false; $('.apv-acts').hidden = true; $('#apmt').focus(); };
  $('#apcan').onclick = () => { $('#apmot').hidden = true; $('.apv-acts').hidden = false; };
  $('#apconf').onclick = () => {
    trava(); decidir(false, $('#apmt').value.trim());
  };
}
// ---------------- TI: tudo em uma tela (ícones) ----------------
const TILES_TI = [
  ['visao', 'Visão geral', 'grid', 'Facilities'], ['painel', 'Painel de análise', 'list', 'Facilities'], ['viagens', 'Viagens', 'route', 'Facilities'],
  ['solicitacoes', 'Solicitações', 'filter', 'Facilities'], ['motoristas', 'Motoristas', 'car', 'Facilities'], ['grade', 'Grade e rotas', 'clock', 'Facilities'],
  ['custos', 'Custos por setor', 'money', 'Facilities'], ['agenda', 'Agenda', 'cal', 'Colaborador'], ['minhas', 'Minhas solicitações', 'user', 'Colaborador'],
  ['aprovacoes', 'Aprovações', 'check', 'Gestor'], ['usuarios', 'Usuários', 'users', 'Administração'], ['historico', 'Histórico', 'history', 'Administração'],
  ['cadastros', 'Cadastros e parâmetros', 'gear', 'Administração'], ['#ajuda', 'Ajuda', 'info', 'Administração'],
];
function renderInicioTI(page) {
  const ok = navDe(S.user).map(([k]) => k);
  const tiles = TILES_TI.filter(([k]) => k === '#ajuda' || ok.includes(k));
  const nPend = S.reqs.filter((r) => r.status === 'analise').length, nGestor = S.reqs.filter((r) => r.status === 'gestor').length;
  const extra = { painel: nPend, visao: nGestor ? `${nGestor} aguard. gestor` : '' };
  shell(page, `
    <div class="ti-home">
      <div class="ti-tiles">${tiles.map(([k, l, ic, grp]) => `<a class="ti-tile" href="${k.startsWith('#') ? '#' : `#${k}`}" ${k === '#ajuda' ? 'id="tajuda"' : ''} title="${esc(grp)}">
          <span class="ti-ic g-${esc(grp.toLowerCase().replace(/[^a-z]/g, ''))}">${ico(ic, 26)}</span><b>${esc(l)}</b>${extra[k] ? `<span class="ti-badge">${esc(extra[k])}</span>` : ''}</a>`).join('')}</div>
      <aside class="ti-brand"><div class="ti-art">${heroArt}</div><h2>Mobilab</h2><p>Táxi e Moto Táxi corporativo</p>
        <div class="ti-line"><i></i><span>NATULAB · TI / ADMINISTRAÇÃO</span><i></i></div></aside>
    </div>`);
  const aj = $('#tajuda'); if (aj) aj.onclick = (e) => { e.preventDefault(); openAjuda(); };
}

// ---------------- TI: gestão de usuários ----------------
// No sistema os usuários vêm do servidor (quem já entrou + cadastrados pela TI). Na simulação, da lista local.
const Usr = {
  async listar() {
    if (window.MOBILAB_API) { const r = await fetch('/api/usuarios', { cache: 'no-store' }); const j = await r.json(); if (!r.ok) throw new Error(j.erro); return j.usuarios; }
    if (!S.usuarios) {
      const m = {};
      const add = (email, nome, cc, perfil, origem) => { if (email && !m[email]) m[email] = { email, nome, cc: cc || '', perfil: perfil || '', padrao: perfil || 'colaborador', ativo: true, origem, ultimo_login: '' }; };
      add('facilities@natulab.com.br', 'Equipe Facilities', 'Facilities', 'facilities', 'login');
      add('ti@natulab.com.br', 'Equipe TI', '4010 – Tecnologia da Informação', 'ti', 'login');
      S.reqs.forEach((r) => { add(r.email, r.nome, r.cc, '', 'login'); if (r.gestor) add(r.gestor.email, r.gestor.nome, '', '', 'gestor-ad'); });
      S.usuarios = Object.values(m);
    }
    return S.usuarios;
  },
  async salvar(dados) {
    if (window.MOBILAB_API) {
      const r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados) });
      const j = await r.json(); if (!r.ok) throw new Error(j.erro); return j.usuario;
    }
    const email = String(dados.email || '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('Informe um e-mail válido.');
    if (email === S.user.email && (dados.ativo === false || (dados.perfil && dados.perfil !== 'ti'))) throw new Error('Você não pode tirar o seu próprio acesso de TI.');
    let u = S.usuarios.find((x) => x.email === email);
    if (!u) { u = { email, nome: dados.nome || email, cc: '', perfil: '', padrao: 'colaborador', ativo: true, origem: 'cadastro-ti', ultimo_login: '' }; S.usuarios.push(u); }
    if (dados.nome) u.nome = dados.nome;
    ['cc', 'cargo', 'login'].forEach((k) => { if (dados[k] !== undefined) u[k] = dados[k]; });
    if (dados.gestor_email !== undefined) {
      if (dados.gestor_email === email) throw new Error('A pessoa não pode ser gestora de si mesma.');
      const g = S.usuarios.find((x) => x.email === dados.gestor_email);
      if (dados.gestor_email && !g) throw new Error('Gestor não encontrado. Escolha alguém da lista de usuários.');
      u.gestor_email = dados.gestor_email; u.gestor = g ? g.nome : '';
    }
    if (dados.travado !== undefined) u.travado = dados.travado;
    if (dados.perfil !== undefined) u.perfil = dados.perfil;
    if (dados.ativo !== undefined) u.ativo = dados.ativo;
    audit('Usuário alterado', email, '', `${u.perfil || 'padrão'} · ${u.ativo ? 'ativo' : 'bloqueado'}`); save();
    return u;
  },
  // só o administrador (TI) define a senha do Mobilab de um colaborador
  async senha(email, senha) {
    if (window.MOBILAB_API) {
      const r = await fetch('/api/usuarios/senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, senha }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.erro); return true;
    }
    if (senha.length < 8) throw new Error('A senha precisa ter de 8 a 128 caracteres.');
    audit('Senha alterada pela TI', email, '', 'nova senha definida'); save();
    return true;
  },
};
const senhaAleatoria = () => {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', v = new Uint32Array(12);
  crypto.getRandomValues(v);
  return Array.from(v, (n) => a[n % a.length]).join('').replace(/(.{4})(?=.)/g, '$1-');
};
const PERFIL_L = { colaborador: 'Colaborador', facilities: 'Facilities', ti: 'TI / Administração' };
const ORIGEM_L = { login: 'Já entrou', ad: 'Importado do AD', rh: 'Base do RH + AD', 'gestor-ad': 'Gestor (AD)', 'cadastro-ti': 'Cadastrado pela TI' };
async function renderUsuarios(page) {
  shell(page, `<div class="pg-head"><div><nav class="crumb"><span>Administração</span>${ico('right', 12)}<b>Usuários</b></nav><h1>Usuários</h1>
      <p>Quem acessa o Mobilab e com qual perfil. O login é pelo AD; aqui a TI define o perfil e pode bloquear o acesso.</p></div></div>
    <div class="card empty">Carregando…</div>`);
  let us;
  try { us = await Usr.listar(); } catch (e) { $('main .card').textContent = e.message || 'Não foi possível carregar.'; return; }
  if (route.page !== 'usuarios') return;
  const q = (renderUsuarios.q || '').toLowerCase(), fp = renderUsuarios.f || '';
  const ef = (u) => u.perfil || u.padrao || 'colaborador';
  const lista = us.filter((u) => (!q || `${u.nome} ${u.email} ${u.cc}`.toLowerCase().includes(q)) && (!fp || (fp === 'bloq' ? !u.ativo : ef(u) === fp)));
  const cont = (f) => us.filter((u) => (f === 'bloq' ? !u.ativo : ef(u) === f)).length;
  $('main').innerHTML = `<div class="pg-head"><div><nav class="crumb"><span>Administração</span>${ico('right', 12)}<b>Usuários</b></nav><h1>Usuários</h1>
      <p>Quem acessa o Mobilab e com qual perfil. O login é pelo AD; aqui a TI define o perfil e pode bloquear o acesso.</p></div>
      <div class="mini-kpis"><div class="mk"><small>Usuários</small><b>${us.length}</b></div><div class="mk"><small>Facilities</small><b>${cont('facilities')}</b></div>
        <div class="mk"><small>TI</small><b>${cont('ti')}</b></div><div class="mk ${cont('bloq') ? 'warn' : ''}"><small>Bloqueados</small><b>${cont('bloq')}</b></div></div></div>
    <div class="toolbar vtools">
      <div class="seg">${[['', 'Todos'], ['colaborador', 'Colaboradores'], ['facilities', 'Facilities'], ['ti', 'TI'], ['bloq', 'Bloqueados']].map(([k, l]) => `<button class="seg-b${fp === k ? ' on' : ''}" data-uf="${k}">${l}</button>`).join('')}</div>
      <label class="search">${ico('search', 16)}<input id="uq" placeholder="Buscar nome, e-mail ou setor…" value="${esc(renderUsuarios.q || '')}" aria-label="Buscar usuário"></label>
      <button class="btn green" id="unovo">${ico('userplus', 16)} Novo usuário</button>
    </div>
    <div class="card"><div class="table-wrap"><table class="tbl-ap usr-t"><thead><tr><th>Nome</th><th>E-mail</th><th>Setor</th><th>Gestor imediato</th><th>Perfil</th><th>Acesso</th><th>Origem</th><th>Último acesso</th><th></th></tr></thead><tbody>
      ${lista.map((u) => `<tr class="${u.ativo ? '' : 'bloq'}"><td><b>${esc(u.nome || '—')}</b>${u.travado ? ' <span class="tag-ed" title="Editado no Mobilab — a importação do AD não altera estes dados">editado</span>' : ''}${u.cargo ? `<br><small>${esc(u.cargo)}</small>` : ''}</td>
        <td>${esc(u.email)}</td><td>${esc(u.cc || '—')}</td><td>${esc(u.gestor || '—')}</td>
        <td><select class="uperf" data-e="${esc(u.email)}" aria-label="Perfil de ${esc(u.nome)}">${Object.entries(PERFIL_L).map(([k, l]) => `<option value="${k}" ${ef(u) === k ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td><button class="btn-mini uat ${u.ativo ? '' : 'off'}" data-e="${esc(u.email)}">${u.ativo ? 'Ativo' : 'Bloqueado'}</button></td>
        <td><small>${esc(ORIGEM_L[u.origem] || u.origem || '—')}</small></td><td><small>${esc(u.ultimo_login || '—')}</small></td>
        <td><button class="btn sm uedit" data-e="${esc(u.email)}">Editar</button></td></tr>`).join('') || '<tr><td colspan="9" class="empty">Nenhum usuário neste filtro.</td></tr>'}
    </tbody></table></div>
    <p class="section-s" style="margin-top:10px">Mudanças valem no próximo login da pessoa. Quem foi <b>editado</b> aqui não é alterado pela importação do AD (o Mobilab é a referência). Gestor não é perfil: quem é gestor imediato no AD vê a aba Aprovações automaticamente.</p></div>`;
  const salvar = async (dados, msg) => { try { await Usr.salvar(dados); toast(msg); } catch (e) { toast(e.message || 'Não foi possível salvar.'); } route(); };
  document.querySelectorAll('[data-uf]').forEach((b) => { b.onclick = () => { renderUsuarios.f = b.dataset.uf; route(); }; });
  $('#uq').oninput = (e) => { renderUsuarios.q = e.target.value; clearTimeout(renderUsuarios.t); renderUsuarios.t = setTimeout(() => { route(); setTimeout(() => { const i = $('#uq'); if (i) { i.focus(); i.setSelectionRange(i.value.length, i.value.length); } }, 0); }, 300); };
  document.querySelectorAll('.uperf').forEach((sel) => { sel.onchange = () => salvar({ email: sel.dataset.e, perfil: sel.value }, `Perfil alterado para ${PERFIL_L[sel.value]}.`); });
  document.querySelectorAll('.uat').forEach((b) => {
    b.onclick = () => {
      const bloquear = !b.classList.contains('off');
      if (bloquear && !confirm(`Bloquear o acesso de ${b.dataset.e} ao Mobilab?`)) return;
      salvar({ email: b.dataset.e, ativo: !bloquear }, bloquear ? 'Acesso bloqueado.' : 'Acesso liberado.');
    };
  });
  const editor = (u) => {
    const novo = !u;
    u = u || { email: '', nome: '', login: '', cc: '', cargo: '', gestor_email: '', gestor: '', perfil: 'colaborador', ativo: true, travado: true };
    const setores = [...new Set(us.map((x) => x.cc).filter(Boolean))].sort((x, y) => x.localeCompare(y));
    const gtxt = (x) => `${x.nome} <${x.email}>`;
    const g0 = us.find((x) => x.email === u.gestor_email);
    openModal(`<h3>${novo ? 'Novo usuário' : 'Editar usuário'}</h3>
      <p class="sub">${novo ? 'Cadastre antes do primeiro login ou para quem não está no AD.' : 'Ajuste setor, cargo, gestor e perfil quando houver mudança.'} Os dados editados aqui valem mais que os do AD.</p>
      <div class="form-grid">
        <div class="f full"><label>E-mail corporativo</label><input class="input" id="ue_email" value="${esc(u.email)}" ${novo ? '' : 'readonly'} placeholder="nome.sobrenome@natulab.com.br"></div>
        <div class="f"><label>Nome</label><input class="input" id="ue_nome" value="${esc(u.nome)}"></div>
        <div class="f"><label>Login de rede</label><input class="input" id="ue_login" value="${esc(u.login || '')}" placeholder="nome.sobrenome"></div>
        <div class="f"><label>Setor</label><input class="input" id="ue_cc" list="ue_setores" value="${esc(u.cc || '')}"><datalist id="ue_setores">${setores.map((x) => `<option value="${esc(x)}">`).join('')}</datalist></div>
        <div class="f"><label>Cargo</label><input class="input" id="ue_cargo" value="${esc(u.cargo || '')}"></div>
        <div class="f full"><label>Gestor imediato <small>(aprova as viagens intermunicipais)</small></label>
          <input class="input" id="ue_gestor" list="ue_gestores" value="${g0 ? esc(gtxt(g0)) : ''}" placeholder="Digite o nome e escolha na lista">
          <datalist id="ue_gestores">${us.filter((x) => x.email !== u.email && x.ativo).map((x) => `<option value="${esc(gtxt(x))}">`).join('')}</datalist></div>
        <div class="f"><label>Perfil</label><select class="input" id="ue_perfil">${Object.entries(PERFIL_L).map(([k, l]) => `<option value="${k}" ${(u.perfil || u.padrao || 'colaborador') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
        <div class="f"><label>Acesso</label><select class="input" id="ue_ativo"><option value="1" ${u.ativo ? 'selected' : ''}>Ativo</option><option value="0" ${u.ativo ? '' : 'selected'}>Bloqueado</option></select></div>
        <div class="f full"><label class="check"><input type="checkbox" id="ue_trava" ${u.travado ? 'checked' : ''}> <span>Manter estes dados mesmo se o AD mudar <small>(a importação do AD não altera nome, setor, cargo e gestor)</small></span></label></div>
        ${S.user.role === 'ti' ? `<div class="f full"><label for="ue_senha">Nova senha do Mobilab <small>(deixe em branco para manter a atual)</small></label>
          <div style="display:flex;gap:8px"><div class="pw" style="flex:1"><input class="input" id="ue_senha" type="password" autocomplete="new-password" placeholder="Mínimo de 8 caracteres">
            <button type="button" id="ue_olho" aria-label="Mostrar senha"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div>
            <button type="button" class="btn" id="ue_gerar">Gerar</button></div></div>` : ''}
      </div>
      <div id="uemsg"></div><div class="modal-acts"><button class="btn" id="uec">Cancelar</button><button class="btn green" id="ueok">${novo ? 'Cadastrar' : 'Salvar'}</button></div>`);
    // mexeu em nome/setor/cargo/gestor: já marca para o AD não desfazer
    ['#ue_nome', '#ue_cc', '#ue_cargo', '#ue_gestor'].forEach((id) => $(id).addEventListener('input', () => { $('#ue_trava').checked = true; }));
    $('#uec').onclick = closeModal;
    if ($('#ue_senha')) {
      $('#ue_olho').onclick = () => { const p = $('#ue_senha'); p.type = p.type === 'password' ? 'text' : 'password'; };
      $('#ue_gerar').onclick = () => { const p = $('#ue_senha'); p.value = senhaAleatoria(); p.type = 'text'; p.select(); };
    }
    $('#ueok').onclick = async () => {
      const nsenha = $('#ue_senha') ? $('#ue_senha').value : '';
      if (nsenha && (nsenha.length < 8 || nsenha.trim() !== nsenha)) { $('#uemsg').innerHTML = '<div class="msg-box bad">A senha precisa ter no mínimo 8 caracteres, sem espaço no início ou no fim.</div>'; return; }
      const gv = $('#ue_gestor').value.trim();
      const gm = gv.match(/<([^>]+)>/);
      const ge = gv ? (gm ? gm[1] : gv).trim().toLowerCase() : '';
      if (gv && !us.some((x) => x.email === ge)) { $('#uemsg').innerHTML = '<div class="msg-box bad">Escolha o gestor na lista (digite o nome e clique na sugestão).</div>'; return; }
      const dados = { email: $('#ue_email').value.trim().toLowerCase(), nome: $('#ue_nome').value.trim(), login: $('#ue_login').value.trim(),
        cc: $('#ue_cc').value.trim(), cargo: $('#ue_cargo').value.trim(), gestor_email: ge, perfil: $('#ue_perfil').value,
        ativo: $('#ue_ativo').value === '1', travado: $('#ue_trava').checked };
      try {
        await Usr.salvar(dados);
        if (nsenha) await Usr.senha(dados.email, nsenha);
        closeModal(); toast((novo ? 'Usuário cadastrado.' : 'Usuário atualizado.') + (nsenha ? ' Senha alterada — passe para a pessoa por um canal seguro.' : '')); route();
      }
      catch (e) { $('#uemsg').innerHTML = `<div class="msg-box bad">${esc(e.message)}</div>`; }
    };
  };
  $('#unovo').onclick = () => editor(null);
  document.querySelectorAll('.uedit').forEach((b) => { b.onclick = () => editor(us.find((x) => x.email === b.dataset.e)); });
}

function renderAprovacoes(page) {
  const minhas = S.reqs.filter((r) => r.gestor && r.gestor.email === S.user.email && !(r.perna === 'volta' && parDe(r)));
  const pend = minhas.filter((r) => r.status === 'gestor').sort((a, b) => at(a.data, a.hora) - at(b.data, b.hora));
  const dec = minhas.filter((r) => r.aprov).sort((a, b) => (b.aprov.ts || 0) - (a.aprov.ts || 0));
  const card = (r) => `<article class="card ap-card">
      <header><div><b>${esc(r.nome)}</b><small>${esc(r.cc)}</small></div>${pill(r.status)}</header>
      <dl><div><dt>Solicitação</dt><dd>${esc(r.id)} — ${esc(TIPOS[r.tipo])}</dd></div>
        <div><dt>Quando</dt><dd>${esc(fmtDT(r.data, r.hora))}</dd></div>
        <div><dt>Trecho</dt><dd>${esc(siteName(r.origem))} → ${esc(siteName(r.destino))}</dd></div>
        <div><dt>Passageiros</dt><dd>${esc(r.pax)}</dd></div></dl>
      <p class="ap-just"><small>Justificativa</small>${esc(r.just)}</p>
      <div class="ap-acts"><button class="btn green ap-ok" data-id="${esc(r.id)}">Aprovar</button><button class="btn red ap-no" data-id="${esc(r.id)}">Reprovar</button></div>
    </article>`;
  shell(page, `
    <div class="pg-head"><div><nav class="crumb"><span>Gestão</span>${ico('right', 12)}<b>Aprovações</b></nav>
      <h1>Aprovações</h1><p>Viagens intermunicipais de quem tem você como gestor imediato no AD. Você também pode aprovar pelo botão do e-mail.</p></div>
      <div class="mini-kpis"><div class="mk warn"><small>Aguardando você</small><b>${pend.length}</b></div>
        <div class="mk"><small>Aprovadas</small><b>${dec.filter((r) => r.aprov.ok).length}</b></div>
        <div class="mk"><small>Reprovadas</small><b>${dec.filter((r) => !r.aprov.ok).length}</b></div></div></div>
    <h2 class="section-t">Aguardando sua aprovação</h2>
    ${pend.length ? `<div class="ap-grid">${pend.map(card).join('')}</div>` : '<div class="card empty">Nada pendente.</div>'}
    <h2 class="section-t" style="margin-top:22px">Já decididas</h2>
    ${dec.length ? `<div class="card"><table class="tbl-ap"><thead><tr><th>Código</th><th>Solicitante</th><th>Quando</th><th>Trecho</th><th>Decisão</th></tr></thead><tbody>
      ${dec.map((r) => `<tr><td><b>${esc(r.id)}</b></td><td>${esc(r.nome)}</td><td>${esc(fmtDT(r.data, r.hora))}</td><td>${esc(siteName(r.origem))} → ${esc(siteName(r.destino))}</td>
        <td>${r.aprov.ok ? 'Aprovada' : 'Reprovada'} em ${esc(r.aprov.quando)}${r.aprov.motivo ? `<br><small>${esc(r.aprov.motivo)}</small>` : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<div class="card empty">Nenhuma decisão ainda.</div>'}`);
  document.querySelectorAll('.ap-ok').forEach((b) => { b.onclick = () => { const r = S.reqs.find((x) => x.id === b.dataset.id); decisaoGestor(r, true); route(); toast(`${r.id} aprovada — seguiu para o Facilities.`); }; });
  document.querySelectorAll('.ap-no').forEach((b) => {
    b.onclick = () => {
      const r = S.reqs.find((x) => x.id === b.dataset.id);
      const mo = prompt('Motivo da reprovação (opcional):');
      if (mo === null) return;
      decisaoGestor(r, false, mo.trim()); route(); toast(`${r.id} reprovada — ${r.nome} foi avisado(a) por e-mail.`);
    };
  });
}
// Visão geral e Agenda se atualizam sozinhas a cada minuto (se nenhuma janela estiver aberta): na Agenda, o horário que passou some.
if (typeof setInterval === 'function') setInterval(() => { if (S && S.user && ['visao', 'agenda'].includes(route.page) && $('#modal').hidden && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#det'))) route(); }, 60000);

// ---------------- Boot ----------------
if (window.MOBILAB_API) Srv.iniciar();
else { S = load() || seed(); route(); }
