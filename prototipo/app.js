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
const SLOT_CAP = 6;                       // Spin (6 lugares) — limite do horário quando passa do padrão
const CAP_PADRAO = 4;                     // padrão: carro de 4 vagas; acima disso a viagem vai de Spin
// Vagas de referência: até 4 ocupados = carro (4); a partir daí a Spin (6) assume.
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
  { id: 'V1', nome: 'Chevrolet Spin', placa: 'RFA-1A23', tipo: 'carro', cap: 6, bag: 6 },
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
// Bagagem é texto livre (padrão N/A): o Facilities lê a descrição e escolhe o veículo; não entra na conta de porta-malas.
const bagTxt = (r) => (BAG[r.bag] ? (r.bag === 'nenhuma' ? 'N/A' : BAG[r.bag].l) : String(r.bag || '').trim() || 'N/A');
const bagCurto = (r) => { const t = bagTxt(r); return t.length > 28 ? `${t.slice(0, 27)}…` : t; };
const cargaPts = (r) => (r.tipo === 'moto' ? ITEM_TAM[r.tam].p * r.vol : 0);
const resumo = (r) => (r.tipo === 'moto' ? `${r.vol}× ${r.item} (${tamCurto(r.tam)})` : `${r.pax} pax · ${bagCurto(r)}`);
const veic = (id) => VEICULOS.find((v) => v.id === id);
const mot = (id) => S.motoristas.find((m) => m.id === id);
const fmtFone = (d) => (d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : d);
// Avatar: iniciais e, no sistema, a foto de perfil do Entra ID por cima (se não houver foto, ficam as iniciais)
const avatar = (nome, email, cls = '') => `<span class="avatar${cls ? ` ${cls}` : ''}">${esc(initials(nome || email || '?'))}${window.MOBILAB_API && email
  ? `<img class="av-foto" src="/api/foto?v=2&e=${encodeURIComponent(String(email).toLowerCase())}" alt="" loading="lazy" decoding="async">` : ''}</span>`;
document.addEventListener('error', (e) => { const t = e.target; if (t && t.classList && t.classList.contains('av-foto')) t.remove(); }, true);
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
    app().innerHTML = skPagina(); // enquanto confere o login e carrega os dados
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
      let extra = {}, r, j;
      for (;;) { // o servidor pode pedir motivo e/ou assinatura eletrônica antes de gravar (21 CFR Part 11)
        r = await fetch('/api/estado', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ versao: this.versao, estado: est, ...extra }) });
        j = await r.json();
        if (r.status !== 428) break;
        const ok = await confirmarRegistro(j.precisa || {});
        if (!ok) { // cancelou: nada foi gravado — a tela volta ao que está no servidor
          this.sujo = false;
          try { const x = await (await fetch('/api/estado', { cache: 'no-store' })).json(); this.aplicar(x); } catch (e) { /* segue */ }
          toast('Ação cancelada — nada foi gravado.');
          this.gravando = false; this.pendente = false;
          return;
        }
        extra = ok;
      }
      if (r.ok) {
        this.versao = j.versao; this.sujo = false;
        if (extra.assinatura) { // traz a assinatura que o servidor gravou no registro
          try { const x = await (await fetch('/api/estado', { cache: 'no-store' })).json(); this.aplicar(x); } catch (e) { /* segue */ }
          toast('Assinado e registrado.');
        }
      }
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
      if (!S.user || this.gravando || this.sujo || !$('#modal').hidden || document.getElementById('confirma')) return;
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
function openModal(html) { const m = $('#modal'); delete m.dataset.fixo; $('.modal-card', m).innerHTML = html; m.hidden = false; }
// Campo obrigatório: marca required e o CSS põe o asterisco vermelho no rótulo do campo
function obrigatorios(ids) { ids.forEach((s) => { const e = $(s); if (e) { e.required = true; const f = e.closest('.f'); if (f) f.classList.add('obr'); } }); document.querySelectorAll('#modal .ret-box').forEach((b) => b.classList.add('obr'));
  $('#modal').dataset.fixo = '1'; // formulário de solicitação: só fecha em Cancelar ou Enviar (clicar fora ou Esc não fecha)
}
function closeModal() { $('#modal').hidden = true; }
// Assinaturas eletrônicas gravadas pelo servidor no registro: nome, e-mail, data/hora e significado (21 CFR Part 11 §11.50)
const assinaturasHtml = (r) => (r && r.assinaturas && r.assinaturas.length ? `<div class="f full"><label>Assinaturas eletrônicas</label><ul class="ass-l">${r.assinaturas.map((a) => `<li><b>${esc(a.nome)}</b> <small>(${esc(a.email)})</small> — ${esc(a.significado)} · ${esc(a.quando)} <small>UTC${esc((a.fuso || '').slice(0, 3))}:${esc((a.fuso || '').slice(3))} · ${esc(a.metodo)}</small></li>`).join('')}</ul></div>` : '');
// 21 CFR Part 11: antes de gravar, o servidor pode pedir o MOTIVO (alteração/exclusão de dado já gravado) e/ou a
// ASSINATURA ELETRÔNICA (decisões). Esta janela fica por cima de qualquer outra e só fecha em Cancelar ou Confirmar.
// Devolve { motivo, assinatura } ou null (cancelado: nada é gravado).
function confirmarRegistro(precisa, tok) {
  return new Promise((resolve) => {
    const assinar = precisa.assinar || [], mud = precisa.motivo || [];
    const quem = S.user ? `${S.user.nome} (${S.user.email})` : 'o gestor da solicitação';
    const ov = document.createElement('div');
    ov.className = 'modal cf-ov'; ov.id = 'confirma';
    ov.innerHTML = `<div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="cf_t">
      <h3 id="cf_t">${assinar.length ? 'Assinatura eletrônica' : 'Motivo da alteração'}</h3>
      <p class="sub">${assinar.length ? 'Esta decisão precisa ser assinada. Nada é gravado sem a assinatura.' : 'Você está alterando dados já gravados. Informe o motivo — ele fica registrado na trilha de auditoria.'}</p>
      ${mud.length ? `<div class="cf-box"><b>Alterações</b><ul>${mud.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
        <div class="f obr"><label for="cf_motivo">Motivo da alteração</label><textarea class="input" id="cf_motivo" rows="3" maxlength="500" required placeholder="Ex.: horário corrigido a pedido do colaborador"></textarea></div>` : ''}
      ${assinar.length ? `<div class="cf-box cf-ass"><b>${esc(quem)}</b> assina:<ul>${assinar.map((x) => `<li><b>${esc(x.significado)}</b> — ${esc(x.ref)}</li>`).join('')}</ul>
        <small>Esta assinatura eletrônica equivale à sua assinatura manuscrita e fica gravada no registro com seu nome, data, hora e significado.</small></div>
        ${precisa.metodo === 'senha' ? '<div class="f obr"><label for="cf_senha">Senha da conta do Mobilab</label><input class="input" id="cf_senha" type="password" autocomplete="current-password" required></div>'
          : '<p class="section-s">Ao confirmar, a Microsoft vai pedir sua senha de novo numa janela.</p>'}` : ''}
      <div id="cf_msg"></div>
      <div class="modal-acts"><button class="btn" id="cf_nao">Cancelar</button><button class="btn green" id="cf_sim">${assinar.length ? 'Assinar e confirmar' : 'Confirmar alteração'}</button></div></div>`;
    document.body.appendChild(ov);
    const fim = (v) => { window.removeEventListener('message', ouvir); ov.remove(); resolve(v); };
    const erro = (t) => { $('#cf_msg', ov).innerHTML = `<div class="msg-box bad">${esc(t)}</div>`; $('#cf_sim', ov).disabled = false; };
    let motivo = '', janela = null;
    const ouvir = (ev) => {
      if (ev.origin !== location.origin || !ev.data || ev.data.tipo !== 'mobilab-assinatura') return;
      if (janela && !janela.closed) janela.close();
      if (ev.data.erro || !ev.data.id) erro(ev.data.erro || 'Assinatura não concluída.'); else fim({ motivo, assinatura: ev.data.id });
    };
    window.addEventListener('message', ouvir);
    $('#cf_nao', ov).onclick = () => fim(null);
    $('#cf_sim', ov).onclick = async () => {
      motivo = mud.length ? $('#cf_motivo', ov).value.trim() : '';
      if (mud.length && motivo.length < 5) { erro('Descreva o motivo (pelo menos 5 caracteres).'); $('#cf_motivo', ov).focus(); return; }
      if (!assinar.length) { fim({ motivo, assinatura: '' }); return; }
      $('#cf_sim', ov).disabled = true;
      if (precisa.metodo === 'senha') {
        try {
          const r = await fetch('/api/assinar/senha', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ senha: $('#cf_senha', ov).value }) });
          const j = await r.json(); if (!r.ok) throw new Error(j.erro);
          fim({ motivo, assinatura: j.assinatura });
        } catch (e) { erro(e.message || 'Não foi possível assinar.'); }
        return;
      }
      janela = window.open(`/auth/assinar${tok ? `?tok=${encodeURIComponent(tok)}` : ''}`, 'mobilab_assinar', 'width=520,height=680');
      if (!janela) { erro('O navegador bloqueou a janela da Microsoft. Permita pop-ups para este site e tente de novo.'); return; }
      $('#cf_msg', ov).innerHTML = '<div class="msg-box">Confirme sua identidade na janela da Microsoft…</div>';
      const vigia = setInterval(() => { if (janela.closed) { clearInterval(vigia); if (document.body.contains(ov) && $('#cf_sim', ov).disabled) erro('A janela foi fechada antes de concluir a assinatura.'); } }, 700);
    };
    setTimeout(() => { const f = $('#cf_motivo', ov) || $('#cf_senha', ov) || $('#cf_sim', ov); if (f) f.focus(); }, 50);
  });
}
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal' && !e.currentTarget.dataset.fixo) closeModal(); });
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Escape') return;
  if ($('#modal').hidden && UI.vx && route.page === 'visao') { UI.vx = null; route(); }
  else if ($('#modal').hidden && UI.sel && route.page === 'agenda') { UI.sel = null; route(); }
  else if (!$('#modal').dataset.fixo) closeModal();
});
document.addEventListener('click', (e) => { const m = $('#menu'); if (m && !m.hidden && !e.target.closest('.user-wrap')) m.hidden = true; });
const pill = (st) => `<span class="pill st-${esc(st)}">${esc(STATUS[st] || st)}</span>`;
const brand = `<a class="brand" href="#" aria-label="Natulab Farmacêutica — início"><svg xmlns="http://www.w3.org/2000/svg" viewBox="483.2 262.3 286.2 99.2" role="img" aria-label="Natulab Farmacêutica"><path fill="#73bc25" d="M 494 301.4 L 507 330 C 508.7 333.9 510.2 334.4 514.5 334.4 L 521.8 334.4 L 521.8 291.6 L 514.6 291.6 L 514.7 326.1 L 513.9 326.1 C 512.8 326.1 512.5 325.4 512.1 324.7 L 499.1 296.1 C 497.3 292.2 495.8 291.6 491.5 291.6 L 484.2 291.6 L 484.2 334.4 L 491.9 334.4 L 491.8 300.1 L 492.5 300.1 C 493.4 300.1 493.8 301 494 301.4"/><path fill="#73bc25" d="M 543.2 316.1 L 548.8 300.9 L 550.1 300.9 L 555.7 316.1 C 555.8 316.5 555.8 316.9 555.6 317.2 C 555.4 317.5 555.1 317.6 554.7 317.6 L 544.2 317.6 C 543.8 317.6 543.5 317.5 543.3 317.2 C 543.1 316.9 543 316.5 543.2 316.1 M 539.9 324.9 C 540.2 324.2 540.7 323.9 541.4 323.9 L 557.6 323.9 C 558.3 323.9 558.8 324.2 559 324.9 L 562.1 332.7 C 562.5 333.9 563.4 334.4 564.6 334.4 L 571.5 334.4 L 554.1 293.2 C 553.6 292 552.9 291.5 551.7 291.5 L 547.2 291.5 C 546 291.5 545.3 292 544.9 293.2 L 527.4 334.4 L 534.2 334.4 C 535.5 334.4 536.4 333.9 536.8 332.8 Z M 539.9 324.9"/><path fill="#73bc25" d="M 604.9 291.6 L 569.3 291.6 L 570 296.7 C 570.1 298.1 570.6 298.5 572 298.5 L 583.2 298.5 L 583.2 334.4 L 591 334.4 L 591 298.5 L 602.3 298.5 C 603.6 298.5 604.1 298.1 604.3 296.7 Z M 604.9 291.6"/><path fill="#73bc25" d="M 646.6 291.6 L 638.8 291.6 L 638.8 319 C 638.8 325.3 636 328 629.3 328 L 627.4 328 C 620.7 328 617.9 325.3 617.9 319 L 617.9 291.6 L 610.1 291.6 L 610.1 318.7 C 610.1 329.9 615.4 335 627.3 335 L 629.5 335 C 641.3 335 646.6 329.9 646.6 318.7 Z M 646.6 291.6"/><path fill-rule="evenodd" fill="#73bc25" d="M 712.3 266.2 C 710.8 264.3 708.5 263.3 706.1 263.3 C 704.2 263.3 702.4 263.9 701 265.1 C 699.3 266.4 698.3 268.4 698.1 270.5 C 698 271.3 698 272 698.2 272.8 C 698.5 274.8 697.9 276.9 696.4 278.3 C 695.3 279.5 693.7 280.2 692 280.2 C 691.6 280.2 691.3 280.1 690.9 280.1 C 690.4 280 689.9 280 689.4 280 C 687.3 280 685.4 280.7 683.6 282.1 C 679.3 285.6 678.6 291.8 681.9 295.9 C 683.7 298.1 686.4 299.4 689.4 299.4 C 689.8 299.4 690.4 299.3 690.7 299.3 C 692.3 299.3 693.7 300.1 694.6 301.5 C 695.5 302.8 695.6 304.5 695 305.9 C 694.4 307.4 694.4 309 695 310.5 C 695.9 312.9 698.2 314.4 700.7 314.4 C 701.5 314.4 702.2 314.3 702.9 314 C 706.1 312.7 707.7 309.2 706.4 306 C 705.6 303.9 703.7 302.5 701.5 302.2 C 699.9 302 698.6 301 697.8 299.6 C 697.1 298.3 697.1 296.6 697.8 295.2 C 697.9 295.1 697.9 295.1 697.9 295 C 698.4 294.1 699.2 291.8 699.2 290.6 C 699.3 289.5 699.2 288.4 698.9 287.3 C 698.3 285.4 698.7 283.2 700 281.6 C 701.2 280.1 703 279.3 704.9 279.3 C 705 279.3 705.2 279.3 705.4 279.3 C 705.6 279.3 705.8 279.3 706.1 279.3 C 707.9 279.3 709.7 278.7 711.1 277.5 C 714.6 274.7 715.1 269.7 712.3 266.2"/><path fill="#343936" d="M 523.9 359.8 C 523.4 359.8 523.1 359.6 523.1 359 L 523.1 350.1 C 523.1 349.2 523.3 348.5 523.8 348.1 C 524.2 347.7 525 347.4 526 347.4 L 530.9 347.4 C 531.4 347.4 531.7 347.7 531.7 348.2 L 531.7 348.6 C 531.7 349.1 531.4 349.4 530.9 349.4 L 526.2 349.4 C 525.4 349.4 525.2 349.7 525.2 350.3 L 525.2 352.6 L 530.2 352.6 C 530.7 352.6 531 352.9 531 353.4 L 531 353.8 C 531 354.3 530.7 354.5 530.2 354.5 L 525.2 354.5 L 525.2 359 C 525.2 359.6 524.9 359.8 524.4 359.8 Z M 523.9 359.8"/><path fill="#343936" d="M 542.1 354.4 L 546.9 354.4 L 545.6 350.4 C 545.3 349.4 545.1 349.1 544.5 349.1 C 543.9 349.1 543.7 349.4 543.4 350.4 Z M 549.2 359.8 C 548.7 359.8 548.4 359.6 548.3 359.2 L 547.5 356.3 L 541.6 356.3 L 540.7 359.2 C 540.6 359.6 540.3 359.8 539.8 359.8 L 539.3 359.8 C 538.7 359.8 538.5 359.5 538.7 358.9 L 541.4 350.1 C 541.7 349.1 542.1 348.3 542.6 347.9 C 543 347.5 543.7 347.3 544.5 347.3 C 545.3 347.3 546 347.5 546.5 347.9 C 547 348.3 547.3 349.1 547.6 350.1 L 550.4 358.9 C 550.5 359.5 550.3 359.8 549.7 359.8 Z M 549.2 359.8"/><path fill="#343936" d="M 560.8 352.7 L 563.3 352.7 C 564.3 352.7 565.1 352.6 565.5 352.3 C 565.9 352.1 566.1 351.6 566.1 351 C 566.1 350.5 565.9 350 565.5 349.8 C 565.1 349.5 564.3 349.4 563.3 349.4 L 561.7 349.4 C 561 349.4 560.8 349.7 560.8 350.3 Z M 567.9 358.9 C 568.3 359.4 568.1 359.8 567.4 359.8 L 566.6 359.8 C 566.2 359.8 565.9 359.6 565.7 359.3 L 563.1 354.7 L 560.8 354.7 L 560.8 359 C 560.8 359.6 560.5 359.8 560 359.8 L 559.5 359.8 C 559 359.8 558.8 359.6 558.8 359 L 558.8 350.1 C 558.8 349.2 559 348.5 559.4 348.1 C 559.9 347.7 560.6 347.4 561.6 347.4 L 563.1 347.4 C 564.8 347.4 565.9 347.7 566.8 348.2 C 567.7 348.8 568.2 349.7 568.2 351 C 568.2 353.1 567.2 354.1 565.2 354.5 Z M 567.9 358.9"/><path fill="#343936" d="M 577 359.8 C 576.5 359.8 576.2 359.5 576.3 359 L 577.4 349.6 C 577.6 347.9 578.2 347.3 579.6 347.3 C 580.2 347.3 580.7 347.4 581.1 347.8 C 581.4 348.1 581.7 348.7 581.9 349.6 L 583.4 357.4 C 583.5 357.7 583.6 357.8 583.7 357.8 C 583.9 357.8 584 357.7 584 357.4 L 585.6 349.6 C 585.8 348.7 586.1 348.1 586.4 347.8 C 586.8 347.4 587.3 347.3 587.9 347.3 C 589.3 347.3 589.9 347.9 590.1 349.6 L 591.2 359 C 591.3 359.5 591 359.8 590.5 359.8 L 590 359.8 C 589.5 359.8 589.2 359.6 589.2 359.1 L 588 349.7 C 588 349.6 587.9 349.5 587.8 349.5 C 587.7 349.5 587.7 349.6 587.6 349.7 L 585.9 358.1 C 585.7 359.3 585 359.8 583.7 359.8 C 582.5 359.8 581.8 359.3 581.6 358.1 L 579.8 349.7 C 579.8 349.6 579.8 349.5 579.6 349.5 C 579.5 349.5 579.5 349.6 579.5 349.7 L 578.3 359.1 C 578.3 359.6 578 359.8 577.5 359.8 Z M 577 359.8"/><path fill="#343936" d="M 602.3 354.4 L 607.1 354.4 L 605.8 350.4 C 605.5 349.4 605.2 349.1 604.7 349.1 C 604.1 349.1 603.8 349.4 603.5 350.4 Z M 609.4 359.8 C 608.9 359.8 608.6 359.6 608.5 359.2 L 607.6 356.3 L 601.7 356.3 L 600.9 359.2 C 600.7 359.6 600.4 359.8 600 359.8 L 599.5 359.8 C 598.9 359.8 598.7 359.5 598.8 358.9 L 601.5 350.1 C 601.9 349.1 602.3 348.3 602.7 347.9 C 603.2 347.5 603.8 347.3 604.7 347.3 C 605.5 347.3 606.2 347.5 606.7 347.9 C 607.1 348.3 607.5 349.1 607.8 350.1 L 610.5 358.9 C 610.7 359.5 610.4 359.8 609.9 359.8 Z M 609.4 359.8"/><path fill="#343936" d="M 626.2 347.6 C 626.6 347.7 626.9 348 626.9 348.5 L 626.9 348.9 C 626.9 349.4 626.5 349.7 626 349.5 C 621.7 348.5 620.1 350.1 620.1 353.6 C 620.1 357.1 621.7 358.7 626 357.7 C 626.5 357.6 626.9 357.8 626.9 358.4 L 626.9 358.7 C 626.9 359.2 626.6 359.5 626.1 359.6 C 622.8 360.5 620.3 359.8 619 357.6 C 618.3 356.6 618 355.2 618 353.6 C 618 348.7 621.2 346.3 626.2 347.6"/><path fill="#343936" d="M 640.3 345.2 L 638.3 346 C 637.9 346.2 637.6 346.1 637.3 345.8 C 637.1 345.4 637.2 345.1 637.7 344.8 L 639.7 343.7 C 640.1 343.5 640.4 343.5 640.8 343.7 L 642.8 344.8 C 643.3 345.1 643.4 345.4 643.2 345.8 C 642.9 346.1 642.6 346.2 642.2 346 Z M 643.7 357.9 C 644.2 357.9 644.4 358.1 644.4 358.7 L 644.4 359 C 644.4 359.6 644.2 359.8 643.7 359.8 L 638.4 359.8 C 637.4 359.8 636.6 359.6 636.2 359.2 C 635.7 358.8 635.5 358.1 635.5 357.1 L 635.5 350.1 C 635.5 349.2 635.7 348.5 636.2 348.1 C 636.6 347.7 637.4 347.4 638.4 347.4 L 643.3 347.4 C 643.8 347.4 644.1 347.7 644.1 348.2 L 644.1 348.6 C 644.1 349.1 643.8 349.4 643.3 349.4 L 638.6 349.4 C 637.8 349.4 637.6 349.7 637.6 350.3 L 637.6 352.6 L 642.4 352.6 C 642.9 352.6 643.1 352.9 643.1 353.4 L 643.1 353.8 C 643.1 354.3 642.9 354.5 642.4 354.5 L 637.6 354.5 L 637.6 357 C 637.6 357.6 637.8 357.9 638.6 357.9 Z M 643.7 357.9"/><path fill="#343936" d="M 663 347.4 C 663.5 347.4 663.7 347.7 663.7 348.2 L 663.7 354.9 C 663.7 356.6 663.3 357.9 662.5 358.7 C 661.7 359.6 660.3 360 658.4 360 C 656.6 360 655.2 359.6 654.4 358.7 C 653.6 357.9 653.1 356.6 653.1 354.9 L 653.1 348.2 C 653.1 347.7 653.4 347.4 653.9 347.4 L 654.4 347.4 C 654.9 347.4 655.2 347.7 655.2 348.2 L 655.2 355 C 655.2 357.1 656.2 358 658.4 358 C 660.7 358 661.7 357.1 661.7 355 L 661.7 348.2 C 661.7 347.7 661.9 347.4 662.5 347.4 Z M 663 347.4"/><path fill="#343936" d="M 681.5 347.4 C 682.1 347.4 682.3 347.7 682.3 348.2 L 682.3 348.6 C 682.3 349.1 682.1 349.4 681.5 349.4 L 678.2 349.4 L 678.2 359 C 678.2 359.6 677.9 359.8 677.4 359.8 L 676.9 359.8 C 676.3 359.8 676.1 359.6 676.1 359 L 676.1 349.4 L 672.7 349.4 C 672.2 349.4 671.9 349.1 671.9 348.6 L 671.9 348.2 C 671.9 347.7 672.2 347.4 672.7 347.4 Z M 681.5 347.4"/><path fill="#343936" d="M 691.5 359.8 C 691 359.8 690.7 359.6 690.7 359 L 690.7 348.2 C 690.7 347.7 691 347.4 691.5 347.4 L 692 347.4 C 692.5 347.4 692.8 347.7 692.8 348.2 L 692.8 359 C 692.8 359.6 692.5 359.8 692 359.8 Z M 691.5 359.8"/><path fill="#343936" d="M 710.1 347.6 C 710.6 347.7 710.8 348 710.8 348.5 L 710.8 348.9 C 710.8 349.4 710.5 349.7 709.9 349.5 C 705.6 348.5 704.1 350.1 704.1 353.6 C 704.1 357.1 705.6 358.7 709.9 357.7 C 710.5 357.6 710.8 357.8 710.8 358.4 L 710.8 358.7 C 710.8 359.2 710.6 359.5 710.1 359.6 C 706.7 360.5 704.3 359.8 702.9 357.6 C 702.2 356.6 701.9 355.2 701.9 353.6 C 701.9 348.7 705.1 346.3 710.1 347.6"/><path fill="#343936" d="M 722.2 354.4 L 726.9 354.4 L 725.7 350.4 C 725.4 349.4 725.1 349.1 724.5 349.1 C 724 349.1 723.7 349.4 723.4 350.4 Z M 729.2 359.8 C 728.8 359.8 728.5 359.6 728.3 359.2 L 727.5 356.3 L 721.6 356.3 L 720.7 359.2 C 720.6 359.6 720.3 359.8 719.8 359.8 L 719.3 359.8 C 718.8 359.8 718.5 359.5 718.7 358.9 L 721.4 350.1 C 721.7 349.1 722.1 348.3 722.6 347.9 C 723 347.5 723.7 347.3 724.5 347.3 C 725.4 347.3 726 347.5 726.5 347.9 C 727 348.3 727.4 349.1 727.7 350.1 L 730.4 358.9 C 730.5 359.5 730.3 359.8 729.7 359.8 Z M 729.2 359.8"/><path fill="#343936" d="M 683.6 334.5 L 663.5 334.5 C 656.7 334.5 653.4 330.8 653.4 323.4 L 653.4 291.6 L 662.4 291.6 L 662.4 322.7 C 662.4 325.5 663.3 326.4 666.2 326.4 L 680.3 326.4 C 681.9 326.4 682.7 327.1 682.9 328.8 Z M 683.6 334.5"/><path fill="#343936" d="M 759.4 322.4 C 759.4 325.1 758.3 326.4 755.4 326.4 L 740.8 326.4 L 740.8 316.4 L 755.4 316.4 C 758.3 316.4 759.4 317.7 759.4 320.3 Z M 754.4 299.7 C 757 299.7 758.2 301 758.2 303.6 L 758.2 304.9 C 758.2 307.5 757 308.8 754.4 308.8 L 740.8 308.8 L 740.8 299.7 Z M 762.3 312 L 762.3 311.6 C 765.2 310.3 766.8 307.5 766.8 304.1 L 766.8 302.4 C 766.8 295.5 762.8 291.6 754.9 291.6 L 731.8 291.6 L 731.8 334.5 L 755.8 334.5 C 765 334.5 768.4 329.7 768.4 323.3 L 768.4 321.2 C 768.4 316.2 766.3 313 762.3 312"/><path fill="#343936" d="M 713.6 293.2 C 713.1 292 712.4 291.5 711.2 291.5 L 704.8 291.5 L 714.1 316.1 C 714.2 316.5 714.2 316.9 714 317.2 C 713.8 317.5 713.4 317.6 713.1 317.6 L 696.5 317.5 C 694.4 317.5 692.5 318.7 691.6 320.7 L 685.8 334.4 L 692.6 334.4 C 693.9 334.4 694.8 333.9 695.2 332.8 L 698.3 324.9 C 698.6 324.2 699.1 323.9 699.8 323.9 L 715.9 323.9 C 716.7 323.9 717.2 324.2 717.4 324.9 L 720.5 332.7 C 720.9 333.9 721.8 334.4 723 334.4 L 729.9 334.4 Z M 713.6 293.2"/></svg></a>`;

function route() {
  const h = location.hash.replace('#', '') || '';
  const ap = h.match(/^aprovar\/([A-Za-z0-9_-]+)$/);
  if (ap) { route.page = 'aprovar'; return renderAprovar(ap[1]); } // link do e-mail do gestor: cai direto na aprovação
  if (!S.user) return renderLogin();
  const home = { colaborador: 'agenda', facilities: 'visao', ti: 'inicio', ti_jr: 'inicio' }[S.user.role];
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
const NAV_FAC = [['visao', 'Visão geral'], ['painel', 'Confirmação de viagens'], ['viagens', 'Viagens'], ['solicitacoes', 'Solicitações'], ['motoristas', 'Motoristas'], ['grade', 'Grade e rotas'], ['custos', 'Custos']];
// Gestor imediato (vem do AD) vê as mesmas abas do colaborador + Aprovações.
const navDe = (u) => [...NAV[u.role], ...(u.gestor ? [['aprovacoes', 'Aprovações']] : [])];
const NAV = {
  colaborador: NAV_COLAB,
  facilities: NAV_FAC,
  ti: [['inicio', 'Início'], ...NAV_FAC, ...NAV_COLAB, ['historico', 'Histórico'], ['usuarios', 'Usuários'], ['cadastros', 'Cadastros']],
  // Admin Júnior: operação do dia a dia e Usuários só para consulta (sem Custos, Histórico e Cadastros)
  ti_jr: [['inicio', 'Início'], ...NAV_FAC.filter(([k]) => k !== 'custos'), ...NAV_COLAB, ['usuarios', 'Usuários']],
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
  home: '<path d="M4 11l8-7 8 7v9H4z"/><path d="M10 20v-6h4v6"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  clip: '<rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4.5V3h6v1.5M9 10h6M9 14h6M9 18h3"/>',
  chart: '<path d="M4 4v16h16"/><path d="M8 16v-4M12 16V8M16 16v-6"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  cadastro: '<path d="M19 10.1A8.5 8.5 0 1 1 13.9 5"/><circle cx="11" cy="11" r="3"/><path d="M5.5 19.5c1-2.6 3-3.9 5.5-3.9s4.5 1.3 5.5 3.9"/><circle cx="18" cy="6" r="3.2"/><path d="M18 4.6v2.8M16.6 6h2.8"/>',
  sliders: '<path d="M3 6h2.5M10.5 6H21M3 12h10.5M18.5 12H21M3 18h4.5M12.5 18H21"/><circle cx="8" cy="6" r="2.5"/><circle cx="16" cy="12" r="2.5"/><circle cx="10" cy="18" r="2.5"/>',
  mala: '<rect x="5" y="7" width="14" height="13" rx="2"/><path d="M9 7V4.5h6V7M9 11v5M15 11v5"/>',
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
      <li><b>Intermunicipal:</b> precisa da aprovação da <b>liderança</b>: o primeiro líder, coordenador, gerente ou diretor acima de você, antes de ir para o Facilities.</li>
      <li><b>Capacidade:</b> cada horário tem <b>${CAP_PADRAO} vagas</b> (carro). Se passar de ${CAP_PADRAO} passageiros, a viagem vai de <b>Spin</b> (até ${SLOT_CAP}). Ocupação conta solicitações em análise e confirmadas.</li>
      <li><b>Táxi na cidade:</b> 1 h de antecedência · <b>Intermunicipal:</b> 48 h · <b>Moto Táxi:</b> envio de itens (prazo a definir).</li>
      <li>Toda solicitação passa pela análise do <b>Facilities</b>; você acompanha o status em “Minhas solicitações”.</li>
    </ul>
    <div class="modal-acts"><button class="btn green" id="cx">Entendi</button></div>`);
  $('#cx').onclick = closeModal;
}

// Logo e símbolo oficiais (arquivos em prototipo/marca). No servidor o SPA é servido em "/", e os arquivos ficam em /prototipo/marca/.
const MARCA = (location.protocol === 'file:' || location.pathname.startsWith('/prototipo')) ? 'marca/' : '/prototipo/marca/';
// Menu lateral: ícone e grupo de cada tela
const NAV_ICO = { inicio: 'home', visao: 'grid', painel: 'list', viagens: 'route', solicitacoes: 'filter', motoristas: 'car', grade: 'clock', custos: 'money',
  agenda: 'cal', minhas: 'user', aprovacoes: 'check', usuarios: 'users', historico: 'history', cadastros: 'cadastro' };
const NAV_GRUPO = { visao: 'Operação', painel: 'Operação', viagens: 'Operação', solicitacoes: 'Operação', motoristas: 'Operação', grade: 'Operação', custos: 'Gestão',
  agenda: 'Minhas viagens', minhas: 'Minhas viagens', aprovacoes: 'Minhas viagens', usuarios: 'Administração', historico: 'Administração', cadastros: 'Administração' };
const GRUPOS = ['', 'Operação', 'Gestão', 'Minhas viagens', 'Administração'];
const Lado = {
  mini() { try { return localStorage.getItem('mobilab.menu') === 'mini'; } catch (e) { return false; } },
  guardar(m) { try { localStorage.setItem('mobilab.menu', m ? 'mini' : 'aberto'); } catch (e) { /* sem armazenamento: só não lembra */ } },
};

function shell(page, content) {
  const nav = navDe(S.user).map((x, i) => [...x, i]).sort((a, b) => (GRUPOS.indexOf(NAV_GRUPO[a[0]] || '') - GRUPOS.indexOf(NAV_GRUPO[b[0]] || '')) || a[2] - b[2]);
  const nGrupos = new Set(nav.map(([k]) => NAV_GRUPO[k] || '')).size;
  const nAprov = S.user.gestor ? S.reqs.filter((r) => r.status === 'gestor' && r.gestor && r.gestor.email === S.user.email).length : 0;
  const nMinhas = S.reqs.filter((r) => meuPedido(r) && ATIVOS.includes(r.status)).length;
  const nNovas = minhasMsgs().filter((e) => !e.lida).length;
  const cont = { minhas: nMinhas, aprovacoes: nAprov };
  let grupo = null;
  const itens = nav.map(([k, l]) => {
    const g = NAV_GRUPO[k] || '';
    const cab = nGrupos > 1 && g && g !== grupo ? `<div class="lado-sec">${esc(g)}</div>` : '';
    grupo = g;
    return `${cab}<a href="#${k}" class="${k === page ? 'on' : ''}" title="${esc(l)}" ${k === page ? 'aria-current="page"' : ''}>${ico(NAV_ICO[k] || 'grid', 20)}<span class="t">${esc(l)}</span>${cont[k] ? `<span class="count">${cont[k]}</span>` : ''}</a>`;
  }).join('');
  const atual = (nav.find(([k]) => k === page) || [])[1] || '';
  const semLado = page === 'inicio';
  const eu = `<div class="user-wrap ${semLado ? 'topo-eu' : 'lado-eu'}">
          <button class="user" id="umenu" aria-haspopup="true" aria-expanded="false" title="${esc(S.user.nome)}">${avatar(S.user.nome, S.user.email)}
            <span class="who"><b>${esc(S.user.nome)}</b>${esc(S.user.cargo)}</span>${semLado ? ico('down', 16) : ''}</button>
          <div class="menu" id="menu" hidden>
            ${window.MOBILAB_API ? '' : '<button id="reset">Restaurar dados de exemplo</button>'}
            <button id="umexib">Exibição</button>
            <button id="logout">Sair</button>
          </div>
        </div>`;
  app().innerHTML = `
    <div class="app-sh${semLado ? ' sem-lado' : Lado.mini() ? ' mini' : ''}${page === 'agenda' ? ' fixo' : ''}" id="appsh">
      ${semLado ? '' : `<aside class="lado" id="lado" aria-label="Menu">
        <div class="lado-cab">
          <a class="lado-logo" href="#" aria-label="Natulab Farmacêutica — início"><img class="lg-full" src="${MARCA}natulab-logo-negativo.svg" alt="Natulab Farmacêutica"><img class="lg-mini" src="${MARCA}natulab-simbolo.svg" alt="Natulab"></a>
          <button class="lado-rec" id="rec" type="button">${ico('left', 18)}</button>
        </div>
        <nav class="lado-nav">${itens}
          <div class="lado-sec">Suporte</div>
          <a href="#" id="lbell" title="Mensagens do Facilities">${ico('bell', 20)}<span class="t">Mensagens</span>${nNovas ? `<span class="count">${nNovas}</span>` : ''}</a>
          <a href="#" id="ajuda" title="Ajuda">${ico('info', 20)}<span class="t">Ajuda</span></a>
          <a href="#" id="exib" title="Exibição: fonte, escala e brilho">${ico('sliders', 20)}<span class="t">Exibição</span></a></nav>
        ${eu}
      </aside>
      <div class="lado-fundo" id="ladofundo"></div>`}
      <div class="sh-main">
        <header class="topbar">
          <button class="icon-btn lado-abre" id="ladoabre" aria-label="Abrir menu" aria-controls="lado">${ico('menu', 20)}</button>
          <img class="topo-logo" src="${MARCA}natulab-logo.svg" alt="Natulab Farmacêutica">
          <span class="topo-pg">${esc(atual)}</span>
          <span class="spacer"></span>
          ${window.MOBILAB_API ? (Srv.teste ? '<span class="badge-sim">TESTE</span>' : '') : '<span class="badge-sim">SIMULAÇÃO</span>'}
          <button class="icon-btn bell" id="bell" aria-label="Mensagens do Facilities${nNovas ? ` (${nNovas} novas)` : ''}" title="Mensagens do Facilities">${ico('bell', 18)}${nNovas ? `<span class="dot">${nNovas}</span>` : ''}</button>
          ${semLado ? eu : ''}
        </header>
        <main>${content}</main>
      </div>
    </div>`;
  // Mesmo cabeçalho em todas as telas (padrão da Visão geral): etiqueta do grupo do menu acima do título
  const cab = document.querySelector('main .page-head > div:first-child, main .pg-head > div:first-child, main .hero > div:first-child');
  if (cab && !cab.querySelector('.eyebrow, .crumb, .vc-eye')) cab.insertAdjacentHTML('afterbegin', `<span class="vc-eye">${esc(NAV_GRUPO[page] || 'Mobilab')}</span>`);
  const sh = $('#appsh'), rec = $('#rec');
  if (rec) {
  const marca = () => { const m = sh.classList.contains('mini'); rec.title = m ? 'Expandir menu' : 'Recolher menu'; rec.setAttribute('aria-label', rec.title); rec.setAttribute('aria-expanded', String(!m)); };
  marca();
  rec.onclick = () => { const m = !sh.classList.contains('mini'); sh.classList.toggle('mini', m); Lado.guardar(m); marca(); };
  const fechaLado = () => sh.classList.remove('lado-on');
  $('#ladoabre').onclick = () => sh.classList.add('lado-on');
  $('#ladofundo').onclick = fechaLado;
  $('#lado').querySelectorAll('.lado-nav a[href^="#"]:not(#ajuda):not(#lbell):not(#exib)').forEach((a) => a.addEventListener('click', fechaLado));
  $('#ajuda').onclick = (e) => { e.preventDefault(); fechaLado(); openAjuda(); };
  $('#lbell').onclick = (e) => { e.preventDefault(); fechaLado(); openCaixa(); };
  $('#exib').onclick = (e) => { e.preventDefault(); fechaLado(); openExibicao(); };
  }
  $('#bell').onclick = openCaixa;
  $('#umenu').onclick = () => { const m = $('#menu'); m.hidden = !m.hidden; $('#umenu').setAttribute('aria-expanded', String(!m.hidden)); };
  $('#umexib').onclick = () => { $('#menu').hidden = true; openExibicao(); };
  $('#logout').onclick = () => {
    if (window.MOBILAB_API) { fetch('/sair').finally(() => { location.hash = ''; location.reload(); }); return; }
    audit('Logout', S.user.email); S.user = null; save(); location.hash = ''; route();
  };
  if ($('#reset')) $('#reset').onclick = () => { if (confirm('Restaurar os dados de exemplo da simulação?')) { const u = S.user; S = seed(); S.user = u; save(); route(); toast('Dados de exemplo restaurados.'); } };
}

// ---------------- Login ----------------
const heroArt = `
<svg viewBox="0 0 640 420" role="img" aria-label="Rota entre os sites Natulab">
  <defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="#73bc25"/><stop offset="1" stop-color="#4a8314"/></linearGradient></defs>
  <path d="M70 300 C 180 120, 300 360, 420 190 S 545 110, 555 120" fill="none" stroke="#343936" stroke-width="10" stroke-linecap="round" stroke-dasharray="2 22" opacity=".55"/>
  <g transform="translate(70 300)"><circle r="34" fill="#fff"/><circle r="22" fill="url(#g)"/><text y="70" text-anchor="middle" font-size="20" font-weight="800" fill="#343936">Medicamentos</text></g>
  <g transform="translate(330 270)"><circle r="34" fill="#fff"/><circle r="22" fill="url(#g)"/><text y="70" text-anchor="middle" font-size="20" font-weight="800" fill="#343936">CD Natulab</text></g>
  <g transform="translate(555 120)"><circle r="34" fill="#fff"/><circle r="22" fill="url(#g)"/><text y="70" text-anchor="middle" font-size="20" font-weight="800" fill="#343936">Suplementos</text></g>
  <g transform="translate(160 120)">
    <rect x="0" y="20" width="190" height="80" rx="22" fill="#fff"/>
    <path d="M18 20 L50 -18 H150 L182 20 Z" fill="#fff"/>
    <path d="M60 -8 H100 V20 H40 Z M110 -8 H145 L168 20 H110 Z" fill="#e3e7e8"/>
    <rect x="0" y="52" width="190" height="10" fill="#73bc25"/>
    <circle cx="45" cy="100" r="22" fill="#343936"/><circle cx="45" cy="100" r="9" fill="#fff"/>
    <circle cx="150" cy="100" r="22" fill="#343936"/><circle cx="150" cy="100" r="9" fill="#fff"/>
  </g>
  <g transform="translate(420 300)">
    <circle cx="0" cy="40" r="26" fill="#343936"/><circle cx="0" cy="40" r="10" fill="#fff"/>
    <circle cx="110" cy="40" r="26" fill="#343936"/><circle cx="110" cy="40" r="10" fill="#fff"/>
    <path d="M0 40 L40 0 H80 L110 40" fill="none" stroke="#fff" stroke-width="12" stroke-linejoin="round" stroke-linecap="round"/>
    <path d="M38 0 L52 -28 H70" fill="none" stroke="#fff" stroke-width="10" stroke-linecap="round"/>
    <rect x="44" y="-10" width="44" height="16" rx="8" fill="#73bc25"/>
  </g>
</svg>`;

const LOGO_NATULAB = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="483.2 262.3 286.2 99.2" role="img" aria-label="Natulab Farmacêutica"><path fill="#73bc25" d="M 494 301.4 L 507 330 C 508.7 333.9 510.2 334.4 514.5 334.4 L 521.8 334.4 L 521.8 291.6 L 514.6 291.6 L 514.7 326.1 L 513.9 326.1 C 512.8 326.1 512.5 325.4 512.1 324.7 L 499.1 296.1 C 497.3 292.2 495.8 291.6 491.5 291.6 L 484.2 291.6 L 484.2 334.4 L 491.9 334.4 L 491.8 300.1 L 492.5 300.1 C 493.4 300.1 493.8 301 494 301.4"/><path fill="#73bc25" d="M 543.2 316.1 L 548.8 300.9 L 550.1 300.9 L 555.7 316.1 C 555.8 316.5 555.8 316.9 555.6 317.2 C 555.4 317.5 555.1 317.6 554.7 317.6 L 544.2 317.6 C 543.8 317.6 543.5 317.5 543.3 317.2 C 543.1 316.9 543 316.5 543.2 316.1 M 539.9 324.9 C 540.2 324.2 540.7 323.9 541.4 323.9 L 557.6 323.9 C 558.3 323.9 558.8 324.2 559 324.9 L 562.1 332.7 C 562.5 333.9 563.4 334.4 564.6 334.4 L 571.5 334.4 L 554.1 293.2 C 553.6 292 552.9 291.5 551.7 291.5 L 547.2 291.5 C 546 291.5 545.3 292 544.9 293.2 L 527.4 334.4 L 534.2 334.4 C 535.5 334.4 536.4 333.9 536.8 332.8 Z M 539.9 324.9"/><path fill="#73bc25" d="M 604.9 291.6 L 569.3 291.6 L 570 296.7 C 570.1 298.1 570.6 298.5 572 298.5 L 583.2 298.5 L 583.2 334.4 L 591 334.4 L 591 298.5 L 602.3 298.5 C 603.6 298.5 604.1 298.1 604.3 296.7 Z M 604.9 291.6"/><path fill="#73bc25" d="M 646.6 291.6 L 638.8 291.6 L 638.8 319 C 638.8 325.3 636 328 629.3 328 L 627.4 328 C 620.7 328 617.9 325.3 617.9 319 L 617.9 291.6 L 610.1 291.6 L 610.1 318.7 C 610.1 329.9 615.4 335 627.3 335 L 629.5 335 C 641.3 335 646.6 329.9 646.6 318.7 Z M 646.6 291.6"/><path fill-rule="evenodd" fill="#73bc25" d="M 712.3 266.2 C 710.8 264.3 708.5 263.3 706.1 263.3 C 704.2 263.3 702.4 263.9 701 265.1 C 699.3 266.4 698.3 268.4 698.1 270.5 C 698 271.3 698 272 698.2 272.8 C 698.5 274.8 697.9 276.9 696.4 278.3 C 695.3 279.5 693.7 280.2 692 280.2 C 691.6 280.2 691.3 280.1 690.9 280.1 C 690.4 280 689.9 280 689.4 280 C 687.3 280 685.4 280.7 683.6 282.1 C 679.3 285.6 678.6 291.8 681.9 295.9 C 683.7 298.1 686.4 299.4 689.4 299.4 C 689.8 299.4 690.4 299.3 690.7 299.3 C 692.3 299.3 693.7 300.1 694.6 301.5 C 695.5 302.8 695.6 304.5 695 305.9 C 694.4 307.4 694.4 309 695 310.5 C 695.9 312.9 698.2 314.4 700.7 314.4 C 701.5 314.4 702.2 314.3 702.9 314 C 706.1 312.7 707.7 309.2 706.4 306 C 705.6 303.9 703.7 302.5 701.5 302.2 C 699.9 302 698.6 301 697.8 299.6 C 697.1 298.3 697.1 296.6 697.8 295.2 C 697.9 295.1 697.9 295.1 697.9 295 C 698.4 294.1 699.2 291.8 699.2 290.6 C 699.3 289.5 699.2 288.4 698.9 287.3 C 698.3 285.4 698.7 283.2 700 281.6 C 701.2 280.1 703 279.3 704.9 279.3 C 705 279.3 705.2 279.3 705.4 279.3 C 705.6 279.3 705.8 279.3 706.1 279.3 C 707.9 279.3 709.7 278.7 711.1 277.5 C 714.6 274.7 715.1 269.7 712.3 266.2"/><path fill="#343936" d="M 523.9 359.8 C 523.4 359.8 523.1 359.6 523.1 359 L 523.1 350.1 C 523.1 349.2 523.3 348.5 523.8 348.1 C 524.2 347.7 525 347.4 526 347.4 L 530.9 347.4 C 531.4 347.4 531.7 347.7 531.7 348.2 L 531.7 348.6 C 531.7 349.1 531.4 349.4 530.9 349.4 L 526.2 349.4 C 525.4 349.4 525.2 349.7 525.2 350.3 L 525.2 352.6 L 530.2 352.6 C 530.7 352.6 531 352.9 531 353.4 L 531 353.8 C 531 354.3 530.7 354.5 530.2 354.5 L 525.2 354.5 L 525.2 359 C 525.2 359.6 524.9 359.8 524.4 359.8 Z M 523.9 359.8"/><path fill="#343936" d="M 542.1 354.4 L 546.9 354.4 L 545.6 350.4 C 545.3 349.4 545.1 349.1 544.5 349.1 C 543.9 349.1 543.7 349.4 543.4 350.4 Z M 549.2 359.8 C 548.7 359.8 548.4 359.6 548.3 359.2 L 547.5 356.3 L 541.6 356.3 L 540.7 359.2 C 540.6 359.6 540.3 359.8 539.8 359.8 L 539.3 359.8 C 538.7 359.8 538.5 359.5 538.7 358.9 L 541.4 350.1 C 541.7 349.1 542.1 348.3 542.6 347.9 C 543 347.5 543.7 347.3 544.5 347.3 C 545.3 347.3 546 347.5 546.5 347.9 C 547 348.3 547.3 349.1 547.6 350.1 L 550.4 358.9 C 550.5 359.5 550.3 359.8 549.7 359.8 Z M 549.2 359.8"/><path fill="#343936" d="M 560.8 352.7 L 563.3 352.7 C 564.3 352.7 565.1 352.6 565.5 352.3 C 565.9 352.1 566.1 351.6 566.1 351 C 566.1 350.5 565.9 350 565.5 349.8 C 565.1 349.5 564.3 349.4 563.3 349.4 L 561.7 349.4 C 561 349.4 560.8 349.7 560.8 350.3 Z M 567.9 358.9 C 568.3 359.4 568.1 359.8 567.4 359.8 L 566.6 359.8 C 566.2 359.8 565.9 359.6 565.7 359.3 L 563.1 354.7 L 560.8 354.7 L 560.8 359 C 560.8 359.6 560.5 359.8 560 359.8 L 559.5 359.8 C 559 359.8 558.8 359.6 558.8 359 L 558.8 350.1 C 558.8 349.2 559 348.5 559.4 348.1 C 559.9 347.7 560.6 347.4 561.6 347.4 L 563.1 347.4 C 564.8 347.4 565.9 347.7 566.8 348.2 C 567.7 348.8 568.2 349.7 568.2 351 C 568.2 353.1 567.2 354.1 565.2 354.5 Z M 567.9 358.9"/><path fill="#343936" d="M 577 359.8 C 576.5 359.8 576.2 359.5 576.3 359 L 577.4 349.6 C 577.6 347.9 578.2 347.3 579.6 347.3 C 580.2 347.3 580.7 347.4 581.1 347.8 C 581.4 348.1 581.7 348.7 581.9 349.6 L 583.4 357.4 C 583.5 357.7 583.6 357.8 583.7 357.8 C 583.9 357.8 584 357.7 584 357.4 L 585.6 349.6 C 585.8 348.7 586.1 348.1 586.4 347.8 C 586.8 347.4 587.3 347.3 587.9 347.3 C 589.3 347.3 589.9 347.9 590.1 349.6 L 591.2 359 C 591.3 359.5 591 359.8 590.5 359.8 L 590 359.8 C 589.5 359.8 589.2 359.6 589.2 359.1 L 588 349.7 C 588 349.6 587.9 349.5 587.8 349.5 C 587.7 349.5 587.7 349.6 587.6 349.7 L 585.9 358.1 C 585.7 359.3 585 359.8 583.7 359.8 C 582.5 359.8 581.8 359.3 581.6 358.1 L 579.8 349.7 C 579.8 349.6 579.8 349.5 579.6 349.5 C 579.5 349.5 579.5 349.6 579.5 349.7 L 578.3 359.1 C 578.3 359.6 578 359.8 577.5 359.8 Z M 577 359.8"/><path fill="#343936" d="M 602.3 354.4 L 607.1 354.4 L 605.8 350.4 C 605.5 349.4 605.2 349.1 604.7 349.1 C 604.1 349.1 603.8 349.4 603.5 350.4 Z M 609.4 359.8 C 608.9 359.8 608.6 359.6 608.5 359.2 L 607.6 356.3 L 601.7 356.3 L 600.9 359.2 C 600.7 359.6 600.4 359.8 600 359.8 L 599.5 359.8 C 598.9 359.8 598.7 359.5 598.8 358.9 L 601.5 350.1 C 601.9 349.1 602.3 348.3 602.7 347.9 C 603.2 347.5 603.8 347.3 604.7 347.3 C 605.5 347.3 606.2 347.5 606.7 347.9 C 607.1 348.3 607.5 349.1 607.8 350.1 L 610.5 358.9 C 610.7 359.5 610.4 359.8 609.9 359.8 Z M 609.4 359.8"/><path fill="#343936" d="M 626.2 347.6 C 626.6 347.7 626.9 348 626.9 348.5 L 626.9 348.9 C 626.9 349.4 626.5 349.7 626 349.5 C 621.7 348.5 620.1 350.1 620.1 353.6 C 620.1 357.1 621.7 358.7 626 357.7 C 626.5 357.6 626.9 357.8 626.9 358.4 L 626.9 358.7 C 626.9 359.2 626.6 359.5 626.1 359.6 C 622.8 360.5 620.3 359.8 619 357.6 C 618.3 356.6 618 355.2 618 353.6 C 618 348.7 621.2 346.3 626.2 347.6"/><path fill="#343936" d="M 640.3 345.2 L 638.3 346 C 637.9 346.2 637.6 346.1 637.3 345.8 C 637.1 345.4 637.2 345.1 637.7 344.8 L 639.7 343.7 C 640.1 343.5 640.4 343.5 640.8 343.7 L 642.8 344.8 C 643.3 345.1 643.4 345.4 643.2 345.8 C 642.9 346.1 642.6 346.2 642.2 346 Z M 643.7 357.9 C 644.2 357.9 644.4 358.1 644.4 358.7 L 644.4 359 C 644.4 359.6 644.2 359.8 643.7 359.8 L 638.4 359.8 C 637.4 359.8 636.6 359.6 636.2 359.2 C 635.7 358.8 635.5 358.1 635.5 357.1 L 635.5 350.1 C 635.5 349.2 635.7 348.5 636.2 348.1 C 636.6 347.7 637.4 347.4 638.4 347.4 L 643.3 347.4 C 643.8 347.4 644.1 347.7 644.1 348.2 L 644.1 348.6 C 644.1 349.1 643.8 349.4 643.3 349.4 L 638.6 349.4 C 637.8 349.4 637.6 349.7 637.6 350.3 L 637.6 352.6 L 642.4 352.6 C 642.9 352.6 643.1 352.9 643.1 353.4 L 643.1 353.8 C 643.1 354.3 642.9 354.5 642.4 354.5 L 637.6 354.5 L 637.6 357 C 637.6 357.6 637.8 357.9 638.6 357.9 Z M 643.7 357.9"/><path fill="#343936" d="M 663 347.4 C 663.5 347.4 663.7 347.7 663.7 348.2 L 663.7 354.9 C 663.7 356.6 663.3 357.9 662.5 358.7 C 661.7 359.6 660.3 360 658.4 360 C 656.6 360 655.2 359.6 654.4 358.7 C 653.6 357.9 653.1 356.6 653.1 354.9 L 653.1 348.2 C 653.1 347.7 653.4 347.4 653.9 347.4 L 654.4 347.4 C 654.9 347.4 655.2 347.7 655.2 348.2 L 655.2 355 C 655.2 357.1 656.2 358 658.4 358 C 660.7 358 661.7 357.1 661.7 355 L 661.7 348.2 C 661.7 347.7 661.9 347.4 662.5 347.4 Z M 663 347.4"/><path fill="#343936" d="M 681.5 347.4 C 682.1 347.4 682.3 347.7 682.3 348.2 L 682.3 348.6 C 682.3 349.1 682.1 349.4 681.5 349.4 L 678.2 349.4 L 678.2 359 C 678.2 359.6 677.9 359.8 677.4 359.8 L 676.9 359.8 C 676.3 359.8 676.1 359.6 676.1 359 L 676.1 349.4 L 672.7 349.4 C 672.2 349.4 671.9 349.1 671.9 348.6 L 671.9 348.2 C 671.9 347.7 672.2 347.4 672.7 347.4 Z M 681.5 347.4"/><path fill="#343936" d="M 691.5 359.8 C 691 359.8 690.7 359.6 690.7 359 L 690.7 348.2 C 690.7 347.7 691 347.4 691.5 347.4 L 692 347.4 C 692.5 347.4 692.8 347.7 692.8 348.2 L 692.8 359 C 692.8 359.6 692.5 359.8 692 359.8 Z M 691.5 359.8"/><path fill="#343936" d="M 710.1 347.6 C 710.6 347.7 710.8 348 710.8 348.5 L 710.8 348.9 C 710.8 349.4 710.5 349.7 709.9 349.5 C 705.6 348.5 704.1 350.1 704.1 353.6 C 704.1 357.1 705.6 358.7 709.9 357.7 C 710.5 357.6 710.8 357.8 710.8 358.4 L 710.8 358.7 C 710.8 359.2 710.6 359.5 710.1 359.6 C 706.7 360.5 704.3 359.8 702.9 357.6 C 702.2 356.6 701.9 355.2 701.9 353.6 C 701.9 348.7 705.1 346.3 710.1 347.6"/><path fill="#343936" d="M 722.2 354.4 L 726.9 354.4 L 725.7 350.4 C 725.4 349.4 725.1 349.1 724.5 349.1 C 724 349.1 723.7 349.4 723.4 350.4 Z M 729.2 359.8 C 728.8 359.8 728.5 359.6 728.3 359.2 L 727.5 356.3 L 721.6 356.3 L 720.7 359.2 C 720.6 359.6 720.3 359.8 719.8 359.8 L 719.3 359.8 C 718.8 359.8 718.5 359.5 718.7 358.9 L 721.4 350.1 C 721.7 349.1 722.1 348.3 722.6 347.9 C 723 347.5 723.7 347.3 724.5 347.3 C 725.4 347.3 726 347.5 726.5 347.9 C 727 348.3 727.4 349.1 727.7 350.1 L 730.4 358.9 C 730.5 359.5 730.3 359.8 729.7 359.8 Z M 729.2 359.8"/><path fill="#343936" d="M 683.6 334.5 L 663.5 334.5 C 656.7 334.5 653.4 330.8 653.4 323.4 L 653.4 291.6 L 662.4 291.6 L 662.4 322.7 C 662.4 325.5 663.3 326.4 666.2 326.4 L 680.3 326.4 C 681.9 326.4 682.7 327.1 682.9 328.8 Z M 683.6 334.5"/><path fill="#343936" d="M 759.4 322.4 C 759.4 325.1 758.3 326.4 755.4 326.4 L 740.8 326.4 L 740.8 316.4 L 755.4 316.4 C 758.3 316.4 759.4 317.7 759.4 320.3 Z M 754.4 299.7 C 757 299.7 758.2 301 758.2 303.6 L 758.2 304.9 C 758.2 307.5 757 308.8 754.4 308.8 L 740.8 308.8 L 740.8 299.7 Z M 762.3 312 L 762.3 311.6 C 765.2 310.3 766.8 307.5 766.8 304.1 L 766.8 302.4 C 766.8 295.5 762.8 291.6 754.9 291.6 L 731.8 291.6 L 731.8 334.5 L 755.8 334.5 C 765 334.5 768.4 329.7 768.4 323.3 L 768.4 321.2 C 768.4 316.2 766.3 313 762.3 312"/><path fill="#343936" d="M 713.6 293.2 C 713.1 292 712.4 291.5 711.2 291.5 L 704.8 291.5 L 714.1 316.1 C 714.2 316.5 714.2 316.9 714 317.2 C 713.8 317.5 713.4 317.6 713.1 317.6 L 696.5 317.5 C 694.4 317.5 692.5 318.7 691.6 320.7 L 685.8 334.4 L 692.6 334.4 C 693.9 334.4 694.8 333.9 695.2 332.8 L 698.3 324.9 C 698.6 324.2 699.1 323.9 699.8 323.9 L 715.9 323.9 C 716.7 323.9 717.2 324.2 717.4 324.9 L 720.5 332.7 C 720.9 333.9 721.8 334.4 723 334.4 L 729.9 334.4 Z M 713.6 293.2"/></svg>`;

function renderLogin() {
  const soMs = !!(window.MOBILAB_API && Srv.entra && !Srv.teste);
  app().innerHTML = `
  <div class="lg-fundo"><div class="lg-tela">
    <section class="lg-marca" aria-label="Natulab">
      <div class="lg-logo">${LOGO_NATULAB}</div>
      <div class="lg-servicos">
        <p class="lg-titulo">Mais facilidade. <span>Mais conexão.</span></p>
        <p class="lg-frase">Táxi e Moto Táxi corporativo da Natulab.</p>
        <ul><li><b>Mobilab</b><small>Solicite, acompanhe e organize seus deslocamentos entre os sites.</small></li></ul>
      </div>
      <p class="lg-rodape escuro">© ${new Date().getFullYear()} Natulab Farmacêutica · Uso interno</p>
    </section>
    <section class="lg-acesso">
      <span class="lg-selo"><i></i>Mobilidade corporativa</span>
      <div class="lg-form">
        <p class="lg-boas"><i></i>Bem-vindo ao Mobilab</p>
        <h1>Mobilab<span>.</span></h1>
        <p class="lg-sub">${soMs ? 'Seus deslocamentos, mais simples e conectados. Entre com sua conta corporativa para continuar.' : 'Informe suas credenciais abaixo para acessar sua conta.'}</p>
        ${soMs ? `<a class="lg-ms" href="/auth/entra"><svg width="20" height="20" viewBox="0 0 21 21" aria-hidden="true"><rect x="1" y="1" width="9" height="9" fill="#f25022"/><rect x="11" y="1" width="9" height="9" fill="#7fba00"/><rect x="1" y="11" width="9" height="9" fill="#00a4ef"/><rect x="11" y="11" width="9" height="9" fill="#ffb900"/></svg>Entrar com a conta Microsoft</a>
        <p class="lg-mesma">A mesma conta que você usa no Outlook e no Teams.</p>
        <div class="lg-prot" id="lprot"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3l7.5 3v5.5c0 4.6-3.2 8.3-7.5 9.5-4.3-1.2-7.5-4.9-7.5-9.5V6z"/><path d="M8.5 12l2.5 2.5 4.5-4.5"/></svg>
          <b>Seu acesso está protegido</b><span>A autenticação é feita pela Microsoft. O Mobilab não acessa nem armazena sua senha.</span></div>` : ''}
        <form id="lf" novalidate ${soMs ? 'hidden' : ''}>
          <div class="lg-campo"><label for="em">E-mail</label><input class="lg-input" id="em" type="email" placeholder="seuemail@exemplo.com" autocomplete="username"></div>
          <div class="lg-campo"><label for="pw">Senha</label><div class="lg-senha"><input class="lg-input" id="pw" type="password" placeholder="Digite sua senha" autocomplete="current-password">
            <button type="button" id="eye" aria-label="Mostrar senha"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7S1 12 1 12z"/><circle cx="12" cy="12" r="3"/></svg></button></div></div>
          <div class="lg-linha"><label class="lg-lembrar"><input type="checkbox" checked> Lembrar de mim</label><a class="lg-link" href="#" id="forgot">Esqueci minha senha</a></div>
          <button class="btn-primary lg-entrar" type="submit">Entrar</button>
        </form>
        <div id="lerr" class="lg-erro" hidden></div>
        ${window.MOBILAB_API && Srv.entra && !soMs ? `<div class="lg-ou"><span>ou</span></div>
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
      <div class="lg-pe">
        <div class="lg-ajuda"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6M12 17v.01"/></svg>
          <div><small>Precisa de ajuda para entrar?</small><a href="https://natuservices.natulab.com.br/" target="_blank" rel="noopener noreferrer">Abra um chamado para a TI <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg></a></div></div>
        ${soMs ? `<button type="button" class="lg-adm" id="ladm" aria-expanded="false" aria-controls="lf" aria-label="Acesso local" title="Acesso local"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg></button>` : ''}
      </div>
    </section>
  </div></div>`;
  if ($('#ladm')) $('#ladm').onclick = () => {
    $('#lf').hidden = false; $('#lprot').hidden = true; $('.lg-acesso').classList.add('local'); $('#ladm').setAttribute('aria-expanded', 'true');
    $('#forgot').hidden = true; $('label[for=em]').textContent = 'Usuário'; $('#em').type = 'text'; $('#em').value = 'admin'; $('#pw').focus();
  };
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
// ---- Solicitante: começa com quem está logado; dá para apagar e escolher outra pessoa (o pedido fica no nome dela)
const meuPedido = (r) => r.email === S.user.email || !!(r.por && r.por.email === S.user.email);
function campoSolicitante() {
  return `<div class="f"><label for="sol">Solicitante <small>(quem vai viajar)</small></label>
      <div class="rs-busca"><input id="sol" value="${esc(S.user.nome)}" autocomplete="off" placeholder="Digite o nome de quem vai viajar"><div class="rs-sug" id="solsug" hidden></div></div></div>
    <div class="f"><label>Centro de custo</label><input id="solcc" readonly value="${esc(S.user.cc || '—')}"><small id="solccn">Carregado do cadastro corporativo</small></div>`;
}
function ligarSolicitante(onTroca) {
  const eu = { nome: S.user.nome, email: S.user.email, cc: S.user.cc, aprovador: chefeDe() };
  let atual = eu, lista = [];
  const q = $('#sol'), sug = $('#solsug');
  const escolhe = (p) => {
    atual = { ...p, aprovador: p.aprovador && p.aprovador.email ? p.aprovador : p.email === S.user.email ? chefeDe() : gestorDe(p.cc) };
    q.value = p.nome; sug.hidden = true; // centro de custo continua o de quem está pedindo
    $('#solccn').textContent = p.email === S.user.email ? 'Carregado do cadastro corporativo' : 'Pedido para outra pessoa: fica no seu centro de custo e você registrado como quem pediu';
    if (onTroca) onTroca(atual);
  };
  const mostra = async () => {
    const t = semAcento(q.value.trim());
    if (t.length < 2) { sug.hidden = true; return; }
    let todos;
    try { todos = await colegas(); } catch (e) { sug.innerHTML = `<div class="rs-vazio">${esc(e.message)}</div>`; sug.hidden = false; return; }
    lista = [eu, ...todos.filter((x) => x.email !== S.user.email)].filter((x) => semAcento(`${x.nome} ${x.cc}`).includes(t)).slice(0, 8);
    sug.innerHTML = lista.length ? lista.map((x, i) => `<button type="button" data-i="${i}"><b>${esc(x.nome)}${x.email === S.user.email ? ' (você)' : ''}</b><small>${esc(ccPartes(x.cc).dep || '—')}</small></button>`).join('')
      : '<div class="rs-vazio">Ninguém encontrado com esse nome.</div>';
    sug.hidden = false;
    sug.querySelectorAll('[data-i]').forEach((b) => { b.onmousedown = (e) => { e.preventDefault(); escolhe(lista[Number(b.dataset.i)]); }; });
  };
  q.oninput = () => { clearTimeout(ligarSolicitante.t); ligarSolicitante.t = setTimeout(mostra, 150); };
  q.onblur = () => setTimeout(() => { sug.hidden = true; }, 150);
  q.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); const b = sug.querySelector('[data-i]'); if (b) b.onmousedown(e); } };
  return () => (q.value.trim() === atual.nome ? atual : null); // null = digitou e não escolheu ninguém da lista
}
const porQuem = (p) => (p.email !== S.user.email ? { por: { nome: S.user.nome, email: S.user.email } } : {});

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

// Agenda em formato de calendário (Mês · Semana · Dia · Lista): horários fixos da grade + as minhas solicitações.
// Versão anterior (cartões por dia) guardada em taxi/backup-agenda-antes-calendario e na tag git agenda-antes-calendario.
const CV_MIN = 1.2;      // pixels por minuto na grade de horas (30 min = 36 px)
const CV_DUR = 35;       // altura de cada corrida na grade, em minutos (os horários fixos ficam a 35–50 min uns dos outros)
const CV_COR = (st) => (['gestor', 'analise'].includes(st) ? 'pendente' : ['confirmada', 'reagendada', 'andamento'].includes(st) ? 'aprovada'
  : st === 'concluida' ? 'realizada' : st === 'recusada' ? 'recusada' : 'cancelada');
const minDe = (h) => { const [a, b] = String(h).split(':').map(Number); return a * 60 + (b || 0); };

function renderAgenda(page) {
  const hojeD = new Date(), todayStr = ymd(hojeD);
  if (!UI.cv) UI.cv = (typeof innerWidth === 'number' && innerWidth < 720) ? 'lista' : 'semana';
  if (UI.fixos === undefined) UI.fixos = true;
  if (UI.minhas === undefined) UI.minhas = true;
  let days, titulo;
  if (UI.cv === 'dia') {
    const d = UI.dia ? at(UI.dia, '00:00') : proxUtil(hojeD);
    days = [d];
    titulo = `${DIAS[d.getDay()]}, ${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
  } else if (UI.cv === 'mes') {
    const m0 = new Date(hojeD.getFullYear(), hojeD.getMonth() + UI.mes, 1);
    days = [];
    for (let d = m0; d.getMonth() === m0.getMonth(); d = addDays(d, 1)) if (isWeekday(d)) days.push(d);
    titulo = `${MESES[m0.getMonth()].replace(/^./, (c) => c.toUpperCase())} de ${m0.getFullYear()}`;
  } else {
    const base = addDays(mondayOf(hojeD), S.week * 7);
    days = [0, 1, 2, 3, 4].map((i) => addDays(base, i));
    titulo = weekLabel(days[0], days[4]);
  }
  const min = minAllowedGrade();
  const off = offHoursTarget();
  const mine = S.reqs.filter((r) => r.email === S.user.email);
  const minhasTodas = S.reqs.filter(meuPedido);
  const noPer = (h) => UI.per === 'todos' || periodo(h) === UI.per;
  const g = grade().filter((s) => noPer(s.hora));
  if (UI.sel && !days.some((d) => ymd(d) === UI.sel.d)) UI.sel = null;
  const novas = minhasMsgs().filter((e) => !e.lida);
  const agora = new Date();

  // ---- eventos de um dia: horários fixos (clicar abre o painel do horário) e minhas solicitações (clicar abre o pedido)
  const eventosDo = (ds) => {
    const out = [], ja = new Set();
    if (UI.fixos) g.forEach((s) => {
      const i = slotInfo(ds, s, min, mine), p = s.paradas;
      if (i.my) ja.add(i.my.id);
      const sel = UI.sel && UI.sel.d === ds && UI.sel.h === s.hora;
      out.push({ hora: s.hora, titulo: `${curto(p[0])} → ${curto(p[p.length - 1])}`, rota: rotaTxt(p),
        cls: i.my ? `ev-${CV_COR(i.my.status)}` : 'ev-fixo', passado: i.cls === 'indisp' && !i.my, foi: at(ds, s.hora) < agora, sel,
        sub: i.my ? `Minha viagem · ${STATUS[i.my.status]}` : `${i.occ}/${i.cap} lugares`, attr: `data-d="${ds}" data-h="${s.hora}"` });
    });
    if (UI.minhas) minhasTodas.filter((r) => r.data === ds && !ja.has(r.id) && noPer(r.hora)).forEach((r) => {
      const m = mot(r.motorista), st = CV_COR(r.status);
      out.push({ hora: r.hora, titulo: `${curto(r.origem)} → ${curto(r.destino)}`, rota: `${siteName(r.origem)} → ${siteName(r.destino)}`,
        cls: `ev-${st}${['recusada', 'cancelada'].includes(st) ? ' ev-riscado' : ''}`, passado: at(r.data, r.hora) < agora, foi: at(r.data, r.hora) < agora,
        sub: [r.tipo === 'moto' ? 'Mototáxi' : r.tipo === 'grade' ? '' : 'Táxi', STATUS[r.status], m && m.nome].filter(Boolean).join(' · '), attr: `data-req="${esc(r.id)}"` });
    });
    return out.sort((a, b) => a.hora.localeCompare(b.hora));
  };
  const evCls = (e) => `ev ${e.cls}${e.passado || e.foi ? ' ev-passado' : ''}${e.foi ? ' ev-foi' : ''}${e.sel ? ' ev-sel' : ''}`;
  const evHtml = (e, estilo = '') => `<button type="button" class="${evCls(e)}" ${e.foi ? 'disabled tabindex="-1"' : e.attr} title="${esc(e.rota)}"${estilo ? ` style="${estilo}"` : ''}>
      <span class="ev-linha"><b>${e.hora}</b><small>${esc(e.sub)}</small></span><span class="ev-titulo">${esc(e.titulo)}</span></button>`;
  const porDia = days.map((d) => ({ d, ds: ymd(d), evs: eventosDo(ymd(d)) }));
  const cabDia = (d, ds, curto2) => `<button type="button" class="cv-dh${ds === todayStr ? ' cv-hj' : ''}" data-dia="${ds}"${ds < todayStr ? ' disabled' : ''}>${curto2 ? DIAS[d.getDay()].slice(0, 3) : DIAS[d.getDay()]}<b>${pad(d.getDate())}/${pad(d.getMonth() + 1)}</b></button>`;

  // ---- Semana / Dia: grade de horas
  const gradeHoras = () => {
    const todosMin = porDia.flatMap((x) => x.evs.map((e) => minDe(e.hora)));
    const h0 = Math.max(0, Math.min(6, ...todosMin.map((m) => Math.floor(m / 60))));
    const h1 = Math.min(24, Math.max(19, ...todosMin.map((m) => Math.ceil((m + CV_DUR) / 60))));
    const alt = (h1 - h0) * 60 * CV_MIN;
    const rotulos = Array.from({ length: h1 - h0 }, (_, i) => `<span style="top:${i * 60 * CV_MIN}px">${pad(h0 + i)}:00</span>`).join('');
    const coluna = ({ ds, evs }) => {
      // corridas no mesmo horário ficam lado a lado
      const lay = evs.map((e) => ({ e, ini: minDe(e.hora) }));
      let cols = [], grupo = [], fimG = -1;
      const fecha = () => { grupo.forEach((x) => { x.n = cols.length; }); cols = []; grupo = []; fimG = -1; };
      lay.forEach((x) => {
        if (x.ini >= fimG) fecha();
        let c = cols.findIndex((f) => f <= x.ini);
        if (c < 0) { c = cols.length; cols.push(0); }
        cols[c] = x.ini + CV_DUR; x.c = c; grupo.push(x); fimG = Math.max(fimG, x.ini + CV_DUR);
      });
      fecha();
      const agoraMin = agora.getHours() * 60 + agora.getMinutes();
      const linhaAgora = ds === todayStr && agoraMin >= h0 * 60 && agoraMin <= h1 * 60 ? `<i class="cv-agora" style="top:${(agoraMin - h0 * 60) * CV_MIN}px"></i>` : '';
      return `<div class="cv-col${ds === todayStr ? ' cv-hj' : ''}">${lay.map((x) => evHtml(x.e,
        `top:${(x.ini - h0 * 60) * CV_MIN}px;height:${CV_DUR * CV_MIN - 2}px;left:calc(${(100 / x.n) * x.c}% + 2px);width:calc(${100 / x.n}% - 4px)`)).join('')}${linhaAgora}</div>`;
    };
    return `<div class="cv-scroll" id="cvs"><div class="cv-tg${days.length === 1 ? ' um' : ''}" style="--cols:${days.length}">
      <div class="cv-cab"><span></span>${porDia.map(({ d, ds }) => cabDia(d, ds)).join('')}</div>
      <div class="cv-corpo" style="height:${alt}px"><div class="cv-horas">${rotulos}</div>${porDia.map(coluna).join('')}</div></div></div>`;
  };
  // ---- Mês: um quadro por dia útil, até 3 corridas e "+N mais"
  const gradeMes = () => {
    const vazios = (days[0].getDay() + 6) % 7;
    const cel = ({ d, ds, evs }) => `<div class="cv-mc${ds === todayStr ? ' cv-hj' : ''}${ds < todayStr ? ' cv-pass' : ''}"${ds < todayStr ? '' : ` data-dia="${ds}"`}>
        <span class="cv-mn">${d.getDate()}</span>${evs.slice(0, 3).map((e) => evHtml(e)).join('')}
        ${evs.length > 3 ? `<button type="button" class="cv-mais" data-dia="${ds}"${ds < todayStr ? ' disabled' : ''}>+${evs.length - 3} mais</button>` : ''}</div>`;
    return `<div class="cv-scroll" id="cvs"><div class="cv-mes"><div class="cv-mes-cab">${['Seg', 'Ter', 'Qua', 'Qui', 'Sex'].map((x) => `<span>${x}</span>`).join('')}</div>
      <div class="cv-mes-grade">${'<div class="cv-mc vazio"></div>'.repeat(vazios)}${porDia.map(cel).join('')}</div></div></div>`;
  };
  // ---- Lista: a semana agrupada por dia
  const lista = () => {
    const comEv = porDia.filter((x) => x.evs.length);
    return `<div class="cv-scroll" id="cvs">${comEv.length ? `<table class="cv-lista"><tbody>${comEv.map(({ d, ds, evs }) => `
      <tr class="cv-ld"><th colspan="2">${DIAS[d.getDay()]}${ds === todayStr ? ' <span class="hoje">Hoje</span>' : ''}</th><th>${fmtDate(ds)}</th></tr>
      ${evs.map((e) => `<tr class="cv-li${e.passado || e.foi ? ' ev-passado' : ''}${e.foi ? ' cv-foi' : ''}"><td class="cv-lh">${e.hora}</td><td class="cv-lp"><i class="${e.cls.split(' ')[0]}"></i></td>
        <td>${evHtml(e)}</td></tr>`).join('')}`).join('')}</tbody></table>` : '<div class="cv-vazio">Nenhuma corrida neste período.</div>'}</div>`;
  };

  const segP = (k, l) => `<button class="seg-b${UI.per === k ? ' on' : ''}" data-per="${k}">${l}</button>`;
  const segV = (k, l) => `<button aria-pressed="${UI.cv === k}" data-cv="${k}">${l}</button>`;

  shell(page, `
    <div class="hero">
      <div><span class="eyebrow">Mobilidade corporativa</span><h1>Olá, ${esc(S.user.nome)}</h1>
        <p>Horários fixos e as suas corridas. Clique num horário para ver a rota, as vagas e solicitar.</p></div>
      <button class="btn-cta inline" id="avulsa">${ico('plus', 18)} Solicitação avulsa</button>
    </div>
    ${novas.length ? `<div class="notif">
      <div class="notif-h"><span class="si green">${ico('mail', 20)}</span><div><b>${novas.every((e) => !e.kind) ? (novas.length === 1 ? 'Viagem confirmada' : `${novas.length} viagens confirmadas`) : `${novas.length} ${novas.length === 1 ? 'mensagem nova' : 'mensagens novas'} do Facilities`}</b>
        <small>Enviadas também para o seu e-mail: confirmações, recusas e remarcações.</small></div></div>
      ${novas.slice(0, 3).map((e) => `<button class="mail-row nova k-${e.kind || 'ok'}" data-em="${esc(e.id)}"><i></i><span><b>${esc(e.assunto)}</b><small>${esc(e.quando)} · ${esc(e.refs.join(', '))}</small></span><span class="lnk">Abrir</span></button>`).join('')}
    </div>` : ''}
    ${off ? `<div class="banner warn">${ico('clock', 18)}<div><b>Fora do expediente do Facilities.</b> Solicitações da grade feitas agora vão para o <b>2º horário do próximo dia útil: ${esc(fmtDT(off.data, off.hora))}</b>.</div></div>` : ''}
    <div class="ag-body">
      <div class="ag-main cal-card">
        <div class="cal-barra">
          <div class="cal-nav">
            <button class="btn" id="hoje">Hoje</button>
            <button class="icon-btn" id="prev" aria-label="Anterior">${ico('left')}</button>
            <button class="icon-btn" id="next" aria-label="Próximo">${ico('right')}</button>
            <h2>${esc(titulo)}</h2>
          </div>
          <div class="segmentado">${segV('mes', 'Mês')}${segV('semana', 'Semana')}${segV('dia', 'Dia')}${segV('lista', 'Lista')}</div>
        </div>
        <div class="cal-filtros">
          <label class="check"><input type="checkbox" id="cvfix" ${UI.fixos ? 'checked' : ''}> <span>Horários fixos</span></label>
          <label class="check"><input type="checkbox" id="cvmin" ${UI.minhas ? 'checked' : ''}> <span>Minhas solicitações</span></label>
          <div class="seg">${segP('todos', 'Todos')}${segP('Manhã', 'Manhã')}${segP('Tarde', 'Tarde')}</div>
          <div class="cal-legenda">
            <span><i class="ev-fixo"></i>Horário fixo</span><span><i class="ev-pendente"></i>Pendente</span><span><i class="ev-aprovada"></i>Aprovada</span>
            <span><i class="ev-realizada"></i>Realizada</span><span><i class="ev-recusada"></i>Recusada</span><span><i class="ev-cancelada"></i>Cancelada</span>
          </div>
        </div>
        ${UI.cv === 'mes' ? gradeMes() : UI.cv === 'lista' ? lista() : gradeHoras()}
      </div>
      ${UI.sel ? `<div class="det-fundo" id="detf"></div><aside class="det gaveta" id="det" role="dialog" aria-label="Detalhes do horário">${painelSlot(UI.sel, min, mine)}</aside>` : ''}
    </div>`);

  // rolagem da grade: mantém onde a pessoa estava quando a tela redesenha (clique, atualização a cada minuto)
  const cvs = $('#cvs');
  if (cvs) {
    const k = `${UI.cv}|${days.length && ymd(days[0])}`;
    if (UI.cvY && UI.cvY.k === k) cvs.scrollTop = UI.cvY.y;
    cvs.onscroll = () => { UI.cvY = { k, y: cvs.scrollTop }; };
  }
  const andar = (n) => {
    if (UI.cv === 'dia') { const d = proxUtil(addDays(days[0], n), n); UI.dia = ymd(d); route(); }
    else if (UI.cv === 'mes') { UI.mes += n; route(); }
    else { S.week += n; save(); route(); }
  };
  const abreDia = (ds) => { UI.cv = 'dia'; UI.dia = ds; route(); };
  $('#prev').onclick = () => andar(-1);
  $('#next').onclick = () => andar(1);
  $('#hoje').onclick = () => { S.week = 0; UI.dia = null; UI.mes = 0; save(); route(); };
  document.querySelectorAll('[data-cv]').forEach((b) => { b.onclick = () => {
    const v = b.dataset.cv;
    if (v === 'dia' && UI.cv !== 'dia') UI.dia = ymd(days.some((d) => ymd(d) === todayStr) ? hojeD : days[0]);
    if (v === 'semana' || v === 'lista') { if (UI.cv === 'dia' && UI.dia) { S.week = Math.round((mondayOf(at(UI.dia, '12:00')) - mondayOf(hojeD)) / 6048e5); save(); } }
    UI.cv = v; route();
  }; });
  document.querySelectorAll('.cv-dh, .cv-mais').forEach((b) => { b.onclick = () => abreDia(b.dataset.dia); });
  document.querySelectorAll('.cv-mc[data-dia]').forEach((c) => { c.onclick = (e) => { if (!e.target.closest('.ev')) abreDia(c.dataset.dia); }; });
  $('#cvfix').onchange = (e) => { UI.fixos = e.target.checked; route(); };
  $('#cvmin').onchange = (e) => { UI.minhas = e.target.checked; route(); };
  $('#avulsa').onclick = openAvulsa;
  document.querySelectorAll('[data-per]').forEach((b) => { b.onclick = () => { UI.per = b.dataset.per; route(); }; });
  document.querySelectorAll('.notif .mail-row').forEach((b) => { b.onclick = () => openEmail(b.dataset.em); });
  document.querySelectorAll('.ev[data-h]').forEach((el) => { el.onclick = () => { UI.sel = { d: el.dataset.d, h: el.dataset.h }; route(); }; });
  document.querySelectorAll('.ev[data-req]').forEach((el) => { el.onclick = () => openDetalhe(el.dataset.req); });
  const go = $('#go');
  if (go) go.onclick = () => { // com solicitação ativa, openSlot abre o detalhe dela
    const res = UI.res && UI.res.k === `${UI.sel.d}|${UI.sel.h}` ? UI.res : null;
    if (go.dataset.act !== 'sol' || !res) return openSlot(UI.sel.d, UI.sel.h);
    if (res.carga && !res.cargaTxt.trim()) { toast('Informe o que vai levar no porta-malas.'); const i = $('#rscgt'); if (i) i.focus(); return; }
    openSlot(UI.sel.d, UI.sel.h, { pax: 1 + res.acomp.length, acomp: res.acomp.slice(), carga: res.carga ? res.cargaTxt.trim() : '', bag: 'N/A' });
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
const bagCampo = (v) => `<div class="f"><label for="bg">Bagagem <small>(descreva o que vai levar)</small></label><input id="bg" maxlength="200" value="${esc(v || 'N/A')}" placeholder="Ex.: 1 mala média e 1 caixa de amostras"></div>`;

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
      ${campoSolicitante()}
      <div class="f full"><label for="tr">Trecho</label><select id="tr">${trechoOptions(slot.paradas, p.trecho)}</select></div>
      <div class="f"><label for="px">Passageiros</label><input id="px" type="number" min="1" max="${SLOT_CAP}" value="${esc(p.pax || 1)}"><small>Incluindo você. Até ${CAP_PADRAO}: carro · acima: Spin (máx. ${SLOT_CAP})</small></div>
      ${bagCampo(BAG[p.bag] ? bagTxt(p) : p.bag)}
      ${p.acomp && p.acomp.length ? `<div class="f full"><label>Quem vai junto <small>(cada um no centro de custo do seu departamento)</small></label>
        <div class="acomp-l">${p.acomp.map((x) => `<span>${esc(x.nome)}<small>${esc(x.visitante ? 'visitante · seu centro de custo' : ccPartes(x.cc).dep || '—')}</small></span>`).join('')}</div>
        <input id="nm" type="hidden" value="${esc(p.acomp.map((x) => x.nome).join(', '))}"></div>`
      : `<div class="f full"><label for="nm">Nomes dos acompanhantes <small>(N/A se for só você)</small></label><input id="nm" value="${esc(p.nomes || 'N/A')}" placeholder="Ex.: Maria Santos, José Lima" required></div>`}
      ${p.carga ? `<div class="f full"><label>Carga no porta-malas</label><input readonly value="${esc(p.carga)}"></div>` : ''}
      <div class="f full"><label for="js">Justificativa</label><textarea id="js" placeholder="Motivo do deslocamento">${esc(p.just || '')}</textarea></div>
      ${retornoHtml('grade')}
    </form>
    <div id="sfmsg"></div>
    <div class="modal-acts"><button class="btn" id="cx">Cancelar</button><button class="btn green" id="ok">Enviar solicitação</button></div>`);
  $('#cx').onclick = closeModal;
  obrigatorios(['#sol', '#tr', '#px', '#nm', '#js', '#rpe', '#rvo', '#rvot', '#rth', '#rtht']);
  const quem = ligarSolicitante();
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
    const form = { trecho: $('#tr').value, pax, bag: $('#bg').value.trim() || 'N/A', nomes: $('#nm').value.trim(), just: $('#js').value.trim() };
    const msg = $('#sfmsg');
    const pes = quem();
    if (!pes) { msg.innerHTML = '<div class="msg-box bad">Escolha o solicitante na lista (digite o nome e clique na pessoa).</div>'; return; }
    if (pes.email !== S.user.email && S.reqs.some((x) => x.email === pes.email && x.tipo === 'grade' && x.data === data && x.hora === hora && ATIVOS.includes(x.status))) {
      msg.innerHTML = `<div class="msg-box bad">${esc(pes.nome)} já tem solicitação neste horário.</div>`; return;
    }
    if (!Number.isInteger(pax) || pax < 1 || pax > SLOT_CAP) { msg.innerHTML = `<div class="msg-box bad">Informe entre 1 e ${SLOT_CAP} passageiros.</div>`; return; }
    const nAc = p.acomp ? p.acomp.length : 0;
    if (pax < 1 + nAc) { msg.innerHTML = `<div class="msg-box bad">São ${1 + nAc} pessoas na reserva (você + ${nAc}). Informe pelo menos ${1 + nAc} passageiros.</div>`; return; }
    if (p.acomp) form.acomp = p.acomp;
    if (p.carga) form.carga = p.carga;
    const semNomes = !form.nomes || /^n\/?a$/i.test(form.nomes);
    if (!form.nomes) { msg.innerHTML = '<div class="msg-box bad">Informe os nomes dos acompanhantes (ou N/A se for só você).</div>'; return; }
    if (pax > 1 && semNomes) { msg.innerHTML = `<div class="msg-box bad">São ${pax} passageiros: informe os nomes dos acompanhantes.</div>`; return; }
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
      id: newReqId(), tipo: 'grade', nome: pes.nome, email: pes.email, cc: S.user.cc, ...porQuem(pes), data: d, hora: h, origem: o, destino: de, pax, bag: form.bag,
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
      ${campoSolicitante()}
      <div class="f full"><label for="tp">Tipo</label><select id="tp">
        <option value="cidade">Táxi na cidade (antecedência mín. 1 h)</option>
        <option value="inter">Táxi intermunicipal (antecedência mín. 48 h)</option>
        <option value="moto">Moto Táxi (antecedência a definir — DEC-14)</option></select></div>
      <div class="f"><label for="dt">Data</label><input id="dt" type="date" min="${minDate}" value="${minDate}"></div>
      <div class="f"><label for="hr" id="hrl">Horário de embarque</label><input id="hr" type="time" value="${pad((new Date().getHours() + 2) % 24)}:00"></div>
      <div class="f c-carro"><label for="og">Origem</label><select id="og">${siteOptions('MED')}</select><input id="ogt" placeholder="Endereço / local de embarque" hidden style="margin-top:6px"></div>
      <div class="f c-carro"><label for="ds">Destino</label><select id="ds">${siteOptions('OUTRO')}</select><input id="dst" placeholder="Endereço / local de destino" style="margin-top:6px"></div>
      <div class="f c-carro"><label for="px">Passageiros</label><input id="px" type="number" min="1" max="${SLOT_CAP}" value="1"></div>
      ${bagCampo('N/A').replace('class="f"', 'class="f c-carro"')}
      ${retornoHtml('avulsa')}
      <div class="f c-moto" hidden><label for="mo">Retirar em</label><select id="mo">${locOptions('MED')}</select><input id="mot" placeholder="Endereço / local de retirada" hidden style="margin-top:6px"></div>
      <div class="f c-moto" hidden><label for="md">Entregar em</label><select id="md">${locOptions('CD')}</select><input id="mdt" placeholder="Endereço / local de entrega" hidden style="margin-top:6px"></div>
      <div class="f full c-moto" hidden><label for="mi">O que será enviado?</label><input id="mi" placeholder="Ex.: envelope com notas fiscais, caixa de amostras, documentos para assinatura"></div>
      <div class="f c-moto" hidden><label for="mv">Quantidade de volumes</label><input id="mv" type="number" min="1" max="20" value="1"></div>
      <div class="f c-moto" hidden><label for="mt2">Tamanho</label><select id="mt2">${Object.entries(ITEM_TAM).map(([k, t]) => `<option value="${k}">${t.l}</option>`).join('')}</select></div>
      <div class="f full c-moto" hidden><label for="mr">Quem recebe no destino?</label><input id="mr" placeholder="Nome ou setor de quem recebe"></div>
      <div class="f full"><label for="js">Justificativa</label><textarea id="js"></textarea></div>
      <div class="f full" id="gnote" hidden><div class="msg-box warn" style="margin:0">Este pedido precisa da <b>aprovação de <span id="gnome">${esc(chefeDe().nome || 'sua liderança')}</span></b> (líder, coordenador, gerente ou diretor acima de quem vai viajar) antes de ir para o Facilities.</div></div>
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
  const quem = ligarSolicitante((p) => { $('#gnome').textContent = (p.aprovador && p.aprovador.nome) || 'a liderança'; });
  obrigatorios(['#sol', '#tp', '#dt', '#hr', '#og', '#ogt', '#ds', '#dst', '#px', '#mo', '#mot', '#md', '#mdt', '#mi', '#mv', '#mt2', '#mr', '#js', '#rpe', '#rvo', '#rvot', '#rth']);
  $('#ok').onclick = () => {
    const tipo = $('#tp').value, data = $('#dt').value, hora = $('#hr').value;
    const just = $('#js').value.trim();
    const pes = quem();
    if (!pes) { $('#avmsg').innerHTML = '<div class="msg-box bad">Escolha o solicitante na lista (digite o nome e clique na pessoa).</div>'; return; }
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
      campos = { origem, destino, item: it, vol, tam, recebedor, pax: 0, bag: 'N/A' };
    } else {
      const origem = valLoc('#og', '#ogt');
      const destino = valLoc('#ds', '#dst');
      const pax = parseInt($('#px').value, 10);
      if (!data || !hora || !origem || !destino || !just) return bad('Preencha data, horário, origem, destino e justificativa.');
      if (normLoc(origem) === normLoc(destino)) return bad('Origem e destino devem ser locais diferentes.');
      if (!Number.isInteger(pax) || pax < 1 || pax > SLOT_CAP) return bad(`Passageiros: entre 1 e ${SLOT_CAP} (Spin tem ${SLOT_CAP} lugares).`);
      const bag = $('#bg').value.trim() || 'N/A'; // apagou: fica N/A
      campos = { origem, destino, pax, bag };
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
      id: newReqId(), tipo, nome: pes.nome, email: pes.email, cc: S.user.cc, ...porQuem(pes), data, hora, ...campos,
      just, status: 'analise', veiculo: null, motorista: null, os: null, excecao, motivo: '', criado: nowStamp(),
    };
    if (ret && ret.bv) { r.bv = ret.bv; ret = null; } // bate-volta avulso = uma corrida só (motorista aguarda)
    if (precisaGestor(r)) Object.assign(r, { status: 'gestor', gestor: { ...(pes.aprovador && pes.aprovador.email ? pes.aprovador : chefeDe()) }, aprovPedido: nowStamp() });
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

// Cancelamento: livre até CANCEL_MIN minutos antes; depois, a corrida já alocada (veículo e motorista) continua cobrada.
// Quem marca a cobrança é o servidor (campo cobrar), pela hora do servidor.
const CANCEL_MIN = 30;
const cobrada = (r) => r.status === 'cancelada' && !!r.cobrar;
const limiteCancel = (r) => { const d = new Date(at(r.data, r.hora).getTime() - CANCEL_MIN * 60000); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}${ymd(d) !== ymd(new Date()) ? ` de ${fmtDate(ymd(d))}` : ''}`; };
function openDetalhe(id) {
  const r = S.reqs.find((x) => x.id === id);
  const v = veic(r.veiculo), m = mot(r.motorista);
  // colaborador cancela até a hora da viagem; com menos de CANCEL_MIN min, a corrida já alocada continua cobrada
  const canCancel = S.user.role === 'colaborador' && meuPedido(r) && ['analise', 'gestor', 'confirmada', 'reagendada'].includes(r.status) && at(r.data, r.hora) > new Date();
  const par = parDe(r);
  openModal(`
    <h3>${esc(r.id)} ${pill(r.status)}</h3>
    <p class="sub">${esc(TIPOS[r.tipo])}${pernaTxt(r) ? ` · <b>${pernaTxt(r)}${r.bv && r.perna ? ' (bate-volta)' : ''}</b>` : ''}${r.excecao ? ' · <b>exceção de prazo</b>' : ''} · criada em ${esc(r.criado)}</p>
    ${par ? `<div class="par-box">${r.perna === 'ida' ? 'Retorno' : 'Ida'}: <b>${esc(par.id)}</b> · ${esc(fmtDT(par.data, par.hora))} · ${esc(siteName(par.origem))} → ${esc(siteName(par.destino))} ${pill(par.status)}
      <button class="btn sm" id="vpar">Ver</button></div>` : ''}
    <div class="form-grid">
      <div class="f"><label>Solicitante</label><div>${esc(r.nome)}</div></div>
      <div class="f"><label>Pedido por</label><div>${r.por ? esc(r.por.nome) : 'a própria pessoa'}</div></div>
      <div class="f full"><label>Centro de custo</label><div>${esc(r.cc || '—')}</div></div>
      <div class="f"><label>Data/horário</label><div>${esc(fmtDT(r.data, r.hora))}</div></div>
      <div class="f"><label>Trecho</label><div>${esc(siteName(r.origem))} → ${esc(siteName(r.destino))}</div></div>
      ${r.tipo === 'moto' ? `
      <div class="f full"><label>O que será enviado</label><div>${esc(r.item)} — ${esc(r.vol)} volume(s), ${esc(ITEM_TAM[r.tam].l)}</div></div>
      <div class="f full"><label>Quem recebe</label><div>${esc(r.recebedor)}</div></div>` : `
      <div class="f"><label>Passageiros</label><div>${esc(r.pax)}${r.acomp && r.acomp.length ? ` <small>(${r.acomp.map((x) => `${esc(x.nome)} — ${esc(x.visitante ? 'visitante' : ccPartes(x.cc).dep || 'sem setor')}`).join('; ')})</small>` : r.nomes && !/^n\/?a$/i.test(r.nomes) ? ` <small>(${esc(r.nomes)})</small>` : ''}</div></div>
      ${r.carga ? `<div class="f"><label>Carga no porta-malas</label><div>${esc(r.carga)}</div></div>` : ''}
      <div class="f"><label>Bagagem</label><div>${esc(bagTxt(r))}</div></div>`}
      <div class="f"><label>Veículo</label><div>${v ? `${esc(v.nome)} · ${esc(v.placa)}` : '<small>A definir pelo Facilities</small>'}</div></div>
      <div class="f"><label>Motorista</label><div>${m ? esc(m.nome) : '<small>A definir pelo Facilities</small>'}</div></div>
      ${r.bv && !r.perna ? `<div class="f full"><label>Retorno</label><div>${esc(bvTxt(r))} · volta prevista ~${esc(addMin(r.hora, r.bv.espera + DURACAO_MIN))}</div></div>` : ''}
      ${r.gestor ? `<div class="f full"><label>Aprovação do gestor imediato (AD)</label><div>${esc(r.gestor.nome)} · ${r.aprov ? (r.aprov.ok ? `✓ aprovada em ${esc(r.aprov.quando)}` : `✕ reprovada em ${esc(r.aprov.quando)}${r.aprov.motivo ? ` — ${esc(r.aprov.motivo)}` : ''}`) : 'aguardando resposta'}</div></div>` : ''}
      ${assinaturasHtml(r)}
      ${r.mail ? `<div class="f full"><label>Aviso por e-mail</label><div>✉ Último aviso enviado para ${esc(r.email)} em ${esc(r.mail)}</div></div>` : ''}
      ${r.os ? `<div class="f full"><label>Ordem de serviço</label><div><b>${esc(r.os)}</b></div></div>` : ''}
      <div class="f full"><label>Justificativa</label><div>${esc(r.just)}</div></div>
      ${r.motivo ? `<div class="f full"><label>Motivo / observação do Facilities</label><div>${esc(r.motivo)}</div></div>` : ''}
      ${cobrada(r) ? `<div class="f full"><label>Custo</label><div><b>Cancelada com menos de ${CANCEL_MIN} min de antecedência:</b> o custo da corrida continua no centro de custo.</div></div>` : ''}
      ${canCancel && r.veiculo ? `<div class="f full"><label>Cancelamento</label><div>Sem custo até <b>${esc(limiteCancel(r))}</b>. Depois disso o custo da corrida continua no centro de custo, mesmo cancelando.</div></div>` : ''}
    </div>
    <div class="modal-acts">${canCancel ? '<button class="btn red" id="cancel">Cancelar solicitação</button>' : ''}<button class="btn" id="cx">Fechar</button></div>`);
  $('#cx').onclick = closeModal;
  if (par) $('#vpar').onclick = () => openDetalhe(par.id);
  if (canCancel) $('#cancel').onclick = () => {
    const tarde = !!r.veiculo && new Date() >= new Date(at(r.data, r.hora).getTime() - CANCEL_MIN * 60000);
    if (!confirm(tarde ? `Faltam menos de ${CANCEL_MIN} minutos para a viagem. O cancelamento será registrado, mas o custo da corrida continua no centro de custo.

Cancelar mesmo assim?` : `Cancelar ${r.id}?`)) return;
    const alvo = [r];
    if (par && ['analise', 'gestor', 'confirmada', 'reagendada'].includes(par.status) && at(par.data, par.hora) > new Date() && confirm(`Cancelar também ${r.perna === 'ida' ? 'o retorno' : 'a ida'} ${par.id}?`)) alvo.push(par);
    alvo.forEach((x) => { audit('Cancelada pelo solicitante', x.id, STATUS[x.status], 'Cancelada'); x.status = 'cancelada'; x.motivo = 'Cancelada pelo solicitante'; });
    save(); closeModal(); route(); toast(`${alvo.map((x) => x.id).join(' e ')} cancelada${alvo.length > 1 ? 's' : ''}${tarde ? ' — o custo da corrida continua no centro de custo' : ''}.`);
  };
}

function renderMinhas(page) {
  const mine = S.reqs.filter(meuPedido).sort((a, b) => at(b.data, b.hora) - at(a.data, a.hora));
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
    const cap = v.tipo === 'moto' ? `carga ${v.bag} pts` : `${v.cap} lugares`;
    return `<option value="${v.id}" ${!fits || occ ? 'disabled' : ''}${best && best.id === v.id ? ' selected' : ''}>${esc(v.nome)} (${cap})${v.tipo === 'moto' && !fits ? ' — carga insuficiente' : why}</option>`;
  }).join('');
}
// Veículo que o motorista usa (cadastro em Motoristas)
const veicDoMot = (m) => (m && m.veiculo ? veic(m.veiculo) : null);
const veicTxt = (v) => `${v.nome} (${v.tipo === 'moto' ? `carga ${v.bag} pts` : `${v.cap} lugares`})`;
// Confirmação de viagens: cada motorista anda sempre com o MESMO carro. Escolheu o motorista, o carro dele aparece travado.
// Motorista cujo carro não comporta a viagem (lugares/porta-malas) ou já está em outra viagem fica indisponível na lista.
// Só motorista sem carro cadastrado deixa escolher o veículo à mão.
function ligarMotoristaVeiculo(raiz = document) {
  raiz.querySelectorAll('.sd').forEach((sd) => {
    const sv = sd.parentElement.querySelector('.sv');
    if (!sv) return;
    const opV = (id) => [...sv.options].find((o) => o.value === id);
    const sugerido = sv.value; // menor veículo que comporta (escolha do sistema)
    [...sd.options].forEach((o) => {
      const v = veicDoMot(mot(o.value));
      if (!v || o.disabled) return;
      const ov = opV(v.id);
      if (!ov || ov.disabled) { o.disabled = true; o.textContent += ov && /ocupado|alocado/.test(ov.textContent) ? ' — carro já em outra viagem' : ' — carro não comporta esta viagem'; }
    });
    const livre = (o) => o && !o.disabled;
    // ao abrir: quem usa o veículo sugerido; senão o primeiro motorista disponível
    const pref = [...sd.options].find((o) => livre(o) && (veicDoMot(mot(o.value)) || {}).id === sugerido);
    if (pref) sd.value = pref.value;
    else if (!livre(sd.selectedOptions[0])) { const o = [...sd.options].find(livre); if (o) sd.value = o.value; }
    const aplica = () => {
      const v = veicDoMot(mot(sd.value));
      if (v) { sv.value = v.id; sv.disabled = true; sv.title = `Carro de ${mot(sd.value).nome}`; }
      else { sv.disabled = false; sv.title = ''; if (!livre(sv.selectedOptions[0])) { const o = [...sv.options].find(livre); if (o) sv.value = o.value; } }
    };
    aplica();
    sd.onchange = aplica;
  });
}
function driverOptions(tipo, data, hora, ignoreIds, dur) {
  const list = S.motoristas.filter((m) => m.tipo === tipo && m.ativo);
  if (!list.length) return '<option value="" disabled selected>Nenhum motorista ativo — cadastre em “Motoristas”</option>';
  return list.map((m) => {
    const occ = busy('motorista', m.id, data, hora, ignoreIds, dur);
    return `<option value="${m.id}" ${occ ? 'disabled' : ''}>${esc(m.nome)}${veicDoMot(m) ? ` · ${esc(veicTxt(veicDoMot(m)))}` : ''}${occ ? ' — ocupado' : ''}</option>`;
  }).join('');
}

function renderPainel(page) {
  const P = renderPainel;
  const per = P.per || 'todas';
  const abertos = P.abertos || (P.abertos = new Set());
  const hojeS = ymd(new Date()), amanhaS = ymd(addDays(new Date(), 1));
  const seg = ymd(mondayOf(new Date())), dom = ymd(addDays(mondayOf(new Date()), 6));
  const noPer = (d) => per === 'todas' || (per === 'hoje' ? d === hojeS : per === 'amanha' ? d === amanhaS : d >= seg && d <= dom);
  const pendTodas = S.reqs.filter((r) => r.status === 'analise');
  const pend = pendTodas.filter((r) => noPer(r.data));
  const viagensHoje = viagens().filter((v) => v.data === hojeS && v.st !== 'naorealizada').length;
  const gradeConf = S.reqs.filter((r) => r.tipo === 'grade' && r.status === 'confirmada' && r.veiculo);
  const occAvg = gradeConf.length ? Math.round(gradeConf.reduce((s, r) => s + r.pax / veic(r.veiculo).cap, 0) / gradeConf.length * 100) : 0;
  const aEnviar = viagens().filter((v) => v.st === 'enviar').length;

  // ---- peças do cartão
  const dataCurta = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const seta = ico('arrow', 14);
  const rotaHtml = (pares) => {
    if (pares.length === 1) return `<span>${esc(pares[0][0])}</span>${seta}<span>${esc(pares[0][1])}</span>`;
    return `<span>${esc(pares[0][0])}</span>${seta}<span>${esc(pares[0][1])}</span><small class="cf-mais">+${pares.length - 1} ${pares.length - 1 === 1 ? 'trecho' : 'trechos'}</small>`;
  };
  const sep = '<i class="s"></i>';
  const nomes = (rs) => [...new Set(rs.map((r) => r.nome))].join(', ');
  const idsTxt = (rs) => (rs.length === 1 ? rs[0].id : `${rs[0].id} +${rs.length - 1}`);
  const card = ({ key, attr, bad, hora, data, rota, meta, chips = '', det, acts, q }) => `
    <article class="cf${bad ? ' bad' : ''}${abertos.has(key) ? ' on' : ''}" ${attr} data-ck="${esc(key)}" data-q="${esc(q.toLowerCase())}">
      <div class="cf-top">
        <span class="cf-hora"><b>${esc(hora)}</b><small>${dataCurta(data)}</small></span>
        <span class="cf-tt"><b class="cf-rota">${rota}</b><span class="cf-meta">${meta}</span></span>
        <span class="cf-pills">${chips}<span class="cf-pill"><i></i>Pendente</span></span>
      </div>
      <div class="cf-det">${det}</div>
      <div class="cf-bar">
        <button class="cf-ver" type="button" aria-expanded="${abertos.has(key)}">${abertos.has(key) ? 'Ocultar detalhes' : 'Ver detalhes'} ${ico('down', 14)}</button>
        <span class="cf-acts">${acts}</span>
      </div>
    </article>`;
  const selMot = (tipo, opD, opV) => `<span class="cf-sel" title="${tipo === 'moto' ? 'Motociclista e moto' : 'Motorista e carro'}">${ico(tipo === 'moto' ? 'moto' : 'car', 17)}<select class="sd" aria-label="${tipo === 'moto' ? 'Motociclista' : 'Motorista'}">${opD}</select><select class="sv" aria-label="Veículo">${opV}</select></span>`;

  // ---- Entre sites: agrupado por horário da grade
  const groups = {};
  pend.filter((r) => r.tipo === 'grade').forEach((r) => { (groups[`${r.data} ${r.hora}`] ||= []).push(r); });
  const itensG = Object.keys(groups).sort().map((k) => {
    const rs = groups[k]; const [data, hora] = k.split(' ');
    const pax = rs.reduce((s, r) => s + r.pax, 0);
    const bagPts = 0; // bagagem é descritiva: o Facilities avalia o porta-malas
    const bagsTxt = rs.map(bagTxt).filter((t) => t !== 'N/A').join('; ') || 'N/A';
    const ids = rs.map((r) => r.id);
    const anyVeh = VEICULOS.some((v) => v.tipo === 'carro' && v.cap >= pax && v.bag >= bagPts && !busy('veiculo', v.id, data, hora, ids));
    const setores = [...new Set(rs.map((r) => r.cc.split('–')[1]?.trim() || r.cc))];
    const pares = [...new Map(rs.map((r) => [`${r.origem}|${r.destino}`, [siteName(r.origem), siteName(r.destino)]])).values()];
    const bag1 = rs.length === 1 ? bagCurto(rs[0]) : (bagsTxt === 'N/A' ? 'Sem bagagem' : `${rs.filter((r) => bagTxt(r) !== 'N/A').length} com bagagem`);
    const html = card({
      key: `g:${k}`, attr: `data-k="${esc(k)}"`, bad: !anyVeh, hora, data, rota: rotaHtml(pares),
      meta: `<span class="id">${esc(idsTxt(rs))}</span><em>${esc(nomes(rs))}</em>${sep}<span>${ico('users', 13)} ${pax} ${pax === 1 ? 'passageiro' : 'passageiros'}</span>${sep}<span>${ico('mala', 13)} ${esc(bag1)}</span>`,
      chips: (rs.length > 1 ? `<span class="cf-pill g"><i></i>Grupo: ${esc(setores.join(' + '))}</span>` : '') + (!anyVeh ? '<span class="cf-pill r"><i></i>Sem veículo</span>' : ''),
      det: `<ul class="cf-pess">${rs.map((r) => `<li><b>${esc(r.id)}</b><span>${esc(r.nome)}</span><small>${esc(r.cc)}</small><small>${esc(siteName(r.origem))} → ${esc(siteName(r.destino))} · ${r.pax} pax · ${esc(bagCurto(r))}</small>${r.perna ? `<span class="tag">${pernaTxt(r)} · ${esc(r.par)}</span>` : ''}</li>`).join('')}</ul>
        <div class="cf-info"><span>Total: <b>${pax} ${pax === 1 ? 'passageiro' : 'passageiros'}</b></span><span>Bagagem: <b>${esc(bagsTxt)}</b></span><span>Veículo indicado: <b>${pax > CAP_PADRAO ? `Spin (passou de ${CAP_PADRAO})` : `carro de ${CAP_PADRAO} vagas`}</b></span></div>`,
      acts: anyVeh ? `${selMot('carro', driverOptions('carro', data, hora, ids), vehicleOptions('carro', pax, bagPts, data, hora, ids))}
          <button class="cf-rec no-g" type="button">Recusar</button><button class="cf-ok ok-g" type="button">${ico('check', 15)} Confirmar${rs.length > 1 ? ' grupo' : ''}</button>`
        : `<span class="cf-alerta">Nenhum veículo comporta ${pax} passageiros neste horário.</span>${rs.map((r) => `<button class="cf-mv mv" type="button" data-id="${esc(r.id)}">Mover ${esc(r.id)} p/ próximo horário</button>`).join('')}<button class="cf-rec no-g" type="button">Recusar</button>`,
      q: `${ids.join(' ')} ${rs.map((r) => `${r.nome} ${r.cc}`).join(' ')} ${pares.flat().join(' ')}`,
    });
    return { data, hora, n: rs.length, html };
  });

  // ---- Moto Táxi: envios com mesmo dia, mesma retirada e mesma entrega, dentro da janela, que cabem em uma moto
  const clusters = motoClusters(pend);
  const itensM = clusters.map((c, i) => {
    const ids = c.rs.map((r) => r.id);
    const horas = [...new Set(c.rs.map((r) => r.hora))].sort();
    const saida = horas[horas.length - 1];
    const varios = c.rs.length > 1;
    const html = card({
      key: `m:${ids.join('+')}`, attr: `data-m="${i}"`, hora: saida, data: c.data, rota: rotaHtml([[siteName(c.origem), siteName(c.destino)]]),
      meta: `<span class="id">${esc(idsTxt(c.rs))}</span><em>${esc(nomes(c.rs))}</em>${sep}<span>${ico('clip', 13)} ${c.rs.length} ${varios ? 'envios' : 'envio'}</span>${sep}<span>Carga ${c.pts}/${MOTO_CARGA} pts</span>`,
      chips: (varios ? `<span class="cf-pill g"><i></i>${c.rs.length} envios em 1 viagem</span>` : '') + (c.rs.some((r) => r.excecao) ? '<span class="cf-pill r"><i></i>Fora do prazo</span>' : ''),
      det: `<ul class="cf-pess">${c.rs.map((r) => `<li><b>${esc(r.id)}</b><span>${esc(r.hora)} · ${esc(r.nome)}</span><small>${esc(r.cc)}</small><small>${esc(resumo(r))} → recebe: ${esc(r.recebedor)}</small>${r.excecao ? '<em class="cf-x">fora do prazo</em>' : ''}
          ${varios ? `<button class="cf-lnk rx" type="button" data-id="${esc(r.id)}">Recusar este</button>` : ''}</li>`).join('')}</ul>
        <div class="cf-info"><span>Carga: <b>${c.pts}/${MOTO_CARGA} pts</b></span>${varios ? `<span>Pedidos entre <b>${horas[0]}</b> e <b>${saida}</b> — a saída é o horário mais tarde, para todos os itens estarem prontos</span>` : ''}</div>`,
      acts: `<label class="cf-saida"><small>Saída</small><select class="sh" aria-label="Horário de saída">${horas.map((h) => `<option ${h === saida ? 'selected' : ''}>${h}</option>`).join('')}</select></label>
        ${selMot('moto', driverOptions('moto', c.data, saida, ids), vehicleOptions('moto', 0, c.pts, c.data, saida, ids))}
        <button class="cf-rec no-m" type="button">Recusar${varios ? ' todos' : ''}</button><button class="cf-ok ok-m" type="button">${ico('check', 15)} ${varios ? 'Agrupar e gerar OS' : 'Aprovar e gerar OS'}</button>`,
      q: `${ids.join(' ')} ${c.rs.map((r) => `${r.nome} ${r.cc} ${r.item || ''} ${r.recebedor || ''}`).join(' ')} ${siteName(c.origem)} ${siteName(c.destino)}`,
    });
    return { data: c.data, hora: saida, n: c.rs.length, html };
  });

  // ---- Táxi avulso: na cidade e intermunicipal
  const av = pend.filter((r) => r.tipo !== 'grade' && r.tipo !== 'moto').sort((a, b) => at(a.data, a.hora) - at(b.data, b.hora));
  const itensA = av.map((r) => {
    const t = r.tipo === 'moto' ? 'moto' : 'carro';
    const html = card({
      key: `a:${r.id}`, attr: `data-id="${esc(r.id)}"`, hora: r.hora, data: r.data, rota: rotaHtml([[siteName(r.origem), siteName(r.destino)]]),
      meta: `<span class="id">${esc(r.id)}</span><em>${esc(r.nome)}</em>${sep}<span>${ico('users', 13)} ${r.pax} ${r.pax === 1 ? 'passageiro' : 'passageiros'}</span>${sep}<span>${ico('mala', 13)} ${esc(bagCurto(r))}</span>`,
      chips: `<span class="cf-pill n"><i></i>${esc(TIPOS[r.tipo])}</span>${r.bv ? '<span class="cf-pill g"><i></i>Bate-volta</span>' : ''}${r.excecao ? '<span class="cf-pill r"><i></i>Fora do prazo</span>' : ''}`,
      det: `<ul class="cf-pess"><li><b>${esc(r.id)}</b><span>${esc(r.nome)}</span><small>${esc(r.cc)}</small>${r.perna ? `<span class="tag">${pernaTxt(r)} · ${esc(r.par)}</span>` : ''}</li>
          ${r.bv ? `<li><span><b>${esc(bvTxt(r))}</b> — veículo e motorista ficam reservados ~${fmtMin(durOf(r))}</span></li>` : ''}
          <li><small>Justificativa:</small><span class="cf-just">${esc(r.just)}</span></li></ul>
        ${r.excecao ? '<div class="cf-info"><span class="cf-alerta">Pedido fora do prazo mínimo — requer autorização excepcional.</span></div>' : ''}`,
      acts: `${selMot(t, driverOptions(t, r.data, r.hora, [r.id], durOf(r)), vehicleOptions(t, r.pax, 0, r.data, r.hora, [r.id], durOf(r)))}
        <button class="cf-rec no-a" type="button">Recusar</button><button class="cf-ok ok-a" type="button">${ico('check', 15)} ${r.tipo === 'moto' ? 'Aprovar e gerar OS' : 'Confirmar'}</button>`,
      q: `${r.id} ${r.nome} ${r.cc} ${siteName(r.origem)} ${siteName(r.destino)} ${TIPOS[r.tipo]}`,
    });
    return { data: r.data, hora: r.hora, n: 1, html };
  });

  const soma = (xs) => xs.reduce((s, x) => s + x.n, 0);
  const ABAS = [['grade', 'Entre sites', 'car', itensG], ['moto', 'Moto táxi', 'moto', itensM], ['avulso', 'Táxi avulso', 'route', itensA]];
  if (!P.tab) P.tab = (ABAS.find((a) => a[3].length) || ABAS[0])[0];
  const aba = ABAS.find((a) => a[0] === P.tab) || ABAS[0];
  const itens = aba[3].slice().sort((a, b) => (a.data + a.hora).localeCompare(b.data + b.hora));
  let corpo = '', dia = '';
  const porDia = {};
  itens.forEach((x) => { porDia[x.data] = (porDia[x.data] || 0) + x.n; });
  itens.forEach((x) => {
    if (x.data !== dia) {
      dia = x.data; const d = at(dia, '12:00');
      corpo += `<div class="cf-dia">${ico('cal', 14)}<b>${DIAS[d.getDay()]}${isWeekday(d) ? '-feira' : ''}, ${d.getDate()} de ${MESES[d.getMonth()]}</b>${dia === hojeS ? '<span class="cf-hj">Hoje</span>' : dia === amanhaS ? '<span class="cf-hj">Amanhã</span>' : ''}<i></i><small>${porDia[dia]} ${porDia[dia] === 1 ? 'solicitação' : 'solicitações'}</small></div>`;
    }
    corpo += x.html;
  });
  const PER = [['todas', 'Todas as datas'], ['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Esta semana']];

  shell(page, `
    <div class="pg-head">
      <div><h1>Confirmação de viagens</h1><p>Organize as solicitações. Conecte pessoas e destinos.</p></div>
      <label class="vj-sel cf-per">${ico('cal', 15)}<select id="cfper" aria-label="Período">${PER.map(([k, l]) => `<option value="${k}" ${per === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    </div>
    <div class="cf-kpis">
      <div class="cf-k"><small>Pendentes de análise</small>${ico('clock', 18)}<span class="cf-kv"><b>${pad(pendTodas.length)}</b>${pendTodas.length ? '<em class="chip">Aguardando você</em>' : '<em>tudo em dia</em>'}</span></div>
      <div class="cf-k"><small>Viagens hoje</small>${ico('route', 18)}<span class="cf-kv"><b>${pad(viagensHoje)}</b><em>viagens confirmadas</em></span></div>
      <div class="cf-k"><small>Ocupação média</small>${ico('users', 18)}<span class="cf-kv"><b>${occAvg}<small>%</small></b><span class="cf-oc" title="Ocupação média dos carros da grade confirmados"><i style="width:${Math.min(100, occAvg)}%"></i></span></span></div>
      <a class="cf-k" href="#viagens"><small>Envio por WhatsApp</small>${ico('arrow', 18)}<span class="cf-kv"><b>${pad(aEnviar)}</b><em>prontas para enviar</em></span></a>
    </div>
    <section class="cf-box">
      <div class="cf-tabbar"><nav class="cf-tabs">${ABAS.map(([k, l, ic, xs]) => `<button type="button" class="${aba[0] === k ? 'on' : ''}" data-tab="${k}">${ico(ic, 17)} ${l} <span>${soma(xs)}</span></button>`).join('')}</nav>
        <label class="vj-busca cf-busca">${ico('search', 16)}<input id="cfq" placeholder="Buscar solicitação…" value="${esc(P.q || '')}" aria-label="Buscar solicitação"></label></div>
      <div class="cf-in">
        ${itens.length ? corpo : `<div class="cf-vazio">Nenhuma solicitação ${aba[0] === 'grade' ? 'entre sites' : aba[0] === 'moto' ? 'de Moto Táxi' : 'de táxi avulso'} pendente${per !== 'todas' ? ' neste período' : ''}.</div>`}
        <div class="cf-vazio" id="cfnone" hidden>Nenhuma solicitação encontrada para a busca.</div>
      </div>
    </section>`);

  $('#cfper').onchange = (e) => { P.per = e.target.value; route(); };
  document.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { P.tab = b.dataset.tab; route(); }; });
  const filtra = () => {
    const q = ($('#cfq').value || '').trim().toLowerCase();
    P.q = q;
    let n = 0;
    document.querySelectorAll('.cf').forEach((c) => { const ok = !q || c.dataset.q.includes(q); c.hidden = !ok; if (ok) n++; });
    document.querySelectorAll('.cf-dia').forEach((h) => { let x = h.nextElementSibling, vis = false; while (x && x.classList.contains('cf')) { if (!x.hidden) vis = true; x = x.nextElementSibling; } h.hidden = !vis; });
    if (itens.length) $('#cfnone').hidden = n > 0;
  };
  $('#cfq').oninput = filtra;
  filtra();
  document.querySelectorAll('.cf').forEach((g) => {
    const b = $('.cf-ver', g);
    b.onclick = () => {
      const k = g.dataset.ck;
      if (abertos.has(k)) abertos.delete(k); else abertos.add(k);
      const on = abertos.has(k);
      g.classList.toggle('on', on); b.setAttribute('aria-expanded', String(on));
      b.firstChild.textContent = on ? 'Ocultar detalhes ' : 'Ver detalhes ';
    };
  });

  document.querySelectorAll('.cf[data-m]').forEach((g) => {
    const c = clusters[Number(g.dataset.m)];
    const ids = c.rs.map((r) => r.id);
    const refresh = () => {
      const h = $('.sh', g).value;
      $('.sv', g).innerHTML = vehicleOptions('moto', 0, c.pts, c.data, h, ids);
      $('.sd', g).innerHTML = driverOptions('moto', c.data, h, ids);
      ligarMotoristaVeiculo(g);
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

  document.querySelectorAll('.cf[data-k]').forEach((g) => {
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
  document.querySelectorAll('.cf[data-id]').forEach((g) => {
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
  ligarMotoristaVeiculo();
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
    r.tipo === 'moto' ? '' : r.pax, r.tipo === 'moto' ? '' : bagTxt(r), r.item || '', r.vol || '', r.tam ? ITEM_TAM[r.tam].l : '', r.recebedor || '',
    r.just, r.veiculo ? veic(r.veiculo).nome : '', r.motorista ? mot(r.motorista).nome : '', r.os || '', STATUS[r.status], r.excecao ? 'sim' : 'não'].map(q).join(';'));
  const blob = new Blob(['﻿' + [head.join(';'), ...lines].join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `solicitacoes_${ymd(new Date())}.csv`; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  audit('Exportação CSV', `${rows.length} registros`, '', 'filtros aplicados na tela');
  save();
  toast(`${rows.length} registro(s) exportado(s).`);
}

// Trilha de auditoria do servidor (21 CFR Part 11): só leitura, gerada pelo servidor, exportável e com verificação de integridade
async function renderHistoricoSrv(page, mais) {
  const H = renderHistoricoSrv;
  const filtros = () => new URLSearchParams({ q: H.q || '', de: H.de || '', ate: H.ate || '' });
  if (!mais) {
    shell(page, `<div class="pg-head"><div><nav class="crumb"><span>Administração</span>${ico('right', 12)}<b>Histórico</b></nav><h1>Trilha de auditoria</h1>
        <p>Registro gerado pelo servidor, que não pode ser alterado nem apagado: quem fez, quando (horário do servidor), o registro, o campo, o valor anterior e o novo.</p></div></div>
      <div class="toolbar vtools aud-tools">
        <div class="aud-datas"><label>De <input type="date" class="input" id="aude" value="${esc(H.de || '')}"></label><label>Até <input type="date" class="input" id="auate" value="${esc(H.ate || '')}"></label></div>
        <label class="search">${ico('search', 16)}<input id="auq" placeholder="Buscar usuário, ação, registro ou valor…" value="${esc(H.q || '')}" aria-label="Buscar na trilha"></label>
        <span class="aud-acts"><button class="btn" id="auver">${ico('check', 16)} Verificar integridade</button><button class="btn" id="auxlsx">Exportar Excel</button><button class="btn green" id="aupdf">Exportar PDF</button></span>
      </div>
      <div id="auinfo"></div>
      <div id="aulista">${skTabela(8)}</div>`);
    const recarregar = () => { H.linhas = null; renderHistoricoSrv(page); };
    $('#aude').onchange = (e) => { H.de = e.target.value; recarregar(); };
    $('#auate').onchange = (e) => { H.ate = e.target.value; recarregar(); };
    $('#auq').oninput = (e) => { H.q = e.target.value; clearTimeout(H.t); H.t = setTimeout(() => { const i = $('#auq'), p = i && i.selectionStart; recarregar(); const n = $('#auq'); if (n) { n.focus(); n.setSelectionRange(p, p); } }, 400); };
    $('#auxlsx').onclick = () => { location.href = `/api/auditoria.xlsx?${filtros()}`; };
    $('#aupdf').onclick = () => { location.href = `/api/auditoria.pdf?${filtros()}`; };
    $('#auver').onclick = async () => {
      const b = $('#auver'); b.disabled = true; $('#auinfo').innerHTML = '<div class="msg-box">Conferindo a corrente de hash de todos os registros…</div>';
      try {
        const j = await (await fetch('/api/auditoria/verificar', { cache: 'no-store' })).json();
        $('#auinfo').innerHTML = j.integra ? `<div class="msg-box good"><b>Trilha íntegra.</b> ${j.total} registros conferidos, nenhuma alteração encontrada.</div>`
          : j.erro ? `<div class="msg-box bad">${esc(j.erro)}</div>` : `<div class="msg-box bad"><b>Trilha adulterada</b> a partir do registro nº ${esc(j.quebra)}. Avise a Garantia da Qualidade.</div>`;
      } catch (e) { $('#auinfo').innerHTML = '<div class="msg-box bad">Não foi possível verificar agora.</div>'; }
      b.disabled = false;
    };
    H.linhas = [];
  }
  let j;
  try {
    const p = filtros(); if (mais && H.linhas.length) p.set('antes_de', H.linhas[H.linhas.length - 1].id);
    const r = await fetch(`/api/auditoria?${p}`, { cache: 'no-store' }); j = await r.json(); if (!r.ok) throw new Error(j.erro);
  } catch (e) { const l = $('#aulista'); if (l) l.innerHTML = `<div class="card empty">${esc(e.message || 'Não foi possível carregar.')}</div>`; return; }
  if (route.page !== 'historico' || !$('#aulista')) return;
  H.linhas = (H.linhas || []).concat(j.linhas);
  const cel = (v) => { const t = String(v ?? ''); return t.length > 140 ? `<span title="${esc(t)}">${esc(t.slice(0, 140))}…</span>` : esc(t); };
  $('#aulista').innerHTML = `<div class="card"><div class="table-wrap"><table class="tbl-ap aud-t"><thead><tr><th>Nº</th><th>Data/hora</th><th>Usuário</th><th>Ação</th><th>Registro</th><th>Campo</th><th>Valor anterior</th><th>Valor novo</th><th>Motivo</th></tr></thead><tbody>
      ${H.linhas.map((l) => `<tr><td><small>${l.id}</small></td><td title="UTC ${esc(l.utc)}">${esc(l.quando)}<br><small>UTC${esc(l.fuso.slice(0, 3))}:${esc(l.fuso.slice(3))}</small></td>
        <td><b>${esc(l.nome || l.usuario)}</b>${l.nome ? `<br><small>${esc(l.usuario)}</small>` : ''}</td><td><b>${esc(l.acao)}</b></td><td>${esc(l.ref)}</td><td>${esc(l.campo)}</td>
        <td class="aud-v">${cel(l.antes)}</td><td class="aud-v">${cel(l.depois)}</td><td class="aud-v">${cel(l.motivo)}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">Nenhum registro neste filtro.</td></tr>'}
    </tbody></table></div>
    <p class="section-s" style="margin-top:10px">Mostrando ${H.linhas.length} de ${j.total} registros. ${j.mais ? '<button class="btn sm" id="aumais">Carregar mais</button>' : ''}</p></div>`;
  if ($('#aumais')) $('#aumais').onclick = () => renderHistoricoSrv(page, true);
}
function renderHistorico(page) {
  if (window.MOBILAB_API) return renderHistoricoSrv(page);
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
// custos=true: entram também os cancelamentos tardios (menos de ${CANCEL_MIN} min antes), que continuam cobrados
function viagens(custos) {
  const map = {};
  S.reqs.filter((r) => (['confirmada', 'andamento', 'concluida', 'naorealizada'].includes(r.status) || (custos && cobrada(r))) && r.veiculo && r.motorista)
    .forEach((r) => { (map[[r.data, r.hora, r.veiculo, r.motorista].join('|')] ||= []).push(r); });
  return Object.entries(map).map(([k, todos]) => {
    const rs = todos.filter((r) => !cobrada(r)).length ? todos.filter((r) => !cobrada(r)) : todos; // situação da viagem vem de quem não cancelou
    const tudoCobrado = rs.every(cobrada);
    const st = tudoCobrado ? (at(rs[0].data, rs[0].hora) <= new Date() ? 'concluida' : 'enviada') : rs.every((r) => r.status === 'concluida') ? 'concluida' : rs.every((r) => r.status === 'naorealizada') ? 'naorealizada'
      : rs.every((r) => r.wpp) ? 'enviada' : 'enviar';
    return { k, rs: todos, data: todos[0].data, hora: todos[0].hora, veiculo: todos[0].veiculo, motorista: todos[0].motorista, tipo: todos[0].tipo, st };
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
  const bags = v.rs.map(bagTxt).filter((t) => t !== 'N/A');
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
    <div class="modal-acts">${e.refs[0] && S.reqs.some((r) => r.id === e.refs[0] && meuPedido(r)) ? `<button class="btn" id="vsol">Ver solicitação ${esc(e.refs[0])}</button>` : ''}<button class="btn green" id="cx">Fechar</button></div>`);
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
  const per = renderViagens.per || 'todas', tp = renderViagens.tp || 'todos';
  const abertos = renderViagens.abertos || (renderViagens.abertos = new Set());
  const all = viagens();
  const cont = (s) => all.filter((v) => v.st === s).length;
  const nAbertas = cont('enviar') + cont('enviada');
  const TABS = [['abertas', 'Abertas', nAbertas], ['enviar', 'A enviar', cont('enviar')], ['enviada', 'Enviadas', cont('enviada')],
    ['concluida', 'Concluídas', cont('concluida')], ['naorealizada', 'Não realizadas', cont('naorealizada')]];
  const hojeS = ymd(new Date()), amanhaS = ymd(addDays(new Date(), 1));
  const seg = ymd(mondayOf(new Date())), dom = ymd(addDays(mondayOf(new Date()), 6));
  const mesS = hojeS.slice(0, 7), d60 = ymd(addDays(new Date(), -60));
  const noPer = (v) => per === 'todas' || (per === 'hoje' ? v.data === hojeS : per === 'amanha' ? v.data === amanhaS : per === 'mes' ? v.data.slice(0, 7) === mesS : per === '60' ? v.data >= d60 : v.data >= seg && v.data <= dom);
  const list = all.filter((v) => (f === 'abertas' ? ['enviar', 'enviada'].includes(v.st) : v.st === f) && noPer(v) && (tp === 'todos' || v.tipo === tp));
  if (!renderViagens.iniciado && list.length) { abertos.add(list[0].k); renderViagens.iniciado = true; }
  const VST = { enviar: ['A enviar', 'vst-enviar'], enviada: ['Enviada', 'vst-enviada'], concluida: ['Concluída', 'vst-concluida'], naorealizada: ['Não realizada', 'vst-nao'] };
  const paradas = (v) => {
    if (v.tipo === 'grade') { const s = slotOf(v.hora); if (s) return s.paradas.map(siteName); }
    return [...new Set([...v.rs.map((r) => siteName(r.origem)), ...v.rs.map((r) => siteName(r.destino))])];
  };
  const pessoasTxt = (v) => (v.tipo === 'moto' ? `${v.rs.length} ${v.rs.length === 1 ? 'envio' : 'envios'}`
    : (() => { const n = v.rs.reduce((t, r) => t + (Number(r.pax) || 1), 0); return `${n} ${n === 1 ? 'passageiro' : 'passageiros'}`; })());
  const quando = (s) => { const m = String(s || '').match(/^(\d{2})\/(\d{2})\/\d{4},?\s*(\d{2}:\d{2})/); return m ? `${m[1]}/${m[2]} às ${m[3]}` : s; };

  const card = (v, i) => {
    const m = mot(v.motorista) || {}, ve = veic(v.veiculo) || {}, [lbl, cls] = VST[v.st];
    const aberta = ['enviar', 'enviada'].includes(v.st), on = abertos.has(v.k);
    const busca = [v.rs.map((r) => `${r.id} ${r.nome} ${r.os || ''} ${siteName(r.origem)} ${siteName(r.destino)}`).join(' '), m.nome, ve.nome, ve.placa, TIPOS[v.tipo]].join(' ').toLowerCase();
    const mails = [...new Set(v.rs.filter((r) => r.mail).map((r) => r.nome))];
    const rt = ratear(v);
    const semValor = rt.total == null && !rt.ninguem;
    const ajustar = renderViagens.ajuste === v.k || (aberta && rt.informado && rt.base == null);
    const pp = paradas(v);
    const pessoa = (r) => `<li class="${r.faltou ? 'faltou' : ''}"><b>${esc(r.id)}</b><span>${esc(r.nome)}</span>
        <small>${r.tipo === 'moto' ? `${r.os ? `${esc(r.os)} · ` : ''}${esc(`${r.vol}× ${r.item}`)} → ${esc(r.recebedor)}`
          : `${esc(siteName(r.origem))} → ${esc(siteName(r.destino))} · ${r.pax} pax${bagTxt(r) !== 'N/A' ? ` · ${esc(bagCurto(r))}` : ''}${r.perna ? ` · ${pernaTxt(r)}` : r.bv ? ' · bate-volta' : ''}`}</small>
        ${r.faltou ? '<em>Não compareceu — fora da divisão</em>' : ''}
        ${r.tipo !== 'moto' && v.st !== 'naorealizada' ? `<button class="vj-lnk falta" data-id="${esc(r.id)}">${r.faltou ? 'Desfazer: compareceu' : 'Não compareceu'}</button>` : ''}</li>`;
    return `<article class="vj ${cls}${on ? ' on' : ''}" data-i="${i}" data-q="${esc(busca)}">
      <header class="vj-h" data-k="${esc(v.k)}" role="button" tabindex="0" aria-expanded="${on}">
        <span class="vj-hora">${ico('clock', 13)}<b>${esc(v.hora)}</b></span>
        <span class="vj-tt"><b>${esc(TIPOS[v.tipo].replace(' (envio de itens)', ''))}</b>
          <small>${esc(v.rs.map((r) => r.id).join(', '))} · <i>${esc(v.rs.map((r) => r.nome.split(' ')[0]).join(', '))}</i> · ${esc(pessoasTxt(v))}</small></span>
        ${semValor ? '<span class="vj-pill warn"><i></i>Sem valor</span>' : ''}
        <span class="vj-pill ${cls}"><i></i>${lbl}</span>
        <span class="vj-chev">${ico('down', 16)}</span>
      </header>
      <div class="vj-b">
        <div class="vj-g">
          <div><small class="vj-lab">Trajeto</small>
            <ol class="vj-rota">${pp.map((p, k) => `<li class="${k === pp.length - 1 ? 'fim' : ''}">${esc(p)}</li>`).join('')}</ol></div>
          <div><small class="vj-lab">${v.tipo === 'moto' ? 'Motociclista e moto' : 'Motorista e veículo'}</small>
            <div class="vj-mot">${avatar(m.nome || '?', '', 'vj-av')}<span><b>${esc(m.nome || '—')}</b><small>${esc(ve.nome || '—')} · ${esc(ve.placa || '')}</small></span></div></div>
          <div class="vj-val"><small class="vj-lab">Valor total</small>
            ${rt.ninguem ? '<b class="vj-tot">R$ 0,00</b><small class="warn-t">Ninguém compareceu — sem cobrança</small>'
              : rt.total != null ? `<b class="vj-tot">${brl(rt.total)}</b><div class="vj-chips">${Object.entries(rt.partes).map(([cc, x]) => `<span>${esc(setorCurto(cc))}${Object.keys(rt.partes).length > 1 ? ` ${brl(x)}` : ''}</span>`).join('')}</div>`
              : `<b class="vj-tot sem">Sem valor</b><small class="warn-t">${rt.informado ? 'Informe o valor da corrida' : 'Rota da grade sem valor — cadastre em Grade e rotas'}</small>`}</div>
        </div>
        <ul class="vj-pess">${v.rs.map(pessoa).join('')}</ul>
        <div class="vj-info">
          <span class="vj-i">${ico('user', 16)}<span><small>Contato do ${v.tipo === 'moto' ? 'motociclista' : 'motorista'}</small><b>${esc(fmtFone(m.fone))}</b></span></span>
          <span class="vj-i">${ico('money', 16)}<span><small>Composição do valor</small><b>${rt.informado ? 'Corrida' : 'Rota'} ${brl(rt.base)} <i>·</i> Acréscimo ${brl(rt.acrescimo || 0)}${rt.motivoAcr ? ` <em>(${esc(rt.motivoAcr)})</em>` : ''}</b></span></span>
          ${v.st !== 'naorealizada' ? `<button class="vj-lnk vj-aj" data-k="${esc(v.k)}">${ico('gear', 14)} ${ajustar ? 'Fechar ajuste' : 'Ajustar valores'}</button>` : ''}
        </div>
        ${ajustar && v.st !== 'naorealizada' ? `<div class="vj-ajuste">
          ${rt.informado ? `<label><small>Valor da corrida</small><span class="money sm">R$ <input class="vcor" type="number" min="0" step="0.01" inputmode="decimal" value="${rt.base ?? ''}" placeholder="0,00" aria-label="Valor da corrida"></span>
            <em>${rt.base == null ? 'informe o valor cobrado nesta corrida' : rt.corrida != null ? 'informado pelo Facilities' : 'valor anterior da tabela — confirme ou corrija'}</em></label>`
          : `<label><small>Valor da rota</small><b>${rt.padrao != null ? brl(rt.padrao) : 'sem valor'}</b><em>fixo — alterado em <a href="#grade">Grade e rotas</a></em></label>`}
          <label><small>Acréscimo <span class="opt">(espera, pedágio…)</span></small><span class="money sm">R$ <input class="vacr" type="number" min="0" step="0.01" inputmode="decimal" value="${rt.acrescimo || ''}" placeholder="0,00" aria-label="Acréscimo"></span></label>
          <label class="vj-mo"><small>Motivo do acréscimo</small><input class="vmot" placeholder="Ex.: espera de 30 min" value="${esc(rt.motivoAcr)}" aria-label="Motivo do acréscimo">
            ${rt.acrescimo && !rt.motivoAcr ? '<em class="warn-t">Informe o motivo do acréscimo</em>' : ''}</label>
        </div>` : ''}
      </div>
      <footer class="vj-f">
        <span class="vj-st">${v.rs[0].wpp ? `<span class="ok">${ico('check', 14)} Enviada por WhatsApp · ${esc(quando(v.rs[0].wpp))}</span>` : `<span class="warn">${ico('clock', 14)} Ainda não enviada ao motorista</span>`}
          ${mails.length ? `<span class="ok">${ico('mail', 14)} E-mail para ${esc(mails.join(', '))}</span>` : ''}
          ${v.rs.some((r) => r.motivo && v.st === 'naorealizada') ? `<span class="bad">${esc(v.rs[0].motivo)}</span>` : ''}</span>
        ${aberta ? `<span class="vj-acts">
          <button class="vj-lnk nr">Não realizada</button>
          <button class="vj-out wpp">${ico('send', 15)} ${v.st === 'enviada' ? 'Reenviar' : 'Enviar ao motorista'}</button>
          <button class="vj-ok fim">${ico('check', 15)} Concluir viagem</button></span>` : ''}
      </footer>
    </article>`;
  };
  // agrupado por dia
  let corpo = '', dia = '';
  const porDia = {};
  list.forEach((v) => { porDia[v.data] = (porDia[v.data] || 0) + 1; });
  list.forEach((v, i) => {
    if (v.data !== dia) {
      dia = v.data; const d = at(dia, '12:00');
      corpo += `<div class="vj-dia" data-dia="${dia}"><b>${DIAS[d.getDay()]}${isWeekday(d) ? '-feira' : ''}, ${d.getDate()} de ${MESES[d.getMonth()]}</b>${dia === hojeS ? '<span class="vj-hoje">Hoje</span>' : dia === amanhaS ? '<span class="vj-hoje">Amanhã</span>' : ''}<i></i><small>${porDia[dia]} ${porDia[dia] === 1 ? 'viagem' : 'viagens'}</small></div>`;
    }
    corpo += card(v, i);
  });
  const agora = new Date();
  const kpi = (k, ic, cls, tit, n, sub) => `<button class="vj-k" data-f="${k}"><span class="vj-ki ${cls}">${ico(ic, 20)}</span><span><small>${tit}</small><b>${pad(n)}</b><em class="${cls}">${sub}</em></span><span class="vj-ka">${ico('arrow', 16)}</span></button>`;

  shell(page, `
    <div class="pg-head">
      <div><h1>Viagens</h1><p>Organize os deslocamentos. Acompanhe cada chegada.</p></div>
      <div class="vj-data">${ico('cal', 15)}<span>${DIAS[agora.getDay()]}${isWeekday(agora) ? '-feira' : ''}, ${agora.getDate()} de ${MESES[agora.getMonth()]}</span><i></i><span>${agora.getFullYear()}</span></div>
    </div>
    <div class="vj-kpis">
      ${kpi('abertas', 'route', 'g', 'Viagens em aberto', nAbertas, 'deslocamentos programados')}
      ${kpi('enviar', 'send', 'a', 'Aguardando envio', cont('enviar'), cont('enviar') ? '• Requer sua atenção' : 'nada pendente')}
      ${kpi('enviada', 'check', 'b', 'Enviadas aos motoristas', cont('enviada'), 'tudo pronto para a partida')}
    </div>
    <section class="vj-ger">
      <div class="vj-gh"><div><h2>Gerenciar viagens</h2></div><small class="vj-atu"><i></i>Atualizado às ${pad(agora.getHours())}:${pad(agora.getMinutes())}</small></div>
      <div class="vj-tabbar"><nav class="vj-tabs">${TABS.map(([k, l, n]) => `<button class="${f === k ? 'on' : ''}" data-f="${k}">${l} <span>${n}</span></button>`).join('')}</nav>
        <label class="vj-busca">${ico('search', 16)}<input id="vq" placeholder="Buscar por viagem, pessoa, motorista ou placa…" value="${esc(renderViagens.q || '')}" aria-label="Buscar viagem"></label></div>
      <div class="vj-tools">
        <span class="vj-sp"></span>
        <label class="vj-sel">${ico('cal', 15)}<select id="vper" aria-label="Período">${[['todas', 'Todas as datas'], ['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Esta semana'], ['mes', 'Este mês'], ['60', 'Últimos 60 dias']].map(([k, l]) => `<option value="${k}" ${per === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="vj-sel">${ico('filter', 15)}<select id="vtp" aria-label="Tipo de viagem">${[['todos', 'Todos os tipos'], ['grade', 'Entre sites'], ['cidade', 'Táxi na cidade'], ['inter', 'Intermunicipal'], ['moto', 'Moto Táxi']].map(([k, l]) => `<option value="${k}" ${tp === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
      </div>
      <div class="vj-list">${list.length ? corpo : '<div class="vj-vazio">Nenhuma viagem neste filtro. Confirme solicitações em <a href="#painel">Confirmação de viagens</a>.</div>'}
        <div class="vj-vazio" id="vnone" hidden>Nenhuma viagem encontrada para a busca.</div></div>
    </section>`);

  document.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { renderViagens.f = b.dataset.f; route(); }; });
  $('#vper').onchange = (e) => { renderViagens.per = e.target.value; route(); };
  $('#vtp').onchange = (e) => { renderViagens.tp = e.target.value; route(); };
  const filtra = () => {
    const q = ($('#vq').value || '').trim().toLowerCase();
    renderViagens.q = q;
    let n = 0;
    document.querySelectorAll('.vj').forEach((c) => { const ok = !q || c.dataset.q.includes(q); c.hidden = !ok; if (ok) n++; });
    document.querySelectorAll('.vj-dia').forEach((h) => { let x = h.nextElementSibling, vis = false; while (x && x.classList.contains('vj')) { if (!x.hidden) vis = true; x = x.nextElementSibling; } h.hidden = !vis; });
    if (list.length) $('#vnone').hidden = n > 0;
  };
  $('#vq').oninput = filtra;
  filtra();
  document.querySelectorAll('.vj-h').forEach((h) => {
    const alterna = () => { const k = h.dataset.k; if (abertos.has(k)) abertos.delete(k); else abertos.add(k); h.closest('.vj').classList.toggle('on'); h.setAttribute('aria-expanded', String(abertos.has(k))); };
    h.onclick = alterna;
    h.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); alterna(); } };
  });
  document.querySelectorAll('.vj-aj').forEach((b) => { b.onclick = () => { renderViagens.ajuste = renderViagens.ajuste === b.dataset.k ? null : b.dataset.k; abertos.add(b.dataset.k); route(); }; });
  document.querySelectorAll('.vj').forEach((g) => {
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
      const antes = S.extras[v.k] && S.extras[v.k].valor != null ? `${brl(S.extras[v.k].valor)} ${S.extras[v.k].motivo || ''}` : 'sem acréscimo';
      const motivo = vmo.value.trim();
      const resto = { ...(S.extras[v.k] || {}) }; delete resto.valor; delete resto.motivo;
      if (n === 0 && !motivo) { if (Object.keys(resto).length) S.extras[v.k] = resto; else delete S.extras[v.k]; } else S.extras[v.k] = { ...resto, valor: Math.round(n * 100) / 100, motivo };
      audit('Acréscimo na viagem', v.rs.map((r) => r.id).join(', '), antes, n ? `${brl(n)} ${motivo}` : 'sem acréscimo');
      save(); route(); toast(n ? `Acréscimo de ${brl(n)} lançado.` : 'Acréscimo removido.');
    };
    if (va) va.onchange = salvaAcr;
    if (vmo) vmo.onchange = salvaAcr;
    const vc = $('.vcor', g);
    if (vc) vc.onchange = () => {
      const raw = String(vc.value).trim().replace(',', '.');
      const n = raw === '' ? null : Number(raw);
      if (n != null && (!Number.isFinite(n) || n < 0)) { toast('Valor da corrida inválido.'); return; }
      S.extras = S.extras || {};
      const ex = S.extras[v.k] || {}, antes = ex.corrida != null ? brl(ex.corrida) : 'sem valor informado';
      if (n == null) { delete ex.corrida; if (Object.keys(ex).length) S.extras[v.k] = ex; else delete S.extras[v.k]; }
      else S.extras[v.k] = { ...ex, corrida: Math.round(n * 100) / 100 };
      audit('Valor da corrida informado', v.rs.map((r) => r.id).join(', '), antes, n == null ? 'sem valor' : brl(n));
      save(); route(); toast(n == null ? 'Valor da corrida removido.' : `Valor da corrida: ${brl(n)}.`);
    };
    if (fim) fim.onclick = () => {
      if (ratear(v).total == null) { toast('Informe o valor da corrida antes de concluir a viagem.'); renderViagens.ajuste = v.k; abertos.add(v.k); route(); const c = $('.vcor'); if (c) c.focus(); return; }
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
    <div class="card table-wrap"><table><thead><tr><th>Nome</th><th>Tipo</th><th>Veículo</th><th>WhatsApp</th><th>Situação</th><th>Próximas viagens</th><th></th></tr></thead><tbody>
      ${list.map((m) => `<tr><td><b>${esc(m.nome)}</b></td><td>${m.tipo === 'moto' ? 'Motociclista' : 'Motorista (carro)'}</td><td>${veicDoMot(m) ? `<b>${esc(veicTxt(veicDoMot(m)))}</b><small>${esc(veicDoMot(m).placa)}</small>` : '<small>Sem veículo fixo</small>'}</td><td>${esc(fmtFone(m.fone))}</td>
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
  const m = id ? mot(id) : { nome: '', tipo: 'carro', fone: '', veiculo: '', ativo: true };
  const opV = (tipo, sel) => `<option value="">— Sem veículo fixo —</option>${VEICULOS.filter((v) => v.tipo === tipo).map((v) => `<option value="${v.id}" ${v.id === sel ? 'selected' : ''}>${esc(veicTxt(v))} · ${esc(v.placa)}</option>`).join('')}`;
  openModal(`
    <h3>${id ? 'Editar motorista' : 'Novo motorista'}</h3>
    <p class="sub">Dados usados para atribuir viagens e enviar pelo WhatsApp.</p>
    <div class="form-grid">
      <div class="f full"><label for="mn">Nome</label><input id="mn" value="${esc(m.nome)}"></div>
      <div class="f"><label for="mt">Tipo</label><select id="mt"><option value="carro" ${m.tipo === 'carro' ? 'selected' : ''}>Motorista (carro)</option><option value="moto" ${m.tipo === 'moto' ? 'selected' : ''}>Motociclista</option></select></div>
      <div class="f"><label for="mf">WhatsApp (com DDD)</label><input id="mf" inputmode="tel" placeholder="(75) 99999-0000" value="${esc(m.fone ? fmtFone(m.fone) : '')}"></div>
      <div class="f full"><label for="mv">Veículo que usa</label><select id="mv">${opV(m.tipo, m.veiculo)}</select><small>Ao escolher este motorista na confirmação de viagens, o veículo já vem selecionado.</small></div>
    </div>
    <div id="mmsg"></div>
    <div class="modal-acts"><button class="btn" id="cx">Cancelar</button><button class="btn green" id="ok">Salvar</button></div>`);
  $('#cx').onclick = closeModal;
  $('#mt').onchange = () => { $('#mv').innerHTML = opV($('#mt').value, ''); };
  $('#ok').onclick = () => {
    const nome = $('#mn').value.trim(), tipo = $('#mt').value, veiculo = $('#mv').value;
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
      const vNome = (x) => (veic(x) ? ` · ${veic(x).nome} ${veic(x).placa}` : '');
      const antes = `${m.nome} · ${m.tipo} · ${fmtFone(m.fone)}${vNome(m.veiculo)}`;
      Object.assign(m, { nome, tipo, fone, veiculo });
      audit('Motorista alterado', m.id, antes, `${nome} · ${tipo} · ${fmtFone(fone)}${vNome(veiculo)}`);
    } else {
      S.seq.mot += 1;
      const novo = { id: `D${S.seq.mot}`, nome, tipo, fone, veiculo, ativo: true };
      S.motoristas.push(novo);
      audit('Motorista cadastrado', novo.id, '', `${nome} · ${tipo} · ${fmtFone(fone)}${veic(veiculo) ? ` · ${veic(veiculo).nome} ${veic(veiculo).placa}` : ''}`);
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
  const ex = (S.extras || {})[v.k] || {};
  // Grade: valor FIXO da tabela de Grade e rotas. Avulsa (táxi, intermunicipal, moto): o Facilities informa o valor da corrida
  // na própria viagem (pode sair mais cara ou mais barata). Viagens antigas sem valor informado continuam com o da tabela.
  const informado = v.tipo !== 'grade';
  const corrida = informado && ex.corrida != null && ex.corrida !== '' ? Number(ex.corrida) : null;
  const base = informado ? (corrida != null ? corrida : padrao) : padrao;
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
  return { total, padrao, base, acrescimo, motivoAcr: ex.motivo || '', manual, partes, legs, modal, informado, corrida };
}
const rateioChips = (rt) => Object.entries(rt.partes).map(([cc, val]) => `<span class="chip-r"><b>${esc(setorCurto(cc))}</b> ${brl(val)}</span>`).join('');

// Custos por setor: tudo calculado das viagens do mês (mesma regra de rateio de sempre).
const CX_CAT = (tipo) => (tipo === 'moto' ? 'moto' : tipo === 'inter' ? 'inter' : 'carro'); // grade e táxi na cidade = carro
const CX_CORES = ['#73bc25', '#343936', '#4a8314', '#8ccb4b', '#5f6664', '#a1d57c', '#3f6714', '#8a9294', '#ccd3d5'];
const CX_CLARAS = ['#8ccb4b', '#a1d57c', '#ccd3d5'];
const siglaSetor = (cc) => {
  const p = setorCurto(cc).split(/\s+/).filter((w) => w.length > 2 || /^[A-Z]{2,}$/.test(w));
  return (p.length > 1 ? p[0][0] + p[1][0] : (p[0] || '?').slice(0, 2)).toUpperCase();
};
function dadosCustos(mes, prev) {
  const vs = viagens(true).filter((v) => v.data.slice(0, 7) === mes && (v.st === 'concluida' || (prev && ['enviar', 'enviada'].includes(v.st))) && v.rs.some((r) => !r.faltou)); // ninguém foi = sem cobrança
  const porSetor = {};
  const semValor = [];
  const cat = { carro: { n: 0, valor: 0 }, moto: { n: 0, valor: 0 }, inter: { n: 0, valor: 0 } };
  const rotas = {};
  let total = 0, nGrade = 0;
  const canc = { n: 0, valor: 0 };
  vs.forEach((v) => {
    const rt = ratear(v);
    const c = CX_CAT(v.tipo);
    if (rt.total == null) { semValor.push(v); return; }
    total += rt.total; cat[c].n += 1; cat[c].valor += rt.total;
    if (v.tipo === 'grade') nGrade += 1;
    rt.legs.forEach((l) => { const k = `${siteName(l.de)} → ${siteName(l.para)}`; rotas[k] = (rotas[k] || 0) + 1; });
    const nCob = v.rs.filter(cobrada).length;
    if (nCob) { canc.n += nCob; if (v.rs.every(cobrada)) canc.valor += rt.total; } // corrida inteira cancelada em cima da hora
    Object.entries(rt.partes).forEach(([cc, val]) => {
      const sx = porSetor[cc] || (porSetor[cc] = { valor: 0, itens: [], cat: { carro: { n: 0, valor: 0 }, moto: { n: 0, valor: 0 }, inter: { n: 0, valor: 0 } }, semValor: 0 });
      sx.valor += val; sx.itens.push({ v, val, rt }); sx.cat[c].n += 1; sx.cat[c].valor += val;
    });
  });
  semValor.forEach((v) => new Set(v.rs.map((r) => r.cc)).forEach((cc) => { if (porSetor[cc]) porSetor[cc].semValor += 1; }));
  const setores = Object.entries(porSetor).sort((a, b) => b[1].valor - a[1].valor);
  const n = vs.length - semValor.length;
  const rotaTop = Object.entries(rotas).sort((a, b) => b[1] - a[1])[0];
  return { mes, vs, setores, semValor, total, n, media: n ? total / n : null, cat, nGrade, canc, rotaTop };
}
const mesDesloc = (mes, d) => { const [a, m] = mes.split('-').map(Number); const x = new Date(a, m - 1 + d, 1); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`; };
const nomeMes = (mes) => { const [a, m] = mes.split('-'); return `${MESES[Number(m) - 1]} ${a}`; };
const pctBr = (x, c = 0) => `${(x * 100).toFixed(c).replace('.', ',')}%`;
function medidorSvg(pct) {
  const n = 40, cx = 105, cy = 92, r1 = 62, r2 = 80;
  let h = '';
  for (let i = 0; i < n; i++) {
    const a = ((-225 + (270 * i) / (n - 1)) * Math.PI) / 180;
    const on = pct != null && i / (n - 1) <= pct / 100;
    h += `<line x1="${(cx + r1 * Math.cos(a)).toFixed(1)}" y1="${(cy + r1 * Math.sin(a)).toFixed(1)}" x2="${(cx + r2 * Math.cos(a)).toFixed(1)}" y2="${(cy + r2 * Math.sin(a)).toFixed(1)}" stroke="${on ? '#73bc25' : '#e3e7e8'}" stroke-opacity="${on ? (0.35 + (0.65 * i) / (n - 1)).toFixed(2) : 1}" stroke-width="5" stroke-linecap="round"/>`;
  }
  return `<svg class="cx-g" viewBox="0 0 210 150" role="img" aria-label="${pct == null ? 'Sem viagens no mês' : `${pct}% das viagens com valor cadastrado`}">${h}
    <text x="105" y="98" text-anchor="middle" font-size="40" font-weight="800" fill="#343936" font-family="Nunito Sans, sans-serif">${pct == null ? '—' : `${pct}%`}</text>
    <text x="105" y="120" text-anchor="middle" font-size="12" fill="#5f6664" font-family="Nunito Sans, sans-serif">das viagens</text></svg>`;
}
const CX_ART = `<svg class="cx-art" viewBox="0 0 200 150" aria-hidden="true">
  <path d="M14 120 C 60 40, 110 140, 186 40" fill="none" stroke="#ccd3d5" stroke-width="4" stroke-dasharray="2 9" stroke-linecap="round"/>
  <circle cx="14" cy="120" r="10" fill="#73bc25"/><circle cx="14" cy="120" r="4" fill="#fff"/>
  <circle cx="186" cy="40" r="10" fill="#343936"/><circle cx="186" cy="40" r="4" fill="#fff"/>
  <g transform="translate(70 62) rotate(-14)"><rect x="0" y="16" width="70" height="20" rx="6" fill="#73bc25"/><path d="M12 16 L22 2 H50 L60 16 Z" fill="#8ccb4b"/><path d="M25 5 H36 V15 H19 Z M39 5 H48 L55 15 H39 Z" fill="#e3e7e8"/><circle cx="16" cy="38" r="8" fill="#343936"/><circle cx="16" cy="38" r="3" fill="#fff"/><circle cx="54" cy="38" r="8" fill="#343936"/><circle cx="54" cy="38" r="3" fill="#fff"/></g></svg>`;

function renderCustos(page) {
  const mes = renderCustos.mes || ymd(new Date()).slice(0, 7);
  const prev = !!renderCustos.prev;
  const filtro = renderCustos.filtro || 'todos';
  const d = dadosCustos(mes, prev);
  const ant = dadosCustos(mesDesloc(mes, -1), false);
  renderCustos.dados = { setores: d.setores, mes };
  const cor = {};
  d.setores.forEach(([cc], i) => { cor[cc] = CX_CORES[i % CX_CORES.length]; });
  const chip = (cc) => `<span class="cx-sg" style="background:${cor[cc]};color:${CX_CLARAS.includes(cor[cc]) ? '#343936' : '#fff'}" title="${esc(setorCurto(cc))}">${esc(siglaSetor(cc))}</span>`;
  const mesAnt = MESES[Number(mesDesloc(mes, -1).slice(5)) - 1];
  // comparação com o mês anterior (só concluídas, para não comparar previsão)
  const varTot = ant.total ? (d.total - ant.total) / ant.total : null;
  const difN = d.n - ant.n;
  const difMed = d.media != null && ant.media != null ? d.media - ant.media : null;
  const nTodas = d.n + d.semValor.length;
  const pctVal = nTodas ? Math.floor((d.n / nTodas) * 100) : null;
  const nota = pctVal == null ? 'Sem viagens' : pctVal >= 95 ? 'Ótimo!' : pctVal >= 80 ? 'Bom' : 'Atenção';
  const top = d.setores[0];
  const fech = (() => { const [a, m] = mesDesloc(mes, 1).split('-'); return `01/${m}/${a}`; })();
  const agora = new Date();
  // valor (ou nº de viagens, com n=1) do setor no filtro escolhido
  const k = (sx, n = 0) => (filtro === 'todos' ? (n ? sx.itens.length : sx.valor) : sx.cat[filtro][n ? 'n' : 'valor']);
  const totFiltro = filtro === 'todos' ? d.total : d.cat[filtro].valor;
  shell(page, `
    <div class="pg-head"><div><nav class="crumb"><span>Gestão</span>${ico('right', 12)}<b>Custos</b></nav><h1>Custos por setor</h1>
      <p>Valor de cada corrida, divisão entre os setores e o que cada setor deve no mês.</p></div>
      <div class="cx-acts"><button class="btn" id="ccsv">${ico('download', 16)} Exportar CSV</button></div></div>
    <div class="cx-bar">
      <div class="cx-mes"><button id="cant" aria-label="Mês anterior">${ico('left', 16)}</button><label><b>${esc(nomeMes(mes))}</b><input type="month" id="cmes" value="${esc(mes)}" aria-label="Escolher mês"></label><button id="cprox" aria-label="Próximo mês">${ico('right', 16)}</button></div>
      <label class="check"><input type="checkbox" id="cprev" ${prev ? 'checked' : ''}> <span>Incluir viagens ainda não concluídas (previsão)</span></label>
      <span class="spacer"></span>
      <label class="cx-busca">${ico('search', 16)}<input id="cq" placeholder="Buscar setor ou centro de custo…" aria-label="Buscar setor" value="${esc(renderCustos.q || '')}"></label>
    </div>
    ${d.semValor.length ? `<div class="banner warn">${ico('info', 18)}<div><b>${d.semValor.length} viagem(ns) sem valor</b> — avulsas: informe o valor em <a href="#viagens">Viagens</a>; grade: cadastre em <a href="#grade">Grade e rotas</a>: ${d.semValor.map((v) => esc(v.rs.map((r) => r.id).join('+'))).join(', ')}.</div></div>` : ''}
    <section class="cx-l1">
      <div class="cx-card cx-dest">
        <h2>Custo do mês</h2><p>${prev ? 'Concluídas + previsão das viagens em aberto' : `Viagens concluídas em ${esc(MESES[Number(mes.slice(5)) - 1])}`}</p>
        <div class="cx-tot">${brl(d.total)}</div>
        <div class="cx-var">${varTot == null ? `Sem custos em ${esc(mesAnt)} para comparar` : `<b class="${varTot > 0 ? 'up' : 'dn'}">${varTot > 0 ? '+' : ''}${pctBr(varTot)}</b> em relação a ${esc(mesAnt)} (${brl(ant.total)})`}</div>
        <a class="btn green sm" href="#viagens">Ver viagens</a>
        ${CX_ART}
      </div>
      <div class="cx-card cx-kpi">
        <div class="cx-kt"><span class="cx-ic">${ico('route', 20)}</span><span>Viagens cobradas</span></div>
        <div class="cx-kv"><b>${d.n}</b>${ant.n || d.n ? `<span class="cx-tag ${difN > 0 ? 'up' : difN < 0 ? 'dn' : ''}" title="Diferença para ${esc(mesAnt)}">${difN > 0 ? '+' : ''}${difN}</span>` : ''}</div>
        <div class="cx-meta"><span>Na grade</span><div class="cx-b"><i style="width:${d.n ? Math.round((d.nGrade / d.n) * 100) : 0}%"></i></div><span>${d.n ? pctBr(d.nGrade / d.n) : '—'}</span></div>
      </div>
      <div class="cx-card cx-kpi">
        <div class="cx-kt"><span class="cx-ic g">${ico('money', 20)}</span><span>Custo médio por viagem</span></div>
        <div class="cx-kv"><b>${brl(d.media)}</b>${difMed != null && Math.abs(difMed) >= 0.01 ? `<span class="cx-tag ${difMed > 0 ? 'dn' : 'up'}" title="Diferença para ${esc(mesAnt)}">${difMed > 0 ? '+' : '−'}${brl(Math.abs(difMed))}</span>` : ''}</div>
        <div class="cx-meta"><span>Média de ${esc(mesAnt)}</span><div class="cx-b"><i style="width:${d.media && ant.media ? Math.min(100, Math.round((ant.media / Math.max(d.media, ant.media)) * 100)) : 0}%"></i></div><span>${brl(ant.media)}</span></div>
      </div>
      <div class="cx-card cx-kpi">
        <div class="cx-kt"><span class="cx-ic a">${ico('x', 20)}</span><span>Cancelamentos cobrados</span></div>
        <div class="cx-kv"><b>${brl(d.canc.valor)}</b>${d.canc.n ? `<span class="cx-tag am">${d.canc.n} solicitaç${d.canc.n > 1 ? 'ões' : 'ão'}</span>` : ''}</div>
        <div class="cx-meta"><span>Menos de ${CANCEL_MIN} min antes</span><div class="cx-b a"><i style="width:${d.total ? Math.round((d.canc.valor / d.total) * 100) : 0}%"></i></div><span>${d.total ? pctBr(d.canc.valor / d.total) : '—'}</span></div>
      </div>
    </section>
    <section class="cx-l2">
      <div class="cx-card cx-med">
        <div class="cx-mt">Valores cadastrados <b>${nota}</b></div>
        ${medidorSvg(pctVal)}
        <div class="cx-obs">Viagens do mês com valor definido</div>
        <div class="cx-obs">${d.semValor.length ? `<b>${d.semValor.length} viagem(ns)</b> ainda sem valor` : 'Todas as viagens têm valor'}</div>
        <a class="btn green" href="${d.semValor.length ? '#viagens' : '#grade'}">${d.semValor.length ? 'Informar valores' : 'Ver valores das rotas'}</a>
      </div>
      <div class="cx-card">
        <div class="cx-rh"><span class="cx-ic r">${ico('money', 22)}</span><div><h3>Resumo do mês</h3><p>Clique em um setor na tabela para ver as viagens e a divisão</p></div></div>
        <div class="cx-rg">
          <div><small>Setor que mais gastou</small><b>${top ? `${esc(setorCurto(top[0]))} · ${brl(top[1].valor)}` : '—'}</b></div>
          <div><small>Rota mais usada</small><b>${d.rotaTop ? `${esc(d.rotaTop[0])} <span class="cx-mut">(${d.rotaTop[1]}×)</span>` : '—'}</b></div>
          <div><small>Fechamento do mês</small><b>${fech}</b></div>
          <div><small>Táxi intermunicipal</small><b>${brl(d.cat.inter.valor)}</b></div>
          <div class="cx-full"><small>Divisão por tipo de transporte</small>
            <div class="cx-oc"><div class="cx-b"><i style="width:${d.n ? Math.round((d.cat.carro.n / d.n) * 100) : 0}%"></i></div><b>${d.n ? `Carro ${pctBr(d.cat.carro.n / d.n)} · Moto ${pctBr(d.cat.moto.n / d.n)} · Inter ${pctBr(d.cat.inter.n / d.n)}` : '—'}</b></div></div>
        </div>
        <div class="cx-rp"><div class="cx-rpl"><div class="cx-chips">${d.setores.slice(0, 6).map(([cc]) => chip(cc)).join('')}</div><span class="cx-quando">ATUALIZADO ÀS ${String(agora.getHours()).padStart(2, '0')}:${String(agora.getMinutes()).padStart(2, '0')}</span></div>
          <button class="btn green sm" id="cver">Ver divisão por setor</button></div>
      </div>
    </section>
    <section class="cx-card cx-tab" id="ctab">
      <div class="cx-th"><h3>Setores</h3>
        <div class="cx-seg" role="group" aria-label="Tipo de transporte">${[['todos', 'Todos'], ['carro', 'Carro'], ['moto', 'Moto'], ['inter', 'Intermunicipal']].map(([f, l]) => `<button data-f="${f}" class="${f === filtro ? 'on' : ''}" aria-pressed="${f === filtro}">${l}</button>`).join('')}</div></div>
      <div class="cx-tw"><table class="cx-t">
        <thead><tr><th>Setor</th><th>Viagens</th><th>Por tipo</th><th>Valor</th><th>Participação</th><th>Situação</th></tr></thead>
        <tbody id="ctb"></tbody>
        ${d.setores.length ? `<tfoot><tr><td>Total ${filtro === 'todos' ? '' : `(${esc({ carro: 'carro', moto: 'moto', inter: 'intermunicipal' }[filtro])})`}</td><td></td><td></td><td class="cx-val"><b>${brl(totFiltro)}</b></td><td></td><td></td></tr></tfoot>` : ''}
      </table></div>
    </section>
    <p class="section-s cx-nota">Os valores fixos das rotas ficam em <a href="#grade">Grade e rotas</a>; acréscimos (espera, pedágio…) são lançados em <a href="#viagens">Viagens</a>. Viagens compartilhadas são divididas entre os setores de cada trecho.</p>
    <div class="cx-fundo" id="cfundo"></div><aside class="cx-gav" id="cgav" aria-label="Detalhe do setor" tabindex="-1"></aside>`);

  const media = d.media || 0;
  const maxV = Math.max(0, ...d.setores.map(([, sx]) => k(sx)));
  const ICAT = { carro: 'car', moto: 'moto', inter: 'route' };
  const desenha = () => {
    const q = (renderCustos.q || '').trim().toLowerCase();
    const lista = d.setores.filter(([cc, sx]) => k(sx, 1) > 0 && (!q || cc.toLowerCase().includes(q)));
    $('#ctb').innerHTML = lista.map(([cc, sx]) => {
      const nV = sx.itens.length, mS = nV ? sx.valor / nV : 0;
      const sit = sx.semValor ? ['pe', `${sx.semValor} sem valor`] : media && mS > media * 1.5 ? ['al', 'Acima da média'] : ['ok', 'Dentro da média'];
      const p = totFiltro ? k(sx) / totFiltro : 0;
      return `<tr data-cc="${esc(cc)}" tabindex="0"><td><div class="cx-st">${chip(cc)}<div><b>${esc(setorCurto(cc))}</b><small>Centro de custo ${esc(cc.split('–')[0].trim())}</small></div></div></td>
        <td><b>${k(sx, 1)}</b>${filtro === 'todos' ? '' : ` <small class="cx-mut">de ${nV}</small>`}</td>
        <td><div class="cx-mods">${['carro', 'moto', 'inter'].filter((c) => sx.cat[c].n).map((c) => `<span title="${esc({ carro: 'Carro', moto: 'Moto', inter: 'Intermunicipal' }[c])}">${ico(ICAT[c], 14)}${sx.cat[c].n}</span>`).join('')}</div></td>
        <td class="cx-val"><b>${brl(k(sx))}</b><small>${brl(mS)} por viagem</small></td>
        <td><div class="cx-part"><div class="cx-b"><i style="width:${maxV ? Math.round((k(sx) / maxV) * 100) : 0}%"></i></div><span>${pctBr(p, 1)}</span></div></td>
        <td><span class="cx-sit ${sit[0]}">${esc(sit[1])}</span></td></tr>`;
    }).join('') || `<tr><td colspan="6" class="cx-vazio">${d.setores.length ? 'Nenhum setor encontrado.' : 'Nenhuma viagem com valor neste mês.'}</td></tr>`;
    document.querySelectorAll('#ctb tr[data-cc]').forEach((tr) => {
      tr.onclick = () => abrir(tr.dataset.cc);
      tr.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); abrir(tr.dataset.cc); } };
    });
  };
  const fechar = () => { $('#cgav').classList.remove('on'); $('#cfundo').classList.remove('on'); };
  const abrir = (cc) => {
    const sx = (d.setores.find(([c]) => c === cc) || [])[1];
    if (!sx) return;
    const g = $('#cgav');
    g.innerHTML = `<button class="btn sm cx-x" id="cfx">Fechar</button><small class="cx-cc">CENTRO DE CUSTO ${esc(cc.split('–')[0].trim())}</small><h3>${esc(setorCurto(cc))}</h3>
      <p class="cx-mut">${brl(sx.valor)} em ${sx.itens.length} viagem(ns) · ${d.total ? pctBr(sx.valor / d.total, 1) : '—'} do mês</p>
      <ul>${[...sx.itens].sort((a, b) => at(a.v.data, a.v.hora) - at(b.v.data, b.v.hora)).map(({ v, val, rt }) => `<li><div>
        <b>${esc(v.rs.filter((r) => r.cc === cc).map((r) => r.id).join(', '))}</b> · ${fmtDate(v.data)} ${esc(v.hora)}
        <small>${rt.legs.map((l) => `${esc(siteName(l.de))} → ${esc(siteName(l.para))}`).join(' · ')} · ${esc(TIPO_CURTO[v.tipo])}${v.st !== 'concluida' ? ' (previsão)' : ''}${v.rs.some(cobrada) ? ' · cancelada em cima da hora' : ''}</small>
        <small>${esc(v.rs.filter((r) => r.cc === cc).map((r) => r.nome).join(', '))}</small>
        <small>Viagem ${brl(rt.total)}${rt.acrescimo ? ` (inclui acréscimo ${brl(rt.acrescimo)}${rt.motivoAcr ? ` — ${esc(rt.motivoAcr)}` : ''})` : ''}${Object.keys(rt.partes).length > 1 ? ` · dividida: ${Object.entries(rt.partes).map(([c, x]) => `${esc(setorCurto(c))} ${brl(x)}`).join(' · ')}` : ''}</small>
        </div><b class="cx-pt">${brl(val)}</b></li>`).join('')}</ul>`;
    g.classList.add('on'); $('#cfundo').classList.add('on'); g.focus();
    $('#cfx').onclick = fechar;
  };
  desenha();
  $('#cfundo').onclick = fechar;
  $('#cgav').onkeydown = (e) => { if (e.key === 'Escape') fechar(); };
  document.querySelectorAll('.cx-seg button').forEach((b) => { b.onclick = () => { renderCustos.filtro = b.dataset.f; route(); }; });
  $('#cq').oninput = (e) => { renderCustos.q = e.target.value; desenha(); };
  $('#cmes').onchange = (e) => { if (e.target.value) { renderCustos.mes = e.target.value; route(); } };
  $('#cant').onclick = () => { renderCustos.mes = mesDesloc(mes, -1); route(); };
  $('#cprox').onclick = () => { renderCustos.mes = mesDesloc(mes, 1); route(); };
  $('#cprev').onchange = (e) => { renderCustos.prev = e.target.checked; route(); };
  $('#ccsv').onclick = () => csvCustos(renderCustos.dados);
  $('#cver').onclick = () => { const t = $('#ctab'); if (t && t.scrollIntoView) t.scrollIntoView({ behavior: 'smooth', block: 'start' }); };
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
          <p class="section-s">Valor <b>fixo</b> das corridas da <b>grade</b> entre as unidades (vale para os dois sentidos). Viagens <b>avulsas</b> não usam esta tabela: o Facilities informa o valor de cada corrida em <a href="#viagens">Viagens</a>.</p>
          <table class="tar-t"><thead><tr><th>Entre as unidades</th><th>Táxi (R$)</th><th>Moto (R$)</th></tr></thead><tbody>
          ${pares.map(([a, b]) => linha(parKey(a, b), `${esc(nome(a))} ↔ ${esc(nome(b))}`, t[parKey(a, b)] || {})).join('')}
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
            <li>Viagem avulsa (táxi, intermunicipal, moto): o valor é <b>informado pelo Facilities</b> em Viagens. O setor do solicitante paga sozinho; moto agrupada é dividida entre os setores dos envios.</li>
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
    Object.entries(tabTarifas()).forEach(([k, val]) => { const [x, y] = k.split('|'); if (!(SITES[x] && SITES[y]) && !novo[k]) novo[k] = val; });
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
        ${x.h ? `<small class="vi-x ${x.c}">${x.h}${o.ret && r.aprov && r.aprov.ok && r.status === 'analise' ? ' · <a href="#painel">confirmar viagem →</a>' : ''}</small>` : ''}
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
        <td>${esc(siteName(r.origem))} → ${esc(siteName(r.destino))}<small>${esc(r.tipo === 'moto' ? `${r.vol}× ${r.item} · recebe: ${r.recebedor}` : `${r.pax} pax${bagTxt(r) !== 'N/A' ? ` · ${bagCurto(r)}` : ''}`)}</small></td>
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

  // ---------- Tela principal: resumo do dia, o caminho de hoje e o que precisa do Facilities ----------
  const k = UI.vx && CATS[UI.vx] ? UI.vx : null;
  const aba = ['hoje', 'amanha', 'semana'].includes(UI.vt) ? UI.vt : 'hoje';
  const caminho = aba === 'hoje' ? [...agoraL, ...CATS.hoje.ls].sort(byDH) : CATS[aba].ls;
  const confirmar = S.reqs.filter((r) => r.status === 'analise').sort(byDH); // precisa do Facilities: confirmar veículo e motorista
  const proximas = S.reqs.filter((r) => ['confirmada', 'reagendada'].includes(r.status) && at(r.data, r.hora) > now).length;
  const n2 = (n) => pad(n);
  const linha = (r) => {
    const v = veic(r.veiculo), curso = emCurso(r);
    return `<div class="vc-li" data-id="${esc(r.id)}" tabindex="0" role="button">
      <span class="vc-hr"><b>${esc(r.hora)}</b><small>${aba === 'hoje' ? 'Saída' : esc(diaTxt(r.data))}</small></span>
      ${avatar(r.nome, r.email, 'vc-av')}
      <span class="vc-c"><b>${esc(r.nome)}</b><span class="vc-r">${esc(siteName(r.origem))} <i>→</i> ${esc(siteName(r.destino))}</span>
        <small>${ico(r.tipo === 'moto' ? 'moto' : 'car', 13)}${esc(v ? v.nome : 'Veículo a definir')} · ${esc(TIPO_CURTO[r.tipo] || '')}</small></span>
      <span class="vc-s">${curso ? '<span class="vc-pill ok"><i></i>Em andamento</span>' : `<span class="vc-pill">${esc(r.status === 'confirmada' ? 'Agendada' : STATUS[r.status])}</span>`}</span>
      <span class="vc-go">${ico('right', 16)}</span></div>`;
  };
  const pessoas = [...new Map(confirmar.map((r) => [r.email || r.nome, r])).values()];
  const atalho = (x, ic, tit, sub, n) => `<button class="vc-at" data-x="${x}"><span class="vc-ai">${ico(ic, 18)}</span><span><b>${tit}</b><small>${sub}</small></span>${n !== undefined ? `<span class="vc-an">${n}</span>` : ''}<span class="vc-go">${ico('arrow', 16)}</span></button>`;
  shell(page, k ? expandida(k) : `
    <div class="vc-topo">
      <div><span class="vc-eye">Seu dia, em um só lugar</span><h1 class="vc-t">Visão geral<span>.</span></h1>
        <p class="vc-sub">Menos detalhes. Mais clareza para seguir em frente.</p></div>
      <button class="vc-novo" id="vcnovo">${ico('plus', 18)} Nova solicitação</button>
    </div>
    <section class="vc-card vc-kpis">
      <div class="vc-dia"><span class="vc-ic">${ico('cal', 20)}</span><span><b>${esc(DIAS[now.getDay()])}${isWeekday(now) ? '-feira' : ''}, ${now.getDate()} de ${esc(MESES[now.getMonth()])}</b><small>Um olhar rápido para a sua operação.</small></span></div>
      <button class="vc-k" data-x="agora"><b>${n2(agoraL.length)}${agoraL.length ? '<i class="vc-vivo"></i>' : ''}</b><small>Em andamento</small></button>
      <button class="vc-k" data-x="semana"><b>${n2(proximas)}</b><small>Próximas viagens ${ico('arrow', 13)}</small></button>
      <a class="vc-k" href="#painel"><b>${n2(confirmar.length)}${confirmar.length ? '<span class="vc-tag">Ação necessária</span>' : ''}</b><small>Aguardando confirmação ${ico('arrow', 13)}</small></a>
    </section>
    <div class="vc-grade">
      <section class="vc-card vc-cam">
        <div class="vc-cam-h">
          <div><h2>O caminho ${aba === 'hoje' ? 'de hoje' : aba === 'amanha' ? 'de amanhã' : 'da semana'}</h2><p>As próximas paradas da sua operação.</p></div>
          <a class="vc-ic" href="#viagens" title="Abrir Viagens">${ico('cal', 18)}</a>
        </div>
        <div class="vc-cam-f">
          <div class="vc-tabs">${[['hoje', 'Hoje'], ['amanha', 'Amanhã'], ['semana', 'Semana']].map(([kk, l]) => `<button class="${aba === kk ? 'on' : ''}" data-vt="${kk}">${l}</button>`).join('')}</div>
          <small>${caminho.length} ${caminho.length === 1 ? 'viagem programada' : 'viagens programadas'}</small>
        </div>
        <div class="vc-lista">${caminho.length ? caminho.slice(0, 6).map(linha).join('') : `<div class="vc-vazio">${CATS[aba].vazio}</div>`}</div>
        <button class="vc-mais" data-x="${aba}">Ver agenda completa ${ico('arrow', 14)}</button>
      </section>
      <div class="vc-lado">
        <section class="vc-card vc-precisa">
          <div class="vc-ph"><span class="vc-ic">${ico('clip', 18)}</span><span class="vc-eye">Precisa de você</span><i></i></div>
          ${confirmar.length ? `<h2>Uma pausa para destravar o caminho.</h2>
            <p>Você tem <b>${confirmar.length} ${confirmar.length === 1 ? 'solicitação' : 'solicitações'}</b> aguardando confirmação. Vamos dar o próximo passo?</p>
            <div class="vc-pess">${pessoas.slice(0, 3).map((r) => avatar(r.nome, r.email, 'vc-av sm')).join('')}<small>${esc(pessoas[0].nome.split(' ')[0])}${pessoas.length > 1 ? ` e mais ${pessoas.length - 1} ${pessoas.length === 2 ? 'pessoa' : 'pessoas'}` : ''}</small></div>
            <a class="vc-rev" href="#painel">Revisar solicitações ${ico('arrow', 16)}</a>`
          : `<h2>Tudo em dia por aqui.</h2><p>Nenhuma solicitação aguardando confirmação do Facilities.</p>`}
        </section>
        <section class="vc-card vc-ats">
          ${atalho('aprov', 'users', 'Em aprovação', 'aguardando o gestor imediato', CATS.aprov.ls.length)}
          ${atalho('ret', 'mail', 'Retornos de aprovação', 'respostas dos gestores', CATS.ret.ls.length)}
          ${atalho('canc', 'x', 'Canceladas e recusadas', 'desta semana em diante', CATS.canc.ls.length)}
          <a class="vc-at" href="#custos"><span class="vc-ai">${ico('chart', 18)}</span><span><b>Uma visão mais completa</b><small>Explore os custos da operação</small></span><span class="vc-go">${ico('arrow', 16)}</span></a>
        </section>
      </div>
    </div>`);
  document.querySelectorAll('[data-vt]').forEach((b) => { b.onclick = () => { UI.vt = b.dataset.vt; route(); }; });
  document.querySelectorAll('.vc-li').forEach((el) => {
    el.onclick = () => openDetalhe(el.dataset.id);
    el.onkeydown = (e) => { if (e.key === 'Enter') openDetalhe(el.dataset.id); };
  });
  const novoB = $('#vcnovo'); if (novoB) novoB.onclick = openAvulsa;

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
    app().innerHTML = `<div class="apv-wrap"><div class="apv-card" aria-busy="true" aria-label="Carregando"><div class="apv-top">${brand}<span>Aprovação de viagem</span></div>
      <div class="sk-grupo" style="margin-top:18px">${sk('55%', '22px')}${sk('85%')}${sk('70%')}${sk('80%')}${sk('60%')}
        <div class="sk-tool" style="margin-top:10px">${sk('48%', '44px')}${sk('48%', '44px')}</div></div></div></div>`;
    fetch(url, { cache: 'no-store' }).then((x) => (x.ok ? x.json() : null)).then((j) => telaAprov(j && j.r, j && j.par, j && j.expirado, async (ok, motivo) => {
      let extra = {}, x;
      for (;;) { // a decisão do gestor é assinada eletronicamente (conta Microsoft com a senha digitada de novo)
        x = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ok, motivo, ...extra }) }).catch(() => null);
        if (!x || x.status !== 428) break;
        const pq = await x.json().catch(() => ({}));
        const ass = await confirmarRegistro(pq.precisa || {}, tok);
        if (!ass) { toast('Decisão cancelada — nada foi registrado.'); renderAprovar(tok); return; }
        extra = { assinatura: ass.assinatura };
      }
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
    casca(`${head}${det(r)}<div class="apv-msg ${a && a.ok ? 'ok' : 'bad'}"><b>${a ? `${a.ok ? 'Aprovada' : 'Reprovada'} por ${esc(a.por)} em ${esc(a.quando)}` : 'Esta solicitação não está mais aguardando aprovação.'}</b>${a && a.motivo ? `<p>Motivo: ${esc(a.motivo)}</p>` : ''}<p>Nada mais a fazer por aqui.</p></div>${r.assinaturas && r.assinaturas.length ? `<div class="apv-ass">${assinaturasHtml(r)}</div>` : ''}`);
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
  ['visao', 'Visão geral', 'grid', 'Facilities'], ['painel', 'Confirmação de viagens', 'list', 'Facilities'], ['viagens', 'Viagens', 'route', 'Facilities'],
  ['solicitacoes', 'Solicitações', 'filter', 'Facilities'], ['motoristas', 'Motoristas', 'car', 'Facilities'], ['grade', 'Grade e rotas', 'clock', 'Facilities'],
  ['custos', 'Custos por setor', 'money', 'Facilities'], ['agenda', 'Agenda', 'cal', 'Colaborador'], ['minhas', 'Minhas solicitações', 'user', 'Colaborador'],
  ['aprovacoes', 'Aprovações', 'check', 'Gestor'], ['usuarios', 'Usuários', 'users', 'Administração'], ['historico', 'Histórico', 'history', 'Administração'],
  ['cadastros', 'Cadastros e parâmetros', 'cadastro', 'Administração'], ['#ajuda', 'Ajuda', 'info', 'Administração'],
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
      <aside class="ti-brand lg-marca" aria-label="Natulab">
        <div class="lg-logo"><img src="${MARCA}natulab-logo.svg" alt="Natulab Farmacêutica"></div>
        <div class="lg-servicos">
          <p class="lg-frase">Táxi e Moto Táxi corporativo da Natulab.</p>
          <ul><li><b>Mobilab</b><small>Solicite, acompanhe e organize seus deslocamentos entre os sites.</small></li></ul>
        </div>
        <p class="lg-rodape escuro">Copyright © ${new Date().getFullYear()} Mobilab · Natulab · SAC 0800 730 7370</p>
      </aside>
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
      let extra = {};
      for (;;) { // alterar cadastro já gravado: o servidor pede o motivo (21 CFR Part 11)
        const r = await fetch('/api/usuarios', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...dados, ...extra }) });
        const j = await r.json();
        if (r.status === 428) { const ok = await confirmarRegistro(j.precisa || {}); if (!ok) throw new Error('Alteração cancelada — nada foi gravado.'); extra = { motivo: ok.motivo }; continue; }
        if (!r.ok) throw new Error(j.erro); return j.usuario;
      }
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
const ADMIN_MOBILAB = 'admin@mobilab.local'; // conta local do Mobilab: sempre TI, a única com senha própria
// níveis de administração: Super Admin (só a conta do Mobilab) > Administrador > Admin Júnior
const PERFIL_L = { colaborador: 'Colaborador', facilities: 'Facilities', ti: 'Administrador', ti_jr: 'Admin Júnior' };
const ADMINS = ['ti', 'ti_jr'];
const souSuper = () => !!S.user && (S.user.super || S.user.email === ADMIN_MOBILAB);
// quem eu posso alterar: Super Admin mexe em todos; Administrador só em quem não é administrador; Admin Júnior só consulta
const possoEditar = (u, ef) => S.user.role === 'ti' && (souSuper() || (u.email !== ADMIN_MOBILAB && !ADMINS.includes(ef(u))));
const perfisQueDou = () => Object.entries(PERFIL_L).filter(([k]) => souSuper() || !ADMINS.includes(k));
const ORIGEM_L = { login: 'Já entrou', ad: 'Importado do AD', rh: 'Base do RH + AD', 'gestor-ad': 'Gestor (AD)', 'cadastro-ti': 'Cadastrado pela TI' };
// Skeleton loader: forma da tela em cinza enquanto os dados chegam do servidor
const sk = (w, h, extra = '') => `<i class="sk" style="width:${w};${h ? `height:${h};` : ''}${extra}"></i>`;
const skTabela = (n = 8) => `<div class="card" aria-busy="true" aria-label="Carregando">
    <div class="sk-linha cab">${'<i class="sk"></i>'.repeat(6)}</div>
    ${Array.from({ length: n }, (_, i) => `<div class="sk-linha"><div class="sk-grupo" style="gap:6px">${sk(`${70 - (i % 3) * 12}%`)}${sk('40%', '10px')}</div>${sk(`${80 - (i % 4) * 10}%`)}${sk('60%')}${sk(`${75 - (i % 2) * 20}%`)}${sk('90%', '30px')}${sk('70%', '26px', 'border-radius:999px')}</div>`).join('')}
  </div>`;
const skPagina = () => `<div class="sk-top" aria-busy="true" aria-label="Carregando">${sk('110px', '30px')}${sk('60px')}${sk('60px')}<span style="flex:1"></span>${sk('38px', '38px', 'border-radius:50%')}${sk('180px', '38px')}</div>
  <div class="sk-pagina sk-grupo">${sk('120px', '12px')}${sk('260px', '34px')}${sk('420px', '14px', 'max-width:100%')}
    <div class="sk-kpis" style="margin-top:8px">${'<i class="sk" style="width:220px;height:84px"></i>'.repeat(4)}</div>${skTabela(5)}</div>`;
// Barra de filtros e busca da tela Usuários: fica de verdade (dá para digitar) mesmo enquanto a lista carrega
const barraUsr = (fp) => `<div class="toolbar vtools">
      <div class="seg">${[['', 'Todos'], ['colaborador', 'Colaboradores'], ['facilities', 'Facilities'], ['ti', 'Administradores'], ['bloq', 'Bloqueados']].map(([k, l]) => `<button class="seg-b${fp === k ? ' on' : ''}" data-uf="${k}">${l}</button>`).join('')}</div>
      <label class="search">${ico('search', 16)}<input id="uq" placeholder="Buscar nome, e-mail ou setor…" value="${esc(renderUsuarios.q || '')}" aria-label="Buscar usuário"></label>
      ${S.user.role === 'ti' ? `<button class="btn green" id="unovo">${ico('userplus', 16)} Novo usuário</button>` : ''}
    </div>`;
const ligarBarraUsr = () => {
  // filtro e busca usam a lista já carregada (não buscam de novo no servidor)
  document.querySelectorAll('[data-uf]').forEach((b) => { b.onclick = () => { renderUsuarios.f = b.dataset.uf; document.querySelectorAll('[data-uf]').forEach((x) => x.classList.toggle('on', x === b)); renderUsuarios.rapido = true; route(); }; });
  $('#uq').oninput = (e) => { renderUsuarios.q = e.target.value; clearTimeout(renderUsuarios.t); renderUsuarios.t = setTimeout(() => { renderUsuarios.rapido = true; route(); }, 300); };
};
async function renderUsuarios(page) {
  const rapido = renderUsuarios.rapido && $('#uq'); renderUsuarios.rapido = false;
  if (rapido && renderUsuarios.carregando) return; // a lista ainda está chegando: ela já vai aparecer com a busca/filtro atuais
  let us = rapido ? renderUsuarios.cache : null;
  if (!us) {
    shell(page, `<div class="pg-head"><div><nav class="crumb"><span>Administração</span>${ico('right', 12)}<b>Usuários</b></nav><h1>Usuários</h1>
        <p>Quem acessa o Mobilab e com qual perfil. O login é pelo AD; aqui a TI define o perfil e pode bloquear o acesso.</p></div>
        <div class="sk-kpis">${'<i class="sk"></i>'.repeat(4)}</div></div>
      ${barraUsr(renderUsuarios.f || '')}
      ${skTabela()}`);
    ligarBarraUsr(); if ($('#unovo')) $('#unovo').disabled = true;
    renderUsuarios.carregando = true;
    try { us = await Usr.listar(); } catch (e) { const c = $('main .card[aria-busy]'); if (c) { c.className = 'card empty'; c.removeAttribute('aria-busy'); c.textContent = e.message || 'Não foi possível carregar.'; } return; } finally { renderUsuarios.carregando = false; }
    renderUsuarios.cache = us;
    if (route.page !== 'usuarios' || !$('#uq')) return;
  }
  const q = (renderUsuarios.q || '').toLowerCase(), fp = renderUsuarios.f || '';
  const ae = document.activeElement, foco = ae && ae.id === 'uq' ? [ae.selectionStart, ae.selectionEnd] : null; // quem está digitando continua digitando
  const ef = (u) => u.perfil || u.padrao || 'colaborador';
  const lista = us.filter((u) => (!q || `${u.nome} ${u.email} ${u.cc}`.toLowerCase().includes(q)) && (!fp || (fp === 'bloq' ? !u.ativo : fp === 'ti' ? ADMINS.includes(ef(u)) : ef(u) === fp)));
  const cont = (f) => us.filter((u) => (f === 'bloq' ? !u.ativo : f === 'ti' ? ADMINS.includes(ef(u)) : ef(u) === f)).length;
  $('main').innerHTML = `<div class="pg-head"><div><nav class="crumb"><span>Administração</span>${ico('right', 12)}<b>Usuários</b></nav><h1>Usuários</h1>
      <p>Quem acessa o Mobilab e com qual perfil. O login, o bloqueio e a senha vêm do Entra ID (conta Microsoft); aqui a TI define o perfil.${S.user.role === 'ti_jr' ? ' <b>Admin Júnior: só consulta.</b>' : ''}</p></div>
      <div class="mini-kpis">${[['', 'Usuários', us.length], ['facilities', 'Facilities', cont('facilities')], ['ti', 'Administradores', cont('ti')], ['bloq', 'Bloqueados', cont('bloq')]]
        .map(([k, l, n]) => `<button type="button" class="mk mk-f${fp === k ? ' on' : ''}${k === 'bloq' && n ? ' warn' : ''}" data-uf="${k}" aria-pressed="${fp === k}" title="Mostrar só ${k ? l.toLowerCase() : 'todos'}"><small>${l}</small><b>${n}</b></button>`).join('')}</div></div>
    ${barraUsr(fp)}
    <div class="card"><div class="table-wrap"><table class="tbl-ap usr-t"><thead><tr><th>Nome</th><th>E-mail</th><th>Setor</th><th>Gestor imediato</th><th>Perfil</th><th>Acesso</th><th>Origem</th><th>Último acesso</th><th></th></tr></thead><tbody>
      ${lista.map((u) => `<tr class="${u.ativo ? '' : 'bloq'}"><td><div class="u-pess">${avatar(u.nome, u.email, 'sm')}<div><b>${esc(u.nome || '—')}</b>${u.travado ? ' <span class="tag-ed" title="Editado no Mobilab — a importação do AD não altera estes dados">editado</span>' : ''}${u.cargo ? `<br><small>${esc(u.cargo)}</small>` : ''}</div></div></td>
        <td>${esc(u.email)}</td><td>${esc(u.cc || '—')}</td><td>${esc(u.gestor || '—')}</td>
        <td>${u.email === ADMIN_MOBILAB ? '<span class="perf-fixo perf-super" title="Conta do Mobilab: nível máximo, não muda">Super Admin</span>'
          : !possoEditar(u, ef) ? `<span class="perf-fixo" title="${S.user.role === 'ti' ? 'Só o Super Admin muda administradores' : 'Só consulta'}">${PERFIL_L[ef(u)] || ef(u)}</span>`
          : `<select class="uperf" data-e="${esc(u.email)}" aria-label="Perfil de ${esc(u.nome)}">${perfisQueDou().map(([k, l]) => `<option value="${k}" ${ef(u) === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</td>
        <td><span class="ac-tag ${u.ativo ? '' : 'off'}" title="${u.email === ADMIN_MOBILAB ? 'Conta do Mobilab' : 'Vem do Entra ID (conta Microsoft)'}">${u.ativo ? 'Ativo' : 'Bloqueado'}</span></td>
        <td><small>${esc(ORIGEM_L[u.origem] || u.origem || '—')}</small></td><td><small>${esc(u.ultimo_login || '—')}</small></td>
        <td>${possoEditar(u, ef) ? `<button class="btn sm uedit" data-e="${esc(u.email)}">Editar</button>` : ''}</td></tr>`).join('') || '<tr><td colspan="9" class="empty">Nenhum usuário neste filtro.</td></tr>'}
    </tbody></table></div>
    <p class="section-s" style="margin-top:10px">Mudanças valem no próximo login da pessoa. Quem foi <b>editado</b> aqui não é alterado pela importação do AD (o Mobilab é a referência). Gestor não é perfil: quem é gestor imediato no AD vê a aba Aprovações automaticamente.</p></div>`;
  const salvar = async (dados, msg) => { try { await Usr.salvar(dados); toast(msg); } catch (e) { toast(e.message || 'Não foi possível salvar.'); } route(); };
  ligarBarraUsr();
  if (foco) { const i = $('#uq'); i.focus(); i.setSelectionRange(foco[0], foco[1]); }
  document.querySelectorAll('.uperf').forEach((sel) => { sel.onchange = () => salvar({ email: sel.dataset.e, perfil: sel.value }, `Perfil alterado para ${PERFIL_L[sel.value]}.`); });
  const editor = (u) => {
    const novo = !u, adm = !novo && u.email === ADMIN_MOBILAB;
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
        <div class="f"><label>Perfil</label>${adm ? `<input class="input" id="ue_perfil" value="Super Admin" readonly title="Conta do Mobilab: nível máximo, não muda">`
          : `<select class="input" id="ue_perfil">${perfisQueDou().map(([k, l]) => `<option value="${k}" ${(u.perfil || u.padrao || 'colaborador') === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`}</div>
        <div class="f"><label>Acesso</label><input class="input" value="${u.ativo ? 'Ativo' : 'Bloqueado'}${adm ? '' : ' (vem do Entra ID)'}" readonly></div>
        <div class="f full"><label class="check"><input type="checkbox" id="ue_trava" ${u.travado ? 'checked' : ''}> <span>Manter estes dados mesmo se o AD mudar <small>(a importação do AD não altera nome, setor, cargo e gestor)</small></span></label></div>
        ${souSuper() && adm ? `<div class="f full"><label for="ue_senha">Nova senha do Mobilab <small>(deixe em branco para manter a atual)</small></label>
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
        cc: $('#ue_cc').value.trim(), cargo: $('#ue_cargo').value.trim(), gestor_email: ge, perfil: adm ? 'ti' : $('#ue_perfil').value,
        travado: $('#ue_trava').checked };
      try {
        await Usr.salvar(dados);
        if (nsenha) await Usr.senha(dados.email, nsenha);
        closeModal(); toast((novo ? 'Usuário cadastrado.' : 'Usuário atualizado.') + (nsenha ? ' Senha alterada — passe para a pessoa por um canal seguro.' : '')); route();
      }
      catch (e) { $('#uemsg').innerHTML = `<div class="msg-box bad">${esc(e.message)}</div>`; }
    };
  };
  if ($('#unovo')) $('#unovo').onclick = () => editor(null);
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
if (typeof setInterval === 'function') setInterval(() => { if (S && S.user && ['visao', 'agenda'].includes(route.page) && $('#modal').hidden && !document.getElementById('confirma') && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('#det'))) route(); }, 60000);

// ---------------- Exibição: fonte, escala e brilho (preferência de cada pessoa, neste navegador) ----------------
const EXIB_PADRAO = { fonte: 100, escala: 100, brilho: 100 };
const Exib = {
  ler() { try { return { ...EXIB_PADRAO, ...(JSON.parse(localStorage.getItem('mobilab.exibicao') || '{}')) }; } catch (e) { return { ...EXIB_PADRAO }; } },
  gravar(x) { try { localStorage.setItem('mobilab.exibicao', JSON.stringify(x)); } catch (e) { /* sem armazenamento: vale só nesta visita */ } },
  aplicar(x = Exib.ler()) {
    const r = document.documentElement.style;
    r.setProperty('--fz', String(x.fonte / 100));
    r.setProperty('--esc', String(x.escala / 100));
    let o = document.getElementById('brilho');
    if (!o) { o = document.createElement('div'); o.id = 'brilho'; o.setAttribute('aria-hidden', 'true'); document.body.appendChild(o); }
    o.style.background = x.brilho < 100 ? `rgba(0,0,0,${((100 - x.brilho) / 100).toFixed(2)})` : x.brilho > 100 ? `rgba(255,255,255,${((x.brilho - 100) / 100).toFixed(2)})` : 'transparent';
  },
};
function openExibicao() {
  const x = Exib.ler();
  const seg = (k, ops) => `<div class="seg ex-seg" data-k="${k}">${ops.map(([v, l]) => `<button type="button" class="seg-b${x[k] === v ? ' on' : ''}" data-v="${v}">${l}</button>`).join('')}</div>`;
  openModal(`
    <h3>${ico('sliders', 20)} Exibição</h3>
    <p class="sub">Ajuste como o Mobilab aparece para você. Vale só neste computador/navegador.</p>
    <div class="ex-op"><b>Tamanho da fonte</b><small>Textos e conteúdo das telas</small>
      ${seg('fonte', [[90, '<span style="font-size:12px">A</span> Pequena'], [100, '<span style="font-size:14px">A</span> Normal'], [112, '<span style="font-size:16px">A</span> Grande'], [125, '<span style="font-size:18px">A</span> Muito grande']])}</div>
    <div class="ex-op"><b>Escala de exibição</b><small>Tamanho de tudo, inclusive o menu</small>
      ${seg('escala', [[80, '80%'], [90, '90%'], [100, '100%'], [110, '110%'], [125, '125%']])}</div>
    <div class="ex-op"><b>Brilho</b><small>Escurece ou clareia a tela do sistema</small>
      <div class="ex-br">${ico('moon', 16)}<input type="range" id="exbr" min="60" max="120" step="5" value="${x.brilho}" aria-label="Brilho">${ico('sun', 18)}<output id="exbrv">${x.brilho}%</output></div></div>
    <div class="modal-acts"><button class="btn" id="exrst">Restaurar padrão</button><button class="btn green" id="exok">Pronto</button></div>`);
  const muda = (k, v) => { const y = { ...Exib.ler(), [k]: v }; Exib.gravar(y); Exib.aplicar(y); };
  document.querySelectorAll('.ex-seg').forEach((g) => g.querySelectorAll('button').forEach((b) => { b.onclick = () => {
    g.querySelectorAll('button').forEach((z) => z.classList.toggle('on', z === b)); muda(g.dataset.k, Number(b.dataset.v)); }; }));
  $('#exbr').oninput = (e) => { $('#exbrv').textContent = `${e.target.value}%`; muda('brilho', Number(e.target.value)); };
  $('#exrst').onclick = () => { Exib.gravar({ ...EXIB_PADRAO }); Exib.aplicar(); closeModal(); openExibicao(); };
  $('#exok').onclick = closeModal;
}
Exib.aplicar();

// ---------------- Boot ----------------
if (window.MOBILAB_API) Srv.iniciar();
else { S = load() || seed(); route(); }
