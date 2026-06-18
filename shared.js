// ══════════════════════════════════════════════
//  shared.js — WecanBR Sistema Integrado
//  Funções comuns de sessão e usuários.
//  Usado por index.html e admissao.html.
//  Mesma origem ⇒ mesmo localStorage ⇒ funciona como
//  um "banco" compartilhado entre as três páginas.
//  (Substituir por chamadas reais ao Apps Script quando
//  a planilha Consolidado/Usuários estiver conectada.)
// ══════════════════════════════════════════════

const PERFIL_LABEL = { equipe:'Equipe (Consultor)', gestor:'Gestor', master:'Master', onsite:'Onsite' };

// ── Sessão ──
const SESSION_KEY = 'wecan_session_v1';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

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

// ── Usuários (acessos ao sistema) ──
const USERS_KEY = 'wecan_usuarios_v1';

function _usuariosPadrao() {
  return [
    { id:'u1', nome:'LIDIANE SILVA',  perfil:'equipe', email:'lidiane.silva@wecanbr.com.br', senha:'123456', ativo:true },
    { id:'u2', nome:'FABIANA SANDER', perfil:'equipe', email:'fabiana.sander@wecanbr.com.br', senha:'123456', ativo:true },
    { id:'u3', nome:'EDIVAN COSTA',   perfil:'master', email:'edivan.costa@wecanbr.com.br', senha:'Edivan027@', ativo:true },
    { id:'u4', nome:'GESTORA REGIONAL', perfil:'gestor', email:'gestora.regional@wecanbr.com.br', senha:'123456', ativo:true },
    { id:'u5', nome:'ONSITE DUQUE DE CAXIAS', perfil:'onsite', email:'onsite.duquedecaxias@wecanbr.com.br', senha:'123456', ativo:true },
  ];
}

function carregarUsuarios() {
  try {
    const raw = localStorage.getItem(USERS_KEY);
    if (!raw) { const padrao = _usuariosPadrao(); salvarUsuarios(padrao); return padrao; }
    const lista = JSON.parse(raw);
    return Array.isArray(lista) && lista.length ? lista : _usuariosPadrao();
  } catch(e) { return _usuariosPadrao(); }
}
function salvarUsuarios(lista) { try { localStorage.setItem(USERS_KEY, JSON.stringify(lista)); } catch(e) {} }
function gerarIdUsuario() { return 'u' + Date.now().toString(36); }
