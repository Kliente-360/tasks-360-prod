/**
 * Tasks 360 — Gemini Notes Ingestor
 *
 * Roda em Google Apps Script (script.google.com).
 * A cada N minutos: busca emails do Gemini, extrai action items, cria tasks no Tasks 360.
 *
 * SETUP (uma vez):
 *   1. Project Settings → Script Properties → adicionar:
 *        TASKS360_API_KEY  = <pegar com o Felipe · valor de INGEST_API_KEYS>
 *        TASKS360_BASE_URL = https://nxtlipldmsopscpshrfd.supabase.co
 *   2. Rodar `main` manualmente uma vez → aprovar permissões (Gmail, Calendar, UrlFetch).
 *   3. Triggers (relógio na sidebar) → Add Trigger:
 *        Function: main · Event source: Time-driven · Type: Minutes timer · Every: 10 min
 *   4. (Opcional) Triggers → adicionar 2º trigger pra `main` em Failure notification: immediate
 *
 * SAFE TO RE-RUN: external_id é determinístico, ingest_task faz UPSERT.
 */

// ─────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────

const INTERNAL_DOMAIN = 'kliente360.com';
const GEMINI_SENDER = 'gemini-notes@google.com';
const SEARCH_WINDOW = 'newer_than:2h';   // janela de busca no Gmail
const MAX_THREADS_PER_RUN = 25;

// Labels aplicados na thread depois de processada.
// A query do Gmail exclui as duas labels — threads marcadas NÃO são reprocessadas.
//   - PROCESSED_LABEL: o script criou/atualizou tasks dessa reunião.
//   - SKIP_LABEL:      o script decidiu não criar tasks (reunião 100% interna, sem
//                      attendees externos, cliente interno, ou nenhum action item).
// Pra forçar reprocessar uma thread: remova a label correspondente manualmente no Gmail.
const PROCESSED_LABEL = 'tasks360/processado';
const SKIP_LABEL      = 'tasks360/skip';

// ─────────────────────────────────────────────────────────────────────────
// Entry point — chamada pelo trigger
// ─────────────────────────────────────────────────────────────────────────

function main() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('TASKS360_API_KEY');
  const baseUrl = props.getProperty('TASKS360_BASE_URL');
  if (!apiKey || !baseUrl) throw new Error('Defina TASKS360_API_KEY e TASKS360_BASE_URL em Project Settings → Script Properties.');

  const ctx = { apiKey, baseUrl, log: [] };

  log_(ctx, '── Iniciando run ' + new Date().toISOString());

  // Cache do catálogo (1 chamada cada por run)
  const clientes = api_(ctx, 'GET', '/functions/v1/get-clientes?with_projetos=true').clientes || [];
  const pessoas = api_(ctx, 'GET', '/functions/v1/get-pessoas?with_load=false').pessoas || [];
  log_(ctx, `Catálogo: ${clientes.length} clientes, ${pessoas.length} pessoas`);

  // Garante que as labels existem na conta (cria se for primeira execução)
  const processedLabel = getOrCreateLabel_(PROCESSED_LABEL);
  const skipLabel      = getOrCreateLabel_(SKIP_LABEL);

  // Buscar emails recentes do Gemini, excluindo já processados/skipados (labels).
  const query = `from:${GEMINI_SENDER} ${SEARCH_WINDOW} -label:${PROCESSED_LABEL} -label:${SKIP_LABEL}`;
  const threads = GmailApp.search(query, 0, MAX_THREADS_PER_RUN);
  log_(ctx, `${threads.length} thread(s) encontrada(s)`);

  let counters = { created: 0, updated: 0, skipped_meeting: 0, skipped_item: 0, errors: 0 };

  for (const thread of threads) {
    let labelToApply = null;
    try {
      const result = processThread_(ctx, thread, clientes, pessoas);
      counters.created += result.created;
      counters.updated += result.updated;
      counters.skipped_item += result.skipped_item;
      if (result.skipped_meeting) counters.skipped_meeting++;
      // skipped_meeting=true → label de skip; senão (criou/atualizou tasks) → label de processado
      labelToApply = result.skipped_meeting ? skipLabel : processedLabel;
    } catch (err) {
      counters.errors++;
      log_(ctx, `ERROR thread ${thread.getId()}: ${err.message}\n${err.stack || ''}`);
      // Em erro, NÃO aplica label — deixa o próximo run tentar de novo.
    }
    if (labelToApply) {
      try { labelToApply.addToThread(thread); }
      catch (labelErr) { log_(ctx, `WARN não consegui labelar thread ${thread.getId()}: ${labelErr.message}`); }
    }
  }

  log_(ctx, `── Fim. created=${counters.created} updated=${counters.updated} skipped_meeting=${counters.skipped_meeting} skipped_item=${counters.skipped_item} errors=${counters.errors}`);
  console.log(ctx.log.join('\n'));
}

// ─────────────────────────────────────────────────────────────────────────
// Processamento de uma thread (1 reunião)
// ─────────────────────────────────────────────────────────────────────────

function processThread_(ctx, thread, clientes, pessoas) {
  const result = { created: 0, updated: 0, skipped_item: 0, skipped_meeting: false };
  const msg = thread.getMessages()[0];
  const subject = msg.getSubject() || '';
  const body = msg.getPlainBody() || '';
  // Use o Message-ID RFC 822 (global em todas as caixas) em vez do thread.getId() (per-mailbox)
  // pra evitar duplicar tasks quando múltiplos usuários rodarem o script no mesmo email.
  const threadId = safeMessageId_(msg);

  // 1. Título da reunião
  const title = extractMeetingTitle_(subject);
  log_(ctx, `\n[${threadId}] subject="${subject}" → title="${title}"`);

  // 2. Action items
  const items = extractActionItems_(body);
  log_(ctx, `  ${items.length} action item(s) bruto(s)`);
  if (!items.length) {
    log_(ctx, '  → nenhum action item, skip');
    result.skipped_meeting = true;
    return result;
  }

  // 3. Buscar evento no calendar pra obter participantes
  // Precisamos disso pra: (a) confirmar que tem participante externo, (b) tentar match por domínio
  const event = findCalendarEvent_(title || items[0].descricao || items[0].titulo, msg.getDate());
  const attendees = event ? event.getGuestList(true).map(g => ({ email: g.getEmail(), name: g.getName() || '' })) : [];

  // 4. Determinar se há participante externo
  const hasExternal = attendees.some(a => a.email && !a.email.toLowerCase().endsWith('@' + INTERNAL_DOMAIN));
  const allInternal = attendees.length > 0 && !hasExternal;

  // REGRA DE OURO: reunião 100% interna NUNCA cria task
  if (allInternal) {
    log_(ctx, '  → reunião 100% interna, skip');
    result.skipped_meeting = true;
    return result;
  }
  // Sem attendees → não conseguimos confirmar se é externa, melhor skipar (conservador)
  if (!attendees.length) {
    log_(ctx, '  → calendar event não encontrado, sem attendees pra validar, skip');
    result.skipped_meeting = true;
    return result;
  }
  // Tem attendees mas nenhum externo (já tratado acima por allInternal, mas paranoia)
  if (!hasExternal) {
    log_(ctx, '  → nenhum attendee externo, skip');
    result.skipped_meeting = true;
    return result;
  }

  // 5. Identificar cliente (com detecção de conflito)
  // Ordem: 5.1 título → 5.2 domínio cadastrado → 5.3 substring fallback
  // Se múltiplos matches em qualquer etapa → conflito → cliente = null (cria sem cliente)
  const findResult = findCliente_(title, attendees, clientes);
  let cliente = findResult.cliente || null;
  if (findResult.conflict) {
    log_(ctx, `  ⚠️ CONFLITO de cliente (múltiplos matches): ${findResult.conflict.join(', ')} — tasks serão criadas SEM cliente`);
  } else if (!cliente) {
    log_(ctx, '  ⚠️ cliente NÃO identificado — tasks serão criadas SEM cliente');
  }
  // Cliente identificado mas é interno → skip
  if (cliente && cliente.eh_interno) {
    log_(ctx, `  → cliente "${cliente.nome}" é interno, skip`);
    result.skipped_meeting = true;
    return result;
  }

  // 6. Projeto default (só se cliente foi identificado e tem 1 único projeto)
  const projeto = (cliente && cliente.projetos && cliente.projetos.length === 1) ? cliente.projetos[0].nome : null;
  log_(ctx, `  cliente="${cliente ? cliente.nome : '∅'}" projeto="${projeto || '—'}" attendees=${attendees.length}`);

  // 6.5. Resumo da reunião (extrai 1x; usado pra prefixar tasks ambíguas)
  const resumo = extractResumo_(body);

  // 7. Pra cada action item, decidir e criar
  for (const item of items) {
    const decision = decideAssignee_(item.assignees, pessoas, attendees);
    if (decision.action === 'skip') {
      result.skipped_item++;
      log_(ctx, `    [#${item.idx}] SKIP "${item.titulo}" — ${decision.reason}`);
      continue;
    }
    const finalDescricao = buildDescricao_({
      original: item.descricao,
      clienteIdentificado: !!cliente,
      conflict: findResult.conflict || null,
      meetingTitle: title,
      resumo,
    });
    const payload = {
      external_id: `cowork-${threadId}-${item.idx}`,
      titulo: item.titulo,
      descricao: finalDescricao,
      criado_por_ia: true,
    };
    if (cliente) payload.cliente = cliente.nome;          // omitido se não identificado
    if (projeto) payload.projeto = projeto;
    if (decision.responsavel) payload.responsavel = decision.responsavel;

    try {
      const resp = api_(ctx, 'POST', '/functions/v1/ingest-task', payload);
      if (resp.action === 'created') result.created++;
      else if (resp.action === 'updated') result.updated++;
      log_(ctx, `    [#${item.idx}] ${resp.action.toUpperCase()} "${item.titulo}" resp=${decision.responsavel || '∅'}`);
    } catch (err) {
      log_(ctx, `    [#${item.idx}] ERROR ${err.message}`);
      throw err;
    }
  }

  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Parsers
// ─────────────────────────────────────────────────────────────────────────

/** Extrai o título do email tipo `Anotações: "X" em DD de mes. de YYYY`. */
function extractMeetingTitle_(subject) {
  const m = subject.match(/"([^"]+)"/);
  return m ? m[1].trim() : '';
}

/**
 * Extrai action items da seção "Próximas etapas sugeridas".
 * Formato esperado por linha: `[Nome1, Nome2] Título: Descrição.`
 * Retorna [{ idx, assignees: [string], titulo: string, descricao: string }].
 */
function extractActionItems_(body) {
  // Achar a seção
  const sectionRe = /Pr[óo]ximas etapas sugeridas([\s\S]+?)(Registros da reuni[ãa]o|A se[çc][ãa]o "Pr[óo]ximas|Google LLC|$)/i;
  const sec = body.match(sectionRe);
  const text = sec ? sec[1] : body;

  // Os itens em alguns emails vêm com quebras de linha no meio (line wrap).
  // Estratégia: dividir o texto em "blocos" começados por `[` no início de uma linha logical.
  // Junta linhas até a próxima linha começar com `[`.
  const lines = text.split(/\r?\n/).map(l => l.replace(/\s+/g, ' ').trim()).filter(Boolean);
  const blocks = [];
  let cur = '';
  for (const ln of lines) {
    if (ln.startsWith('[')) {
      if (cur) blocks.push(cur);
      cur = ln;
    } else if (cur) {
      cur += ' ' + ln;
    }
  }
  if (cur) blocks.push(cur);

  const items = [];
  let idx = 0;
  for (const block of blocks) {
    idx++;
    const m = block.match(/^\[([^\]]+)\]\s*([^:]+?)\s*:\s*(.*)$/);
    if (!m) continue;
    const assignees = m[1].split(',').map(s => s.trim()).filter(Boolean);
    const titulo = m[2].trim();
    const descricao = m[3].trim();
    items.push({ idx, assignees, titulo, descricao });
  }
  return items;
}

/**
 * Extrai a seção "Resumo" do email do Gemini (parágrafo logo após "Resumo\n").
 * Retorna string limpa truncada em ~280 chars, ou '' se não encontrar.
 */
function extractResumo_(body) {
  if (!body) return '';
  // Pegar texto entre o header "Resumo" (linha sozinha) e o próximo header/seção
  const m = body.match(/(?:^|\n)\s*Resumo\s*\n+([\s\S]+?)(?:\n\s*\n|\nPr[óo]ximas etapas|\nRegistros da reuni[ãa]o|$)/i);
  if (!m) return '';
  let txt = m[1].replace(/\s+/g, ' ').trim();
  if (txt.length > 280) txt = txt.slice(0, 277).trimEnd() + '…';
  return txt;
}

/**
 * Monta a descricao final da task. Para tasks SEM cliente identificado (ou conflito),
 * prefixa com metadados ("Cliente sugerido", "Reunião", "Resumo") pra ajudar
 * o usuário a reatribuir manualmente depois. Para tasks com cliente OK, retorna só
 * a descrição original.
 */
function buildDescricao_(opts) {
  const original = opts.original || '';
  if (opts.clienteIdentificado) return original;

  const lines = [];
  const sugestao = opts.conflict && opts.conflict.length
    ? opts.conflict.join(' ou ')
    : '?';
  lines.push(`⚠ Cliente sugerido: ${sugestao}`);
  if (opts.meetingTitle) lines.push(`Reunião: ${opts.meetingTitle}`);
  if (opts.resumo) lines.push(`Resumo: ${opts.resumo}`);
  lines.push('---');
  lines.push(original);
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────
// Matching
// ─────────────────────────────────────────────────────────────────────────

/**
 * Pega o Message-ID RFC 822 do email (header global, igual em todas as caixas)
 * e sanitiza pra ser URL/external_id-safe. Fallback pro getId do Gmail se header faltar.
 */
function safeMessageId_(msg) {
  let mid = '';
  try { mid = msg.getHeader('Message-ID') || ''; } catch (_) { mid = ''; }
  if (!mid) mid = msg.getId();
  return mid.replace(/[<>]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
}

function normalize_(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // remove acentos
    .toLowerCase()
    .trim();
}

function firstName_(fullName) {
  const t = normalize_(fullName).split(/\s+/);
  return t[0] || '';
}

/**
 * Identifica o cliente. Retorna { cliente?, conflict? } onde:
 *  - cliente: o cliente identificado (1 único match em alguma etapa)
 *  - conflict: lista de nomes se houver múltiplos matches em alguma etapa
 *  - {} (vazio): nenhum match em nenhuma etapa
 *
 * Ordem das etapas (a primeira que retornar 1+ matches decide):
 *   1. Título da reunião contém o nome do cliente (substring case-insensitive)
 *   2. Domínio do attendee externo está em cliente.dominios (preferido, novo)
 *   3. Substring fallback: nome do cliente está no domínio do attendee
 */
function findCliente_(title, attendees, clientes) {
  // Etapa 1: título
  const ntitle = normalize_(title);
  if (ntitle) {
    const sorted = [...clientes].sort((a, b) => b.nome.length - a.nome.length);
    const titleMatches = sorted.filter(c => {
      const nc = normalize_(c.nome);
      return nc && ntitle.indexOf(nc) !== -1;
    });
    if (titleMatches.length === 1) return { cliente: titleMatches[0] };
    if (titleMatches.length > 1) return { conflict: titleMatches.map(c => c.nome) };
  }

  // Etapa 2: dominios cadastrados (campo cliente.dominios)
  const externalDomains = externalDomainsFromAttendees_(attendees);
  if (externalDomains.size) {
    const domainMatches = clientes.filter(c => {
      const list = Array.isArray(c.dominios) ? c.dominios : [];
      return list.some(d => externalDomains.has((d || '').toLowerCase().trim()));
    });
    if (domainMatches.length === 1) return { cliente: domainMatches[0] };
    if (domainMatches.length > 1) return { conflict: domainMatches.map(c => c.nome) };

    // Etapa 3: substring fallback (nome do cliente em domínio)
    const subMatches = clientes.filter(c => {
      const nc = normalize_(c.nome);
      return nc && [...externalDomains].some(dom => dom.indexOf(nc) !== -1);
    });
    if (subMatches.length === 1) return { cliente: subMatches[0] };
    if (subMatches.length > 1) return { conflict: subMatches.map(c => c.nome) };
  }

  return {};
}

// ── Funções legadas mantidas só pra debug/teste manual ───────────────────
function matchClienteByTitle_(title, clientes) {
  const r = findCliente_(title, [], clientes);
  return r.cliente || null;
}

/**
 * Coleta os domínios externos (não-internos) dos participantes.
 */
function externalDomainsFromAttendees_(attendees) {
  const set = new Set();
  for (const a of attendees) {
    if (!a.email) continue;
    const dom = (a.email.split('@')[1] || '').toLowerCase().trim();
    if (dom && dom !== INTERNAL_DOMAIN) set.add(dom);
  }
  return set;
}

/**
 * MATCH PREFERIDO: usa o campo `dominios` (text[]) do cliente, exato.
 * Retorna null se nenhum cliente tem domínio cadastrado que bata.
 *
 * Compatibilidade: se nenhum cliente da resposta tem `dominios` populado,
 * retorna null (cai pro fallback de substring).
 */
function matchClienteByDomain_(attendees, clientes) {
  const externalDomains = externalDomainsFromAttendees_(attendees);
  if (!externalDomains.size) return null;
  for (const c of clientes) {
    const list = Array.isArray(c.dominios) ? c.dominios : [];
    for (const d of list) {
      const dn = (d || '').toLowerCase().trim();
      if (dn && externalDomains.has(dn)) return c;
    }
  }
  return null;
}

/**
 * FALLBACK LEGADO: tenta match por substring entre nome do cliente e domínio do attendee.
 * Funciona pra "Bodytech" ↔ "bodytech.com.br" mas falha pra acrônimos (CTF, VB).
 * Mantido enquanto nem todos clientes têm `dominios` cadastrados.
 */
function matchClienteByAttendees_(attendees, clientes) {
  const externalDomains = externalDomainsFromAttendees_(attendees);
  for (const c of clientes) {
    const nc = normalize_(c.nome);
    for (const dom of externalDomains) {
      if (nc && dom.indexOf(nc) !== -1) return c;
    }
  }
  return null;
}

/**
 * Pra um action item com lista de assignees, decide se cria a task e quem é o responsável.
 * Retorna { action: 'create'|'skip', responsavel?: string, reason?: string }.
 */
function decideAssignee_(assignees, pessoas, attendees) {
  let internoCadastrado = null;          // first name match em get_pessoas → cria com nome
  let internoNaoCadastrado = false;      // first name match com email @kliente360 nos attendees → cria sem responsavel
  const externos = [];

  for (const raw of assignees) {
    const fn = firstName_(raw);
    if (!fn) continue;

    // 1. Match em get_pessoas
    const p = pessoas.find(p => firstName_(p.nome) === fn);
    if (p) {
      internoCadastrado = firstName_(p.nome).charAt(0).toUpperCase() + firstName_(p.nome).slice(1);
      // Tenta usar a capitalização original do nome cadastrado:
      const original = (p.nome || '').split(/\s+/)[0];
      if (original) internoCadastrado = original;
      continue;
    }

    // 2. Não achou em pessoas — checar attendees
    const att = attendees.find(a => {
      const handle = (a.email || '').split('@')[0].toLowerCase();
      const nameNorm = normalize_(a.name);
      const fnFull = normalize_(raw);
      return (
        handle.indexOf(fn) !== -1 ||
        fn.indexOf(handle) !== -1 ||
        (nameNorm && (nameNorm.indexOf(fnFull) !== -1 || fnFull.indexOf(nameNorm) !== -1))
      );
    });
    if (att && att.email && att.email.toLowerCase().endsWith('@' + INTERNAL_DOMAIN)) {
      internoNaoCadastrado = true;
      continue;
    }
    externos.push(raw);
  }

  if (internoCadastrado) return { action: 'create', responsavel: internoCadastrado };
  if (internoNaoCadastrado) return { action: 'create', responsavel: '' };
  return { action: 'skip', reason: `assignees externos/desconhecidos: ${externos.join(', ')}` };
}

// ─────────────────────────────────────────────────────────────────────────
// Gmail labels
// ─────────────────────────────────────────────────────────────────────────

/**
 * Retorna a label pelo nome, criando-a se não existir.
 * Labels com '/' são automaticamente exibidas como nested no Gmail.
 */
function getOrCreateLabel_(name) {
  let label = GmailApp.getUserLabelByName(name);
  if (!label) label = GmailApp.createLabel(name);
  return label;
}

// ─────────────────────────────────────────────────────────────────────────
// Calendar lookup
// ─────────────────────────────────────────────────────────────────────────

/**
 * Busca evento no calendário primário ±2h da data do email cujo título bata.
 * Retorna o objeto CalendarEvent ou null.
 */
function findCalendarEvent_(searchTerm, emailDate) {
  if (!searchTerm) return null;
  const start = new Date(emailDate.getTime() - 24 * 60 * 60 * 1000);  // -24h
  const end = new Date(emailDate.getTime() + 2 * 60 * 60 * 1000);     // +2h
  const events = CalendarApp.getDefaultCalendar().getEvents(start, end, { search: searchTerm });
  if (!events.length) return null;
  // Heurística: pega o evento mais próximo da data do email
  events.sort((a, b) => Math.abs(a.getStartTime() - emailDate) - Math.abs(b.getStartTime() - emailDate));
  return events[0];
}

// ─────────────────────────────────────────────────────────────────────────
// HTTP helper pra Tasks 360 API
// ─────────────────────────────────────────────────────────────────────────

function api_(ctx, method, path, body) {
  const url = ctx.baseUrl + path;
  const opts = {
    method: method.toLowerCase(),
    headers: { 'x-api-key': ctx.apiKey },
    muteHttpExceptions: true,
  };
  if (body !== undefined) {
    opts.contentType = 'application/json';
    opts.payload = JSON.stringify(body);
  }
  const res = UrlFetchApp.fetch(url, opts);
  const code = res.getResponseCode();
  const text = res.getContentText();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (_) { data = text; }
  if (code < 200 || code >= 300) {
    throw new Error(`${method} ${path} → HTTP ${code}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
  }
  return data;
}

// ─────────────────────────────────────────────────────────────────────────
// Logging
// ─────────────────────────────────────────────────────────────────────────

function log_(ctx, msg) {
  ctx.log.push(msg);
  // Logger.log também escreve em "Executions" pra facilitar debug
  Logger.log(msg);
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers utilitários (úteis pra rodar à mão durante teste)
// ─────────────────────────────────────────────────────────────────────────

/** Lista clientes — útil pra testar a conectividade no editor. */
function debug_listClientes() {
  const props = PropertiesService.getScriptProperties();
  const ctx = { apiKey: props.getProperty('TASKS360_API_KEY'), baseUrl: props.getProperty('TASKS360_BASE_URL'), log: [] };
  const r = api_(ctx, 'GET', '/functions/v1/get-clientes?with_projetos=true');
  Logger.log(JSON.stringify(r, null, 2));
}

/** Roda main com janela ampliada (24h) — útil pra forçar reprocessar emails do dia. */
function debug_runWideWindow() {
  // Hack: troca a constante in-memory pra essa execução
  const original = SEARCH_WINDOW;
  // eslint-disable-next-line no-global-assign
  // (Não dá pra reassinalar const; comente este helper se quiser usar.)
  Logger.log('Pra ampliar janela, edite SEARCH_WINDOW no topo do arquivo temporariamente.');
}
