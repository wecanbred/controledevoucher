// ════════════════ CONFIGURAÇÕES GLOBAIS ════════════════
async function configCarregarGlobal() {
  try {
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wc_get_config`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey':SUPABASE_ANON, 'Authorization':`Bearer ${SUPABASE_ANON}` },
      body: JSON.stringify({ p_chave: 'colabs_webapp_url' })
    });
    const url = await resp.json();
    if (url) {
      // Salvar no localStorage para uso imediato
      try { localStorage.setItem('wecan_colabs_webapp_url', url); } catch(e) {}
    }
  } catch(e) {}
}

// Salvar configuração global no banco (chamado ao salvar URL nas configurações)
async function configSalvarGlobal(chave, valor) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/rpc/wc_set_config`, {
      method: 'POST',
      headers: { 'Content-Type':'application/json', 'apikey':SUPABASE_ANON, 'Authorization':`Bearer ${SUPABASE_ANON}` },
      body: JSON.stringify({ p_token: session?.token||'', p_chave: chave, p_valor: valor })
    });
  } catch(e) {}
}
// ════════════════ FIM CONFIGURAÇÕES GLOBAIS ════════════════

// ════════════════ SINO DE NOTIFICAÇÕES ════════════════
let _notifLista = [];
let _notifLidas = new Set(JSON.parse(localStorage.getItem('wecan_notif_lidas')||'[]'));

function notifToggle() {
  const dd = document.getElementById('notif-dropdown');
  if (!dd) return;
  dd.classList.toggle('open');
  if (dd.classList.contains('open')) notifRenderDropdown();
  // Fechar ao clicar fora
  if (dd.classList.contains('open')) {
    setTimeout(() => document.addEventListener('click', notifFecharFora, {once:true}), 10);
  }
}

function notifFecharFora(e) {
  const wrap = document.getElementById('notif-wrap');
  if (wrap && !wrap.contains(e.target)) {
    document.getElementById('notif-dropdown')?.classList.remove('open');
  }
}

function notifRenderDropdown() {
  const body = document.getElementById('notif-drop-body');
  if (!body) return;
  if (!_notifLista.length) {
    body.innerHTML = '<div class="notif-empty">✅ Tudo em dia!</div>';
    return;
  }
  body.innerHTML = _notifLista.map(n => `
    <div class="notif-item" onclick="notifClicar('${n.id}','${n.pagina||'sol-resumo'}')"
      style="${_notifLidas.has(n.id)?'opacity:.6':''}">
      <div class="notif-item-title">${n.ico} ${n.titulo}</div>
      <div class="notif-item-sub">${n.sub}</div>
    </div>`).join('');
}

function notifClicar(id, pagina) {
  _notifLidas.add(id);
  try { localStorage.setItem('wecan_notif_lidas', JSON.stringify([..._notifLidas])); } catch(e) {}
  document.getElementById('notif-dropdown')?.classList.remove('open');
  notifAtualizarBadge();
  navTo(pagina);
}

function notifMarcarLidas() {
  _notifLista.forEach(n => _notifLidas.add(n.id));
  try { localStorage.setItem('wecan_notif_lidas', JSON.stringify([..._notifLidas])); } catch(e) {}
  notifAtualizarBadge();
  notifRenderDropdown();
}

function notifAtualizarBadge() {
  const naoLidas = _notifLista.filter(n => !_notifLidas.has(n.id)).length;
  const countEl  = document.getElementById('notif-count');
  const badgeSol = document.getElementById('sol-badge-notif');
  if (countEl) {
    countEl.textContent = naoLidas > 99 ? '99+' : naoLidas;
    countEl.style.display = naoLidas > 0 ? 'inline-block' : 'none';
  }
  // Sincronizar com badge da sidebar
  if (badgeSol) {
    const devol = _notifLista.filter(n => n.tipo === 'devolvida' && !_notifLidas.has(n.id)).length;
    badgeSol.textContent = devol;
    badgeSol.style.display = devol > 0 ? 'inline-block' : 'none';
  }
}

async function notifVerificar() {
  if (!session?.token) return;
  let notifSol = [];
  let notifPrazo = [];

  // ── Solicitações ──
  if (temPermissao('adp_sol_ver')) {
    try {
      const body = { p_token: session.token };
      if (session.perfil === 'onsite') {
        body.p_onsite_nome = session.nome;
        body.p_status = 'devolvida';
      } else {
        body.p_status = 'pendente';
      }
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wc_listar_solicitacoes`, {
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON,'Authorization':`Bearer ${SUPABASE_ANON}`},
        body: JSON.stringify(body)
      });
      const data = await resp.json();
      if (data?.ok !== false) {
        const lista = data.solicitacoes || [];
        if (session.perfil === 'onsite') {
          notifSol = lista.map(s => ({
            id:`devol-${s.id}`, tipo:'devolvida', ico:'↩️',
            titulo:`Solicitação devolvida — ${s.tipo_label}`,
            sub:`${s.nome} · ${s.motivo_devolucao?.slice(0,50)||'Veja os detalhes'}`,
            pagina:'sol-resumo',
          }));
        } else {
          notifSol = lista.map(s => ({
            id:`pend-${s.id}`, tipo:'pendente', ico:'🕐',
            titulo:`Nova solicitação — ${s.tipo_label}`,
            sub:`${s.nome} · ${s.onsite||''}`,
            pagina:'sol-resumo',
          }));
        }
      }
    } catch(e) {}
  }

  // ── Prazos de Gestão de Benefícios (vencendo / atrasado) ──
  if (temPermissao('adp_beneficios')) {
    try {
      if (!INTEG_COLMEIAS?.length) await integCarregarColmeias();
      const colmeias = integFiltrarPorOnsite(INTEG_COLMEIAS || []);
      const datas = [...new Set(colmeias.map(c => c.data_admissao))];
      datas.forEach(data => {
        const colsDt = colmeias.filter(c => c.data_admissao === data);
        const pend = colsDt.reduce((s,c)=>s+Number(c.pendentes),0);
        if (pend === 0) return;
        const st = integPiorStatusPrazo(colsDt);
        if (st && ['atrasado','vence_hoje','vence_amanha'].includes(st.status)) {
          let label = data;
          if (data.includes('/')) { const p=data.split('/'); label=p[0]+'/'+p[1]+'/'+p[2]; }
          notifPrazo.push({
            id: `prazo-${data}`,
            tipo: 'prazo',
            ico: st.status==='atrasado' ? '🔴' : st.status==='vence_hoje' ? '⏰' : '🟡',
            titulo: `Benefícios — ${label}`,
            sub: `${pend} pendente(s) · ${st.status==='atrasado'?`atrasado ${Math.abs(st.dias)}d`:st.status==='vence_hoje'?'vence hoje':'vence amanhã'}`,
            pagina: 'integracao',
          });
        }
      });
    } catch(e) {}
  }

  _notifLista = [...notifPrazo, ...notifSol]; // prazo primeiro (mais urgente)
  notifAtualizarBadge();
}

// Substituir polling antigo pelo novo
function solIniciarPolling() {
  notifVerificar();
  setInterval(notifVerificar, 2 * 60 * 1000);
}
// ── Modal de boas-vindas ──────────────────────────────────────
async function exibirBoasVindas() {
  const temSol   = temPermissao('adp_sol_ver');
  const temBen   = temPermissao('adp_beneficios');
  const temResc  = temPermissao('adp_rescisao');
  const temTkt   = temPermissao('adp_tickets_deslig') || temPermissao('adp_tickets_movim') || temPermissao('adp_tickets_voucher');
  const temVchr  = temPermissao('rs_voucher');
  if (!temSol && !temBen && !temResc && !temTkt && !temVchr) return;
  const modal = document.getElementById('modal-boasvindas');
  if (!modal) return;

  // Título personalizado
  const nome1 = session?.nome?.split(' ')?.[0] || '';
  document.getElementById('bv-titulo').textContent = `👋 Olá, ${nome1}!`;
  modal.style.display = 'flex';

  const body = document.getElementById('bv-body');
  try {
    let pendentes = [], devolvidas = [], andamento = [];

    if (temSol) {
      const bodyReq = { p_token: session.token };
      if (session.perfil === 'onsite') bodyReq.p_onsite_nome = session.nome;
      const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wc_listar_solicitacoes`, {
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON,'Authorization':`Bearer ${SUPABASE_ANON}`},
        body: JSON.stringify(bodyReq)
      });
      const data = await resp.json();
      const lista = data.solicitacoes || [];
      pendentes  = lista.filter(s => s.status === 'pendente');
      devolvidas = lista.filter(s => s.status === 'devolvida');
      andamento  = lista.filter(s => s.status === 'em_andamento');
    }

    // ── Benefícios pendentes de confirmação ──
    let lotesBenef = [];
    if (temBen) {
      if (!INTEG_COLMEIAS?.length) { try { await integCarregarColmeias(); } catch(e) {} }
      const colmeias = integFiltrarPorOnsite(INTEG_COLMEIAS || []);
      const datas = [...new Set(colmeias.map(c => c.data_admissao))];
      datas.forEach(data => {
        const colsDt = colmeias.filter(c => c.data_admissao === data);
        const pend = colsDt.reduce((s,c)=>s+Number(c.pendentes),0);
        if (pend === 0) return;
        const st = integStatusPrazo(colsDt[0]);
        lotesBenef.push({
          data, pend,
          prazoLabel: colsDt[0]?.prazo ? integFormatarDataBR(colsDt[0].prazo) : '—',
          status: st.status, cor: st.cor, ico: st.ico,
        });
      });
      const ordem = { atrasado:0, vence_hoje:1, vence_amanha:2, proximo:3, ok:4, sem_prazo:5 };
      lotesBenef.sort((a,b) => (ordem[a.status]??9) - (ordem[b.status]??9));
    }

    // ── Rescisões pendentes/em andamento ──
    let rescPendentes = [];
    if (temResc) {
      try {
        const bodyResc = { p_token: session.token };
        const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wc_listar_rescisoes`, {
          method:'POST',
          headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON,'Authorization':`Bearer ${SUPABASE_ANON}`},
          body: JSON.stringify(bodyResc)
        });
        const data = await resp.json();
        const lista = data.rescisoes || [];
        // Onsite vê só as próprias; analista/gestor vê todas pendentes/andamento
        const minhas = session.perfil === 'onsite'
          ? lista.filter(r => r.onsite_nome === session.nome)
          : lista;
        rescPendentes = minhas.filter(r => ['pendente','em_andamento'].includes(r.status));
      } catch(e) {}
    }

    // ── Tickets Shopee pendentes (só conta o que já estiver em memória, sem forçar carga pesada) ──
    let tktPendentes = 0;
    if (temTkt) {
      try {
        tktPendentes = Object.values(TKT_NOTAS||{}).filter(n => n.status === 'pendente').length;
      } catch(e) {}
    }

    // ── Fila de Voucher pendente ──
    let vchrPendente = 0;
    if (temVchr) {
      try {
        const r = await rpc('wc_home_resumo', {});
        vchrPendente = r?.voucher_pendente || 0;
      } catch(e) {}
    }

    const TIPO_ICO = { AC:'🪪', TB:'🔄', TH:'🕐', RB:'💰', TLT:'📍' };

    const secao = (titulo, cor, ico, items) => !items.length ? '' : `
      <div style="margin-bottom:16px">
        <div style="font-size:10px;font-weight:800;color:${cor};text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">
          ${ico} ${titulo} (${items.length})
        </div>
        ${items.slice(0,5).map(s=>`
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;
            padding:8px 12px;margin-bottom:6px;cursor:pointer;border-left:3px solid ${cor}"
            onclick="fecharBoasVindas();navTo('sol-resumo')">
            <div style="font-size:12.5px;font-weight:700">${s.nome||'—'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">
              ${TIPO_ICO[s.tipo]||''} ${s.tipo_label||s.tipo||'—'}
              ${s.motivo_devolucao?`· <span style="color:${cor}">${s.motivo_devolucao.slice(0,50)}</span>`:''}
            </div>
          </div>`).join('')}
        ${items.length>5?`<div style="font-size:11px;color:var(--muted);text-align:center">+${items.length-5} mais</div>`:''}
      </div>`;

    const secaoBeneficios = !lotesBenef.length ? '' : `
      <div style="margin-bottom:16px">
        <div style="font-size:10px;font-weight:800;color:var(--warning);text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">
          🐝 Programação de Benefícios (${lotesBenef.reduce((s,l)=>s+l.pend,0)} confirmações)
        </div>
        ${lotesBenef.slice(0,5).map(l=>`
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;
            padding:8px 12px;margin-bottom:6px;cursor:pointer;border-left:3px solid ${l.cor}"
            onclick="fecharBoasVindas();navTo('integracao')">
            <div style="font-size:12.5px;font-weight:700">
              ${l.ico} Admissão ${integFormatarDataBR(l.data)} — ${l.pend} pendente(s)
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">
              Prazo para confirmação: <span style="color:${l.cor};font-weight:600">${l.prazoLabel}</span>
            </div>
          </div>`).join('')}
        ${lotesBenef.length>5?`<div style="font-size:11px;color:var(--muted);text-align:center">+${lotesBenef.length-5} mais</div>`:''}
      </div>`;

    const secaoRescisoes = !rescPendentes.length ? '' : `
      <div style="margin-bottom:16px">
        <div style="font-size:10px;font-weight:800;color:#ef4444;text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">
          📋 Rescisões (${rescPendentes.length})
        </div>
        ${rescPendentes.slice(0,5).map(r=>`
          <div style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;
            padding:8px 12px;margin-bottom:6px;cursor:pointer;border-left:3px solid #ef4444"
            onclick="fecharBoasVindas();rescAbrirPainel()">
            <div style="font-size:12.5px;font-weight:700">${r.nome||'—'}</div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">
              ${r.status==='em_andamento'?'⚙️ Em andamento':'🕐 Aguardando cálculo'} · ${r.matricula||''}
            </div>
          </div>`).join('')}
        ${rescPendentes.length>5?`<div style="font-size:11px;color:var(--muted);text-align:center">+${rescPendentes.length-5} mais</div>`:''}
      </div>`;

    const secaoTickets = !tktPendentes ? '' : `
      <div style="margin-bottom:16px">
        <div onclick="fecharBoasVindas();navTo('tickets-todos')"
          style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;
          padding:10px 12px;cursor:pointer;border-left:3px solid #f59e0b;display:flex;align-items:center;gap:10px">
          <span style="font-size:18px">🎫</span>
          <div>
            <div style="font-size:12.5px;font-weight:700;color:#f59e0b">Tickets Shopee — ${tktPendentes} pendente(s)</div>
            <div style="font-size:11px;color:var(--muted)">Notas internas aguardando resolução</div>
          </div>
        </div>
      </div>`;

    const secaoVoucher = !vchrPendente ? '' : `
      <div style="margin-bottom:16px">
        <div onclick="fecharBoasVindas();navTo('voucher')"
          style="background:var(--surface2);border:1px solid var(--border);border-radius:8px;
          padding:10px 12px;cursor:pointer;border-left:3px solid #4f7cff;display:flex;align-items:center;gap:10px">
          <span style="font-size:18px">⇄</span>
          <div>
            <div style="font-size:12.5px;font-weight:700;color:#4f7cff">Fila de Voucher — ${vchrPendente} pendente(s)</div>
            <div style="font-size:11px;color:var(--muted)">Aguardando aprovação</div>
          </div>
        </div>
      </div>`;

    const ehOnsite = session?.perfil === 'onsite';

    const totalAlerta = devolvidas.length + lotesBenef.reduce((s,l)=>s+l.pend,0)
      + rescPendentes.length + tktPendentes + vchrPendente
      + (ehOnsite ? 0 : pendentes.length + andamento.length);

    // Nada para alertar — fechar silenciosamente
    if (totalAlerta === 0) { fecharBoasVindas(); return; }

    body.innerHTML = secaoBeneficios
      + secaoRescisoes
      + secaoVoucher
      + secaoTickets
      + secao('Devolvidas para correção','#a855f7','↩️', devolvidas)
      + (ehOnsite ? '' : secao('Pendentes','var(--warning)','🕐', pendentes))
      + (ehOnsite ? '' : secao('Em Andamento','#4f7cff','⚙️', andamento));

    document.getElementById('bv-sub').textContent =
      `Você tem ${totalAlerta} pendência(s) aguardando atenção`;

  } catch(e) {
    body.innerHTML = `<div style="text-align:center;padding:24px;color:var(--muted)">Não foi possível carregar as pendências</div>`;
  }
}

function fecharBoasVindas() {
  const modal = document.getElementById('modal-boasvindas');
  if (modal) modal.style.display = 'none';
}
// ════════════════ FIM SINO ════════════════
