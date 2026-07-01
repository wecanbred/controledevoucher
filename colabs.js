// ════════════════ MÓDULO PLANILHA CENTRAL — COLABORADORES ════════════════
// Lê Google Sheets via CSV público (gviz/tq) — mesmo padrão do módulo Tickets
// Escreve via Apps Script Web App publicado pelo usuário

const COLABS_SHEET_ID  = '1WBYOF9AkoS7NpzhqFyqm5PzQRP13yUF2p5ZY8FfZp_c';
const COLABS_GID_ATIVOS   = '690743947';
const COLABS_GID_INATIVOS = '1320206835';

// URL do Apps Script Web App para ESCRITA — configurável em Configurações
function colabsWebAppUrl() {
  try { return localStorage.getItem('wecan_colabs_webapp_url') || ''; } catch(e) { return ''; }
}

let COLABS_ATIVOS   = [];
let COLABS_INATIVOS = [];
let COLABS_LOADED   = false;
let COLABS_LOADING  = false;

// ── Mapeamento de colunas da planilha ──────────────────────────────────
// ATIVOS:  BPO | C.custo | NickName | Operação | Matricula | Nome | Data Admissão |
//          Tipo Contrato | Cargo | Salário | Vencimento | Renovação | Horário | Escala |
//          CPF | Dt Nascimento | Nome Mãe | Celular | E-mail | Beneficio Mobilidade |
//          Logradouro | Numero | Complemento | Bairro | Cidade | UF | CEP |
//          Tam Calça | Tam Blusa | Tam Calçado | Tam Luva | Status Colaborador |
//          Sexo | Status Operação | Trintídio | Categoria
// INATIVOS: BPO | C.custo | NickName | Matricula | Nome | CPF | Tipo Contrato |
//           Cargo | Data Admissão | Vencimento Demissão | Motivo Desligamento |
//           Tipo Desligamento | Nº Ticket | Status Colaborador | Beneficio Mobilidade |
//           Gênero | Idade | Categoria

const COLABS_COLS_ATIVOS = [
  'bpo','cc','nickname','operacao','matricula','nome','data_admissao',
  'tipo_contrato','cargo','salario','vencimento_contrato','renovacao','horario','escala',
  'cpf','data_nascimento','nome_mae','celular','email','beneficio_mobilidade',
  'logradouro','numero','complemento','bairro','cidade','uf','cep',
  'tam_calca','tam_blusa','tam_calcado','tam_luva','status_colaborador',
  'sexo','status_operacao','trintidio','categoria'
];

const COLABS_COLS_INATIVOS = [
  'bpo','cc','nickname','matricula','nome','cpf','tipo_contrato',
  'cargo','data_admissao','vencimento_demissao','motivo_desligamento',
  'tipo_desligamento','num_ticket','status_colaborador','beneficio_mobilidade',
  'genero','idade','categoria'
];

// ── Labels amigáveis para exibição ─────────────────────────────────────
const COLABS_LABELS = {
  bpo:'BPO', cc:'C.Custo', nickname:'NickName', operacao:'Operação',
  matricula:'Matrícula', nome:'Nome', data_admissao:'Admissão',
  tipo_contrato:'Contrato', cargo:'Cargo', salario:'Salário',
  vencimento_contrato:'Vencimento', renovacao:'Renovação',
  horario:'Horário', escala:'Escala', cpf:'CPF',
  data_nascimento:'Nascimento', nome_mae:'Nome da Mãe',
  celular:'Celular', email:'E-mail', beneficio_mobilidade:'Mobilidade',
  logradouro:'Logradouro', numero:'Número', complemento:'Complemento',
  bairro:'Bairro', cidade:'Cidade', uf:'UF', cep:'CEP',
  tam_calca:'Calça', tam_blusa:'Blusa', tam_calcado:'Calçado', tam_luva:'Luva',
  status_colaborador:'Status', sexo:'Sexo', genero:'Gênero',
  status_operacao:'Status Op.', trintidio:'Trintídio', categoria:'Categoria',
  vencimento_demissao:'Dt Demissão', motivo_desligamento:'Motivo',
  tipo_desligamento:'Tipo Deslig.', num_ticket:'Nº Ticket', idade:'Idade',
};

// ── Parsear CSV em array de objetos ────────────────────────────────────
function colabsParseCSV(text, tipo) {
  const parseRow = row => {
    const cols = []; let cur = ''; let inQ = false;
    for (let i = 0; i < row.length; i++) {
      const c = row[i];
      if (c === '"') { if (inQ && row[i+1]==='"') { cur+='"'; i++; } else inQ=!inQ; }
      else if (c === ',' && !inQ) { cols.push(cur.trim()); cur=''; }
      else cur += c;
    }
    cols.push(cur.trim());
    return cols;
  };
  const linhas = text.trim().split(/\r?\n/);
  const colsMap = tipo === 'ativos' ? COLABS_COLS_ATIVOS : COLABS_COLS_INATIVOS;
  const registros = [];
  for (let i = 1; i < linhas.length; i++) {
    const row = parseRow(linhas[i]);
    if (row.every(c => !c)) continue;
    const obj = { _row: i + 1 };
    colsMap.forEach((c, idx) => { obj[c] = (row[idx] || '').trim(); });
    if (!obj.matricula && !obj.nome) continue;
    registros.push(obj);
  }
  return registros;
}

// ── Buscar via Apps Script (proxy) ─────────────────────────────────────
async function colabsFetchViaProxy(tipo) {
  const url = colabsWebAppUrl();
  if (!url) throw new Error('Apps Script não configurado. Vá em Configurações > Template Base.');
  const resp = await fetch(url + '?action=ler&tipo=' + tipo);
  if (!resp.ok) throw new Error(`Erro HTTP ${resp.status} no Apps Script`);
  const json = await resp.json();
  if (!json.ok) throw new Error(json.error || 'Erro no Apps Script');
  // Apps Script retorna CSV como string
  return colabsParseCSV(json.csv, tipo);
}

// ── Buscar e parsear — tenta gviz direto, cai no proxy se falhar ───────
async function colabsFetch(tipo) {
  const gid = tipo === 'ativos' ? COLABS_GID_ATIVOS : COLABS_GID_INATIVOS;
  const url = `https://docs.google.com/spreadsheets/d/${COLABS_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${gid}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    const text = await resp.text();
    // Se retornou HTML de login, planilha não é pública — usar proxy
    if (text.trim().startsWith('<!') || text.trim().startsWith('<h')) throw new Error('Requer autenticação');
    return colabsParseCSV(text, tipo);
  } catch(e) {
    // Fallback: buscar via Apps Script como proxy de leitura
    console.warn('gviz falhou (' + e.message + ') — tentando via Apps Script...');
    return await colabsFetchViaProxy(tipo);
  }
}

// ── Carregar em background (sem renderizar, só popular variáveis) ────────
async function colabsCarregarBackground() {
  if (COLABS_LOADED || COLABS_LOADING) return;
  COLABS_LOADING = true;
  try {
    COLABS_ATIVOS   = await colabsFetch('ativos');
    COLABS_INATIVOS = await colabsFetch('inativos');
    COLABS_LOADED   = true;
    // Atualizar home se estiver nela
    if (document.getElementById('page-home')?.classList.contains('active')) {
      renderHome();
    }
  } catch(e) {
    console.warn('Autoload Template falhou:', e.message);
  } finally {
    COLABS_LOADING = false;
  }
}

// ── Carregar e renderizar ──────────────────────────────────────────────
async function colabsCarregar(tipo) {
  if (COLABS_LOADING) return;
  COLABS_LOADING = true;
  const areaId  = `colabs-${tipo}-area`;
  const syncId  = `colabs-${tipo}-sync`;
  const countId = `colabs-${tipo}-count`;
  const areaEl  = document.getElementById(areaId);
  const syncEl  = document.getElementById(syncId);
  if (areaEl) areaEl.innerHTML = '<div class="tkt-loading">Carregando planilha…</div>';
  if (syncEl) syncEl.textContent = '';
  try {
    const dados = await colabsFetch(tipo);
    if (tipo === 'ativos')   { COLABS_ATIVOS   = dados; }
    else                     { COLABS_INATIVOS  = dados; }
    COLABS_LOADED = true;
    colabsPopularFiltros(tipo, dados);
    colabsFiltrar(tipo);
    // Se onsite está na home, atualizar os cards do Template
    if (session?.perfil === 'onsite' && document.getElementById('page-home')?.classList.contains('active')) {
      renderHome();
    }
    const agora = new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
    if (syncEl) syncEl.textContent = `Atualizado às ${agora} · ${dados.length} registros`;
  } catch(e) {
    if (areaEl) areaEl.innerHTML = `<div style="padding:24px;color:var(--danger);font-size:13px">❌ ${e.message}<br><small style="color:var(--muted)">Verifique se a planilha está compartilhada como "Qualquer pessoa com o link — Leitor".</small></div>`;
  } finally { COLABS_LOADING = false; }
}

// ── Popular selects de filtro ──────────────────────────────────────────
function colabsPopularFiltros(tipo, dados) {
  const uniq = (arr) => [...new Set(arr.filter(Boolean).sort())];

  const ccs     = uniq(dados.map(r => r.cc));
  const cargos  = uniq(dados.map(r => r.cargo));

  const setOpts = (id, vals) => {
    const el = document.getElementById(id);
    if (!el) return;
    const atual = el.value;
    el.innerHTML = `<option value="">Todos</option>` + vals.map(v=>`<option value="${v}">${v}</option>`).join('');
    if (atual && vals.includes(atual)) el.value = atual;
  };

  setOpts(`colabs-${tipo}-filtro-cc`,    ccs);
  setOpts(`colabs-${tipo}-filtro-cargo`, cargos);

  if (tipo === 'inativos') {
    const motivos = uniq(dados.map(r => r.motivo_desligamento));
    setOpts(`colabs-inativos-filtro-motivo`, motivos);
  }
  if (tipo === 'ativos') {
    const contratos = uniq(dados.map(r => r.tipo_contrato));
    setOpts(`colabs-ativos-filtro-contrato`, contratos);
  }
}

// ── Filtrar ────────────────────────────────────────────────────────────
function colabsFiltrar(tipo) {
  const dados  = tipo === 'ativos' ? COLABS_ATIVOS : COLABS_INATIVOS;
  const busca  = (document.getElementById(`colabs-${tipo}-busca`)?.value||'').toLowerCase();
  const filtCC = document.getElementById(`colabs-${tipo}-filtro-cc`)?.value||'';
  const filtCG = document.getElementById(`colabs-${tipo}-filtro-cargo`)?.value||'';
  const filtCT = document.getElementById(`colabs-${tipo}-filtro-contrato`)?.value||'';
  const filtMT = document.getElementById(`colabs-inativos-filtro-motivo`)?.value||'';

  // Filtro de escopo para Onsite — só vê o próprio CC
  let lista = colabsFiltrarEscopo(dados);

  if (busca) lista = lista.filter(r =>
    [r.nome,r.matricula,r.cpf,r.nickname,r.email,r.celular]
      .some(f=>(f||'').toLowerCase().includes(busca)));
  if (filtCC) lista = lista.filter(r => r.cc === filtCC);
  if (filtCG) lista = lista.filter(r => r.cargo === filtCG);
  if (filtCT) lista = lista.filter(r => r.tipo_contrato === filtCT);
  if (filtMT) lista = lista.filter(r => r.motivo_desligamento === filtMT);

  const countEl = document.getElementById(`colabs-${tipo}-count`);
  if (countEl) countEl.textContent = `${lista.length} colaborador(es)${lista.length < dados.length ? ` · filtro ativo` : ''}`;

  colabsRenderTabela(tipo, lista);
}

// Onsite vê só o próprio CC; gestor/master vê tudo
function colabsFiltrarEscopo(dados) {
  if (!session || ['master','gestor','gestor_adm'].includes(session.perfil)) return dados;
  if (session._operacoes?.length) {
    const ccsCods = new Set(session._operacoes.map(o=>(o.cc_cod||o.nome||'').toUpperCase()).filter(Boolean));
    if (ccsCods.size) return dados.filter(r => ccsCods.has((r.cc||'').toUpperCase()));
  }
  return dados;
}

function colabsLimparFiltros(tipo) {
  [`colabs-${tipo}-busca`,`colabs-${tipo}-filtro-cc`,`colabs-${tipo}-filtro-cargo`,
   `colabs-${tipo}-filtro-contrato`,`colabs-inativos-filtro-motivo`].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
  colabsFiltrar(tipo);
}

// ── Formatar data vinda do Apps Script ou planilha ─────────────────────
// Suporta: "Mon Oct 28 2024 00:00:00 GMT-0300 (...)" | "dd/mm/aaaa" | "aaaa-mm-dd" | Date serial
function fmtDataColab(v) {
  if (!v || v === '—') return '—';
  const s = String(v).trim();
  if (!s) return '—';
  // dd/mm/aaaa já no formato certo
  if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(s)) return s;
  // aaaa-mm-dd
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[3]}/${iso[2]}/${iso[1]}`;
  // Formato longo do Apps Script: "Mon Oct 28 2024 00:00:00 GMT..."
  try {
    const d = new Date(s);
    if (!isNaN(d)) return d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  } catch(e) {}
  return s; // fallback: retornar como veio
}

// ── Estado de paginação por tipo ───────────────────────────────────────
const COLABS_PAG = { ativos: { pagina:1, porPagina:20 }, inativos: { pagina:1, porPagina:20 } };
let   _colabsListaFiltrada = { ativos:[], inativos:[] };

// ── Helpers de célula (reutilizados na render e paginação) ──────────────
const COLABS_DATAS = new Set(['data_admissao','vencimento_demissao','vencimento_contrato','data_nascimento','renovacao']);

function colabsStatusPill(s) {
  if (!s) return '—';
  const sl = s.toLowerCase();
  if (sl === 'ativo')             return `<span class="pill vaga-noprazo">Ativo</span>`;
  if (sl === 'inativo')           return `<span class="pill vaga-atrasada">Inativo</span>`;
  if (sl.includes('afastado'))    return `<span class="pill vaga-pendente">${s}</span>`;
  return `<span class="pill muted">${s}</span>`;
}

function colabsRenderLinha(r, cols, tipo, podEditar) {
  const rJson = JSON.stringify(r).replace(/'/g,"&#39;").replace(/"/g,'&quot;');
  const cells = cols.map(c => {
    const v = r[c] || '';
    if (c === 'status_colaborador') return `<td>${colabsStatusPill(v)}</td>`;
    if (c === 'matricula')  return `<td style="font-family:monospace;font-size:12px;font-weight:700;color:var(--accent);white-space:nowrap">${v||'—'}</td>`;
    if (c === 'nome')       return `<td style="font-weight:600;font-size:12.5px;max-width:190px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${v}">${v||'—'}</td>`;
    if (c === 'cc')         return `<td style="font-size:11px;font-weight:600;white-space:nowrap;color:var(--muted)">${v||'—'}</td>`;
    if (c === 'cargo')      return `<td style="font-size:11.5px;max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${v}">${v||'—'}</td>`;
    if (c === 'celular')    return `<td style="font-size:11.5px;white-space:nowrap;color:var(--muted)">${v||'—'}</td>`;
    if (COLABS_DATAS.has(c)) return `<td style="font-size:11.5px;white-space:nowrap">${fmtDataColab(v)}</td>`;
    if (c === 'tipo_contrato') return `<td style="font-size:11px"><span style="background:var(--surface2);padding:2px 7px;border-radius:4px">${v||'—'}</span></td>`;
    if (c === 'motivo_desligamento') return `<td style="font-size:11.5px;max-width:140px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${v}">${v||'—'}</td>`;
    return `<td style="font-size:11.5px">${v||'—'}</td>`;
  }).join('');
  const editBtn = podEditar
    ? `<td style="text-align:center"><button class="btn btn-ghost btn-sm" style="padding:2px 6px;font-size:10px;opacity:.7" onclick='event.stopPropagation();colabsAbrirModal(JSON.parse(this.dataset.r),"${tipo}")' data-r="${rJson}">✏️</button></td>`
    : `<td></td>`;
  return `<tr onclick='colabsAbrirModal(JSON.parse(this.dataset.r),"${tipo}")' data-r="${rJson}" style="cursor:pointer">${cells}${editBtn}</tr>`;
}

// ── Controles de paginação ─────────────────────────────────────────────
function colabsIrPagina(tipo, pag) {
  const lista = _colabsListaFiltrada[tipo];
  const pp    = COLABS_PAG[tipo].porPagina;
  const total = Math.ceil(lista.length / pp);
  COLABS_PAG[tipo].pagina = Math.max(1, Math.min(pag, total));
  colabsRenderPagina(tipo);
}

function colabsSetPorPagina(tipo, n) {
  COLABS_PAG[tipo].porPagina = Number(n);
  COLABS_PAG[tipo].pagina    = 1;
  colabsRenderPagina(tipo);
}

function colabsRenderPagina(tipo) {
  const lista    = _colabsListaFiltrada[tipo];
  const { pagina, porPagina } = COLABS_PAG[tipo];
  const total    = Math.ceil(lista.length / porPagina);
  const inicio   = (pagina - 1) * porPagina;
  const fatia    = lista.slice(inicio, inicio + porPagina);

  const colsAtivos   = ['matricula','nome','cc','cargo','tipo_contrato','data_admissao','status_colaborador','celular'];
  const colsInativos = ['matricula','nome','cc','cargo','data_admissao','vencimento_demissao','motivo_desligamento','tipo_desligamento'];
  const cols     = tipo === 'ativos' ? colsAtivos : colsInativos;
  const podEditar = temPermissao('adp_colabs_editar');

  // Tabela
  const thead = `<tr>${cols.map(c=>`<th>${COLABS_LABELS[c]||c}</th>`).join('')}<th style="width:36px"></th></tr>`;
  const tbody = fatia.map(r => colabsRenderLinha(r, cols, tipo, podEditar)).join('');

  // Paginação — botões de página com janela deslizante
  const btnPag = (p, label, ativo, disabled) =>
    `<button onclick="colabsIrPagina('${tipo}',${p})"
      style="min-width:30px;height:28px;padding:0 8px;border:1px solid var(--border);border-radius:6px;
             background:${ativo?'var(--accent)':'var(--surface2)'};
             color:${ativo?'#fff':'var(--text)'};
             font-size:12px;cursor:${disabled?'default':'pointer'};opacity:${disabled?'.4':'1'}"
      ${disabled?'disabled':''}>${label}</button>`;

  const janela = 2; // páginas ao redor da atual
  let pagBtns = '';
  if (total <= 7) {
    for (let p = 1; p <= total; p++) pagBtns += btnPag(p, p, p===pagina, false);
  } else {
    pagBtns += btnPag(1, '1', pagina===1, false);
    if (pagina > janela + 2) pagBtns += `<span style="color:var(--muted);align-self:center;padding:0 4px">…</span>`;
    for (let p = Math.max(2, pagina-janela); p <= Math.min(total-1, pagina+janela); p++)
      pagBtns += btnPag(p, p, p===pagina, false);
    if (pagina < total - janela - 1) pagBtns += `<span style="color:var(--muted);align-self:center;padding:0 4px">…</span>`;
    pagBtns += btnPag(total, total, pagina===total, false);
  }

  const porPaginaSelect = [10,20,30,50,100].map(n=>
    `<option value="${n}" ${n===porPagina?'selected':''}>${n} por página</option>`).join('');

  const areaEl = document.getElementById(`colabs-${tipo}-area`);
  if (!areaEl) return;
  areaEl.innerHTML = `
    <div class="table-wrap">
      <table class="main-table">
        <thead>${thead}</thead>
        <tbody>${tbody}</tbody>
      </table>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;flex-wrap:wrap;gap:8px">
      <span style="font-size:11.5px;color:var(--muted)">
        ${inicio+1}–${Math.min(inicio+porPagina,lista.length)} de <b>${lista.length}</b> colaborador(es)
      </span>
      <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
        ${btnPag(pagina-1,'‹',false,pagina===1)}
        ${pagBtns}
        ${btnPag(pagina+1,'›',false,pagina===total)}
      </div>
      <select onchange="colabsSetPorPagina('${tipo}',this.value)"
        style="font-size:11.5px;padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:var(--surface2);color:var(--text)">
        ${porPaginaSelect}
      </select>
    </div>`;
}

// ── Renderizar tabela — salva lista filtrada e chama paginação ──────────
function colabsRenderTabela(tipo, lista) {
  _colabsListaFiltrada[tipo] = lista;
  COLABS_PAG[tipo].pagina    = 1; // reset para p.1 ao filtrar
  if (!lista.length) {
    const areaEl = document.getElementById(`colabs-${tipo}-area`);
    if (areaEl) areaEl.innerHTML = '<div style="padding:24px;color:var(--muted);text-align:center">Nenhum colaborador encontrado.</div>';
    return;
  }
  colabsRenderPagina(tipo);
}

// ── Modal de detalhes / edição ─────────────────────────────────────────
let _colabAtual = null;
let _colabTipo  = null;

function colabsAbrirModal(r, tipo) {
  _colabAtual = r;
  _colabTipo  = tipo;
  const podEditar = temPermissao('adp_colabs_editar');
  const cols = tipo === 'ativos' ? COLABS_COLS_ATIVOS : COLABS_COLS_INATIVOS;

  // Grupos de campos para exibição organizada
  const grupos = tipo === 'ativos' ? [
    { titulo:'👤 Identificação',  campos:['bpo','cc','nickname','operacao','matricula','nome','sexo','data_nascimento','cpf','nome_mae','categoria'] },
    { titulo:'💼 Contrato',       campos:['tipo_contrato','cargo','data_admissao','vencimento_contrato','renovacao','salario','horario','escala','status_colaborador','status_operacao','trintidio'] },
    { titulo:'📞 Contato',        campos:['celular','email','beneficio_mobilidade'] },
    { titulo:'🏠 Endereço',       campos:['logradouro','numero','complemento','bairro','cidade','uf','cep'] },
    { titulo:'👔 Uniformes',      campos:['tam_calca','tam_blusa','tam_calcado','tam_luva'] },
  ] : [
    { titulo:'👤 Identificação',  campos:['bpo','cc','nickname','matricula','nome','cpf','genero','idade','categoria'] },
    { titulo:'💼 Histórico',      campos:['tipo_contrato','cargo','data_admissao','vencimento_demissao','motivo_desligamento','tipo_desligamento','num_ticket','status_colaborador','beneficio_mobilidade'] },
  ];

  const DATAS_MODAL = new Set(['data_admissao','vencimento_demissao','vencimento_contrato',
    'data_nascimento','renovacao']);

  const campo = (c) => {
    const label    = COLABS_LABELS[c] || c;
    const rawVal   = r[c] || '';
    // Para exibição e edição, datas ficam no formato dd/mm/aaaa
    const dispVal  = DATAS_MODAL.has(c) ? fmtDataColab(rawVal) : rawVal;
    if (podEditar) {
      return `<div class="form-group" style="margin-bottom:0">
        <label style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.4px">${label}</label>
        <input type="text" id="colab-field-${c}" value="${dispVal.replace(/"/g,'&quot;')}" style="font-size:12.5px;padding:6px 10px"/>
      </div>`;
    } else {
      return `<div>
        <div style="font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.4px;margin-bottom:2px">${label}</div>
        <div style="font-size:12.5px;font-weight:600">${dispVal||'—'}</div>
      </div>`;
    }
  };

  const bodyHtml = grupos.map(g => `
    <div style="margin-bottom:14px">
      <div style="font-size:10px;font-weight:800;color:var(--accent);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px;padding-bottom:4px;border-bottom:1px solid var(--border)">${g.titulo}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        ${g.campos.map(campo).join('')}
      </div>
    </div>`).join('');

  document.getElementById('colab-modal-title').textContent = r.nome || '—';
  document.getElementById('colab-modal-sub').textContent   = `${r.matricula||''} · ${r.cc||''} · ${tipo === 'ativos' ? '✅ Ativo' : '⛔ Inativo'}`;
  document.getElementById('colab-modal-body').innerHTML    = bodyHtml;
  const podDemitir = tipo === 'ativos' && temPermissao('adp_rescisao');
  // Footer aparece se pode editar OU pode demitir
  document.getElementById('colab-modal-footer-edit').style.display = (podEditar || podDemitir) ? 'flex' : 'none';
  // Botão salvar: só para quem pode editar
  const btnSalvar = document.getElementById('colab-btn-salvar');
  if (btnSalvar) btnSalvar.style.display = podEditar ? 'inline-flex' : 'none';
  // Botão demitir: só para Ativos e quem tem permissão de desligamento
  const btnDemitir = document.getElementById('colab-btn-demitir');
  if (btnDemitir) btnDemitir.style.display = podDemitir ? 'inline-flex' : 'none';
  const btnSol = document.getElementById('colab-btn-sol');
  if (btnSol) btnSol.style.display = (tipo === 'ativos' && temPermissao('adp_sol_ver')) ? 'inline-flex' : 'none';

  abrirModal('modal-colab');
}

// ── Salvar edição via Apps Script ──────────────────────────────────────
async function colabsSalvar() {
  const webAppUrl = colabsWebAppUrl();
  if (!webAppUrl) {
    toast('Configure a URL do Apps Script em Configurações > Template Base.', 'error');
    return;
  }
  const btn = document.getElementById('colab-btn-salvar');
  btn.disabled = true; btn.textContent = 'Salvando…';

  const tipo = _colabTipo;
  const cols = tipo === 'ativos' ? COLABS_COLS_ATIVOS : COLABS_COLS_INATIVOS;
  const payload = { tipo, row: _colabAtual._row, dados: {} };
  cols.forEach(c => {
    const el = document.getElementById(`colab-field-${c}`);
    if (el) payload.dados[c] = el.value;
  });

  try {
    // Apps Script não suporta CORS em doPost — enviamos via GET com params URL
    // Usa matrícula como chave para encontrar a linha correta (row pode deslocar)
    const matricula = _colabAtual?.matricula || '';
    const dadosJson = encodeURIComponent(JSON.stringify(payload.dados));
    const url = `${webAppUrl}?action=salvar&tipo=${payload.tipo}&matricula=${encodeURIComponent(matricula)}&dados=${dadosJson}`;
    const resp = await fetch(url);
    const json = await resp.json();
    if (json.ok) {
      // Atualizar cache local
      const idx = (tipo==='ativos'?COLABS_ATIVOS:COLABS_INATIVOS).findIndex(r=>r._row===_colabAtual._row);
      if (idx>=0) {
        cols.forEach(c => { const el=document.getElementById(`colab-field-${c}`); if(el)(tipo==='ativos'?COLABS_ATIVOS:COLABS_INATIVOS)[idx][c]=el.value; });
      }
      fecharModal('modal-colab');
      colabsFiltrar(tipo);
      toast('Colaborador atualizado na planilha!', 'success');
    } else {
      throw new Error(json.error || 'Erro ao salvar');
    }
  } catch(e) {
    toast('Erro ao salvar: ' + e.message, 'error');
  } finally {
    btn.disabled = false; btn.textContent = '💾 Salvar na Planilha';
  }
}
// ════════════════ FIM COLABORADORES ════════════════

// ════════════════ CONFIGURAÇÕES — PLANILHA CENTRAL ════════════════
function salvarColabsWebAppUrl() {
  const url = document.getElementById('cfg-colabs-webapp-url')?.value.trim() || '';
  try { localStorage.setItem('wecan_colabs_webapp_url', url); } catch(e) {}
  // Salvar também no banco para todos os usuários
  if (url) configSalvarGlobal('colabs_webapp_url', url);
  const st = document.getElementById('cfg-colabs-status');
  if (st) { st.textContent = url ? '✅ URL salva para todos!' : '⚠️ URL removida'; st.style.color = url ? 'var(--success)' : 'var(--warning)'; }
  toast('URL salva — todos os usuários vão usar automaticamente!', 'success');
}

async function testarColabsWebApp() {
  const url = document.getElementById('cfg-colabs-webapp-url')?.value.trim() || colabsWebAppUrl();
  const st  = document.getElementById('cfg-colabs-status');
  if (!url) { if(st) st.textContent = '⚠️ Nenhuma URL configurada'; return; }
  if(st) { st.textContent = '⏳ Testando…'; st.style.color='var(--muted)'; }
  try {
    const resp = await fetch(url);
    const json = await resp.json();
    if (json.ok) {
      if(st) { st.textContent = '✅ Conexão OK — ' + (json.msg||''); st.style.color='var(--success)'; }
      toast('Apps Script conectado!', 'success');
    } else {
      throw new Error(json.error || 'Resposta inesperada');
    }
  } catch(e) {
    if(st) { st.textContent = '❌ Falha: ' + e.message; st.style.color='var(--danger)'; }
    toast('Falha na conexão: ' + e.message, 'error');
  }
}

// Carregar URL salva ao abrir configurações
function colabsCarregarCfg() {
  const url = colabsWebAppUrl();
  const el = document.getElementById('cfg-colabs-webapp-url');
  if (el) el.value = url || '';
  // Mostrar card só para master/gestor_adm
  const card = document.getElementById('cfg-colabs-card');
  if (card) card.style.display = (session && ['master','gestor_adm','gestor'].includes(session.perfil)) ? 'block' : 'none';
}
// ════════════════ FIM CONFIGURAÇÕES PLANILHA CENTRAL ════════════════
