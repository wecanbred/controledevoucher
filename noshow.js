//  NO SHOW — R&S
// ══════════════════════════════════════════════
let NS_DADOS = [];

async function nsCarregar() {
  try {
    // Garantir que vagas estão carregadas para o PROCV automático
    if (!window.VAGAS || !VAGAS.length) await carregarVagas();
    const r = await rpc('wc_noshow_listar', {});
    NS_DADOS = r.itens || [];
    nsRenderKpis();
    nsRenderTabela();
  } catch(e) {
    showToast('Erro ao carregar No Show: ' + e.message, 'error');
  }
}

function nsRenderKpis() {
  const total     = NS_DADOS.length;
  const noshow    = NS_DADOS.filter(r => r.ns_tipo_abs === 'NO SHOW').length;
  const eto       = NS_DADOS.filter(r => r.ns_tipo_abs === 'EARLY TURNOVER').length;
  const pendentes = NS_DADOS.filter(r => !r.ns_resolvido).length;
  const resolvidos= NS_DADOS.filter(r =>  r.ns_resolvido).length;

  document.getElementById('ns-kpis').innerHTML = `
    <div class="card" style="text-align:center">
      <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.6px">Total</div>
      <div style="font-size:28px;font-weight:900;margin-top:4px">${total}</div>
    </div>
    <div class="card" style="text-align:center">
      <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.6px">No Show</div>
      <div style="font-size:28px;font-weight:900;color:var(--danger);margin-top:4px">${noshow}</div>
    </div>
    <div class="card" style="text-align:center">
      <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.6px">Early Turnover</div>
      <div style="font-size:28px;font-weight:900;color:var(--warning);margin-top:4px">${eto}</div>
    </div>
    <div class="card" style="text-align:center">
      <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.6px">Pendentes</div>
      <div style="font-size:28px;font-weight:900;color:var(--danger);margin-top:4px">${pendentes}</div>
    </div>
    <div class="card" style="text-align:center">
      <div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.6px">Resolvidos</div>
      <div style="font-size:28px;font-weight:900;color:var(--success);margin-top:4px">${resolvidos}</div>
    </div>`;
}

function nsRenderTabela() {
  const busca  = (document.getElementById('ns-busca')?.value || '').toLowerCase();
  const tipo   = document.getElementById('ns-filtro-tipo')?.value || '';
  const status = document.getElementById('ns-filtro-status')?.value || '';

  let dados = NS_DADOS.filter(r => {
    const txt = `${r.nome||''} ${r.matricula||''} ${r.depto_nome||''} ${r.cc_nome||''}`.toLowerCase();
    if (busca && !txt.includes(busca)) return false;
    if (tipo && r.ns_tipo_abs !== tipo) return false;
    if (status === 'pendente'  &&  r.ns_resolvido) return false;
    if (status === 'resolvido' && !r.ns_resolvido) return false;
    return true;
  });

  cpTheadNS();
  const tbody = document.getElementById('ns-tbody');
  if (!tbody) return;
  const ativas = _cpAtivas['ns'] || new Set(NS_COLUNAS.filter(c=>c.default).map(c=>c.id));
  const cols = NS_COLUNAS.filter(c => ativas.has(c.id)).map(c=>c.id);
  const ncols = cols.length || 1;

  if (!dados.length) {
    tbody.innerHTML = `<tr><td colspan="${ncols}" style="text-align:center;padding:40px;color:var(--muted)">Nenhum registro encontrado</td></tr>`;
    return;
  }

  const fmt = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  const fmtDt = d => d ? new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}) : '—';

  tbody.innerHTML = dados.map(r => {
    const tipoPill = r.ns_tipo_abs === 'NO SHOW'
      ? `<span style="background:rgba(239,68,68,.15);color:var(--danger);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">⊘ NO SHOW</span>`
      : `<span style="background:rgba(245,158,11,.15);color:var(--warning);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">↩ ETO</span>`;
    const statusPill = r.ns_resolvido
      ? `<span style="background:rgba(99,204,176,.15);color:var(--success);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">✅ Resolvido</span>`
      : `<span style="background:rgba(239,68,68,.1);color:var(--danger);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">🔴 Pendente</span>`;
    const participou = r.ns_participou_integracao
      ? `<span style="color:var(--success)">✅ Sim</span>`
      : `<span style="color:var(--danger)">❌ Não</span>`;
    const vagaCod = r.ns_vaga_codigo
      ? `<span style="font-family:monospace;font-size:11px;background:var(--surface2);padding:2px 6px;border-radius:4px">${r.ns_vaga_codigo}</span>`
      : `<span style="color:var(--muted);font-size:11px">—</span>`;
    const dataR = JSON.stringify(r).replace(/"/g,'&quot;');
    const cellMap = {
      lancamento: `<td style="white-space:nowrap">${fmtDt(r.ns_lancamento)}</td>`,
      tipo:       `<td>${tipoPill}</td>`,
      nome:       `<td><strong>${r.nome||'—'}</strong></td>`,
      matricula:  `<td>${r.matricula||'—'}</td>`,
      cc:         `<td style="font-size:11px">${r.depto_cod||r.depto_nome||'—'}</td>`,
      data_integ: `<td>${fmt(r.data_admissao)}</td>`,
      data_deslig:`<td>${fmt(r.ns_data_desligamento)}</td>`,
      participou: `<td>${participou}</td>`,
      onsite:     `<td style="font-size:11px">${r.onsite_nome||'—'}</td>`,
      vaga:       `<td>${vagaCod}</td>`,
      status:     `<td>${statusPill}</td>`,
    };
    return `<tr style="cursor:pointer" onclick="nsAbrirConsultor(${dataR})">${cols.map(c=>cellMap[c]||'<td>—</td>').join('')}</tr>`;
  }).join('');
}

async function nsAbrirConsultor(r) {
  document.getElementById('ns-cons-id').value         = r.id;
  document.getElementById('ns-cons-nome').textContent  = r.nome || '—';
  document.getElementById('ns-cons-sub').textContent   = `${r.ns_tipo_abs||''} · ${r.depto_cod||r.depto_nome||''} · Matrícula ${r.matricula||'—'}`;
  document.getElementById('ns-cons-vaga').value        = r.ns_vaga_codigo || '';
  document.getElementById('ns-cons-processo').value    = r.ns_processo || '';
  document.getElementById('ns-cons-obs').value         = r.ns_obs_consultor || '';
  document.getElementById('ns-vaga-info').textContent  = '';

  // Info resumida
  const fmt = d => d ? new Date(d).toLocaleDateString('pt-BR') : '—';
  document.getElementById('ns-cons-info').innerHTML = `
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Onsite</span><br><strong>${r.onsite_nome||'—'}</strong></div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Consultor</span><br><strong>${r.consultor_nome||'—'}</strong></div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Motivo</span><br>${r.ns_motivo||'—'}</div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Data Desligamento</span><br>${fmt(r.ns_data_desligamento)}</div>`;

  const resolvidoEl = document.getElementById('ns-cons-resolvido');
  resolvidoEl.checked = !!r.ns_resolvido;
  resolvidoEl.parentElement.querySelector('span').style.background = resolvidoEl.checked ? 'var(--success)' : 'var(--surface3)';
  resolvidoEl.parentElement.querySelector('em').style.left = resolvidoEl.checked ? '22px' : '3px';

  // Botão reabrir vaga
  const btnReabrir = document.getElementById('ns-btn-reabrir');
  btnReabrir.style.display = r.ns_vaga_codigo ? 'flex' : 'none';
  btnReabrir.dataset.vaga = r.ns_vaga_codigo || '';

  // Buscar vaga automaticamente pelo nome/matrícula
  if (!window.VAGAS || !VAGAS.length) {
    await carregarVagas();
  }
  console.log('NS abrir modal:', {nome: r.nome, matricula: r.matricula, totalVagas: VAGAS.length});
  console.log('Primeiras vagas:', VAGAS.slice(0,5).map(v=>({jira:v.jira, mat:v.matricula, col:v.colaborador})));
  abrirModal('modal-ns-consultor');

  // Buscar vaga após modal abrir (elementos precisam estar no DOM)
  setTimeout(() => nsBuscarVagaAuto(r.nome, r.matricula), 100);
}

async function nsBuscarVagaAuto(nome, matricula) {
  const infoEl = document.getElementById('ns-vaga-info');
  const vagaEl = document.getElementById('ns-cons-vaga');
  if (!vagaEl || vagaEl.value) return;

  if (infoEl) infoEl.innerHTML = `<span style="color:var(--muted)">🔍 Buscando vaga…</span>`;

  const mat   = (matricula||'').replace(/^WE/i,'').toLowerCase();
  const matWE = 'WE' + mat;
  const busca = (nome||'').toLowerCase();

  // Busca nas vagas em memória (todas)
  let vaga = null;
  if (window.VAGAS && VAGAS.length) {
    vaga = VAGAS.find(v =>
      (v.matricula||'').replace(/^WE/i,'').toLowerCase() === mat ||
      (v.colaborador||'').toLowerCase() === busca
    );
  }

  // Se não encontrou, busca direto no banco
  if (!vaga) {
    try {
      const r = await rpc('wc_buscar_vaga_por_matricula', { p_matricula: matWE });
      if (r && r.jira) vaga = r;
    } catch(e) { /* RPC pode não existir */ }
  }

  if (vaga) {
    vagaEl.value = vaga.jira || '';
    if (infoEl) infoEl.innerHTML = `<span style="color:var(--success)">✅ ${vaga.jira} · ${vaga.cargo||''} · ${vaga.local||vaga.regional||vaga.codigo_hub||''}</span>`;
    const btn = document.getElementById('ns-btn-reabrir');
    if (btn) { btn.style.display = 'flex'; btn.dataset.vaga = vaga.jira || ''; }
  } else {
    if (infoEl) infoEl.innerHTML = `<span style="color:var(--muted)">Nenhuma vaga encontrada — preencha manualmente.</span>`;
  }
}


function nsBuscarVaga() {
  const vagaCod = document.getElementById('ns-cons-vaga').value.trim();
  if (!vagaCod || !window.VAGAS) return;
  const vaga = VAGAS.find(v => (v.jira||'').toLowerCase() === vagaCod.toLowerCase());
  const infoEl = document.getElementById('ns-vaga-info');
  if (vaga) {
    infoEl.innerHTML = `<span style="color:var(--success)">✅ ${vaga.jira} · ${vaga.cargo||''} · ${vaga.local||vaga.regional||''} · ${vaga.status||''}</span>`;
    document.getElementById('ns-btn-reabrir').style.display = 'flex';
    document.getElementById('ns-btn-reabrir').dataset.vaga = vaga.jira;
  } else {
    infoEl.innerHTML = `<span style="color:var(--muted)">Vaga não encontrada no sistema.</span>`;
  }
}

async function nsReabrirVaga() {
  const vagaJira   = document.getElementById('ns-btn-reabrir').dataset.vaga;
  const nomeColaborador = document.getElementById('ns-cons-nome')?.textContent || '';
  if (!vagaJira) return;

  // Busca nas vagas em memória ou usa só o jira
  const vaga = VAGAS?.find(v => v.jira === vagaJira);

  if (!confirm(`Reabrir a vaga ${vagaJira} para substituição?\n\nO candidato "${nomeColaborador}" será registrado como No Show na vaga.`)) return;

  try {
    await rpc('wc_reabrir_vaga_noshow', {
      p_vaga_jira:   vagaJira,
      p_nome_noshow: nomeColaborador
    });
    showToast(`Vaga ${vagaJira} reaberta! Redirecionando…`, 'success');
    fecharModal('modal-ns-consultor');
    // Recarregar vagas e abrir a vaga diretamente
    await carregarVagas();
    navTo('vagas');
    // Abrir modal da vaga após navegar
    setTimeout(() => {
      const v = VAGAS?.find(v => v.jira === vagaJira);
      if (v) abrirModalVaga(vagaJira);
    }, 500);
  } catch(e) {
    showToast('Erro ao reabrir vaga: ' + e.message, 'error');
  }
}

async function nsSalvarConsultor() {
  const id        = document.getElementById('ns-cons-id').value;
  const vaga      = document.getElementById('ns-cons-vaga').value.trim();
  const processo  = document.getElementById('ns-cons-processo').value;
  const obs       = document.getElementById('ns-cons-obs').value.trim();
  const resolvido = document.getElementById('ns-cons-resolvido').checked;

  try {
    await rpc('wc_noshow_salvar_consultor', {
      p_colab_id:   id,
      p_vaga_codigo: vaga || null,
      p_processo:    processo || null,
      p_obs:         obs || null,
      p_resolvido:   resolvido
    });
    fecharModal('modal-ns-consultor');
    await nsCarregar();
    showToast('Acompanhamento salvo!', 'success');
  } catch(e) {
    showToast('Erro: ' + e.message, 'error');
  }
}

// ════════════════════════════════════════════════════════════
