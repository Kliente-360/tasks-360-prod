'use client';

/**
 * Export — Onda 0 · 4.F
 *
 * Gera CSV das tasks visíveis (não-arquivadas), resolvendo cliente/
 * projeto/responsável via lookups da store. Sem dependência do filter
 * local de uma tela específica: o usuário exporta tudo e filtra no
 * Excel. PDF (relatório executivo) depende de Dashboard/Briefing
 * (parking) e fica pra revisitar.
 *
 * Triggers:
 *  - ExportIconButton (header desktop)
 *  - ExportMenuButton (profile menu mobile · variantes CSV)
 */

import { useCallback, useEffect, useState } from 'react';
import { useData, useClientesById, useProjetosById, usePessoasById } from '@/lib/data-store';
import { useToast } from '@/components/toast';
import { lblStatus } from '@/lib/task-utils';
import type { Task } from '@/lib/types';

function esc(v: unknown): string {
  return (
    '"' +
    String(v == null ? '' : v)
      .replace(/"/g, '""')
      .replace(/\r?\n/g, ' ') +
    '"'
  );
}

function tasksToCsv(
  tasks: Task[],
  nomeCliente: (id: string) => string,
  nomeProjeto: (id: string) => string,
  nomePessoa: (id: string) => string,
): string {
  const head = [
    'Título',
    'Cliente',
    'Projeto',
    'Responsável',
    'Prioridade',
    'Status',
    'Esforço (h)',
    'Prazo',
    'Tags',
    'Descrição',
    'Criado em',
  ];
  const lines = [head.map(esc).join(',')];
  for (const t of tasks) {
    lines.push(
      [
        t.titulo,
        nomeCliente(t.clienteId),
        nomeProjeto(t.projetoId),
        nomePessoa(t.pessoaId),
        t.prioridade,
        lblStatus(t.status),
        t.esforco,
        t.prazo || '',
        (t.tags || []).join(', '),
        t.descricao || '',
        t.criadoEm ? new Date(t.criadoEm).toISOString().slice(0, 10) : '',
      ]
        .map(esc)
        .join(','),
    );
  }
  // BOM pra Excel reconhecer UTF-8.
  return '﻿' + lines.join('\r\n');
}

function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Hook compartilhado pelos triggers (header + profile menu + palette). */
export function useExportCsv() {
  const { tasks } = useData();
  const clientesById = useClientesById();
  const projetosById = useProjetosById();
  const pessoasById = usePessoasById();
  const toast = useToast();

  return useCallback(() => {
    const visible = tasks.filter((t) => !t.arquivadoEm);
    const csv = tasksToCsv(
      visible,
      (id) => clientesById.get(id)?.nome ?? '',
      (id) => projetosById.get(id)?.nome ?? '',
      (id) => pessoasById.get(id)?.nome ?? '',
    );
    const today = new Date().toISOString().slice(0, 10);
    downloadBlob(`kliente360-tarefas-${today}.csv`, csv, 'text/csv;charset=utf-8');
    toast.success(`${visible.length} tarefa(s) exportadas em CSV.`);
  }, [tasks, clientesById, projetosById, pessoasById, toast]);
}

// ============ Triggers ============

/** Ícone ⤓ do header (desktop only) — abre dropdown com CSV + PDF. */
export function ExportIconButton() {
  const exportCsv = useExportCsv();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="relative !hidden md:!inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="btn btn-ghost btn-icon text-xs"
        title="Exportar"
        aria-label="Exportar"
        aria-expanded={open}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" />
          <line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute top-full right-0 mt-2 bg-elev border border-line rounded-lg shadow-xl z-40 text-left overflow-hidden w-[260px]">
            <div className="px-3 pt-2.5 pb-1 text-[10px] uppercase tracking-wider text-muted font-semibold font-mono border-b border-line">
              Exportar como
            </div>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                exportCsv();
              }}
              className="block w-full text-left px-3 py-2 hover:bg-brand-tint transition-colors"
            >
              <div className="text-xs font-medium text-ink">CSV</div>
              <div className="text-[10px] text-muted mt-0.5">visão atual filtrada · pra Excel</div>
            </button>
            <div className="border-t border-line" />
            <div
              className="block w-full text-left px-3 py-2 opacity-40 cursor-not-allowed"
              title="Depende de Dashboard (parking)"
            >
              <div className="text-xs font-medium text-ink">PDF · relatório executivo</div>
              <div className="text-[10px] text-muted mt-0.5">depende de Dashboard · parking</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Item do profile menu (mobile). */
export function ExportCsvMenuItem({ onClick }: { onClick?: () => void }) {
  const exportCsv = useExportCsv();
  return (
    <button
      type="button"
      onClick={() => {
        onClick?.();
        exportCsv();
      }}
      className="flex w-full items-center justify-between gap-3 px-3 py-2 text-sm hover:bg-brand-tint"
    >
      <span>Exportar CSV</span>
      <span className="text-muted text-xs whitespace-nowrap">visão atual</span>
    </button>
  );
}
