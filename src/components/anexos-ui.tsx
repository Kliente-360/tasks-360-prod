'use client';
/* eslint-disable @next/next/no-img-element -- URLs assinadas e temporárias do storage; next/image não ajuda aqui */

/**
 * Peças visuais das evidências: miniaturas de imagens enviadas, imagens
 * aguardando envio no campo de mensagem e visualização ampliada.
 */

import { useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from '@/components/icons';
import { MAX_POR_MENSAGEM, TIPOS_IMAGEM, type Anexo } from '@/lib/anexos';

/** Miniaturas clicáveis (na mensagem ou na galeria). */
export function MiniaturasAnexos({
  anexos,
  urls,
  onAbrir,
  tamanho = 'md',
}: {
  anexos: Anexo[];
  urls: Record<string, string>;
  onAbrir: (a: Anexo) => void;
  tamanho?: 'md' | 'lg';
}) {
  if (anexos.length === 0) return null;
  return (
    <div className={`anexo-grid anexo-grid-${tamanho}`}>
      {anexos.map((a) => (
        <button
          key={a.id}
          type="button"
          className="anexo-thumb"
          onClick={() => onAbrir(a)}
          aria-label="Ampliar imagem"
          data-track="Abrir imagem"
        >
          {urls[a.id] ? <img src={urls[a.id]} alt="" loading="lazy" /> : <span className="anexo-thumb-vazio" />}
        </button>
      ))}
    </div>
  );
}

/** Imagens escolhidas e ainda não enviadas, com botão de remover. */
export function ImagensPendentes({ arquivos, onRemover }: { arquivos: File[]; onRemover: (i: number) => void }) {
  const previews = useMemo(() => arquivos.map((f) => URL.createObjectURL(f)), [arquivos]);
  useEffect(() => () => previews.forEach((u) => URL.revokeObjectURL(u)), [previews]);
  if (arquivos.length === 0) return null;
  return (
    <div className="anexo-pendentes">
      {previews.map((u, i) => (
        <div key={u} className="anexo-pendente">
          <img src={u} alt="" />
          <button type="button" onClick={() => onRemover(i)} aria-label="Remover imagem">
            <Icon name="x" size={12} />
          </button>
        </div>
      ))}
    </div>
  );
}

/** Botão de clipe + input de arquivo (só imagens). */
export function BotaoAnexarImagem({
  onEscolher,
  disabled,
  quantidadeAtual = 0,
}: {
  onEscolher: (arquivos: File[]) => void;
  disabled?: boolean;
  quantidadeAtual?: number;
}) {
  const ref = useRef<HTMLInputElement>(null);
  const cheio = quantidadeAtual >= MAX_POR_MENSAGEM;
  return (
    <>
      <button
        type="button"
        className="anexo-clipe"
        onClick={() => ref.current?.click()}
        disabled={disabled || cheio}
        title={cheio ? `Até ${MAX_POR_MENSAGEM} imagens por vez` : 'Anexar imagem (ou cole com Ctrl+V)'}
        aria-label="Anexar imagem"
      >
        <Icon name="paperclip" size={15} />
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        multiple
        hidden
        onChange={(e) => {
          const files = Array.from(e.target.files ?? []).filter((f) => TIPOS_IMAGEM.test(f.type));
          if (files.length) onEscolher(files);
          e.target.value = '';
        }}
      />
    </>
  );
}

/** Junta novas imagens às pendentes respeitando o limite por mensagem. */
export function juntarPendentes(atual: File[], novas: File[]): File[] {
  return [...atual, ...novas].slice(0, MAX_POR_MENSAGEM);
}

/** Imagem ampliada sobre a tela; fecha no Esc ou clicando fora. */
export function VisualizadorImagem({ url, onFechar }: { url: string | null; onFechar: () => void }) {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onFechar();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [url, onFechar]);
  if (!url) return null;
  return createPortal(
    <div className="anexo-lightbox" onClick={onFechar} role="dialog" aria-label="Imagem ampliada">
      <img src={url} alt="" onClick={(e) => e.stopPropagation()} />
      <button type="button" className="anexo-lightbox-fechar" onClick={onFechar} aria-label="Fechar">
        <Icon name="x" size={20} />
      </button>
    </div>,
    document.body,
  );
}
