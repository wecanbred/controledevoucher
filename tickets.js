// ════════════════════════════════════════════════════════════
// TICKETS SHOPEE — Google Sheets + Supabase (notas internas)
// ════════════════════════════════════════════════════════════

const TKT_SHEET_ID = '14aQ5T9tBFO148fqx4OB8YHd6FXkOrELZvsvlo_4KY7Y';
const TKT_GID_TICKETS = '295468131'; // aba Tickets — tem todas as solicitações

// Filtro de tipo por página
const TKT_FILTRO_TIPO = {
  'tickets-todos':   null,           // sem filtro — todos
  'tickets-deslig':  'deslig',
  'tickets-movim':   'movim',
  'tickets-voucher': 'voucher',
};

const TKT_AREAS = {
  'tickets-todos':   'tkt-todos-area',
  'tickets-deslig':  'tkt-deslig-area',
  'tickets-movim':   'tkt-movim-area',
  'tickets-voucher': 'tkt-voucher-area',
};

let TKT_TODOS  = [];  // todos os tickets carregados da planilha (cache)
let TKT_NOTAS  = {};  // { key: { status, obs, historico[] } }
let TKT_LOADED = false;
let _tktPageAtual   = '';
let _tktKeyAtual    = '';
let _tktStatusAtual = '';

// ── Buscar CSV da aba Tickets (pública) ───────────────────
async function tktFetchTodos() {
  const url = `https://docs.google.com/spreadsheets/d/${TKT_SHEET_ID}/gviz/tq?tqx=out:csv&gid=${TKT_GID_TICKETS}`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Erro HTTP ${resp.status} ao buscar planilha.`);
  const csv = await resp.text();
  if (csv.trim().startsWith('<!')) throw new Error('Planilha não está pública ou o link mudou.');
  return tktParseCSV(csv);
}

// ── Parser CSV simples (lida com aspas e vírgulas) ─────────
function tktParseCSV(csv) {
  const lines = csv.trim().split('\n');
  if (lines.length < 2) return [];
  const headers = tktCSVRow(lines[0]);
  return lines.slice(1).map(line => {
    const vals = tktCSVRow(line);
    const obj = {};
    headers.forEach((h, i) => { obj[h.trim()] = (vals[i] || '').trim(); });
    return obj;
  }).filter(r => r['Key'] || r['key']);
}

function tktCSVRow(line) {
  const result = []; let cur = ''; let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') { inQ = !inQ; continue; }
    if (c === ',' && !inQ) { result.push(cur); cur = ''; continue; }
    cur += c;
  }
  result.push(cur);
  return result;
}

// ── Extrair código HUB sem o sufixo "| SPI" ──────────────
function tktHubCode(hubStr) {
  if (!hubStr) return '';
  return hubStr.split('|')[0].trim();
}

// ── Filtrar tickets pelo HUB do Onsite logado ─────────────
function tktFiltrarPorOnsite(lista) {
  if (!session) return lista;
  if (['master','gestor'].includes(session.perfil)) return lista;

  const ops = session._operacoes || [];
  if (!ops.length) return lista;

  // Conjunto de nomes exatos das operações do usuário — uppercase
  const opsNomes = new Set(ops.map(o => (o.nome||'').toUpperCase().trim()));

  return lista.filter(r => {
    // Remove tudo após | e limpa espaços: "HUB-LSP-10 | SPI" → "HUB-LSP-10"
    const hub = tktHubCode(r['HUB'] || r['Hub'] || '').toUpperCase().trim();
    if (!hub) return false;
    // Comparação EXATA apenas — evita HUB-LSP-10 bater com HUB-LSP-105
    return opsNomes.has(hub);
  });
}

// ── Filtrar por tipo (Desligamento, Movimentação, Voucher) ─
function tktFiltrarPorTipo(lista, pageId) {
  const filtro = TKT_FILTRO_TIPO[pageId];
  if (!filtro) return lista;
  return lista.filter(r => (r['Tipo'] || '').toLowerCase().includes(filtro));
}

// ── Buscar notas internas do Supabase ─────────────────────
async function tktCarregarNotas(keys) {
  if (!keys.length) return;
  try {
    const r = await rpc('wc_ticket_notas_listar', { p_keys: keys });
    TKT_NOTAS = {};
    (r || []).forEach(n => {
      TKT_NOTAS[n.key] = { status: n.status, obs: n.obs, historico: n.historico || [] };
    });
  } catch(e) { TKT_NOTAS = {}; }
}

// ── Carregar (só busca planilha uma vez, depois usa cache) ─
async function tktCarregar(pageId) {
  _tktPageAtual = pageId;
  const areaId = TKT_AREAS[pageId];
  const area   = document.getElementById(areaId);
  if (!area) return;
  area.innerHTML = '<div class="tkt-loading">🔄 Buscando tickets…</div>';

  try {
    // 1. Garantir operações carregadas ANTES de filtrar
    if (!session._operacoes?.length && !['master','gestor'].includes(session?.perfil)) {
      // Após o fix do wc_login, session.operacoes já vem no login
      if (session.operacoes?.length) {
        session._operacoes = session.operacoes;
      } else {
        // Fallback: buscar via RPC dedicada
        try {
          const ro = await rpc('wc_minhas_operacoes', {});
          if (ro.operacoes?.length) session._operacoes = ro.operacoes;
        } catch(e) {
          // Último fallback: wc_home_resumo
          try {
            const rh = await rpc('wc_home_resumo', {});
            if (rh.operacoes?.length) session._operacoes = rh.operacoes;
          } catch(_) {}
        }
      }
    }

    // 2. Buscar planilha (força recarregar para aplicar filtro correto)
    if (!TKT_LOADED) {
      TKT_TODOS  = await tktFetchTodos();
      TKT_TODOS  = tktFiltrarPorOnsite(TKT_TODOS);
      const keys = TKT_TODOS.map(r => r['Key']).filter(Boolean);
      await tktCarregarNotas(keys);
      TKT_LOADED = true;
    }

    const lista = tktFiltrarPorTipo(TKT_TODOS, pageId);
    tktRenderArea(areaId, lista, pageId);
  } catch(e) {
    area.innerHTML = `<div class="tkt-loading" style="color:var(--danger)">❌ ${e.message}</div>`;
  }
}

// Botão Atualizar força recarga
function tktAtualizar(pageId) {
  TKT_LOADED = false;
  tktCarregar(pageId);
}

// ── Renderizar área com KPIs + filtros + tabela ───────────
// ── Definição de colunas dos tickets ─────────────────────
const TKT_COLUNAS = [
  { id:'key',      label:'Key',            default:true  },
  { id:'tipo',     label:'Tipo',           default:true  },
  { id:'status',   label:'Status Jira',    default:true  },
  { id:'criado',   label:'Criado',         default:true  },
  { id:'solicit',  label:'Solicitante',    default:true  },
  { id:'colabs',   label:'Colaboradores',  default:true  },
  { id:'cargo',    label:'Cargo',          default:false },
  { id:'hub',      label:'HUB',            default:true  },
  { id:'stInt',    label:'Status Interno', default:true  },
];
// Registrar no mapa global de col pickers
_CP_DEFS['tkt'] = TKT_COLUNAS;

function tktRenderArea(areaId, lista, pageId) {
  const area = document.getElementById(areaId);
  if (!area) return;

  // Carregar prefs de colunas
  if (!_cpAtivas['tkt']) cpCarregar('tkt', TKT_COLUNAS);

  const total    = lista.length;
  const pendInt  = lista.filter(r => TKT_NOTAS[r['Key']]?.status === 'pendente').length;
  const resolv   = lista.filter(r => TKT_NOTAS[r['Key']]?.status === 'resolvido').length;
  const semNota  = total - pendInt - resolv;
  const tipos    = [...new Set(lista.map(r => r['Tipo']).filter(Boolean))].sort();

  area.innerHTML = `
    <div class="tkt-kpis">
      <div class="tkt-kpi"><div class="tkt-kpi-label">Total</div><div class="tkt-kpi-val">${total}</div></div>
      <div class="tkt-kpi"><div class="tkt-kpi-label">Sem anotação</div><div class="tkt-kpi-val" style="color:var(--muted)">${semNota}</div></div>
      <div class="tkt-kpi"><div class="tkt-kpi-label">⚠️ Pendentes</div><div class="tkt-kpi-val" style="color:var(--danger)">${pendInt}</div></div>
      <div class="tkt-kpi"><div class="tkt-kpi-label">✅ Resolvidos</div><div class="tkt-kpi-val" style="color:var(--success)">${resolv}</div></div>
    </div>

    <div class="toolbar" style="margin-bottom:16px">
      <div class="vt-search-wrap" style="flex:1;min-width:200px">
        <span class="vt-search-ico">🔍</span>
        <input type="text" class="vt-search" id="${areaId}-busca"
          placeholder="Buscar por key, colaborador, matrícula…"
          oninput="tktFiltrar('${areaId}','${pageId}')"/>
      </div>
      <select id="${areaId}-filtro-status" onchange="tktFiltrar('${areaId}','${pageId}')"
        style="background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 12px;font-size:13px;font-family:var(--font);outline:none">
        <option value="">Todos os status</option>
        <option value="sem_nota">— Sem anotação</option>
        <option value="pendente">🔴 Pendente</option>
        <option value="resolvido">✅ Resolvido</option>
      </select>
      ${tipos.length > 1 ? `
      <select id="${areaId}-filtro-tipo" onchange="tktFiltrar('${areaId}','${pageId}')"
        style="background:var(--surface2);border:1px solid var(--border);color:var(--text);border-radius:8px;padding:8px 12px;font-size:13px;font-family:var(--font);outline:none">
        <option value="">Todos os tipos</option>
        ${tipos.map(t=>`<option value="${t}">${t}</option>`).join('')}
      </select>` : ''}
      <button class="btn btn-ghost btn-sm" onclick="tktLimparFiltros('${areaId}','${pageId}')">✕ Limpar</button>
      <button class="btn btn-ghost btn-sm" onclick="TKT_LOADED=false;tktCarregar('${pageId}')">🔄 Atualizar</button>
      <div class="toolbar-right">
        <button class="btn btn-ghost btn-sm" onclick="cpAbrir('tkt','tkt-cp-popup',this)">⚙️ Colunas</button>
        <div class="col-picker-popup" id="tkt-cp-popup">
          <h4>Colunas visíveis</h4>
          <div class="col-picker-grid" id="tkt-cp-grid"></div>
          <div class="col-picker-actions">
            <button class="btn btn-ghost btn-sm" onclick="cpReset('tkt',TKT_COLUNAS,()=>tktFiltrar('${areaId}','${pageId}'))">Padrão</button>
            <button class="btn btn-primary btn-sm" style="margin-left:auto" onclick="cpAplicar('tkt','tkt-cp-popup',()=>tktFiltrar('${areaId}','${pageId}'))">Aplicar</button>
          </div>
        </div>
      </div>
    </div>

    <div class="table-wrap">
      <table class="main-table">
        <thead><tr id="${areaId}-thead"></tr></thead>
        <tbody id="${areaId}-tbody"></tbody>
      </table>
    </div>
    <p id="${areaId}-count" style="color:var(--muted);font-size:12px;margin-top:12px"></p>
  `;

  tktRenderTabela(areaId, lista);
}

// ── Renderizar tbody ──────────────────────────────────────
function tktRenderTabela(areaId, lista) {
  // Thead dinâmico
  const thead = document.getElementById(`${areaId}-thead`);
  const tbody = document.getElementById(`${areaId}-tbody`);
  const count = document.getElementById(`${areaId}-count`);
  if (!tbody) return;

  const ativas = _cpAtivas['tkt'] || new Set(TKT_COLUNAS.filter(c=>c.default).map(c=>c.id));
  const cols   = TKT_COLUNAS.filter(c => ativas.has(c.id)).map(c => c.id);
  const ncols  = cols.length || 1;

  if (thead) thead.innerHTML = TKT_COLUNAS.filter(c => ativas.has(c.id)).map(c=>`<th>${c.label}</th>`).join('');

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="${ncols}" style="text-align:center;padding:40px;color:var(--muted)">Nenhum ticket encontrado.</td></tr>`;
    if (count) count.textContent = '';
    return;
  }
  if (count) count.textContent = `${lista.length} ticket(s)`;

  const fmtData = d => { try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return d||'—'; } };

  tbody.innerHTML = lista.map(r => {
    const key   = r['Key'] || '—';
    const nota  = TKT_NOTAS[key];
    const stInt = nota?.status || '';
    const hub   = tktHubCode(r['HUB'] || '');
    const mats  = tktExtrairMatriculas(r);

    const matBadge = mats.length
      ? `<div style="display:flex;flex-wrap:wrap;gap:4px">
           ${mats.slice(0,3).map(m=>`<span style="background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:1px 6px;font-size:10.5px;font-family:monospace;font-weight:700">${m}</span>`).join('')}
           ${mats.length > 3 ? `<span style="font-size:10.5px;color:var(--muted);align-self:center">+${mats.length-3}</span>` : ''}
         </div>`
      : `<span style="color:var(--muted);font-size:12px">—</span>`;

    const statusJiraPill = (r['Status']||'').toLowerCase().includes('enviado')
      ? `<span class="tkt-pill tkt-pill-enviado">${r['Status']}</span>`
      : `<span class="tkt-pill tkt-pill-default">${r['Status']||'—'}</span>`;

    const statusIntPill = stInt === 'pendente'
      ? `<span class="tkt-pill tkt-pill-pendente">🔴 Pendente</span>`
      : stInt === 'resolvido'
        ? `<span class="tkt-pill tkt-pill-resolvido">✅ Resolvido</span>`
        : `<span class="tkt-pill tkt-pill-default">—</span>`;

    const cellMap = {
      key:    `<td><a href="https://spxresolve.atlassian.net/browse/${key}" target="_blank" rel="noopener" onclick="event.stopPropagation()" style="font-size:11px;font-weight:700;color:var(--accent);text-decoration:none;font-family:monospace" title="Abrir no Jira">${key} ↗</a></td>`,
      tipo:   `<td style="font-size:12px">${r['Tipo']||'—'}</td>`,
      status: `<td>${statusJiraPill}</td>`,
      criado: `<td style="font-size:12px;color:var(--muted)">${fmtData(r['Criado'])}</td>`,
      solicit:`<td style="font-size:12px">${r['Solicitante']||'—'}</td>`,
      colabs: `<td>${matBadge}</td>`,
      cargo:  `<td style="font-size:12px;color:var(--muted)">${r['Cargo']||'—'}</td>`,
      hub:    `<td><span style="background:var(--surface2);padding:2px 6px;border-radius:4px;font-size:11px">${hub||'—'}</span></td>`,
      stInt:  `<td>${statusIntPill}</td>`,
    };

    const dataR = JSON.stringify(r).replace(/"/g,'&quot;');
    return `<tr style="cursor:pointer" onclick="tktAbrirModal(${dataR})">${cols.map(c=>cellMap[c]||'<td>—</td>').join('')}</tr>`;
  }).join('');
}

// ── Filtrar tabela ────────────────────────────────────────
function tktFiltrar(areaId, pageId) {
  const busca   = (document.getElementById(`${areaId}-busca`)?.value||'').toLowerCase();
  const filtSt  = document.getElementById(`${areaId}-filtro-status`)?.value||'';
  const filtTipo= document.getElementById(`${areaId}-filtro-tipo`)?.value||'';

  let lista = tktFiltrarPorTipo(TKT_TODOS, pageId);

  if (busca)    lista = lista.filter(r =>
    [r['Key'],r['Nome Colaborador'],r['Matricula'],r['Matrícula'],r['Solicitante'],r['HUB']]
      .some(f=>(f||'').toLowerCase().includes(busca)));
  if (filtTipo) lista = lista.filter(r => r['Tipo'] === filtTipo);
  if (filtSt === 'sem_nota')  lista = lista.filter(r => !TKT_NOTAS[r['Key']]?.status);
  if (filtSt === 'pendente')  lista = lista.filter(r => TKT_NOTAS[r['Key']]?.status === 'pendente');
  if (filtSt === 'resolvido') lista = lista.filter(r => TKT_NOTAS[r['Key']]?.status === 'resolvido');

  tktRenderTabela(areaId, lista);
}

function tktLimparFiltros(areaId, pageId) {
  ['busca','filtro-status','filtro-tipo'].forEach(s => {
    const el = document.getElementById(`${areaId}-${s}`);
    if (el) el.value = '';
  });
  tktRenderTabela(areaId, tktFiltrarPorTipo(TKT_TODOS, pageId));
}

// ── Extrair matrículas (padrão WE+números) de ambas as colunas ──
function tktExtrairMatriculas(r) {
  const raw = [
    r['Nome Colaborador'] || '',
    r['Matricula']        || '',
    r['Matrícula']        || '',
  ].join(' ');
  const matches = raw.match(/WE\d+/gi) || [];
  return [...new Set(matches.map(m => m.toUpperCase()))];
}

// ── Abrir modal de detalhes ───────────────────────────────
function tktAbrirModal(r) {
  const key  = r['Key'] || '—';
  _tktKeyAtual    = key;
  const nota = TKT_NOTAS[key] || {};
  _tktStatusAtual = nota.status || '';

  document.getElementById('tkt-modal-key').innerHTML = `🎫 <a href="https://spxresolve.atlassian.net/browse/${key}" target="_blank" rel="noopener" style="color:var(--accent);text-decoration:none;font-weight:800" title="Abrir no Jira">${key} ↗</a>`;
  document.getElementById('tkt-modal-tipo').textContent = `${r['Tipo']||'—'} · ${tktHubCode(r['HUB']||'')}`;
  document.getElementById('tkt-modal-obs').value = nota.obs || '';

  const fmtData = d => { try { return new Date(d).toLocaleDateString('pt-BR'); } catch { return d||'—'; } };
  const campo = (l,v) => `<div><div style="font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.4px;margin-bottom:2px">${l}</div><div style="font-size:12.5px;font-weight:600">${v||'—'}</div></div>`;

  // Só matrículas — sem tentar casar com nomes
  const mats = tktExtrairMatriculas(r);
  const matsHtml = mats.length
    ? `<div style="display:flex;flex-wrap:wrap;gap:6px">
        ${mats.map(m => `
          <span style="font-family:monospace;font-size:12.5px;font-weight:800;color:var(--accent);
            background:var(--surface);border:1px solid var(--border);border-radius:6px;padding:4px 10px">
            ${m}
          </span>`).join('')}
       </div>`
    : `<span style="color:var(--muted);font-size:12px">Nenhuma matrícula identificada</span>`;

  document.getElementById('tkt-modal-info').innerHTML = `
    <div style="grid-column:1/-1">
      <div style="font-size:10px;color:var(--muted);text-transform:uppercase;font-weight:700;letter-spacing:.4px;margin-bottom:8px">Matrículas (${mats.length})</div>
      ${matsHtml}
    </div>
    ${campo('Cargo',       r['Cargo'])}
    ${campo('HUB',         tktHubCode(r['HUB']||''))}
    ${campo('Solicitante', r['Solicitante'])}
    ${campo('Criado em',   fmtData(r['Criado']))}
    ${campo('Status Jira', r['Status'])}
    ${campo('Tipo',        r['Tipo'])}
  `;

  tktAtualizarBotoesStatus(_tktStatusAtual);

  const hist = nota.historico || [];
  const histEl    = document.getElementById('tkt-modal-hist');
  const histLista = document.getElementById('tkt-modal-hist-lista');
  if (hist.length) {
    histEl.style.display = 'block';
    histLista.innerHTML = hist.map(h => `
      <div style="background:var(--surface2);border-radius:8px;padding:8px 10px;font-size:11.5px">
        <div style="font-weight:700;color:var(--text)">${h.usuario||'—'} <span style="font-weight:400;color:var(--muted)">· ${h.data||''}</span></div>
        <div style="color:var(--muted);margin-top:2px">${h.obs||''}</div>
        <div style="margin-top:2px">${h.status==='resolvido'
          ? '<span style="color:var(--success);font-size:10px;font-weight:700">✅ Resolvido</span>'
          : h.status==='pendente'
            ? '<span style="color:var(--danger);font-size:10px;font-weight:700">🔴 Pendente</span>'
            : ''}</div>
      </div>`).join('');
  } else {
    histEl.style.display = 'none';
  }

  abrirModal('modal-ticket');
}

function tktAtualizarBotoesStatus(st) {
  const base = 'flex:1;padding:8px;border-radius:8px;font-size:12.5px;font-weight:700;cursor:pointer;font-family:var(--font);transition:all .15s;border:2px solid ';
  const btnP = document.getElementById('tkt-btn-pendente');
  const btnR = document.getElementById('tkt-btn-resolvido');
  if (!btnP||!btnR) return;
  btnP.style.cssText = base + (st==='pendente'  ? 'var(--danger);background:rgba(239,68,68,.1);color:var(--danger)'   : 'var(--border);background:var(--surface2);color:var(--muted)');
  btnR.style.cssText = base + (st==='resolvido' ? 'var(--success);background:rgba(34,197,94,.1);color:var(--success)' : 'var(--border);background:var(--surface2);color:var(--muted)');
}

function tktSetStatus(st) {
  _tktStatusAtual = (_tktStatusAtual === st) ? '' : st;
  tktAtualizarBotoesStatus(_tktStatusAtual);
}

// ── Salvar nota interna ───────────────────────────────────
async function tktSalvar() {
  const btn = document.getElementById('tkt-btn-salvar');
  const obs = document.getElementById('tkt-modal-obs').value.trim();
  if (!_tktKeyAtual) return;
  btn.disabled = true; btn.textContent = 'Salvando…';
  try {
    await rpc('wc_ticket_nota_salvar', { p_key: _tktKeyAtual, p_status: _tktStatusAtual, p_obs: obs });
    if (!TKT_NOTAS[_tktKeyAtual]) TKT_NOTAS[_tktKeyAtual] = { historico: [] };
    TKT_NOTAS[_tktKeyAtual].status = _tktStatusAtual;
    TKT_NOTAS[_tktKeyAtual].obs    = obs;
    if (obs) {
      const hist = TKT_NOTAS[_tktKeyAtual].historico || [];
      hist.unshift({
        usuario: session?.nome || 'Onsite',
        data:    new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}),
        obs, status: _tktStatusAtual,
      });
      TKT_NOTAS[_tktKeyAtual].historico = hist.slice(0,20);
    }
    fecharModal('modal-ticket');
    // Re-renderizar a página atual
    const areaId = TKT_AREAS[_tktPageAtual];
    if (areaId) tktFiltrar(areaId, _tktPageAtual);
    toast('Ticket atualizado!', 'success');
  } catch(e) { toast(e.message, 'error'); }
  finally { btn.disabled=false; btn.textContent='💾 Salvar'; }
}
// ════════════════ FIM TICKETS SHOPEE ════════════════
