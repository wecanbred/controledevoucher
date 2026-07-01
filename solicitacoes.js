// ════════════════ SOLICITAÇÕES ════════════════
function solAbrirPainel() {
  const tok    = session?.token  || '';
  const perfil = session?.perfil || '';
  const nome   = encodeURIComponent(session?.nome || '');
  const url    = `solicitacoes.html?tok=${tok}&perfil=${perfil}&nome=${nome}`;
  window.open(url, 'sol_painel', 'width=1100,height=820,scrollbars=yes,resizable=yes,toolbar=no,menubar=no');
}

function solAbrirForm(colab) {
  try { sessionStorage.setItem('sol_colab_data', JSON.stringify(colab)); } catch(e) {}
  const tok    = session?.token  || '';
  const perfil = session?.perfil || '';
  const nome   = encodeURIComponent(session?.nome || '');
  // Compartilhar URL do Apps Script via sessionStorage
  try { sessionStorage.setItem('wecan_colabs_webapp_url', localStorage.getItem('wecan_colabs_webapp_url')||''); } catch(e) {}
  const url    = `solicitacoes.html?modo=form&via=template&tok=${tok}&perfil=${perfil}&nome=${nome}`;
  const win    = window.open(url, 'sol_form', 'width=920,height=860,scrollbars=yes,resizable=yes,toolbar=no,menubar=no');
  if (win) {
    const t = setInterval(()=>{try{win.postMessage({tipo:'sol_colab',colab,session},'*');clearInterval(t);}catch(e){}},400);
    setTimeout(()=>clearInterval(t),5000);
  }
}

let _solResumoLoaded = false;
async function solResumoCarregar() {
  const area = document.getElementById('sol-resumo-area');
  if (!area) return;
  area.innerHTML = '<div class="tkt-loading">Carregando…</div>';
  try {
    const tok  = session?.token || '';
    const body = { p_token: tok };
    if (session?.perfil === 'onsite') body.p_onsite_nome = session.nome;
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wc_listar_solicitacoes`, {
      method:'POST', headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON,'Authorization':`Bearer ${SUPABASE_ANON}`},
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (data?.ok === false) throw new Error(data.erro || 'Erro');
    const lista = data.solicitacoes || [];
    _solResumoLoaded = true;

    const pendentes   = lista.filter(s => s.status === 'pendente');
    const andamento   = lista.filter(s => s.status === 'em_andamento');
    const concluidas  = lista.filter(s => s.status === 'concluido');

    const TIPO_ICO = { AC:'🪪', TB:'🔄', TH:'🕐', RB:'💰', TLT:'📍' };
    const cardRow = (s) => {
      const dt = s.created_at ? new Date(s.created_at).toLocaleDateString('pt-BR') : '—';
      return `<tr>
        <td style="font-weight:700;font-size:12px;color:var(--accent)">${s.matricula||'—'}</td>
        <td style="font-size:12.5px;font-weight:600">${s.nome||'—'}</td>
        <td style="font-size:11px">${TIPO_ICO[s.tipo]||''} ${s.tipo_label||s.tipo||'—'}</td>
        <td style="font-size:11px;color:var(--muted)">${s.onsite||'—'}</td>
        <td style="font-size:11px;color:var(--muted)">${dt}</td>
      </tr>`;
    };
    const tabela = (titulo, cor, items) => !items.length ? '' : `
      <div style="margin-bottom:20px">
        <div style="font-size:11px;font-weight:800;color:${cor};text-transform:uppercase;letter-spacing:.6px;margin-bottom:8px">${titulo} (${items.length})</div>
        <div class="table-wrap"><table class="main-table">
          <thead><tr><th>Matrícula</th><th>Nome</th><th>Tipo</th><th>Onsite</th><th>Data</th></tr></thead>
          <tbody>${items.slice(0,10).map(cardRow).join('')}</tbody>
        </table></div>
        ${items.length>10?`<p style="font-size:11px;color:var(--muted);margin-top:6px">Mostrando 10 de ${items.length} — <a href="#" onclick="solAbrirPainel()" style="color:var(--accent)">ver todas no painel</a></p>`:''}
      </div>`;

    const devolvidas = lista.filter(s => s.status === 'devolvida');
    const bannerDevol = devolvidas.length > 0 && (session?.perfil === 'onsite' || session?.perfil === 'folha')
      ? `<div style="background:rgba(168,85,247,.1);border:1px solid rgba(168,85,247,.4);border-radius:10px;
           padding:12px 18px;margin-bottom:16px;display:flex;align-items:center;gap:12px;cursor:pointer"
           onclick="solAbrirPainel()">
          <span style="font-size:22px">↩️</span>
          <div>
            <div style="font-weight:700;color:#a855f7">
              ${devolvidas.length} solicitação(ões) devolvida(s) para correção
            </div>
            <div style="font-size:11px;color:var(--muted);margin-top:2px">
              Clique para abrir o painel e corrigir
            </div>
          </div>
          <span style="margin-left:auto;color:#a855f7;font-size:18px">›</span>
        </div>` : '';

    area.innerHTML = `
      ${bannerDevol}
      <div style="display:grid;grid-template-columns:repeat(${devolvidas.length>0?4:3},1fr);gap:12px;margin-bottom:24px">
        ${homePainelCard('🕐','Pendentes',pendentes.length,'Aguardando atendimento','#f59e0b','sol-resumo')}
        ${homePainelCard('⚙️','Em Andamento',andamento.length,'Em atendimento','#4f7cff','sol-resumo')}
        ${devolvidas.length>0?homePainelCard('↩️','Devolvidas',devolvidas.length,'Aguardando correção','#a855f7','sol-resumo'):''}
        ${homePainelCard('✅','Concluídas',concluidas.length,'Resolvidas','#22c55e','sol-resumo')}
      </div>
      ${tabela('🕐 Pendentes','var(--warning)',pendentes)}
      ${tabela('⚙️ Em Andamento','#4f7cff',andamento)}
      ${tabela('✅ Concluídas Recentes','var(--success)',concluidas.slice(0,5))}
      ${!lista.length?'<div class="empty-state"><div class="empty-ico">📨</div><p>Nenhuma solicitação encontrada</p></div>':''}`;
  } catch(e) {
    if (area) area.innerHTML = `<div style="padding:24px;color:var(--danger)">❌ ${e.message}</div>`;
  }
}

window.addEventListener('message', ev => {
  if (ev.data?.tipo === 'sol_enviada') {
    toast('✅ Solicitação enviada!', 'success');
    if (_solResumoLoaded) solResumoCarregar();
  }
});
function solIniciar() {
  if (!_colabAtual) return;
  solAbrirForm(_colabAtual);
  fecharModal('modal-colab');
}
// ── Verificar notificações de solicitações devolvidas ────────
let _solNotifTimer = null;

async function solVerificarNotificacoes() {
  if (!session?.token) return;
  if (!temPermissao('adp_sol_ver')) return;
  try {
    const body = { p_token: session.token };
    // Onsite só vê as suas; outros veem tudo
    if (session.perfil === 'onsite' || session.perfil === 'folha') {
      body.p_onsite_nome = session.nome;
      body.p_status = 'devolvida';
    } else {
      body.p_status = 'pendente'; // Analistas veem pendentes como alerta
    }
    const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/wc_listar_solicitacoes`, {
      method:'POST',
      headers:{'Content-Type':'application/json','apikey':SUPABASE_ANON,'Authorization':`Bearer ${SUPABASE_ANON}`},
      body: JSON.stringify(body)
    });
    const data = await resp.json();
    if (data?.ok === false) return;
    const lista = data.solicitacoes || [];
    solAtualizarBadge(lista.length);
  } catch(e) {}
}

function solAtualizarBadge(count) {
  const badge = document.getElementById('sol-badge-notif');
  if (!badge) return;
  if (count > 0) {
    badge.textContent = count > 99 ? '99+' : count;
    badge.style.display = 'inline-block';
  } else {
    badge.style.display = 'none';
  }
}

function solIniciarPolling() {
  // Verificar imediatamente e depois a cada 2 minutos
  solVerificarNotificacoes();
  _solNotifTimer = setInterval(solVerificarNotificacoes, 2 * 60 * 1000);
}

function solPararPolling() {
  if (_solNotifTimer) { clearInterval(_solNotifTimer); _solNotifTimer = null; }
}

// Zerar badge ao abrir a tela de solicitações
const _solResumoCarregarOrig = solResumoCarregar;
solResumoCarregar = async function() {
  solAtualizarBadge(0); // limpar badge ao abrir
  return _solResumoCarregarOrig();
};

// ════════════════ FIM SOLICITAÇÕES ════════════════
