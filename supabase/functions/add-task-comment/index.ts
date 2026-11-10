// Edge Function: add-task-comment
// Posta um comentário numa task pelo id interno (uuid) · usada pela
// tool MCP `add_task_comment`.
//
// Auth: header x-api-key (INGEST_API_KEYS). Header opcional
// x-tasks360-user (e-mail de quem chamou pelo MCP) vira o autor.
//
// Body JSON:
//   { "task_id": "uuid", "texto": "comentário", "visivel_cliente": false }
//
// visivel_cliente (padrão false):
//   false · interno: não aparece no portal e não vai para o Salesforce
//   true  · aparece no portal, os usuários do cliente recebem aviso no sino
//           (trigger trg_notif_cliente_comentario) e, em task do Salesforce
//           com webhook ligado, vira comment.created na org do cliente
// Autor: pessoa logada no MCP; sem ela, MCP_COMMENT_AUTHOR_DEFAULT ou
// "Time de desenvolvimento" (_shared/autor.ts).
// O responsável da task recebe aviso no sino (comment_on_my_task), salvo se
// for o próprio autor.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { autorDoComentario } from '../_shared/autor.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CHARS = 10000;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const err = (status: number, code: string, message: string) => json(status, { error: { code, message } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return err(405, 'method_not_allowed', 'POST only');
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !API_KEYS.includes(apiKey)) return err(401, 'unauthorized', 'invalid or missing X-API-Key');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(400, 'invalid_json', 'body must be valid JSON'); }

  const taskId = String(body.task_id ?? '').trim();
  if (!UUID_RE.test(taskId)) return err(422, 'invalid_task_id', 'task_id deve ser o uuid da task');
  const texto = String(body.texto ?? '').trim();
  if (!texto) return err(422, 'missing_texto', 'texto é obrigatório');
  if (texto.length > MAX_CHARS) return err(422, 'texto_longo', `texto com mais de ${MAX_CHARS} caracteres`);
  if (body.visivel_cliente !== undefined && typeof body.visivel_cliente !== 'boolean') {
    return err(422, 'invalid_visivel_cliente', 'visivel_cliente deve ser true ou false');
  }
  const visivelCliente = body.visivel_cliente === true;

  const { data: task, error: tErr } = await sb
    .from('tasks')
    .select('id, titulo, pessoa_id')
    .eq('id', taskId)
    .maybeSingle();
  if (tErr) return err(500, 'db_error', tErr.message);
  if (!task) return err(404, 'task_not_found', `task ${taskId} não existe`);

  // Autor: pessoa do e-mail que chamou o MCP; sem ela, o rótulo padrão
  const email = (req.headers.get('x-tasks360-user') || '').trim().toLowerCase();
  let autor: { id: string; nome: string } | null = null;
  if (email) {
    const { data: p } = await sb.from('pessoas').select('id, nome').ilike('email', email).maybeSingle();
    autor = p ?? null;
  }
  const assinatura = autorDoComentario(autor, Deno.env.get('MCP_COMMENT_AUTHOR_DEFAULT'));
  const agora = new Date().toISOString();

  const { data: comentario, error: cErr } = await sb
    .from('task_comments')
    .insert({
      task_id: taskId,
      body: texto,
      author: assinatura.nome,
      author_pessoa_id: assinatura.pessoaId,
      visivel_cliente: visivelCliente,
      from_cliente: false,
      posted_em: agora,
    })
    .select('id, task_id, author, body, posted_em')
    .single();
  if (cErr) return err(500, 'db_error', cErr.message);

  if (task.pessoa_id && task.pessoa_id !== assinatura.pessoaId) {
    const { error: nErr } = await sb.from('notifications').insert({
      recipient_pessoa_id: task.pessoa_id,
      kind: 'comment_on_my_task',
      payload: {
        author: comentario.author, task_id: taskId, titulo: task.titulo,
        comment_id: comentario.id, preview: texto.slice(0, 200),
      },
      source_task_id: taskId,
      source_comment_id: comentario.id,
    });
    if (nErr) console.warn('[add-task-comment] aviso', nErr.message);
  }

  return json(201, { ...comentario, titulo: task.titulo, visivel_cliente: visivelCliente });
});
