// ══════════════════════════════════════════════
//  admissao.html — JS principal
// ══════════════════════════════════════════════
let session = null;
let VAGAS   = [];
let OPERACOES = [];
let INDICACOES = [];
let USUARIOS_SISTEMA = []; // lista de usuários cadastrados pelo Master
let _MAIN_HTML = '';
let _importRows = [];
let _TEMA_ATUAL = 'escuro';

// ══════════════════════════════════════════════
// SISTEMA UNIVERSAL DE COL PICKER + FILTROS PERSISTENTES
// Chave no localStorage: wecan_cp_{tela}  (colunas)
//                        wecan_fi_{tela}  (filtros de texto/select)
// ══════════════════════════════════════════════

const _cpAtivas = {}; // { tela: Set<id> }

function cpCarregar(tela, defs) {
  try {
    const raw = localStorage.getItem('wecan_cp_' + tela);
    _cpAtivas[tela] = raw ? new Set(JSON.parse(raw)) : new Set(defs.filter(c=>c.default).map(c=>c.id));
  } catch(e) {
    _cpAtivas[tela] = new Set(defs.filter(c=>c.default).map(c=>c.id));
  }
}

function cpSalvar(tela) {
  try { localStorage.setItem('wecan_cp_' + tela, JSON.stringify([...(_cpAtivas[tela]||new Set())])); } catch(e) {}
}

function cpAtivo(tela, id) {
  return (_cpAtivas[tela] || new Set()).has(id);
}

function cpAbrir(tela, popupId, btnEl) {
  // Fechar outros popups abertos
  document.querySelectorAll('.col-picker-popup.open').forEach(p => { if (p.id !== popupId) p.classList.remove('open'); });
  const popup = document.getElementById(popupId);
  if (!popup) return;
  const isOpen = popup.classList.toggle('open');
  if (isOpen) {
    const rect = btnEl.getBoundingClientRect();
    const pw = 260;
    let left = rect.right - pw;
    if (left < 8) left = 8;
    popup.style.top  = (rect.bottom + 6) + 'px';
    popup.style.left = left + 'px';
    cpRenderGrid(tela, popupId.replace('-popup','') + '-grid');
  }
}

function cpRenderGrid(tela, gridId) {
  const defs = _CP_DEFS[tela];
  if (!defs) return;
  const grid = document.getElementById(gridId);
  if (!grid) return;
  const ativas = _cpAtivas[tela] || new Set();
  grid.innerHTML = defs.map(c => `
    <label class="col-check-item ${ativas.has(c.id)?'checked':''}">
      <input type="checkbox" data-tela="${tela}" data-col="${c.id}" ${ativas.has(c.id)?'checked':''}
        onchange="cpToggle(this)"/>
      ${c.label}
    </label>`).join('');
}

function cpToggle(input) {
  const tela = input.dataset.tela;
  const id   = input.dataset.col;
  if (!_cpAtivas[tela]) _cpAtivas[tela] = new Set();
  if (input.checked) _cpAtivas[tela].add(id);
  else _cpAtivas[tela].delete(id);
  input.closest('.col-check-item').classList.toggle('checked', input.checked);
}

function cpAplicar(tela, popupId, renderFn) {
  cpSalvar(tela);
  document.getElementById(popupId)?.classList.remove('open');
  if (renderFn) renderFn();
}

function cpReset(tela, defs, renderFn) {
  _cpAtivas[tela] = new Set(defs.filter(c=>c.default).map(c=>c.id));
  cpSalvar(tela);
  // Encontrar o grid e re-renderizar
  const gridId = tela.replace('_','-') + '-cp-grid';
  cpRenderGrid(tela, gridId);
  if (renderFn) renderFn();
}

// Fechar popups ao clicar fora
document.addEventListener('click', e => {
  if (!e.target.closest('.toolbar-right') && !e.target.closest('.col-picker-popup')) {
    document.querySelectorAll('.col-picker-popup.open').forEach(p => p.classList.remove('open'));
  }
});

// ── Gerar thead dinâmico ────────────────────
function cpRenderThead(theadRowId, defs, tela) {
  const tr = document.getElementById(theadRowId);
  if (!tr) return;
  const ativas = _cpAtivas[tela] || new Set();
  tr.innerHTML = defs.filter(c => ativas.has(c.id)).map(c => `<th>${c.label}</th>`).join('');
}

// ── Persistência de filtros de texto/select ─
function filtroSalvar(tela, campos) {
  // campos = { id: 'elemento-id' }[]
  const vals = {};
  campos.forEach(({key,id}) => {
    const el = document.getElementById(id);
    if (el) vals[key] = el.value;
  });
  try { localStorage.setItem('wecan_fi_'+tela, JSON.stringify(vals)); } catch(e) {}
}

function filtroCarregar(tela, campos) {
  try {
    const raw = localStorage.getItem('wecan_fi_'+tela);
    if (!raw) return;
    const vals = JSON.parse(raw);
    campos.forEach(({key,id}) => {
      const el = document.getElementById(id);
      if (el && vals[key] !== undefined) el.value = vals[key];
    });
  } catch(e) {}
}

function filtroLimparTela(tela) {
  try { localStorage.removeItem('wecan_fi_'+tela); } catch(e) {}
  const mapa = FILTRO_CAMPOS[tela] || [];
  mapa.forEach(({id}) => {
    const el = document.getElementById(id);
    if (el) el.value = el.tagName==='SELECT' ? (el.options[0]?.value||'') : '';
  });
  // Chamar render da tela
  const fn = FILTRO_RENDER[tela];
  if (fn) fn();
}

// Mapa de campos de filtro por tela
const FILTRO_CAMPOS = {
  ind:    [{key:'busca',id:'busca-ind'},{key:'status',id:'filtro-ind-status'}],
  vagas:  [{key:'busca',id:'busca-vaga'},{key:'regional',id:'filtro-regional'},{key:'status',id:'filtro-statusvaga'},{key:'consultor',id:'filtro-consultor'},{key:'cc',id:'filtro-cc'}],
  ns:     [{key:'busca',id:'ns-busca'},{key:'tipo',id:'ns-filtro-tipo'},{key:'status',id:'ns-filtro-status'}],
  vchr:   [{key:'busca',id:'vchr-busca-colab'},{key:'status',id:'vchr-filtro-status'},{key:'trajeto',id:'vchr-filtro-trajeto'},{key:'depto',id:'vchr-filtro-depto'}],
  integ:  [{key:'status',id:'integ-filtro-status'},{key:'busca',id:'integ-busca'}],
  pagar:  [{key:'data',id:'pagar-filtro-data'},{key:'cc',id:'pagar-filtro-cc'},{key:'busca',id:'pagar-busca'}],
  hist:   [{key:'data',id:'hist-filtro-data'},{key:'cc',id:'hist-filtro-cc'},{key:'busca',id:'hist-busca'}],
  cli:    [{key:'busca',id:'busca-cli'},{key:'status',id:'filtro-cli-status'}],
  cc_cad: [{key:'busca',id:'busca-cc'},{key:'status',id:'filtro-cc-status'}],
  dep:    [{key:'busca',id:'busca-dep'}],
};

const FILTRO_RENDER = {
  ind:    ()=>renderIndicacoes(),
  vagas:  ()=>renderVagas(),
  ns:     ()=>nsRenderTabela(),
  vchr:   ()=>vchrRenderControle(),
  integ:  ()=>integRenderTabela(),
  pagar:  ()=>pagarBenFiltrar(),
  hist:   ()=>histBenFiltrar(),
  cli:    ()=>renderClientes(),
  cc_cad: ()=>renderCentrosCusto(),
  dep:    ()=>renderDeptos(),
};

// Salvar filtros automaticamente ao mudar inputs
function _hookFiltroSave(tela) {
  const campos = FILTRO_CAMPOS[tela]||[];
  campos.forEach(({id}) => {
    const el = document.getElementById(id);
    if (!el) return;
    const evt = el.tagName==='SELECT' ? 'change' : 'input';
    el.addEventListener(evt, () => filtroSalvar(tela, campos));
  });
}

// ──────────────────────────────────────────────
// DEFINIÇÕES DE COLUNAS POR TELA
// ──────────────────────────────────────────────

const NS_COLUNAS = [
  { id:'lancamento',  label:'Lançamento',      default:true  },
  { id:'tipo',        label:'Tipo',            default:true  },
  { id:'nome',        label:'Colaborador',     default:true  },
  { id:'matricula',   label:'Matrícula',       default:true  },
  { id:'cc',          label:'Centro de Custo', default:true  },
  { id:'data_integ',  label:'Data Integração', default:true  },
  { id:'data_deslig', label:'Data Deslig.',    default:true  },
  { id:'participou',  label:'Participou?',     default:true  },
  { id:'onsite',      label:'Onsite',          default:false },
  { id:'vaga',        label:'Vaga',            default:true  },
  { id:'status',      label:'Status',          default:true  },
];

const VCHR_COLUNAS = [
  { id:'status',       label:'Status',        default:true  },
  { id:'matricula',    label:'Matrícula',     default:true  },
  { id:'nome',         label:'Nome',          default:true  },
  { id:'unidade',      label:'Unidade',       default:true  },
  { id:'horario',      label:'Horário',       default:true  },
  { id:'trajeto',      label:'Trajeto',       default:true  },
  { id:'cod_voucher',  label:'Cód Voucher',   default:false },
  { id:'aplicativo',   label:'Aplicativo',    default:true  },
  { id:'dt_inclusao',  label:'Dt. Inclusão',  default:false },
  { id:'acoes',        label:'Ações',         default:true  },
];

const INTEG_COLUNAS = [
  { id:'num',     label:'#',              default:true  },
  { id:'nome',    label:'Nome',           default:true  },
  { id:'cargo',   label:'Cargo',          default:true  },
  { id:'depto',   label:'Departamento',   default:true  },
  { id:'ben',     label:'Benefícios',     default:true  },
  { id:'conf',    label:'Confirmação',    default:true  },
  { id:'confPor', label:'Confirmado por', default:false },
];

const PAGAR_COLUNAS = [
  { id:'sel',      label:'',              default:true  },
  { id:'nome',     label:'Nome',          default:true  },
  { id:'cc',       label:'CC / Depto',    default:true  },
  { id:'ben',      label:'Benefícios',    default:true  },
  { id:'integ',    label:'Integração',    default:true  },
  { id:'confPor',  label:'Confirmado por',default:false },
  { id:'pagar',    label:'Pagamento',     default:true  },
];

const HIST_COLUNAS = [
  { id:'nome',   label:'Nome',         default:true  },
  { id:'cc',     label:'CC / Depto',   default:true  },
  { id:'ben',    label:'Benefícios',   default:true  },
  { id:'integ',  label:'Integração',   default:true  },
  { id:'status', label:'Status',       default:true  },
  { id:'dets',   label:'Detalhes',     default:true  },
];

const CLI_COLUNAS = [
  { id:'codigo',   label:'Código',          default:true  },
  { id:'razao',    label:'Razão Social',    default:true  },
  { id:'fantasia', label:'Nome Fantasia',   default:false },
  { id:'cnpj',     label:'CNPJ',           default:false },
  { id:'cidade',   label:'Cidade / UF',    default:true  },
  { id:'grupo',    label:'Grupo Econômico',default:false },
  { id:'status',   label:'Status',         default:true  },
  { id:'acoes',    label:'Ações',          default:true  },
];

const CC_CAD_COLUNAS = [
  { id:'codigo',   label:'Código',        default:true  },
  { id:'cliente',  label:'Cliente',       default:true  },
  { id:'descricao',label:'Descrição',     default:true  },
  { id:'tipo_op',  label:'Tipo Operação', default:false },
  { id:'cidade',   label:'Cidade / UF',  default:true  },
  { id:'status',   label:'Status',       default:true  },
  { id:'acoes',    label:'Ações',        default:true  },
];

const DEP_COLUNAS = [
  { id:'codigo',   label:'Código',       default:true  },
  { id:'descricao',label:'Descrição',    default:true  },
  { id:'tipo_op',  label:'Tipo Operação',default:false },
  { id:'cli_cod',  label:'Cliente (Cód)',default:true  },
  { id:'obs',      label:'Observações',  default:false },
  { id:'acoes',    label:'Ações',        default:true  },
];

// Mapa de defs por tela (para lookup genérico)
const _CP_DEFS = {
  ns:     NS_COLUNAS,
  vchr:   VCHR_COLUNAS,
  integ:  INTEG_COLUNAS,
  pagar:  PAGAR_COLUNAS,
  hist:   HIST_COLUNAS,
  cli:    CLI_COLUNAS,
  cc_cad: CC_CAD_COLUNAS,
  dep:    DEP_COLUNAS,
  tkt:    null, // definido depois no bloco Tickets
};

// Carregar todas as prefs de colunas
function cpCarregarTodas() {
  Object.entries(_CP_DEFS).forEach(([tela, defs]) => cpCarregar(tela, defs));
}

// ── helpers de geração de thead ──
function cpTheadNS()    { cpRenderThead('ns-thead-row',     NS_COLUNAS,     'ns');     }
function cpTheadVchr()  { cpRenderThead('vchr-thead-row',   VCHR_COLUNAS,   'vchr');   }
function cpTheadInteg() { cpRenderThead('integ-thead-row',  INTEG_COLUNAS,  'integ');  }
function cpTheadPagar() {
  const tr = document.getElementById('pagar-thead-row');
  if (!tr) return;
  const ativas = _cpAtivas['pagar'] || new Set();
  tr.innerHTML = PAGAR_COLUNAS.filter(c=>ativas.has(c.id)).map(c => {
    if (c.id === 'sel') return `<th style="width:36px"><input type="checkbox" id="pagar-chk-all" onchange="pagarBenSelecionarTodos(this.checked)" style="cursor:pointer;width:14px;height:14px"/></th>`;
    return `<th>${c.label}</th>`;
  }).join('');
}
function cpTheadHist()  { cpRenderThead('hist-thead-row',   HIST_COLUNAS,   'hist');   }
function cpTheadCli()   { cpRenderThead('cli-thead-row',    CLI_COLUNAS,    'cli');    }
function cpTheadCC()    { cpRenderThead('cc-cad-thead-row', CC_CAD_COLUNAS, 'cc_cad'); }
function cpTheadDep()   { cpRenderThead('dep-thead-row',    DEP_COLUNAS,    'dep');    }

// ──────────────────────────────────────────────
// ── Colunas disponíveis na tabela de vagas ─────
const COLUNAS_DISPONIVEIS = [
  { id:'jira',           label:'Jira',            default:true,  render: v => `<a href="https://spxresolve.atlassian.net/browse/${v.jira||''}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:11px;font-weight:700;color:var(--accent);text-decoration:none;font-family:monospace" title="Abrir no Jira">${v.jira||'—'} ↗</a>` },
  { id:'consultor',      label:'Consultor',        default:true,  render: v => v.consultor||'—' },
  { id:'regional',       label:'Regional',         default:true,  render: v => regionalPill(v.regional) },
  { id:'colaborador',    label:'Colaborador',      default:true,  render: v => `<span class="text-truncate">${v.colaborador||'—'}</span>` },
  { id:'cargo',          label:'Cargo',            default:true,  render: v => v.cargo||'—' },
  { id:'local',          label:'Local',            default:true,  render: v => `<span class="text-truncate">${v.local||'—'}</span>` },
  { id:'statusUniforme', label:'Uniforme',         default:true,  render: v => suPill(v.statusUniforme) },
  { id:'statusVaga',     label:'Status Vaga',      default:true,  render: v => svPill(v.statusVaga) },
  { id:'transporte',     label:'Transporte',       default:true,  render: v => trPill(v.transporte) },
  { id:'matricula',      label:'Matrícula',        default:false, render: v => v.matricula||'—' },
  { id:'opsId',          label:'OPS ID',           default:false, render: v => v.opsId||'—' },
  { id:'codigoHub',      label:'Cód. Hub / CC',    default:true,  render: v => {
    const cc = CENTROS_CUSTO.find(c => c.cod === v.codigoHub);
    return cc?.descricao || v.codigoHub || '—';
  }},
  { id:'mes',            label:'Mês',              default:false, render: v => v.mes ? new Date(v.mes+'T00:00').toLocaleDateString('pt-BR',{month:'short',year:'numeric'}) : '—' },
  { id:'modalidade',     label:'Modalidade',       default:false, render: v => v.modalidade||'—' },
  { id:'turno',          label:'Turno',            default:false, render: v => v.turno||'—' },
  { id:'horario',        label:'Horário',          default:false, render: v => v.horario||'—' },
  { id:'escala',         label:'Escala',           default:false, render: v => v.escala||'—' },
  { id:'cpf',            label:'CPF',              default:false, render: v => v.cpf||'—' },
  { id:'email',          label:'E-mail',           default:false, render: v => v.email||'—' },
  { id:'telefone',       label:'Telefone',         default:false, render: v => v.telefone||'—' },
  { id:'genero',         label:'Gênero',           default:false, render: v => v.genero||'—' },
  { id:'etapa',          label:'Etapa',            default:false, render: v => v.etapa||'—' },
  { id:'recebimento',    label:'Recebimento',      default:false, render: v => v.recebimento ? new Date(v.recebimento+'T00:00').toLocaleDateString('pt-BR') : '—' },
  { id:'dataAdmSolicitada', label:'Adm. Solicitada', default:false, render: v => v.dataAdmSolicitada ? new Date(v.dataAdmSolicitada+'T00:00').toLocaleDateString('pt-BR') : '—' },
  { id:'dataAdmRealizada',  label:'Adm. Realizada',  default:false, render: v => v.dataAdmRealizada  ? new Date(v.dataAdmRealizada +'T00:00').toLocaleDateString('pt-BR') : '—' },
  { id:'salario',        label:'Salário',          default:false, render: v => v.salario||'—' },
  { id:'refeicao',       label:'Refeição',         default:false, render: v => v.refeicao||'—' },
  { id:'cestaBasica',    label:'Cesta Básica',     default:false, render: v => v.cestaBasica||'—' },
  { id:'colete',         label:'Colete',           default:false, render: v => v.colete||'—' },
  { id:'bota',           label:'Bota',             default:false, render: v => v.bota||'—' },
  { id:'luva',           label:'Luva',             default:false, render: v => v.luva||'—' },
  { id:'unidadeWecan',   label:'Unidade WeCan',    default:false, render: v => v.unidadeWecan||'—' },
  { id:'tipoVaga',       label:'Tipo de Vaga',     default:false, render: v => v.tipoVaga||'—' },
  { id:'noShow',         label:'No Show',          default:false, render: v => v.noShow ? `<span class="pill noshow">Sim</span>` : '—' },
  { id:'indicacao',      label:'Indicação Shopee', default:false, render: v => v.indicacao||'—' },
];

const COL_PREF_KEY = 'wecan_colunas_v1';
let _colunasAtivas = new Set();

function carregarPreferenciaColunas() {
  try {
    const raw = localStorage.getItem(COL_PREF_KEY);
    if (raw) {
      _colunasAtivas = new Set(JSON.parse(raw));
    } else {
      _colunasAtivas = new Set(COLUNAS_DISPONIVEIS.filter(c=>c.default).map(c=>c.id));
    }
  } catch(e) {
    _colunasAtivas = new Set(COLUNAS_DISPONIVEIS.filter(c=>c.default).map(c=>c.id));
  }
}

function salvarPreferenciaColunas() {
  try { localStorage.setItem(COL_PREF_KEY, JSON.stringify([..._colunasAtivas])); } catch(e) {}
}

// helpers de pill usados pelas colunas
function suPill(s) {
  if (!s) return '<span class="pill muted">—</span>';
  const u = s.toUpperCase();
  if (u.includes('ENVIADO')||u.includes('SAÍDA')||u.includes('SAIDA')) return `<span class="pill uniforme-enviado">${s}</span>`;
  return `<span class="pill uniforme-pendente">${s}</span>`;
}

// ── Agrupa status real da vaga em grupo lógico ──────────────
// Pendente   → 'Pendente'
// Em Andamento (Atrasada / No Prazo) → 'andamento'
// Finalizada (Antecipada / Atrasada / No Prazo) → 'concluida'
// Cancelada  → 'cancelada'
function statusVagaGrupo(s) {
  if (!s) return 'pendente';
  const u = s.toLowerCase();
  if (u === 'pendente') return 'pendente';
  if (u.startsWith('em andamento')) return 'andamento';
  if (u.startsWith('finalizada')) return 'concluida';
  if (u.includes('cancelada') || u.includes('cancelado')) return 'cancelada';
  return 'pendente'; // status desconhecido → pendente
}

function svPill(s) {
  if (!s) return '<span class="pill muted">—</span>';
  const g = statusVagaGrupo(s);
  if (g === 'pendente') {
    const cls = s.toLowerCase() === 'pendente' ? 'vaga-pendente' : 'vaga-atrasada';
    return `<span class="pill ${cls}">${s||'Pendente'}</span>`;
  }
  if (g === 'andamento') {
    if (s.includes('No Prazo'))   return `<span class="pill vaga-noprazo">${s}</span>`;
    if (s.includes('Atrasada'))   return `<span class="pill vaga-atrasada">${s}</span>`;
    return `<span class="pill vaga-noprazo">${s}</span>`;
  }
  if (g === 'concluida') {
    if (s.includes('Antecipada')) return `<span class="pill vaga-antecipada">${s}</span>`;
    if (s.includes('Atrasada'))   return `<span class="pill vaga-atrasada">${s}</span>`;
    return `<span class="pill vaga-noprazo">${s}</span>`;
  }
  if (g === 'cancelada') return `<span class="pill noshow">${s}</span>`;
  return `<span class="pill muted">${s}</span>`;
}
function trPill(s) {
  return s && s.toUpperCase().includes('VOUCHER') ? `<span class="pill voucher">${s}</span>` : (s||'—');
}

const VOUCHER_APP_URL = 'voucher.html';
const REGIONAIS       = ['SPI','RIO/ES','CO/N','SPM'];

// ── Permissões por grupo ──────────────────────────────────────
const PERMISSOES_GRUPOS = [
  { grupo: 'Seleção & Admissão', itens: [
    { id:'rs_dashboard',   nome:'Dashboard',         descricao:'Gráficos e KPIs do processo seletivo' },
    { id:'rs_vagas',       nome:'Vagas / Admissões', descricao:'Cadastro e acompanhamento de vagas' },
    { id:'rs_voucher',     nome:'Fila de Voucher',   descricao:'Autorização de vouchers na fila' },
    { id:'rs_indicacoes',  nome:'Indicações',        descricao:'Currículos enviados pelos líderes' },
    { id:'rs_noshow',      nome:'No Show',           descricao:'Controle de ausências' },
    { id:'rs_chamadas',    nome:'Chamadas',          descricao:'Ver ausências da chamada de integração e providenciar reposição' },
    { id:'rs_estoque_epi', nome:'Estoque de EPI',    descricao:'Colete, bota e luva por unidade', em_breve:true },
  ]},
  { grupo: 'Administração de Pessoal — Voucher Uber', itens: [
    { id:'adp_voucher_dashboard', nome:'Voucher — Dashboard',         descricao:'Visão geral do sistema de Voucher' },
    { id:'adp_voucher_controle',  nome:'Voucher — Controle',          descricao:'Lista de colaboradores com voucher' },
    { id:'adp_voucher_inativar',  nome:'Voucher — Inativar',          descricao:'Inativar colaborador desligado' },
    { id:'adp_voucher_exportar',  nome:'Voucher — Exportar Planilha', descricao:'Gera arquivo para a empresa de voucher' },
    { id:'adp_voucher_historico', nome:'Voucher — Histórico',         descricao:'Registro de inativações e reativações' },
  ]},
  { grupo: 'Administração de Pessoal — Benefícios', itens: [
    { id:'adp_beneficios',          nome:'Gestão de Benefícios',   descricao:'Confirmação de presença — vê apenas os próprios CCs' },
    { id:'adp_beneficios_pagar',    nome:'Pagar Benefícios',       descricao:'Vê todos os CCs e programa datas de pagamento' },
    { id:'adp_beneficios_historico',nome:'Benefícios — Histórico', descricao:'Acesso ao histórico completo de PAGOS e NO SHOW de todos os CCs' },
  ]},
  { grupo: 'Administração de Pessoal — Tickets Shopee', itens: [
    { id:'adp_tickets_deslig',  nome:'Tickets de Desligamento', descricao:'Abertura e acompanhamento de tickets de desligamento' },
    { id:'adp_tickets_movim',   nome:'Tickets de Movimentação', descricao:'Abertura e acompanhamento de tickets de movimentação' },
    { id:'adp_tickets_voucher', nome:'Tickets de Voucher Uber', descricao:'Abertura e acompanhamento de tickets de voucher' },
  ]},
  { grupo: 'Template — Colaboradores', itens: [
    { id:'adp_colabs_ver',   nome:'Ver Colaboradores',   descricao:'Consulta o Template Base de ativos e inativos' },
    { id:'adp_colabs_editar',nome:'Editar Colaboradores',descricao:'Pode editar dados diretamente na planilha via sistema' },
    { id:'adp_sync',         nome:'Sincronizar Template',descricao:'Exporta dados do banco para a planilha Google Sheets do cliente' },
    { id:'adp_rescisao',        nome:'Iniciar Desligamento',    descricao:'Pode abrir solicitação de rescisão a partir do Template' },
    { id:'adp_chamada',         nome:'Chamada de Integração',   descricao:'Fazer a chamada de presença dos colaboradores na integração online (popup)' },
    { id:'adp_onboarding',      nome:'Controle de Onboarding',  descricao:'Gerenciar a fila rotativa e a escala de quem apresenta a integração' },
    { id:'adp_gestao_lideres',  nome:'Gestão de Líderes',       descricao:'Cadastrar líderes e processar solicitações de advertência e suspensão' },
  ]},
  { grupo: 'Solicitações', itens: [
    { id:'adp_sol_ver',    nome:'Ver Solicitações',    descricao:'Consulta solicitações do Onsite' },
    { id:'adp_sol_gerir',  nome:'Gerir Solicitações',  descricao:'Atende e conclui solicitações (Analista/Gestor)' },
  ]},
  { grupo: 'Suporte', itens: [
    { id:'sup_configuracoes',   nome:'Configurações',      descricao:'Tema, foto de perfil e preferências' },
    { id:'sup_gestao_usuarios', nome:'Gestão de Usuários', descricao:'Criar e gerenciar acessos' },
  ]},
  { grupo: 'Cadastros', itens: [
    { id:'cad_clientes', nome:'Clientes',         descricao:'Cadastro de clientes' },
    { id:'cad_cc',       nome:'Centro de Custos', descricao:'Centros de custo por cliente' },
    { id:'cad_deptos',   nome:'Departamentos',    descricao:'Departamentos por cliente' },
  ]},
];
const SISTEMAS_DISPONIVEIS = PERMISSOES_GRUPOS.flatMap(g=>g.itens).filter(i=>!i.em_breve);

// ── helpers de acesso ─────────────────────────
function podeVerTudo()  { return session && ['gestor','master'].includes(session.perfil); }
function ehMaster()     { return session && session.perfil === 'master'; }
function podeAdmin()    { return ['master','gestor'].includes(session?.perfil); }
// temPermissao: Master tem tudo sempre. Gestor/Onsite dependem de session.permissoes.
// Fallback: se permissoes não veio na sessão (wc_login antigo), usa perfil como antes.
function temPermissao(id) {
  if (!session) return false;
  if (session.perfil === 'master') return true;
  const perms = session.permissoes;
  if (session.perfil === 'gestor') {
    if (!perms || !Object.keys(perms).some(k => perms[k] === true)) return true;
    return perms[id] === true;
  }
  if (session.perfil === 'lider') { window.location.href = 'lider.html'; return; }
  // Folha: acesso total a ADP, nunca vê RS nem gestão de usuários
  if (session.perfil === 'folha' && (id.startsWith('rs_') || id === 'sup_gestao_usuarios')) return false;
  if (session.perfil === 'folha' && id.startsWith('adp_')) return true;
  // Onsite: nunca vê permissões RS nem gestão de usuários
  if (session.perfil === 'onsite' && (id.startsWith('rs_') || id === 'sup_gestao_usuarios')) return false;
  // Consultor (equipe): nunca vê permissões ADP nem gestão de usuários
  if (session.perfil === 'equipe' && (id.startsWith('adp_') || id === 'sup_gestao_usuarios')) return false;
  if (perms) return perms[id] === true;
  return false;
}
function podeAutorizarVoucher() { return temPermissao('rs_voucher'); }
function vagasNoEscopo() {
  if (podeVerTudo()) return VAGAS;
  // Filtra por operações vinculadas ao usuário (Onsite) ou por e-mail/nome do consultor (Equipe)
  if (session.perfil === 'onsite' && session._operacoes?.length) {
    const ops = new Set(session._operacoes.map(o => (o.nome||'').toUpperCase()));
    return VAGAS.filter(v => ops.has((v.regional||'').toUpperCase()) || ops.has((v.local||'').toUpperCase()));
  }
  // Equipe: filtra pelo e-mail do consultor (campo consultor_email) ou pelo nome como fallback
  return VAGAS.filter(v => {
    if (v.consultor_email && session.email) {
      return v.consultor_email.toLowerCase() === session.email.toLowerCase();
    }
    return (v.consultor||'').toUpperCase() === (session.nome||'').toUpperCase();
  });
}
function consultoresConhecidos() {
  return [...new Set(VAGAS.map(v => v.consultor).filter(Boolean))].sort();
}
function escopoLabel() {
  return podeVerTudo()
    ? `Visualizando <b>todas as vagas</b> (perfil ${PERFIL_LABEL[session.perfil]?.toLowerCase()})`
    : `Visualizando apenas as <b>${vagasNoEscopo().length} vagas</b> sob sua responsabilidade`;
}

// ── visual helpers ─────────────────────────────
function regionalPill(r) {
  const u = (r||'').toUpperCase();
  const cls = u==='SPI'?'regional-sp':u==='RIO/ES'?'regional-rj':u.startsWith('CO')?'regional-co':'regional-spm';
  return `<span class="pill ${cls}">${r||'—'}</span>`;
}
function pillStatus(s) {
  const m = { pendente:'pill-pendente', recebido:'pill-recebido', concluido:'pill-concluido', rejeitado:'pill-rejeitado' };
  const l = { pendente:'Pendente', recebido:'Recebido', concluido:'Concluído', rejeitado:'Rejeitado' };
  return `<span class="pill ${m[s]||'muted'}">${l[s]||s}</span>`;
}

// ── TEMAS ──────────────────────────────────────
function aplicarTema(tema, salvar=true) {
  _TEMA_ATUAL = tema;
  document.body.classList.remove('tema-claro','tema-preto');
  if (tema === 'claro') document.body.classList.add('tema-claro');
  if (tema === 'preto') document.body.classList.add('tema-preto');
  document.querySelectorAll('.tema-opt').forEach(el => el.classList.toggle('active', el.dataset.tema === tema));
  if (salvar) {
    try { localStorage.setItem('wecan_tema', tema); } catch(e) {}
    rpc('wc_salvar_config', { p_chave:'tema', p_valor:tema }).catch(()=>{});
  }
}
function carregarTema() {
  try {
    const t = localStorage.getItem('wecan_tema');
    if (t) aplicarTema(t, false);
  } catch(e) {}
}

// ── Carregar dados ────────────────────────────
async function carregarVagas() {
  try {
    const resp = await rpc('wc_listar_vagas', {});
    VAGAS = (resp.vagas || []).map(v => ({
      ...v, id:v.jira, codigoHub:v.codigo_hub, local:v.local_trabalho,
      statusUniforme:v.status_uniforme, opsId:v.ops_id,
      dataAdmSolicitada:v.data_adm_solicitada, dataReprog:v.data_reprog,
      novaDataETO:v.nova_data_eto, dataAdmRealizada:v.data_adm_realizada,
      statusVaga:v.status_vaga, tipoVaga:v.tipo_vaga, departamentoGI:v.departamento_gi,
      cestaBasica:v.cesta_basica, gestorTurno:v.gestor_turno,
      contatoGestorTurno:v.contato_gestor_turno, unidadeWecan:v.unidade_wecan,
      email:v.email_colaborador, tipoProcesso:v.tipo_processo,
      noShow:v.no_show, motivoAtraso:v.motivo_atraso,
      tipoProcessoDesistente:v.tipo_processo_desistente,
      filaVoucherStatus:null, filaVoucherAutorizadoPor:'', filaVoucherMotivo:'',
    }));
  } catch(e) { VAGAS = []; }
}

async function carregarFilaVoucher() {
  if (!podeAutorizarVoucher()) return;
  try {
    const resp = await rpc('wc_listar_fila', {});
    const fila = resp.fila || [];

    // Guardar fila bruta para renderQueue usar diretamente
    window._filaItens = fila;
    window._filaHistorico = resp.historico || [];

    // Também popula filaVoucherStatus nas vagas em memória (para o badge)
    const mapa = {};
    fila.forEach(f => { if (!mapa[f.vaga_jira]) mapa[f.vaga_jira] = f; });
    VAGAS.forEach(v => {
      const f = mapa[v.jira];
      if (f) {
        v.filaVoucherStatus      = f.status;
        v.filaVoucherAutorizadoPor = f.autorizado_por||'';
        v.filaVoucherMotivo      = f.motivo_rejeicao||'';
      }
    });
  } catch(e) { /* sem permissão — ignora */ }
}

async function carregarOperacoes() {
  try {
    const r = await rpc('wc_listar_operacoes', {});
    OPERACOES = r.operacoes || [];
  } catch(e) {}
}

async function carregarUsuariosSistema() {
  try {
    const resp = await rpc('wc_listar_consultores', {});
    USUARIOS_SISTEMA = (resp.usuarios || [])
      .map(u => ({
        id:         u.id,
        nome:       u.nome,
        perfil:     u.perfil,
        email:      u.email || '',
        operacoes:  u.operacoes || []   // [{id, nome, regional}]
      }))
      .sort((a,b) => a.nome.localeCompare(b.nome));
  } catch(e) {
    USUARIOS_SISTEMA = [];
  }
}

async function carregarIndicacoes() {
  try {
    const r = await rpc('wc_listar_indicacoes', {});
    INDICACOES = r.indicacoes || [];
  } catch(e) { INDICACOES = []; }
}

async function atualizarDados() {
  toast('Atualizando dados…', 'info');
  try {
    await Promise.all([carregarVagas(), carregarFilaVoucher(), carregarIndicacoes(), carregarUsuariosSistema()]);
    popularFiltroConsultor();
    const ativa = document.querySelector('.page.active');
    if (ativa) navTo(ativa.id.replace('page-',''));
    toast('Dados atualizados!', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

// ── SESSÃO ────────────────────────────────────
async function iniciarSessao(conta) {
  session = conta;
  // Mapear operacoes (vem do wc_login após fix) para _operacoes usado pelos módulos
  if (session.operacoes?.length && !session._operacoes?.length) {
    session._operacoes = session.operacoes;
  }
  document.getElementById('sidebar').style.display = 'flex';
  document.getElementById('user-nome').textContent  = session.nome;
  document.getElementById('user-perfil').textContent = PERFIL_LABEL[session.perfil];
  // Mostrar link "Ir para Seleção" só para master
  const _linkSel = document.getElementById('link-ir-selecao');
  if (_linkSel) _linkSel.style.display = session.perfil === 'master' ? 'flex' : 'none';

  const initials = (session.nome||'?').split(' ').map(p=>p[0]).slice(0,2).join('');
  const avEl = document.getElementById('user-avatar');
  avEl.textContent = initials;
  const perfil = session.perfil; // 'equipe' | 'gestor' | 'onsite' | 'master'
  const ehOnsite  = perfil === 'onsite';
  const ehEquipe  = perfil === 'equipe';

  // ── Time de Seleção — o que cada perfil vê ──
  // Dashboard: Seleção → Gestor, Equipe, Master (NÃO Onsite)
  const el = id => document.getElementById(id);
  const show = (id, visivel) => { if (el(id)) el(id).style.display = visivel ? 'flex' : 'none'; };
  const showBlock = (id, visivel) => { if (el(id)) el(id).style.display = visivel ? 'block' : 'none'; };

  // ── Seleção & Admissão ──
  show('nav-dashboard',  temPermissao('rs_dashboard'));
  show('nav-vagas',      temPermissao('rs_vagas'));
  show('sb-btn-vagas',   temPermissao('rs_vagas'));
  show('nav-voucher',    temPermissao('rs_voucher'));
  show('nav-indicacoes', temPermissao('rs_indicacoes'));
  show('nav-noshow',     temPermissao('rs_noshow'));
  show('nav-chamadas',   temPermissao('rs_chamadas'));
  show('nav-epi',        temPermissao('rs_estoque_epi'));

  // Esconder seção inteira de S&A se não tiver nenhuma permissão RS
  const _algumRS = ['rs_dashboard','rs_vagas','rs_voucher','rs_indicacoes','rs_noshow','rs_chamadas','rs_estoque_epi'].some(i => temPermissao(i));
  const _secaoRS = document.getElementById('navgroup-selecao');
  if (_secaoRS) _secaoRS.style.display = _algumRS ? 'block' : 'none';
  showBlock('label-selecao', _algumRS);

  // ── Adm. de Pessoal — grupo pai ──
  const _algumVoucher = ['adp_voucher_dashboard','adp_voucher_controle','adp_voucher_inativar',
    'adp_voucher_exportar','adp_voucher_historico'].some(i => temPermissao(i));
  const _algumBen = temPermissao('adp_beneficios') || temPermissao('adp_beneficios_pagar');
  const _algumTicket = ['adp_tickets_deslig','adp_tickets_movim','adp_tickets_voucher'].some(i=>temPermissao(i));
  const _algumColabs  = temPermissao('adp_colabs_ver');
  const _algumRescisao  = temPermissao('adp_rescisao');
  const _algumChamada   = temPermissao('adp_chamada') || temPermissao('adp_onboarding');
  const _algumLideres   = temPermissao('adp_gestao_lideres');
  const _algumSol       = temPermissao('adp_sol_ver');
  const _algumADP = _algumVoucher || _algumBen || _algumTicket || _algumColabs || _algumRescisao || _algumChamada || _algumLideres || _algumSol;
  // Folha sempre vê o grupo ADP
  if (session?.perfil === 'folha') showBlock('navgroup-admpessoal', true);
  showBlock('navgroup-admpessoal', _algumADP);
  showBlock('navgroup-adp-colabs', _algumColabs);
  showBlock('navgroup-adp-rescisao', _algumRescisao);
  showBlock('navgroup-adp-chamada', _algumChamada);
  showBlock('navgroup-adp-lideres', _algumLideres);
  showBlock('navgroup-adp-sol', _algumSol);

  // Voucher Uber sub
  showBlock('navgroup-voucher-uber', _algumVoucher);
  show('nav-adp-dashboard', temPermissao('adp_voucher_dashboard'));
  const _algumFila = ['adp_voucher_controle','adp_voucher_inativar','adp_voucher_exportar','adp_voucher_historico'].some(i=>temPermissao(i));
  showBlock('navgroup-adp-fila', _algumFila);
  show('nav-adp-controle',  temPermissao('adp_voucher_controle'));
  show('nav-adp-inativar',  temPermissao('adp_voucher_inativar'));
  show('nav-adp-exportar',  temPermissao('adp_voucher_exportar'));
  show('nav-adp-historico', temPermissao('adp_voucher_historico'));


  // Benefícios sub
  showBlock('navgroup-adp-beneficios', _algumBen);
  show('nav-integracao',    temPermissao('adp_beneficios'));
  show('nav-pagar-ben',     temPermissao('adp_beneficios_pagar'));
  show('nav-ben-historico', temPermissao('adp_beneficios_historico') || podeVerTudo());
  // Tickets sub
  showBlock('navgroup-adp-tickets', _algumTicket);

  showBlock('navgroup-suporte-cadastros', temPermissao('cad_clientes')||temPermissao('cad_cc')||temPermissao('cad_deptos'));
  show('nav-suporte-usuarios', session.perfil === 'master' || temPermissao('sup_gestao_usuarios'));
  // botões de Cadastros (só aparecem depois que o _MAIN_HTML é reinserido, por isso via delegação)
  window._cadPodeCriar = podeVerTudo();
  document.getElementById('voucherapp-open-tab').href = VOUCHER_APP_URL;

  const main = document.getElementById('main');
  // Mostrar overlay de loading sem destruir o innerHTML do main
  const overlay = document.getElementById('loading-overlay');
  if (overlay) overlay.style.display = 'flex';
  main.style.display = 'block';
  try {
    // allSettled: mesmo que uma RPC falhe, as outras continuam e o sistema carrega
    await Promise.allSettled([
      carregarOperacoes(),
      carregarUsuariosSistema()
    ]);
  } catch(e) {
    if (overlay) overlay.style.display = 'none';
    main.innerHTML = `<div style="padding:60px;text-align:center;color:var(--danger)">Erro ao carregar.<br/><small>${e.message}</small></div>`;
    return;
  }
  if (overlay) overlay.style.display = 'none';
  carregarPreferenciaColunas();
  cpCarregarTodas();
  // Hookar salvamento automático de filtros em todas as telas
  Object.keys(FILTRO_CAMPOS).forEach(tela => _hookFiltroSave(tela));
  // Restaurar filtros salvos
  Object.keys(FILTRO_CAMPOS).forEach(tela => filtroCarregar(tela, FILTRO_CAMPOS[tela]));
  popularFiltroConsultor();
  popularFiltroCC();
  iniciarConfiguracoes();
  window._homeDefaultPage = 'home';
  navTo(window._homeDefaultPage || 'home');
}

async function initApp() {
  _MAIN_HTML = document.getElementById('main').innerHTML;
  carregarTema();
  restaurarSidebar();
  const s = carregarSessaoSalva();
  if (!s) { window.location.href = 'index.html'; return; }
  session = s;
  await iniciarSessao(s);
  // Carregar configurações globais do banco (URL do Apps Script etc.)
  await configCarregarGlobal();
  // Carregar Template automaticamente em segundo plano para Onsite/Folha
  if (temPermissao('adp_colabs_ver') && !COLABS_LOADED) {
    setTimeout(colabsCarregarBackground, 2500);
  }
  // Carregar colmeias de benefícios em segundo plano (para cálculo de prazo na home)
  if (temPermissao('adp_beneficios') && !INTEG_COLMEIAS?.length) {
    setTimeout(async () => {
      try {
        await integCarregarColmeias();
        if (document.getElementById('page-home')?.classList.contains('active')) renderHome();
      } catch(e) {}
    }, 2000);
  }
  // Iniciar verificação de notificações após login
  setTimeout(solIniciarPolling, 3000);
  // Exibir modal de boas-vindas com pendências
  if (temPermissao('adp_sol_ver') || temPermissao('adp_beneficios') || temPermissao('adp_rescisao')
      || temPermissao('adp_tickets_deslig') || temPermissao('adp_tickets_movim') || temPermissao('adp_tickets_voucher')
      || temPermissao('rs_voucher')) setTimeout(exibirBoasVindas, 2000);
}

async function logout() {
  rpc('wc_logout', {}).catch(()=>{});
  limparSessaoSalva();
  window.location.href = 'index.html';
}

// ── NAV ───────────────────────────────────────
function navTo(id) {
  fecharSidebarMobile();
  if (typeof fecharGaveta === 'function') fecharGaveta();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('nav a, .nav-suporte-item').forEach(a => a.classList.remove('active'));
  const page = document.getElementById('page-' + id);
  if (!page) return;
  page.classList.add('active');
  const link = document.querySelector(`[data-page="${id}"]`);
  if (link) link.classList.add('active');
  if (id==='home')             renderHome();
  if (id==='noshow')           nsCarregar();
  if (id==='chamadas')         chamadasCarregar();
  if (id==='onboarding-controle') onbCarregar();
  if (id==='lideres')             liderCarregar();
  if (id==='dashboard')        renderDashboard();
  if (id==='vagas')            renderVagas();
  if (id==='voucher') {
    // Recarrega fila sempre ao abrir — garante dados frescos
    carregarFilaVoucher().then(() => renderQueue());
    return;
  }
  if (id==='indicacoes')       renderIndicacoes();
  if (id==='usuarios')         renderUsuarios('tbody-usuarios');
  if (id==='suporte-usuarios') renderUsuarios('tbody-suporte-usuarios');
  if (id==='configuracoes')    { renderConfiguracoes(); colabsCarregarCfg(); }
  if (id==='cad-clientes')     carregarClientes();
  if (id==='cad-cc')           carregarCentrosCusto();
  if (id==='cad-deptos')       carregarDeptos();
  if (id==='tickets-todos')    tktCarregar('tickets-todos');
  if (id==='tickets-deslig')   tktCarregar('tickets-deslig');
  if (id==='tickets-movim')    tktCarregar('tickets-movim');
  if (id==='tickets-voucher')  tktCarregar('tickets-voucher');
  if (id==='sol-resumo')        solResumoCarregar();
  if (id==='colabs-ativos')    colabsCarregar('ativos');
  if (id==='colabs-inativos')  colabsCarregar('inativos');
  atualizarBadgeFila();
}
function toggleNavGroup(nome) { /* legado — mantido para compatibilidade */ try { document.getElementById('navgroup-'+nome).classList.toggle('collapsed'); } catch(e){} }

// ── Gaveta lateral estilo Jira ──────────────────────────────────────
const GAVETA_MENUS = {
  'vagas': {
    titulo: 'Vagas / Admissões',
    items: [
      { id:'nav-vagas',         label:'📂 Vagas Abertas',  page:'vagas' },
      { id:'nav-vagas-fechadas',label:'📁 Vagas Fechadas', page:'vagas-fechadas', disabled:true, soon:true },
    ]
  },
  'voucher-uber': {
    titulo: 'Voucher Uber',
    items: [
      { id:'nav-adp-dashboard', label:'📊 Dashboard',          page:'vchr-dashboard', perm:'adp_voucher_dashboard' },
      { id:'nav-adp-fila',      label:'⇄ Fila Voucher',        page:null, section:true },
      { label:'🔑 Pré Aprovados', disabled:true, soon:true },
      { id:'nav-adp-controle',  label:'☰ Controle do Voucher', page:'vchr-controle',  perm:'adp_voucher_controle' },
      { id:'nav-adp-inativar',  label:'⊘ Inativar',            page:'vchr-inativar',  perm:'adp_voucher_inativar' },
      { id:'nav-adp-exportar',  label:'↓ Exportar Planilha',   page:'vchr-exportar',  perm:'adp_voucher_exportar' },
      { id:'nav-adp-historico', label:'🕐 Histórico',          page:'vchr-historico', perm:'adp_voucher_historico' },
    ]
  },
  'beneficios': {
    titulo: 'Benefícios',
    items: [
      { id:'nav-integracao',    label:'✅ Gestão de Benefícios', page:'integracao',       perm:'adp_beneficios' },
      { id:'nav-pagar-ben',     label:'💰 Pagar Benefícios',     page:'pagar-beneficios', perm:'adp_beneficios_pagar' },
      { label:'📊 Dashboard',   disabled:true, soon:true },
      { id:'nav-ben-historico', label:'🕐 Histórico',            page:'ben-historico',    perm:'adp_beneficios_historico' },
    ]
  },
  'chamada': {
    titulo: 'Chamada de Integração',
    items: [
      { label:'🙋 Fazer Chamada',          action:'chamadaAbrirPainel()', perm:'adp_chamada' },
      { label:'📅 Controle de Onboarding', page:'onboarding-controle',    perm:'adp_onboarding' },
    ]
  },
  'lideres': {
    titulo: 'Líderes',
    items: [
      { label:'📋 Solicitações', page:'lideres',             badge:'nav-lideres-count' },
      { label:'+ Cadastrar Líder', action:'liderCadastrarLider()' },
    ]
  },
  'tickets': {
    titulo: 'Tickets Shopee',
    items: [
      { label:'📊 Todos',          page:'tickets-todos',    perm:'adp_tickets_deslig' },
      { label:'🔴 Desligamento',   page:'tickets-deslig',   perm:'adp_tickets_deslig' },
      { label:'🔄 Movimentação',   page:'tickets-movim',    perm:'adp_tickets_movim'  },
      { label:'🚗 Voucher BPO',    page:'tickets-voucher',  perm:'adp_tickets_voucher'},
    ]
  },
  'colaboradores': {
    titulo: '👥 Colaboradores',
    items: [
      { label:'✅ Ativos',   page:'colabs-ativos',   perm:'adp_colabs_ver' },
      { label:'⛔ Inativos', page:'colabs-inativos',  perm:'adp_colabs_ver' },
    ]
  },
  'cadastros': {
    titulo: 'Cadastros',
    items: [
      { label:'🏭 Clientes',        page:'cad-clientes', perm:'cad_clientes' },
      { label:'🏢 Centro de Custo', page:'cad-cc',       perm:'cad_cc' },
      { label:'🗂️ Departamentos',  page:'cad-deptos',   perm:'cad_deptos' },
    ]
  },
};

let _gavetaAtual = null;

function abrirGaveta(key, evt) {
  const menu = GAVETA_MENUS[key];
  if (!menu) return;

  if (_gavetaAtual === key) { fecharGaveta(); return; }
  _gavetaAtual = key;

  document.querySelectorAll('.sb-has-sub').forEach(el => el.classList.remove('gaveta-open'));
  const btn = document.getElementById('sb-btn-' + key);
  if (btn) btn.classList.add('gaveta-open');

  document.getElementById('gaveta-titulo').textContent = menu.titulo;

  const container = document.getElementById('gaveta-items');
  const activePages = [...document.querySelectorAll('[data-page].active')].map(el => el.dataset.page);
  const isMasterGestor = session && (session.perfil === 'master' || session.perfil === 'gestor' || session.perfil === 'gestor_adm' || session.perfil === 'gestor_rs');

  container.innerHTML = menu.items.map(item => {
    // Seção separadora
    if (item.section) return `<div class="gav-section">${item.label}</div>`;

    // Verificar permissão — Master/Gestor vê tudo; outros precisam da perm
    if (item.perm && !isMasterGestor && !temPermissao(item.perm)) return '';

    const isActive  = item.page && activePages.includes(item.page);
    const isDisabled = item.disabled;
    const soon = item.soon ? ' <small style="font-size:9px;opacity:.6">(em breve)</small>' : '';
    const onclick = item.action ? `onclick="fecharGaveta();${item.action}"` : ((!isDisabled && item.page) ? `onclick="navTo('${item.page}')"` : '');
    const cls   = isActive ? 'active' : '';
    const style = isDisabled ? 'opacity:.45;cursor:default' : '';
    const badgeEl = item.badge ? `<span class="count-badge alert" id="${item.badge}" style="display:none">0</span>` : '';
    return `<a class="${cls}" ${onclick} style="${style}" data-page="${item.page||''}">${item.label}${soon}${badgeEl}</a>`;
  }).join('');

  const gaveta = document.getElementById('gaveta');
  const sbCollapsed = document.body.classList.contains('sb-collapsed');
  gaveta.style.left = (sbCollapsed ? 48 : 200) + 'px';
  // Mostrar invisível para medir altura real
  gaveta.style.visibility = 'hidden';
  gaveta.style.display = 'flex';
  if (evt) {
    const clickedEl = evt.currentTarget || evt.target;
    const rect = clickedEl.getBoundingClientRect();
    const gavetaH = gaveta.offsetHeight;
    const top = Math.min(rect.top, window.innerHeight - gavetaH - 10);
    gaveta.style.top = Math.max(10, top) + 'px';
  }
  gaveta.style.visibility = 'visible';
  document.getElementById('gaveta-overlay').style.display = 'block';
}

function fecharGaveta() {
  document.getElementById('gaveta').style.display = 'none';
  document.getElementById('gaveta-overlay').style.display = 'none';
  document.querySelectorAll('.sb-has-sub').forEach(el => el.classList.remove('gaveta-open'));
  _gavetaAtual = null;
}


// Voucher agora é integrado nativamente — sem redirect
function irParaVoucher() {}
function abrirVoucherEm(p) { navTo("vchr-"+p); }
function carregarVoucherFrame() {}

async function popularFiltroCC() {
  const sel = document.getElementById('filtro-cc');
  if (!sel) return;
  // Garantir que CCs estão carregados
  if (!CENTROS_CUSTO.length) await carregarCentrosCusto();
  const codsNasVagas = [...new Set(VAGAS.map(v => v.codigoHub).filter(Boolean))];
  const itens = codsNasVagas.map(cod => {
    const cc = CENTROS_CUSTO.find(c => c.cod === cod);
    // Prioridade: descricao > cod (nunca mostrar só número)
    const label = cc?.descricao ? `${cc.descricao}` : cod;
    return { cod, label };
  }).sort((a,b) => a.label.localeCompare(b.label));
  sel.innerHTML = '<option value="">Todos os CCs</option>' +
    itens.map(c => `<option value="${c.cod}">${c.label}</option>`).join('');
}

function popularFiltroConsultor() {
  const sel = document.getElementById('filtro-consultor');
  if (!sel) return;
  // Somente perfil equipe (Consultor)
  const consultores = USUARIOS_SISTEMA.filter(u => u.perfil === 'equipe');
  const lista = podeVerTudo()
    ? (consultores.length ? consultores.map(u=>u.nome) : consultoresConhecidos())
    : [session.nome];
  sel.innerHTML = '<option value="">Todos os consultores</option>' + lista.map(c=>`<option>${c}</option>`).join('');
  const wrap = document.getElementById('filtro-consultor-wrap');
  if (wrap) wrap.style.display = podeVerTudo() ? 'flex' : 'none';
}

function limparBusca() {
  const inp = document.getElementById('busca-vaga');
  if (inp) { inp.value = ''; renderVagas(); }
}

function limparFiltros() {
  ['filtro-regional','filtro-statusvaga','filtro-consultor','filtro-cc'].forEach(id => {
    const el = document.getElementById(id); if (el) el.selectedIndex = 0;
  });
  limparBusca();
}

function atualizarIndicadorFiltros() {
  const busca    = document.getElementById('busca-vaga')?.value || '';
  const regional = document.getElementById('filtro-regional')?.value || '';
  const status   = document.getElementById('filtro-statusvaga')?.value || '';
  const cons     = document.getElementById('filtro-consultor')?.value || '';
  const cc       = document.getElementById('filtro-cc')?.value || '';
  const ativo    = busca || regional || status || cons || cc;
  const btnLimpar = document.getElementById('btn-limpar-filtros');
  if (btnLimpar) btnLimpar.style.display = ativo ? 'block' : 'none';
  const btnClear = document.getElementById('btn-clear-busca');
  if (btnClear) btnClear.style.display = busca ? 'flex' : 'none';
  document.querySelectorAll('.vt-filter-group').forEach(g => {
    const sel = g.querySelector('select');
    g.style.borderColor = sel?.value ? 'var(--accent)' : '';
    g.style.background  = sel?.value ? 'rgba(99,204,176,.08)' : '';
  });
}

// Retorna o e-mail do usuário pelo nome (para amarrar vaga ao e-mail ao salvar)
function emailPorNome(nome) {
  const u = USUARIOS_SISTEMA.find(u => u.nome === nome);
  return u?.email || '';
}

function atualizarBadgeFila() {
  const n = VAGAS.filter(v=>v.filaVoucherStatus==='pendente').length;
  const el = document.getElementById('nav-voucher-count'); if (el) el.textContent=n;
  const ni = INDICACOES.filter(i=>i.status==='pendente').length;
  const eli = document.getElementById('nav-ind-count');
  if (eli) { eli.textContent=ni; eli.style.display=ni>0?'inline-flex':'none'; }
}

// ── HOME (estilo G-Click) ─────────────────────
async function renderHome() {
  const h = new Date().getHours();
  const saud = h<12?'Bom dia':h<18?'Boa tarde':'Boa noite';
  const nome1 = session.nome.split(' ')[0];
  const greet = document.getElementById('home-saudacao');
  const sub   = document.getElementById('home-subtitulo');
  const hora  = document.getElementById('home-hora');
  if (greet) greet.textContent = `${saud}, ${nome1}! 👋`;
  if (hora)  hora.textContent  = new Date().toLocaleDateString('pt-BR',{weekday:'long',day:'numeric',month:'long'});

  // Chips de operações
  const chipsEl = document.getElementById('home-ops-chips');
  if (chipsEl) {
    if (podeVerTudo()) chipsEl.innerHTML = '<span class="ops-chip">🌐 Todas as operações</span>';
    else if (session._operacoes?.length)
      chipsEl.innerHTML = session._operacoes.map(o=>`<span class="ops-chip">${o.nome}</span>`).join('');
  }

  // Buscar contadores
  let cnt = {};
  try {
    const r = await rpc('wc_home_resumo', {});
    cnt = r.contadores || {};
    if (r.operacoes) {
      session._operacoes = r.operacoes;
      if (chipsEl && !podeVerTudo())
        chipsEl.innerHTML = r.operacoes.map(o=>`<span class="ops-chip">${o.nome}</span>`).join('');
    }
  } catch(e) {
    // wc_home_resumo falhou (ex: coluna errada no banco) — fallback local
    console.warn('wc_home_resumo erro:', e.message);
    cnt = {
      vagas_abertas:    vagasNoEscopo().filter(v=>statusVagaGrupo(v.statusVaga)==='pendente').length,
      vagas_andamento:  vagasNoEscopo().filter(v=>statusVagaGrupo(v.statusVaga)==='andamento').length,
      vagas_fechadas:   vagasNoEscopo().filter(v=>statusVagaGrupo(v.statusVaga)==='concluida').length,
      vagas_canceladas: vagasNoEscopo().filter(v=>statusVagaGrupo(v.statusVaga)==='cancelada').length,
      voucher_pendente: VAGAS.filter(v=>v.filaVoucherStatus==='pendente').length,
      indicacoes_pendentes: INDICACOES.filter(i=>i.status==='pendente').length,
    };
    // Tentar buscar operações separadamente como fallback
    if (!session._operacoes?.length) {
      try {
        const ro = await rpc('wc_listar_operacoes', {});
        // wc_listar_operacoes retorna todas as operações — filtrar pelas do usuário via wc_salvar_usuario não é viável aqui
        // Mas session já tem operacoes vindas do wc_login se wc_salvar_usuario as salvou
        // Nada a fazer — o filtro de tela usará os dados que vierem
      } catch(_) {}
    }
  }

  if (sub) sub.textContent = podeVerTudo()
    ? 'Resumo geral de toda a equipe'
    : 'Suas tarefas e pendências de hoje';

  const el = document.getElementById('home-painel-conteudo');
  if (!el) return;

  if (podeVerTudo()) {
    // ── PAINEL GESTOR / MASTER ──
    // Verificar se tem permissões ADP para mostrar bloco correspondente
    const temADP = ['adp_beneficios','adp_voucher_dashboard','adp_voucher_controle',
      'adp_voucher_inativar','adp_voucher_exportar','adp_voucher_historico'].some(p => temPermissao(p));
    const temRS  = ['rs_dashboard','rs_vagas','rs_voucher','rs_indicacoes'].some(p => temPermissao(p));

    el.innerHTML = `
      <!-- S&A — só se tiver permissão RS -->
      ${temRS ? `
      <div style="margin-bottom:28px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">📋 Seleção &amp; Admissão</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
          ${homePainelCard('▤','Tarefas Pendentes',cnt.vagas_abertas??0,'Vagas abertas aguardando','#f59e0b','vagas')}
          ${homePainelCard('⇄','Em Andamento',cnt.vagas_andamento??0,'Processos ativos','#63ccb0','vagas')}
          ${homePainelCard('✓','Concluídas',cnt.vagas_fechadas??0,'Vagas encerradas','#6b7280','vagas')}
          ${temPermissao('rs_voucher') ? homePainelCard('⊘','Fila de Voucher',cnt.voucher_pendente??0,'Aguardando aprovação','#4f7cff','voucher') : ''}
          ${temPermissao('rs_indicacoes') ? homePainelCard('📋','Indicações',cnt.indicacoes_pendentes??0,'Pendentes de análise','#a855f7','indicacoes') : ''}
        </div>
      </div>` : ''}
      <!-- Adm Pessoal — só se tiver permissão ADP -->
      ${temADP ? `
      <div style="margin-bottom:28px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">🏢 Administração de Pessoal</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
          ${temPermissao('adp_beneficios') ? homePainelCard('🐝','Benefícios Pendentes',cnt.integ_pendentes??0,'Confirmações em aberto','#f59e0b','integracao') : ''}
          ${temPermissao('adp_beneficios') ? homePainelCard('🐝','Integrações Abertas',cnt.integ_abertas??0,'Colmeias sem fechar','#63ccb0','integracao') : ''}
          ${temPermissao('adp_voucher_controle') ? homePainelCard('🎟️','Vouchers Ativos',cnt.voucher_ativos??0,'Colaboradores com voucher','#63ccb0','vchr-controle') : ''}
          ${temPermissao('adp_voucher_inativar') ? homePainelCard('⊘','Inativos',cnt.voucher_inativos??0,'Desligados no sistema','#ef4444','vchr-controle') : ''}
        </div>
      </div>` : ''}
      <!-- Recentes -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">
        <div class="home-section">
          <h3>▤ Vagas Recentes <a onclick="navTo('vagas')">Ver todas →</a></h3>
          <div id="home-vagas-recentes"><div style="color:var(--muted);font-size:12.5px;padding:8px 0">Carregando…</div></div>
        </div>
        <div class="home-section">
          <h3>📋 Indicações Recentes <a onclick="navTo('indicacoes')">Ver todas →</a></h3>
          <div id="home-ind-recentes"><div style="color:var(--muted);font-size:12.5px;padding:8px 0">Carregando…</div></div>
        </div>
      </div>`;
  } else if (session.perfil === 'onsite' || session.perfil === 'folha') {
    // ── PAINEL ONSITE ──
    // Contar ativos/inativos/afastados do Template (filtrando pelo escopo do onsite)
    const colabsEscopo = colabsFiltrarEscopo(COLABS_ATIVOS);
    const cntAtivos    = colabsEscopo.filter(r => (r.status_colaborador||'').toLowerCase() === 'ativo').length;
    const cntAfastados = colabsEscopo.filter(r => (r.status_colaborador||'').toLowerCase().includes('afastado')).length;
    const colabsInEscopo = colabsFiltrarEscopo(COLABS_INATIVOS);
    const cntInativos  = colabsInEscopo.length;
    const temTemplate  = COLABS_ATIVOS.length > 0;

    // Calcular pior status de prazo dos benefícios pendentes do Onsite
    const piorPrazoBen = INTEG_COLMEIAS?.length
      ? integPiorStatusPrazo(integFiltrarPorOnsite(INTEG_COLMEIAS))
      : null;
    const corBenCard = piorPrazoBen && ['atrasado','vence_hoje'].includes(piorPrazoBen.status) ? '#ef4444'
      : piorPrazoBen && piorPrazoBen.status === 'vence_amanha' ? '#f59e0b'
      : '#f59e0b';
    const subBenCard = piorPrazoBen && piorPrazoBen.status !== 'sem_prazo' && piorPrazoBen.status !== 'ok'
      ? `${piorPrazoBen.ico} ${piorPrazoBen.label}` : 'Confirmações aguardando';

    el.innerHTML = `
      <div style="margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">🏢 Administração de Pessoal</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
          ${homePainelCard('🐝','Benefícios Pendentes',cnt.integ_pendentes??0,subBenCard,corBenCard,'integracao')}
          ${homePainelCard('⊘','Inativar Colaborador','→','Registrar desligamento','#ef4444','vchr-inativar')}
          ${homePainelCard('🎟️','Meus Vouchers',cnt.voucher_ativos??0,'Ativos no meu depto','#63ccb0','vchr-controle')}
        </div>
      </div>
      ${temPermissao('adp_colabs_ver') ? `
      <div style="margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">👥 Template — Meu HUB</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
          ${homePainelCard('✅','Ativos', temTemplate ? cntAtivos : '—', 'Colaboradores ativos','#22c55e','colabs-ativos')}
          ${homePainelCard('🟡','Afastados', temTemplate ? cntAfastados : '—', 'Em afastamento','#f59e0b','colabs-ativos')}
          ${homePainelCard('⛔','Inativos', temTemplate ? cntInativos : '—', 'Desligados','#ef4444','colabs-inativos')}
        </div>
        ${!temTemplate ? `<p style="font-size:11px;color:var(--muted);margin-top:8px">💡 Abra <b>Template → Ativos</b> para carregar os dados.</p>` : ''}
      </div>` : ''}`;
  } else {
    // ── PAINEL CONSULTOR (equipe) ──
    el.innerHTML = `
      <div style="margin-bottom:24px">
        <div style="font-size:11px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:12px">📋 Minhas Tarefas — Seleção &amp; Admissão</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px">
          ${homePainelCard('▤','Pendentes',cnt.vagas_abertas??0,'Vagas abertas','#f59e0b','vagas')}
          ${homePainelCard('⇄','Em Andamento',cnt.vagas_andamento??0,'Processos ativos','#63ccb0','vagas')}
          ${homePainelCard('✓','Concluídas',cnt.vagas_fechadas??0,'Vagas encerradas','#6b7280','vagas')}
          ${homePainelCard('📋','Indicações',cnt.indicacoes_pendentes??0,'Pendentes de análise','#a855f7','indicacoes')}
        </div>
      </div>
      <div class="home-section">
        <h3>▤ Vagas Recentes <a onclick="navTo('vagas')">Ver todas →</a></h3>
        <div id="home-vagas-recentes"><div style="color:var(--muted);font-size:12.5px;padding:8px 0">Carregando…</div></div>
      </div>`;
  }

  // Carregar vagas recentes se o elemento existir
  renderHomeVagasRecentes();
  renderHomeIndicacoesRecentes();
}

function homePainelCard(icon, label, value, sub, color, page) {
  const clickable = page ? `onclick="navTo('${page}')" style="cursor:pointer"` : '';
  const numStr = typeof value === 'number'
    ? `<div style="font-size:28px;font-weight:800;color:${color};margin:6px 0">${value}</div>`
    : `<div style="font-size:22px;font-weight:800;color:${color};margin:6px 0">${value}</div>`;
  return `<div class="stat-card" ${clickable}
    onmouseover="if(this.onclick)this.style.borderColor='${color}'"
    onmouseout="this.style.borderColor=''">
    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px">
      <span style="font-size:16px">${icon}</span>
      <span style="font-size:10.5px;color:var(--muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px">${label}</span>
    </div>
    ${numStr}
    <div style="font-size:11px;color:var(--muted)">${sub}</div>
  </div>`;
}

function renderHomeVagasRecentes() {
  const el = document.getElementById('home-vagas-recentes'); if (!el) return;
  const recentes = vagasNoEscopo().slice(0,5);
  if (!recentes.length) { el.innerHTML='<div style="color:var(--muted);font-size:12.5px">Nenhuma vaga recente.</div>'; return; }
  el.innerHTML = recentes.map(v=>`
    <div class="activity-row" onclick="abrirModalVaga('${(v.jira||'').replace(/'/g,"\\'")}')">
      <div class="ar-icon">▤</div>
      <div class="ar-content">
        <strong>${v.jira||'—'}</strong>
        <span>${v.nomeConsultor||''} · ${v.operacaoNome||''}</span>
      </div>
      <span class="pill ${v.statusVaga?.includes('Prazo')?'vaga-noprazo':'vaga-atrasada'}" style="font-size:10px">${v.statusVaga||'—'}</span>
    </div>`).join('');
}

function renderHomeIndicacoesRecentes() {
  const el = document.getElementById('home-ind-recentes'); if (!el) return;
  const rec = INDICACOES.filter(i=>i.status==='pendente').slice(0,5);
  if (!rec.length) { el.innerHTML='<div style="color:var(--muted);font-size:12.5px">Nenhuma indicação pendente.</div>'; return; }
  el.innerHTML = rec.map(i=>`
    <div class="activity-row">
      <div class="ar-icon">📋</div>
      <div class="ar-content">
        <strong>${i.nome_candidato||'—'}</strong>
        <span>${i.nome_lider||''} · ${i.operacao_nome||''}</span>
      </div>
      <span class="pill pill-muted" style="font-size:10px">Pendente</span>
    </div>`).join('');
}

// ── INDICAÇÕES ────────────────────────────────
function renderIndicacoes() {
  const busca  = (document.getElementById('busca-ind')?.value||'').toLowerCase();
  const filtro = document.getElementById('filtro-ind-status')?.value||'';
  let lista = [...INDICACOES];
  if (busca)  lista = lista.filter(i => [i.nome_candidato,i.nome_lider,i.operacao,i.cargo_indicado].some(f=>(f||'').toLowerCase().includes(busca)));
  if (filtro) lista = lista.filter(i => i.status===filtro);
  const el = document.getElementById('lista-indicacoes');
  if (!el) return;
  if (!lista.length) {
    el.innerHTML=`<div class="empty-state"><div class="ico">📭</div>${busca||filtro?'Nenhuma indicação encontrada com esse filtro':'Nenhuma indicação no seu escopo ainda'}</div>`;
    return;
  }
  el.innerHTML = lista.map(i => `
    <div class="queue-card">
      <div class="qc-main">
        <strong>${i.nome_candidato||'—'}</strong>
        <span>${i.nome_lider||'—'} · ${i.operacao||'—'} · ${i.cargo_indicado||'—'}</span>
        ${i.motivo ? `<div style="font-size:11.5px;color:var(--muted);margin-top:4px;font-style:italic">"${i.motivo}"</div>` : ''}
      </div>
      ${pillStatus(i.status)}
      <div class="qc-actions">
        ${i.anexo_url ? `<a href="${i.anexo_url}" target="_blank" class="btn btn-ghost btn-sm">📎 Currículo</a>` : ''}
        <button class="btn btn-primary btn-sm" onclick='abrirModalIndicacao(${JSON.stringify(i)})'>Atualizar</button>
      </div>
    </div>`).join('');
}

function abrirModalIndicacao(i) {
  document.getElementById('ind-id').value = i.id;
  document.getElementById('ind-modal-sub').textContent = `${i.nome_candidato} — indicado por ${i.nome_lider}`;
  document.getElementById('ind-status').value  = i.status || 'pendente';
  document.getElementById('ind-motivo').value  = i.motivo || '';
  abrirModal('modal-indicacao');
}

async function salvarIndicacao() {
  const btn    = document.getElementById('btn-salvar-ind');
  const id     = document.getElementById('ind-id').value;
  const status = document.getElementById('ind-status').value;
  const motivo = document.getElementById('ind-motivo').value.trim();
  btn.disabled=true; btn.textContent='Salvando…';
  try {
    await rpc('wc_atualizar_indicacao', { p_id:id, p_status:status, p_motivo:motivo });
    const idx = INDICACOES.findIndex(x => x.id===id);
    if (idx>=0) { INDICACOES[idx].status=status; INDICACOES[idx].motivo=motivo; }
    fecharModal('modal-indicacao');
    renderIndicacoes();
    atualizarBadgeFila();
    toast('Indicação atualizada!', 'success');
  } catch(e) { toast(e.message, 'error'); }
  finally { btn.disabled=false; btn.textContent='Salvar'; }
}
let chartRegional=null, chartStatus=null, chartUniforme=null;
function renderDashboard() {
  const d = document.getElementById('scope-banner-dash');
  if (d) d.innerHTML = escopoLabel();
  const dados = vagasNoEscopo();
  const total = dados.length;
  const finalizadas = dados.filter(v=>(v.statusVaga||'').startsWith('Finalizada')).length;
  const emAndamento = dados.filter(v=>(v.statusVaga||'').startsWith('Em Andamento')).length;
  const pendentes   = VAGAS.filter(v=>v.filaVoucherStatus==='pendente').length;

  const kpis = [
    { label:'Total de Vagas', value:total, cls:'teal', sub:'no escopo atual' },
    { label:'Finalizadas', value:finalizadas, cls:'green', sub:'processo concluído' },
    { label:'Em Andamento', value:emAndamento, cls:'blue', sub:'em processo' },
  ];
  if (podeAutorizarVoucher()) kpis.push({ label:'Pendentes de Voucher', value:pendentes, cls:'red', sub:'aguardando autorização' });
  document.getElementById('kpi-cards').innerHTML = kpis.map(k=>`
    <div class="card"><div class="card-label">${k.label}</div><div class="card-value ${k.cls}">${k.value}</div><div class="card-sub">${k.sub}</div></div>`).join('');

  const porRegional = {}; REGIONAIS.forEach(r=>porRegional[r]=0);
  dados.forEach(v => { if (v.regional) porRegional[v.regional]=(porRegional[v.regional]||0)+1; });
  const regLabels = REGIONAIS.filter(r=>porRegional[r]>0);
  const regColors = {'SPI':'#63ccb0','RIO/ES':'#c084fc','CO/N':'#f59e0b','SPM':'#60a5fa'};
  document.getElementById('badge-regional').textContent = total+' vagas';
  const ctxR = document.getElementById('chart-regional').getContext('2d');
  if (chartRegional) chartRegional.destroy();
  chartRegional = new Chart(ctxR, { type:'doughnut', data:{ labels:regLabels, datasets:[{ data:regLabels.map(r=>porRegional[r]), backgroundColor:regLabels.map(r=>regColors[r]||'#8891b4'), borderWidth:0, hoverOffset:6 }] },
    options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#8891b4', font:{size:11}, padding:12 } } } } });

  const porConsultor = {};
  dados.forEach(v=>{ if (v.consultor) porConsultor[v.consultor]=(porConsultor[v.consultor]||0)+1; });
  const rank = Object.entries(porConsultor).sort((a,b)=>b[1]-a[1]);
  const max = rank[0]?.[1]||1;
  document.getElementById('rank-consultores').innerHTML = rank.slice(0,10).map(([nome,count],i)=>{
    const pos = i===0?'gold':i===1?'silver':i===2?'bronze':'';
    return `<li><span class="rank-pos ${pos}">${i+1}</span><span class="rank-name">${nome}</span><div class="rank-bar-wrap"><div class="rank-bar" style="width:${Math.round(count/max*100)}%"></div></div><span class="rank-count">${count}</span></li>`;
  }).join('') || '<li style="color:var(--muted);padding:8px 0">Sem dados</li>';

  const statusCount = {};
  dados.forEach(v=>{ const s=v.statusVaga||'Sem status'; statusCount[s]=(statusCount[s]||0)+1; });
  const ctxS = document.getElementById('chart-status').getContext('2d');
  if (chartStatus) chartStatus.destroy();
  chartStatus = new Chart(ctxS, { type:'bar', data:{ labels:Object.keys(statusCount), datasets:[{ data:Object.values(statusCount), backgroundColor:'rgba(99,204,176,.55)', borderColor:'#63ccb0', borderWidth:1, borderRadius:4 }] },
    options:{ indexAxis:'y', responsive:true, maintainAspectRatio:false, plugins:{ legend:{ display:false } }, scales:{ x:{ ticks:{ color:'#8891b4', font:{size:10} }, grid:{ color:'rgba(46,51,80,.4)' } }, y:{ ticks:{ color:'#8891b4', font:{size:10} }, grid:{ display:false } } } } });

  const uniGroups = {}; REGIONAIS.forEach(r=>uniGroups[r]={E:0,P:0});
  dados.forEach(v => {
    const rg=v.regional; if (!uniGroups[rg]) return;
    const su=(v.statusUniforme||'').toUpperCase();
    const ok=su.includes('ENVIADO')||su.includes('SAÍDA')||su.includes('SAIDA')||su.includes('UNIFORME WECAN');
    uniGroups[rg][ok?'E':'P']++;
  });
  const ctxU = document.getElementById('chart-uniforme').getContext('2d');
  if (chartUniforme) chartUniforme.destroy();
  chartUniforme = new Chart(ctxU, { type:'bar', data:{ labels:REGIONAIS, datasets:[
    { label:'Enviado', data:REGIONAIS.map(r=>uniGroups[r].E), backgroundColor:'rgba(34,197,94,.6)', borderRadius:4 },
    { label:'Pendente', data:REGIONAIS.map(r=>uniGroups[r].P), backgroundColor:'rgba(245,158,11,.6)', borderRadius:4 },
  ]}, options:{ responsive:true, maintainAspectRatio:false, plugins:{ legend:{ position:'bottom', labels:{ color:'#8891b4', font:{size:11} } } }, scales:{ x:{ ticks:{ color:'#8891b4', font:{size:11} }, grid:{ display:false } }, y:{ ticks:{ color:'#8891b4', font:{size:10} }, grid:{ color:'rgba(46,51,80,.4)' } } } } });

  const ns = dados.filter(v=>v.noShow);
  document.getElementById('tb-noshow').innerHTML = ns.length
    ? ns.map(v=>`<tr><td>${v.colaborador||'—'}</td><td>${v.consultor||'—'}</td><td>${regionalPill(v.regional)}</td><td>${v.motivoAtraso||'—'}</td><td class="text-truncate">${v.observacao||'—'}</td></tr>`).join('')
    : `<tr><td colspan="5"><div class="empty-state">✅ Nenhum No Show registrado</div></td></tr>`;
}

// ── SELECTS DINÂMICOS DO MODAL DE VAGA ────────
function popularSelectMes() {
  const sel = document.getElementById('v-mes');
  if (!sel) return;
  const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho',
                 'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const anoAtual = new Date().getFullYear();
  const anos = [anoAtual - 1, anoAtual, anoAtual + 1];
  const opts = ['<option value="">— selecione —</option>'];
  anos.forEach(ano => {
    MESES.forEach((mes, i) => {
      const val = `${ano}-${String(i+1).padStart(2,'0')}-01`;
      opts.push(`<option value="${val}">${mes} / ${ano}</option>`);
    });
  });
  const atual = sel.value;
  sel.innerHTML = opts.join('');
  if (atual) sel.value = atual;
}

function popularSelectCC() {
  const sel = document.getElementById('v-codigoHub');
  if (!sel) return;
  const atual = sel.value;
  sel.innerHTML = '<option value="">— selecione —</option>' +
    CENTROS_CUSTO.filter(c => c.ativo !== false).map(c =>
      `<option value="${c.cod}" data-uf="${c.uf||''}" data-logradouro="${c.logradouro||''}" data-numero="${c.numero||''}" data-bairro="${c.bairro||''}" data-cidade="${c.cidade||''}">${c.cod} — ${c.descricao}</option>`
    ).join('');
  if (atual) sel.value = atual;
}

function preencherLocalPorCC() {
  const sel = document.getElementById('v-codigoHub');
  if (!sel?.value) return;
  const cc = CENTROS_CUSTO.find(c => c.cod === sel.value);
  if (!cc) return;
  const partes = [cc.logradouro, cc.numero?`Nº ${cc.numero}`:'', cc.bairro, cc.cidade, cc.uf].filter(Boolean);
  const localEl = document.getElementById('v-local');
  if (localEl) localEl.value = partes.join(', ');
  const regMap = { SP:'SPI', RJ:'RIO/ES', ES:'RIO/ES', AM:'CO/N', PA:'CO/N', MA:'CO/N',
                   GO:'CO/N', DF:'CO/N', MT:'CO/N', MS:'CO/N', TO:'CO/N', RO:'CO/N',
                   AC:'CO/N', RR:'CO/N', AP:'CO/N', PI:'CO/N' };
  if (cc.uf) { const reg = document.getElementById('v-regional'); if (reg && regMap[cc.uf]) reg.value = regMap[cc.uf]; }
  // Filtrar departamentos pelo cod do CC
  popularSelectDeptos(cc.cod);
}

function popularSelectDeptos(codCC) {
  const sel = document.getElementById('v-departamentoGI');
  if (!sel) return;
  const atual = sel.value;
  // Buscar cli_codigo do CC selecionado
  const ccSelecionado = CENTROS_CUSTO.find(c => c.cod === codCC);
  const cliCodigo = ccSelecionado?.cli_codigo || '';
  const lista = cliCodigo
    ? DEPTOS.filter(d => !d.cli_codigo || d.cli_codigo === cliCodigo)
    : DEPTOS;
  sel.innerHTML = '<option value="">— selecione —</option>' +
    lista.map(d => `<option value="${d.descricao}">${d.codigo ? d.codigo+' — ' : ''}${d.descricao}</option>`).join('');
  if (atual) sel.value = atual;
}

// Garante que os arrays de CC e Deptos estão carregados ao abrir o modal
async function garantirCadastrosCarregados() {
  const proms = [];
  if (!CENTROS_CUSTO.length) proms.push(carregarCentrosCusto());
  if (!DEPTOS.length)        proms.push(carregarDeptos());
  if (proms.length) await Promise.allSettled(proms);
}
function renderVagas() {
  const busca  = (document.getElementById('busca-vaga')?.value||'').toLowerCase();
  const reg    = document.getElementById('filtro-regional')?.value||'';
  const status = document.getElementById('filtro-statusvaga')?.value||'';
  const cons   = document.getElementById('filtro-consultor')?.value||'';
  const cc     = document.getElementById('filtro-cc')?.value||'';
  const scopeLabel = document.getElementById('scope-banner-vagas');
  if (scopeLabel) scopeLabel.innerHTML = escopoLabel();
  atualizarIndicadorFiltros();

  let lista = vagasNoEscopo();
  if (reg)    lista = lista.filter(v=>v.regional===reg);
  if (status) {
    // Filtros de grupo
    if (status === '__pendente__')  lista = lista.filter(v => statusVagaGrupo(v.statusVaga) === 'pendente');
    else if (status === '__andamento__') lista = lista.filter(v => statusVagaGrupo(v.statusVaga) === 'andamento');
    else if (status === '__concluida__') lista = lista.filter(v => statusVagaGrupo(v.statusVaga) === 'concluida');
    else if (status === '__cancelada__') lista = lista.filter(v => statusVagaGrupo(v.statusVaga) === 'cancelada');
    else lista = lista.filter(v => v.statusVaga === status);
  }
  if (cons)   lista = lista.filter(v=>v.consultor===cons);
  if (cc)     lista = lista.filter(v=>v.codigoHub===cc);
  if (busca)  lista = lista.filter(v =>
    [v.colaborador,v.jira,v.matricula,v.consultor,v.cargo,v.local,v.codigoHub].some(f=>(f||'').toLowerCase().includes(busca))
  );

  const tbody = document.getElementById('tbody-vagas');
  const thead = document.querySelector('#page-vagas .main-table thead tr');
  const count = document.getElementById('vagas-count');
  if (!tbody) return;

  // Colunas ativas nesta renderização
  const cols = COLUNAS_DISPONIVEIS.filter(c => _colunasAtivas.has(c.id));
  const isMaster = ehMaster();
  const nCols = cols.length + 1 + (isMaster ? 1 : 0);

  // Reconstruir cabeçalho
  if (thead) {
    const chkTh = isMaster
      ? `<th class="col-sel"><input type="checkbox" class="th-checkbox" id="chk-all" onclick="toggleSelecionarTodos(this)" title="Selecionar/desselecionar todas"></th>`
      : '';
    thead.innerHTML = chkTh + cols.map(c=>`<th>${c.label}</th>`).join('') + '<th>Ações</th>';
  }

  if (!lista.length) {
    tbody.innerHTML=`<tr><td colspan="${nCols}"><div class="empty-state"><div class="ico">🔍</div>Nenhuma vaga encontrada</div></td></tr>`;
    if (count) count.textContent=''; return;
  }
  if (count) count.textContent = `${lista.length} vaga(s) exibida(s)`;

  tbody.innerHTML = lista.map(v=>{
    const je=(v.jira||'').replace(/'/g,"\\'");
    const cells = cols.map(c=>`<td>${c.render(v)}</td>`).join('');
    const chkTd = isMaster
      ? `<td class="col-sel" onclick="event.stopPropagation()"><input type="checkbox" class="row-checkbox" data-jira="${v.jira||''}" onchange="onRowCheck()"></td>`
      : '';
    return `<tr onclick="abrirModalVaga('${je}')">
      ${chkTd}
      ${cells}
      <td class="actions-cell" onclick="event.stopPropagation()">
        <button class="btn btn-ghost btn-sm" onclick="abrirModalVaga('${je}')">Editar</button>
        ${isMaster ? `<button class="btn btn-danger btn-sm" onclick="excluirVaga('${je}')">Excluir</button>` : ''}
      </td>
    </tr>`;
  }).join('');

  atualizarBulkBar();
}

// ── SELETOR DE COLUNAS ────────────────────────
function toggleColPicker() {
  const panel = document.getElementById('col-picker-panel');
  const btn   = document.getElementById('btn-col-picker');
  if (!panel || !btn) return;
  const isOpen = panel.classList.toggle('open');
  if (isOpen) {
    // Posicionar abaixo do botão usando coordenadas fixas na viewport
    const rect = btn.getBoundingClientRect();
    panel.style.top  = (rect.bottom + 6) + 'px';
    // Ancoragem à direita: evitar sair da tela
    const panelW = 300;
    let left = rect.right - panelW;
    if (left < 8) left = 8;
    panel.style.left = left + 'px';
    renderColPicker();
  }
}

function renderColPicker() {
  const grid = document.getElementById('col-picker-grid');
  if (!grid) return;
  grid.innerHTML = COLUNAS_DISPONIVEIS.map(c => `
    <label class="col-check-item ${_colunasAtivas.has(c.id)?'checked':''}">
      <input type="checkbox" data-col="${c.id}" ${_colunasAtivas.has(c.id)?'checked':''}
        onchange="toggleColuna(this)"/>
      ${c.label}
    </label>`).join('');
}

function toggleColuna(input) {
  const id = input.dataset.col;
  if (input.checked) _colunasAtivas.add(id);
  else _colunasAtivas.delete(id);
  input.closest('.col-check-item').classList.toggle('checked', input.checked);
}

function aplicarColunas() {
  salvarPreferenciaColunas();
  document.getElementById('col-picker-panel').classList.remove('open');
  renderVagas();
}

function resetColunas() {
  _colunasAtivas = new Set(COLUNAS_DISPONIVEIS.filter(c=>c.default).map(c=>c.id));
  salvarPreferenciaColunas();
  renderColPicker();
  renderVagas();
}

// Fechar painel ao clicar fora
document.addEventListener('click', e => {
  const panel = document.getElementById('col-picker-panel');
  const btn   = document.getElementById('btn-col-picker');
  if (panel && btn && !panel.contains(e.target) && !btn.contains(e.target)) {
    panel.classList.remove('open');
  }
});

// ── MODAL VAGA ────────────────────────────────
function switchTab(nome) {
  document.querySelectorAll('.tab-btn').forEach(b=>b.classList.toggle('active',b.dataset.tab===nome));
  document.querySelectorAll('.tab-content').forEach(c=>c.classList.toggle('active',c.dataset.tab===nome));
}
function checarVoucherFlag() {
  const v = document.getElementById('v-transporte').value;
  document.getElementById('voucher-flag').style.display = v.toUpperCase().includes('VOUCHER') ? 'flex' : 'none';
}

async function abrirModalVaga(jiraOuNull) {
  const v = jiraOuNull ? VAGAS.find(x=>x.jira===jiraOuNull) : null;
  document.getElementById('mv-title').textContent    = v ? 'Editar Vaga' : 'Nova Vaga';
  document.getElementById('mv-subtitle').textContent = v ? `Jira: ${v.jira} · ${v.colaborador||'sem colaborador'}` : 'Preencha os dados do processo de seleção e admissão';
  switchTab('vaga');

  // Garantir que CC e Deptos estão carregados antes de popular os selects
  await garantirCadastrosCarregados();
  popularSelectMes();
  popularSelectCC();
  popularSelectDeptos();

  const set = (id, val) => { const el=document.getElementById(id); if (el) el.value=val||''; };
  set('v-id', v?.id||'');
  set('v-jiraOriginal', v?.jira||'');
  set('v-jira', v?.jira||'');
  set('v-codigoHub', v?.codigoHub||'');
  set('v-regional', v?.regional||'SPI');
  set('v-mes', v?.mes||'');
  // Preenche local pelo CC automaticamente (pode ser editado manualmente depois)
  preencherLocalPorCC();
  if (v?.local) set('v-local', v.local); // se já tinha local salvo, mantém
  set('v-modalidade', v?.modalidade||'');
  set('v-tempo', v?.tempo||'');
  set('v-cargo', v?.cargo||'');
  set('v-turno', v?.turno||'');
  set('v-horario', v?.horario||'');
  set('v-escala', v?.escala||'');
  set('v-colaborador', v?.colaborador||'');
  set('v-matricula', v?.matricula||'');
  set('v-opsId', v?.opsId||'');
  set('v-statusUniforme', v?.statusUniforme||'');
  set('v-cpf', v?.cpf||'');
  set('v-genero', v?.genero||'');
  set('v-email', v?.email||'');
  set('v-telefone', v?.telefone||'');
  set('v-indicacao', v?.indicacao||'NÃO');
  set('v-preferencia', v?.preferencia||'');
  set('v-tipoProcesso', v?.tipoProcesso||'ONLINE');
  set('v-recebimento', v?.recebimento||'');
  set('v-dataAdmSolicitada', v?.dataAdmSolicitada||'');
  set('v-dataReprog', v?.dataReprog||'');
  set('v-novaDataETO', v?.novaDataETO||'');
  set('v-dataAdmRealizada', v?.dataAdmRealizada||'');
  set('v-etapa', v?.etapa||'R&S');
  set('v-statusVaga', v?.statusVaga || (jiraOuNull ? '' : 'Pendente'));
  set('v-tipoVaga', v?.tipoVaga||'1 - Vaga Oficial');
  set('v-salario', v?.salario||'');
  set('v-cnpj', v?.cnpj||'');
  set('v-departamentoGI', v?.departamentoGI||'');
  set('v-transporte', v?.transporte||'');
  set('v-refeicao', v?.refeicao||'');
  set('v-cestaBasica', v?.cestaBasica||'');
  set('v-colete', v?.colete||'');
  set('v-bota', v?.bota||'');
  set('v-luva', v?.luva||'');
  set('v-gestorTurno', v?.gestorTurno||'');
  set('v-contatoGestorTurno', v?.contatoGestorTurno||'');
  set('v-unidadeWecan', v?.unidadeWecan||'');
  set('v-noShow', v?.noShow||'');
  set('v-motivoAtraso', v?.motivoAtraso||'');
  set('v-observacao', v?.observacao||'');
  set('v-tipoProcessoDesistente', v?.tipoProcessoDesistente||'');
  checarVoucherFlag();

  // popular consultor com usuários cadastrados no sistema
  const selC = document.getElementById('v-consultor');
  let listaC;
  if (USUARIOS_SISTEMA.length) {
    // Usa a lista real de usuários. Garante que o nome do usuário atual sempre aparece.
    const nomes = USUARIOS_SISTEMA.map(u => u.nome);
    if (!nomes.includes(session.nome)) nomes.unshift(session.nome);
    listaC = nomes;
  } else {
    // Fallback: nomes que já aparecem nas vagas
    listaC = consultoresConhecidos();
    if (!listaC.includes(session.nome)) listaC.unshift(session.nome);
  }
  selC.innerHTML = listaC.map(c=>`<option ${(v?.consultor||session.nome)===c?'selected':''}>${c}</option>`).join('');
  if (!podeVerTudo()) { selC.value=session.nome; selC.disabled=true; } else selC.disabled=false;

  // timeline
  const wrap = document.getElementById('mv-timeline-wrap');
  if (v && (v.recebimento || v.dataAdmSolicitada || v.dataAdmRealizada)) {
    wrap.style.display='block';
    const steps = [
      {label:'Recebimento', date:v.recebimento},
      {label:'Adm. Solicitada', date:v.dataAdmSolicitada},
      {label:'Reprogramação', date:v.dataReprog},
      {label:'Nova Data ETO', date:v.novaDataETO},
      {label:'Adm. Realizada', date:v.dataAdmRealizada},
    ];
    document.getElementById('mv-timeline').innerHTML = steps.map(s=>`
      <div class="tl-step ${s.date?'done':''}">
        <div class="tl-dot"></div><div class="tl-line"></div>
        <div class="tl-label">${s.label}</div>
        <div class="tl-date">${s.date ? new Date(s.date+'T00:00').toLocaleDateString('pt-BR') : '—'}</div>
      </div>`).join('');
  } else wrap.style.display='none';

  abrirModal('modal-vaga');
}

async function salvarVaga() {
  const btn = document.getElementById('btn-salvar-vaga');
  const jiraOriginal = document.getElementById('v-jiraOriginal').value;
  const g = id => document.getElementById(id)?.value||'';
  const vaga = {
    consultor:g('v-consultor'), jira:g('v-jira').trim(), codigo_hub:g('v-codigoHub'),
    regional:g('v-regional'), mes:g('v-mes'), local_trabalho:g('v-local'),
    modalidade:g('v-modalidade'), tempo:g('v-tempo'), cargo:g('v-cargo'),
    turno:g('v-turno'), horario:g('v-horario'), escala:g('v-escala'),
    colaborador:g('v-colaborador'), matricula:g('v-matricula'), ops_id:g('v-opsId'),
    status_uniforme:g('v-statusUniforme'), cpf:g('v-cpf'), genero:g('v-genero'),
    email_colaborador:g('v-email'), telefone:g('v-telefone'), indicacao:g('v-indicacao'),
    preferencia:g('v-preferencia'), tipo_processo:g('v-tipoProcesso'),
    recebimento:g('v-recebimento'), data_adm_solicitada:g('v-dataAdmSolicitada'),
    data_reprog:g('v-dataReprog'), nova_data_eto:g('v-novaDataETO'),
    data_adm_realizada:g('v-dataAdmRealizada'), etapa:g('v-etapa'),
    status_vaga:g('v-statusVaga'), tipo_vaga:g('v-tipoVaga'),
    salario:g('v-salario'), cnpj:g('v-cnpj'), departamento_gi:g('v-departamentoGI'),
    transporte:g('v-transporte'), refeicao:g('v-refeicao'), cesta_basica:g('v-cestaBasica'),
    colete:g('v-colete'), bota:g('v-bota'), luva:g('v-luva'),
    gestor_turno:g('v-gestorTurno'), contato_gestor_turno:g('v-contatoGestorTurno'),
    unidade_wecan:g('v-unidadeWecan'), no_show:g('v-noShow'),
    motivo_atraso:g('v-motivoAtraso'), observacao:g('v-observacao'),
    tipo_processo_desistente:g('v-tipoProcessoDesistente'),
    aba: VAGAS.find(x=>x.jira===jiraOriginal)?.aba || 'HUBs'
  };
  if (!vaga.jira) { toast('Informe o Código do Jira.','error'); return; }
  const isVoucher  = vaga.transporte.toUpperCase().includes('VOUCHER');
  const eraVoucher = VAGAS.find(x=>x.jira===jiraOriginal)?.transporte?.toUpperCase().includes('VOUCHER') || false;
  btn.disabled=true; btn.textContent='Salvando…';
  try {
    const resp = await rpc('wc_salvar_vaga', { p_vaga:vaga, p_jira_original:jiraOriginal||vaga.jira });
    await carregarVagas(); await carregarFilaVoucher();
    fecharModal('modal-vaga'); renderVagas(); atualizarBadgeFila();
    if (resp.criado) toast(isVoucher?'Vaga criada! Adicionado à fila de Voucher.':'Vaga criada!', isVoucher?'info':'success');
    else if (isVoucher&&!eraVoucher) toast('Salvo! Adicionado à fila de Voucher.','info');
    else if (!isVoucher&&eraVoucher) toast('Salvo! Removido da fila de Voucher.','info');
    else toast('Vaga atualizada!','success');
  } catch(e) { toast(e.message,'error'); }
  finally { btn.disabled=false; btn.textContent='Salvar Vaga'; }
}

// ── IMPORTAÇÃO EM LOTE ────────────────────────
// Colunas aceitas no template (mesma ordem do CAMPO_MAP do migrar.html)
// ── IMPORTAÇÃO DE VAGAS ──────────────────────
// Colunas do modelo ENXUTO (as principais)
const IMPORT_COLS_ENXUTO = [
  { campo:'jira',                label:'Código do Jira *',           obrig:true  },
  { campo:'codigo_hub',          label:'Código Hub / Soc',           obrig:false },
  { campo:'regional',            label:'Regional',                   obrig:false },
  { campo:'recebimento',         label:'Recebimento (dd/mm/aaaa)',    obrig:false },
  { campo:'mes',                 label:'Mês (dd/mm/aaaa)',           obrig:false },
  { campo:'local_trabalho',      label:'Local de Trabalho',          obrig:false },
  { campo:'modalidade',          label:'Modalidade',                 obrig:false },
  { campo:'tempo',               label:'Tempo',                      obrig:false },
  { campo:'cargo',               label:'Cargo',                      obrig:false },
  { campo:'turno',               label:'Turno',                      obrig:false },
  { campo:'horario',             label:'Horário',                    obrig:false },
  { campo:'escala',              label:'Escala',                     obrig:false },
  { campo:'ops_id',              label:'OPS ID',                     obrig:false },
  { campo:'data_adm_solicitada', label:'Data de Admissão Solicitada', obrig:false },
  { campo:'tipo_vaga',           label:'Tipo de Vaga',               obrig:false },
  { campo:'salario',             label:'Salário',                    obrig:false },
  { campo:'cnpj',                label:'CNPJ',                       obrig:false },
  { campo:'departamento_gi',     label:'Departamento GI',            obrig:false },
];

const IMPORT_CAMPOS_DATA = new Set(['mes','recebimento','data_adm_solicitada','data_reprog','nova_data_eto','data_adm_realizada']);

// Popular os selects de padrão ao abrir o modal
async function abrirImportacaoLote() {
  document.getElementById('import-file').value = '';
  document.getElementById('import-preview-wrap').style.display = 'none';
  document.getElementById('import-preview-table').innerHTML = '';
  document.getElementById('import-log').style.display = 'none';
  document.getElementById('btn-confirmar-import').style.display = 'none';
  _importRows = [];

  // Garantir que CC e Deptos estão carregados
  await garantirCadastrosCarregados();

  // Popular select de CC (todos inicialmente)
  impPopularSelectCC(null);
  document.getElementById('imp-default-cc').onchange = () => {
    impPreencherLocalDefault();
    impFiltrarDeptosPorCC();
  };

  // Popular select de depto
  const selD = document.getElementById('imp-default-depto');
  selD.innerHTML = '<option value="">— nenhum padrão —</option>' +
    DEPTOS.map(d => `<option value="${d.descricao}">${d.codigo ? d.codigo+' — ' : ''}${d.descricao}</option>`).join('');

  abrirModal('modal-importacao');
}

function impPopularSelectCC(ccsPermitidos) {
  const selCC = document.getElementById('imp-default-cc');
  const valorAtual = selCC.value;
  const lista = CENTROS_CUSTO.filter(c =>
    c.ativo !== false && (!ccsPermitidos || ccsPermitidos.has(c.cod))
  );
  selCC.innerHTML = '<option value="">— nenhum padrão —</option>' +
    lista.map(c => {
      const local = [c.logradouro, c.numero?'Nº '+c.numero:'', c.bairro, c.cidade, c.uf].filter(Boolean).join(', ');
      return `<option value="${c.cod}" data-local="${local}" data-uf="${c.uf||''}" data-cliente="${c.cliente||''}">${c.cod} — ${c.descricao}</option>`;
    }).join('');
  if (valorAtual && lista.find(c => c.cod === valorAtual)) selCC.value = valorAtual;
  // Filtrar deptos pelo CC já selecionado
  impFiltrarDeptosPorCC();
}

function impFiltrarDeptosPorCC() {
  const selCC  = document.getElementById('imp-default-cc');
  const selDep = document.getElementById('imp-default-depto');
  if (!selDep) return;
  const codCC      = selCC?.value || '';
  const valorAtual = selDep.value;

  // Buscar cli_codigo do CC selecionado
  const ccSelecionado = CENTROS_CUSTO.find(c => c.cod === codCC);
  const cliCodigo = ccSelecionado?.cli_codigo || '';

  // Filtrar deptos pelo cli_codigo do CC selecionado
  const lista = cliCodigo
    ? DEPTOS.filter(d => !d.cli_codigo || d.cli_codigo === cliCodigo)
    : DEPTOS;

  selDep.innerHTML = '<option value="">— nenhum padrão —</option>' +
    lista.map(d => `<option value="${d.descricao}">${d.codigo ? d.codigo+' — ' : ''}${d.descricao}</option>`).join('');

  if (valorAtual && lista.find(d => d.descricao === valorAtual)) selDep.value = valorAtual;
}

function impPreencherLocalDefault() {
  const sel = document.getElementById('imp-default-cc');
  const opt = sel?.selectedOptions[0];
  if (!opt?.value) return;
  document.getElementById('imp-default-local').value = opt.dataset.local || '';
  const uf = opt.dataset.uf;
  const regMap = { SP:'SPI', RJ:'RIO/ES', ES:'RIO/ES', AM:'CO/N', PA:'CO/N', MA:'CO/N' };
  if (uf && regMap[uf]) document.getElementById('imp-default-regional').value = regMap[uf];
}

// ── Resolve o nome do consultor pelo código do HUB/CC ───────
// Percorre USUARIOS_SISTEMA procurando um usuário do perfil equipe/consultor
// cujas operações contenham o cc_cod ou nome que bate com o codigo_hub informado.
// Retorna o nome do consultor ou '' se não encontrado.
function resolverConsultorPorHub(codHub) {
  if (!codHub || !USUARIOS_SISTEMA?.length) return '';
  const hub = codHub.toString().toUpperCase().trim();

  // 1ª tentativa: match exato por cc_cod nas operações
  for (const u of USUARIOS_SISTEMA) {
    if (!['equipe','consultor_rs'].includes(u.perfil)) continue;
    const ops = u.operacoes || [];
    if (ops.some(o => (o.cc_cod||'').toUpperCase() === hub)) return u.nome;
  }

  // 2ª tentativa: match pelo nome/descrição da operação vs descrição do CC
  const cc = CENTROS_CUSTO?.find(c => c.cod?.toUpperCase() === hub);
  if (cc) {
    const descCC = (cc.descricao||'').toUpperCase();
    for (const u of USUARIOS_SISTEMA) {
      if (!['equipe','consultor_rs'].includes(u.perfil)) continue;
      const ops = u.operacoes || [];
      if (ops.some(o => (o.nome||'').toUpperCase() === descCC)) return u.nome;
    }
  }

  return '';
}

function baixarTemplateImportacao() {
  const cabecalho = IMPORT_COLS_ENXUTO.map(c => c.label);
  const exemplo = [
    '',          // Código do Jira — preencher para cada vaga
    document.getElementById('imp-default-cc')?.value || 'CC-0001',      // Código Hub / Soc
    document.getElementById('imp-default-regional')?.value || 'SPI',    // Regional
    '',          // Recebimento (dd/mm/aaaa)
    '',          // Mês (dd/mm/aaaa)
    document.getElementById('imp-default-local')?.value || 'Endereço completo', // Local de Trabalho
    'Temporário',                                                         // Modalidade
    'Horista',                                                            // Tempo
    'Auxiliar de logística',                                              // Cargo
    'F1',        // Turno
    '08:00-16:20', // Horário
    'SEG-SAB',   // Escala
    '',          // OPS ID
    '',          // Data de Admissão Solicitada
    '1 - Vaga Oficial',                                                   // Tipo de Vaga
    '',          // Salário
    '',          // CNPJ
    document.getElementById('imp-default-depto')?.value || '',           // Departamento GI
  ];

  const gerarXLSX = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet([cabecalho, exemplo]);
    // Destacar coluna obrigatória
    ws['!cols'] = IMPORT_COLS_ENXUTO.map(c => ({ wch: Math.max(c.label.length, 18) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Vagas');
    // Aba de referência com as listas de valores aceitos
    const wsRef = XLSX.utils.aoa_to_sheet([
      ['Modalidade', 'Tempo',    'Cargo',                    'Regional', 'Tipo de Vaga',             'Turno'],
      ['CLT',        'Horista',  'Auxiliar de logística',    'SPI',      '1 - Vaga Oficial',         'F1'],
      ['Temporário', 'Mensalista','Líder de logística',      'CO/N',     '2 - Reposição - NO SHOW',  'F2'],
      ['',           '',         'Auxiliar de almoxarifado', 'SPM',      '3 - Reposição - ETO',      'F3'],
      ['',           '',         'Auxiliar administrativo',  'RIO/ES',   '',                         'FIXO'],
      ['',           '',         '',                         '',         '',                         ''],
    ]);
    XLSX.utils.book_append_sheet(wb, wsRef, 'Valores aceitos');
    XLSX.writeFile(wb, 'modelo_vagas.xlsx');
    toast('Modelo baixado!', 'success');
  };

  if (typeof XLSX === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = gerarXLSX;
    document.head.appendChild(s);
  } else { gerarXLSX(); }
}

function excelDateToISO(v) {
  if (!v) return '';
  if (typeof v === 'string') {
    const s = v.trim();
    // dd/mm/aaaa
    const m1 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (m1) return `${m1[3]}-${m1[2].padStart(2,'0')}-${m1[1].padStart(2,'0')}`;
    // aaaa-mm-dd
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0,10);
    // "junho, 2026" ou "junho 2026" → primeiro dia do mês
    const meses = { janeiro:'01',fevereiro:'02',março:'03',abril:'04',maio:'05',junho:'06',
      julho:'07',agosto:'08',setembro:'09',outubro:'10',novembro:'11',dezembro:'12' };
    const m2 = s.toLowerCase().match(/^(\w+)[,\s]+(\d{4})$/);
    if (m2 && meses[m2[1]]) return `${m2[2]}-${meses[m2[1]]}-01`;
    // mm/aaaa
    const m3 = s.match(/^(\d{1,2})\/(\d{4})$/);
    if (m3) return `${m3[2]}-${m3[1].padStart(2,'0')}-01`;
    return '';
  }
  if (typeof v === 'number') {
    try {
      const d = XLSX.SSF.parse_date_code(v);
      if (!d) return '';
      return `${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`;
    } catch(e) { return ''; }
  }
  return '';
}

function carregarPreviewImportacao(input) {
  const file = input.files[0]; if (!file) return;

  // Mostrar nome do arquivo selecionado
  const nomeEl = document.getElementById('import-file-nome');
  if (nomeEl) nomeEl.textContent = `📄 ${file.name} (${(file.size/1024).toFixed(1)} KB)`;

  // Limpar estado anterior
  document.getElementById('import-preview-wrap').style.display = 'none';
  document.getElementById('btn-confirmar-import').style.display = 'none';
  document.getElementById('import-log').style.display = 'none';
  _importRows = [];

  // Defaults do painel
  const defCC        = document.getElementById('imp-default-cc')?.value || '';
  const defLocal     = document.getElementById('imp-default-local')?.value || '';
  const defRegional  = document.getElementById('imp-default-regional')?.value || '';
  const defDepto     = document.getElementById('imp-default-depto')?.value || '';

  const mostrarErro = (msg) => {
    const log = document.getElementById('import-log');
    log.style.display = 'block';
    log.textContent = '❌ ' + msg;
    toast(msg, 'error');
  };

  const processar = (rows) => {
    try {
      if (!rows || !rows.length) { mostrarErro('Planilha vazia ou formato inválido.'); return; }
      const cabecalho = (rows[0]||[]).map(c => (c||'').toString().trim());

      // Mapear nome de coluna → índice
      // Normaliza: remove *, espaços extras, converte para minúsculo
      const norm = s => s.toLowerCase().replace(/\*/g,'').replace(/_/g,' ').trim();
      const colIdx = {};
      IMPORT_COLS_ENXUTO.forEach((c, posicao) => {
        const labelN = norm(c.label);
        const campoN = norm(c.campo);
        // Primeiro: por nome de coluna
        let idx = cabecalho.findIndex(h => { const hn = norm(h); return hn === labelN || hn === campoN; });
        // Fallback: por posição (se a planilha foi gerada pelo modelo do sistema)
        if (idx < 0 && posicao < cabecalho.length) idx = posicao;
        if (idx >= 0) colIdx[c.campo] = idx;
      });

      _importRows = [];
      const erros = [];
      for (let i = 1; i < rows.length; i++) {
        const row = rows[i];
        if (!row || row.every(c => c == null || c === '')) continue;
        const obj = { _defaults: {} };

        IMPORT_COLS_ENXUTO.forEach(c => {
          const idx = colIdx[c.campo] ?? -1;
          let val = (idx >= 0 && row[idx] != null) ? String(row[idx]).trim() : '';
          if (IMPORT_CAMPOS_DATA.has(c.campo)) val = excelDateToISO(row[idx] ?? '');
          obj[c.campo] = val;
        });

        if (!obj.jira) { erros.push(`Linha ${i+1}: Jira vazio — ignorada`); continue; }

        // Aplicar defaults
        const ap = (campo, valor) => { if (!obj[campo] && valor) { obj[campo] = valor; obj._defaults[campo] = true; } };
        ap('codigo_hub',      defCC);
        ap('local_trabalho',  defLocal);
        ap('regional',        defRegional);
        ap('departamento_gi', defDepto);
        // Status padrão sempre Pendente na importação
        if (!obj.status_vaga) { obj.status_vaga = 'Pendente'; obj._defaults.status_vaga = true; }
        // Resolver consultor pelo código do HUB automaticamente
        const consultorAuto = resolverConsultorPorHub(obj.codigo_hub);
        if (consultorAuto) { obj.consultor = consultorAuto; obj._defaults.consultor = true; }

        _importRows.push(obj);
      }

      // Preview
      const wrap    = document.getElementById('import-preview-wrap');
      const countEl = document.getElementById('import-preview-count');
      const tableEl = document.getElementById('import-preview-table');
      wrap.style.display = 'block';
      countEl.textContent = `${_importRows.length} vaga(s) prontas${erros.length ? ` · ${erros.length} ignoradas` : ''}`;

      const previewCols = ['jira','codigo_hub','regional','cargo','modalidade','tempo','tipo_vaga','consultor_resolvido'];
      const previewLabels = { jira:'Jira', codigo_hub:'Hub/Soc', regional:'Regional', cargo:'Cargo', modalidade:'Modalidade', tempo:'Tempo', tipo_vaga:'Tipo', consultor_resolvido:'Consultor (auto)' };
      // Resolver consultor pelo codigo_hub para exibir no preview
      _importRows.forEach(r => {
        if (!r.consultor_resolvido) {
          r.consultor_resolvido = resolverConsultorPorHub(r.codigo_hub) || '—';
        }
      });
      tableEl.innerHTML = `<table>
        <thead><tr>${previewCols.map(c=>`<th>${previewLabels[c]||c}</th>`).join('')}</tr></thead>
        <tbody>${_importRows.slice(0,50).map(r =>
          `<tr>${previewCols.map(c => {
            const isDefault = r._defaults?.[c];
            const val = r[c] || '—';
            return `<td style="${isDefault?'color:var(--voucher);font-style:italic':''}" title="${isDefault?'Valor padrão':'planilha'}">${val}</td>`;
          }).join('')}</tr>`).join('')}
        ${_importRows.length>50?`<tr><td colspan="${previewCols.length}" style="color:var(--muted);padding:8px">… e mais ${_importRows.length-50} linhas</td></tr>`:''}
        </tbody></table>`;

      document.getElementById('btn-confirmar-import').style.display = _importRows.length ? 'flex' : 'none';

      if (erros.length) {
        const log = document.getElementById('import-log');
        log.style.display = 'block';
        log.textContent = erros.join('\n');
      }
    } catch(e) {
      mostrarErro(`Erro ao processar planilha: ${e.message}`);
    }
  };

  const isCsv = file.name.toLowerCase().endsWith('.csv');
  const reader = new FileReader();

  reader.onerror = () => mostrarErro('Não foi possível ler o arquivo. Tente novamente.');

  if (isCsv) {
    reader.onload = e => {
      try {
        const rows = e.target.result.split(/\r?\n/).filter(l=>l.trim())
          .map(l => l.split(',').map(c => c.replace(/^"|"$/g,'').replace(/""/g,'"').trim()));
        processar(rows);
      } catch(e) { mostrarErro(e.message); }
    };
    reader.readAsText(file, 'UTF-8');
  } else {
    reader.onload = e => {
      const lerXLSX = () => {
        try {
          const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array', cellDates:false});
          const ws = wb.Sheets[wb.SheetNames[0]];
          processar(XLSX.utils.sheet_to_json(ws, {header:1, defval:null}));
        } catch(e) { mostrarErro(`Erro ao ler XLSX: ${e.message}`); }
      };
      if (typeof XLSX === 'undefined') {
        const s = document.createElement('script');
        s.src = 'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
        s.onload = lerXLSX;
        s.onerror = () => mostrarErro('Não foi possível carregar o leitor de planilhas. Verifique sua internet.');
        document.head.appendChild(s);
      } else { lerXLSX(); }
    };
    reader.readAsArrayBuffer(file);
  }
}

async function confirmarImportacao() {
  if (!_importRows.length) return;
  const btn = document.getElementById('btn-confirmar-import');
  const log = document.getElementById('import-log');
  btn.disabled = true; btn.textContent = 'Importando…';
  log.style.display = 'block'; log.textContent = '';
  let ok = 0, err = 0;

  for (const vaga of _importRows) {
    // Remover campo de rastreamento antes de enviar
    const { _defaults, ...payload } = vaga;
    try {
      await rpc('wc_salvar_vaga', { p_vaga: payload, p_jira_original: payload.jira });
      ok++;
    } catch(e) {
      err++;
      log.textContent += `✗ ${vaga.jira}: ${e.message}\n`;
    }
    // Atualizar log a cada vaga
    const progresso = `✓ ${ok} importadas${err ? ` · ✗ ${err} erros` : ''} (${ok+err}/${_importRows.length})\n`;
    log.textContent = progresso + log.textContent.replace(/^✓.*\n/, '');
    log.scrollTop = 0;
  }

  log.textContent = `══ CONCLUÍDO ══\n✓ ${ok} vaga(s) importada(s)${err ? `\n✗ ${err} erro(s)` : ''}\n\n` + log.textContent;
  await carregarVagas(); renderVagas(); atualizarBadgeFila();
  btn.disabled = false; btn.textContent = '✅ Importação concluída';
  toast(`${ok} vagas importadas${err ? `, ${err} erros` : ''}`, err ? 'info' : 'success');
}

// ── FILA DE VOUCHER ───────────────────────────
let queueFilter = 'pendente';
function setQueueFilter(f) {
  queueFilter=f;
  document.querySelectorAll('.qtab').forEach(b=>b.classList.toggle('active',b.dataset.qf===f));
  renderQueue();
}
function atualizarBadgeFila() {
  const fila = window._filaItens || [];
  const n = fila.filter(f => f.status === 'pendente').length
          || VAGAS.filter(v => v.filaVoucherStatus === 'pendente').length;
  const el = document.getElementById('nav-voucher-count');
  if (el) el.textContent = n;
}
function renderQueue() {
  const el = document.getElementById('queue-list'); if (!el) return;

  // Usa _filaItens (dados diretos do banco) em vez de filtrar VAGAS
  const fila = window._filaItens || [];
  const lista = fila.filter(f => f.status === queueFilter);

  if (!lista.length) {
    el.innerHTML = `<div class="empty-state"><div class="ico">📬</div>Nenhum colaborador nesta categoria</div>`;
    return;
  }

  el.innerHTML = lista.map(f => {
    const jira = (f.vaga_jira||'').replace(/'/g,"\\'");
    // Enriquecer com dados da vaga em memória se disponível
    const vaga = VAGAS.find(v => v.jira === f.vaga_jira) || {};
    const colaborador  = f.colaborador  || vaga.colaborador  || '—';
    const consultor    = f.consultor    || vaga.consultor    || '—';
    const regional     = vaga.regional  || '—';
    const cargo        = vaga.cargo     || '—';
    const matricula    = vaga.matricula || '—';
    const transporte   = vaga.transporte || f.transporte || '—';
    const autorizadoPor = f.autorizado_por || '—';
    const motivo       = f.motivo_rejeicao || 'Rejeitado';

    return `<div class="queue-card">
      <div class="qc-main">
        <strong>${colaborador}</strong>
        <span>${consultor} · ${regional} · ${cargo} · Matrícula ${matricula}</span>
        <small style="color:var(--muted);font-size:11px">Jira: ${f.vaga_jira||'—'}</small>
      </div>
      <span class="qc-transp">${transporte}</span>
      ${queueFilter==='pendente'
        ? `<div class="qc-actions">
            <button class="btn btn-success btn-sm" onclick="autorizarVoucher('${jira}')">Aprovar</button>
            <button class="btn btn-danger btn-sm"  onclick="rejeitarVoucher('${jira}')">Rejeitar</button>
           </div>`
        : queueFilter==='aprovado'
          ? `<span class="pill uniforme-enviado">Pré-aprovado por ${autorizadoPor}</span>`
          : `<span class="pill noshow">${motivo}</span>`
      }
    </div>`;
  }).join('');
}
async function autorizarVoucher(jira) {
  try {
    await rpc('wc_atualizar_fila', { p_jira:jira, p_status:'aprovado', p_motivo:'' });
    const v = VAGAS.find(x=>x.jira===jira);
    if (v) { v.filaVoucherStatus='aprovado'; v.filaVoucherAutorizadoPor=session.nome; }
    toast('Pré-aprovado!','success'); renderQueue(); atualizarBadgeFila();
  } catch(e) { toast(e.message,'error'); }
}
async function rejeitarVoucher(jira) {
  const motivo = prompt('Motivo da rejeição:')||'Rejeitado';
  try {
    await rpc('wc_atualizar_fila', { p_jira:jira, p_status:'rejeitado', p_motivo:motivo });
    const v = VAGAS.find(x=>x.jira===jira);
    if (v) { v.filaVoucherStatus='rejeitado'; v.filaVoucherMotivo=motivo; }
    toast('Rejeitado.','error'); renderQueue(); atualizarBadgeFila();
  } catch(e) { toast(e.message,'error'); }
}

// ── USUÁRIOS ──────────────────────────────────
let USUARIOS_LISTA = [];

async function renderUsuarios(tbodyId='tbody-usuarios') {
  const tbody = document.getElementById(tbodyId); if (!tbody) return;
  tbody.innerHTML='<tr><td colspan="4" style="padding:20px;color:var(--muted)">Carregando…</td></tr>';
  try {
    const resp = await rpc('wc_listar_usuarios', {});
    USUARIOS_LISTA = resp.usuarios || [];
    tbody.innerHTML = USUARIOS_LISTA.map(u => {
      const perfilPill = `<span class="pill muted">${PERFIL_LABEL[u.perfil]||u.perfil}</span>`;
      const statusPill = u.ativo===false
        ? '<span class="pill noshow">INATIVO</span>'
        : '<span class="pill vaga-noprazo">ATIVO</span>';
      const dataR = JSON.stringify(u).replace(/"/g,'&quot;');
      return `<tr style="cursor:pointer" onclick='abrirModalUsuario(${dataR})'>
        <td>
          <strong>${u.nome}</strong>
          <div style="font-size:11px;color:var(--muted);margin-top:1px">${u.email}</div>
        </td>
        <td>${perfilPill}</td>
        <td>${statusPill}</td>
      </tr>`;
    }).join('') || `<tr><td colspan="4"><div class="empty-state">Nenhum usuário</div></td></tr>`;
  } catch(e) { tbody.innerHTML=`<tr><td colspan="4" style="color:var(--danger);padding:16px">${e.message}</td></tr>`; }
}

// Sub-abas do modal de usuário
function switchMuTab(tab) {
  document.querySelectorAll('[data-mutab]').forEach(el => {
    el.classList.toggle('active', el.dataset.mutab === tab);
  });
}

async function abrirModalUsuario(u) {
  document.getElementById('mu-title').textContent = u ? 'Editar Usuário' : 'Novo Usuário';
  document.getElementById('u-id').value    = u ? u.id : '';
  document.getElementById('u-nome').value  = u ? u.nome : '';
  document.getElementById('u-email').value = u ? u.email : '';
  document.getElementById('u-senha').value = '';
  document.getElementById('u-perfil').value= u ? u.perfil : 'equipe';
  switchMuTab('dados');

  // Botões Desativar/Excluir — só ao editar
  const dangerDiv = document.getElementById('mu-danger-btns');
  const btnToggle = document.getElementById('btn-mu-toggle');
  if (dangerDiv) dangerDiv.style.display = u ? 'flex' : 'none';
  if (btnToggle && u) btnToggle.textContent = u.ativo===false ? 'Ativar' : 'Desativar';

  // Sempre recarregar operações
  try {
    const r = await rpc('wc_listar_operacoes', {});
    OPERACOES = r.operacoes || [];
  } catch(e) {}

  // Renderizar operações com checkboxes
  const opsGrid = document.getElementById('ops-grid');
  const userOps = new Set((u?.operacoes||[]).map(o=>o.id));
  if (opsGrid) {
    if (!OPERACOES.length) {
      opsGrid.innerHTML='<p style="color:var(--muted);font-size:12.5px">Nenhuma operação cadastrada ainda.</p>';
    } else {
      opsGrid.innerHTML = OPERACOES.map(o=>`
        <label class="ops-item">
          <input type="checkbox" data-op-id="${o.id}" ${userOps.has(o.id)?'checked':''}
            onchange="muAtualizarOpsPills()"/>
          <div class="op-label">${o.nome}</div>
          <span class="op-reg">${o.regional||''}</span>
        </label>`).join('');
    }
  }

  // Atualizar pills de operações na aba Dados
  muAtualizarOpsPills();

  // Renderizar permissões filtradas por perfil
  const container = document.getElementById('sistemas-permissoes');
  const perms = u?.permissoes || {};
  const perfilAtual = u?.perfil || 'equipe';
  if (container) {
    renderPermissoesPorPerfil(perfilAtual, perms);
    document.getElementById('u-perfil').onchange = function() {
      renderPermissoesPorPerfil(this.value, {});
    };
  }

  abrirModal('modal-usuario');
}

// Atualizar pills de operações na aba Dados em tempo real
function muAtualizarOpsPills() {
  const resumo = document.getElementById('mu-ops-resumo');
  const pillsEl = document.getElementById('mu-ops-pills');
  if (!resumo || !pillsEl) return;

  const marcadas = [...document.querySelectorAll('#ops-grid input[type=checkbox]:checked')]
    .map(el => {
      const label = el.closest('label');
      return label?.querySelector('.op-label')?.textContent || '';
    }).filter(Boolean);

  if (marcadas.length) {
    resumo.style.display = 'block';
    pillsEl.innerHTML = marcadas.map(nome =>
      `<span style="background:var(--surface2);border:1px solid var(--border);border-radius:20px;padding:3px 10px;font-size:11.5px;font-weight:600;color:var(--text)">${nome}</span>`
    ).join('');
  } else {
    resumo.style.display = 'none';
    pillsEl.innerHTML = '';
  }
}

// Desativar/Ativar usuário direto do modal
async function muToggleAtivo() {
  const id = document.getElementById('u-id').value;
  if (!id) return;
  const btn = document.getElementById('btn-mu-toggle');
  btn.disabled = true;
  try {
    await rpc('wc_toggle_usuario', { p_id: id });
    fecharModal('modal-usuario');
    await renderUsuarios('tbody-usuarios');
    await renderUsuarios('tbody-suporte-usuarios');
    toast('Status atualizado!', 'success');
  } catch(e) { toast(e.message, 'error'); }
  finally { btn.disabled = false; }
}

// Excluir usuário direto do modal
async function muExcluir() {
  const id   = document.getElementById('u-id').value;
  const nome = document.getElementById('u-nome').value;
  if (!id) return;
  if (!confirm(`Excluir o usuário "${nome}"? Esta ação não pode ser desfeita.`)) return;
  try {
    await rpc('wc_excluir_usuario', { p_id: id });
    fecharModal('modal-usuario');
    await renderUsuarios('tbody-usuarios');
    await renderUsuarios('tbody-suporte-usuarios');
    toast('Usuário excluído.', 'success');
  } catch(e) { toast(e.message, 'error'); }
}

function renderPermissoesPorPerfil(perfil, perms) {
  const container = document.getElementById('sistemas-permissoes');
  if (!container) return;

  const GRUPOS_RS  = ['Seleção & Admissão'];
  const GRUPOS_ADP = ['Administração de Pessoal — Voucher Uber','Administração de Pessoal — Benefícios','Administração de Pessoal — Tickets Shopee','Template — Colaboradores','Solicitações'];
  const GRUPOS_SUP = ['Suporte','Cadastros'];

  // Filtra grupos por perfil
  let gruposFiltrados;
  if (perfil === 'master') {
    gruposFiltrados = PERMISSOES_GRUPOS;
  } else if (perfil === 'equipe') {
    gruposFiltrados = PERMISSOES_GRUPOS.filter(g => GRUPOS_RS.includes(g.grupo) || GRUPOS_SUP.includes(g.grupo));
  } else if (perfil === 'onsite' || perfil === 'folha') {
    gruposFiltrados = PERMISSOES_GRUPOS.filter(g => GRUPOS_ADP.includes(g.grupo) || GRUPOS_SUP.includes(g.grupo));
  } else if (perfil === 'gestor') {
    // Gestor: checkboxes de sistema no topo + permissões dos sistemas selecionados
    renderPermissoesGestor(perms);
    return;
  } else {
    gruposFiltrados = PERMISSOES_GRUPOS;
  }

  const isMaster = perfil === 'master';
  let html = '';
  if (isMaster) {
    html += '<div style="background:rgba(99,204,176,.08);border:1px solid var(--accent);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:12px;color:var(--accent)">🔑 Master tem acesso total a todos os módulos automaticamente.</div>';
  }
  gruposFiltrados.forEach(function(g) {
    html += '<div style="margin-bottom:16px">';
    html += '<div style="font-size:9.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;padding-bottom:5px;margin-bottom:8px;border-bottom:1px solid var(--border)">' + g.grupo + '</div>';
    html += '<div class="sistemas-grid">';
    g.itens.forEach(function(s) {
      const disabled = s.em_breve || isMaster;
      const checked  = isMaster ? true : (perms[s.id] === true);
      const opacity  = s.em_breve ? 'opacity:.4' : '';
      const emBreve  = s.em_breve ? ' <span style="font-size:9px;color:var(--muted)">(em breve)</span>' : '';
      html += '<div class="sistema-row" style="' + opacity + '">';
      html += '<div class="sistema-info"><strong>' + s.nome + emBreve + '</strong><span>' + s.descricao + '</span></div>';
      html += '<label class="toggle-switch"><input type="checkbox" id="perm-' + s.id + '"' + (checked?' checked':'') + (disabled?' disabled':'') + '><span class="slider"></span></label>';
      html += '</div>';
    });
    html += '</div></div>';
  });
  container.innerHTML = html;
}

function renderPermissoesGestor(perms) {
  const container = document.getElementById('sistemas-permissoes');
  if (!container) return;
  const GRUPOS_RS  = ['Seleção & Admissão'];
  const GRUPOS_ADP = ['Administração de Pessoal — Voucher Uber','Administração de Pessoal — Benefícios','Administração de Pessoal — Tickets Shopee','Template — Colaboradores','Solicitações'];
  const GRUPOS_SUP = ['Suporte','Cadastros'];

  // Ler estado atual dos checkboxes ANTES de sobrescrever o DOM
  const _rsExist  = document.getElementById('gestor-acesso-rs');
  const _adpExist = document.getElementById('gestor-acesso-adp');

  // Fallback: detectar nas perms salvas se checkboxes ainda não existem
  const temRS  = PERMISSOES_GRUPOS.filter(g=>GRUPOS_RS.includes(g.grupo)).flatMap(g=>g.itens).some(s=>perms[s.id]);
  const temADP = PERMISSOES_GRUPOS.filter(g=>GRUPOS_ADP.includes(g.grupo)).flatMap(g=>g.itens).some(s=>perms[s.id]);

  const mostraRS  = _rsExist  ? _rsExist.checked  : temRS;
  const mostraADP = _adpExist ? _adpExist.checked : temADP;

  const renderGrupos = (grupos, mostrar) => {
    if (!mostrar) return '';
    let g_html = '';
    PERMISSOES_GRUPOS.filter(g=>grupos.includes(g.grupo)).forEach(function(g) {
      g_html += '<div style="margin-bottom:16px">';
      g_html += '<div style="font-size:9.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;padding-bottom:5px;margin-bottom:8px;border-bottom:1px solid var(--border)">' + g.grupo + '</div>';
      g_html += '<div class="sistemas-grid">';
      g.itens.forEach(function(s) {
        const disabled = !!s.em_breve;
        const checked  = perms[s.id] === true;
        const opacity  = s.em_breve ? 'opacity:.4' : '';
        const emBreve  = s.em_breve ? ' <span style="font-size:9px;color:var(--muted)">(em breve)</span>' : '';
        g_html += '<div class="sistema-row" style="' + opacity + '">';
        g_html += '<div class="sistema-info"><strong>' + s.nome + emBreve + '</strong><span>' + s.descricao + '</span></div>';
        g_html += '<label class="toggle-switch"><input type="checkbox" id="perm-' + s.id + '"' + (checked?' checked':'') + (disabled?' disabled':'') + '><span class="slider"></span></label>';
        g_html += '</div>';
      });
      g_html += '</div></div>';
    });
    return g_html;
  };

  let html = '';
  html += '<div style="margin-bottom:18px">';
  html += '<div style="font-size:9.5px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.8px;margin-bottom:10px">Sistemas com acesso</div>';
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap">';
  html += `<label style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 16px;cursor:pointer;font-size:13px;font-weight:600">
    <input type="checkbox" id="gestor-acesso-rs" ${mostraRS?'checked':''}> 🔍 Seleção &amp; Admissão</label>`;
  html += `<label style="display:flex;align-items:center;gap:8px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:10px 16px;cursor:pointer;font-size:13px;font-weight:600">
    <input type="checkbox" id="gestor-acesso-adp" ${mostraADP?'checked':''}> 🐝 Adm. de Pessoal</label>`;
  html += '</div></div>';
  html += renderGrupos(GRUPOS_RS, mostraRS);
  html += renderGrupos(GRUPOS_ADP, mostraADP);
  html += renderGrupos(GRUPOS_SUP, true);

  container.innerHTML = html;

  // Bind após render
  const rsEl  = document.getElementById('gestor-acesso-rs');
  const adpEl = document.getElementById('gestor-acesso-adp');
  if (rsEl)  rsEl.onchange  = () => renderPermissoesGestor(coletarPermsAtuais());
  if (adpEl) adpEl.onchange = () => renderPermissoesGestor(coletarPermsAtuais());
}
function coletarPermsAtuais() {
  const p = {};
  PERMISSOES_GRUPOS.flatMap(g=>g.itens).forEach(s => {
    const inp = document.getElementById('perm-'+s.id);
    if (inp) p[s.id] = inp.checked;
  });
  // Preservar estado dos checkboxes de sistema do gestor
  const rsEl  = document.getElementById('gestor-acesso-rs');
  const adpEl = document.getElementById('gestor-acesso-adp');
  if (rsEl && rsEl.checked) {
    // Marcar todas RS como true se RS foi ativado
    ['rs_dashboard','rs_vagas','rs_voucher','rs_indicacoes'].forEach(id => { if (!(id in p)) p[id] = false; });
  }
  return p;
}

async function salvarUsuario() {
  const id    = document.getElementById('u-id').value;
  const nome  = document.getElementById('u-nome').value.trim();
  const email = document.getElementById('u-email').value.trim().toLowerCase();
  let   senha = document.getElementById('u-senha').value;
  const perf  = document.getElementById('u-perfil').value;
  const btn   = document.getElementById('btn-salvar-usuario');
  if (!nome||!email) { toast('Informe nome e e-mail.','error'); return; }

  // Novo usuário sem senha → define temporária automaticamente
  const isNovo         = !id;
  const senhaTem       = isNovo && !senha;
  if (senhaTem) senha = 'WeCan@2026';

  // Operações selecionadas
  const operacoes = [...document.querySelectorAll('#ops-grid input[data-op-id]:checked')]
    .map(i => i.dataset.opId);

  // Permissões — todos os grupos
  const permissoes = {};
  PERMISSOES_GRUPOS.flatMap(g=>g.itens).forEach(s => {
    const inp = document.getElementById('perm-'+s.id);
    permissoes[s.id] = inp ? inp.checked : false;
  });

  btn.disabled=true; btn.textContent='Salvando…';
  try {
    await rpc('wc_salvar_usuario', { p_usuario:{
      id:id||undefined, nome, email,
      senha: senha||undefined,
      senha_temporaria: senhaTem,
      perfil:perf, permissoes, operacoes
    }});
    fecharModal('modal-usuario');
    await renderUsuarios('tbody-usuarios');
    await renderUsuarios('tbody-suporte-usuarios');
    toast(senhaTem ? 'Usuário criado com senha temporária WeCan@2026' : 'Usuário salvo!', 'success');
  } catch(e) { toast(e.message,'error'); }
  finally { btn.disabled=false; btn.textContent='Salvar'; }
}

async function toggleUsuarioAtivo(id) {
  try {
    const resp = await rpc('wc_toggle_usuario', { p_id:id });
    await renderUsuarios('tbody-usuarios');
    await renderUsuarios('tbody-suporte-usuarios');
    toast(resp.ativo?'Usuário ativado.':'Usuário desativado.','success');
  } catch(e) { toast(e.message,'error'); }
}

async function excluirUsuario(id, nome) {
  if (!confirm(`Excluir o acesso de ${nome}? Irreversível.`)) return;
  try {
    await rpc('wc_excluir_usuario', { p_id:id });
    await renderUsuarios('tbody-usuarios');
    await renderUsuarios('tbody-suporte-usuarios');
    toast('Usuário excluído.','success');
  } catch(e) { toast(e.message,'error'); }
}

// ── CONFIGURAÇÕES ─────────────────────────────
const CFG_COLORS = [
  '#63ccb0','#4f7cff','#a855f7','#ec4899','#f59e0b',
  '#22c55e','#ef4444','#14b8a6','#f97316','#06b6d4'
];

function iniciarConfiguracoes() {
  // Swatches de cor
  const grid=document.getElementById('color-swatches');
  if (!grid) return;
  grid.innerHTML=CFG_COLORS.map(c=>`
    <div class="color-swatch" style="background:${c}" data-color="${c}" onclick="selecionarCor('${c}')" title="${c}"></div>
  `).join('');

  // Carregar configurações salvas do Supabase
  carregarConfiguracoes();
}

function renderConfiguracoes() {
  if (ehMaster()) {
    const card=document.getElementById('cfg-logo-card');
    if (card) card.style.display='block';
  }
}

async function carregarConfiguracoes() {
  try {
    const resp=await rpc('wc_carregar_config',{});
    if (resp.config) {
      const cfg=resp.config;
      if (cfg.cor_tema) aplicarCorTema(cfg.cor_tema,false);
      if (cfg.tema)     aplicarTema(cfg.tema, false);
      if (cfg.logo_empresa) aplicarLogoSidebar(cfg.logo_empresa);
      if (cfg.foto_perfil)  aplicarAvatarSidebar(cfg.foto_perfil);
    }
  } catch(e) { /* silencioso */ }
}

function selecionarCor(cor) {
  document.querySelectorAll('.color-swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===cor));
  document.getElementById('cfg-color-custom').value=cor;
  aplicarCorTema(cor);
}

function aplicarCorTema(cor, updateSwatch=true) {
  document.documentElement.style.setProperty('--accent',cor);
  // accent-dim: 20% mais escuro
  document.getElementById('cfg-color-custom').value=cor;
  if (updateSwatch) {
    document.querySelectorAll('.color-swatch').forEach(s=>s.classList.toggle('active',s.dataset.color===cor));
  }
}

async function salvarCorTema() {
  const cor=document.getElementById('cfg-color-custom').value;
  try {
    await rpc('wc_salvar_config',{p_chave:'cor_tema',p_valor:cor});
    await rpc('wc_salvar_config',{p_chave:'tema',p_valor:_TEMA_ATUAL});
    toast('Tema e cor salvos!','success');
  } catch(e) { toast(e.message,'error'); }
}

function previewAvatar(input) {
  const file=input.files[0]; if (!file) return;
  if (file.size>1.2*1024*1024) { toast('Imagem muito grande (máx. 1MB).','error'); return; }
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=document.getElementById('cfg-avatar-preview');
    prev.innerHTML=`<img src="${e.target.result}" alt="preview"/>`;
    window._avatarBase64=e.target.result;
  };
  reader.readAsDataURL(file);
}

function aplicarAvatarSidebar(base64) {
  const av=document.getElementById('user-avatar');
  if (av) av.innerHTML=`<img src="${base64}" alt="foto"/>`;
  const prev=document.getElementById('cfg-avatar-preview');
  if (prev) prev.innerHTML=`<img src="${base64}" alt="preview"/>`;
}

async function salvarFotoPerfil() {
  if (!window._avatarBase64) { toast('Selecione uma foto primeiro.','error'); return; }
  try {
    await rpc('wc_salvar_config',{p_chave:'foto_perfil',p_valor:window._avatarBase64});
    aplicarAvatarSidebar(window._avatarBase64);
    toast('Foto de perfil salva!','success');
  } catch(e) { toast(e.message,'error'); }
}

async function removerFotoPerfil() {
  if (!confirm('Remover foto de perfil?')) return;
  try {
    await rpc('wc_salvar_config',{p_chave:'foto_perfil',p_valor:''});
    window._avatarBase64=null;
    const initials=(session.nome||'?').split(' ').map(p=>p[0]).slice(0,2).join('');
    document.getElementById('user-avatar').textContent=initials;
    document.getElementById('cfg-avatar-preview').innerHTML='?';
    toast('Foto removida.','success');
  } catch(e) { toast(e.message,'error'); }
}

function previewLogo(input) {
  const file=input.files[0]; if (!file) return;
  if (file.size>1.2*1024*1024) { toast('Imagem muito grande (máx. 1MB).','error'); return; }
  const reader=new FileReader();
  reader.onload=e=>{
    const prev=document.getElementById('cfg-logo-preview');
    prev.innerHTML=`<img src="${e.target.result}" alt="logo"/>`;
    window._logoBase64=e.target.result;
  };
  reader.readAsDataURL(file);
}

function aplicarLogoSidebar(base64) {
  const mark=document.getElementById('logo-mark');
  if (mark) mark.innerHTML=`<img src="${base64}" alt="logo"/>`;
  const prev=document.getElementById('cfg-logo-preview');
  if (prev) prev.innerHTML=`<img src="${base64}" alt="logo"/>`;
}

async function salvarLogo() {
  if (!window._logoBase64) { toast('Selecione uma logo primeiro.','error'); return; }
  try {
    await rpc('wc_salvar_config',{p_chave:'logo_empresa',p_valor:window._logoBase64});
    aplicarLogoSidebar(window._logoBase64);
    toast('Logo salva!','success');
  } catch(e) { toast(e.message,'error'); }
}

async function removerLogo() {
  if (!confirm('Remover logo da empresa?')) return;
  try {
    await rpc('wc_salvar_config',{p_chave:'logo_empresa',p_valor:''});
    window._logoBase64=null;
    document.getElementById('logo-mark').innerHTML='SA';
    document.getElementById('cfg-logo-preview').innerHTML='<span style="font-size:11px;color:var(--muted);">Sem logo</span>';
    toast('Logo removida.','success');
  } catch(e) { toast(e.message,'error'); }
}

// ── HELPERS ───────────────────────────────────
function abrirModal(id)  { document.getElementById(id)?.classList.add('open'); }
function fecharModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.addEventListener('click', e=>{ if (e.target.classList.contains('modal-backdrop')) e.target.classList.remove('open'); });
function toast(msg, tipo) {
  const el=document.getElementById('toast'); if (!el) return;
  el.textContent=msg; el.className='show'+(tipo?' '+tipo:'');
  clearTimeout(window._toastTimer);
  window._toastTimer=setTimeout(()=>el.className='',4500);
}

// ══════════════════════════════════════════════
//  CADASTROS — Clientes, Centro de Custo, Departamentos
// ══════════════════════════════════════════════
let CENTROS_CUSTO = [];
let CLIENTES      = [];
let DEPTOS        = [];

// ── CEP helpers ───────────────────────────────
function cadFormatarCEP(input) {
  let v = input.value.replace(/\D/g,'').slice(0,8);
  if (v.length > 5) v = v.slice(0,5)+'-'+v.slice(5);
  input.value = v;
}

async function cadBuscarCEP(prefix) {
  const cepEl    = document.getElementById(`${prefix}-cep`);
  const spinnerEl = document.getElementById(`${prefix}-cep-spinner`);
  const cep = (cepEl?.value||'').replace(/\D/g,'');
  if (cep.length !== 8) return;
  if (spinnerEl) spinnerEl.style.display = 'block';
  try {
    const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
    const d = await r.json();
    if (d.erro) { toast('CEP não encontrado.','error'); return; }
    const s = id => document.getElementById(`${prefix}-${id}`);
    if (s('logradouro')) s('logradouro').value = d.logradouro||'';
    if (s('bairro'))     s('bairro').value     = d.bairro||'';
    if (s('cidade'))     s('cidade').value     = d.localidade||'';
    if (s('uf'))         s('uf').value         = d.uf||'';
    if (s('numero'))     s('numero').focus();
  } catch(e) { toast('Erro ao buscar CEP.','error'); }
  finally { if (spinnerEl) spinnerEl.style.display = 'none'; }
}

// ── CENTRO DE CUSTO ───────────────────────────
async function carregarCentrosCusto() {
  try {
    const r = await rpc('wc_listar_cc', {});
    CENTROS_CUSTO = r.centros || [];
    renderCentrosCusto();
    const t=CENTROS_CUSTO.length, a=CENTROS_CUSTO.filter(c=>c.ativo).length;
    const s=id=>document.getElementById(id);
    if(s('kpi-cc-total'))   s('kpi-cc-total').textContent   = t;
    if(s('kpi-cc-ativos'))  s('kpi-cc-ativos').textContent  = a;
    if(s('kpi-cc-inativos'))s('kpi-cc-inativos').textContent= t-a;
  } catch(e) { toast(e.message,'error'); }
}

function renderCentrosCusto() {
  cpTheadCC();
  const busca  = (document.getElementById('busca-cc')?.value||'').toLowerCase();
  const filtro = document.getElementById('filtro-cc-status')?.value||'';
  let lista = [...CENTROS_CUSTO];
  if (busca)  lista = lista.filter(c=>[c.cod,c.cli_codigo,c.cliente,c.descricao,c.cidade,c.uf].some(f=>(f||'').toLowerCase().includes(busca)));
  if (filtro==='ativo')   lista = lista.filter(c=>c.ativo);
  if (filtro==='inativo') lista = lista.filter(c=>!c.ativo);
  const tbody=document.getElementById('tbody-cc'), count=document.getElementById('cc-count');
  if (!tbody) return;
  const ativas=_cpAtivas['cc_cad']||new Set(CC_CAD_COLUNAS.filter(c=>c.default).map(c=>c.id));
  const cols=CC_CAD_COLUNAS.filter(c=>ativas.has(c.id)).map(c=>c.id);
  const ncols=cols.length||1;
  if (!lista.length) { tbody.innerHTML=`<tr><td colspan="${ncols}"><div class="empty-state"><div class="ico">🏢</div>Nenhum centro de custo encontrado</div></td></tr>`; if(count)count.textContent=''; return; }
  if(count) count.textContent=`${lista.length} centro(s)`;
  const podeCriar=podeVerTudo(), podExcluir=session?.perfil==='master';
  tbody.innerHTML = lista.map(c=>{
    const cellMap={
      codigo:  `<td><code style="font-size:11.5px;font-weight:700">${c.cod}</code></td>`,
      cliente: `<td>${c.cli_codigo?`<div style="font-size:10px;color:var(--muted);font-weight:700">${c.cli_codigo}</div>`:''}<div>${c.cliente||'—'}</div></td>`,
      descricao:`<td>${c.descricao||'—'}</td>`,
      tipo_op: `<td>${c.tipo_operacao?`<span class="pill" style="background:rgba(99,204,176,.15);color:var(--accent);font-size:10px">${c.tipo_operacao}</span>`:'<span style="color:var(--muted)">—</span>'}</td>`,
      cidade:  `<td>${[c.cidade,c.uf].filter(Boolean).join(' / ')||'—'}</td>`,
      status:  `<td><span class="pill ${c.ativo?'pill-ativo':'pill-inativo'}">${c.ativo?'ATIVO':'INATIVO'}</span></td>`,
      acoes:   `<td class="actions-cell">${podeCriar?`<button class="btn btn-ghost btn-sm" onclick='abrirModalCC(${JSON.stringify(c)})'>Editar</button>`:''} ${podeCriar?`<button class="btn btn-ghost btn-sm" onclick="toggleCC_cad('${c.id}')">${c.ativo?'Desativar':'Ativar'}</button>`:''} ${podExcluir?`<button class="btn btn-danger btn-sm" onclick="excluirCC_cad('${c.id}','${(c.cod||'').replace(/'/g,"\\'")}')">Excluir</button>`:''}</td>`,
    };
    return `<tr>${cols.map(id=>cellMap[id]||'<td>—</td>').join('')}</tr>`;
  }).join('');
}

function abrirModalCC(c) {
  const s=id=>document.getElementById(id);
  s('modal-cc-title').textContent = c ? 'Editar Centro de Custo' : 'Novo Centro de Custo';
  s('modal-cc-sub').textContent   = c ? `Código: ${c.cod}` : 'Preencha os dados';
  s('cc-id').value             = c?.id||'';
  s('cc-cod').value            = c?.cod||'';
  s('cc-cli-codigo').value     = c?.cli_codigo||'';
  s('cc-cliente').value        = c?.cliente||'';
  // Em edição: mostrar número do CC e hint; campo cod readonly sempre
  const hint = document.getElementById('cc-cod-hint');
  if (c) {
    if (hint) hint.textContent = c.cli_codigo ? `CC ${c.cod} do cliente ${c.cli_codigo}` : '';
  } else {
    s('cc-cod').value = '';
    if (hint) hint.textContent = '';
  }
  s('cc-descricao').value      = c?.descricao||'';
  s('cc-tipo-operacao').value  = c?.tipo_operacao||'';
  s('cc-ativo').checked        = c ? c.ativo : true;
  s('cc-cep').value        = c?.cep||'';
  s('cc-logradouro').value = c?.logradouro||'';
  s('cc-numero').value     = c?.numero||'';
  s('cc-complemento').value= c?.complemento||'';
  s('cc-bairro').value     = c?.bairro||'';
  s('cc-cidade').value     = c?.cidade||'';
  s('cc-uf').value         = c?.uf||'';
  document.getElementById('modal-cc').classList.add('open');
}
function fecharModalCC() { document.getElementById('modal-cc').classList.remove('open'); }

function ccPreencherCliente(codigo) {
  const q   = codigo.trim().replace(/^0+/, '');
  const cli = CLIENTES.find(c =>
    c.codigo === codigo.trim() ||
    c.codigo === q ||
    (c.codigo||'').replace(/^0+/,'') === q
  );
  const elNome = document.getElementById('cc-cliente');
  const elCod  = document.getElementById('cc-cod');
  const elHint = document.getElementById('cc-cod-hint');
  const isNovo = !document.getElementById('cc-id').value; // só gera sequencial em novo cadastro

  if (cli) {
    elNome.value       = cli.razao_social || '';
    elNome.style.color = 'var(--text)';

    if (isNovo) {
      // Contar quantos CCs esse cliente já tem e gerar próximo número
      const ccsDoCliente = CENTROS_CUSTO.filter(c => {
        const cq = (c.cli_codigo||'').replace(/^0+/,'');
        return c.cli_codigo === codigo.trim() || c.cli_codigo === q || cq === q;
      });
      const proximo = ccsDoCliente.length + 1;
      elCod.value  = String(proximo);
      if (elHint) elHint.textContent = `(${ccsDoCliente.length} CC${ccsDoCliente.length!==1?'s':''} já cadastrado${ccsDoCliente.length!==1?'s':''})`;
    }
  } else {
    elNome.value       = codigo.length >= 2 ? '⚠️ Cliente não encontrado' : '';
    elNome.style.color = codigo.length >= 2 ? 'var(--warning)' : 'var(--muted)';
    if (isNovo && elCod) { elCod.value = ''; if (elHint) elHint.textContent = ''; }
  }
}

async function salvarCC() {
  const btn=document.getElementById('btn-salvar-cc'), g=id=>document.getElementById(id)?.value||'';
  const cc = { id:g('cc-id')||undefined, cod:g('cc-cod').trim(), cliente:g('cc-cliente').trim(),
    cli_codigo:g('cc-cli-codigo').trim(), descricao:g('cc-descricao').trim(),
    tipo_operacao:g('cc-tipo-operacao'),
    ativo:document.getElementById('cc-ativo').checked,
    cep:g('cc-cep').trim(), logradouro:g('cc-logradouro').trim(), numero:g('cc-numero').trim(),
    complemento:g('cc-complemento').trim(), bairro:g('cc-bairro').trim(),
    cidade:g('cc-cidade').trim(), uf:g('cc-uf') };
  if (!cc.cliente) { toast('Informe o cliente.','error'); return; }
  btn.disabled=true; btn.textContent='Salvando…';
  try {
    const r = await rpc('wc_salvar_cc', { p_cc: cc });
    fecharModalCC();
    await carregarCentrosCusto();
    await carregarOperacoes(); // mantém OPERACOES sincronizadas com CCs
    toast(`Centro ${r.cod} salvo!`,'success');
  } catch(e) { toast(e.message,'error'); }
  finally { btn.disabled=false; btn.textContent='Salvar'; }
}
async function toggleCC_cad(id) {
  try {
    const r = await rpc('wc_toggle_cc',{p_id:id});
    await carregarCentrosCusto();
    await carregarOperacoes();
    toast(r.ativo?'Ativado.':'Desativado.','success');
  } catch(e) { toast(e.message,'error'); }
}
async function excluirCC_cad(id,cod) {
  if(!confirm(`Excluir Centro de Custo ${cod}?`)) return;
  try {
    await rpc('wc_excluir_cc',{p_id:id});
    await carregarCentrosCusto();
    await carregarOperacoes();
    toast('Excluído.','success');
  } catch(e){toast(e.message,'error');}
}

// ── CLIENTES ──────────────────────────────────
async function carregarClientes() {
  try {
    const r = await rpc('wc_listar_clientes', {});
    CLIENTES = r.clientes || [];
    renderClientes();
    const t=CLIENTES.length, a=CLIENTES.filter(c=>c.ativo).length;
    const s=id=>document.getElementById(id);
    if(s('kpi-cli-total'))   s('kpi-cli-total').textContent   = t;
    if(s('kpi-cli-ativos'))  s('kpi-cli-ativos').textContent  = a;
    if(s('kpi-cli-inativos'))s('kpi-cli-inativos').textContent= t-a;
  } catch(e) { toast(e.message,'error'); }
}

function renderClientes() {
  cpTheadCli();
  const busca=(document.getElementById('busca-cli')?.value||'').toLowerCase();
  const filtro=document.getElementById('filtro-cli-status')?.value||'';
  let lista=[...CLIENTES];
  if(busca) lista=lista.filter(c=>[c.codigo,c.razao_social,c.nome_fantasia,c.cidade,c.uf,c.cnpj].some(f=>(f||'').toLowerCase().includes(busca)));
  if(filtro==='ativo')   lista=lista.filter(c=>c.ativo);
  if(filtro==='inativo') lista=lista.filter(c=>!c.ativo);
  const tbody=document.getElementById('tbody-clientes'), count=document.getElementById('clientes-count');
  if(!tbody) return;
  const ativas=_cpAtivas['cli']||new Set(CLI_COLUNAS.filter(c=>c.default).map(c=>c.id));
  const cols=CLI_COLUNAS.filter(c=>ativas.has(c.id)).map(c=>c.id);
  const ncols=cols.length||1;
  if(!lista.length){tbody.innerHTML=`<tr><td colspan="${ncols}"><div class="empty-state"><div class="ico">🏭</div>Nenhum cliente encontrado</div></td></tr>`;if(count)count.textContent='';return;}
  if(count) count.textContent=`${lista.length} cliente(s)`;
  const pode=podeVerTudo();
  tbody.innerHTML=lista.map(c=>{
    const cellMap={
      codigo:  `<td><code style="font-size:11.5px;font-weight:700">${c.codigo||'—'}</code></td>`,
      razao:   `<td><strong>${c.razao_social||'—'}</strong></td>`,
      fantasia:`<td>${c.nome_fantasia||'—'}</td>`,
      cnpj:    `<td>${c.cnpj||'—'}</td>`,
      cidade:  `<td>${[c.cidade,c.uf].filter(Boolean).join(' / ')||'—'}</td>`,
      grupo:   `<td>${c.grupo_nome||'—'}</td>`,
      status:  `<td><span class="pill ${c.ativo?'pill-ativo':'pill-inativo'}">${c.ativo?'ATIVO':'INATIVO'}</span></td>`,
      acoes:   `<td class="actions-cell">${pode?`<button class="btn btn-ghost btn-sm" onclick='abrirModalCliente(${JSON.stringify(c)})'>Editar</button>`:''} ${pode?`<button class="btn btn-ghost btn-sm" onclick="toggleCliente('${c.id}')">${c.ativo?'Desativar':'Ativar'}</button>`:''}</td>`,
    };
    return `<tr>${cols.map(id=>cellMap[id]||'<td>—</td>').join('')}</tr>`;
  }).join('');
}

function abrirModalCliente(c) {
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val||'';};
  document.getElementById('modal-cli-title').textContent=c?'Editar Cliente':'Novo Cliente';
  document.getElementById('modal-cli-sub').textContent=c?`Código: ${c.codigo}`:'Preencha os dados';
  ['cli-id','cli-codigo','cli-razao-social','cli-nome-fantasia'].forEach(f=>set(f,c?.[f.replace('cli-','').replace(/-([a-z])/g,(_,l)=>l.toUpperCase())]));
  set('cli-id',c?.id); set('cli-codigo',c?.codigo); set('cli-razao-social',c?.razao_social);
  set('cli-nome-fantasia',c?.nome_fantasia); set('cli-inscricao',c?.cnpj);
  set('cli-tipo-inscricao',c?.tipo_inscricao||'1 - CNPJ'); set('cli-regiao',c?.regiao);
  set('cli-cep',c?.cep); set('cli-tipo-end',c?.tipo_end); set('cli-logradouro',c?.logradouro);
  set('cli-numero',c?.numero); set('cli-complemento',c?.complemento); set('cli-bairro',c?.bairro);
  set('cli-cod-cidade',c?.cod_cidade); set('cli-cidade',c?.cidade); set('cli-uf',c?.uf);
  set('cli-tel-livre',c?.tel_livre); set('cli-tel-numero',c?.tel_numero); set('cli-ramal',c?.ramal);
  set('cli-contato',c?.contato); set('cli-email',c?.email);
  set('cli-inscricao-estadual',c?.inscricao_estadual); set('cli-inscricao-municipal',c?.inscricao_municipal);
  set('cli-ccm',c?.ccm); set('cli-grupo-cod',c?.grupo_cod); set('cli-grupo-nome',c?.grupo_nome);
  set('cli-centro-resultado-cod',c?.centro_resultado_cod); set('cli-centro-resultado-nome',c?.centro_resultado_nome);
  set('cli-mascara-cc',c?.mascara_cc); set('cli-ctr-web',c?.ctr_web);
  const ativoEl=document.getElementById('cli-ativo'); if(ativoEl) ativoEl.checked=c?c.ativo:true;
  document.getElementById('modal-cliente').classList.add('open');
}
function fecharModalCliente(){document.getElementById('modal-cliente').classList.remove('open');}

async function salvarCliente() {
  const btn=document.getElementById('btn-salvar-cli'), g=id=>document.getElementById(id)?.value||'';
  const cli={id:g('cli-id')||undefined,codigo:g('cli-codigo').trim(),razao_social:g('cli-razao-social').trim(),
    nome_fantasia:g('cli-nome-fantasia').trim(),cnpj:g('cli-inscricao').trim(),tipo_inscricao:g('cli-tipo-inscricao'),
    ativo:document.getElementById('cli-ativo')?.checked??true,regiao:g('cli-regiao').trim(),
    cep:g('cli-cep').trim(),tipo_end:g('cli-tipo-end'),logradouro:g('cli-logradouro').trim(),
    numero:g('cli-numero').trim(),complemento:g('cli-complemento').trim(),bairro:g('cli-bairro').trim(),
    cod_cidade:g('cli-cod-cidade').trim(),cidade:g('cli-cidade').trim(),uf:g('cli-uf'),
    tel_livre:g('cli-tel-livre').trim(),tel_numero:g('cli-tel-numero').trim(),ramal:g('cli-ramal').trim(),
    contato:g('cli-contato').trim(),email:g('cli-email').trim(),
    inscricao_estadual:g('cli-inscricao-estadual').trim(),inscricao_municipal:g('cli-inscricao-municipal').trim(),
    ccm:g('cli-ccm').trim(),grupo_cod:g('cli-grupo-cod').trim(),grupo_nome:g('cli-grupo-nome').trim(),
    centro_resultado_cod:g('cli-centro-resultado-cod').trim(),centro_resultado_nome:g('cli-centro-resultado-nome').trim(),
    mascara_cc:g('cli-mascara-cc').trim(),ctr_web:g('cli-ctr-web').trim()};
  if(!cli.razao_social){toast('Informe a Razão Social.','error');return;}
  btn.disabled=true;btn.textContent='Salvando…';
  try{await rpc('wc_salvar_cliente',{p_cliente:cli});fecharModalCliente();await carregarClientes();toast('Cliente salvo!','success');}
  catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.textContent='Salvar';}
}
async function toggleCliente(id){
  try{const r=await rpc('wc_toggle_cliente',{p_id:id});await carregarClientes();toast(r.ativo?'Cliente ativado.':'Desativado.','success');}catch(e){toast(e.message,'error');}
}

// ── DEPARTAMENTOS ─────────────────────────────
async function carregarDeptos() {
  try {
    const r=await rpc('wc_listar_deptos',{});
    DEPTOS=r.deptos||[];
    renderDeptos();
    const t=DEPTOS.length, cl=new Set(DEPTOS.map(d=>d.cli_codigo).filter(Boolean)).size;
    const s=id=>document.getElementById(id);
    if(s('kpi-dep-total'))    s('kpi-dep-total').textContent    = t;
    if(s('kpi-dep-clientes')) s('kpi-dep-clientes').textContent = cl;
  } catch(e){toast(e.message,'error');}
}

function renderDeptos() {
  cpTheadDep();
  const busca=(document.getElementById('busca-dep')?.value||'').toLowerCase();
  let lista=[...DEPTOS];
  if(busca) lista=lista.filter(d=>[d.codigo,d.descricao,d.cli_codigo,d.cli_nome].some(f=>(f||'').toLowerCase().includes(busca)));
  const tbody=document.getElementById('tbody-deptos'),count=document.getElementById('deptos-count');
  if(!tbody) return;
  const ativas=_cpAtivas['dep']||new Set(DEP_COLUNAS.filter(c=>c.default).map(c=>c.id));
  const cols=DEP_COLUNAS.filter(c=>ativas.has(c.id)).map(c=>c.id);
  const ncols=cols.length||1;
  if(!lista.length){tbody.innerHTML=`<tr><td colspan="${ncols}"><div class="empty-state"><div class="ico">🗂️</div>Nenhum departamento encontrado</div></td></tr>`;if(count)count.textContent='';return;}
  if(count) count.textContent=`${lista.length} departamento(s)`;
  const pode=podeVerTudo();
  tbody.innerHTML=lista.map(d=>{
    const cellMap={
      codigo:  `<td><code style="font-size:11.5px;font-weight:700">${d.codigo||'—'}</code></td>`,
      descricao:`<td>${d.descricao||'—'}</td>`,
      tipo_op: `<td>${d.tipo_operacao?`<span class="pill" style="background:rgba(99,204,176,.15);color:var(--accent);font-size:10px">${d.tipo_operacao}</span>`:'<span style="color:var(--muted)">—</span>'}</td>`,
      cli_cod: `<td><code style="font-size:11px">${d.cli_codigo||'—'}</code></td>`,
      obs:     `<td style="max-width:200px;white-space:normal;font-size:12px;color:var(--muted)">${d.observacoes||'—'}</td>`,
      acoes:   `<td class="actions-cell">${pode?`<button class="btn btn-ghost btn-sm" onclick='abrirModalDepto(${JSON.stringify(d)})'>Editar</button>`:''} ${session?.perfil==='master'?`<button class="btn btn-danger btn-sm" onclick="excluirDepto('${d.id}','${(d.codigo||'').replace(/'/g,"\\'")}')">Excluir</button>`:''}</td>`,
    };
    return `<tr>${cols.map(id=>cellMap[id]||'<td>—</td>').join('')}</tr>`;
  }).join('');
}

function abrirModalDepto(d) {
  const set=(id,val)=>{const el=document.getElementById(id);if(el)el.value=val||'';};
  document.getElementById('modal-dep-title').textContent = d ? 'Editar Departamento' : 'Novo Departamento';
  document.getElementById('modal-dep-sub').textContent   = d ? `Código: ${d.codigo}` : 'Preencha os dados';

  const hint = document.getElementById('dep-codigo-hint');

  if (d) {
    // Edição — campos travados com valores existentes
    set('dep-id', d?.id); set('dep-cli-codigo', d?.cli_codigo);
    set('dep-cli-nome', d?.cli_nome); set('dep-codigo', d?.codigo);
    set('dep-descricao', d?.descricao); set('dep-tipo-operacao', d?.tipo_operacao);
    if (hint) hint.textContent = d.cli_codigo ? `Depto ${d.codigo} do cliente ${d.cli_codigo}` : '';
  } else {
    // Novo — limpar tudo
    ['dep-id','dep-cli-codigo','dep-cli-nome','dep-codigo','dep-descricao','dep-tipo-operacao'].forEach(id=>set(id,''));
    if (hint) hint.textContent = '';
  }

  const obs = document.getElementById('dep-observacoes');
  if (obs) obs.value = d?.observacoes || '';

  // Autocomplete + sequencial ao digitar código do cliente
  document.getElementById('dep-cli-codigo').oninput = function() {
    const raw = this.value.trim();
    const q   = raw.replace(/^0+/,'');
    const cli = CLIENTES.find(c =>
      c.codigo === raw || c.codigo === q ||
      (c.codigo||'').replace(/^0+/,'') === q
    );
    const nomeEl = document.getElementById('dep-cli-nome');
    const codEl  = document.getElementById('dep-codigo');
    const hintEl = document.getElementById('dep-codigo-hint');
    const isNovo = !document.getElementById('dep-id').value;

    if (cli) {
      nomeEl.value = cli.razao_social || '';
      if (isNovo) {
        const depsDoCli = DEPTOS.filter(dep => {
          const dq = (dep.cli_codigo||'').replace(/^0+/,'');
          return dep.cli_codigo === raw || dep.cli_codigo === q || dq === q;
        });
        codEl.value = String(depsDoCli.length + 1);
        if (hintEl) hintEl.textContent = `(${depsDoCli.length} depto${depsDoCli.length!==1?'s':''} já cadastrado${depsDoCli.length!==1?'s':''})`;
      }
    } else {
      nomeEl.value = raw.length >= 2 ? '⚠️ Cliente não encontrado' : '';
      if (isNovo) { codEl.value = ''; if (hintEl) hintEl.textContent = ''; }
    }
  };

  document.getElementById('modal-depto').classList.add('open');
}
function fecharModalDepto(){document.getElementById('modal-depto').classList.remove('open');}

async function salvarDepto() {
  const btn=document.getElementById('btn-salvar-dep'),g=id=>document.getElementById(id)?.value||'';
  const dep={id:g('dep-id')||undefined,cli_codigo:g('dep-cli-codigo').trim(),tipo_operacao:g('dep-tipo-operacao'),
    codigo:g('dep-codigo').trim()||undefined, // undefined = banco gera sequencial
    descricao:g('dep-descricao').trim(),observacoes:g('dep-observacoes').trim()};
  if(!dep.descricao){toast('Informe a descrição.','error');return;}
  btn.disabled=true;btn.textContent='Salvando…';
  try{await rpc('wc_salvar_depto',{p_depto:dep});fecharModalDepto();await carregarDeptos();toast('Departamento salvo!','success');}
  catch(e){toast(e.message,'error');}
  finally{btn.disabled=false;btn.textContent='Salvar';}
}
async function excluirDepto(id,cod){
  if(!confirm(`Excluir departamento ${cod}?`)) return;
  try{await rpc('wc_excluir_depto',{p_id:id});await carregarDeptos();toast('Excluído.','success');}catch(e){toast(e.message,'error');}
}

// Fechar modais de Cadastros ao clicar no backdrop
document.addEventListener('click', e=>{
  if(e.target.id==='modal-cc')       fecharModalCC();
  if(e.target.id==='modal-cliente')  fecharModalCliente();
  if(e.target.id==='modal-depto')    fecharModalDepto();
});

// ── INIT ──────────────────────────────────────
// ── EXCLUSÃO DE VAGAS (só Master) ────────────────
function onRowCheck() { atualizarBulkBar(); }

function atualizarBulkBar() {
  if (!ehMaster()) return;
  const selecionadas = document.querySelectorAll('.row-checkbox:checked');
  const bar = document.getElementById('bulk-bar');
  const countEl = document.getElementById('bulk-count');
  if (!bar) return;
  bar.classList.toggle('visible', selecionadas.length > 0);
  if (countEl) countEl.textContent = `${selecionadas.length} selecionada(s)`;
  // Atualiza estado do checkbox "selecionar todos"
  const total = document.querySelectorAll('.row-checkbox').length;
  const chkAll = document.getElementById('chk-all');
  if (chkAll) {
    chkAll.checked       = selecionadas.length === total && total > 0;
    chkAll.indeterminate = selecionadas.length > 0 && selecionadas.length < total;
  }
}

function toggleSelecionarTodos(chkAll) {
  document.querySelectorAll('.row-checkbox').forEach(c => c.checked = chkAll.checked);
  atualizarBulkBar();
}

function selecionarTodasVisiveis() {
  document.querySelectorAll('.row-checkbox').forEach(c => c.checked = true);
  const chkAll = document.getElementById('chk-all');
  if (chkAll) { chkAll.checked = true; chkAll.indeterminate = false; }
  atualizarBulkBar();
}

function limparSelecao() {
  document.querySelectorAll('.row-checkbox').forEach(c => c.checked = false);
  const chkAll = document.getElementById('chk-all');
  if (chkAll) { chkAll.checked = false; chkAll.indeterminate = false; }
  atualizarBulkBar();
}

async function excluirVaga(jira) {
  if (!ehMaster()) return;
  if (!confirm(`Excluir a vaga ${jira}?\n\nEsta ação é irreversível.`)) return;
  try {
    await rpc('wc_excluir_vaga', { p_jira: jira });
    VAGAS = VAGAS.filter(v => v.jira !== jira);
    renderVagas();
    atualizarBadgeFila();
    toast(`Vaga ${jira} excluída.`, 'success');
  } catch(e) { toast(e.message, 'error'); }
}

async function excluirSelecionadas() {
  if (!ehMaster()) return;
  const checks = document.querySelectorAll('.row-checkbox:checked');
  if (!checks.length) return;
  const jiras = [...checks].map(c => c.dataset.jira).filter(Boolean);
  const n = jiras.length;
  if (!confirm(`Excluir ${n} vaga(s) selecionada(s)?\n\n${jiras.slice(0,10).join(', ')}${n>10?`\n…e mais ${n-10}`:''}.\n\nEsta ação é irreversível.`)) return;

  const btn = document.querySelector('#bulk-bar .btn-danger');
  if (btn) { btn.disabled=true; btn.textContent=`Excluindo ${n}…`; }

  try {
    // 1 única RPC — sem loop, sem timeout
    const r = await rpc('wc_excluir_vagas_lote', { p_jiras: jiras });
    const excluidas = r.excluidas ?? n;
    VAGAS = VAGAS.filter(v => !jiras.includes(v.jira));
    renderVagas();
    atualizarBadgeFila();
    toast(`${excluidas} vaga(s) excluída(s).`, 'success');
  } catch(e) {
    toast(e.message, 'error');
  } finally {
    if (btn) { btn.disabled=false; btn.textContent='🗑️ Excluir selecionadas'; }
  }
}

// ══════════════════════════════════════════════
//  IMPORTAÇÃO DE CADASTROS via XLSX
// ══════════════════════════════════════════════

// Mapeamento colunas planilha → campos internos
const IMPORT_SCHEMA = {
  cc: {
    rpc: 'wc_salvar_cc',
    param: 'p_cc',
    required: ['cli_codigo','descricao'],
    cols: {
      'Código do Cliente': 'cli_codigo',   // obrigatório — ex: 14093
      'Razão Social':      'cliente',       // preenchido automaticamente, mas pode vir na planilha
      'Descrição':         'descricao',     // nome do hub/operação — obrigatório
      'Tipo de Operação':  'tipo_operacao', // Last Mile / First Mile / Last Mile + First Mile
      'CEP':               'cep',
      'UF':                'uf',
      'Logradouro':        'logradouro',
      'Número':            'numero',
      'Complemento':       'complemento',
      'Bairro':            'bairro',
      'Cidade':            'cidade',
      'Ativo':             'ativo',
    },
    modelo: [
      ['Código do Cliente','Razão Social','Descrição','Tipo de Operação','CEP','UF','Logradouro','Número','Complemento','Bairro','Cidade','Ativo'],
      ['14093','SHPX LOGISTICA LTDA','HUB-LSP-07','Last Mile','08295-015','SP','Avenida Jean Khoury Farah','123','','Vila Carmosina','São Paulo','SIM'],
      ['14093','SHPX LOGISTICA LTDA','FMH-SAO-07','First Mile','08295-015','SP','Avenida Jean Khoury Farah','123','','Vila Carmosina','São Paulo','SIM'],
    ],
  },
  cli: {
    rpc: 'wc_salvar_cliente',
    param: 'p_cliente',
    required: ['razao_social'],
    cols: { 'Código':'codigo', 'Razão Social':'razao_social', 'Nome Fantasia':'nome_fantasia', 'CNPJ':'cnpj', 'CEP':'cep', 'UF':'uf', 'Logradouro':'logradouro', 'Número':'numero', 'Bairro':'bairro', 'Cidade':'cidade', 'Contato':'contato', 'E-mail':'email', 'Grupo Econômico':'grupo_nome', 'Ativo':'ativo' },
    modelo: [['Código','Razão Social','Nome Fantasia','CNPJ','CEP','UF','Logradouro','Número','Bairro','Cidade','Contato','E-mail','Grupo Econômico','Ativo'],['','SPX LOGISTICA LTDA','SHOPEE ANANINDEUA','42.446.277/0213-51','67113-320','PA','Passagem São Pedro','6','Coqueiro','Ananindeua','Ana Luiza','ana@shopee.com','SHOPEE','SIM']],
  },
  dep: {
    rpc: 'wc_salvar_depto',
    param: 'p_depto',
    required: ['cli_codigo','descricao'],
    cols: {
      'Código do Cliente': 'cli_codigo',   // obrigatório — ex: 14093
      'Nome do Cliente':   'cli_nome',      // opcional
      'Descrição':         'descricao',     // nome do departamento — obrigatório
      'Tipo de Operação':  'tipo_operacao', // Last Mile / First Mile / etc
      'Observações':       'observacoes',
    },
    modelo: [
      ['Código do Cliente','Nome do Cliente','Descrição','Tipo de Operação','Observações'],
      ['14093','SHPX LOGISTICA LTDA','LM Hub_SP_São Paulo','Last Mile',''],
      ['14093','SHPX LOGISTICA LTDA','FM Hub_SP_São Paulo','First Mile',''],
    ],
  },
};

let _importData = {}; // { cc: [...rows], cli: [...rows], dep: [...rows] }

function switchTabCad(prefix, tab) {
  // Tabs do modal (cc, cli, dep)
  const modal = document.getElementById(`modal-${prefix==='dep'?'depto':prefix==='cli'?'cliente':'cc'}`);
  if (!modal) return;
  modal.querySelectorAll('.tab-btn').forEach((b,i) => b.classList.toggle('active', i === (tab==='form'?0:1)));
  const formTab   = modal.querySelector(`#tab-${prefix}-form`);
  const importTab = modal.querySelector(`#tab-${prefix}-import`);
  if (formTab)   formTab.classList.toggle('active', tab==='form');
  if (importTab) importTab.classList.toggle('active', tab==='import');
}

function baixarModeloXLSX(tipo) {
  const key = tipo==='clientes'?'cli':tipo==='cc'?'cc':'dep';
  const schema = IMPORT_SCHEMA[key];
  const nomes = { cc:'modelo_centro_custo', cli:'modelo_clientes', dep:'modelo_departamentos' };

  const gerarXLSX = () => {
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(schema.modelo);
    // Largura automática por coluna
    ws['!cols'] = schema.modelo[0].map(h => ({ wch: Math.max(h.length, 18) }));
    XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
    XLSX.writeFile(wb, `${nomes[key]}.xlsx`);
    toast('Modelo baixado!', 'success');
  };

  if (typeof XLSX === 'undefined') {
    const s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = gerarXLSX;
    s.onerror = () => toast('Erro ao carregar leitor XLSX.', 'error');
    document.head.appendChild(s);
  } else {
    gerarXLSX();
  }
}

function handleDropImport(e, prefix) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) processarArquivoImport(file, prefix);
}

function handleFileImport(input, prefix) {
  const file = input.files[0];
  if (file) processarArquivoImport(file, prefix);
  input.value = '';
}

async function processarArquivoImport(file, prefix) {
  const schema = IMPORT_SCHEMA[prefix];
  const preview = document.getElementById(`import-${prefix}-preview`);
  const btnImp  = document.getElementById(`btn-importar-${prefix}`);
  if (!preview) return;
  preview.innerHTML = '<p style="color:var(--muted);font-size:12px;padding:10px 0">⏳ Lendo arquivo…</p>';
  if (btnImp) btnImp.style.display = 'none';

  try {
    const rows = await lerArquivoImport(file);
    if (!rows.length) { preview.innerHTML = '<p style="color:var(--danger);font-size:12px">Arquivo vazio ou sem dados.</p>'; return; }

    const header = rows[0].map(h => (h||'').toString().trim());
    const dataRows = rows.slice(1).filter(r => r.some(c => c !== null && c !== ''));
    if (!dataRows.length) { preview.innerHTML = '<p style="color:var(--danger);font-size:12px">Nenhuma linha de dados encontrada.</p>'; return; }

    // Mapear colunas
    const colMap = {}; // índice → campo interno
    header.forEach((h, i) => { if (schema.cols[h]) colMap[i] = schema.cols[h]; });

    const registros = dataRows.map(row => {
      const obj = {};
      Object.entries(colMap).forEach(([i, campo]) => {
        let v = row[i] !== undefined && row[i] !== null ? String(row[i]).trim() : '';
        if (campo === 'ativo') v = !['NAO','NÃO','0','FALSE','INATIVO'].includes(v.toUpperCase());
        obj[campo] = v || undefined;
      });
      return obj;
    });

    // Validar
    const validados = registros.map((r, i) => ({
      ...r, _linha: i+2,
      _erro: schema.required.some(f => !r[f]) ? `Campo obrigatório faltando: ${schema.required.find(f=>!r[f])}` : null
    }));

    _importData[prefix] = validados;
    const ok  = validados.filter(r=>!r._erro).length;
    const err = validados.filter(r=> r._erro).length;

    // Renderizar prévia (max 20 linhas)
    const cols = Object.values(schema.cols).filter(c=>c!=='ativo');
    const amostra = validados.slice(0,20);
    preview.innerHTML = `
      <div class="import-summary">${ok} registro(s) válido(s)${err?` · <span style="color:var(--danger)">${err} com erro</span>`:''} · mostrando ${amostra.length} de ${validados.length}</div>
      <div style="overflow-x:auto"><table class="import-preview-table">
        <thead><tr><th>#</th>${cols.map(c=>`<th>${c}</th>`).join('')}<th>Status</th></tr></thead>
        <tbody>${amostra.map(r=>`
          <tr class="${r._erro?'row-err':'row-ok'}">
            <td>${r._linha}</td>
            ${cols.map(c=>`<td>${r[c]||'—'}</td>`).join('')}
            <td>${r._erro?`<span style="color:var(--danger);font-size:11px">${r._erro}</span>`:'<span style="color:var(--success)">✓</span>'}</td>
          </tr>`).join('')}
        </tbody>
      </table></div>`;

    if (ok > 0 && btnImp) { btnImp.style.display = 'inline-flex'; btnImp.textContent = `📥 Importar ${ok} registro(s)`; }
  } catch(e) {
    preview.innerHTML = `<p style="color:var(--danger);font-size:12px">Erro ao ler arquivo: ${e.message}</p>`;
  }
}

async function lerArquivoImport(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const isCsv = file.name.toLowerCase().endsWith('.csv');
    reader.onload = e => {
      try {
        if (isCsv) {
          const text = e.target.result;
          const rows = text.split(/\r?\n/).filter(l=>l.trim()).map(l =>
            l.split(',').map(c => c.replace(/^"|"$/g,'').replace(/""/g,'"').trim())
          );
          resolve(rows);
        } else {
          // XLSX via SheetJS (carregado sob demanda)
          if (typeof XLSX === 'undefined') {
            // Carregar SheetJS dinamicamente
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
            s.onload = () => {
              const data = new Uint8Array(e.target.result);
              const wb = XLSX.read(data, {type:'array'});
              const ws = wb.Sheets[wb.SheetNames[0]];
              resolve(XLSX.utils.sheet_to_json(ws, {header:1, defval:''}));
            };
            s.onerror = () => reject(new Error('Erro ao carregar leitor XLSX.'));
            document.head.appendChild(s);
          } else {
            const data = new Uint8Array(e.target.result);
            const wb = XLSX.read(data, {type:'array'});
            const ws = wb.Sheets[wb.SheetNames[0]];
            resolve(XLSX.utils.sheet_to_json(ws, {header:1, defval:''}));
          }
        }
      } catch(err) { reject(err); }
    };
    reader.onerror = () => reject(new Error('Falha ao ler arquivo.'));
    if (isCsv) reader.readAsText(file, 'UTF-8');
    else        reader.readAsArrayBuffer(file);
  });
}

async function executarImportacao(prefix) {
  const schema   = IMPORT_SCHEMA[prefix];
  const registros = (_importData[prefix]||[]).filter(r=>!r._erro);
  if (!registros.length) return;
  const btn = document.getElementById(`btn-importar-${prefix}`);
  if (btn) { btn.disabled=true; btn.textContent='Importando…'; }

  let ok=0, erros=0;
  for (const r of registros) {
    const payload = {...r};
    delete payload._linha; delete payload._erro;
    try {
      await rpc(schema.rpc, {[schema.param]: payload});
      ok++;
    } catch(e) { erros++; }
  }

  if (btn) { btn.disabled=false; btn.style.display='none'; }
  document.getElementById(`import-${prefix}-preview`).innerHTML = '';
  _importData[prefix] = [];

  // Recarregar dados
  if (prefix==='cc')  { await carregarCentrosCusto(); await carregarOperacoes(); }
  if (prefix==='cli') await carregarClientes();
  if (prefix==='dep') await carregarDeptos();

  const msg = erros===0 ? `${ok} registro(s) importado(s) com sucesso!` : `${ok} importado(s), ${erros} com erro.`;
  toast(msg, erros?'error':'success');

  // Voltar para aba de formulário
  switchTabCad(prefix,'form');
}

// ── SIDEBAR MOBILE ────────────────────────────
// ── SIDEBAR RECOLHÍVEL ───────────────────────
// ══════════════════════════════════════════════
