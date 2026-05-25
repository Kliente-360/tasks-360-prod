'use client';

/**
 * Hook puro que deriva os dados do Portal cliente a partir do DataProvider.
 * Portado de lib/views/portal.js do Alpine (getters portalTasks, portalCards,
 * portalMetrics, portalAlerts, portalHeadline).
 *
 * Tudo deriva de useData() + clienteId. Memoizado — só recalcula quando
 * tasks/projetos/clienteId mudam.
 */

import { useMemo } from 'react';
import { useData } from '@/lib/data-store';
import { STATUS } from '@/lib/task-constants';
import type { Task } from '@/lib/types';

export interface PortalCards {
  emAndamento: Task[];
  proximas: Task[];
  aguardando: Task[];
  recentes: Task[];
}

export interface PortalDistItem {
  projetoId: string;
  nome: string;
  count: number;
}

export interface PortalMetrics {
  mesesLabels: string[];
  mesesCounts: number[];
  entregasMaxMes: number;
  mesAtual: number;
  mesAnterior: number;
  mediaTrimestre: number;
  mediaSemestre: number;
  leadTimeMedio: number | null;
  leadTimeAmostra: number;
  distribuicao: PortalDistItem[];
  distribuicaoTotal: number;
  proximaEntrega: Task | null;
  diasAteProxima: number | null;
  aguardandoAgingMax: number;
  totalAtivas: number;
  totalConcluidas: number;
}

export interface PortalAlert {
  severity: 'alta' | 'media' | 'positivo';
  icon: string;
  titulo: string;
  detalhe: string;
}

export interface PortalData {
  portalTasks: Task[];
  cards: PortalCards;
  metrics: PortalMetrics;
  alerts: PortalAlert[];
  headline: string;
}

const PRIO_RANK: Record<string, number> = { P0: 0, P1: 1, P2: 2, P3: 3 };

export function usePortalData(clienteId: string): PortalData {
  const { tasks, projetos } = useData();

  return useMemo<PortalData>(() => {
    const cid = clienteId;
    const portalTasks: Task[] = cid
      ? tasks.filter((t) => t.clienteId === cid && t.visivelCliente !== false && !t.arquivadoEm)
      : [];

    // ---- portalCards ----
    const todayIso = new Date().toISOString().slice(0, 10);
    const in14 = new Date();
    in14.setDate(in14.getDate() + 14);
    const in14Iso = in14.toISOString().slice(0, 10);
    const cutoff30 = Date.now() - 30 * 86400000;
    const sortPri = (a: Task, b: Task) =>
      (PRIO_RANK[a.prioridade] ?? 9) - (PRIO_RANK[b.prioridade] ?? 9);

    const emAndamento = portalTasks.filter((t) => t.status === 'andamento').sort(sortPri);
    const proximas = portalTasks
      .filter(
        (t) =>
          t.status !== STATUS.CONCLUIDO &&
          t.prazo &&
          t.prazo >= todayIso &&
          t.prazo <= in14Iso,
      )
      .sort((a, b) => a.prazo.localeCompare(b.prazo));
    const aguardando = portalTasks
      .filter((t) => t.subetapa === 'bloqueado' && t.bloqueadoPor === 'cliente')
      .sort(sortPri);
    const recentes = portalTasks
      .filter((t) => t.status === STATUS.CONCLUIDO && t.statusEm && t.statusEm >= cutoff30)
      .sort((a, b) => (b.statusEm || 0) - (a.statusEm || 0));

    const cards: PortalCards = { emAndamento, proximas, aguardando, recentes };

    // ---- portalMetrics ----
    const now = Date.now();
    const today = new Date();
    const mesesLabels: string[] = [];
    const mesesCounts: number[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const nextM = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
      const ini = d.getTime();
      const fim = nextM.getTime();
      const count = portalTasks.filter(
        (t) =>
          t.status === STATUS.CONCLUIDO &&
          t.statusEm &&
          t.statusEm >= ini &&
          t.statusEm < fim,
      ).length;
      mesesLabels.push(d.toLocaleString('pt-BR', { month: 'short' }).replace('.', ''));
      mesesCounts.push(count);
    }
    const entregasMaxMes = Math.max(1, ...mesesCounts);
    const mesAtual = mesesCounts[mesesCounts.length - 1];
    const mesAnterior = mesesCounts[mesesCounts.length - 2];
    const mediaTrimestre = mesesCounts.slice(-3).reduce((a, b) => a + b, 0) / 3;
    const mediaSemestre = mesesCounts.reduce((a, b) => a + b, 0) / mesesCounts.length;

    const cutoff90 = now - 90 * 86400000;
    const concluidasRecentes = portalTasks.filter(
      (t) =>
        t.status === STATUS.CONCLUIDO &&
        t.statusEm &&
        t.statusEm >= cutoff90 &&
        t.criadoEm,
    );
    const leadTimes = concluidasRecentes.map(
      (t) => (t.statusEm - t.criadoEm) / 86400000,
    );
    const leadTimeMedio = leadTimes.length
      ? Math.round(leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length)
      : null;

    const projetosById = new Map(projetos.map((p) => [p.id, p]));
    const porProjeto = new Map<string, number>();
    for (const t of portalTasks) {
      if (t.status === STATUS.CONCLUIDO) continue;
      const pid = t.projetoId || '__sem__';
      porProjeto.set(pid, (porProjeto.get(pid) || 0) + 1);
    }
    const distribuicao: PortalDistItem[] = Array.from(porProjeto.entries())
      .map(([pid, count]) => ({
        projetoId: pid,
        nome: pid === '__sem__' ? 'sem projeto' : projetosById.get(pid)?.nome ?? 'sem projeto',
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    const distribuicaoTotal = distribuicao.reduce((a, b) => a + b.count, 0) || 1;

    const proximaEntrega =
      portalTasks
        .filter((t) => t.status !== STATUS.CONCLUIDO && t.prazo && t.prazo >= todayIso)
        .sort((a, b) => a.prazo.localeCompare(b.prazo))[0] || null;
    const diasAteProxima = proximaEntrega
      ? Math.max(
          0,
          Math.ceil(
            (new Date(proximaEntrega.prazo + 'T00:00:00').getTime() -
              new Date(todayIso + 'T00:00:00').getTime()) /
              86400000,
          ),
        )
      : null;

    const agdAging = aguardando.map((t) => {
      const ts = t.subetapaEm || t.statusEm || t.criadoEm || now;
      return Math.floor((now - ts) / 86400000);
    });
    const aguardandoAgingMax = agdAging.length ? Math.max(...agdAging) : 0;

    const totalAtivas = portalTasks.filter((t) => t.status !== STATUS.CONCLUIDO).length;
    const totalConcluidas = portalTasks.filter((t) => t.status === STATUS.CONCLUIDO).length;

    const metrics: PortalMetrics = {
      mesesLabels,
      mesesCounts,
      entregasMaxMes,
      mesAtual,
      mesAnterior,
      mediaTrimestre,
      mediaSemestre,
      leadTimeMedio,
      leadTimeAmostra: leadTimes.length,
      distribuicao,
      distribuicaoTotal,
      proximaEntrega,
      diasAteProxima,
      aguardandoAgingMax,
      totalAtivas,
      totalConcluidas,
    };

    // ---- portalAlerts ----
    const alerts: PortalAlert[] = [];
    if (aguardandoAgingMax >= 5) {
      alerts.push({
        severity: 'alta',
        icon: '⏳',
        titulo:
          aguardando.length === 1
            ? `Tem um item aguardando sua resposta há ${aguardandoAgingMax} dias`
            : `${aguardando.length} itens aguardando sua resposta, o mais antigo há ${aguardandoAgingMax} dias`,
        detalhe: 'Responder destrava o time pra seguir.',
      });
    }
    if (diasAteProxima != null && diasAteProxima <= 3 && proximaEntrega) {
      alerts.push({
        severity: 'media',
        icon: '📅',
        titulo:
          diasAteProxima === 0
            ? 'Entrega prevista pra hoje'
            : diasAteProxima === 1
              ? 'Entrega prevista pra amanhã'
              : `Entrega prevista em ${diasAteProxima} dias`,
        detalhe: proximaEntrega.titulo,
      });
    }
    if (mesAtual > 0 && mediaSemestre > 0 && mesAtual >= mediaSemestre * 1.3) {
      alerts.push({
        severity: 'positivo',
        icon: '↑',
        titulo: `Mês forte: ${mesAtual} entregas até agora`,
        detalhe: `Acima da média dos últimos 6 meses (${mediaSemestre.toFixed(1)}).`,
      });
    }
    if (mesAtual === 0 && mesAnterior > 0 && totalAtivas > 0 && new Date().getDate() >= 15) {
      alerts.push({
        severity: 'media',
        icon: '·',
        titulo: 'Sem entregas neste mês ainda',
        detalhe: `Mas há ${totalAtivas} tarefa(s) em andamento. Acompanhe as próximas entregas abaixo.`,
      });
    }

    // ---- portalHeadline ----
    const partes: string[] = [];
    if (totalAtivas > 0) {
      partes.push(
        `${totalAtivas} ${totalAtivas === 1 ? 'tarefa em andamento' : 'tarefas em andamento'}`,
      );
    }
    if (aguardando.length > 0) {
      partes.push(`${aguardando.length} aguardando você`);
    }
    if (mesAtual > 0) {
      partes.push(`${mesAtual} ${mesAtual === 1 ? 'entrega' : 'entregas'} este mês`);
    }
    const headline = partes.join(' · ') || 'Nenhuma demanda ativa no momento.';

    return { portalTasks, cards, metrics, alerts, headline };
  }, [tasks, projetos, clienteId]);
}
