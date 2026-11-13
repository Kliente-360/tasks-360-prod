// Edge Function: log-time-entry
// Lança horas no Timesheet (lançamento manual: data + duração) · usada pela
// tool MCP `log_horas`. Grava igual ao formulário do app: manual=true,
// horário sintético (hoje termina agora; dia passado termina às 18h).
//
// Auth: header x-api-key (INGEST_API_KEYS). Header x-tasks360-user (e-mail
// de quem chamou pelo MCP) identifica quem lança.
//
// Body JSON:
//   { "task_id": "uuid", "horas": 1.5 | "minutos": 90, "data": "YYYY-MM-DD"?,
//     "nota": "o que foi feito", "pessoa": "nome ou uuid"? }
//
// Regras (espelham o app):
//   - nota com pelo menos 5 caracteres; duração de 1 min a 24 h; sem data futura
//   - por padrão as horas são de quem chamou; lançar para outra pessoa só admin
//   - sem e-mail identificado (token legado), `pessoa` é obrigatório
//   - tarefa arquivada não recebe horas
//   - repetir a mesma chamada (mesma tarefa, pessoa, dia, duração e nota)
//     não duplica: devolve o registro existente com action 'unchanged'

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { janelaDoLancamento, dataSaoPaulo } from '../_shared/lancamento.ts';
import { tarefaPrivada } from '../_shared/acesso.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS     = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_NOTA = 5;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const err = (status: number, code: string, message: string) => json(status, { error: { code, message } });

type Pessoa = { id: string; nome: string; role: string; arquivado_em: string | null; is_ceo?: boolean | null };
const COLS_PESSOA = 'id, nome, role, arquivado_em, is_ceo';

Deno.serve(async (req) => {
  if (req.method !== 'POST') return err(405, 'method_not_allowed', 'POST only');
  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !API_KEYS.includes(apiKey)) return err(401, 'unauthorized', 'invalid or missing X-API-Key');

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err(400, 'invalid_json', 'body must be valid JSON'); }

  const taskId = String(body.task_id ?? '').trim();
  if (!UUID_RE.test(taskId)) return err(422, 'invalid_task_id', 'task_id deve ser o uuid da task');

  // Duração: minutos tem precedência; senão horas (decimal)
  let minutos: number;
  if (body.minutos !== undefined) minutos = Number(body.minutos);
  else if (body.horas !== undefined) minutos = Number(body.horas) * 60;
  else return err(422, 'missing_duracao', 'informe horas ou minutos');
  minutos = Math.round(minutos);

  const nota = String(body.nota ?? '').trim();
  if (nota.length < MIN_NOTA) return err(422, 'nota_curta', `nota é obrigatória, com pelo menos ${MIN_NOTA} caracteres (o que foi feito)`);
  if (nota.length > 2000) return err(422, 'nota_longa', 'nota com mais de 2000 caracteres');

  const agora = new Date();
  const data = body.data ? String(body.data).trim() : dataSaoPaulo(agora);
  const janela = janelaDoLancamento(data, minutos, agora);
  if (!janela.ok) return err(422, 'invalid_janela', janela.erro);

  // Quem chamou
  const email = (req.headers.get('x-tasks360-user') || '').trim().toLowerCase();
  let chamador: Pessoa | null = null;
  if (email) {
    const { data: p } = await sb.from('pessoas').select(COLS_PESSOA).ilike('email', email).maybeSingle();
    chamador = (p as Pessoa | null) ?? null;
  }
  // E-mail sem cadastro não lança (nem para si, nem para outros)
  if (email && !chamador) return err(403, 'forbidden', 'e-mail sem cadastro no Tasks 360');

  // Para quem são as horas
  let alvo: Pessoa | null = chamador;
  const pessoaParam = body.pessoa !== undefined && body.pessoa !== null ? String(body.pessoa).trim() : '';
  if (pessoaParam) {
    let q = sb.from('pessoas').select(COLS_PESSOA).in('role', ['admin', 'interno']).is('arquivado_em', null);
    q = UUID_RE.test(pessoaParam) ? q.eq('id', pessoaParam) : q.ilike('nome', `${pessoaParam}%`);
    const { data: ps, error: pErr } = await q.limit(2);
    if (pErr) return err(500, 'db_error', pErr.message);
    if (!ps || ps.length === 0) return err(404, 'pessoa_not_found', `ninguém do time encontrado para "${pessoaParam}"`);
    if (ps.length > 1) return err(422, 'pessoa_ambigua', `"${pessoaParam}" bate com mais de uma pessoa; use o uuid de get_pessoas`);
    alvo = ps[0] as Pessoa;
  }
  if (!alvo) return err(422, 'missing_pessoa', 'não deu para identificar quem lança; informe pessoa');
  if (alvo.role !== 'admin' && alvo.role !== 'interno') return err(422, 'pessoa_invalida', 'só gente do time lança horas');
  if (chamador && alvo.id !== chamador.id && chamador.role !== 'admin') {
    return err(403, 'forbidden', 'só admin lança horas para outra pessoa');
  }

  const { data: task, error: tErr } = await sb
    .from('tasks')
    .select('id, titulo, arquivado_em, privada, pessoa_id, clientes ( privado ), projetos ( privado )')
    .eq('id', taskId)
    .maybeSingle();
  if (tErr) return err(500, 'db_error', tErr.message);
  // Tarefa privada: só o CEO, o responsável ou quem lança as próprias horas nela
  const tf = task as { privada: boolean; pessoa_id: string | null; clientes: { privado: boolean } | null; projetos: { privado: boolean } | null } | null;
  const privada = !!tf && tarefaPrivada({ privada: tf.privada, cliente_privado: tf.clientes?.privado, projeto_privado: tf.projetos?.privado });
  if (!task || (privada && chamador && !chamador.is_ceo && tf!.pessoa_id !== chamador.id && tf!.pessoa_id !== alvo.id)) {
    return err(404, 'task_not_found', `task ${taskId} não existe`);
  }
  if (task.arquivado_em) return err(422, 'task_arquivada', 'a tarefa está arquivada');

  const startedIso = janela.startedAt.toISOString();
  const endedIso = janela.endedAt.toISOString();
  const resposta = (row: { id: string }, action: 'created' | 'unchanged') => ({
    id: row.id,
    task_id: taskId,
    titulo: task.titulo,
    pessoa: alvo!.nome,
    data,
    horas: Math.round((minutos / 60) * 100) / 100,
    nota,
    action,
  });

  // Idempotência: mesma chamada repetida não duplica
  const { data: mesmoDia } = await sb
    .from('time_entries')
    .select('id, started_at, ended_at')
    .eq('task_id', taskId)
    .eq('pessoa_id', alvo.id)
    .eq('note', nota)
    .eq('manual', true)
    .gte('started_at', `${data}T00:00:00-03:00`)
    .lte('started_at', `${data}T23:59:59-03:00`)
    .limit(20);
  const mesmo = (mesmoDia ?? []).find(
    (r) => r.ended_at && Math.round((Date.parse(r.ended_at) - Date.parse(r.started_at)) / 60_000) === minutos,
  );
  if (mesmo) return json(200, resposta(mesmo, 'unchanged'));

  const { data: criado, error: iErr } = await sb
    .from('time_entries')
    .insert({
      task_id: taskId,
      pessoa_id: alvo.id,
      started_at: startedIso,
      ended_at: endedIso,
      note: nota,
      manual: true,
    })
    .select('id')
    .single();
  if (iErr) return err(500, 'db_error', iErr.message);

  return json(201, resposta(criado, 'created'));
});
