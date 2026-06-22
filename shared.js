// ══════════════════════════════════════════════
//  shared.js — WecanBR Sistema Integrado
//  Funções comuns de sessão + chamadas à API real (Apps Script).
//  Usado por index.html e admissao.html.
//
//  A planilha real do Consolidado já está conectada: login, vagas e
//  usuários passam pelo Web App do Apps Script (Code.gs), não mais
//  por dados de exemplo em localStorage.
// ══════════════════════════════════════════════

const PERFIL_LABEL = { equipe:'Equipe (Consultor)', gestor:'Gestor', master:'Master', onsite:'Onsite' };

// ── Cole aqui a URL do Web App depois de implantar o Code.gs ──
// (Extensões → Apps Script → Implantar → Nova implantação → Aplicativo
// da Web → "Qualquer pessoa" → Implantar → copiar a URL terminada em /exec)
const API_URL = 'https://script.google.com/macros/s/AKfycbwMsmVVW-MXfu0sCQofrjwSuJeCM_Jwuc48VfmcIKvm_-0gt7dgHHSJt-p97n_OqUqR/exec';

// ── Sessão ──
// O localStorage agora guarda só um CACHE local (nome/perfil/token) pra
// a tela não "piscar" um login a cada navegação. Quem garante de verdade
// a permissão é o token, validado a cada chamada dentro do Code.gs — se
// alguém adulterar esse cache no navegador, o servidor ignora o perfil
// informado e usa o que está de fato amarrado ao token.
const SESSION_KEY = 'wecan_session_v1';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas — mesmo prazo da sessão no Code.gs

function salvarSessao(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ session: s, savedAt: Date.now() })); } catch(e) {} }
function carregarSessaoSalva() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed.savedAt || (Date.now() - parsed.savedAt) > SESSION_TTL_MS) { localStorage.removeItem(SESSION_KEY); return null; }
    return parsed.session;
  } catch(e) { return null; }
}
function limparSessaoSalva() { try { localStorage.removeItem(SESSION_KEY); } catch(e) {} }

// ── Chamada à API (Apps Script) ──
// Sempre POST com corpo texto puro (não JSON no header) — é o jeito de
// evitar que o navegador dispare um preflight CORS, que o Apps Script
// Web App não sabe responder.
async function apiCall(action, payload) {
  if (API_URL.indexOf('COLE_AQUI') !== -1) {
    throw new Error('A URL do Apps Script ainda não foi configurada em shared.js (API_URL).');
  }
  payload = payload || {};
  const sessao = carregarSessaoSalva();
  const token = (sessao && sessao.token) || payload.token || '';
  const corpo = JSON.stringify(Object.assign({ action, token }, payload));

  let resp;
  try {
    resp = await fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: corpo });
  } catch (e) {
    throw new Error('Não foi possível conectar ao servidor. Verifique sua internet ou a URL do Apps Script em shared.js.');
  }

  let dados;
  try { dados = await resp.json(); } catch (e) { throw new Error('O servidor respondeu algo inesperado. Confirme se o Code.gs está implantado corretamente.'); }

  if (!dados.ok) {
    if (dados.sessaoInvalida) {
      limparSessaoSalva();
      window.location.href = 'index.html';
    }
    throw new Error(dados.erro || 'Erro desconhecido ao falar com o servidor.');
  }
  return dados;
}
