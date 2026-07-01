//  LÍDERES — solicitações de advertência e suspensão
// ════════════════════════════════════════════════════════════
let LIDER_DADOS = [];

async function liderCarregar() {
  const tbody = document.getElementById('lid-tbody');
  if (tbody) tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:32px">Carregando…</td></tr>';
  try {
    const r = await rpc('wc_lider_solicitacoes_onsite', {});
    LIDER_DADOS = r.itens || [];
    liderRenderKpis();
    liderRenderTabela();
    const pend = LIDER_DADOS.filter(l => l.status === 'pendente' || l.status === 'assinado').length;
    const badge = document.getElementById('nav-lideres-count');
    if (badge) { badge.textContent = pend; badge.style.display = pend ? 'inline-flex' : 'none'; }
  } catch(e) {
    if (tbody) tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;color:var(--danger);padding:32px">${e.message}</td></tr>`;
  }
}

function liderRenderKpis() {
  const kpis = [
    { lbl:'Pendentes',    val: LIDER_DADOS.filter(l=>l.status==='pendente').length,       cor:'var(--warning)' },
    { lbl:'Em Andamento', val: LIDER_DADOS.filter(l=>l.status==='em_andamento').length,    cor:'var(--accent)' },
    { lbl:'Aguard. Conf.',val: LIDER_DADOS.filter(l=>l.status==='assinado').length,        cor:'var(--accent)' },
    { lbl:'Concluídos',   val: LIDER_DADOS.filter(l=>l.status==='concluido').length,       cor:'var(--success)' },
  ];
  document.getElementById('lid-kpis').innerHTML = kpis.map(k =>
    `<div class="card" style="text-align:center;padding:14px">
      <div style="font-size:10.5px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px">${k.lbl}</div>
      <div style="font-size:26px;font-weight:900;color:${k.cor};margin-top:4px">${k.val}</div>
    </div>`
  ).join('');
}

function liderRenderTabela() {
  const busca  = (document.getElementById('lid-busca')?.value || '').toLowerCase();
  const status = document.getElementById('lid-filtro-status')?.value || '';
  const tipo   = document.getElementById('lid-filtro-tipo')?.value   || '';
  const fmt    = d => d ? (d.split('T')[0]||d).split('-').reverse().join('/') : '—';

  const statusPill = s => ({
    pendente:     `<span style="background:rgba(245,158,11,.15);color:var(--warning);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">⏳ Pendente</span>`,
    em_andamento: `<span style="background:rgba(99,204,176,.15);color:var(--accent);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">⚙ Em Andamento</span>`,
    assinado:     `<span style="background:rgba(34,197,94,.2);color:var(--success);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">✍ Aguard. Conf.</span>`,
    concluido:    `<span style="background:rgba(34,197,94,.15);color:var(--success);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">✅ Concluído</span>`,
    cancelado:    `<span style="background:rgba(239,68,68,.1);color:var(--danger);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">❌ Cancelado</span>`,
  }[s] || s);

  let dados = LIDER_DADOS.filter(l => {
    const txt = `${l.colab_nome||''} ${l.lider_nome||''} ${l.cc_cod||''} ${l.cc_nome||''} ${l.colab_matricula||''}`.toLowerCase();
    if (busca && !txt.includes(busca)) return false;
    if (status && l.status !== status) return false;
    if (tipo   && l.tipo   !== tipo)   return false;
    return true;
  });

  const peso = l => l.status === 'pendente' ? 0 : l.status === 'assinado' ? 1 : l.status === 'em_andamento' ? 2 : 3;
  dados = [...dados].sort((a,b) => peso(a) - peso(b) || new Date(b.created_at) - new Date(a.created_at));

  const tbody = document.getElementById('lid-tbody');
  if (!dados.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:32px;color:var(--muted)">Nenhuma solicitação encontrada</td></tr>';
    return;
  }

  tbody.innerHTML = dados.map(l => {
    const tipoPill = l.tipo === 'advertencia'
      ? `<span style="background:rgba(245,158,11,.12);color:var(--warning);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">⚠️ Adv.</span>`
      : `<span style="background:rgba(239,68,68,.1);color:var(--danger);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">🚫 Susp.</span>`;
    const podeGerar   = l.status === 'pendente';
    const podeConfirm = l.status === 'assinado';
    const dataR = JSON.stringify(l).replace(/"/g,'&quot;');
    return `<tr style="cursor:pointer" onclick='liderAbrirProc(${dataR})'>
      <td style="white-space:nowrap">${fmt(l.data_documento||l.created_at)}</td>
      <td>${tipoPill}</td>
      <td><strong>${l.colab_nome||'—'}</strong><div style="font-size:11px;color:var(--muted)">${l.colab_matricula||''}</div></td>
      <td style="font-size:11.5px">${l.lider_nome||'—'}<br><span style="color:var(--muted)">${l.cc_cod||''}</span></td>
      <td>${statusPill(l.status)}</td>
      <td onclick="event.stopPropagation()">
        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${podeGerar   ? `<button class="btn btn-primary btn-sm" onclick="liderAbrirProc(${dataR})">📄 Gerar PDF</button>` : ''}
          ${podeConfirm ? `<button class="btn btn-primary btn-sm" style="background:var(--success)" onclick="liderConcluir('${l.id}')">✅ Confirmar</button>` : ''}
          ${l.pdf_assinado_path ? `<a href="${l.pdf_assinado_path}" target="_blank" class="btn btn-ghost btn-sm">📋 Ver</a>` : ''}
        </div>
      </td>
    </tr>`;
  }).join('');
}

function liderAbrirProc(l) {
  const fmt = d => d ? (d.split('T')[0]||d).split('-').reverse().join('/') : '—';
  document.getElementById('lid-proc-id').value    = l.id;
  document.getElementById('lid-proc-dados').value = JSON.stringify(l);
  document.getElementById('lid-proc-titulo').textContent = l.tipo === 'advertencia' ? '⚠️ Advertência Disciplinar' : '🚫 Carta de Suspensão';
  document.getElementById('lid-proc-sub').textContent    = `${l.colab_nome} · Solicitado por ${l.lider_nome}`;
  document.getElementById('lid-proc-obs').value   = l.obs_onsite || '';
  document.getElementById('lid-proc-motivo').textContent = l.motivo || '—';
  document.getElementById('lid-proc-info').innerHTML = `
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Colaborador</span><br><strong>${l.colab_nome}</strong></div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">CPF</span><br>${l.colab_cpf||'—'}</div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Matrícula</span><br>${l.colab_matricula||'—'}</div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Local</span><br>${l.colab_local||l.cc_cod||'—'}</div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Data</span><br>${fmt(l.data_documento)}</div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Líder</span><br>${l.lider_nome||'—'}</div>
    ${l.tipo==='suspensao'?`<div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Suspensão</span><br>${l.dias_suspensao||'?'} dia(s)</div>
    <div><span style="color:var(--muted);font-size:10px;text-transform:uppercase">Início → Retorno</span><br>${fmt(l.data_inicio_susp)} → ${fmt(l.data_retorno_susp)}</div>`:''}`;

  const arqEl = document.getElementById('lid-proc-arquivo');
  const gerarBtn = document.getElementById('lid-proc-btn-gerar');
  arqEl.innerHTML = '';
  if (l.pdf_gerado_path) {
    arqEl.innerHTML = `<div style="display:flex;gap:8px;flex-wrap:wrap">
      <a href="${l.pdf_gerado_path}" target="_blank" class="btn btn-ghost btn-sm">📥 Baixar PDF gerado</a>
      ${l.pdf_assinado_path ? `<a href="${l.pdf_assinado_path}" target="_blank" class="btn btn-ghost btn-sm">📋 Ver assinado pelo líder</a>` : ''}
    </div>`;
    gerarBtn.textContent = '🔄 Regerar PDF';
  } else {
    gerarBtn.textContent = '📄 Gerar PDF e Enviar ao Líder';
  }
  if (l.status === 'concluido' || l.status === 'cancelado') gerarBtn.style.display = 'none';
  else gerarBtn.style.display = 'inline-flex';

  abrirModal('modal-lider-proc');
}

async function liderGerarPDF() {
  const idSol = document.getElementById('lid-proc-id').value;
  const l     = JSON.parse(document.getElementById('lid-proc-dados').value);
  const obs   = document.getElementById('lid-proc-obs').value.trim();

  try {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });

    const margL = 25, margR = 25, largura = 210 - margL - margR;
    const fmt = d => {
      if (!d) return '—';
      const s = d.split('T')[0] || d;
      const parts = s.split('-');
      return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : s;
    };

    const MESES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const dtDoc = l.data_documento ? new Date(l.data_documento + 'T12:00:00') : new Date();
    const dataExtenso = `${l.cidade_documento||'Ananindeua'}, ${String(dtDoc.getDate()).padStart(2,'0')} de ${MESES[dtDoc.getMonth()]} de ${dtDoc.getFullYear()}`;

    doc.setFont('helvetica','normal');
    let y = 30;

    if (l.tipo === 'advertencia') {
      // ── ADVERTÊNCIA DISCIPLINAR ──
      doc.setFontSize(14); doc.setFont('helvetica','bold');
      doc.text('ADVERTÊNCIA DISCIPLINAR', 105, y, {align:'center'}); y += 14;

      doc.setFontSize(11); doc.setFont('helvetica','normal');
      doc.text(dataExtenso, 105, y, {align:'center'}); y += 12;

      doc.setFont('helvetica','bold');
      doc.text('ADVERTIMOS: ', margL, y, {baseline:'top'});
      doc.setFont('helvetica','normal');
      const nomeW = doc.getTextWidth('ADVERTIMOS: ');
      doc.text(l.colab_nome || '—', margL + nomeW, y, {baseline:'top'}); y += 8;

      doc.setFont('helvetica','bold');
      doc.text('CPF: ', margL, y, {baseline:'top'});
      doc.setFont('helvetica','normal');
      const cpfW = doc.getTextWidth('CPF: ');
      doc.text(l.colab_cpf || '—', margL + cpfW, y, {baseline:'top'}); y += 12;

      doc.setFontSize(11);
      const intro = 'Em conformidade com o ARTIGO 482 alínea H da C.L.T., vimos adverti-lo pelo seguinte motivo:';
      const introLines = doc.splitTextToSize(intro, largura);
      doc.text(introLines, margL, y); y += introLines.length * 6 + 6;

      doc.setFont('helvetica','bold');
      doc.text('Ato de indisciplina: ', margL, y, {baseline:'top'});
      const atiW = doc.getTextWidth('Ato de indisciplina: ');
      doc.setFont('helvetica','normal');
      const motivoLines = doc.splitTextToSize(l.motivo || '—', largura - atiW);
      doc.text(motivoLines, margL + atiW, y); y += Math.max(motivoLines.length, 1) * 6 + 10;

      const corpo = 'Esperamos que tome as providências necessárias para que a irregularidade acima não se repita. Aproveitamos para esclarecer que a repetição ou prática de condutas semelhantes, previstas em nosso regulamento interno (como desobediência a ordens de serviço e normas operacionais), poderá resultar em penalidades mais severas, inclusive a demissão por justa causa, conforme previsto no Artigo 482 e suas alíneas da Consolidação das Leis do Trabalho.';
      const corpoLines = doc.splitTextToSize(corpo, largura);
      doc.text(corpoLines, margL, y); y += corpoLines.length * 6 + 10;
      doc.text('Atenciosamente,', margL, y); y += 20;

    } else {
      // ── CARTA DE SUSPENSÃO ──
      doc.setFontSize(14); doc.setFont('helvetica','bold');
      doc.text('CARTA DE SUSPENSÃO', 105, y, {align:'center'}); y += 14;

      doc.setFontSize(11); doc.setFont('helvetica','normal');
      const campos = [
        ['Nome do Funcionário:', l.colab_nome || '—'],
        ['CPF:', l.colab_cpf || '—'],
        ['Local de trabalho:', l.colab_local || l.cc_cod || '—'],
        ['Data:', fmt(l.data_documento)],
      ];
      campos.forEach(([lbl, val]) => {
        doc.setFont('helvetica','bold'); doc.text(lbl+' ', margL, y, {baseline:'top'});
        doc.setFont('helvetica','normal'); doc.text(val, margL + doc.getTextWidth(lbl+' '), y, {baseline:'top'});
        y += 8;
      });
      y += 4;
      doc.setFont('helvetica','bold');
      doc.text('ASSUNTO: SUSPENSÃO NO TRABALHO', margL, y); y += 10;

      doc.setFont('helvetica','normal');
      const ini  = fmt(l.data_inicio_susp);
      const ret  = fmt(l.data_retorno_susp);
      const dias = l.dias_suspensao || '?';
      const texto = `Pela presente fica V.Sa. suspenso das atividades laborais por ${dias} (dias) com início em ${ini} retornar as atividades no dia ${ret}, em razão das irregularidades em virtude de constantes faltas abaixo discriminadas.`;
      const textoLines = doc.splitTextToSize(texto, largura);
      doc.text(textoLines, margL, y); y += textoLines.length * 6 + 8;

      const motivoLines = doc.splitTextToSize(l.motivo || '—', largura);
      doc.text(motivoLines, margL, y); y += motivoLines.length * 6 + 8;

      doc.text('Lembramos que a reincidência deste comportamento poderá resultar em justa causa conforme artigo 482 da CLT.', margL, y, {maxWidth: largura}); y += 20;
    }

    // ── Assinaturas ──
    doc.setDrawColor(180);
    doc.line(margL, y, margL + 70, y);
    doc.text('WE CAN BR – TRABALHO TEMPORARIO LTDA', margL, y+5);
    y += 16;
    doc.line(margL, y, margL + 70, y);
    doc.text('Assinatura Colaborador:', margL, y+5); y += 16;
    doc.line(margL, y, margL + 70, y);
    doc.text('Testemunha:', margL, y+5);

    // Upload para Storage
    const pdfBlob  = doc.output('blob');
    const pdfBytes = await pdfBlob.arrayBuffer();
    const path     = `solicitacoes/${idSol}/documento_${Date.now()}.pdf`;

    const uploadUrl = `${SUPABASE_URL}/storage/v1/object/dossie/${path}`;
    const upResp = await fetch(uploadUrl, {
      method:'POST',
      headers:{'apikey':SUPABASE_ANON,'Authorization':`Bearer ${SUPABASE_ANON}`,'Content-Type':'application/pdf','x-upsert':'true'},
      body: pdfBytes
    });
    if (!upResp.ok) { const e = await upResp.json().catch(()=>({})); throw new Error(e.message || 'Erro no upload'); }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/dossie/${path}`;
    await rpc('wc_lider_atualizar_status', {
      p_id: idSol, p_status: 'em_andamento',
      p_pdf_path: publicUrl,
      p_obs_onsite: obs || null
    });

    // Abrir PDF gerado
    doc.output('dataurlnewwindow');
    showToast('PDF gerado e enviado ao líder!', 'success');
    fecharModal('modal-lider-proc');
    await liderCarregar();
  } catch(e) { showToast('Erro ao gerar PDF: ' + e.message, 'error'); }
}

async function liderConcluir(id) {
  if (!confirm('Confirmar que o documento foi assinado e o processo está concluído?')) return;
  try {
    await rpc('wc_lider_atualizar_status', { p_id: id, p_status: 'concluido' });
    showToast('Solicitação concluída!', 'success');
    await liderCarregar();
  } catch(e) { showToast('Erro: ' + e.message, 'error'); }
}

async function liderCancelar() {
  const id = document.getElementById('lid-proc-id').value;
  if (!confirm('Cancelar esta solicitação? O líder será notificado.')) return;
  try {
    await rpc('wc_lider_atualizar_status', { p_id: id, p_status: 'cancelado' });
    showToast('Solicitação cancelada.', 'success');
    fecharModal('modal-lider-proc');
    await liderCarregar();
  } catch(e) { showToast('Erro: ' + e.message, 'error'); }
}

function liderCadastrarLider() {
  // Abre o modal de gestão de usuários com o perfil pré-selecionado para "lider"
  abrirModalUsuario(null);
  setTimeout(() => {
    const sel = document.getElementById('u-perfil');
    if (sel) { sel.value = 'lider'; sel.dispatchEvent(new Event('change')); }
  }, 200);
}
let ONB_FILA   = [];
let ONB_ESCALA = [];

async function onbCarregar() {
  const admin = temPermissao('adp_onboarding');
  document.getElementById('onb-fila-card').style.display = admin ? 'block' : 'none';
  document.getElementById('onb-nova-data-card').style.display = admin ? 'block' : 'none';

  if (admin && !USUARIOS_LISTA.length) {
    try { await rpc('wc_listar_usuarios', {}).then(r => USUARIOS_LISTA = r.usuarios || []); } catch(e) {}
  }

  try {
    const [rFila, rEscala] = await Promise.all([
      rpc('wc_onboarding_fila_listar', {}),
      rpc('wc_onboarding_escala_listar', {})
    ]);
    ONB_FILA   = rFila.itens || [];
    ONB_ESCALA = rEscala.itens || [];
    if (admin) { onbPopularSelects(); onbFilaRenderLista(); }
    onbRenderEscalaTabela();
  } catch(e) { showToast('Erro ao carregar onboarding: ' + e.message, 'error'); }
}

function onbOnsitesAtivos() {
  return USUARIOS_LISTA.filter(u => u.perfil === 'onsite' && u.ativo !== false);
}

function onbPopularSelects() {
  const naFila = new Set(ONB_FILA.map(f => f.onsite_nome));
  const disponiveis = onbOnsitesAtivos().filter(u => !naFila.has(u.nome));
  const selAdd = document.getElementById('onb-fila-add-select');
  selAdd.innerHTML = disponiveis.length
    ? disponiveis.map(u => `<option value="${u.nome}">${u.nome}</option>`).join('')
    : '<option value="">Todos já estão na fila</option>';

  const selNova = document.getElementById('onb-nova-onsite');
  const todos = onbOnsitesAtivos();
  selNova.innerHTML = '<option value="">Selecione…</option>' +
    todos.map(u => `<option value="${u.nome}">${u.nome}</option>`).join('');
}

function onbFilaAdicionar() {
  const sel = document.getElementById('onb-fila-add-select');
  const nome = sel.value;
  if (!nome) return;
  ONB_FILA.push({ onsite_nome: nome, ordem: ONB_FILA.length, ativo: true });
  onbPopularSelects();
  onbFilaRenderLista();
}

function onbFilaRenderLista() {
  const wrap = document.getElementById('onb-fila-lista');
  if (!ONB_FILA.length) { wrap.innerHTML = '<div style="font-size:12px;color:var(--muted)">Nenhum Onsite na fila ainda.</div>'; return; }
  wrap.innerHTML = ONB_FILA.map((f, i) => `
    <div style="display:flex;align-items:center;gap:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 12px">
      <span style="font-size:11px;color:var(--muted);width:22px">#${i+1}</span>
      <span style="flex:1;font-size:13px;font-weight:600;${f.ativo===false?'opacity:.5':''}">${f.onsite_nome}</span>
      <label style="display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);cursor:pointer">
        <input type="checkbox" ${f.ativo!==false?'checked':''} onchange="onbFilaToggleAtivo(${i}, this.checked)"/> Ativo
      </label>
      <button class="btn btn-ghost btn-sm" onclick="onbFilaMover(${i},-1)" ${i===0?'disabled':''} style="padding:2px 8px">↑</button>
      <button class="btn btn-ghost btn-sm" onclick="onbFilaMover(${i},1)" ${i===ONB_FILA.length-1?'disabled':''} style="padding:2px 8px">↓</button>
      <button class="btn btn-ghost btn-sm" onclick="onbFilaRemover(${i})" style="padding:2px 8px;color:var(--danger)">✕</button>
    </div>`).join('');
}
function onbFilaToggleAtivo(i, ativo) { ONB_FILA[i].ativo = ativo; }
function onbFilaMover(i, dir) {
  const j = i + dir;
  if (j < 0 || j >= ONB_FILA.length) return;
  [ONB_FILA[i], ONB_FILA[j]] = [ONB_FILA[j], ONB_FILA[i]];
  onbFilaRenderLista();
}
function onbFilaRemover(i) {
  ONB_FILA.splice(i, 1);
  onbPopularSelects();
  onbFilaRenderLista();
}
async function onbFilaSalvar() {
  try {
    await rpc('wc_onboarding_fila_salvar', { p_itens: ONB_FILA.map(f => ({ onsite_nome: f.onsite_nome, ativo: f.ativo !== false })) });
    showToast('Fila salva!', 'success');
    await onbCarregar();
  } catch(e) { showToast('Erro: ' + e.message, 'error'); }
}

async function onbNovaData() {
  const dataIso = document.getElementById('onb-nova-data').value;
  const onsite  = document.getElementById('onb-nova-onsite').value;
  if (!dataIso || !onsite) { showToast('Preencha a data e o Onsite responsável.', 'error'); return; }
  const dataBR = integNormalizarData(dataIso);
  try {
    await rpc('wc_onboarding_escala_definir', { p_data: dataBR, p_onsite_nome: onsite });
    showToast('Data agendada!', 'success');
    document.getElementById('onb-nova-data').value = '';
    document.getElementById('onb-nova-onsite').value = '';
    await onbCarregar();
  } catch(e) { showToast('Erro: ' + e.message, 'error'); }
}

function onbRenderEscalaTabela() {
  const tbody = document.getElementById('onb-escala-tbody');
  if (!ONB_ESCALA.length) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;padding:32px;color:var(--muted)">Nenhuma data agendada ainda.</td></tr>';
    return;
  }
  const statusPill = st => ({
    agendado:   `<span style="background:rgba(245,158,11,.15);color:var(--warning);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">⏳ Agendado</span>`,
    confirmado: `<span style="background:rgba(34,197,94,.15);color:var(--success);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">✅ Confirmado</span>`,
    recusado:   `<span style="background:rgba(239,68,68,.12);color:var(--danger);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">🚫 Recusado</span>`,
    realizado:  `<span style="background:rgba(99,204,176,.15);color:var(--accent);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">🏁 Realizado</span>`,
    sem_onsite: `<span style="background:rgba(239,68,68,.15);color:var(--danger);font-size:10px;font-weight:700;padding:2px 8px;border-radius:20px">⚠ Sem Onsite disponível</span>`,
  }[st] || st);

  tbody.innerHTML = ONB_ESCALA.map(e => {
    const podeAgir = e.status === 'agendado' && (temPermissao('adp_onboarding') || session?.nome === e.onsite_atual);
    const hist = (e.historico || []).length
      ? `<div style="font-size:11px;color:var(--muted)">${e.historico.map(h => `${h.onsite}: "${h.motivo}"`).join(' · ')}</div>`
      : '<span style="color:var(--muted);font-size:11px">—</span>';
    return `<tr>
      <td style="white-space:nowrap">${e.data_integracao}</td>
      <td><strong>${e.onsite_atual}</strong></td>
      <td>${statusPill(e.status)}</td>
      <td>${hist}</td>
      <td>
        ${podeAgir ? `
          <div style="display:flex;gap:6px">
            <button class="btn btn-primary btn-sm" onclick="onbConfirmar('${e.id}')">✅ Confirmar</button>
            <button class="btn btn-ghost btn-sm" style="color:var(--danger)" onclick="onbAbrirRecusar('${e.id}','${(e.onsite_atual||'').replace(/'/g,"\\'")}')">🚫 Recusar</button>
          </div>` : '<span style="color:var(--muted);font-size:11px">—</span>'}
      </td>
    </tr>`;
  }).join('');
}

async function onbConfirmar(id) {
  try {
    await rpc('wc_onboarding_confirmar', { p_id: id });
    showToast('Confirmado!', 'success');
    await onbCarregar();
  } catch(e) { showToast('Erro: ' + e.message, 'error'); }
}

function onbAbrirRecusar(id, nome) {
  document.getElementById('onb-recusar-id').value = id;
  document.getElementById('onb-recusar-sub').textContent = `Onsite atual: ${nome}`;
  document.getElementById('onb-recusar-motivo').value = '';
  abrirModal('modal-onb-recusar');
}

async function onbConfirmarRecusa() {
  const id     = document.getElementById('onb-recusar-id').value;
  const motivo = document.getElementById('onb-recusar-motivo').value.trim();
  if (!motivo) { showToast('Informe a justificativa.', 'error'); return; }
  try {
    const r = await rpc('wc_onboarding_recusar', { p_id: id, p_justificativa: motivo });
    fecharModal('modal-onb-recusar');
    showToast(r.novo_onsite ? `Passado para ${r.novo_onsite}.` : 'Recusado — nenhum Onsite disponível na fila.', r.novo_onsite ? 'success' : 'error');
    await onbCarregar();
  } catch(e) { showToast('Erro: ' + e.message, 'error'); }
}

function toggleSidebar() {
  const sb = document.getElementById('sidebar');
  const collapsed = sb.classList.toggle('sb-col');
  document.body.classList.toggle('sb-collapsed', collapsed);
  try { localStorage.setItem('wecan_sb_col', collapsed ? '1' : '0'); } catch(e) {}
}
function restaurarSidebar() {
  try {
    if (localStorage.getItem('wecan_sb_col') === '1') {
      document.getElementById('sidebar')?.classList.add('sb-col');
      document.body.classList.add('sb-collapsed');
    }
  } catch(e) {}
}

function toggleSidebarMobile() {
  const sb  = document.getElementById('sidebar');
  const ov  = document.getElementById('sidebar-overlay');
  const open = sb.classList.toggle('open');
  ov.classList.toggle('visible', open);
}
function fecharSidebarMobile() {
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('sidebar-overlay')?.classList.remove('visible');
}


// ── Stubs RS não usados no ADP ──
async function carregarVagas() {}
async function carregarFilaVoucher() {}
async function carregarIndicacoes() {}
function popularFiltroConsultor() {}
function popularFiltroCC() {}
function carregarPreferenciaColunas() {}
function cpCarregarTodas() {}

initApp();

// ════════════════════════════════════════════════════════════
