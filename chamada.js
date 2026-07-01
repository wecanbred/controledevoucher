//  CHAMADAS — visão do Consultor/Gestor (chamada de integração)
// ════════════════════════════════════════════════════════════
let CHAM_DADOS = [];
let CHAM_FILTRO_OCULTOS = new Set();
let CHAM_FILTRO_TEMP    = new Set();
const CHAM_FILTRO_KEY = 'wecan_cham_filtro_oculto';
(function chamFiltroCarregarSalvo() {
  try {
    const raw = localStorage.getItem(CHAM_FILTRO_KEY);
    if (raw) CHAM_FILTRO_OCULTOS = new Set(JSON.parse(raw));
  } catch(e) {}
})();

function chamLabelCC(r) {
  const cli = (r.cli_nome || '').trim();
  const dep = (r.depto_nome || r.depto_cod || '').trim();
  return cli && dep ? `${cli} · ${dep}` : (cli || dep || '—');
}

function chamFiltroAbrir(evt) {
  document.querySelectorAll('.col-picker-popup.open').forEach(p => { if (p.id !== 'cham-filtro-cc-popup') p.classList.remove('open'); });
  const popup = document.getElementById('cham-filtro-cc-popup');
  const isOpen = popup.classList.toggle('open');
  if (isOpen) {
    const rect = evt.currentTarget.getBoundingClientRect();
    popup.style.top  = (rect.bottom + 6) + 'px';
    popup.style.left = rect.left + 'px';
    CHAM_FILTRO_TEMP = new Set(CHAM_FILTRO_OCULTOS);
    chamFiltroRenderGrid();
  }
}

function chamFiltroRenderGrid() {
  const labels = [...new Set(CHAM_DADOS.map(chamLabelCC))].sort((a,b)=>a.localeCompare(b,'pt-BR'));
  const grid = document.getElementById('cham-filtro-cc-grid');
  if (!labels.length) { grid.innerHTML = '<div style="font-size:12px;color:var(--muted);padding:6px">Nenhuma operação encontrada.</div>'; return; }
  grid.innerHTML = labels.map(l => {
    const marcado = !CHAM_FILTRO_TEMP.has(l);
    const safe = l.replace(/'/g, "\\'");
    return `<label class="col-check-item ${marcado?'checked':''}">
      <input type="checkbox" ${marcado?'checked':''} onchange="chamFiltroTogglePendente('${safe}', this.checked)"/>
      ${l}
    </label>`;
  }).join('');
}
function chamFiltroTogglePendente(label, marcado) {
  if (marcado) CHAM_FILTRO_TEMP.delete(label); else CHAM_FILTRO_TEMP.add(label);
  document.querySelectorAll('#cham-filtro-cc-grid .col-check-item').forEach(el => {
    const chk = el.querySelector('input');
    el.classList.toggle('checked', chk.checked);
  });
}
function chamFiltroMarcarTodos(marcarTodos) {
  CHAM_FILTRO_TEMP = marcarTodos ? new Set() : new Set(CHAM_DADOS.map(chamLabelCC));
  chamFiltroRenderGrid();
}
function chamAtualizarBotaoFiltro() {
  const btn = document.getElementById('cham-filtro-cc-btn');
  if (!btn) return;
  const labels = new Set(CHAM_DADOS.map(chamLabelCC));
  const ocultos = [...CHAM_FILTRO_OCULTOS].filter(l => labels.has(l)).length;
  btn.textContent = ocultos ? `🔽 Filtrar CC / Operação (${labels.size-ocultos}/${labels.size})` : '🔽 Filtrar CC / Operação';
}
function chamFiltroAplicar() {
  CHAM_FILTRO_OCULTOS = new Set(CHAM_FILTRO_TEMP);
  try { localStorage.setItem(CHAM_FILTRO_KEY, JSON.stringify([...CHAM_FILTRO_OCULTOS])); } catch(e) {}
  document.getElementById('cham-filtro-cc-popup').classList.remove('open');
  chamAtualizarBotaoFiltro();
  chamadasRenderTabela();
}


function chamadaAbrirPainel() {
  const tok    = session?.token  || '';
  const perfil = session?.perfil || '';
  const nome   = encodeURIComponent(session?.nome || '');
  const url    = `chamada.html?tok=${tok}&perfil=${perfil}&nome=${nome}`;
  window.open(url, 'chamada_win', 'width=1000,height=760,scrollbars=yes,resizable=yes,toolbar=no,menubar=no');
}

async function chamadasCarregar() {
  const tbody = document.getElementById('cham-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:40px">Carregando…</td></tr>';
  try {
    const r = await rpc('wc_chamada_listar', {});
    CHAM_DADOS = r.itens || [];
    chamAtualizarBotaoFiltro();
    chamadasRenderKpis();
    chamadasRenderTabela();
    const pendAusentes = CHAM_DADOS.filter(c => c.status === 'AUSENTE' && !c.resolvido && !c.onboarding_shopee).length;
    const badge = document.getElementById('nav-chamadas-count');
    if (badge) { badge.textContent = pendAusentes; badge.style.display = pendAusentes ? 'inline-flex' : 'none'; }
  } catch(e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:40px">${e.message}</td></tr>`;
  }
}

function chamadasRenderKpis() {
  const total     = CHAM_DADOS.length;
  const presentes = CHAM_DADOS.filter(c => c.status === 'PRESENTE').length;
  const ausentes  = CHAM_DADOS.filter(c => c.status === 'AUSENTE').length;
  const pend      = CHAM_DADOS.filter(c => c.status === 'AUSENTE' && !c.resolvido && !c.onboarding_shopee).length;
  const resolvidos= CHAM_DADOS.filter(c => c.status === 'AUSENTE' && (c.resolvido || c.onboarding_shopee)).length;

  document.getElementById('cham-kpis').innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.6px">Total</div>
      <div style="font-size:28px;font-weight:900;margin-top:4px">${total}</div>
    </div>
    <div class="card" style="text-align:center">
      <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.6px">Presentes</div>
      <div style="font-size:28px;font-weight:900;color:var(--success);margin-top:4px">${presentes}</div>
    </div>
    <div class="card" style="text-align:center">
      <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.6px">Ausentes</div>
      <div style="font-size:28px;font-weight:900;color:var(--danger);margin-top:4px">${ausentes}</div>
    </div>
    <div class="card" style="text-align:center">
      <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.6px">Sem Acompanhamento</div>
      <div style="font-size:28px;font-weight:900;color:var(--danger);margin-top:4px">${pend}</div>
    </div>
    <div class="card" style="text-align:center">
      <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.6px">Resolvidos</div>
      <div style="font-size:28px;font-weight:900;color:var(--success);margin-top:4px">${resolvidos}</div>
    </div>`;
}

function chamadasRenderTabela() {
  const busca  = (document.getElementById('cham-busca')?.value || '').toLowerCase();
  const status = document.getElementById('cham-filtro-status')?.value;
  const acomp  = document.getElementById('cham-filtro-acomp')?.value || '';

  let dados = CHAM_DADOS.filter(r => {
    const txt = `${r.nome||''} ${r.codigo||''} ${r.depto_nome||''} ${r.depto_cod||''} ${r.cli_nome||''}`.toLowerCase();
    if (busca && !txt.includes(busca)) return false;
    if (CHAM_FILTRO_OCULTOS.has(chamLabelCC(r))) return false;
    if (status === 'PENDENTE' && r.status) return false;
    if ((status === 'AUSENTE' || status === 'PRESENTE') && r.status !== status) return false;
    if (acomp === 'pendente'  && (r.status !== 'AUSENTE' || r.resolvido || r.onboarding_shopee))  return false;
    if (acomp === 'resolvido' && (r.status !== 'AUSENTE' || (!r.resolvido && !r.onboarding_shopee))) return false;
    return true;
  });

  // Ausentes sem acompanhamento primeiro, depois ausentes resolvidos, depois o resto
  const peso = r => (r.status === 'AUSENTE' && !r.resolvido && !r.onboarding_shopee) ? 0 : (r.status === 'AUSENTE' ? 1 : (r.status === 'PRESENTE' ? 3 : 2));
  dados = [...dados].sort((a,b) => peso(a) - peso(b) || new Date(b.created_at) - new Date(a.created_at));

  const tbody = document.getElementById('cham-tbody');
  if (!dados.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:40px;color:var(--muted)">Nenhum registro encontrado</td></tr>';
    return;
  }

  const fmt = d => { if(!d) return '—'; return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.split('-').reverse().join('/') : d; };

  tbody.innerHTML = dados.map(r => {
    const statusPill = r.status === 'AUSENTE'
      ? `<span style="background:rgba(239,68,68,.15);color:var(--danger);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">❌ AUSENTE</span>`
      : r.status === 'PRESENTE'
      ? `<span style="background:rgba(34,197,94,.15);color:var(--success);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">✅ PRESENTE</span>`
      : `<span style="background:rgba(245,158,11,.15);color:var(--warning);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">⏳ PENDENTE</span>`;
    let acompPill = '<span style="color:var(--muted);font-size:11px">—</span>';
    if (r.status === 'AUSENTE') {
      if (r.onboarding_shopee) {
        acompPill = `<span style="background:rgba(249,115,22,.15);color:#fb923c;font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">🟠 Onboarding Shopee</span>`;
      } else {
        acompPill = r.resolvido
          ? `<span style="background:rgba(99,204,176,.15);color:var(--success);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">✅ Resolvido${r.desistencia?' · Vaga reaberta':''}</span>`
          : `<span style="background:rgba(239,68,68,.1);color:var(--danger);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">🔴 Pendente</span>`;
      }
    }
    const dataR = JSON.stringify(r).replace(/"/g,'&quot;');
    const clickable = r.status === 'AUSENTE' ? `onclick="chamadasAbrirConsultor(${dataR})" style="cursor:pointer"` : '';
    return `<tr ${clickable}>
      <td style="white-space:nowrap">${fmt(r.data_admissao)}</td>
      <td><strong>${r.nome||'—'}</strong><div style="font-size:11px;color:var(--muted)">${r.codigo||''}</div></td>
      <td style="font-size:11px">${r.cli_nome?r.cli_nome+' · ':''}${r.depto_nome||r.depto_cod||'—'}</td>
      <td style="font-size:11px">${r.onsite_nome||'—'}</td>
      <td>${statusPill}</td>
      <td>${acompPill}</td>
    </tr>`;
  }).join('');
}

async function chamadasAbrirConsultor(r) {
  document.getElementById('cham-cons-id').value        = r.id;
  document.getElementById('cham-cons-nome').textContent = r.nome || '—';
  document.getElementById('cham-cons-sub').textContent  = `${r.cli_nome||''} · ${r.depto_cod||r.depto_nome||''} · Matrícula ${r.codigo||'—'}`;
  document.getElementById('cham-cons-obs').value        = r.obs_consultor || '';
  document.getElementById('cham-cons-vaga').value       = r.vaga_jira || '';
  document.getElementById('cham-cons-processo').value   = r.processo || '';
  document.getElementById('cham-cons-data-deslig').value= r.data_desligamento ? r.data_desligamento.substring(0,10) : '';
  document.getElementById('cham-cons-motivo').value     = r.motivo || '';
  document.getElementById('cham-cons-vaga-info').textContent = '';

  const fmt = d => { if(!d) return '—'; return /^\d{4}-\d{2}-\d{2}/.test(d) ? d.split('-').reverse().join('/') : d; };
  document.getElementById('cham-cons-info').innerHTML = `
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Onsite</span><br><strong>${r.onsite_nome||'—'}</strong></div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Data da Integração</span><br>${fmt(r.data_admissao)}</div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Cargo</span><br>${r.cargo||'—'}</div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Obs. do Onsite</span><br>${r.obs_onsite||'—'}</div>`;

  const desistEl = document.getElementById('cham-cons-desistencia');
  desistEl.checked = !!r.desistencia;
  desistEl.parentElement.querySelector('span').style.background = desistEl.checked ? 'var(--success)' : 'var(--surface3)';
  desistEl.parentElement.querySelector('em').style.left = desistEl.checked ? '22px' : '3px';
  chamadasToggleDesistencia(desistEl.checked);

  // Restaurar seleção de resolução
  document.getElementById('cham-cons-resolucao').value = '';
  chamadasSelecionarResolucao(r.resolvido ? 'resolvido' : '');
  if (r.onboarding_shopee) document.getElementById('cham-cons-shopee-chk').checked = true;

  abrirModal('modal-chamada-consultor');

  if (!window.VAGAS || !VAGAS.length) { try { await carregarVagas(); } catch(e) {} }
  setTimeout(() => chamadasBuscarVagaAuto(r.nome, r.codigo), 100);
}

function chamadasToggleDesistencia(ativo) {
  document.getElementById('cham-cons-desist-campos').style.display = ativo ? 'grid' : 'none';
  document.getElementById('cham-cons-resolvido-wrap').style.display = ativo ? 'none' : 'flex';
}

function chamadasSelecionarResolucao(opcao) {
  const atual = document.getElementById('cham-cons-resolucao').value;
  const novo  = atual === opcao ? '' : opcao;
  document.getElementById('cham-cons-resolucao').value = novo;

  const ativo = novo === 'resolvido';
  const optEl = document.getElementById('cham-cons-opt-resolvido');
  const icoEl = document.getElementById('cham-cons-opt-resolvido-ico');
  const shopeeWrap = document.getElementById('cham-cons-shopee-wrap');

  optEl.style.borderColor = ativo ? 'var(--success)' : 'var(--border)';
  optEl.style.background  = ativo ? 'rgba(34,197,94,.08)' : 'var(--surface2)';
  icoEl.textContent       = ativo ? '✅' : '⬜';
  shopeeWrap.style.display = ativo ? 'flex' : 'none';
  if (!ativo) document.getElementById('cham-cons-shopee-chk').checked = false;
}

async function chamadasBuscarVagaAuto(nome, matricula) {
  const infoEl = document.getElementById('cham-cons-vaga-info');
  const vagaEl = document.getElementById('cham-cons-vaga');
  if (!vagaEl || vagaEl.value) return;
  if (infoEl) infoEl.innerHTML = `<span style="color:var(--muted)">🔍 Buscando vaga…</span>`;

  const mat   = (matricula||'').replace(/^WE/i,'').toLowerCase();
  const busca = (nome||'').toLowerCase();
  let vaga = null;
  if (window.VAGAS && VAGAS.length) {
    vaga = VAGAS.find(v =>
      (v.matricula||'').replace(/^WE/i,'').toLowerCase() === mat ||
      (v.colaborador||'').toLowerCase() === busca
    );
  }
  if (!vaga) {
    try {
      const r = await rpc('wc_buscar_vaga_por_matricula', { p_matricula: 'WE'+mat });
      if (r && r.jira) vaga = r;
    } catch(e) {}
  }
  if (vaga) {
    vagaEl.value = vaga.jira || '';
    if (infoEl) infoEl.innerHTML = `<span style="color:var(--success)">✅ ${vaga.jira} · ${vaga.cargo||''} · ${vaga.local||vaga.regional||vaga.codigo_hub||''}</span>`;
  } else {
    if (infoEl) infoEl.innerHTML = `<span style="color:var(--muted)">Nenhuma vaga encontrada — preencha manualmente.</span>`;
  }
}

function chamadasBuscarVaga() {
  const vagaCod = document.getElementById('cham-cons-vaga').value.trim();
  const infoEl  = document.getElementById('cham-cons-vaga-info');
  if (!vagaCod || !window.VAGAS) return;
  const vaga = VAGAS.find(v => (v.jira||'').toLowerCase() === vagaCod.toLowerCase());
  if (vaga) {
    infoEl.innerHTML = `<span style="color:var(--success)">✅ ${vaga.jira} · ${vaga.cargo||''} · ${vaga.local||vaga.regional||''} · ${vaga.status||''}</span>`;
  } else {
    infoEl.innerHTML = `<span style="color:var(--muted)">Vaga não encontrada no sistema.</span>`;
  }
}

async function chamadasSalvar() {
  const id          = document.getElementById('cham-cons-id').value;
  const obs         = document.getElementById('cham-cons-obs').value.trim();
  const desistencia = document.getElementById('cham-cons-desistencia').checked;

  try {
    if (desistencia) {
      const vaga      = document.getElementById('cham-cons-vaga').value.trim();
      const processo   = document.getElementById('cham-cons-processo').value;
      const dataDeslig = document.getElementById('cham-cons-data-deslig').value;
      const motivo     = document.getElementById('cham-cons-motivo').value.trim();
      if (!dataDeslig) { showToast('Informe a data do desligamento.', 'error'); return; }
      if (vaga && !confirm(`Confirmar desistência de "${document.getElementById('cham-cons-nome').textContent}"?\n\nA vaga ${vaga} será reaberta para reposição.`)) return;

      await rpc('wc_chamada_confirmar_desistencia', {
        p_id: id, p_vaga_jira: vaga || null, p_processo: processo || null,
        p_obs_consultor: obs, p_data_desligamento: dataDeslig, p_motivo: motivo || null
      });
      showToast('Desistência confirmada' + (vaga ? ' e vaga reaberta!' : '.'), 'success');
    } else {
      const resolucao         = document.getElementById('cham-cons-resolucao').value;
      const resolvido         = resolucao === 'resolvido';
      const onboarding_shopee = resolvido && document.getElementById('cham-cons-shopee-chk').checked;
      await rpc('wc_chamada_salvar_consultor', {
        p_id: id, p_obs_consultor: obs,
        p_resolvido: resolvido, p_onboarding_shopee: onboarding_shopee
      });
      showToast(
        onboarding_shopee ? '🟠 Resolvido — Onboarding Shopee registrado!' :
        resolvido ? '✅ Acompanhamento resolvido!' : 'Observação salva.',
        'success'
      );
    }
    fecharModal('modal-chamada-consultor');
    await chamadasCarregar();
  } catch(e) { showToast('Erro: ' + e.message, 'error'); }
}

// ════════════════════════════════════════════════════════════
