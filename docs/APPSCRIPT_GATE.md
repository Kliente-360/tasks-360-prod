# AppScript · Tasks 360 — Gemini Notes Ingestor (atualizado)

Script completo do Google Apps Script que lê emails do Gemini, extrai action items e cria tasks no Tasks 360. **Versão atualizada (jun/2026)** com 2 gates novos vs. versão anterior:

1. **Skip se cliente identificado tem `webhook_enabled=true`** (VB, CTF — recebem tarefas via fluxo Salesforce, ingest IA duplicaria)
2. **Skip se TODOS os domínios externos são desconhecidos** (prospect/lead — não vira tarefa)

A versão anterior já cobria: reunião 100% interna, sem attendees, attendees sem externos, cliente `eh_interno`, action items vazios. Os 2 novos acima fecham os buracos restantes.

> O servidor (`ingest-task`) também rejeita ingest IA pra clientes `webhook_enabled` retornando 409 — gate no AppScript é otimização de quota + cobre o caso "domínio desconhecido" que o servidor não tem como saber (servidor aceita qualquer cliente cadastrado).

---

## Setup

1. Project Settings → Script Properties → adicionar:
   - `TASKS360_API_KEY = <sua-key>`
   - `TASKS360_BASE_URL = https://<project-ref>.supabase.co`
2. Rodar `main` manualmente uma vez → aprovar permissões (Gmail, Calendar, UrlFetch).
3. Triggers → Add Trigger:
   - Function: `main` · Event: Time-driven · Type: Minutes timer · Every: 10 min

---

## Código completo

```js
/**
 * Tasks 360 — Gemini Notes Ingestor
 *
 * Roda em Google Apps Script (script.google.com).
 * A cada N minutos: busca emails do Gemini, extrai action items, cria tasks no Tasks 360.
 *
 * GATES de skip (em ordem no fluxo):
 *   1. Nenhum action item                  → label skip
 *   2. Reunião 100% interna                 → label skip
 *   3. Sem calendar event / sem attendees   → label skip
 *   4. Cliente identificado e eh_interno    → label skip
 *   5. Cliente identificado e webhook_enabled (VB/CTF — usam SF) → label skip
 *   6. Nenhum cliente identificado (prospect/lead — domínio desconhecido) → label skip
 *
 * SAFE TO RE-RUN: external_id é determinístico, ingest_task faz UPSERT.
 */

// ─────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────

const INTERNAL_DOMAIN = 'kliente360.com';
const GEMINI_SENDER = 'gemini-notes@google.com';
const SEARCH_WINDOW = 'newer_than:2h';
const MAX_THREADS_PER_RUN = 25;

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

  const clientes = api_(ctx, 'GET', '/functions/v1/get-clientes?with_projetos=true').clientes || [];
  const pessoas = api_(ctx, 'GET', '/functions/v1/get-pessoas?with_load=false').pessoas || [];
  log_(ctx, `Catálogo: ${clientes.length} clientes, ${pessoas.length} pessoas`);

  const processedLabel = getOrCreateLabel_(PROCESSED_LABEL);
  const skipLabel      = getOrCreateLabel_(SKIP_LABEL);

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
      labelToApply = result.skipped_meeting ? skipLabel : processedLabel;
    } catch (err) {
      counters.errors++;
      log_(ctx, `ERROR thread ${thread.getId()}: ${err.message}\n${err.stack || ''}`);
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

  // 3. Calendar event pra obter participantes
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
  if (!attendees.length) {
    log_(ctx, '  → calendar event não encontrado, sem attendees pra validar, skip');
    result.skipped_meeting = true;
    return result;
  }
  if (!hasExternal) {
    log_(ctx, '  → nenhum attendee externo, skip');
    result.skipped_meeting = true;
    return result;
  }

  // 5. Identificar cliente (com detecção de conflito)
  const findResult = findCliente_(title, attendees, clientes);
  let cliente = findResult.cliente || null;
  if (findResult.conflict) {
    log_(ctx, `  ⚠️ CONFLITO de cliente (múltiplos matches): ${findResult.conflict.join(', ')} — tasks serão criadas SEM cliente`);
  }

  // 5.1. NOVO GATE: cliente NÃO identificado (sem match em nenhuma etapa,
  //      e sem conflito) → reunião com externo de domínio desconhecido →
  //      provavelmente prospect/lead → skip.
  //      Conflito (múltiplos matches) NÃO cai aqui — é cliente real,
  //      apenas ambíguo, mantém fluxo de "criar sem cliente" pra triagem.
  if (!cliente && !findResult.conflict) {
    const externos = externalDomainsFromAttendees_(attendees);
    log_(ctx, `  → domínio externo não cadastrado (${[...externos].join(',') || '?'}) — provavelmente prospect, skip`);
    result.skipped_meeting = true;
    return result;
  }

  // 5.2. Cliente identificado e eh_interno → skip (legado)
  if (cliente && cliente.eh_interno) {
    log_(ctx, `  → cliente "${cliente.nome}" é interno, skip`);
    result.skipped_meeting = true;
    return result;
  }

  // 5.3. NOVO GATE: cliente com integração Salesforce bidirecional
  //      (webhook_enabled=true · hoje VB e CTF) → ingest IA duplicaria
  //      o fluxo SF→ingest-task. Skip.
  if (cliente && cliente.webhook_enabled === true) {
    log_(ctx, `  → cliente "${cliente.nome}" tem webhook_enabled (integração SF bidi), skip ingest IA`);
    result.skipped_meeting = true;
    return result;
  }

  // 6. Projeto default
  const projeto = (cliente && cliente.projetos && cliente.projetos.length === 1) ? cliente.projetos[0].nome : null;
  log_(ctx, `  cliente="${cliente ? cliente.nome : '∅'}" projeto="${projeto || '—'}" attendees=${attendees.length}`);

  // 6.5. Resumo da reunião
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
    if (cliente) payload.cliente = cliente.nome;
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

function extractMeetingTitle_(subject) {
  const m = subject.match(/"([^"]+)"/);
  return m ? m[1].trim() : '';
}

function extractActionItems_(body) {
  const sectionRe = /Pr[óo]ximas etapas sugeridas([\s\S]+?)(Registros da reuni[ãa]o|A se[çc][ãa]o "Pr[óo]ximas|Google LLC|$)/i;
  const sec = body.match(sectionRe);
  const text = sec ? sec[1] : body;

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

function extractResumo_(body) {
  if (!body) return '';
  const m = body.match(/(?:^|\n)\s*Resumo\s*\n+([\s\S]+?)(?:\n\s*\n|\nPr[óo]ximas etapas|\nRegistros da reuni[ãa]o|$)/i);
  if (!m) return '';
  let txt = m[1].replace(/\s+/g, ' ').trim();
  if (txt.length > 280) txt = txt.slice(0, 277).trimEnd() + '…';
  return txt;
}

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

function safeMessageId_(msg) {
  let mid = '';
  try { mid = msg.getHeader('Message-ID') || ''; } catch (_) { mid = ''; }
  if (!mid) mid = msg.getId();
  return mid.replace(/[<>]/g, '').replace(/[^a-zA-Z0-9._-]/g, '-').slice(0, 80);
}

function normalize_(s) {
  return (s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
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
 *   1. Título da reunião contém o nome do cliente
 *   2. Domínio do attendee externo está em cliente.dominios
 *   3. Substring fallback: nome do cliente está no domínio do attendee
 */
function findCliente_(title, attendees, clientes) {
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

  const externalDomains = externalDomainsFromAttendees_(attendees);
  if (externalDomains.size) {
    const domainMatches = clientes.filter(c => {
      const list = Array.isArray(c.dominios) ? c.dominios : [];
      return list.some(d => externalDomains.has((d || '').toLowerCase().trim()));
    });
    if (domainMatches.length === 1) return { cliente: domainMatches[0] };
    if (domainMatches.length > 1) return { conflict: domainMatches.map(c => c.nome) };

    const subMatches = clientes.filter(c => {
      const nc = normalize_(c.nome);
      return nc && [...externalDomains].some(dom => dom.indexOf(nc) !== -1);
    });
    if (subMatches.length === 1) return { cliente: subMatches[0] };
    if (subMatches.length > 1) return { conflict: subMatches.map(c => c.nome) };
  }

  return {};
}

function externalDomainsFromAttendees_(attendees) {
  const set = new Set();
  for (const a of attendees) {
    if (!a.email) continue;
    const dom = (a.email.split('@')[1] || '').toLowerCase().trim();
    if (dom && dom !== INTERNAL_DOMAIN) set.add(dom);
  }
  return set;
}

function decideAssignee_(assignees, pessoas, attendees) {
  let internoCadastrado = null;
  let internoNaoCadastrado = false;
  const externos = [];

  for (const raw of assignees) {
    const fn = firstName_(raw);
    if (!fn) continue;

    const p = pessoas.find(p => firstName_(p.nome) === fn);
    if (p) {
      internoCadastrado = firstName_(p.nome).charAt(0).toUpperCase() + firstName_(p.nome).slice(1);
      const original = (p.nome || '').split(/\s+/)[0];
      if (original) internoCadastrado = original;
      continue;
    }

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

function getOrCreateLabel_(name) {
  let label = GmailApp.getUserLabelByName(name);
  if (!label) label = GmailApp.createLabel(name);
  return label;
}

// ─────────────────────────────────────────────────────────────────────────
// Calendar lookup
// ─────────────────────────────────────────────────────────────────────────

function findCalendarEvent_(searchTerm, emailDate) {
  if (!searchTerm) return null;
  const start = new Date(emailDate.getTime() - 24 * 60 * 60 * 1000);
  const end = new Date(emailDate.getTime() + 2 * 60 * 60 * 1000);
  const events = CalendarApp.getDefaultCalendar().getEvents(start, end, { search: searchTerm });
  if (!events.length) return null;
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
  Logger.log(msg);
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers utilitários (úteis pra rodar à mão durante teste)
// ─────────────────────────────────────────────────────────────────────────

function debug_listClientes() {
  const props = PropertiesService.getScriptProperties();
  const ctx = { apiKey: props.getProperty('TASKS360_API_KEY'), baseUrl: props.getProperty('TASKS360_BASE_URL'), log: [] };
  const r = api_(ctx, 'GET', '/functions/v1/get-clientes?with_projetos=true');
  Logger.log(JSON.stringify(r, null, 2));
}
```

---

## Mudanças vs versão anterior (jun/2026)

| Linha aprox. | Antes | Depois |
|---|---|---|
| Header docstring | Lista de gates incompleta | 6 gates documentados em ordem |
| `processThread_` · seção 5 | Cliente null → criava task com "⚠ Cliente sugerido: ?" | **Skip** se `!cliente && !conflict` (prospect) |
| `processThread_` · seção 5 | Não checava webhook_enabled | **Skip** se `cliente.webhook_enabled === true` (VB/CTF) |

Conflito (múltiplos matches) continua gerando task **sem cliente** com prefixo descritivo — não é prospect, é cliente real ambíguo, vai pra Triagem.

## Funções dead-code removidas

Versão anterior tinha 3 funções legadas referenciadas em comentários:
- `matchClienteByTitle_` (stub que delegava a `findCliente_`)
- `matchClienteByDomain_` (substituída pela etapa 2 de `findCliente_`)
- `matchClienteByAttendees_` (substituída pela etapa 3 de `findCliente_`)
- `debug_runWideWindow` (placeholder que só logava aviso)

Removidas. `debug_listClientes` mantido (útil pra testar conectividade).

## Teste pós-deploy

Roda `debug_listClientes` no editor após salvar — confira que o output já traz `webhook_enabled` em cada cliente. Se vier sem, o get-clientes ainda não foi redeployado.
