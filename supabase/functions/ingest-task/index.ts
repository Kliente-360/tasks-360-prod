// Edge Function: ingest-task
// Ingestão de tarefas vindas de sistemas externos (Salesforce etc.)
//
// Auth: header X-API-Key (validado contra env INGEST_API_KEYS, lista
// separada por vírgula). Cada cliente externo recebe seu token.
//
// Body JSON (PT-BR, resolução de cliente/projeto/responsavel por nome
// case-insensitive). Único campo obrigatório: external_id e titulo.
//
//   {
//     "external_id":  "a0X5g000000XYZ",            // id do registro no SF
//     "titulo":       "Customizar layout",
//     "descricao":    "...",                        // opcional
//     "cliente":      "Bodytech",                   // opcional, by name. Pode ser "" / null
//                                                   // / "Triagem" (sentinel) = task entra
//                                                   // sem cliente, aparece direto na Triagem.
//     "projeto":      "Sustentação BT",             // opcional, by name. "Triagem" sentinel = null.
//                                                   // Se cliente é null/sentinel, projeto é
//                                                   // ignorado (não tenta lookup sem cliente).
//     "responsavel":  "Jéssica",                    // opcional, by name. "Triagem" sentinel = null.
//     "responsavel_id": "uuid-da-pessoa",           // opcional, UUID direto. Tem precedência sobre responsavel.
//     "prioridade":   "P1",                         // opcional: P0|P1|P2|P3
//     "esforco":      4,                            // opcional, horas
//     "prazo":        "2026-06-15",                 // opcional, YYYY-MM-DD
//     "subetapa":     "em_desenvolvimento",         // opcional (preferencial)
//     "status":       "andamento",                  // opcional (legacy: backlog|andamento|bloqueado|concluido)
//     "complexidade": "media",                      // opcional: alta|media|baixa
//     "tipo_trabalho":"feature",                    // opcional: bug|feature|discovery|manutencao|admin
//     "tags":         ["frontend","auth"],          // opcional, array de strings
//     "criado_por_ia":true,                         // opcional, default false. Marca task como originada de automação IA (Cowork etc).
//     "external_status":"Cancelado"                 // opcional. Quando "Cancelado" (case-insensitive):
//                                                   //   - arquiva a task aqui (arquivado_em=now)
//                                                   //   - força subetapa='bloqueado'
//                                                   //   - posta auto-comment interno "CANCELADO no sistema externo / arquivada"
//                                                   // Quando ≠ "Cancelado" e task já estava arquivada:
//                                                   //   - desarquiva (arquivado_em=null)
//                                                   //   - aplica a subetapa enviada normalmente
//                                                   //   - posta auto-comment interno "Desarquivada — saiu de CANCELADO no sistema externo"
//                                                   // Quando ausente e task arquivada: ainda desarquiva (legado), sem comment.
//   }
//
// Subetapa vs status (importante):
//   - Schema atual usa `subetapa` como verdade (11 valores) e `status`
//     (macro, 4 valores) é derivado por trigger.
//   - Se body trouxer `subetapa`, ela é usada direto.
//   - Se body trouxer só `status` (legacy), mapeamos pra subetapa
//     default daquele macro pra evitar inconsistência:
//       backlog    → 'backlog'
//       andamento  → 'em_desenvolvimento'
//       bloqueado  → 'bloqueado'
//       concluido  → 'concluido'
//   - Sem nenhum dos dois, novo task começa em 'backlog'.
//
// Retorna 201 { id, action: "created", responsavel_id } ou
//         200 { id, action: "updated"|"archived"|"unarchived", responsavel_id }.
// responsavel_id: UUID resolvido (via responsavel_id direto ou lookup por responsavel),
//   ou null se não enviado.
// Erros 4xx retornam { error: { code, message } }.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL  = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const API_KEYS      = (Deno.env.get('INGEST_API_KEYS') || '')
  .split(',').map(s => s.trim()).filter(Boolean);
const SOURCE        = 'salesforce';

const STATUS_VALID  = ['backlog', 'andamento', 'bloqueado', 'concluido'];
const PRI_VALID     = ['P0', 'P1', 'P2', 'P3'];
const SUBS_VALID    = [
  'backlog', 'priorizado', 'em_definicao', 'escopo_definido',
  'em_desenvolvimento', 'em_homologacao', 'em_revisao', 'pronto_producao', 'em_implantacao',
  'bloqueado', 'concluido',
];
const COMPLEX_VALID = ['alta', 'media', 'baixa'];
const TIPO_VALID    = ['bug', 'feature', 'discovery', 'manutencao', 'admin'];

// Sentinel values: quando a automação não consegue identificar
// cliente/projeto/responsável, pode mandar "Triagem" (ou variantes)
// em vez de omitir o campo. Tratamos como null e a task entra em
// Triagem normalmente (triageFailures detecta cliente/responsável faltando).
const TRIAGE_SENTINELS = new Set(['triagem', '__triagem__', 'sem cliente', 'sem-cliente']);
function isTriageSentinel(v: unknown): boolean {
  if (v == null) return false;
  const s = String(v).trim().toLowerCase();
  return TRIAGE_SENTINELS.has(s);
}

// Mapeamento legacy: status (macro) → subetapa default daquele macro.
// Usado só quando body manda 'status' sem 'subetapa' (compat SF antigo).
const STATUS_TO_SUBETAPA_DEFAULT: Record<string, string> = {
  backlog:   'backlog',
  andamento: 'em_desenvolvimento',
  bloqueado: 'bloqueado',
  concluido: 'concluido',
};

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
const err = (status: number, code: string, message: string) =>
  json(status, { error: { code, message } });

async function findByName(table: string, nome: string) {
  const { data, error } = await sb
    .from(table)
    .select(table === 'projetos' ? 'id, cliente_id' : 'id')
    .ilike('nome', nome.trim())
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return err(405, 'method_not_allowed', 'POST only');

  const apiKey = req.headers.get('x-api-key');
  if (!apiKey || !API_KEYS.includes(apiKey)) {
    return err(401, 'unauthorized', 'invalid or missing X-API-Key');
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return err(400, 'invalid_json', 'body must be valid JSON'); }

  const externalId = String(body.external_id ?? '').trim();
  if (!externalId) return err(422, 'missing_external_id', 'external_id is required');

  const titulo = String(body.titulo ?? '').trim();
  if (!titulo) return err(422, 'missing_titulo', 'titulo is required');

  // Resoluções por nome
  // Cliente: campo opcional. Aceita string vazia, null, ou sentinel
  // "Triagem" — todos resultam em clienteId=null e a task entra direto
  // em Triagem (triageFailures detecta cliente faltando).
  let clienteId: string | null = null;
  if (body.cliente && !isTriageSentinel(body.cliente)) {
    try {
      const r = await findByName('clientes', String(body.cliente));
      if (!r) return err(422, 'cliente_not_found', `cliente '${body.cliente}' não cadastrado`);
      clienteId = r.id as string;
    } catch (e) { return err(500, 'db_error', String((e as Error).message)); }
  }

  // Projeto: depende de cliente. Se cliente é null (omitido/sentinel/vazio),
  // ignora projeto silenciosamente — não faz sentido projeto sem cliente,
  // e lookup global é arriscado (nomes genéricos tipo "Sustentação" existem
  // em vários clientes).
  let projetoId: string | null = null;
  if (clienteId && body.projeto && !isTriageSentinel(body.projeto)) {
    try {
      const { data, error } = await sb
        .from('projetos')
        .select('id, cliente_id')
        .eq('cliente_id', clienteId)
        .ilike('nome', String(body.projeto).trim())
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return err(422, 'projeto_not_found', `projeto '${body.projeto}' não cadastrado para o cliente '${body.cliente}'`);
      projetoId = data.id as string;
    } catch (e) { return err(500, 'db_error', String((e as Error).message)); }
  }

  // Responsável: opcional. UUID direto (responsavel_id) tem precedência
  // sobre lookup por nome (responsavel). Sentinel "Triagem" = null.
  let pessoaId: string | null = null;
  if (body.responsavel_id) {
    pessoaId = String(body.responsavel_id).trim();
  } else if (body.responsavel && !isTriageSentinel(body.responsavel)) {
    try {
      const r = await findByName('pessoas', String(body.responsavel));
      if (!r) return err(422, 'responsavel_not_found', `responsavel '${body.responsavel}' não cadastrado`);
      pessoaId = r.id as string;
    } catch (e) { return err(500, 'db_error', String((e as Error).message)); }
  }

  // Validações de campos opcionais
  let prioridade: string | null = null;
  if (body.prioridade != null) {
    prioridade = String(body.prioridade).toUpperCase();
    if (!PRI_VALID.includes(prioridade)) return err(422, 'invalid_prioridade', 'prioridade deve ser P0|P1|P2|P3');
  }

  // Subetapa (preferencial) vs status (legacy)
  let subetapa: string | null = null;
  if (body.subetapa != null) {
    subetapa = String(body.subetapa).toLowerCase();
    if (!SUBS_VALID.includes(subetapa)) {
      return err(422, 'invalid_subetapa', `subetapa deve ser uma de: ${SUBS_VALID.join('|')}`);
    }
  } else if (body.status != null) {
    const s = String(body.status).toLowerCase();
    if (!STATUS_VALID.includes(s)) {
      return err(422, 'invalid_status', 'status deve ser backlog|andamento|bloqueado|concluido');
    }
    // Mapeia status macro → subetapa default (compat retroativa).
    subetapa = STATUS_TO_SUBETAPA_DEFAULT[s];
  }

  let prazo: string | null = null;
  if (body.prazo) {
    const p = String(body.prazo).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return err(422, 'invalid_prazo', 'prazo deve ser YYYY-MM-DD');
    prazo = p;
  }
  let esforco: number | null = null;
  if (body.esforco != null) {
    const e = Number(body.esforco);
    if (Number.isNaN(e) || e < 0) return err(422, 'invalid_esforco', 'esforco deve ser número não-negativo');
    esforco = e;
  }
  let complexidade: string | null = null;
  if (body.complexidade != null) {
    complexidade = String(body.complexidade).toLowerCase();
    if (!COMPLEX_VALID.includes(complexidade)) {
      return err(422, 'invalid_complexidade', 'complexidade deve ser alta|media|baixa');
    }
  }
  let tipoTrabalho: string | null = null;
  if (body.tipo_trabalho != null) {
    tipoTrabalho = String(body.tipo_trabalho).toLowerCase();
    if (!TIPO_VALID.includes(tipoTrabalho)) {
      return err(422, 'invalid_tipo_trabalho', `tipo_trabalho deve ser: ${TIPO_VALID.join('|')}`);
    }
  }
  let tags: string[] | null = null;
  if (body.tags != null) {
    if (!Array.isArray(body.tags)) return err(422, 'invalid_tags', 'tags deve ser array de strings');
    tags = body.tags
      .map((x: unknown) => String(x || '').trim().toLowerCase().replace(/\s+/g, '-').slice(0, 24))
      .filter((x: string) => x.length > 0);
  }
  // criado_por_ia: aceita true/false (boolean ou strings "true"/"false"/"1"/"0").
  // Default = null (não toca o campo no update; insert usa default false).
  let criadoPorIa: boolean | null = null;
  if (body.criado_por_ia != null) {
    const v = body.criado_por_ia;
    if (typeof v === 'boolean') criadoPorIa = v;
    else if (typeof v === 'string') {
      const s = v.toLowerCase().trim();
      if (s === 'true' || s === '1')  criadoPorIa = true;
      else if (s === 'false' || s === '0') criadoPorIa = false;
      else return err(422, 'invalid_criado_por_ia', 'criado_por_ia deve ser boolean');
    } else if (typeof v === 'number') criadoPorIa = v === 1;
    else return err(422, 'invalid_criado_por_ia', 'criado_por_ia deve ser boolean');
  }

  // external_status: sinal semântico do SF. "Cancelado" (case-insensitive)
  // dispara o fluxo de arquivar; qualquer outro valor força desarquivar
  // se a task estava arquivada — e, nesse caso, posta auto-comment.
  const externalStatusRaw = body.external_status as unknown;
  const externalStatus    = (typeof externalStatusRaw === 'string')
    ? externalStatusRaw.trim()
    : '';
  const isCancelled       = externalStatus.toLowerCase() === 'cancelado';
  const hasExplicitStatus = externalStatus.length > 0;

  // Existe? Procura por (source, external_id).
  // Carrega status atual pra detectar mudança e gravar histórico.
  // arquivado_em: pra detectar transição de arquivamento.
  const { data: existing, error: lookupErr } = await sb
    .from('tasks')
    .select('id, status, subetapa, arquivado_em')
    .eq('external_source', SOURCE)
    .eq('external_id', externalId)
    .maybeSingle();
  if (lookupErr) return err(500, 'db_error', lookupErr.message);

  const nowIso = new Date().toISOString();

  // Monta payload — só inclui campos enviados (update não-destrutivo).
  // Importante: NÃO mandar `status` no payload; trigger derive de subetapa.
  // last_ingest_at: sinaliza pro trigger que veio do ingest → não dispara webhook.
  const payload: Record<string, unknown> = { titulo, last_ingest_at: nowIso };
  if (body.descricao !== undefined) payload.descricao    = String(body.descricao ?? '');
  if (clienteId)                    payload.cliente_id   = clienteId;
  if (projetoId)                    payload.projeto_id   = projetoId;
  if (pessoaId)                     payload.pessoa_id    = pessoaId;
  if (prioridade)                   payload.prioridade   = prioridade;
  if (esforco != null)              payload.esforco      = esforco;
  if (prazo)                        payload.prazo        = prazo;
  if (complexidade)                 payload.complexidade = complexidade;
  if (tipoTrabalho)                 payload.tipo_trabalho = tipoTrabalho;
  if (tags)                         payload.tags         = tags;
  if (criadoPorIa != null)          payload.criado_por_ia = criadoPorIa;
  if (subetapa) {
    payload.subetapa = subetapa;
    if (!existing || existing.subetapa !== subetapa) {
      payload.subetapa_em = nowIso;
      payload.status_em   = nowIso;
    }
  }

  // Override de arquivamento via external_status (espelha o que o
  // archive-task fazia, agora dentro do ingest).
  if (isCancelled) {
    // Force subetapa='bloqueado' (sobrescreve o que veio no payload).
    payload.subetapa     = 'bloqueado';
    payload.subetapa_em  = nowIso;
    payload.status_em    = nowIso;
    payload.arquivado_em = nowIso;
  }

  if (existing) {
    const wasArchived = !!(existing as { arquivado_em: string | null }).arquivado_em;
    let didArchive    = false;
    let didUnarchive  = false;

    if (isCancelled) {
      // Idempotente: se já estava arquivada, não conta como transição.
      if (!wasArchived) didArchive = true;
    } else {
      // Comportamento legado preservado: qualquer update reabre task arquivada.
      // Posta auto-comment só quando o sinal foi explícito (external_status
      // veio com valor ≠ "Cancelado") — evita comment ruidoso em update
      // normal de task que estava arquivada manualmente.
      if (wasArchived) {
        payload.arquivado_em = null;
        if (hasExplicitStatus) didUnarchive = true;
      }
    }

    const { error } = await sb.from('tasks').update(payload).eq('id', existing.id);
    if (error) return err(500, 'db_error', error.message);

    // Histórico de status macro (compara existing vs derivado do payload).
    const effectiveSubetapa = (payload.subetapa as string | undefined) ?? existing.subetapa;
    if (effectiveSubetapa) {
      const newMacro = macroFromSub(effectiveSubetapa);
      if (existing.status !== newMacro) {
        await sb.from('task_field_history').insert({
          task_id: existing.id, field: 'status',
          from_value: existing.status, to_value: newMacro,
          actor_source: SOURCE,
        });
      }
    }

    // Auto-comment de transição cancel/uncancel. last_ingest_at no payload
    // do INSERT impede o trigger de re-disparar webhook (guard na 2026-05-22
    // migration). visivel_cliente=false: nota interna pra time, não vai pro
    // Portal. from_cliente=false: não é mensagem de cliente externo.
    if (didArchive || didUnarchive) {
      const commentBody = didArchive
        ? 'CANCELADO no sistema externo — task arquivada automaticamente.'
        : 'Desarquivada — saiu de CANCELADO no sistema externo.';
      await sb.from('task_comments').insert({
        task_id:         existing.id,
        external_source: SOURCE,
        author:          'Salesforce',
        body:            commentBody,
        visivel_cliente: false,
        from_cliente:    false,
        posted_em:       nowIso,
        last_ingest_at:  nowIso,
      });
    }

    return json(200, {
      id:             existing.id,
      action:         didArchive ? 'archived' : didUnarchive ? 'unarchived' : 'updated',
      responsavel_id: pessoaId,
    });
  } else {
    payload.external_source = SOURCE;
    payload.external_id     = externalId;
    payload.subetapa        = (payload.subetapa as string) || 'backlog';
    payload.subetapa_em     = new Date().toISOString();
    payload.status_em       = new Date().toISOString();
    const { data, error } = await sb.from('tasks').insert(payload).select('id, status').single();
    if (error) return err(500, 'db_error', error.message);
    await sb.from('task_field_history').insert({
      task_id: data.id, field: 'status',
      from_value: null, to_value: data.status,
      actor_source: SOURCE,
    });
    return json(201, { id: data.id, action: 'created', responsavel_id: pessoaId });
  }
});

// Mapeia subetapa → status macro. Espelha o trigger SQL
// `sync_task_status_from_subetapa`. Mantém em sincronia.
function macroFromSub(sub: string): string {
  switch (sub) {
    case 'backlog':
    case 'priorizado':
    case 'em_definicao':
    case 'escopo_definido':
      return 'backlog';
    case 'em_desenvolvimento':
    case 'em_homologacao':
    case 'em_revisao':
    case 'pronto_producao':
    case 'em_implantacao':
      return 'andamento';
    case 'bloqueado':
      return 'bloqueado';
    case 'concluido':
      return 'concluido';
    default:
      return 'backlog';
  }
}
