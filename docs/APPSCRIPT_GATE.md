# AppScript · gate antes de criar tarefa via IA

Trecho pra adicionar no Apps Script (Cowork) que decide se uma reunião/email deve gerar tarefas no tasks 360. Aplica 2 regras:

1. **Domínio precisa estar cadastrado** num cliente do app. Reunião com prospect/lead (domínio desconhecido) **não** vira tarefa.
2. **Cliente não pode ter `webhook_enabled=true`** (hoje VB e CTF). Esses recebem tarefas pelo fluxo Salesforce bidirecional — ingest IA paralelo duplica.

O servidor já protege contra (2) retornando `409 cliente_blocks_ai_ingest` desde v1.03.145, mas o gate no AppScript:
- Evita chamadas API desnecessárias (economiza quota)
- Captura caso (1) que o servidor não cobre (servidor aceita domínio desconhecido se admin digitar nome de cliente manualmente — IA não tem essa proteção)

---

## Código

```js
// =========================================================================
//  CONFIG · trocar pelos seus valores
// =========================================================================
const TASKS360_API_BASE = 'https://<project-ref>.supabase.co/functions/v1';
const TASKS360_API_KEY  = 'sua-ingest-api-key';

// Domínios do PRÓPRIO time (ex: 'kliente360.com') — participantes desses
// emails são considerados "internos" e ignorados pra resolver o cliente.
const OWN_DOMAINS = ['kliente360.com'];


// =========================================================================
//  CACHE de clientes · 1 fetch por execução
// =========================================================================
let _clientesCache = null;

function fetchClientes_() {
  if (_clientesCache) return _clientesCache;
  const resp = UrlFetchApp.fetch(TASKS360_API_BASE + '/get-clientes', {
    method: 'get',
    headers: { 'x-api-key': TASKS360_API_KEY },
    muteHttpExceptions: true,
  });
  if (resp.getResponseCode() !== 200) {
    throw new Error('get-clientes falhou: ' + resp.getResponseCode() + ' ' + resp.getContentText());
  }
  const data = JSON.parse(resp.getContentText());
  _clientesCache = data.clientes || [];
  return _clientesCache;
}


// =========================================================================
//  Match domínio → cliente
// =========================================================================
function clienteByDomain_(domain) {
  if (!domain) return null;
  const d = String(domain).trim().toLowerCase();
  if (!d) return null;
  const clientes = fetchClientes_();
  for (const c of clientes) {
    const doms = c.dominios || [];
    for (const cd of doms) {
      if (String(cd).trim().toLowerCase() === d) return c;
    }
  }
  return null;
}


// =========================================================================
//  Gate · decide se ingere
// =========================================================================
/**
 * Decide se uma reunião / email deve gerar tarefa(s) no app.
 *
 * @param {string[]} attendeeEmails  Emails de todos os participantes.
 * @return {{ should: boolean, reason: string, cliente?: object }}
 */
function shouldIngest_(attendeeEmails) {
  // 1. Filtra participantes EXTERNOS (não-internos)
  const externalDomains = [];
  for (const email of attendeeEmails || []) {
    const at = String(email).indexOf('@');
    if (at < 0) continue;
    const domain = String(email).slice(at + 1).trim().toLowerCase();
    if (!domain) continue;
    if (OWN_DOMAINS.some(d => d.toLowerCase() === domain)) continue;
    if (externalDomains.indexOf(domain) < 0) externalDomains.push(domain);
  }

  // 2. Reunião interna pura → skip (decisão de produto, pode ajustar)
  if (externalDomains.length === 0) {
    return { should: false, reason: 'reuniao_interna' };
  }

  // 3. Procura cliente cadastrado por domínio
  let matched = null;
  for (const d of externalDomains) {
    const c = clienteByDomain_(d);
    if (c) { matched = c; break; }
  }

  // 4. Domínio externo não cadastrado → prospect/lead, skip
  if (!matched) {
    return {
      should: false,
      reason: 'dominio_desconhecido',
      detail: 'externos=' + externalDomains.join(','),
    };
  }

  // 5. Cliente com webhook bidirecional SF → skip (anti-duplicação)
  if (matched.webhook_enabled === true) {
    return {
      should: false,
      reason: 'cliente_webhook_enabled',
      cliente: matched,
    };
  }

  // 6. Tudo OK · pode ingerir
  return { should: true, reason: 'ok', cliente: matched };
}


// =========================================================================
//  Exemplo de uso no fluxo principal
// =========================================================================
function processarReuniao(evento) {
  const attendees = (evento.attendees || []).map(a => a.email);

  const gate = shouldIngest_(attendees);
  if (!gate.should) {
    console.log('[gate] skip ' + evento.id + ' · ' + gate.reason +
                (gate.detail ? ' · ' + gate.detail : ''));
    return;
  }

  // Aqui faz o que já fazia: extrair tasks da transcrição/notas e
  // chamar ingest-task com cliente=<gate.cliente.nome>, criado_por_ia=true.
  const tasks = extrairTasksDaReuniao(evento);
  for (const t of tasks) {
    UrlFetchApp.fetch(TASKS360_API_BASE + '/ingest-task', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-api-key': TASKS360_API_KEY },
      muteHttpExceptions: true,
      payload: JSON.stringify({
        external_id: 'cowork-' + evento.id + '-' + t.idx,
        titulo: t.titulo,
        descricao: t.descricao,
        cliente: gate.cliente.nome,
        criado_por_ia: true,
      }),
    });
  }
}
```

---

## Comportamento esperado

| Cenário | Decisão | Razão |
|---|---|---|
| Reunião só com colegas internos (kliente360.com) | Skip | `reuniao_interna` |
| Reunião com `cliente@bodytech.com.br` | **Ingere** com `cliente="Bodytech"` | `ok` |
| Reunião com `comprador@corpay.com.br` (VB/CTF) | Skip | `cliente_webhook_enabled` |
| Reunião com `prospect@startup-x.com` (domínio não cadastrado) | Skip | `dominio_desconhecido` |
| Reunião com **vários** externos, um match + um desconhecido | Ingere usando o cliente do primeiro match | `ok` |

---

## Manutenção

- **Adicionar/remover domínio em cliente** → editar via UI no app em **Cadastros > Clientes > Domínios**. O AppScript pega na próxima execução (cache TTL = 1 execução).
- **Adicionar/remover cliente do bloqueio IA** → toggle `webhook_enabled` no DB ou via SQL. Mesma propagação.
- **Mudar domínios internos próprios** → editar `OWN_DOMAINS` no topo do script.

O servidor sempre retém o gate final (`409 cliente_blocks_ai_ingest`), então mesmo se o AppScript ficar desatualizado, não há vazamento.
