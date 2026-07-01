//  VOUCHER — lógica integrada (prefixo vchr)
// ════════════════════════════════════════════════════════════
// Alias: voucher usa showToast, admissao usa toast
function showToast(msg, tipo) { toast(msg, tipo); }
let VCHR_COLABORADORES  = [];
let VCHR_HISTORICO      = [];
let VCHR_DADOS_CARREGADOS = false;
let VCHR_INATIVAR_MATRICULA = '';

async function vchrAtualizarDados() {
  try {
    const [rc, rh] = await Promise.all([
      rpc('wc_voucher_listar', { p_status:'TODOS' }),
      rpc('wc_voucher_historico', {})
    ]);
    VCHR_COLABORADORES = rc.itens    || [];
    VCHR_HISTORICO     = rh.historico || [];
    VCHR_DADOS_CARREGADOS = true;
    const ativos = VCHR_COLABORADORES.filter(c=>c.status==='ATIVO').length;
    const badge  = document.getElementById('vchr-badge-ativos');
    if (badge) badge.textContent = ativos || '';
  } catch(e) { showToast(e.message,'error'); }
}

// Intercepta navTo para páginas vchr-*
const _origNavTo = window.navTo;
window.navTo = function(id) {
  if (id && id.startsWith('vchr-')) {
    document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
    document.querySelectorAll('nav a, .nav-suporte-item').forEach(a=>a.classList.remove('active'));
    const page = document.getElementById('page-'+id);
    if (page) page.classList.add('active');
    document.querySelector(`[data-page="${id}"]`)?.classList.add('active');
    if (!VCHR_DADOS_CARREGADOS) {
      vchrAtualizarDados().then(()=>vchrRenderPagina(id));
    } else { vchrRenderPagina(id); }
    fecharSidebarMobile && fecharSidebarMobile();
    return;
  }
  _origNavTo(id);
};

function vchrRenderPagina(id) {
  if (id==='vchr-dashboard') vchrRenderDashboard();
  if (id==='vchr-controle')  vchrRenderControle();
  if (id==='vchr-historico') vchrRenderHistorico();
  if (id==='vchr-inativar')  {
    const i=document.getElementById('vchr-busca-inat'); if(i) i.value='';
    vchrBuscarParaInativar(); // Carrega lista imediatamente
  }
}

function vchrRenderDashboard() {
  const ativos  = VCHR_COLABORADORES.filter(c=>c.status==='ATIVO').length;
  const inativos= VCHR_COLABORADORES.filter(c=>c.status==='INATIVO').length;
  const total   = VCHR_COLABORADORES.length;
  const ida     = VCHR_COLABORADORES.filter(c=>c.status==='ATIVO'&&c.trajeto==='IDA').length;
  const volta   = VCHR_COLABORADORES.filter(c=>c.status==='ATIVO'&&c.trajeto==='VOLTA').length;
  const set=(id,v)=>{const e=document.getElementById(id);if(e)e.textContent=v;};
  set('vchr-kpi-ativos',ativos);set('vchr-kpi-inativos',inativos);set('vchr-kpi-total',total);set('vchr-kpi-ida',ida);set('vchr-kpi-volta',volta);
  const porUnidade={};
  VCHR_COLABORADORES.filter(c=>c.status==='ATIVO').forEach(c=>{const u=c.unidade||'Sem unidade';porUnidade[u]=(porUnidade[u]||0)+1;});
  const maxU=Math.max(...Object.values(porUnidade),1);
  const uEl=document.getElementById('vchr-dash-unidades');
  if(uEl) uEl.innerHTML=Object.entries(porUnidade).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div style="display:flex;align-items:center;gap:10px;padding:6px 0;border-bottom:1px solid var(--border);font-size:12.5px"><span style="flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${k}</span><div style="width:80px;height:6px;background:var(--surface2);border-radius:3px;flex-shrink:0"><div style="width:${Math.round(v/maxU*100)}%;height:6px;background:var(--accent);border-radius:3px"></div></div><span style="color:var(--muted);min-width:20px;text-align:right">${v}</span></div>`).join('')||'<p style="color:var(--muted);font-size:12.5px">Sem dados</p>';
  const iEl=document.getElementById('vchr-dash-inativacoes');
  const inats=VCHR_HISTORICO.filter(h=>h.tipo&&h.tipo.toUpperCase().includes('INATIV')).slice(0,8);
  if(iEl) iEl.innerHTML=inats.length?inats.map(h=>`<div class="vchr-hist-row"><div class="vchr-hist-ico">⊘</div><div class="vchr-hist-main"><div class="vchr-hist-tipo">${h.matricula} — ${h.motivo||'—'}</div><div class="vchr-hist-sub">${h.responsavel||'—'} · ${h.created_at?new Date(h.created_at).toLocaleDateString('pt-BR'):''}</div></div></div>`).join(''):'<p style="color:var(--muted);font-size:12.5px;padding:12px 0">Nenhuma inativação registrada</p>';
}

function vchrDefinirTrajeto(e,s){if(!e||!s)return null;const hE=parseInt((e||'').split(':')[0],10),hS=parseInt((s||'').split(':')[0],10);if(hE>=0&&hE<=4)return'IDA';if(hS>=0&&hS<=4)return'VOLTA';return null;}

function vchrRenderControle() {
  const busca=(document.getElementById('vchr-busca-colab')?.value||'').toLowerCase();
  const status=document.getElementById('vchr-filtro-status')?.value||'ATIVO';
  const trajeto=document.getElementById('vchr-filtro-trajeto')?.value||'';
  const depto=document.getElementById('vchr-filtro-depto')?.value||'';
  let lista=status==='TODOS'?VCHR_COLABORADORES:VCHR_COLABORADORES.filter(c=>c.status===status);
  if(busca)lista=lista.filter(c=>[c.nome,c.matricula,c.cpf,c.unidade].some(f=>(f||'').toLowerCase().includes(busca)));
  if(trajeto)lista=lista.filter(c=>(c.trajeto||vchrDefinirTrajeto(c.hora_entrada,c.hora_saida))===trajeto);
  if(depto)lista=lista.filter(c=>(c.unidade||'')=== depto);

  cpTheadVchr();
  const tbody=document.getElementById('vchr-tbody-controle');
  const count=document.getElementById('vchr-controle-count');
  if(!tbody)return;
  const ativas=_cpAtivas['vchr']||new Set(VCHR_COLUNAS.filter(c=>c.default).map(c=>c.id));
  const cols=VCHR_COLUNAS.filter(c=>ativas.has(c.id)).map(c=>c.id);
  const ncols=cols.length||1;

  if(!lista.length){tbody.innerHTML=`<tr><td colspan="${ncols}"><div class="empty-state"><div style="font-size:32px;margin-bottom:10px">🎟️</div>Nenhum colaborador encontrado</div></td></tr>`;if(count)count.textContent='';return;}
  if(count)count.textContent=`${lista.length} colaborador(es)`;
  tbody.innerHTML=lista.map(c=>{
    const traj=c.trajeto||vchrDefinirTrajeto(c.hora_entrada,c.hora_saida)||'—';
    const dataInc=c.data_inclusao?new Date(c.data_inclusao+'T00:00').toLocaleDateString('pt-BR'):'—';
    const acoes=`<td class="actions-cell"><button class="btn btn-ghost btn-sm" onclick='vchrAbrirModalColab(${JSON.stringify(c)})'>Editar</button>${c.status==='ATIVO'?`<button class="btn btn-warning btn-sm" onclick="vchrAbrirInativar('${c.matricula}','${(c.nome||'').replace(/'/g,"\\'")}')">Inativar</button>`:`<button class="btn btn-success btn-sm" onclick="vchrReativar('${c.matricula}')">Reativar</button>`}</td>`;
    const cellMap={
      status:     `<td>${c.status==='ATIVO'?'<span class="vchr-pill-ativo">ATIVO</span>':'<span class="vchr-pill-inativo">INATIVO</span>'}</td>`,
      matricula:  `<td><strong>${c.matricula||'—'}</strong></td>`,
      nome:       `<td>${c.nome||'—'}</td>`,
      unidade:    `<td style="max-width:140px;overflow:hidden;text-overflow:ellipsis">${c.unidade||'—'}</td>`,
      horario:    `<td>${[c.hora_entrada,c.hora_saida].filter(Boolean).join(' AS ')||'—'}</td>`,
      trajeto:    `<td><span class="vchr-pill-muted">${traj}</span></td>`,
      cod_voucher:`<td>${c.cod_voucher||'—'}</td>`,
      aplicativo: `<td>${c.aplicativo||'—'}</td>`,
      dt_inclusao:`<td>${dataInc}</td>`,
      acoes,
    };
    return`<tr>${cols.map(id=>cellMap[id]||'<td>—</td>').join('')}</tr>`;
  }).join('');
}

function vchrAbrirModalColab(c) {
  // Carrega deptos se ainda não carregou
  if (!VCHR_DEPTOS.length) vchrCarregarDeptos();
  document.getElementById('vchr-mc-title').textContent = c ? 'Editar Colaborador' : 'Adicionar Colaborador';
  document.getElementById('vchr-mc-id').value        = c?.id||'';
  document.getElementById('vchr-mc-matricula').value = c?.matricula||'';
  document.getElementById('vchr-mc-nome').value      = c?.nome||'';
  document.getElementById('vchr-mc-cpf').value       = c?.cpf||'';
  document.getElementById('vchr-mc-celular').value   = c?.celular||'';
  document.getElementById('vchr-mc-entrada').value   = c?.hora_entrada||'';
  document.getElementById('vchr-mc-saida').value     = c?.hora_saida||'';
  document.getElementById('vchr-mc-trajeto').value   = c?.trajeto||'';
  document.getElementById('vchr-mc-codvoucher').value= c?.cod_voucher||'';
  document.getElementById('vchr-mc-valor').value     = c?.valor||'100,00';
  document.getElementById('vchr-mc-app').value       = c?.aplicativo||'UBER/99';
  document.getElementById('vchr-mc-beneficio').value = c?.beneficio_original||'';
  // Seleciona departamento ao editar
  if (c?.unidade) {
    setTimeout(() => {
      const sel = document.getElementById('vchr-mc-depto');
      if (sel) sel.value = c.unidade;
    }, 80);
  } else {
    const sel = document.getElementById('vchr-mc-depto');
    if (sel) sel.value = '';
  }
  abrirModal('vchr-modal-colab');
}

async function vchrSalvarColab() {
  const btn = document.getElementById('vchr-btn-salvar-colab');
  const g = id => document.getElementById('vchr-mc-'+id)?.value.trim()||'';
  const unidade = document.getElementById('vchr-mc-depto')?.value || '';
  const colab = {
    id: g('id')||undefined,
    matricula: g('matricula'), nome: g('nome'), unidade: unidade,
    cpf: g('cpf'), celular: g('celular'),
    hora_entrada: g('entrada'), hora_saida: g('saida'),
    horario_full: [g('entrada'),g('saida')].filter(Boolean).join(' AS '),
    trajeto: document.getElementById('vchr-mc-trajeto').value||null,
    cod_voucher: g('codvoucher'), valor: g('valor')||'100,00',
    aplicativo: document.getElementById('vchr-mc-app').value,
    beneficio_original: g('beneficio')
  };
  if(!colab.matricula||!colab.nome){showToast('Matrícula e nome são obrigatórios.','error');return;}
  btn.disabled=true; btn.textContent='Salvando…';
  try {
    await rpc('wc_voucher_adicionar',{p_colab:colab});
    fecharModal('vchr-modal-colab');
    await vchrAtualizarDados(); vchrRenderControle();
    showToast('Colaborador salvo!','success');
  } catch(e) { showToast(e.message,'error'); }
  finally { btn.disabled=false; btn.textContent='Salvar'; }
}

function vchrBuscarParaInativar() {
  const busca = (document.getElementById('vchr-busca-inat').value||'').toLowerCase();
  const el    = document.getElementById('vchr-inat-resultados');
  // Lista todos ativos (já filtrados pelo banco por depto do Onsite)
  let lista = VCHR_COLABORADORES.filter(c => c.status === 'ATIVO');
  // Aplica busca se digitou algo
  if (busca.length >= 1) {
    lista = lista.filter(c => [c.nome,c.matricula].some(f=>(f||'').toLowerCase().includes(busca)));
  }
  if (!lista.length) {
    el.innerHTML = '<p style="color:var(--muted);font-size:13px;margin-top:12px">Nenhum colaborador ativo encontrado.</p>';
    return;
  }
  el.innerHTML = lista.map(c => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 18px;margin-bottom:8px;display:flex;align-items:center;gap:14px">
      <div style="flex:1">
        <strong>${c.nome}</strong>
        <span style="color:var(--muted);font-size:12px;margin-left:8px">${c.matricula}</span><br/>
        <span style="color:var(--muted);font-size:11.5px">${c.unidade||'—'} · ${[c.hora_entrada,c.hora_saida].filter(Boolean).join(' → ')||'—'}</span>
      </div>
      <button class="btn btn-warning btn-sm" onclick="vchrAbrirInativar('${c.matricula}','${(c.nome||'').replace(/'/g,"\\'")}')">Inativar</button>
    </div>`).join('');
}

function vchrAbrirInativar(matricula, nome) {
  VCHR_INATIVAR_MATRICULA = matricula;
  document.getElementById('vchr-inativar-nome').textContent = nome + ' · ' + matricula;
  document.getElementById('vchr-motivo-select').value = '';
  document.getElementById('vchr-motivo-obs').value = '';
  // Preenche data de hoje como padrão
  const hoje = new Date().toISOString().split('T')[0];
  document.getElementById('vchr-data-deslig').value = hoje;
  abrirModal('vchr-modal-inativar');
}

async function vchrConfirmarInativar() {
  const motivo   = document.getElementById('vchr-motivo-select').value;
  const obs      = document.getElementById('vchr-motivo-obs').value.trim();
  const dataDesl = document.getElementById('vchr-data-deslig').value;
  if (!motivo)   { showToast('Selecione o motivo.','error'); return; }
  if (!dataDesl) { showToast('Informe a data de desligamento.','error'); return; }
  // Formata data para o histórico
  const [a,m,d] = dataDesl.split('-');
  const dataFmt = d+'/'+m+'/'+a;
  const motivoCompleto = motivo + (obs ? ' — ' + obs : '') + ' | Desligamento em: ' + dataFmt;
  try {
    await rpc('wc_voucher_inativar', {p_matricula: VCHR_INATIVAR_MATRICULA, p_motivo: motivoCompleto, p_obs: obs});
    fecharModal('vchr-modal-inativar');
    await vchrAtualizarDados();
    vchrRenderControle();
    vchrBuscarParaInativar();
    showToast(VCHR_INATIVAR_MATRICULA + ' inativado.', 'success');
  } catch(e) { showToast(e.message,'error'); }
}

async function vchrReativar(matricula) {
  if(!confirm('Reativar '+matricula+'?'))return;
  try{await rpc('wc_voucher_reativar',{p_matricula:matricula});await vchrAtualizarDados();vchrRenderControle();showToast('Reativado!','success');}
  catch(e){showToast(e.message,'error');}
}

let VCHR_EXPORT_ROWS=[];
function _vchrPH(h){const m=String(h).match(/(\d{2}:\d{2})\s+AS\s+(\d{2}:\d{2})/i);if(!m)return{entrada:null,saida:null};return{entrada:m[1],saida:m[2]};}
function _vchrFD(dt){return String(dt.getDate()).padStart(2,'0')+'/'+String(dt.getMonth()+1).padStart(2,'0')+'/'+dt.getFullYear();}
function _vchrFH(dt){return String(dt.getHours()).padStart(2,'0')+':'+String(dt.getMinutes()).padStart(2,'0');}
function _vchrCD(horario, dataBase, dataVenc) {
  const {entrada, saida} = _vchrPH(horario);
  const vazio = {dII:'',hII:'',dFI:'',hFI:''};
  if (!entrada || !saida || !dataBase) return vazio;

  const [hE, mE] = entrada.split(':').map(Number);
  const [hS, mS] = saida.split(':').map(Number);
  const [ano, mes, dia] = dataBase.split('-').map(Number);

  // Início: se hora inicial <= 05:00, considera dia seguinte à data base (madrugada)
  const diaInicio = (hE <= 5) ? dia + 1 : dia;
  const dtInicio  = new Date(ano, mes - 1, diaInicio, hE, mE, 0);

  // Fim: sempre na data de vencimento informada + hora final cadastrada
  // Se não informar vencimento, usa o mesmo dia do início + 1 (dia seguinte)
  let dtFim;
  if (dataVenc) {
    const [av, mv, dv] = dataVenc.split('-').map(Number);
    dtFim = new Date(av, mv - 1, dv, hS, mS, 0);
  } else {
    dtFim = new Date(ano, mes - 1, diaInicio + 1, hS, mS, 0);
  }

  return {
    dII: _vchrFD(dtInicio), hII: _vchrFH(dtInicio),
    dFI: _vchrFD(dtFim),    hFI: _vchrFH(dtFim),
  };
}
function vchrGerarExportacao() {
  const dataBase = document.getElementById('vchr-exp-data-base').value;
  const dataVenc = document.getElementById('vchr-exp-data-venc').value || null;
  if (!dataBase) { showToast('Selecione a Data Base.','error'); return; }
  VCHR_EXPORT_ROWS = []; let semV = 0;
  VCHR_COLABORADORES.filter(c => c.status === 'ATIVO').forEach(c => {
    const h = c.horario_full || [c.hora_entrada, c.hora_saida].filter(Boolean).join(' AS ');
    const t = c.trajeto || vchrDefinirTrajeto(c.hora_entrada, c.hora_saida);
    if (!t) { semV++; return; }
    const d = _vchrCD(h, dataBase, dataVenc);
    VCHR_EXPORT_ROWS.push({
      'TRAJETO':       t,
      'UNIDADE':       c.unidade    || '',
      'MATRICULA':     c.matricula  || '',
      'NOME COMPLETO': c.nome       || '',
      'CELULAR':       c.celular    || '',
      'CPF':           c.cpf        || '',
      'DATA INICIO':   d.dII,
      'HORA INICIO':   d.hII,
      'DATA FIM':      d.dFI,
      'HORA FIM':      d.hFI,
      'VOUCHER':       '',
      'VALOR':         c.valor      || '100,00',
      'MOTIVO':        'ESCALA DE TRABALHO',
      'APLICATIVO':    c.aplicativo || 'UBER/99',
    });
  });
  const cols = Object.keys(VCHR_EXPORT_ROWS[0] || {});
  document.getElementById('vchr-exp-head').innerHTML = `<tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr>`;
  document.getElementById('vchr-exp-body').innerHTML = VCHR_EXPORT_ROWS.slice(0,20).map(r=>`<tr>${cols.map(c=>`<td>${r[c]||'—'}</td>`).join('')}</tr>`).join('');
  document.getElementById('vchr-export-preview').style.display = 'block';
  document.getElementById('vchr-exp-info').textContent = `${VCHR_EXPORT_ROWS.length} colaborador(es)${semV ? ` · ${semV} sem trajeto (ignorados)` : ''}`;
  document.getElementById('vchr-btn-baixar-xlsx').style.display = 'inline-flex';
}

function vchrBaixarExcel() {
  if(!VCHR_EXPORT_ROWS.length){showToast('Gere a prévia primeiro.','error');return;}
  if(typeof XLSX==='undefined'){showToast('XLSX não carregado.','error');return;}
  const wb=XLSX.utils.book_new(),ws=XLSX.utils.json_to_sheet(VCHR_EXPORT_ROWS);
  ws['!cols']=Object.keys(VCHR_EXPORT_ROWS[0]).map(()=>({wch:18}));
  XLSX.utils.book_append_sheet(wb,ws,'Vouchers');
  XLSX.writeFile(wb,`vouchers_${document.getElementById('vchr-exp-data-base').value}.xlsx`);
}

let VCHR_HIST_PAG = 0; // página atual (0-based)
const VCHR_HIST_POR_PAG = 20;

function vchrRenderHistorico() {
  const busca = (document.getElementById('vchr-busca-hist')?.value||'').toLowerCase();
  let lista = [...VCHR_HISTORICO];
  if (busca) lista = lista.filter(h=>[h.matricula,h.tipo,h.motivo,h.responsavel].some(f=>(f||'').toLowerCase().includes(busca)));
  const el = document.getElementById('vchr-hist-lista'); if(!el) return;
  if (!lista.length) { el.innerHTML='<div class="empty-state"><div style="font-size:32px;margin-bottom:10px">📋</div>Nenhum registro</div>'; return; }

  const totalPags = Math.ceil(lista.length / VCHR_HIST_POR_PAG);
  if (VCHR_HIST_PAG >= totalPags) VCHR_HIST_PAG = totalPags - 1;
  const inicio = VCHR_HIST_PAG * VCHR_HIST_POR_PAG;
  const pagina = lista.slice(inicio, inicio + VCHR_HIST_POR_PAG);

  const ico = {'INATIVAÇÃO':'⊘','REATIVAÇÃO':'✅','CADASTRO':'➕','EDIÇÃO':'✏️','EXCLUSÃO':'🗑️','CADASTRO/EDIÇÃO':'✏️'};
  const isMaster = session?.perfil === 'master';
  const itens = pagina.map(h => {
    const dt = h.created_at ? new Date(h.created_at) : null;
    const dataHora = dt ? dt.toLocaleDateString('pt-BR') + ' às ' + dt.toLocaleTimeString('pt-BR', {hour:'2-digit',minute:'2-digit'}) : '—';
    const corTipo = h.tipo==='INATIVAÇÃO' ? 'color:var(--danger)' : h.tipo==='REATIVAÇÃO' ? 'color:var(--success)' : 'color:var(--muted)';
    const nomeLabel = h.nome_colaborador ? `${h.nome_colaborador} (${h.matricula||'—'})` : (h.matricula||'—');
    return `<div class="vchr-hist-row">
      <div class="vchr-hist-ico">${ico[h.tipo]||'📌'}</div>
      <div class="vchr-hist-main" style="flex:1">
        <div class="vchr-hist-tipo" style="${corTipo}"><strong>${h.tipo||'—'}</strong> — ${nomeLabel}</div>
        <div style="font-size:12.5px;margin-top:2px">${h.motivo||'—'}</div>
        <div class="vchr-hist-sub" style="margin-top:3px">👤 <strong>${h.responsavel||'—'}</strong> &nbsp;·&nbsp; 🕐 ${dataHora}</div>
      </div>
      ${isMaster ? `<button onclick="vchrExcluirHistorico(${h.id})" title="Excluir registro" style="background:none;border:none;cursor:pointer;color:var(--muted);font-size:14px;padding:4px 6px;border-radius:6px;flex-shrink:0" onmouseover="this.style.color='var(--danger)'" onmouseout="this.style.color='var(--muted)'">🗑</button>` : ''}
    </div>`;
  }).join('');

  // Paginação
  let pags = '';
  if (totalPags > 1) {
    const btns = Array.from({length: totalPags}, (_,i) =>
      `<button onclick="VCHR_HIST_PAG=${i};vchrRenderHistorico()"
        style="padding:4px 10px;border-radius:6px;border:1px solid var(--border);
        background:${i===VCHR_HIST_PAG?'var(--accent)':'var(--surface2)'};
        color:${i===VCHR_HIST_PAG?'var(--brand)':'var(--muted)'};
        cursor:pointer;font-size:12px;font-family:var(--font)">${i+1}</button>`
    ).join('');
    pags = `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px;align-items:center">
      <span style="font-size:12px;color:var(--muted)">${lista.length} registro(s) · página ${VCHR_HIST_PAG+1} de ${totalPags}</span>
      <div style="display:flex;gap:4px;flex-wrap:wrap;margin-left:8px">${btns}</div>
    </div>`;
  }

  el.innerHTML = itens + pags;
}

// ── Carregar departamentos no select do modal ──
let VCHR_DEPTOS = [];
async function vchrCarregarDeptos() {
  try {
    const r = await rpc('wc_listar_deptos', {});
    VCHR_DEPTOS = r.deptos || [];
    const sel = document.getElementById('vchr-mc-depto');
    const filtro = document.getElementById('vchr-filtro-depto');
    const opts = '<option value="">— Selecione o departamento —</option>' +
      VCHR_DEPTOS.map(d => `<option value="${d.descricao}" data-id="${d.id}">${d.descricao}</option>`).join('');
    if (sel) sel.innerHTML = opts;
    if (filtro) filtro.innerHTML = '<option value="">Todos os departamentos</option>' +
      VCHR_DEPTOS.map(d => `<option value="${d.descricao}">${d.descricao}</option>`).join('');
  } catch(e) {
    const sel = document.getElementById('vchr-mc-depto');
    if (sel) sel.innerHTML = '<option value="">Erro ao carregar departamentos</option>';
  }
}

// Converte hora do Excel (decimal ou texto) para HH:MM
function vchrParseHora(v) {
  if (!v && v !== 0) return '';
  // Número decimal (formato interno do Excel): ex: 0.916... = 22:00
  if (typeof v === 'number') {
    const totalMin = Math.round(v * 24 * 60);
    const h = Math.floor(totalMin / 60) % 24;
    const m = totalMin % 60;
    return String(h).padStart(2,'0') + ':' + String(m).padStart(2,'0');
  }
  // Texto: aceita "22:00", "22:00:00", "22h00", "2200"
  const s = String(v).trim();
  const m1 = s.match(/^(\d{1,2}):(\d{2})/);
  if (m1) return m1[1].padStart(2,'0') + ':' + m1[2];
  const m2 = s.match(/^(\d{1,2})h(\d{2})/i);
  if (m2) return m2[1].padStart(2,'0') + ':' + m2[2];
  const m3 = s.match(/^(\d{2})(\d{2})$/);
  if (m3) return m3[1] + ':' + m3[2];
  return s;
}

// ── Ordenação de colunas ──
let VCHR_SORT = { col: 'nome', dir: 1 };
function vchrOrdenar(col) {
  if (VCHR_SORT.col === col) VCHR_SORT.dir *= -1;
  else { VCHR_SORT.col = col; VCHR_SORT.dir = 1; }
  document.querySelectorAll('.sort-ico').forEach(el => el.textContent = el.dataset.col === col ? (VCHR_SORT.dir === 1 ? '↑' : '↓') : '⇅');
  vchrRenderControle();
}

// ── vchrRenderControle: com ordenação e filtro depto ──
const _vchrOrigRenderControle = vchrRenderControle;
vchrRenderControle = function() {
  const busca   = (document.getElementById('vchr-busca-colab')?.value||'').toLowerCase();
  const status  = document.getElementById('vchr-filtro-status')?.value||'ATIVO';
  const trajeto = document.getElementById('vchr-filtro-trajeto')?.value||'';
  const depto   = document.getElementById('vchr-filtro-depto')?.value||'';
  let lista = status==='TODOS' ? VCHR_COLABORADORES : VCHR_COLABORADORES.filter(c=>c.status===status);
  if(busca)  lista = lista.filter(c=>[c.nome,c.matricula,c.cpf,c.unidade].some(f=>(f||'').toLowerCase().includes(busca)));
  if(trajeto)lista = lista.filter(c=>(c.trajeto||vchrDefinirTrajeto(c.hora_entrada,c.hora_saida))===trajeto);
  if(depto)  lista = lista.filter(c=>(c.unidade||'')===depto);
  // Ordenação
  const col = VCHR_SORT.col, dir = VCHR_SORT.dir;
  lista.sort((a,b)=>{
    const va = (a[col]||'').toString().toLowerCase();
    const vb = (b[col]||'').toString().toLowerCase();
    return va < vb ? -dir : va > vb ? dir : 0;
  });
  const tbody = document.getElementById('vchr-tbody-controle');
  const count = document.getElementById('vchr-controle-count');
  if(!tbody) return;
  if(!lista.length){
    tbody.innerHTML='<tr><td colspan="10"><div class="empty-state"><div style="font-size:32px;margin-bottom:10px">🎟️</div>Nenhum colaborador encontrado</div></td></tr>';
    if(count) count.textContent=''; return;
  }
  if(count) count.textContent=`${lista.length} colaborador(es)`;
  tbody.innerHTML = lista.map(c=>{
    const traj = c.trajeto||vchrDefinirTrajeto(c.hora_entrada,c.hora_saida)||'—';
    const dataInc = c.data_inclusao ? new Date(c.data_inclusao+'T00:00').toLocaleDateString('pt-BR') : '—';
    const horario = [c.hora_entrada,c.hora_saida].filter(Boolean).join(' → ')||'—';
    return `<tr>
      <td>${c.status==='ATIVO'?'<span class="vchr-pill-ativo">ATIVO</span>':'<span class="vchr-pill-inativo">INATIVO</span>'}</td>
      <td><strong>${c.matricula||'—'}</strong></td>
      <td>${c.nome||'—'}</td>
      <td style="max-width:140px;overflow:hidden;text-overflow:ellipsis" title="${c.unidade||''}">${c.unidade||'—'}</td>
      <td>${horario}</td>
      <td><span class="vchr-pill-muted">${traj}</span></td>
      <td>${c.cod_voucher||'—'}</td>
      <td>${c.aplicativo||'—'}</td>
      <td>${dataInc}</td>
      <td class="actions-cell">
        <button class="btn btn-ghost btn-sm" onclick='vchrAbrirModalColab(${JSON.stringify(c)})'>Editar</button>
        ${c.status==='ATIVO'
          ? `<button class="btn btn-warning btn-sm" onclick="vchrAbrirInativar('${c.matricula}','${(c.nome||'').replace(/'/g,"\'")}')">Inativar</button>`
          : `<button class="btn btn-success btn-sm" onclick="vchrReativar('${c.matricula}')">Reativar</button>`
        }
        <button class="btn btn-danger btn-sm" onclick="vchrExcluir('${c.matricula}','${(c.nome||'').replace(/'/g,"\'")}')">Excluir</button>
      </td>
    </tr>`;
  }).join('');
};

// ── Importação de planilha ──
let VCHR_IMPORT_ROWS = [];

function vchrAbrirImportar() {
  VCHR_IMPORT_ROWS = [];
  document.getElementById('vchr-import-nome').textContent = '';
  document.getElementById('vchr-import-preview-wrap').style.display = 'none';
  document.getElementById('vchr-import-log').textContent = '';
  document.getElementById('vchr-btn-confirmar-import').style.display = 'none';
  document.getElementById('vchr-import-file').value = '';
  abrirModal('vchr-modal-importar');
}

function vchrBaixarModeloImport() {
  if(typeof XLSX==='undefined'){showToast('XLSX não carregado.','error');return;}
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([
    ['MATRICULA','NOME COMPLETO','UNIDADE','CPF','CELULAR','HORA INICIAL','HORA FINAL','TRAJETO','VALOR','APLICATIVO','BENEFICIO ORIGINAL'],
    ['WE000000','NOME DO COLABORADOR','LM Hub_SP_Campinas','000.000.000-00','11999999999','22:00','02:00','IDA','100,00','UBER/99','VT + VOUCHER'],
  ]);
  ws['!cols'] = Array(11).fill({wch:22});
  XLSX.utils.book_append_sheet(wb,ws,'Modelo');
  XLSX.writeFile(wb,'modelo_importacao_voucher.xlsx');
}

function vchrCarregarImport(input) {
  const file = input.files[0]; if(!file) return;
  document.getElementById('vchr-import-nome').textContent = file.name;
  document.getElementById('vchr-import-log').textContent = 'Lendo planilha…';

  const processar = rows => {
    if(!rows.length){document.getElementById('vchr-import-log').textContent='Planilha vazia.';return;}
    const header = rows[0].map(h=>(h||'').toString().trim().toUpperCase());
    const MAP = {
      'MATRICULA':'matricula','MATRÍCULA':'matricula',
      'NOME COMPLETO':'nome','NOME':'nome',
      'UNIDADE':'unidade','DEPARTAMENTO':'unidade',
      'CPF':'cpf','CELULAR':'celular','TELEFONE':'celular',
      'HORA INICIAL':'hora_entrada','HORA ENTRADA':'hora_entrada','HORA INICIAL (VOUCHER)':'hora_entrada',
      'HORA FINAL':'hora_saida','HORA SAÍDA':'hora_saida','HORA FINAL (VOUCHER)':'hora_saida',
      'TRAJETO':'trajeto','VALOR':'valor',
      'APLICATIVO':'aplicativo','BENEFICIO ORIGINAL':'beneficio_original','BENEFÍCIO ORIGINAL':'beneficio_original',
    };
    VCHR_IMPORT_ROWS = [];
    const erros = [];
    rows.slice(1).forEach((row,i) => {
      if(row.every(v=>!v)) return;
      const obj = {};
      header.forEach((h,j) => { if(MAP[h]) obj[MAP[h]] = row[j]; });
      if(!obj.matricula){erros.push(`Linha ${i+2}: matrícula ausente`);return;}
      if(!obj.nome){erros.push(`Linha ${i+2}: nome ausente`);return;}
      // Normalizar campos de texto
      obj.matricula = String(obj.matricula||'').trim().toUpperCase();
      obj.nome      = String(obj.nome||'').trim().toUpperCase();
      // Converter horas (podem vir como decimal do Excel)
      if (obj.hora_entrada !== undefined) obj.hora_entrada = vchrParseHora(obj.hora_entrada);
      if (obj.hora_saida   !== undefined) obj.hora_saida   = vchrParseHora(obj.hora_saida);
      if (obj.hora_entrada && obj.hora_saida)
        obj.horario_full = obj.hora_entrada + ' AS ' + obj.hora_saida;
      obj.status = 'ATIVO';
      obj.aplicativo = obj.aplicativo || 'UBER/99';
      obj.valor = obj.valor || '100,00';
      VCHR_IMPORT_ROWS.push(obj);
    });
    // Preview
    const wrap = document.getElementById('vchr-import-preview-wrap');
    const tbl  = document.getElementById('vchr-import-preview-table');
    const cols = ['matricula','nome','unidade','hora_entrada','hora_saida','trajeto','valor'];
    tbl.innerHTML = `<thead><tr>${cols.map(c=>`<th>${c}</th>`).join('')}</tr></thead>
      <tbody>${VCHR_IMPORT_ROWS.slice(0,15).map(r=>`<tr>${cols.map(c=>`<td>${r[c]||'—'}</td>`).join('')}</tr>`).join('')}</tbody>`;
    wrap.style.display = 'block';
    document.getElementById('vchr-import-count').textContent = `${VCHR_IMPORT_ROWS.length} colaborador(es) encontrado(s)${erros.length?` · ${erros.length} linha(s) ignorada(s)`:''}`;
    document.getElementById('vchr-import-log').textContent = erros.join('\n');
    document.getElementById('vchr-btn-confirmar-import').style.display = VCHR_IMPORT_ROWS.length ? 'flex' : 'none';
  };

  const reader = new FileReader();
  reader.onerror = () => { document.getElementById('vchr-import-log').textContent = 'Erro ao ler o arquivo.'; };
  if(file.name.toLowerCase().endsWith('.csv')) {
    reader.onload = e => {
      const rows = e.target.result.split(/\r?\n/).filter(l=>l.trim()).map(l=>l.split(',').map(v=>v.replace(/^"|"$/g,'').trim()));
      processar(rows);
    };
    reader.readAsText(file,'UTF-8');
  } else {
    reader.onload = e => {
      const wb = XLSX.read(new Uint8Array(e.target.result),{type:'array'});
      const ws = wb.Sheets[wb.SheetNames[0]];
      processar(XLSX.utils.sheet_to_json(ws,{header:1,defval:null}));
    };
    reader.readAsArrayBuffer(file);
  }
}

async function vchrConfirmarImport() {
  if(!VCHR_IMPORT_ROWS.length) return;
  const btn = document.getElementById('vchr-btn-confirmar-import');
  const log = document.getElementById('vchr-import-log');
  btn.disabled = true; btn.textContent = 'Importando…';
  log.textContent = '';
  let ok=0, err=0;
  for(const colab of VCHR_IMPORT_ROWS) {
    try {
      await rpc('wc_voucher_adicionar',{p_colab:colab}); ok++;
    } catch(e) { err++; log.textContent += `✗ ${colab.matricula}: ${e.message}\n`; }
    log.textContent = `✓ ${ok} importado(s)${err?` · ✗ ${err} erro(s)`:''} (${ok+err}/${VCHR_IMPORT_ROWS.length})\n` + log.textContent.replace(/^✓.*\n/,'');
    log.scrollTop = 0;
  }
  log.textContent = `══ CONCLUÍDO ══\n✓ ${ok} cadastrado(s)/atualizado(s)${err?`\n✗ ${err} erro(s)`:''}\n(colaboradores já existentes foram atualizados automaticamente)\n\n` + log.textContent;
  await vchrAtualizarDados(); vchrRenderControle();
  btn.disabled=false; btn.textContent='✅ Importação concluída';
  showToast(`${ok} importado(s)/atualizado(s)${err?`, ${err} erros`:''}`, err?'info':'success');
}

// ── Excluir colaborador ──
async function vchrExcluir(matricula, nome) {
  if (!confirm(`Excluir ${nome} (${matricula}) do sistema de voucher?\n\nEsta ação não pode ser desfeita.`)) return;
  try {
    const r = await rpc('wc_voucher_excluir', { p_matricula: matricula, p_forcar: false });
    if (r.temHistorico) {
      // Tem histórico — pede confirmação extra
      if (!confirm(`${nome} possui ${r.qtdHistorico} registro(s) no histórico.\nDeseja excluir mesmo assim?`)) return;
      await rpc('wc_voucher_excluir', { p_matricula: matricula, p_forcar: true });
    }
    await vchrAtualizarDados();
    vchrRenderControle();
    showToast(`${nome} excluído do sistema.`, 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

async function vchrExcluirHistorico(id) {
  if (!confirm('Excluir este registro do histórico? Esta ação não pode ser desfeita.')) return;
  try {
    await rpc('wc_voucher_excluir_historico', { p_id: id });
    // Remove da lista local sem precisar recarregar tudo
    VCHR_HISTORICO = VCHR_HISTORICO.filter(h => h.id !== id);
    vchrRenderHistorico();
    showToast('Registro excluído.', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

// ═══════════════ FIM VOUCHER INTEGRADO ═══════════════

