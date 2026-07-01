// ════════════════════════════════════════════════════════════════
// MÓDULO — SINCRONIZAR TEMPLATE BASE (Banco → Google Sheets)
// ════════════════════════════════════════════════════════════════

// Renderiza botão de sync nas páginas de ativos/inativos conforme permissão
function syncRenderBotoes() {
  const podeSync = temPermissao('adp_sync') ||
    ['folha','gestor_adm','master'].includes(session?.perfil);
  if (!podeSync) return;

  ['ativos','inativos'].forEach(tipo => {
    const wrap = document.getElementById(`btn-sync-${tipo}-wrap`);
    if (!wrap) return;
    wrap.innerHTML = `<button class="btn btn-primary btn-sm" onclick="syncAbrirModal('${tipo}')">📤 Sincronizar planilha</button>`;
  });
}

// Verifica se é horário crítico (ter/qui/sex à tarde = após 12h)
function syncHorarioCritico() {
  const agora = new Date();
  const dia   = agora.getDay(); // 0=dom,2=ter,4=qui,5=sex
  const hora  = agora.getHours();
  return [2, 4, 5].includes(dia) && hora >= 12;
}

function syncAbrirModal(tipoInicial) {
  const el = document.getElementById('modal-sync-template');
  if (!el) return;

  // Aviso de horário
  const avisoEl = document.getElementById('sync-aviso-horario');
  if (avisoEl) avisoEl.style.display = syncHorarioCritico() ? 'block' : 'none';

  // Marcar checkbox do tipo que originou o clique
  const cbAtivos   = document.getElementById('sync-cb-ativos');
  const cbInativos = document.getElementById('sync-cb-inativos');
  if (cbAtivos)   cbAtivos.checked   = tipoInicial === 'ativos'   || tipoInicial === 'ambos';
  if (cbInativos) cbInativos.checked = tipoInicial === 'inativos' || tipoInicial === 'ambos';

  // Limpar status
  const statusEl = document.getElementById('sync-status');
  if (statusEl) statusEl.style.display = 'none';

  el.style.display = 'flex';
}

function syncFecharModal() {
  const el = document.getElementById('modal-sync-template');
  if (el) el.style.display = 'none';
}

async function syncExecutar() {
  const url = colabsWebAppUrl();
  if (!url) {
    toast('⚠️ Configure a URL do Apps Script em Configurações > Template Base.', 'warning');
    return;
  }

  const cbAtivos   = document.getElementById('sync-cb-ativos');
  const cbInativos = document.getElementById('sync-cb-inativos');
  const trintidio  = (document.getElementById('sync-trintidio')?.value || '').trim();
  const sincAtivos   = cbAtivos?.checked;
  const sincInativos = cbInativos?.checked;

  if (!sincAtivos && !sincInativos) {
    toast('Selecione pelo menos uma aba para sincronizar.', 'warning');
    return;
  }

  const btnEl    = document.getElementById('btn-sync-executar');
  const statusEl = document.getElementById('sync-status');
  btnEl.disabled = true;
  btnEl.textContent = '⏳ Sincronizando…';
  statusEl.style.display = 'block';
  statusEl.style.color   = 'var(--muted)';
  statusEl.textContent   = 'Buscando dados do banco…';

  let qtdAtivos = null, qtdInativos = null;
  try {
    // ── 1. Buscar dados do banco via RPCs ──────────────────────────
    if (sincAtivos) {
      statusEl.textContent = '⬇️ Exportando colaboradores ativos…';
      const resAtivos = await rpc('wc_template_ativos_export', { p_token: session.token });
      let linhasAtivos = resAtivos.linhas || [];

      // Sobrescrever trintídio se informado
      if (trintidio) {
        const idxTrint = 34; // índice 34 = coluna 35 (base 0)
        linhasAtivos = linhasAtivos.map(l => {
          const arr = [...l];
          arr[idxTrint] = trintidio;
          return arr;
        });

        // Salvar trintídio no banco para persistir
        // (fire-and-forget, não bloqueia o sync)
        rpc('wc_trintidio_salvar_lote', { p_token: session.token, p_trintidio: trintidio })
          .catch(() => {}); // RPC opcional — se não existir não quebra
      }

      qtdAtivos = linhasAtivos.length;
      statusEl.textContent = `⬆️ Enviando ${qtdAtivos} ativos para o Sheets…`;

      const respAtivos = await fetch(
        url + '?action=sincronizar&tipo=ativos&linhas=' +
        encodeURIComponent(JSON.stringify(linhasAtivos))
      );
      const jAtivos = await respAtivos.json();
      if (!jAtivos.ok) throw new Error('Ativos: ' + (jAtivos.error || 'Erro no Apps Script'));
    }

    if (sincInativos) {
      statusEl.textContent = '⬇️ Exportando colaboradores inativos…';
      const resInativos = await rpc('wc_template_inativos_export', { p_token: session.token });
      const linhasInativos = resInativos.linhas || [];
      qtdInativos = linhasInativos.length;

      statusEl.textContent = `⬆️ Enviando ${qtdInativos} inativos para o Sheets…`;

      const respInativos = await fetch(
        url + '?action=sincronizar&tipo=inativos&linhas=' +
        encodeURIComponent(JSON.stringify(linhasInativos))
      );
      const jInativos = await respInativos.json();
      if (!jInativos.ok) throw new Error('Inativos: ' + (jInativos.error || 'Erro no Apps Script'));
    }

    // ── 2. Log de sucesso ──────────────────────────────────────────
    const tipo = sincAtivos && sincInativos ? 'ambos' : (sincAtivos ? 'ativos' : 'inativos');
    await rpc('wc_sync_registrar_log', {
      p_token: session.token,
      p_tipo: tipo,
      p_status: 'ok',
      p_qtd_ativos: qtdAtivos,
      p_qtd_inativos: qtdInativos
    }).catch(() => {});

    // ── 3. Feedback ───────────────────────────────────────────────
    const partes = [];
    if (qtdAtivos   !== null) partes.push(`${qtdAtivos} ativos`);
    if (qtdInativos !== null) partes.push(`${qtdInativos} inativos`);
    statusEl.style.color   = 'var(--success, #22c55e)';
    statusEl.textContent   = `✅ Sincronizado com sucesso! ${partes.join(' e ')} enviados à planilha.`;
    toast(`📤 Template sincronizado! ${partes.join(' e ')}.`, 'success');

    // Recarregar dados locais
    COLABS_LOADED = false;
    colabsCarregarBackground();

    setTimeout(syncFecharModal, 2500);

  } catch(e) {
    statusEl.style.color = 'var(--danger)';
    statusEl.textContent = '❌ ' + (e.message || 'Erro desconhecido');

    await rpc('wc_sync_registrar_log', {
      p_token: session.token,
      p_tipo: (sincAtivos && sincInativos) ? 'ambos' : (sincAtivos ? 'ativos' : 'inativos'),
      p_status: 'erro',
      p_erro_msg: e.message
    }).catch(() => {});

  } finally {
    btnEl.disabled = false;
    btnEl.textContent = '📤 Sincronizar agora';
  }
}

// Renderizar botões ao abrir as páginas de colaboradores
const _syncOrigNavTo = typeof navTo === 'function' ? navTo : null;
document.addEventListener('DOMContentLoaded', () => {
  // Garantir renderização dos botões quando as páginas abrirem
  const _origGaveta = window.abrirGaveta;
  if (_origGaveta) {
    window.abrirGaveta = function(id, ev) {
      _origGaveta(id, ev);
      if (id === 'colaboradores') setTimeout(syncRenderBotoes, 100);
    };
  }
});
// ════════════════ FIM MÓDULO SYNC TEMPLATE ════════════════
