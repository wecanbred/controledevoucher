// ════════════════ INTEGRAÇÃO RESCISÃO ════════════════
function rescAbrirPainel() {
  const tok    = session?.token  || '';
  const perfil = session?.perfil || '';
  const nome   = encodeURIComponent(session?.nome || '');
  const url    = `rescisao.html?tok=${tok}&perfil=${perfil}&nome=${nome}`;
  const opts   = 'width=1100,height=820,scrollbars=yes,resizable=yes,toolbar=no,menubar=no';
  window.open(url, 'rescisao_painel', opts);
}

function rescIniciar() {
  if (!_colabAtual) return;
  // Salvar dados do colaborador no sessionStorage para a nova janela ler
  try { sessionStorage.setItem('resc_colab_data', JSON.stringify(_colabAtual)); } catch(e) {}

  const url  = 'rescisao.html?modo=form';
  const opts = 'width=920,height=860,scrollbars=yes,resizable=yes,toolbar=no,menubar=no';
  const win  = window.open(url, 'rescisao_wecan', opts);

  // Fallback: mandar via postMessage quando a janela abrir
  if (win) {
    const timer = setInterval(() => {
      try {
        win.postMessage({ tipo:'resc_colab', colab: _colabAtual, session }, '*');
        clearInterval(timer);
      } catch(e) {}
    }, 400);
    setTimeout(() => clearInterval(timer), 5000);
  }

  fecharModal('modal-colab');
}

// Ouvir confirmação de rescisão enviada (para feedback futuro)
window.addEventListener('message', (ev) => {
  if (ev.data?.tipo === 'resc_enviada') {
    toast(`✅ Desligamento de ${ev.data.matricula} enviado ao RH!`, 'success');
  }
});
// ════════════════ FIM INTEGRAÇÃO RESCISÃO ════════════════
