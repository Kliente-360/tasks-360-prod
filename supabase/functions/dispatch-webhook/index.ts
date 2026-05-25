// Edge Function: dispatch-webhook
//
// Intermediário entre os triggers do banco e os sistemas externos.
// Chamado pelo pg_net (via dispatch_webhook() SQL) quando:
//   - uma task SF é atualizada → event 'task.updated'
//   - um comment/reply em task SF é criado/editado → 'comment.*' / 'reply.*'
//
// Payload INTERNO de entrada (v2 · 2026-05-22): identificadores no top-level,
// external_ids e record completo dentro de `data` (trigger manda tudo).
//
//   task.updated:
//     { event, sent_at, task_id, data: { task_external_id, external_source,
//                                        record (todas colunas), old_record } }
//   comment.* / reply.*:
//     { event, sent_at, task_id, comment_id, is_reply,
//       data: { task_external_id, comment_external_id, parent_id,
//               parent_external_id, external_source,
//               record (todas colunas), old_record } }
//
// Payload EXTERNO enviado pra URL destino (slim, v2.1 · 2026-05-22):
//
//   task → WEBHOOK_URL_TASK:
//     { sent_at, task_id,
//       data: { task_external_id,
//               record: { titulo, descricao, responsavel, responsavel_id,
//                         prioridade, prazo, subetapa } } }
//
//   comment/reply → WEBHOOK_URL_COMMENT:
//     { sent_at, comment_id, is_reply,
//       data: { task_external_id, comment_external_id, parent_external_id,
//               record: { body } } }
//
// `responsavel` vai como nome textual (lookup em pessoas pela pessoa_id).
// `responsavel_id` vai como UUID direto (pessoa_id do registro).
// `comment_external_id` é null no create, valor no update.
// `is_reply` distingue comment vs reply; create vs update se diferencia
// olhando comment_external_id (null = create).
//
// Fluxo:
//   1. Valida Bearer token (DISPATCH_WEBHOOK_SECRET env).
//   2. Constrói payload slim a partir do payload interno.
//   3. Roteia pra WEBHOOK_URL_TASK ou WEBHOOK_URL_COMMENT.
//   4. Fetch síncrono com timeout de 10s.
//   5. Lê { external_id } do body de resposta.
//   6. Atualiza o registro no banco com external_id + webhook_sync_status.
//
// Auth de entrada (pg_net → dispatch-webhook): Authorization: Bearer <DISPATCH_WEBHOOK_SECRET>
//
// Auth de saída (dispatch-webhook → URL externa): OAuth 2.0 Client
// Credentials flow. Pra cada disparo:
//   1. Identifica o cliente da task (VB ou CTF pelo nome em clientes).
//   2. Pega access_token na URL OAuth do cliente (cache em memória, TTL 50min).
//   3. Faz POST no endpoint externo com Authorization: Bearer <token>.
//   4. Em 401, refaz o token (force=true) e re-tenta uma vez.
//
// Match cliente case-insensitive: contém "vb" → VB, contém "ctf" → CTF
// (mesmo critério da migration 2026-05-21_webhook_enabled_vb_ctf.sql).
//
// Env vars (Edge Functions > Settings > Secrets) — 1 par genérico + 5 por cliente:
//   DISPATCH_WEBHOOK_SECRET    — obrigatório; valida Bearer da entrada
//   WEBHOOK_TOKEN_URL_VB       — URL OAuth do VB (ex: .../services/oauth2/token)
//   WEBHOOK_CLIENT_ID_VB       — client_id (consumer key) do connected app VB
//   WEBHOOK_CLIENT_SECRET_VB   — client_secret (consumer secret) do VB
//   WEBHOOK_URL_TASK_VB        — endpoint externo do VB para task.updated
//   WEBHOOK_URL_COMMENT_VB     — endpoint externo do VB para comment.*/reply.*
//   WEBHOOK_TOKEN_URL_CTF      — URL OAuth do CTF
//   WEBHOOK_CLIENT_ID_CTF      — client_id do CTF
//   WEBHOOK_CLIENT_SECRET_CTF  — client_secret do CTF
//   WEBHOOK_URL_TASK_CTF       — endpoint externo do CTF para task.updated
//   WEBHOOK_URL_COMMENT_CTF    — endpoint externo do CTF para comment.*/reply.*

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL    = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY     = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const DISPATCH_SECRET = Deno.env.get('DISPATCH_WEBHOOK_SECRET') ?? '';

const TOKEN_URL_VB      = Deno.env.get('WEBHOOK_TOKEN_URL_VB')      ?? '';
const CLIENT_ID_VB      = Deno.env.get('WEBHOOK_CLIENT_ID_VB')      ?? '';
const CLIENT_SECRET_VB  = Deno.env.get('WEBHOOK_CLIENT_SECRET_VB')  ?? '';
const URL_TASK_VB       = Deno.env.get('WEBHOOK_URL_TASK_VB')       ?? '';
const URL_COMMENT_VB    = Deno.env.get('WEBHOOK_URL_COMMENT_VB')    ?? '';

const TOKEN_URL_CTF     = Deno.env.get('WEBHOOK_TOKEN_URL_CTF')     ?? '';
const CLIENT_ID_CTF     = Deno.env.get('WEBHOOK_CLIENT_ID_CTF')     ?? '';
const CLIENT_SECRET_CTF = Deno.env.get('WEBHOOK_CLIENT_SECRET_CTF') ?? '';
const URL_TASK_CTF      = Deno.env.get('WEBHOOK_URL_TASK_CTF')      ?? '';
const URL_COMMENT_CTF   = Deno.env.get('WEBHOOK_URL_COMMENT_CTF')   ?? '';

const FETCH_TIMEOUT_MS = 10_000;
// SF session default = 1h. Cacheamos 50min pra renovar antes de expirar
// e evitar o ping-pong de 401.
const TOKEN_TTL_MS     = 50 * 60 * 1000;

type Creds = {
  cliente:       string;
  token_url:     string;
  client_id:     string;
  client_secret: string;
  url_task:      string;
  url_comment:   string;
};

/**
 * Escolhe o conjunto completo (token_url, client_id, client_secret,
 * url_task, url_comment) baseado no nome do cliente.
 * Match case-insensitive: nome contém "vb" → VB, contém "ctf" → CTF.
 * Mantém o mesmo critério da migration 2026-05-21_webhook_enabled_vb_ctf.sql
 * que ligou o flag webhook_enabled nesses clientes.
 */
function pickCreds(clienteNome: string | null): Creds | null {
  if (!clienteNome) return null;
  const n = clienteNome.toLowerCase();
  if (n.includes('vb')) return {
    cliente: 'VB',
    token_url:     TOKEN_URL_VB,
    client_id:     CLIENT_ID_VB,
    client_secret: CLIENT_SECRET_VB,
    url_task:      URL_TASK_VB,
    url_comment:   URL_COMMENT_VB,
  };
  if (n.includes('ctf')) return {
    cliente: 'CTF',
    token_url:     TOKEN_URL_CTF,
    client_id:     CLIENT_ID_CTF,
    client_secret: CLIENT_SECRET_CTF,
    url_task:      URL_TASK_CTF,
    url_comment:   URL_COMMENT_CTF,
  };
  return null;
}

// Cache de access_token por cliente (in-memory, persiste entre warm starts
// da edge function). Em cold start o cache zera — tudo bem, primeira call
// faz nova request OAuth e popula. TTL 50min < session default do SF.
const tokenCache: Record<string, { access_token: string; expires_at: number }> = {};

/**
 * Pega access_token via OAuth Client Credentials. Cache hit retorna direto;
 * cache miss faz POST `application/x-www-form-urlencoded` na token_url.
 * `force=true` ignora o cache (usado no retry após 401).
 *
 * Retorna null em qualquer falha — caller decide o que fazer.
 */
async function getAccessToken(creds: Creds, force = false): Promise<string | null> {
  if (!creds.token_url || !creds.client_id || !creds.client_secret) return null;
  const cached = tokenCache[creds.cliente];
  if (!force && cached && cached.expires_at > Date.now()) {
    return cached.access_token;
  }
  const body = new URLSearchParams({
    grant_type:    'client_credentials',
    client_id:     creds.client_id,
    client_secret: creds.client_secret,
  });
  try {
    const resp = await fetch(creds.token_url, {
      method:  'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body:    body.toString(),
    });
    if (!resp.ok) {
      const txt = await resp.text().catch(() => '');
      console.error(`[dispatch-webhook] token fetch ${creds.cliente} ${resp.status}:`, txt.slice(0, 200));
      return null;
    }
    const data = await resp.json() as { access_token?: string };
    if (!data.access_token) {
      console.error(`[dispatch-webhook] token response missing access_token for ${creds.cliente}`);
      return null;
    }
    tokenCache[creds.cliente] = {
      access_token: data.access_token,
      expires_at:   Date.now() + TOKEN_TTL_MS,
    };
    return data.access_token;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[dispatch-webhook] token fetch error for ${creds.cliente}:`, msg);
    return null;
  }
}

/**
 * Busca o nome do cliente ligado a uma task. Usado pra escolher creds.
 * 2 queries simples (task → cliente) — JOIN nested seria menos legível
 * pelo custo de ergonomia da supabase-js.
 */
async function getClienteNomeForTask(taskId: string): Promise<string | null> {
  const { data: t } = await sb
    .from('tasks')
    .select('cliente_id')
    .eq('id', taskId)
    .maybeSingle();
  const clienteId = (t as { cliente_id: string | null } | null)?.cliente_id;
  if (!clienteId) return null;
  const { data: c } = await sb
    .from('clientes')
    .select('nome')
    .eq('id', clienteId)
    .maybeSingle();
  return (c as { nome: string } | null)?.nome ?? null;
}

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status, headers: { 'content-type': 'application/json' },
  });
const err = (status: number, code: string, message: string) =>
  json(status, { error: { code, message } });

async function setTaskSyncStatus(
  taskId: string,
  status: 'synced' | 'error',
  errorMsg: string | null,
  externalId?: string,
) {
  const patch: Record<string, unknown> = {
    webhook_sync_status: status,
    webhook_sync_error:  errorMsg,
  };
  if (externalId) patch.external_id = externalId;
  const { error } = await sb.from('tasks').update(patch).eq('id', taskId);
  if (error) console.error('[dispatch-webhook] setTaskSyncStatus failed:', error.message);
}

async function setCommentExternalId(commentId: string, externalId: string) {
  const { error } = await sb
    .from('task_comments')
    .update({ external_id: externalId, external_source: 'salesforce', last_ingest_at: new Date().toISOString() })
    .eq('id', commentId);
  if (error) console.error('[dispatch-webhook] setCommentExternalId failed:', error.message);
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return err(405, 'method_not_allowed', 'POST only');

  // Auth opcional: se DISPATCH_WEBHOOK_SECRET estiver setado, valida o Bearer.
  // Sem env var, aceita qualquer request (função só é chamada pelo pg_net interno).
  const auth = req.headers.get('authorization') ?? '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (DISPATCH_SECRET && token !== DISPATCH_SECRET) {
    return err(401, 'unauthorized', 'invalid or missing Authorization');
  }

  let payload: {
    event:       string;
    sent_at:     string;
    task_id?:    string;
    comment_id?: string;
    is_reply?:   boolean;
    data:        Record<string, unknown>;
  };
  try { payload = await req.json(); }
  catch { return err(400, 'invalid_json', 'body must be valid JSON'); }

  const { event, data } = payload;
  if (!event || !data) return err(422, 'missing_fields', 'event and data are required');

  const isTaskEvent    = event === 'task.updated';
  const isCommentEvent = ['comment.created', 'comment.updated',
                          'reply.created',   'reply.updated'].includes(event);

  if (!isTaskEvent && !isCommentEvent) {
    return json(200, { skipped: true, reason: 'unknown event type' });
  }

  // Identificadores agora vivem no top-level (payload v2).
  const taskId    = payload.task_id;
  const commentId = payload.comment_id;

  // Descobre o cliente da task (pra escolher conjunto OAuth + URLs).
  // task event tem cliente_id no record; comment/reply só tem task_id e
  // precisa de lookup. Ambos terminam em "qual cliente é VB/CTF?".
  let clienteNome: string | null = null;
  if (isTaskEvent) {
    const fullRecord = (data.record ?? {}) as Record<string, unknown>;
    const clienteId  = fullRecord.cliente_id as string | null | undefined;
    if (clienteId) {
      const { data: c } = await sb
        .from('clientes')
        .select('nome')
        .eq('id', clienteId)
        .maybeSingle();
      clienteNome = (c as { nome: string } | null)?.nome ?? null;
    }
  } else if (taskId) {
    clienteNome = await getClienteNomeForTask(taskId);
  }
  const creds = pickCreds(clienteNome);
  if (!creds) {
    // Sem creds = não temos como autenticar no sistema externo.
    // Não é erro de programação, apenas o cliente não está habilitado.
    // Marca o status como erro pra ficar visível no app sem virar exception.
    const msg = clienteNome
      ? `no credentials configured for cliente "${clienteNome}"`
      : 'no cliente linked to task; cannot pick credentials';
    if (taskId) await setTaskSyncStatus(taskId, 'error', msg);
    return json(200, { skipped: true, reason: msg });
  }

  // URL agora vem do conjunto de credenciais do cliente.
  const targetUrl = isTaskEvent ? creds.url_task : creds.url_comment;
  if (!targetUrl) {
    const msg = `env var WEBHOOK_URL_${isTaskEvent ? 'TASK' : 'COMMENT'}_${creds.cliente} not set`;
    if (taskId) await setTaskSyncStatus(taskId, 'error', msg);
    return json(200, { skipped: true, reason: msg });
  }

  // Constrói o payload SLIM enviado pra URL externa. Mantém estrutura
  // simétrica (sent_at/ids top-level + data{external_ids, record}), mas
  // só com os campos que o sistema externo realmente usa.
  let outboundBody: Record<string, unknown>;

  if (isTaskEvent) {
    const fullRecord = (data.record ?? {}) as Record<string, unknown>;
    // Lookup do nome do responsável (pessoa_id é UUID interno; SF/n8n
    // não tem como interpretar). Best-effort: se falhar, manda null.
    let responsavel: string | null = null;
    const pessoaId = fullRecord.pessoa_id as string | null | undefined;
    if (pessoaId) {
      const { data: p } = await sb
        .from('pessoas')
        .select('nome')
        .eq('id', pessoaId)
        .maybeSingle();
      responsavel = (p as { nome: string } | null)?.nome ?? null;
    }
    outboundBody = {
      sent_at: payload.sent_at,
      task_id: taskId,
      data: {
        task_external_id: data.task_external_id,
        record: {
          titulo:          fullRecord.titulo ?? null,
          descricao:       fullRecord.descricao ?? null,
          responsavel,
          responsavel_id:  pessoaId ?? null,
          prioridade:      fullRecord.prioridade ?? null,
          prazo:           fullRecord.prazo ?? null,
          subetapa:        fullRecord.subetapa ?? null,
        },
      },
    };
  } else {
    // comment / reply
    const fullRecord = (data.record ?? {}) as Record<string, unknown>;
    outboundBody = {
      sent_at:    payload.sent_at,
      comment_id: commentId,
      is_reply:   payload.is_reply ?? false,
      data: {
        task_external_id:    data.task_external_id,
        comment_external_id: data.comment_external_id ?? null,
        parent_external_id:  data.parent_external_id ?? null,
        record: {
          body: fullRecord.body ?? null,
        },
      },
    };
  }

  // Log do que vai ser disparado (debug do dev SF).
  console.log(`[dispatch-webhook] ${event} → ${creds.cliente} POST ${targetUrl}`);
  console.log(`[dispatch-webhook] payload:`, JSON.stringify(outboundBody));

  // Pega access_token via OAuth Client Credentials (cache hit ou nova call).
  const accessToken = await getAccessToken(creds);
  if (!accessToken) {
    const errMsg = `oauth token fetch failed for ${creds.cliente}`;
    if (taskId) await setTaskSyncStatus(taskId, 'error', errMsg);
    return err(502, 'oauth_failed', errMsg);
  }

  // Helper que faz o POST no endpoint externo com o token atual.
  // Timeout 10s + AbortController. Encapsulado pra rodar 2x (retry no 401).
  const callExternal = async (token: string): Promise<{ ok: true; resp: Response } | { ok: false; status: number; code: string; msg: string }> => {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const resp = await fetch(targetUrl, {
        method:  'POST',
        headers: {
          'content-type':  'application/json',
          'authorization': `Bearer ${token}`,
        },
        body:    JSON.stringify(outboundBody),
        signal:  controller.signal,
      });
      return { ok: true, resp };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const isTimeout = e instanceof Error && e.name === 'AbortError';
      return {
        ok:     false,
        status: 502,
        code:   isTimeout ? 'upstream_timeout' : 'upstream_unreachable',
        msg:    isTimeout ? 'upstream timeout (10s)' : `fetch failed: ${msg}`,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  };

  let attempt = await callExternal(accessToken);
  // 401 = token expirou em background. Refresh forçado + retry uma vez.
  if (attempt.ok && attempt.resp.status === 401) {
    const freshToken = await getAccessToken(creds, true);
    if (freshToken) {
      // Drena o body da resposta anterior pra liberar a conexão.
      try { await attempt.resp.text(); } catch { /* noop */ }
      attempt = await callExternal(freshToken);
    }
  }

  if (!attempt.ok) {
    if (taskId) await setTaskSyncStatus(taskId, 'error', attempt.msg);
    return err(attempt.status, attempt.code, attempt.msg);
  }

  const externalResp = attempt.resp;
  console.log(`[dispatch-webhook] ${creds.cliente} upstream ${externalResp.status}`);

  if (!externalResp.ok) {
    const body = await externalResp.text().catch(() => '');
    const errMsg = `upstream ${externalResp.status}: ${body.slice(0, 200)}`;
    console.error(`[dispatch-webhook] error response body:`, body.slice(0, 500));
    if (taskId) await setTaskSyncStatus(taskId, 'error', errMsg);
    return err(502, 'upstream_error', errMsg);
  }

  let respBody: Record<string, unknown>;
  try { respBody = await externalResp.json(); }
  catch {
    console.log(`[dispatch-webhook] response was not JSON, marking synced anyway`);
    if (taskId) await setTaskSyncStatus(taskId, 'synced', null);
    return json(200, { action: 'synced', external_id: null, note: 'response was not JSON' });
  }
  console.log(`[dispatch-webhook] upstream body:`, JSON.stringify(respBody));

  const externalId = respBody.external_id != null
    ? String(respBody.external_id).trim() : null;

  if (isTaskEvent) {
    if (!taskId) return json(200, { action: 'synced', note: 'no task_id in data' });

    const { data: current } = await sb
      .from('tasks')
      .select('external_id')
      .eq('id', taskId)
      .maybeSingle();

    const alreadySet = (current as { external_id: string | null } | null)?.external_id === externalId;

    await setTaskSyncStatus(
      taskId,
      'synced',
      null,
      externalId && !alreadySet ? externalId : undefined,
    );

    // action='synced' nas duas variantes — o que difere é só se reescrevemos
    // external_id local. Antes era 'no_change' vs 'updated', mas o nome
    // 'no_change' confundia: dava a impressão de que NADA foi sincronizado,
    // quando na verdade o POST foi feito e o SF recebeu os campos novos.
    return json(200, {
      action:                 'synced',
      table:                  'tasks',
      id:                     taskId,
      external_id:            externalId,
      external_id_was_already_set: alreadySet,
    });
  }

  // Comment / reply — commentId chega no top-level (payload v2).
  if (taskId) await setTaskSyncStatus(taskId, 'synced', null);

  if (!commentId || !externalId) {
    return json(200, { action: 'synced', external_id: externalId });
  }

  const { data: current } = await sb
    .from('task_comments')
    .select('external_id')
    .eq('id', commentId)
    .maybeSingle();

  const alreadySet = (current as { external_id: string | null } | null)?.external_id === externalId;

  if (!alreadySet) {
    // Seta last_ingest_at pra o trigger de comment não disparar webhook de saída.
    await setCommentExternalId(commentId, externalId);
  }

  return json(200, {
    action:                      'synced',
    table:                       'task_comments',
    id:                          commentId,
    external_id:                 externalId,
    external_id_was_already_set: alreadySet,
  });
});
