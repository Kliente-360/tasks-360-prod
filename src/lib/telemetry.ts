'use client';

/**
 * Telemetria de uso · fila em memória enviada em lote para `usage_events`.
 *
 * - `track(evento, extra)` em qualquer lugar do app (fire-and-forget).
 * - Só grava depois que `ativarTelemetria()` é chamado (usuário logado e
 *   vinculado a uma pessoa). Quem/papel/cliente são carimbados no banco.
 * - Envia a cada 5s, a cada 25 eventos ou quando a aba é escondida/fechada.
 */

import { createClient } from '@/lib/supabase/client';

interface Evento {
  evento: string;
  rota: string | null;
  alvo: string | null;
  task_id: string | null;
  dispositivo: 'desktop' | 'mobile';
  session_id: string;
  props: Record<string, unknown>;
}

const LOTE = 25;
const INTERVALO_MS = 5000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

let ativo = false;
let fila: Evento[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

const INATIVIDADE_MS = 30 * 60 * 1000;

/** Sessão = atividade contínua na aba; 30 min parada abre uma nova. */
function sessaoId(): string {
  try {
    const agora = Date.now();
    let id = sessionStorage.getItem('k360-sessao');
    const ultimo = Number(sessionStorage.getItem('k360-sessao-ultimo') || 0);
    if (!id || agora - ultimo > INATIVIDADE_MS) {
      id = crypto.randomUUID();
      sessionStorage.setItem('k360-sessao', id);
      novaSessao = true;
    }
    sessionStorage.setItem('k360-sessao-ultimo', String(agora));
    return id;
  } catch {
    return 'sem-sessao';
  }
}

let novaSessao = false;
/** True uma vez quando a última chamada abriu sessão nova. */
export function consumirNovaSessao(): boolean {
  const v = novaSessao;
  novaSessao = false;
  return v;
}

export function dispositivoAtual(): 'desktop' | 'mobile' {
  return typeof window !== 'undefined' && window.innerWidth < 768 ? 'mobile' : 'desktop';
}

export function ativarTelemetria(v: boolean) {
  ativo = v;
  if (!v) fila = [];
}

export function track(
  evento: string,
  extra: { alvo?: string | null; task_id?: string | null; props?: Record<string, unknown> } = {},
) {
  if (typeof window === 'undefined' || !ativo) return;
  const taskId = extra.task_id && UUID_RE.test(extra.task_id) ? extra.task_id : null;
  const sessao = sessaoId();
  // Voltou depois de 30 min parado: registra o início da nova sessão
  if (consumirNovaSessao() && evento !== 'session_start') {
    fila.push({
      evento: 'session_start',
      rota: window.location.pathname.slice(0, 120),
      alvo: null,
      task_id: null,
      dispositivo: dispositivoAtual(),
      session_id: sessao,
      props: { retomada: true, largura: window.innerWidth },
    });
  }
  fila.push({
    evento: evento.slice(0, 60),
    rota: window.location.pathname.slice(0, 120),
    alvo: extra.alvo ? String(extra.alvo).replace(/\s+/g, ' ').trim().slice(0, 120) : null,
    task_id: taskId,
    dispositivo: dispositivoAtual(),
    session_id: sessao,
    props: extra.props ?? {},
  });
  if (fila.length >= LOTE) void flushTelemetria();
  else if (!timer) timer = setTimeout(() => void flushTelemetria(), INTERVALO_MS);
}

export async function flushTelemetria() {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!fila.length) return;
  const lote = fila;
  fila = [];
  try {
    await createClient().from('usage_events').insert(lote);
  } catch {
    /* telemetria nunca quebra o app */
  }
}
