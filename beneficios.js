// ════════════════════════════════════════════════════════════
//  INTEGRAÇÃO — Gestão de Benefícios (lista tabular)
// ════════════════════════════════════════════════════════════
let INTEG_LOTE       = [];
let INTEG_COLMEIAS   = [];   // todas as colmeias do banco
let INTEG_TODOS_COLABS = []; // todos os colabs da data selecionada (flat)

// ── Navegar para página ──
const _origNavTo2 = window.navTo;
window.navTo = function(id) {
  if (id === 'integracao') {
    // Limpar estado de outras páginas antes de ativar
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('nav a, .nav-suporte-item').forEach(a => a.classList.remove('active'));
    const pg = document.getElementById('page-integracao');
    if (pg) pg.classList.add('active');
    document.querySelector('[data-page="integracao"]')?.classList.add('active');
    // Só recarrega do banco se ainda não tiver dados (evita race condition com autoload)
    if (INTEG_COLMEIAS.length) {
      if (!window._integDataAtiva) {
        const datas = integGetDatasOrdenadas();
        const comPend = datas.find(d => {
          const cols = INTEG_COLMEIAS.filter(c => c.data_admissao === d);
          return cols.some(c => Number(c.pendentes) > 0);
        });
        window._integDataAtiva = comPend || datas[0];
        const picker = document.getElementById('integ-date-picker');
        if (picker) picker.value = integParaISO(window._integDataAtiva);
      }
      integRenderPills();
      integCarregarData(window._integDataAtiva);
    } else {
      integCarregarColmeias();
    }
    return;
  }
  _origNavTo2(id);
};

// ── Baixar modelo de planilha ──
function integBaixarModelo() {
  const cabecalho = [
    'Código', 'Nome do Funcionário', 'Cargo ou Função', 'Data de Admissão', 'Data Demissão',
    'Vínculo', 'Depto/Centro de Custo', 'Departamento', 'Razão Social',
    'Descrição do Horário', 'Nome Vale Transporte', 'Nome Vale Refeição', 'Nome Beneficios Outros',
  ];
  const exemplo = [
    'WE123456', 'JOÃO DA SILVA SANTOS', 'AUXILIAR DE LOGISTICA', '29/06/2026', '',
    'CLT', 'HUB-LSP-105', 'HUB-LSP-105', 'WE CAN BR',
    'SEG A SAB 06:00 ÀS 14:20', '6758-VR SHOPEE TEMPORARIOS', '', '7006-AUXILIO MOBILIDADE SHOPEE (TEMP)',
  ];

  const ws = XLSX.utils.aoa_to_sheet([cabecalho, exemplo]);
  ws['!cols'] = cabecalho.map(c => ({ wch: Math.max(c.length + 2, 18) }));

  const wsRef = XLSX.utils.aoa_to_sheet([
    ['Coluna', 'Obrigatório', 'Observação'],
    ['Nome do Funcionário', 'Sim', 'Nome completo do colaborador'],
    ['Data de Admissão', 'Sim', 'Formato DD/MM/AAAA — usada para agrupar o lote'],
    ['Data Demissão', 'Não', 'Se preenchida, o colaborador é ignorado na importação'],
    ['Depto/Centro de Custo', 'Não', 'Código do CC/HUB — usado para agrupar e filtrar por Onsite'],
    ['Departamento', 'Não', 'Nome do departamento (se vazio, usa o código)'],
    ['Razão Social', 'Não', 'Cliente/empresa — exibido no preview'],
    ['Descrição do Horário', 'Não', 'Limitado a 80 caracteres'],
    ['Nome Vale Transporte', 'Não', 'Texto do benefício VT'],
    ['Nome Vale Refeição', 'Não', 'Texto do benefício VR'],
    ['Nome Beneficios Outros', 'Não', 'Mobilidade, fretado, etc.'],
  ]);
  wsRef['!cols'] = [{wch:24},{wch:13},{wch:55}];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Modelo');
  XLSX.utils.book_append_sheet(wb, wsRef, 'Instruções');
  XLSX.writeFile(wb, 'modelo_gestao_beneficios.xlsx');
}

// ── Ler planilha ──
function integLerPlanilha(input) {
  const file = input.files[0]; if(!file) return;
  input.value = '';
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(new Uint8Array(e.target.result), {type:'array', cellDates:true});
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, {header:1, defval:null, raw:false});
      if (!rows.length) { showToast('Planilha vazia.','error'); return; }

      const header = rows[0].map(h => (h||'').toString().trim());
      const idx = name => header.findIndex(h => h.toLowerCase().includes(name.toLowerCase()));

      const iNome    = idx('Nome do Funcionário');
      const iAdmiss  = idx('Data de Admissão');
      const iDepto   = idx('Depto/Centro de Custo');
      const iDeptoNm = idx('Departamento');
      const iRazao   = idx('Razão Social');
      const iCargo   = idx('Cargo ou Função');
      const iHorario = idx('Descrição do Horário');
      const iCodigo  = idx('Código');
      const iVinculo = idx('Vínculo');
      const iMob     = idx('Nome Beneficios Outros');
      const iVR      = idx('Nome Vale Refeição');
      const iVT      = idx('Nome Vale Transporte');
      const iDemiss  = idx('Data Demissão');

      if (iNome < 0 || iAdmiss < 0) { showToast('Planilha fora do padrão esperado.','error'); return; }

      const grupos = {};
      rows.slice(1).forEach(row => {
        const nome   = row[iNome];
        const admiss = row[iAdmiss];
        const demiss = iDemiss >= 0 ? row[iDemiss] : null;
        if (!nome || !admiss) return;
        if (demiss && String(demiss).trim() && String(demiss).trim() !== 'null') return;

        let dataStr = '';
        if (admiss instanceof Date) {
          dataStr = admiss.toISOString().split('T')[0];
        } else {
          const s = String(admiss).trim();
          // dd/mm/aaaa (formato BR)
          let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
          if (m && Number(m[1]) <= 31 && Number(m[2]) <= 12) {
            dataStr = `${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;
          } else {
            // m/d/aaaa ou m/d/aa (formato US — fallback)
            m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
            if (m) {
              const ano = m[3].length === 2 ? '20'+m[3] : m[3];
              dataStr = `${ano}-${m[1].padStart(2,'0')}-${m[2].padStart(2,'0')}`;
            } else {
              // aaaa-mm-dd já no formato certo
              const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
              dataStr = iso ? iso[0] : s;
            }
          }
        }

        const depto_cod  = iDepto  >= 0 ? (row[iDepto]  || '').toString().trim() : '';
        const razao      = iRazao  >= 0 ? (row[iRazao]  || '').toString().trim() : '';
        const depto_nome = iDeptoNm >= 0 ? (row[iDeptoNm]|| '').toString().trim() : depto_cod;
        const key = `${dataStr}||${depto_cod}`;

        if (!grupos[key]) grupos[key] = { data_admissao: dataStr, depto_cod, depto_nome, cli_nome: razao, colaboradores: [] };
        grupos[key].colaboradores.push({
          codigo:        iCodigo  >= 0 ? String(row[iCodigo]||'').trim() : '',
          nome:          String(nome).trim(),
          cargo:         iCargo   >= 0 ? String(row[iCargo]  ||'').trim() : '',
          horario:       iHorario >= 0 ? String(row[iHorario]||'').trim().substring(0,80) : '',
          vinculo:       iVinculo >= 0 ? String(row[iVinculo]||'').trim() : '',
          beneficio_mob: iMob     >= 0 ? String(row[iMob]    ||'').trim() : '',
          beneficio_vr:  iVR      >= 0 ? String(row[iVR]     ||'').trim() : '',
          beneficio_vt:  iVT      >= 0 ? String(row[iVT]     ||'').trim() : '',
        });
      });

      INTEG_LOTE = Object.values(grupos).sort((a,b) => a.data_admissao.localeCompare(b.data_admissao));
      if (!INTEG_LOTE.length) { showToast('Nenhum admitido ativo encontrado.','error'); return; }
      integMostrarPreview();
    } catch(e) { showToast('Erro ao ler planilha: ' + e.message, 'error'); }
  };
  reader.readAsArrayBuffer(file);
}

// Converte qualquer formato de data (ISO, BR, serial Excel, m/d/aa) para DD/MM/AAAA legível
function integFormatarDataBR(data) {
  if (!data) return '—';
  const s = String(data).trim();
  // aaaa-mm-dd
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  // dd/mm/aaaa
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return `${m[1].padStart(2,'0')}/${m[2].padStart(2,'0')}/${m[3]}`;
  // m/d/aa ou m/d/aaaa (formato americano)
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) {
    let ano = m[3].length === 2 ? '20'+m[3] : m[3];
    return `${m[2].padStart(2,'0')}/${m[1].padStart(2,'0')}/${ano}`;
  }
  return s;
}

function integMostrarPreview() {
  const wrap  = document.getElementById('integ-preview-wrap');
  const titulo = document.getElementById('integ-preview-titulo');
  const lista  = document.getElementById('integ-preview-lista');
  const totalCol = INTEG_LOTE.reduce((s,g) => s + g.colaboradores.length, 0);
  titulo.textContent = `${INTEG_LOTE.length} grupo(s) encontrado(s) · ${totalCol} colaborador(es) admitido(s)`;
  lista.innerHTML = INTEG_LOTE.map(g => {
    const dLabel = integFormatarDataBR(g.data_admissao);
    return `<div style="display:flex;align-items:center;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--border);font-size:13px">
      <div>
        <strong>${dLabel}</strong>
        <span style="color:var(--muted);margin-left:8px">${g.cli_nome ? g.cli_nome+' — ' : ''}${g.depto_nome || g.depto_cod || 'Sem depto'}</span>
      </div>
      <span style="color:var(--accent);font-weight:600">${g.colaboradores.length} pessoa(s)</span>
    </div>`;
  }).join('');
  wrap.style.display = 'block';

  // Pré-preencher prazo sugerido: 3 dias corridos a partir de hoje
  const prazoInput = document.getElementById('integ-preview-prazo');
  if (prazoInput && !prazoInput.value) {
    const sugestao = new Date();
    sugestao.setDate(sugestao.getDate() + 3);
    prazoInput.value = sugestao.toISOString().split('T')[0];
  }
}

function integCancelarPreview() {
  INTEG_LOTE = [];
  document.getElementById('integ-preview-wrap').style.display = 'none';
  const prazoInput = document.getElementById('integ-preview-prazo');
  if (prazoInput) prazoInput.value = '';
}

// Normaliza data para o formato que está no banco (DD/MM/YYYY)
function integNormalizarData(data) {
  if (!data) return data;
  if (/^\d{4}-\d{2}-\d{2}$/.test(data)) {
    const [a,m,d] = data.split('-');
    return `${d}/${m}/${a}`;
  }
  return data;
}
function integParaISO(data) {
  if (!data) return '';
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(data)) {
    const [d,m,a] = data.split('/');
    return `${a}-${m}-${d}`;
  }
  return data;
}

// ── Status de prazo: calcula situação de uma colmeia com base no campo prazo ──
// Retorna: { status: 'ok'|'vence_hoje'|'vence_amanha'|'atrasado'|'sem_prazo', dias, cor, ico, label }
function integStatusPrazo(colmeia) {
  if (!colmeia?.prazo) return { status:'sem_prazo', dias:null, cor:'var(--muted)', ico:'—', label:'Sem prazo' };
  const hoje  = new Date(); hoje.setHours(0,0,0,0);
  const prazo = new Date(colmeia.prazo + 'T00:00:00');
  const diffMs = prazo - hoje;
  const dias = Math.round(diffMs / 86400000);

  if (dias < 0)  return { status:'atrasado',     dias, cor:'var(--danger)',  ico:'🔴', label:`Atrasado ${Math.abs(dias)}d` };
  if (dias === 0) return { status:'vence_hoje',   dias, cor:'var(--danger)',  ico:'🔴', label:'Vence hoje' };
  if (dias === 1) return { status:'vence_amanha', dias, cor:'var(--warning)', ico:'🟡', label:'Vence amanhã' };
  if (dias <= 3)  return { status:'proximo',      dias, cor:'var(--warning)', ico:'🟡', label:`Vence em ${dias}d` };
  return { status:'ok', dias, cor:'var(--success)', ico:'🟢', label:`${dias}d restantes` };
}

// Pior status de prazo entre um conjunto de colmeias (ignora as já completas)
function integPiorStatusPrazo(colmeias) {
  const ordem = { atrasado:0, vence_hoje:1, vence_amanha:2, proximo:3, ok:4, sem_prazo:5 };
  let pior = null;
  colmeias.forEach(c => {
    if (Number(c.pendentes) === 0) return; // já resolvida, não conta pro prazo
    const st = integStatusPrazo(c);
    if (!pior || ordem[st.status] < ordem[pior.status]) pior = st;
  });
  return pior;
}

async function integCriarColmeias() {
  const prazo = document.getElementById('integ-preview-prazo')?.value || '';
  if (!prazo) { showToast('Informe o prazo para confirmação.', 'error'); document.getElementById('integ-preview-prazo')?.focus(); return; }
  try {
    const r = await rpc('wc_integ_criar_colmeia', { p_lote: INTEG_LOTE, p_prazo: prazo });
    const msg = `${r.colmeias} grupo(s) criado(s) · ${r.colaboradores} colaborador(es)` +
      (r.puladas > 0 ? ` · ${r.puladas} data(s) fechada(s) preservada(s) 🔒` : '');
    showToast(msg, 'success');
    integCancelarPreview();
    integCarregarColmeias();
  } catch(e) { showToast(e.message, 'error'); }
}

// ── Carregar todas as colmeias ──
async function integCarregarColmeias() {
  try {
    const r = await rpc('wc_integ_listar_colmeias', {});
    INTEG_COLMEIAS = r.colmeias || [];
    integRenderPills();
    // Selecionar data mais recente com pendentes, ou apenas a mais recente
    if (!window._integDataAtiva && INTEG_COLMEIAS.length) {
      const datas = integGetDatasOrdenadas();
      const comPend = datas.find(d => {
        const cols = INTEG_COLMEIAS.filter(c => c.data_admissao === d);
        return cols.some(c => Number(c.pendentes) > 0);
      });
      window._integDataAtiva = comPend || datas[0];
      const picker = document.getElementById('integ-date-picker');
      if (picker) picker.value = integParaISO(window._integDataAtiva);
    }
    integCarregarData(window._integDataAtiva);
  } catch(e) { showToast(e.message, 'error'); }
}

function integGetDatasOrdenadas() {
  const toISO = s => { const p=(s||'').split('/'); return p.length===3?`${p[2]}-${p[1]}-${p[0]}`:s; };
  return [...new Set(INTEG_COLMEIAS.map(c => c.data_admissao))]
    .sort((a,b) => toISO(b).localeCompare(toISO(a)));
}

// ── Filtro por operação do Onsite ──
function integFiltrarPorOnsite(colmeias) {
  if (podeVerTudo()) return colmeias;
  // Se Onsite tem operações configuradas, filtrar
  if (session?.perfil === 'onsite' && session._operacoes?.length) {
    const opsNomes    = new Set(session._operacoes.map(o => (o.nome||'').toUpperCase()));
    // cc_cod pode não vir do banco ainda — usar regional como fallback
    const opsCods     = new Set(session._operacoes.map(o => (o.cc_cod||o.regional||o.codigo||'').toUpperCase()).filter(Boolean));
    const opsRegional = new Set(session._operacoes.map(o => (o.regional||'').toUpperCase()).filter(Boolean));
    return colmeias.filter(c => {
      const cod      = (c.depto_cod || '').toUpperCase();
      const nomeDepto= (c.depto_nome || '').toUpperCase();
      const cli      = (c.cli_nome || '').toUpperCase();
      if (!opsCods.size && !opsNomes.size && !opsRegional.size) return true;
      return opsCods.has(cod) || opsNomes.has(nomeDepto) || opsNomes.has(cli)
          || opsNomes.has(cod) || opsRegional.has(cod) || opsRegional.has(nomeDepto);
    });
  }
  // Onsite sem operações cadastradas ainda → mostra tudo (melhor que tela em branco)
  return colmeias;
}

function integRenderPills() {
  const pills = document.getElementById('integ-date-pills');
  const hist  = document.getElementById('integ-date-hist');
  if (!pills) return;
  const datas = integGetDatasOrdenadas();

  const montarInfo = (data) => {
    const colsDt = integFiltrarPorOnsite(INTEG_COLMEIAS.filter(c => c.data_admissao === data));
    const pend  = colsDt.reduce((s,c)=>s+Number(c.pendentes),0);
    const total = colsDt.reduce((s,c)=>s+Number(c.total),0);
    const pagos = colsDt.reduce((s,c)=>s+Number(c.pagos),0);
    const completo = pend === 0 && total > 0;
    return { pend, total, pagos, completo };
  };

  // Pendentes (ou a data ativa, mesmo que completa) ficam visíveis em cima
  const pendentesOuAtiva = datas.filter(d => {
    const info = montarInfo(d);
    return !info.completo || d === window._integDataAtiva;
  });
  // Completas (exceto a ativa) vão para o histórico
  const completas = datas.filter(d => !pendentesOuAtiva.includes(d));

  if (hist) hist.textContent = completas.length + ' integração(ões) no histórico';

  const renderPill = (data) => {
    const { pend, total, pagos, completo } = montarInfo(data);
    const ativa = data === window._integDataAtiva;
    let label = data;
    if (data.includes('/')) { const p=data.split('/'); label=p[0]+'/'+p[1]; }
    else if (data.includes('-')) { const p=data.split('-'); label=p[2]+'/'+p[1]; }
    const cor = ativa ? 'var(--accent)' : completo ? 'var(--success)' : 'var(--border)';
    const bg  = ativa ? 'var(--accent)' : 'transparent';
    const txt = ativa ? 'var(--brand)'  : completo ? 'var(--success)' : 'var(--text)';

    // Indicador de prazo (só relevante se ainda tem pendência)
    const colsDt = integFiltrarPorOnsite(INTEG_COLMEIAS.filter(c => c.data_admissao === data));
    const statusPrazo = !completo ? integPiorStatusPrazo(colsDt) : null;
    const corBorda = (!ativa && statusPrazo && ['atrasado','vence_hoje'].includes(statusPrazo.status))
      ? 'var(--danger)' : cor;
    const prazoIco = statusPrazo && statusPrazo.status !== 'sem_prazo' && statusPrazo.status !== 'ok' ? statusPrazo.ico : '';

    return `<button onclick="integSelecionarData('${data}')" title="${statusPrazo?.label||''}"
      style="display:flex;flex-direction:column;align-items:center;padding:5px 12px;border-radius:8px;
      border:1.5px solid ${corBorda};background:${bg};color:${txt};cursor:pointer;font-family:var(--font);
      transition:all .15s;min-width:52px;position:relative">
      ${prazoIco?`<span style="position:absolute;top:-6px;right:-4px;font-size:11px">${prazoIco}</span>`:''}
      <span style="font-size:12px;font-weight:700">${label}</span>
      <span style="font-size:10px;opacity:.75;margin-top:1px">${total === 0 ? '—' : pend>0 ? '⏳'+pend : '✅'+pagos+'/'+total}</span>
    </button>`;
  };

  pills.innerHTML = pendentesOuAtiva.length
    ? pendentesOuAtiva.map(renderPill).join('')
    : `<span style="font-size:12px;color:var(--muted);align-self:center">✅ Nenhuma pendência — tudo confirmado</span>`;

  integRenderBannerPrazo(datas);
}

// ── Banner de alerta no topo (atrasados / vencendo hoje) ──
function integRenderBannerPrazo(datas) {
  const banner = document.getElementById('integ-banner-prazo');
  if (!banner) return;

  const alertas = [];
  datas.forEach(data => {
    const colsDt = integFiltrarPorOnsite(INTEG_COLMEIAS.filter(c => c.data_admissao === data));
    const pend = colsDt.reduce((s,c)=>s+Number(c.pendentes),0);
    if (pend === 0) return; // já resolvida
    const st = integPiorStatusPrazo(colsDt);
    if (st && ['atrasado','vence_hoje','vence_amanha'].includes(st.status)) {
      let label = data;
      if (data.includes('/')) { const p=data.split('/'); label=p[0]+'/'+p[1]+'/'+p[2]; }
      alertas.push({ data, label, pend, ...st });
    }
  });

  if (!alertas.length) { banner.style.display = 'none'; return; }

  // Ordenar: atrasados primeiro
  const ordem = { atrasado:0, vence_hoje:1, vence_amanha:2 };
  alertas.sort((a,b) => ordem[a.status] - ordem[b.status]);

  const piorGeral = alertas[0];
  const corBg  = piorGeral.status === 'vence_amanha' ? 'rgba(245,158,11,.1)' : 'rgba(239,68,68,.1)';
  const corBd  = piorGeral.status === 'vence_amanha' ? 'rgba(245,158,11,.4)' : 'rgba(239,68,68,.4)';
  const corTxt = piorGeral.status === 'vence_amanha' ? 'var(--warning)' : 'var(--danger)';

  const itensTxt = alertas.slice(0,3).map(a =>
    `<b>${a.label}</b> (${a.pend} pend.) — ${a.status==='atrasado'?`atrasado ${Math.abs(a.dias)}d`:a.status==='vence_hoje'?'vence hoje':'vence amanhã'}`
  ).join(' · ');

  banner.style.display = 'block';
  banner.innerHTML = `
    <div style="background:${corBg};border:1px solid ${corBd};border-radius:10px;
      padding:12px 18px;margin-bottom:16px;display:flex;align-items:center;gap:12px">
      <span style="font-size:22px">${piorGeral.status==='atrasado'?'🔴':piorGeral.status==='vence_hoje'?'⏰':'🟡'}</span>
      <div style="flex:1">
        <div style="font-weight:700;color:${corTxt};font-size:13px">
          ${alertas.length} lote(s) com prazo ${piorGeral.status==='atrasado'?'atrasado':'vencendo'}
        </div>
        <div style="font-size:11.5px;color:var(--muted);margin-top:2px">${itensTxt}</div>
      </div>
    </div>`;
}

// Modal/dropdown de histórico (datas já completas)
function integAbrirHistorico() {
  const datas = integGetDatasOrdenadas();
  const montarInfo = (data) => {
    const colsDt = integFiltrarPorOnsite(INTEG_COLMEIAS.filter(c => c.data_admissao === data));
    const pend  = colsDt.reduce((s,c)=>s+Number(c.pendentes),0);
    const total = colsDt.reduce((s,c)=>s+Number(c.total),0);
    return { pend, total, completo: pend === 0 && total > 0 };
  };
  const completas = datas.filter(d => montarInfo(d).completo && d !== window._integDataAtiva);

  if (!completas.length) { showToast('Nenhuma data no histórico ainda.', 'info'); return; }

  const lista = completas.map(d => {
    const { total } = montarInfo(d);
    let label = d;
    if (d.includes('/')) { const p=d.split('/'); label=p[0]+'/'+p[1]+'/'+p[2]; }
    return `<div onclick="integSelecionarData('${d}');fecharModal('integ-modal-historico')"
      style="padding:10px 14px;border-bottom:1px solid var(--border);cursor:pointer;display:flex;
      justify-content:space-between;align-items:center" onmouseover="this.style.background='var(--surface2)'" onmouseout="this.style.background=''">
      <span style="font-size:13px;font-weight:600">${label}</span>
      <span style="font-size:11px;color:var(--success);font-weight:700">✅ ${total}/${total}</span>
    </div>`;
  }).join('');

  let modal = document.getElementById('integ-modal-historico');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'integ-modal-historico';
    modal.className = 'modal-backdrop';
    modal.innerHTML = `<div class="modal" style="width:380px">
      <div class="modal-head"><h2>📅 Histórico de Integrações</h2><p>Datas já confirmadas (100%)</p></div>
      <div class="modal-body" style="max-height:400px;overflow-y:auto;padding:0" id="integ-hist-lista"></div>
      <div class="modal-actions"><button class="btn btn-ghost" onclick="fecharModal('integ-modal-historico')">Fechar</button></div>
    </div>`;
    document.body.appendChild(modal);
  }
  document.getElementById('integ-hist-lista').innerHTML = lista;
  abrirModal('integ-modal-historico');
}

function integSelecionarData(data) {
  window._integDataAtiva = integNormalizarData(data);
  const picker = document.getElementById('integ-date-picker');
  if (picker) picker.value = integParaISO(window._integDataAtiva);
  integRenderPills();
  integCarregarData(window._integDataAtiva);
}

// ── Carregar colaboradores de uma data (todos os grupos da data) ──
async function integCarregarData(data) {
  if (!data) { integRenderTabela(); return; }
  const colmeias = integFiltrarPorOnsite(INTEG_COLMEIAS.filter(c => c.data_admissao === data));
  if (!colmeias.length) { INTEG_TODOS_COLABS = []; integRenderKPIs([]); integRenderTabela(); return; }

  try {
    // Carregar todos os colabs de todas as colmeias desta data em paralelo
    const resultados = await Promise.all(colmeias.map(col =>
      rpc('wc_integ_abrir_colmeia', { p_colmeia_id: col.id })
    ));
    INTEG_TODOS_COLABS = [];
    resultados.forEach((r, i) => {
      const col = colmeias[i];
      (r.colaboradores || []).forEach(c => {
        // Extrair cliente/depto para exibição
        // Banco antigo salva "RAZAO — DEPTO"; banco novo tem cli_nome separado
        let clienteLabel = col.cli_nome || '';
        let deptoLabel   = col.depto_nome || col.depto_cod || '';
        if (!clienteLabel && deptoLabel.includes(' — ')) {
          const parts = deptoLabel.split(' — ');
          clienteLabel = parts[0].trim();
          deptoLabel   = parts.slice(1).join(' — ').trim();
        }
        // Se após a separação, deptoLabel ficou vazio ou igual ao cliente → usar código
        if (!deptoLabel || deptoLabel === clienteLabel) {
          deptoLabel = col.depto_cod || col.depto_nome || '';
        }
        INTEG_TODOS_COLABS.push({
          ...c,
          _colmeia_id:     col.id,
          _colmeia_status: col.status,
          _depto_cod:      col.depto_cod,
          _depto_nome:     deptoLabel,
          _cli_nome:       clienteLabel,
        });
      });
    });
    integRenderKPIs(colmeias);
    integRenderTabela();
  } catch(e) { showToast(e.message, 'error'); }
}

// ── KPI cards ──
function integRenderKPIs(colmeias) {
  const kpis = document.getElementById('integ-kpis');
  if (!kpis) return;
  if (!colmeias.length) { kpis.innerHTML = ''; return; }
  const total  = colmeias.reduce((s,c)=>s+Number(c.total),0);
  const pagos  = colmeias.reduce((s,c)=>s+Number(c.pagos),0);
  const noshow = colmeias.reduce((s,c)=>s+Number(c.noshow),0);
  const pend   = colmeias.reduce((s,c)=>s+Number(c.pendentes),0);
  const fechadas = colmeias.filter(c=>c.status==='fechada').length;
  const pct = total > 0 ? Math.round((pagos+noshow)/total*100) : 0;
  kpis.innerHTML = [
    { label:'Total', val:total,   cor:'var(--text)',    ico:'👥' },
    { label:'Pagar', val:pagos,   cor:'var(--success)', ico:'✅' },
    { label:'No Show', val:noshow,cor:'var(--danger)',  ico:'⊘' },
    { label:'Pendentes', val:pend,cor:'var(--warning)', ico:'⏳' },
    { label:'Progresso', val:pct+'%', cor:pct===100?'var(--success)':'var(--accent)', ico:'📊' },
  ].map(k => `
    <div style="background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:12px 18px;min-width:100px;flex:1">
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px">${k.ico} ${k.label}</div>
      <div style="font-size:22px;font-weight:800;color:${k.cor}">${k.val}</div>
    </div>`).join('') +
    (podeAdmin() && fechadas < colmeias.length ? `
    <div style="display:flex;align-items:center;padding:0 4px">
      <button class="btn btn-ghost btn-sm" onclick="integFecharTodosGrupos()" style="white-space:nowrap">
        🔒 Fechar todos
      </button>
    </div>` : '');
}

// ── Tabela de colaboradores ──
function integRenderTabela() {
  cpTheadInteg();
  const tbody  = document.getElementById('integ-tabela-body');
  if (!tbody) return;

  const busca  = (document.getElementById('integ-busca')?.value || '').toLowerCase();
  const filtSt = document.getElementById('integ-filtro-status')?.value || '';

  let lista = [...INTEG_TODOS_COLABS];
  if (busca) lista = lista.filter(c =>
    [c.nome, c.cargo, c._depto_nome, c._cli_nome, c.codigo].some(f => (f||'').toLowerCase().includes(busca))
  );
  if (filtSt === 'pendente') lista = lista.filter(c => !c.presenca);
  else if (filtSt) lista = lista.filter(c => c.presenca === filtSt);

  const ativas = _cpAtivas['integ'] || new Set(INTEG_COLUNAS.filter(c=>c.default).map(c=>c.id));
  const cols = INTEG_COLUNAS.filter(c => ativas.has(c.id)).map(c=>c.id);
  const ncols = cols.length || 1;

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="${ncols}" style="text-align:center;color:var(--muted);padding:32px">
      ${INTEG_TODOS_COLABS.length === 0 ? 'Selecione uma data com integração.' : 'Nenhum colaborador encontrado com este filtro.'}
    </td></tr>`;
    return;
  }

  tbody.innerHTML = lista.map((col, i) => {
    function abrevBen(s) {
      if (!s) return '';
      if (/vale.transporte|\bvt\b/i.test(s)) return 'VT';
      if (/vale.refei|\bvr\b/i.test(s)) return 'VR';
      if (/mobilidade|mob|auxilio.mob/i.test(s)) return 'MOB';
      if (/vale.aliment|\bva\b/i.test(s)) return 'VA';
      if (/cesta.basica/i.test(s)) return 'CB';
      if (/dinheiro/i.test(s)) return 'VT$';
      if (/reembolso/i.test(s)) return 'VT$';
      const m = s.match(/^(\d+)/);
      return m ? m[1] : s.substring(0,6);
    }
    const benBrutos = [col.beneficio_mob, col.beneficio_vr, col.beneficio_vt].filter(Boolean);
    const benAbrev  = [...new Set(benBrutos.map(abrevBen))].join(' · ');
    const benTooltip = benBrutos.join(' | ');
    const ben = benAbrev || '—';
    const fechada = col._colmeia_status === 'fechada';
    const corPres = col.presenca === 'PAGAR' ? 'var(--success)' : col.presenca === 'NO SHOW' ? 'var(--danger)' : 'var(--muted)';
    const bgPagar  = col.presenca === 'PAGAR'    ? 'var(--success)' : 'transparent';
    const bgNoShow = col.presenca === 'NO SHOW'  ? 'var(--danger)'  : 'transparent';
    const txtPagar  = col.presenca === 'PAGAR'   ? '#fff' : 'var(--success)';
    const txtNoShow = col.presenca === 'NO SHOW' ? '#fff' : 'var(--danger)';
    const deptoTexto = col._depto_nome && !/^\d+$/.test(col._depto_nome.trim())
      ? col._depto_nome : (col._depto_cod || col._depto_nome || '—');
    const obsDisplay = col.obs
      ? `<div style="font-size:11px;color:var(--warning);margin-top:2px;max-width:220px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis" title="${col.obs}">💬 ${col.obs}</div>`
      : '';
    const cellConf = fechada
      ? `<span style="font-size:12px;font-weight:700;color:${corPres}">${col.presenca || '—'}</span>`
      : `<div style="display:flex;gap:5px;justify-content:center">
           <button onclick="integToggle('${col.id}','PAGAR')"
             style="padding:4px 10px;border-radius:6px;border:1.5px solid var(--success);font-size:11.5px;cursor:pointer;font-weight:700;background:${bgPagar};color:${txtPagar};font-family:var(--font)">✅ Pagar</button>
           <button onclick="integAbrirNoShow('${col.id}')"
             style="padding:4px 10px;border-radius:6px;border:1.5px solid var(--danger);font-size:11.5px;cursor:pointer;font-weight:700;background:${bgNoShow};color:${txtNoShow};font-family:var(--font)">⊘ No Show</button>
         </div>`;
    const cellMap = {
      num:    `<td style="color:var(--muted);font-size:12px;text-align:center">${i+1}</td>`,
      nome:   `<td><div style="font-weight:600;font-size:13px;cursor:pointer" onclick="integAbrirColab('${col.id}')" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color=''">${col.nome}</div>${col.codigo?`<div style="font-size:11px;color:var(--muted)">${col.codigo}</div>`:''}${obsDisplay}</td>`,
      cargo:  `<td style="font-size:12.5px;color:var(--muted)">${col.cargo || '—'}</td>`,
      depto:  `<td style="font-size:12.5px">${deptoTexto}</td>`,
      ben:    `<td style="font-size:12px;color:var(--text);font-weight:500" title="${benTooltip}">${ben}</td>`,
      conf:   `<td style="text-align:center">${cellConf}</td>`,
      confPor:`<td style="font-size:11.5px;color:var(--muted)">${col.confirmado_por || '—'}</td>`,
    };
    return `<tr id="integ-row-${col.id}" style="border-bottom:1px solid var(--border)">${cols.map(c=>cellMap[c]||'<td>—</td>').join('')}</tr>`;
  }).join('');
}

// Toggle: clique no botão já marcado desmarca; clique no outro marca
async function integToggle(colabId, novaPresenca) {
  const col = INTEG_TODOS_COLABS.find(c => c.id === colabId);
  // Se já está marcado com esse status → desmarcar (enviar vazio)
  const presencaFinal = (col?.presenca === novaPresenca) ? '' : novaPresenca;
  try {
    await rpc('wc_integ_confirmar_presenca', { p_colab_id: colabId, p_presenca: presencaFinal, p_obs: col?.obs || '' });
    if (col) { col.presenca = presencaFinal; col.confirmado_por = presencaFinal ? session?.nome : ''; }
    integRenderTabela();
    const colmeias = integFiltrarPorOnsite(INTEG_COLMEIAS.filter(c => c.data_admissao === window._integDataAtiva));
    colmeias.forEach(c => {
      const cc = INTEG_TODOS_COLABS.filter(x => x._colmeia_id === c.id);
      c.pagos    = cc.filter(x => x.presenca === 'PAGAR').length;
      c.noshow   = cc.filter(x => x.presenca === 'NO SHOW').length;
      c.pendentes= cc.filter(x => !x.presenca).length;
    });
    integRenderKPIs(colmeias);
    integRenderPills();
  } catch(e) { showToast(e.message, 'error'); }
}

// Abrir modal do colaborador — Onsite edita ajuste e obs
function integAbrirColab(colabId) {
  const col = INTEG_TODOS_COLABS.find(c => c.id === colabId);
  if (!col) return;
  document.getElementById('integ-mc-id').value         = colabId;
  document.getElementById('integ-mc-nome').textContent = col.nome;
  document.getElementById('integ-mc-sub').textContent  =
    (col.cargo || '') + (col._depto_nome ? ' · ' + col._depto_nome : '') + (col.codigo ? ' · ' + col.codigo : '');
  document.getElementById('integ-mc-obs').value        = col.obs || '';
  document.getElementById('integ-mc-ajuste-tipo').value   = '';
  document.getElementById('integ-mc-ajuste-valor').value  = '';
  document.getElementById('integ-mc-ajuste-select').value = '';
  document.getElementById('integ-mc-ajuste-valor').style.display  = 'none';
  document.getElementById('integ-mc-ajuste-select').style.display = 'none';
  if (document.getElementById('integ-mc-vt-valor')) document.getElementById('integ-mc-vt-valor').value = '';
  if (document.getElementById('integ-mc-vt-valor-wrap')) document.getElementById('integ-mc-vt-valor-wrap').style.display = 'none';

  // Atualizar visual dos botões Pagar/No Show conforme status atual
  integMcAtualizarBotoesPresenca(col.presenca);

  // Pills de benefícios originais (somente leitura)
  const pills = document.getElementById('integ-mc-ben-pills');
  const bens = [
    col.beneficio_vt  ? { label: col.beneficio_vt,  cor: '#3b82f6' } : null,
    col.beneficio_vr  ? { label: col.beneficio_vr,  cor: '#10b981' } : null,
    col.beneficio_mob ? { label: col.beneficio_mob, cor: '#f59e0b' } : null,
  ].filter(Boolean);
  pills.innerHTML = bens.length
    ? bens.map(b => `<span style="background:${b.cor}22;color:${b.cor};border:1px solid ${b.cor}44;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px">${b.label}</span>`).join('')
    : `<span style="color:var(--muted);font-size:12px">Nenhum benefício registrado</span>`;

  abrirModal('integ-modal-colab');
}

function integMcAtualizarBotoesPresenca(presenca) {
  const btnPagar  = document.getElementById('integ-mc-btn-pagar');
  const btnNoShow = document.getElementById('integ-mc-btn-noshow');
  if (!btnPagar || !btnNoShow) return;
  const ehPagar  = presenca === 'PAGAR';
  const ehNoShow = presenca === 'NO SHOW';
  btnPagar.style.background = ehPagar ? 'var(--success)' : 'transparent';
  btnPagar.style.color      = ehPagar ? '#fff' : 'var(--success)';
  btnNoShow.style.background = ehNoShow ? 'var(--danger)' : 'transparent';
  btnNoShow.style.color      = ehNoShow ? '#fff' : 'var(--danger)';
}

// Botão Pagar dentro do modal — confirma direto (sem fechar)
async function integMcTogglePresenca(tipo) {
  const colabId = document.getElementById('integ-mc-id').value;
  const col = INTEG_TODOS_COLABS.find(c => c.id === colabId);
  if (!col) return;

  if (tipo === 'NOSHOW') {
    // No Show abre o fluxo completo (envia para Seleção) — fecha este modal e abre o de No Show
    fecharModal('integ-modal-colab');
    integAbrirNoShow(colabId);
    return;
  }

  // PAGAR — toggle direto
  const novaPresenca = (col.presenca === 'PAGAR') ? '' : 'PAGAR';
  try {
    await rpc('wc_integ_confirmar_presenca', { p_colab_id: colabId, p_presenca: novaPresenca, p_obs: col?.obs || '' });
    col.presenca = novaPresenca;
    col.confirmado_por = novaPresenca ? session?.nome : '';
    integMcAtualizarBotoesPresenca(novaPresenca);
    integRenderTabela();
    const colmeias = integFiltrarPorOnsite(INTEG_COLMEIAS.filter(c => c.data_admissao === window._integDataAtiva));
    colmeias.forEach(c => {
      const cc = INTEG_TODOS_COLABS.filter(x => x._colmeia_id === c.id);
      c.pagos    = cc.filter(x => x.presenca === 'PAGAR').length;
      c.noshow   = cc.filter(x => x.presenca === 'NO SHOW').length;
      c.pendentes= cc.filter(x => !x.presenca).length;
    });
    integRenderKPIs(colmeias);
    integRenderPills();
    showToast(novaPresenca ? 'Pagamento confirmado!' : 'Confirmação removida.', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

function integMcAjusteTipo() {
  const tipo    = document.getElementById('integ-mc-ajuste-tipo').value;
  const valEl   = document.getElementById('integ-mc-ajuste-valor');
  const selEl   = document.getElementById('integ-mc-ajuste-select');
  const labelEl = document.getElementById('integ-mc-ajuste-label');
  const vtWrap  = document.getElementById('integ-mc-vt-valor-wrap');

  valEl.style.display = 'none';
  selEl.style.display = 'none';
  vtWrap.style.display = 'none';
  valEl.value = '';
  selEl.value = '';
  document.getElementById('integ-mc-vt-valor').value = '';

  if (!tipo) return;

  if (tipo === 'ajuste_vt') {
    labelEl.textContent = 'Novo valor do VT';
    valEl.placeholder   = 'Ex: R$ 35,00';
    valEl.style.display = '';
    valEl.focus();
  } else {
    const labels = {
      troca_transporte: 'Novo benefício de transporte',
      inclusao: 'Benefício a incluir',
      exclusao: 'Benefício a excluir',
    };
    labelEl.textContent = labels[tipo] || 'Detalhe';
    selEl.style.display = '';
  }
}

function integMcAjusteSelectChange() {
  const sel    = document.getElementById('integ-mc-ajuste-select').value;
  const vtWrap = document.getElementById('integ-mc-vt-valor-wrap');
  // Mostrar campo de valor só quando VT ou VT+VOUCHER for selecionado
  vtWrap.style.display = (sel === 'VT' || sel === 'VT+VOUCHER') ? '' : 'none';
  if (vtWrap.style.display !== 'none') {
    document.getElementById('integ-mc-vt-valor').focus();
  }
}

async function integSalvarColab() {
  const colabId = document.getElementById('integ-mc-id').value;
  const col     = INTEG_TODOS_COLABS.find(c => c.id === colabId);
  if (!col) return;

  const obs        = document.getElementById('integ-mc-obs').value.trim();
  const ajusteTipo = document.getElementById('integ-mc-ajuste-tipo').value;
  const ajusteVal  = document.getElementById('integ-mc-ajuste-valor').value.trim();
  const ajusteSel  = document.getElementById('integ-mc-ajuste-select').value;
  const vtValor    = document.getElementById('integ-mc-vt-valor')?.value.trim() || '';
  // Detalhe completo: benefício selecionado + valor do VT se aplicável
  const ajusteDetalhe = ajusteVal || (ajusteSel + (vtValor ? ` R$ ${vtValor}` : ''));

  // Montar observação incluindo ajuste
  const tiposLabel = {
    ajuste_vt:        'Ajuste VT',
    troca_transporte: 'Troca de transporte',
    inclusao:         'Inclusão',
    exclusao:         'Exclusão'
  };
  let obsCompleta = obs;
  if (ajusteTipo) {
    const prefixo = ajusteDetalhe
      ? `[${tiposLabel[ajusteTipo]}: ${ajusteDetalhe}]`
      : `[${tiposLabel[ajusteTipo]}]`;
    obsCompleta = obsCompleta ? `${prefixo} ${obsCompleta}` : prefixo;
  }

  // Salvar flag de ajuste pendente junto com a obs
  const temAjuste = !!ajusteTipo;

  try {
    await rpc('wc_integ_confirmar_presenca', {
      p_colab_id: colabId,
      p_presenca: col.presenca || '',
      p_obs: obsCompleta
    });
    col.obs   = obsCompleta;
    col._tem_ajuste = temAjuste;
    fecharModal('integ-modal-colab');
    integRenderTabela();
    showToast('Salvo!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

async function integFecharTodosGrupos() {
  const colmeias = integFiltrarPorOnsite(
    INTEG_COLMEIAS.filter(c => c.data_admissao === window._integDataAtiva && c.status === 'aberta')
  );
  if (!colmeias.length) return;
  const pend = INTEG_TODOS_COLABS.filter(c => !c.presenca).length;
  if (pend > 0 && !confirm(`Ainda há ${pend} colaborador(es) sem confirmação. Fechar mesmo assim?`)) return;
  try {
    await Promise.all(colmeias.map(col => rpc('wc_integ_fechar_colmeia', { p_colmeia_id: col.id })));
    colmeias.forEach(col => col.status = 'fechada');
    INTEG_TODOS_COLABS.forEach(c => c._colmeia_status = 'fechada');
    integRenderTabela();
    integRenderKPIs(colmeias);
    showToast('Todos os grupos fechados.', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}
// ═══════════════ FIM INTEGRAÇÃO ═══════════════

// ════════════════════════════════════════════════════════════
//  PAGAR BENEFÍCIOS
// ════════════════════════════════════════════════════════════
let PAGAR_BEN_LISTA = [];   // lista completa do banco
let PAGAR_BEN_SELECIONADOS = new Set();

// Navegar para página
const _origNavToPagar = window.navTo;
window.navTo = function(id) {
  if (id === 'pagar-beneficios') {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('nav a, .nav-suporte-item').forEach(a => a.classList.remove('active'));
    const pg = document.getElementById('page-pagar-beneficios');
    if (pg) pg.classList.add('active');
    document.querySelector('[data-page="pagar-beneficios"]')?.classList.add('active');
    pagarBenCarregar();
    return;
  }
  _origNavToPagar(id);
};

async function pagarBenCarregar() {
  const tbody = document.getElementById('pagar-tabela-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:40px">Carregando…</td></tr>';
  try {
    const r = await rpc('wc_integ_listar_para_pagar', {});
    PAGAR_BEN_LISTA = r.lista || [];
    PAGAR_BEN_SELECIONADOS.clear();
    pagarBenPopularFiltros();
    pagarBenFiltrar();
  } catch(e) { showToast(e.message, 'error'); }
}

function pagarBenPopularFiltros() {
  // Datas únicas
  const datas = [...new Set(PAGAR_BEN_LISTA.map(c => c.data_admissao_fmt))].sort().reverse();
  const selData = document.getElementById('pagar-filtro-data');
  selData.innerHTML = '<option value="">Todas as datas</option>' +
    datas.map(d => `<option value="${d}">${d}${PAGAR_BEN_LISTA.some(c => c.data_admissao_fmt===d && c.atrasado) ? ' ⚠️' : ''}</option>`).join('');

  // CCs únicos
  const ccs = [...new Set(PAGAR_BEN_LISTA.map(c => c.depto_cod))].sort();
  const selCC = document.getElementById('pagar-filtro-cc');
  selCC.innerHTML = '<option value="">Todos os CCs</option>' +
    ccs.map(cc => `<option value="${cc}">${cc}</option>`).join('');
}

function pagarBenFiltrar() {
  const filtData = document.getElementById('pagar-filtro-data')?.value || '';
  const filtCC   = document.getElementById('pagar-filtro-cc')?.value || '';
  const busca    = (document.getElementById('pagar-busca')?.value || '').toLowerCase();

  let lista = [...PAGAR_BEN_LISTA];
  if (filtData) lista = lista.filter(c => c.data_admissao_fmt === filtData);
  if (filtCC)   lista = lista.filter(c => c.depto_cod === filtCC);
  if (busca)    lista = lista.filter(c => (c.nome||'').toLowerCase().includes(busca));

  const cont = document.getElementById('pagar-contador');
  if (cont) cont.textContent = `${lista.length} colaborador(es)` + (PAGAR_BEN_LISTA.length !== lista.length ? ` de ${PAGAR_BEN_LISTA.length}` : '');

  pagarBenRenderTabela(lista);
}

function abrevBenPagar(s) {
  if (!s) return '';
  if (/vale.transporte|\bvt\b/i.test(s)) return 'VT';
  if (/vale.refei|\bvr\b/i.test(s)) return 'VR';
  if (/mobilidade|mob|auxilio.mob/i.test(s)) return 'MOB';
  if (/vale.aliment|\bva\b/i.test(s)) return 'VA';
  if (/cesta.basica/i.test(s)) return 'CB';
  if (/dinheiro|reembolso/i.test(s)) return 'VT$';
  return s.substring(0, 6);
}

function pagarBenRenderTabela(lista) {
  cpTheadPagar();
  const tbody = document.getElementById('pagar-tabela-body');
  if (!tbody) return;
  const ativas = _cpAtivas['pagar'] || new Set(PAGAR_COLUNAS.filter(c=>c.default).map(c=>c.id));
  const cols = PAGAR_COLUNAS.filter(c => ativas.has(c.id)).map(c=>c.id);
  const ncols = cols.length || 1;

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="${ncols}" style="text-align:center;color:var(--muted);padding:40px">` +
      (PAGAR_BEN_LISTA.length === 0 ? '✅ Nenhum benefício pendente de pagamento.' : 'Nenhum resultado para este filtro.') +
      '</td></tr>';
    return;
  }

  let dataAtual = null;
  tbody.innerHTML = lista.map((col, i) => {
    const ben = [...new Set([col.beneficio_mob, col.beneficio_vr, col.beneficio_vt].filter(Boolean).map(abrevBenPagar))].join(' · ') || '—';
    const benTooltip = [col.beneficio_mob, col.beneficio_vr, col.beneficio_vt].filter(Boolean).join(' | ');
    const selecionado = PAGAR_BEN_SELECIONADOS.has(col.id);
    const atrasadoBg = col.atrasado ? 'background:rgba(239,68,68,.06)' : '';

    let separador = '';
    if (col.data_admissao_fmt !== dataAtual) {
      dataAtual = col.data_admissao_fmt;
      const label = col.atrasado
        ? `<span style="color:var(--danger);font-weight:700">⚠️ Integração ${col.data_admissao_fmt} — ATRASADO</span>`
        : `<span style="color:var(--muted)">📅 Integração ${col.data_admissao_fmt}</span>`;
      separador = `<tr style="background:var(--surface2)"><td colspan="${ncols}" style="padding:6px 14px;font-size:11px;border-bottom:1px solid var(--border)">${label}</td></tr>`;
    }

    const cellMap = {
      sel:    `<td style="text-align:center"><input type="checkbox" ${selecionado?'checked':''} onchange="pagarBenToggle('${col.id}', this.checked)" style="cursor:pointer;width:14px;height:14px"/></td>`,
      nome:   `<td><div style="font-weight:600;font-size:13px">${col.nome}${col.obs&&col.obs.includes('[')?`<span title="${col.obs}" style="margin-left:6px;background:rgba(245,158,11,.2);color:var(--warning);font-size:10px;font-weight:700;padding:2px 6px;border-radius:10px;cursor:help">⚠️ Ajuste</span>`:''}</div>${col.codigo?`<div style="font-size:11px;color:var(--muted)">${col.codigo}</div>`:''}${col.obs&&col.obs.includes('[')?`<div style="font-size:10.5px;color:var(--warning);margin-top:2px">${col.obs.match(/\[([^\]]+)\]/g)?.join(' ')||''}</div>`:''}</td>`,
      cc:     `<td style="font-size:12px">${col.depto_cod||'—'}</td>`,
      ben:    `<td style="font-size:12px;font-weight:500" title="${benTooltip}">${ben}</td>`,
      integ:  `<td style="font-size:12px;color:var(--muted)">${col.data_admissao_fmt||'—'}</td>`,
      confPor:`<td style="font-size:11.5px;color:var(--muted)">${col.confirmado_por||'—'}${col.confirmado_at?`<div style="font-size:10px">${new Date(col.confirmado_at).toLocaleDateString('pt-BR')}</div>`:''}</td>`,
      pagar:  `<td style="text-align:center"><button onclick="pagarBenAbrirModal('${col.id}')" style="padding:5px 12px;border-radius:8px;border:1.5px solid var(--success);font-size:11.5px;cursor:pointer;font-weight:700;background:transparent;color:var(--success);font-family:var(--font)">💰 Programar</button></td>`,
    };

    const row = `<tr id="pagar-row-${col.id}" style="border-bottom:1px solid var(--border);${atrasadoBg}${selecionado?';background:rgba(99,204,176,.07)':''}">${cols.map(c=>cellMap[c]||'<td>—</td>').join('')}</tr>`;
    return separador + row;
  }).join('');

  pagarBenAtualizarLoteBar();
}

function pagarBenToggle(id, checked) {
  if (checked) PAGAR_BEN_SELECIONADOS.add(id);
  else PAGAR_BEN_SELECIONADOS.delete(id);
  pagarBenAtualizarLoteBar();
}

function pagarBenSelecionarTodos(checked) {
  const rows = document.querySelectorAll('#pagar-tabela-body input[type=checkbox]');
  PAGAR_BEN_SELECIONADOS.clear();
  if (checked) {
    // Selecionar apenas os visíveis
    const filtData = document.getElementById('pagar-filtro-data')?.value || '';
    const filtCC   = document.getElementById('pagar-filtro-cc')?.value || '';
    const busca    = (document.getElementById('pagar-busca')?.value || '').toLowerCase();
    PAGAR_BEN_LISTA
      .filter(c => (!filtData || c.data_admissao_fmt === filtData) &&
                   (!filtCC   || c.depto_cod === filtCC) &&
                   (!busca    || (c.nome||'').toLowerCase().includes(busca)))
      .forEach(c => PAGAR_BEN_SELECIONADOS.add(c.id));
  }
  rows.forEach(cb => cb.checked = checked);
  pagarBenAtualizarLoteBar();
}

function pagarBenDeselecionarTodos() {
  PAGAR_BEN_SELECIONADOS.clear();
  document.getElementById('pagar-chk-all').checked = false;
  pagarBenFiltrar();
}

function pagarBenAtualizarLoteBar() {
  const bar   = document.getElementById('pagar-lote-bar');
  const count = document.getElementById('pagar-lote-count');
  if (!bar) return;
  const n = PAGAR_BEN_SELECIONADOS.size;
  bar.style.display = n > 0 ? 'block' : 'none';
  if (count) count.textContent = `${n} colaborador(es) selecionado(s)`;
}

function pagarBenAbrirModal(colabId) {
  const col = PAGAR_BEN_LISTA.find(c => c.id === colabId);
  if (!col) return;
  document.getElementById('pagar-modal-id').value  = colabId;
  document.getElementById('pagar-modal-nome').textContent = col.nome;
  document.getElementById('pagar-modal-sub').textContent  =
    (col.cargo || '') + ' · ' + (col.depto_cod || '') + ' · Integração: ' + (col.data_admissao_fmt || '');
  // Sugerir data +5 dias da integração
  if (col.data_admissao) {
    const dt = new Date(col.data_admissao);
    dt.setDate(dt.getDate() + 5);
    document.getElementById('pagar-modal-data').value = dt.toISOString().split('T')[0];
  } else {
    document.getElementById('pagar-modal-data').value = '';
  }
  abrirModal('pagar-modal-pago');
}

async function pagarBenConfirmar() {
  const id   = document.getElementById('pagar-modal-id').value;
  const data = document.getElementById('pagar-modal-data').value;
  if (!data) { showToast('Informe a data de pagamento.', 'error'); return; }
  try {
    await rpc('wc_integ_marcar_pago', { p_colab_ids: [id], p_data_pagto: data });
    PAGAR_BEN_LISTA = PAGAR_BEN_LISTA.filter(c => c.id !== id);
    fecharModal('pagar-modal-pago');
    pagarBenFiltrar();
    showToast('Pagamento programado!', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

async function pagarBenLote() {
  const data = document.getElementById('pagar-lote-data').value;
  if (!data) { showToast('Informe a data de pagamento.', 'error'); return; }
  const ids = [...PAGAR_BEN_SELECIONADOS];
  if (!ids.length) return;
  try {
    const r = await rpc('wc_integ_marcar_pago', { p_colab_ids: ids, p_data_pagto: data });
    PAGAR_BEN_LISTA = PAGAR_BEN_LISTA.filter(c => !PAGAR_BEN_SELECIONADOS.has(c.id));
    PAGAR_BEN_SELECIONADOS.clear();
    pagarBenFiltrar();
    showToast(`${r.atualizados || ids.length} pagamento(s) programado(s)!`, 'success');
  } catch(e) { showToast(e.message, 'error'); }
}
// ═══════════════ FIM PAGAR BENEFÍCIOS ═══════════════

// ════════════════════════════════════════════════════════════
//  NO SHOW — Modal e confirmação
// ════════════════════════════════════════════════════════════

function integAbrirNoShow(colabId) {
  const col = INTEG_TODOS_COLABS.find(c => c.id === colabId);
  if (!col) return;

  // Se já é NO SHOW → toggle (desmarcar)
  if (col.presenca === 'NO SHOW') {
    integToggle(colabId, 'NO SHOW');
    return;
  }

  // Abrir modal para preencher detalhes
  document.getElementById('ns-modal-id').value = colabId;
  document.getElementById('ns-modal-nome').textContent = col.nome;
  document.getElementById('ns-modal-sub').textContent =
    (col.cargo || '') + (col._depto_nome ? ' · ' + col._depto_nome : '') + (col.codigo ? ' · ' + col.codigo : '');

  // Reset fields
  const chk = document.getElementById('ns-participou');
  chk.checked = false;
  chk.parentElement.querySelector('span').style.background = 'var(--surface3)';
  chk.parentElement.querySelector('em').style.left = '3px';
  document.getElementById('ns-tipo-abs').value   = '';
  document.getElementById('ns-data-deslig').value = '';
  document.getElementById('ns-motivo').value = '';

  abrirModal('integ-modal-noshow');
}

async function integConfirmarNoShow() {
  const colabId    = document.getElementById('ns-modal-id').value;
  const tipoAbs    = document.getElementById('ns-tipo-abs').value;
  const participou = document.getElementById('ns-participou').checked;
  const dataDeslig = document.getElementById('ns-data-deslig').value || null;
  const motivo     = document.getElementById('ns-motivo').value.trim();

  if (!tipoAbs)    { showToast('Selecione o tipo de ocorrência.', 'error'); return; }
  if (!dataDeslig) { showToast('Informe a data do desligamento ou ausência.', 'error'); return; }

  try {
    await rpc('wc_integ_salvar_noshow', {
      p_colab_id:              colabId,
      p_participou_integracao: participou,
      p_data_desligamento:     dataDeslig,
      p_motivo:                motivo || null,
      p_tipo_abs:              tipoAbs
    });

    const col = INTEG_TODOS_COLABS.find(c => c.id === colabId);
    if (col) {
      col.presenca          = 'NO SHOW';
      col.confirmado_por    = session?.nome;
      col.ns_participou     = participou;
      col.ns_data_deslig    = dataDeslig;
      col.ns_motivo         = motivo;
    }

    fecharModal('integ-modal-noshow');
    integRenderTabela();

    // Atualizar KPIs
    const colmeias = integFiltrarPorOnsite(INTEG_COLMEIAS.filter(c => c.data_admissao === window._integDataAtiva));
    colmeias.forEach(c => {
      const cc = INTEG_TODOS_COLABS.filter(x => x._colmeia_id === c.id);
      c.pagos    = cc.filter(x => x.presenca === 'PAGAR').length;
      c.noshow   = cc.filter(x => x.presenca === 'NO SHOW').length;
      c.pendentes= cc.filter(x => !x.presenca).length;
    });
    integRenderKPIs(colmeias);
    integRenderPills();
    showToast('No Show registrado.', 'success');
  } catch(e) { showToast(e.message, 'error'); }
}

// ════════════════════════════════════════════════════════════
//  HISTÓRICO DE BENEFÍCIOS
// ════════════════════════════════════════════════════════════
let HIST_BEN_LISTA = [];
let HIST_BEN_TAB   = 'todos'; // 'todos' | 'pagos' | 'noshow'

// Navegar
const _origNavToHist = window.navTo;
window.navTo = function(id) {
  if (id === 'ben-historico') {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('nav a, .nav-suporte-item').forEach(a => a.classList.remove('active'));
    const pg = document.getElementById('page-ben-historico');
    if (pg) pg.classList.add('active');
    document.querySelector('[data-page="ben-historico"]')?.classList.add('active');
    histBenCarregar();
    return;
  }
  _origNavToHist(id);
};

async function histBenCarregar() {
  const tbody = document.getElementById('hist-tabela-body');
  if (!tbody) return;
  tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:40px">Carregando…</td></tr>';
  try {
    const r = await rpc('wc_integ_historico', {});
    HIST_BEN_LISTA = r.lista || [];
    histBenPopularFiltros();
    histBenFiltrar();
  } catch(e) { showToast(e.message, 'error'); }
}

function histBenPopularFiltros() {
  const datas = [...new Set(HIST_BEN_LISTA.map(c => c.data_admissao_fmt))].sort().reverse();
  const selData = document.getElementById('hist-filtro-data');
  if (selData) selData.innerHTML = '<option value="">Todas as datas</option>' +
    datas.map(d => `<option value="${d}">${d}</option>`).join('');

  // CCs iniciam com todos; atualiza ao mudar a data
  histBenAtualizarFiltroCC('');
}

function histBenAtualizarFiltroCC(dataFiltro) {
  // Mostra apenas CCs que têm registro na data selecionada (ou todos se sem data)
  const base = dataFiltro
    ? HIST_BEN_LISTA.filter(c => c.data_admissao_fmt === dataFiltro)
    : HIST_BEN_LISTA;

  const ccs = [...new Set(base.map(c => c.depto_cod).filter(Boolean))].sort();
  const selCC = document.getElementById('hist-filtro-cc');
  if (!selCC) return;

  const valorAtual = selCC.value;
  selCC.innerHTML = '<option value="">Todos os CCs</option>' +
    ccs.map(cc => `<option value="${cc}" ${cc === valorAtual ? 'selected' : ''}>${cc}</option>`).join('');

  // Se o CC selecionado não existe mais nessa data, limpa
  if (valorAtual && !ccs.includes(valorAtual)) selCC.value = '';
}

function histBenSetTab(tab) {
  HIST_BEN_TAB = tab;
  ['todos','pagos','noshow'].forEach(t => {
    const btn = document.getElementById('hist-tab-' + t);
    if (!btn) return;
    const ativo = t === tab;
    btn.style.background = ativo ? 'var(--accent)' : 'var(--surface2)';
    btn.style.color      = ativo ? 'var(--brand)'  : 'var(--muted)';
    btn.style.fontWeight = ativo ? '700' : '600';
  });
  histBenFiltrar();
}

function histBenFiltrar() {
  const filtData = document.getElementById('hist-filtro-data')?.value || '';
  const filtCC   = document.getElementById('hist-filtro-cc')?.value   || '';
  const busca    = (document.getElementById('hist-busca')?.value || '').toLowerCase();

  // Atualizar CCs disponíveis conforme data selecionada
  histBenAtualizarFiltroCC(filtData);

  let lista = [...HIST_BEN_LISTA];
  if (HIST_BEN_TAB === 'pagos')  lista = lista.filter(c => c.presenca === 'PAGAR');
  if (HIST_BEN_TAB === 'noshow') lista = lista.filter(c => c.presenca === 'NO SHOW');
  if (filtData) lista = lista.filter(c => c.data_admissao_fmt === filtData);
  if (filtCC)   lista = lista.filter(c => c.depto_cod === filtCC);
  if (busca)    lista = lista.filter(c => (c.nome||'').toLowerCase().includes(busca));

  const cont = document.getElementById('hist-contador');
  if (cont) cont.textContent = lista.length + ' registro(s)';

  histBenRenderTabela(lista);
}

function histBenRenderTabela(lista) {
  cpTheadHist();
  const tbody = document.getElementById('hist-tabela-body');
  if (!tbody) return;
  const ativas = _cpAtivas['hist'] || new Set(HIST_COLUNAS.filter(c=>c.default).map(c=>c.id));
  const cols = HIST_COLUNAS.filter(c => ativas.has(c.id)).map(c=>c.id);
  const ncols = cols.length || 1;

  if (!lista.length) {
    tbody.innerHTML = `<tr><td colspan="${ncols}" style="text-align:center;color:var(--muted);padding:40px">` +
      (HIST_BEN_LISTA.length === 0 ? 'Nenhum registro no histórico.' : 'Nenhum resultado para este filtro.') +
      '</td></tr>';
    return;
  }

  function abrev(s) {
    if (!s) return '';
    if (/vale.transporte|\bvt\b/i.test(s)) return 'VT';
    if (/vale.refei|\bvr\b/i.test(s)) return 'VR';
    if (/mobilidade|mob/i.test(s)) return 'MOB';
    if (/vale.aliment|\bva\b/i.test(s)) return 'VA';
    if (/cesta.basica/i.test(s)) return 'CB';
    if (/dinheiro|reembolso/i.test(s)) return 'VT$';
    return s.substring(0,6);
  }
  function fmtDt(iso) { if(!iso)return'—'; try{return new Date(iso).toLocaleDateString('pt-BR');}catch{return iso;} }
  function fmtDtHr(iso) { if(!iso)return'—'; try{return new Date(iso).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'});}catch{return iso;} }

  tbody.innerHTML = lista.map(col => {
    const ben = [...new Set([col.beneficio_mob,col.beneficio_vr,col.beneficio_vt].filter(Boolean).map(abrev))].join(' · ') || '—';
    const benTooltip = [col.beneficio_mob,col.beneficio_vr,col.beneficio_vt].filter(Boolean).join(' | ');
    const isPago   = col.presenca === 'PAGAR';
    const ajusteMatch = col.obs ? col.obs.match(/\[([^\]]+)\]/g) : null;
    const ajusteInfo  = ajusteMatch ? ajusteMatch.join(' ') : null;

    const detalhes = isPago ? `
      <div style="font-size:12px">
        <div style="font-weight:700;color:var(--success);margin-bottom:4px">💰 Data de pagamento</div>
        <div style="font-size:13px;font-weight:800;color:var(--text)">${fmtDt(col.data_pagamento)}</div>
        <div style="font-size:11px;color:var(--muted);margin-top:4px">Programado por <strong>${col.programado_por||'—'}</strong><br/>em ${fmtDtHr(col.programado_em)}</div>
        ${ajusteInfo ? `<div style="margin-top:6px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);border-radius:6px;padding:5px 8px;font-size:10.5px;color:var(--warning)">⚠️ ${ajusteInfo}<br/><span style="color:var(--muted)">Solicitado por <strong>${col.confirmado_por||'—'}</strong></span></div>` : ''}
      </div>` : `
      <div style="font-size:12px">
        <div style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
          <span style="font-size:11px;font-weight:700;padding:2px 8px;border-radius:6px;background:${col.ns_participou_integracao?'rgba(99,204,176,.15)':'rgba(239,68,68,.12)'};color:${col.ns_participou_integracao?'var(--success)':'var(--danger)'}">
            ${col.ns_participou_integracao ? '✅ Participou da integração' : '❌ Não participou da integração'}
          </span>
        </div>
        <div style="font-size:11.5px;color:var(--muted)">
          <div>📅 Desligamento: <strong style="color:var(--text)">${fmtDt(col.ns_data_desligamento)}</strong></div>
          ${col.ns_motivo ? `<div style="margin-top:3px">💬 ${col.ns_motivo}</div>` : ''}
          <div style="margin-top:3px">Registrado por <strong>${col.confirmado_por||'—'}</strong> em ${fmtDtHr(col.confirmado_at)}</div>
        </div>
      </div>`;

    const cellMap = {
      nome:  `<td><div style="font-weight:700;font-size:13px">${col.nome}</div>${col.codigo?`<div style="font-size:11px;color:var(--muted)">${col.codigo}</div>`:''}</td>`,
      cc:    `<td style="font-size:12px">${col.depto_cod||'—'}</td>`,
      ben:   `<td style="font-size:12px;font-weight:500" title="${benTooltip}">${ben}</td>`,
      integ: `<td style="font-size:12px;color:var(--muted)">${col.data_admissao_fmt||'—'}</td>`,
      status:`<td style="text-align:center"><span class="pill" style="background:${isPago?'rgba(99,204,176,.15)':'rgba(239,68,68,.12)'};color:${isPago?'var(--success)':'var(--danger)'}">${isPago?'✅ PAGO':'⊘ NO SHOW'}</span></td>`,
      dets:  `<td>${detalhes}</td>`,
    };
    return `<tr style="border-bottom:1px solid var(--border)">${cols.map(c=>cellMap[c]||'<td>—</td>').join('')}</tr>`;
  }).join('');
}
// ═══════════════ FIM HISTÓRICO BENEFÍCIOS ═══════════════

