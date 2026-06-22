// ══════════════════════════════════════════════
//  shared.js — WecanBR Sistema Integrado
//  Banco: Supabase (PostgreSQL) via funções RPC
//  Usado por index.html e admissao.html
// ══════════════════════════════════════════════

const PERFIL_LABEL = { equipe:'Equipe (Consultor)', gestor:'Gestor', master:'Master', onsite:'Onsite' };

const SUPABASE_URL  = 'https://omwilcuzcvgzyzqqrbkh.supabase.co';
const SUPABASE_ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9td2lsY3V6Y3Znenl6cXFyYmtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIxMzI1MTIsImV4cCI6MjA5NzcwODUxMn0.S1pbFqZ4B5_TWMBq_r8BeQ9OOFzkj73aOoI6g3Y987Q';

// ── Sessão (cache local — a validação real é feita pelo banco via token) ──
const SESSION_KEY    = 'wecan_session_v1';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000;

function salvarSessao(s)      { try { localStorage.setItem(SESSION_KEY, JSON.stringify({ session:s, savedAt:Date.now() })); } catch(e){} }
function limparSessaoSalva()  { try { localStorage.removeItem(SESSION_KEY); } catch(e){} }
function carregarSessaoSalva() {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p.savedAt || (Date.now()-p.savedAt) > SESSION_TTL_MS) { localStorage.removeItem(SESSION_KEY); return null; }
    return p.session;
  } catch(e) { return null; }
}

// ── Chamada RPC ao Supabase ──────────────────────────────────────────
// fn   = nome da função PostgreSQL (ex: 'wc_login')
// args = objeto com os parâmetros da função
async function rpc(fn, args) {
  // wc_login não tem p_token — só adiciona nas demais funções
  if (fn !== 'wc_login' && fn !== 'wc_logout' && args.p_token === undefined) {
    const sessao = carregarSessaoSalva();
    args.p_token = (sessao && sessao.token) || '';
  }

  const resp = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      'Content-Type':  'application/json',
      'apikey':        SUPABASE_ANON,
      'Authorization': `Bearer ${SUPABASE_ANON}`
    },
    body: JSON.stringify(args)
  });

  let data;
  try { data = await resp.json(); } catch(e) {
    throw new Error('Erro de comunicação com o banco. Verifique sua internet.');
  }

  if (!resp.ok) throw new Error((data && (data.message || data.hint)) || `Erro HTTP ${resp.status}`);
  if (data && data.ok === false) {
    if (data.sessaoInvalida) { limparSessaoSalva(); window.location.href='index.html'; }
    throw new Error(data.erro || 'Erro desconhecido.');
  }
  return data;
}
