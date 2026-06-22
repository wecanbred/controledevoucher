// ══════════════════════════════════════════════════════════════════
//  WECANBR · Seleção & Admissão — Code.gs
//  Backend Apps Script vinculado à planilha real "Consolidado".
//
//  COMO INSTALAR:
//  1. Abra a planilha real do Consolidado no Google Sheets.
//  2. Extensões → Apps Script.
//  3. Apague o conteúdo de Code.gs e cole este arquivo inteiro.
//  4. Implantar → Nova implantação → tipo "Aplicativo da Web".
//     - Executar como: Eu (sua conta)
//     - Quem pode acessar: Qualquer pessoa
//  5. Copie a URL gerada e cole em shared.js, na constante API_URL.
//
//  Todas as chamadas do app passam por doPost (action + token no JSON).
//  doGet só existe como healthcheck (abrir a URL no navegador).
// ══════════════════════════════════════════════════════════════════

const SHEET_HUBS = 'HUBs';
const SHEET_SOC = 'SOC_RJ1 e RJ2';
const SHEET_USUARIOS = 'Usuários_Sistema';
const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas, igual ao front-end
const HEADER_ROW = 1;
const FIRST_DATA_ROW = 2;

// ── Mapa oficial das 47 colunas (posição fixa, 1-based) ──
// A ordem foi extraída diretamente do cabeçalho real das abas HUBs e
// SOC_RJ1 e RJ2 (idênticas, exceto espaços a mais no cabeçalho 18).
const CAMPOS = [
  'consultor', 'jira', 'codigoHub', 'regional', 'recebimento', 'mes', 'local',
  'modalidade', 'tempo', 'cargo', 'turno', 'horario', 'escala', 'preferencia',
  'colaborador', 'statusUniforme', 'matricula', 'opsId', 'dataAdmSolicitada',
  'dataReprog', 'novaDataETO', 'dataAdmRealizada', 'etapa', 'statusVaga',
  'tipoVaga', 'salario', 'cnpj', 'departamentoGI', 'transporte', 'refeicao',
  'cestaBasica', 'gestorTurno', 'contatoGestorTurno', 'unidadeWecan', 'cpf',
  'email', 'telefone', 'indicacao', 'genero', 'tipoProcesso', 'colete',
  'bota', 'luva', 'noShow', 'motivoAtraso', 'observacao', 'tipoProcessoDesistente',
];
const COL_JIRA = 2;     // CÓDIGO DO JIRA — chave única
const COL_CONSULTOR = 1;
const COL_CODIGOHUB = 3;
const CAMPOS_DATA = ['recebimento', 'mes', 'dataAdmSolicitada', 'dataReprog', 'novaDataETO', 'dataAdmRealizada'];

// ══════════════════════════════════════════════
//  ENTRADA HTTP
// ══════════════════════════════════════════════
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, msg: 'WECANBR API ativa.' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  let resposta;
  try {
    const body = JSON.parse((e.postData && e.postData.contents) || '{}');
    resposta = rotear(body);
  } catch (err) {
    resposta = { ok: false, erro: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(resposta))
    .setMimeType(ContentService.MimeType.JSON);
}

function rotear(body) {
  const action = body.action;

  if (action === 'login') return acaoLogin(body.email, body.senha);

  // Todas as demais ações exigem sessão válida.
  const sessao = resolverSessao(body.token);
  if (!sessao) return { ok: false, erro: 'Sessão expirada ou inválida. Faça login novamente.', sessaoInvalida: true };

  switch (action) {
    case 'logout': return acaoLogout(body.token);
    case 'vagas': return acaoListarVagas(sessao);
    case 'salvarVaga': return acaoSalvarVaga(sessao, body.vaga, body.idOriginalJira);
    case 'listarUsuarios': return acaoListarUsuarios(sessao);
    case 'salvarUsuario': return acaoSalvarUsuario(sessao, body.usuario);
    case 'toggleUsuario': return acaoToggleUsuario(sessao, body.id);
    case 'excluirUsuario': return acaoExcluirUsuario(sessao, body.id);
    default: return { ok: false, erro: 'Ação desconhecida: ' + action };
  }
}

// ══════════════════════════════════════════════
//  SESSÃO (PropertiesService — sem precisar de tabela própria)
// ══════════════════════════════════════════════
function resolverSessao(token) {
  if (!token) return null;
  const prop = PropertiesService.getScriptProperties();
  const raw = prop.getProperty('sess_' + token);
  if (!raw) return null;
  const s = JSON.parse(raw);
  if (Date.now() > s.exp) { prop.deleteProperty('sess_' + token); return null; }
  return s; // {nome, email, perfil, exp}
}

function limparSessoesExpiradas() {
  const prop = PropertiesService.getScriptProperties();
  const all = prop.getProperties();
  const agora = Date.now();
  Object.keys(all).forEach(k => {
    if (k.indexOf('sess_') !== 0) return;
    try { if (JSON.parse(all[k]).exp < agora) prop.deleteProperty(k); } catch (e) { prop.deleteProperty(k); }
  });
}

function acaoLogout(token) {
  if (token) PropertiesService.getScriptProperties().deleteProperty('sess_' + token);
  return { ok: true };
}

// ══════════════════════════════════════════════
//  LOGIN / USUÁRIOS  (aba "Usuários_Sistema", criada sozinha se faltar)
// ══════════════════════════════════════════════
function getSheetUsuarios() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_USUARIOS);
  if (!sh) {
    sh = ss.insertSheet(SHEET_USUARIOS);
    sh.appendRow(['ID', 'NOME', 'EMAIL', 'SENHA_HASH', 'SALT', 'PERFIL', 'ATIVO']);
    sh.setFrozenRows(1);
    // Seed com as contas de demonstração já usadas no protótipo, pra não
    // quebrar o acesso de quem já estava testando.
    const seed = [
      ['LIDIANE SILVA', 'lidiane.silva@wecanbr.com.br', '123456', 'equipe'],
      ['FABIANA SANDER', 'fabiana.sander@wecanbr.com.br', '123456', 'equipe'],
      ['EDIVAN COSTA', 'edivan.costa@wecanbr.com.br', 'Edivan027@', 'master'],
      ['GESTORA REGIONAL', 'gestora.regional@wecanbr.com.br', '123456', 'gestor'],
      ['ONSITE DUQUE DE CAXIAS', 'onsite.duquedecaxias@wecanbr.com.br', '123456', 'onsite'],
    ];
    seed.forEach(s => {
      const salt = Utilities.getUuid();
      sh.appendRow([Utilities.getUuid().slice(0, 8), s[0], s[1], hashSenha(s[2], salt), salt, s[3], true]);
    });
  }
  return sh;
}

function hashSenha(senha, salt) {
  const bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha + '::' + salt + '::wecanbr');
  return bytes.map(b => ((b < 0 ? b + 256 : b).toString(16)).padStart(2, '0')).join('');
}

function lerUsuarios() {
  const sh = getSheetUsuarios();
  const vals = sh.getDataRange().getValues();
  const out = [];
  for (let i = 1; i < vals.length; i++) {
    const r = vals[i];
    if (!r[1] && !r[2]) continue; // linha vazia
    out.push({ id: String(r[0]), nome: String(r[1]), email: String(r[2]).trim().toLowerCase(), senhaHash: r[3], salt: r[4], perfil: r[5], ativo: r[6] !== false, _row: i + 1 });
  }
  return out;
}

function acaoLogin(email, senha) {
  email = (email || '').trim().toLowerCase();
  if (!email || !senha) return { ok: false, erro: 'Informe e-mail e senha.' };
  const usuarios = lerUsuarios();
  const u = usuarios.find(x => x.email === email);
  if (!u) return { ok: false, erro: 'E-mail ou senha incorretos.' };
  if (!u.ativo) return { ok: false, erro: 'Este acesso está desativado. Fale com um administrador.' };
  if (hashSenha(senha, u.salt) !== u.senhaHash) return { ok: false, erro: 'E-mail ou senha incorretos.' };

  limparSessoesExpiradas();
  const token = Utilities.getUuid();
  const exp = Date.now() + SESSION_TTL_MS;
  PropertiesService.getScriptProperties().setProperty('sess_' + token, JSON.stringify({ nome: u.nome, email: u.email, perfil: u.perfil, exp }));
  return { ok: true, sessao: { nome: u.nome, email: u.email, perfil: u.perfil, token } };
}

function acaoListarUsuarios(sessao) {
  if (sessao.perfil !== 'master') return { ok: false, erro: 'Apenas o Master pode ver os usuários.' };
  const usuarios = lerUsuarios().map(u => ({ id: u.id, nome: u.nome, email: u.email, perfil: u.perfil, ativo: u.ativo }));
  return { ok: true, usuarios };
}

function acaoSalvarUsuario(sessao, dados) {
  if (sessao.perfil !== 'master') return { ok: false, erro: 'Apenas o Master pode gerenciar usuários.' };
  if (!dados || !dados.nome || !dados.email) return { ok: false, erro: 'Preencha nome e e-mail.' };
  const email = dados.email.trim().toLowerCase();
  const sh = getSheetUsuarios();
  const usuarios = lerUsuarios();

  if (dados.id) {
    const u = usuarios.find(x => x.id === dados.id);
    if (!u) return { ok: false, erro: 'Usuário não encontrado.' };
    const salt = dados.senha ? Utilities.getUuid() : u.salt;
    const hash = dados.senha ? hashSenha(dados.senha, salt) : u.senhaHash;
    sh.getRange(u._row, 2, 1, 5).setValues([[dados.nome, email, hash, salt, dados.perfil]]);
  } else {
    if (usuarios.some(x => x.email === email)) return { ok: false, erro: 'Já existe um usuário com esse e-mail.' };
    if (!dados.senha) return { ok: false, erro: 'Defina uma senha para o novo usuário.' };
    const salt = Utilities.getUuid();
    sh.appendRow([Utilities.getUuid().slice(0, 8), dados.nome, email, hashSenha(dados.senha, salt), salt, dados.perfil, true]);
  }
  return { ok: true };
}

function acaoToggleUsuario(sessao, id) {
  if (sessao.perfil !== 'master') return { ok: false, erro: 'Apenas o Master pode gerenciar usuários.' };
  const sh = getSheetUsuarios();
  const u = lerUsuarios().find(x => x.id === id);
  if (!u) return { ok: false, erro: 'Usuário não encontrado.' };
  sh.getRange(u._row, 7).setValue(!u.ativo);
  return { ok: true, ativo: !u.ativo };
}

function acaoExcluirUsuario(sessao, id) {
  if (sessao.perfil !== 'master') return { ok: false, erro: 'Apenas o Master pode gerenciar usuários.' };
  const sh = getSheetUsuarios();
  const u = lerUsuarios().find(x => x.id === id);
  if (!u) return { ok: false, erro: 'Usuário não encontrado.' };
  sh.deleteRow(u._row);
  return { ok: true };
}

// ══════════════════════════════════════════════
//  VAGAS — leitura (HUBs + SOC_RJ1 e RJ2)
// ══════════════════════════════════════════════
function normalizar(s) { return String(s || '').trim().toUpperCase(); }

// Datas na planilha real vêm misturadas: células de data de verdade (Date)
// e, em algumas linhas antigas, texto "dd/mm/aaaa". Normaliza as duas pra
// "aaaa-mm-dd" (formato que <input type="date"> entende).
function normalizarDataLeitura(v) {
  if (!v) return '';
  if (Object.prototype.toString.call(v) === '[object Date]') {
    return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  const s = String(v).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m2) return m2[0];
  return ''; // valor não reconhecido — não arrisca mandar lixo pro front
}

function normalizarDataEscrita(v) {
  if (!v) return '';
  const m = String(v).trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return v; // deixa como veio (texto livre) se não for ISO
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

function linhaParaObjeto(row, aba, numLinha) {
  const obj = { _aba: aba, _row: numLinha };
  CAMPOS.forEach((campo, i) => {
    let v = row[i];
    if (CAMPOS_DATA.indexOf(campo) !== -1) v = normalizarDataLeitura(v);
    else if (v === null || v === undefined) v = '';
    else v = String(v).trim ? (typeof v === 'string' ? v : v) : v;
    obj[campo] = v;
  });
  obj.id = obj.jira; // a chave única vira o "id" usado pelo front
  return obj;
}

function lerAba(nomeAba) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(nomeAba);
  if (!sh) return [];
  const vals = sh.getDataRange().getValues();
  const out = [];
  for (let i = FIRST_DATA_ROW - 1; i < vals.length; i++) {
    const row = vals[i];
    if (!row[COL_JIRA - 1] && !row[COL_CONSULTOR - 1]) continue; // linha em branco
    out.push(linhaParaObjeto(row, nomeAba, i + 1));
  }
  return out;
}

function lerTodasVagas() {
  return lerAba(SHEET_HUBS).concat(lerAba(SHEET_SOC));
}

function podeVerTudo(sessao) { return sessao.perfil === 'gestor' || sessao.perfil === 'master'; }

function acaoListarVagas(sessao) {
  const todas = lerTodasVagas();
  const escopo = (podeVerTudo(sessao) || sessao.perfil === 'onsite')
    ? todas
    : todas.filter(v => normalizar(v.consultor) === normalizar(sessao.nome));
  return { ok: true, vagas: escopo, total: todas.length };
}

// ══════════════════════════════════════════════
//  VAGAS — gravação (criar / atualizar)
// ══════════════════════════════════════════════
function localizarPorJira(jira) {
  jira = normalizar(jira);
  if (!jira) return null;
  for (const aba of [SHEET_HUBS, SHEET_SOC]) {
    const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(aba);
    if (!sh) continue;
    const col = sh.getRange(FIRST_DATA_ROW, COL_JIRA, Math.max(sh.getLastRow() - 1, 0), 1).getValues();
    for (let i = 0; i < col.length; i++) {
      if (normalizar(col[i][0]) === jira) return { aba, row: i + FIRST_DATA_ROW };
    }
  }
  return null;
}

function escreverLinha(aba, numLinha, vaga) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(aba);
  const valores = CAMPOS.map(campo => {
    const v = vaga[campo];
    return CAMPOS_DATA.indexOf(campo) !== -1 ? normalizarDataEscrita(v) : (v === undefined ? '' : v);
  });
  sh.getRange(numLinha, 1, 1, CAMPOS.length).setValues([valores]);
}

function apendarLinha(aba, vaga) {
  const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(aba);
  const valores = CAMPOS.map(campo => {
    const v = vaga[campo];
    return CAMPOS_DATA.indexOf(campo) !== -1 ? normalizarDataEscrita(v) : (v === undefined ? '' : v);
  });
  sh.appendRow(valores);
  return sh.getLastRow();
}

function acaoSalvarVaga(sessao, vaga, idOriginalJira) {
  if (!vaga) return { ok: false, erro: 'Dados da vaga ausentes.' };
  vaga = Object.assign({}, vaga);

  const ehGestorOuMaster = podeVerTudo(sessao);
  if (!ehGestorOuMaster) {
    if (sessao.perfil !== 'equipe') return { ok: false, erro: 'Você não tem permissão para salvar vagas.' };
    vaga.consultor = sessao.nome; // nunca confia no consultor mandado pelo cliente
  }

  if (!String(vaga.jira || '').trim()) return { ok: false, erro: 'Informe o Código do Jira.' };
  if (!String(vaga.colaborador || '').trim()) return { ok: false, erro: 'Informe o nome do colaborador.' };

  const chaveBusca = idOriginalJira || vaga.jira;
  const loc = localizarPorJira(chaveBusca);

  if (loc) {
    if (!ehGestorOuMaster) {
      const sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(loc.aba);
      const consultorAtual = sh.getRange(loc.row, COL_CONSULTOR).getValue();
      if (normalizar(consultorAtual) !== normalizar(sessao.nome)) {
        return { ok: false, erro: 'Você não tem permissão para editar esta vaga.' };
      }
    }
    escreverLinha(loc.aba, loc.row, vaga);
    return { ok: true, vaga: linhaParaObjeto(CAMPOS.map(c => vaga[c]), loc.aba, loc.row), criado: false };
  }

  const codigoHub = normalizar(vaga.codigoHub);
  const abaDestino = codigoHub.indexOf('SOC') === 0 ? SHEET_SOC : SHEET_HUBS;
  const numLinha = apendarLinha(abaDestino, vaga);
  return { ok: true, vaga: linhaParaObjeto(CAMPOS.map(c => vaga[c]), abaDestino, numLinha), criado: true };
}
