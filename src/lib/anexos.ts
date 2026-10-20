'use client';

/**
 * Evidências · imagens de tasks (bucket `task-attachments`, tabela
 * `task_attachments`). Usado pelo modal interno, pela conversa do portal e
 * pela nova solicitação.
 *
 * Toda imagem é reduzida no navegador antes do envio (lado maior 1600px,
 * WebP ou JPEG): um print de 2–3 MB vira ~200–300 KB e o egress do
 * Supabase não dispara. Bucket aceita jpeg/png/webp até 2 MB.
 */

import type { createClient } from '@/lib/supabase/client';

type Sb = ReturnType<typeof createClient>;

export interface Anexo {
  id: string;
  task_id: string;
  comment_id: string | null;
  storage_path: string;
  mime: string;
  size_bytes: number;
  width: number | null;
  height: number | null;
  author_pessoa_id: string | null;
  visivel_cliente: boolean;
  criado_em: string;
}

export const ANEXO_COLS =
  'id, task_id, comment_id, storage_path, mime, size_bytes, width, height, author_pessoa_id, visivel_cliente, criado_em';

export const TIPOS_IMAGEM = /^image\/(png|jpe?g|webp)$/i;
export const MAX_BYTES = 2 * 1024 * 1024;
export const MAX_POR_MENSAGEM = 6;

/** Imagens coladas (Ctrl+V) num evento de clipboard. */
export function imagensDoClipboard(ev: React.ClipboardEvent | ClipboardEvent): File[] {
  const files = ev.clipboardData?.files;
  return files ? Array.from(files).filter((f) => TIPOS_IMAGEM.test(f.type)) : [];
}

/** Reduz a imagem: lado maior até `maxDim`, WebP (fallback JPEG). */
export function reduzirImagem(
  file: File,
  maxDim = 1600,
  quality = 0.82,
): Promise<{ blob: Blob; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      const ratio = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.round(img.width * ratio);
      const h = Math.round(img.height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(null);
        return;
      }
      ctx.drawImage(img, 0, 0, w, h);
      const tentar = (tipo: string, fallback?: string) =>
        canvas.toBlob(
          (blob) => {
            // Safari antigo devolve PNG quando não sabe gerar WebP
            if (blob && blob.type === tipo) resolve({ blob, width: w, height: h });
            else if (fallback) tentar(fallback);
            else resolve(blob ? { blob, width: w, height: h } : null);
          },
          tipo,
          quality,
        );
      tentar('image/webp', 'image/jpeg');
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(null);
    };
    img.src = url;
  });
}

/** Reduz, sobe para o storage e registra em task_attachments. */
export async function enviarImagem(
  sb: Sb,
  opts: {
    taskId: string;
    file: File;
    autorPessoaId: string | null;
    commentId?: string | null;
    visivelCliente: boolean;
  },
): Promise<{ anexo?: Anexo; erro?: string }> {
  const reduzida = await reduzirImagem(opts.file);
  if (!reduzida) return { erro: 'Não foi possível processar a imagem.' };
  if (reduzida.blob.size > MAX_BYTES) return { erro: 'Imagem muito grande, mesmo depois de reduzida.' };
  const ext = reduzida.blob.type === 'image/webp' ? 'webp' : reduzida.blob.type === 'image/png' ? 'png' : 'jpg';
  const path = `${opts.taskId}/${crypto.randomUUID()}.${ext}`;
  const up = await sb.storage
    .from('task-attachments')
    .upload(path, reduzida.blob, { contentType: reduzida.blob.type, upsert: false });
  if (up.error) return { erro: 'Erro no envio: ' + up.error.message };
  const { data, error } = await sb
    .from('task_attachments')
    .insert({
      task_id: opts.taskId,
      comment_id: opts.commentId ?? null,
      storage_path: path,
      mime: reduzida.blob.type,
      size_bytes: reduzida.blob.size,
      width: reduzida.width,
      height: reduzida.height,
      author_pessoa_id: opts.autorPessoaId,
      visivel_cliente: opts.visivelCliente,
    })
    .select(ANEXO_COLS)
    .single();
  if (error || !data) {
    await sb.storage.from('task-attachments').remove([path]);
    return { erro: 'Erro ao registrar a imagem: ' + (error?.message ?? 'falha') };
  }
  return { anexo: data as Anexo };
}

/** URLs assinadas (1h) por id do anexo. */
export async function urlsDosAnexos(sb: Sb, anexos: Anexo[]): Promise<Record<string, string>> {
  if (anexos.length === 0) return {};
  const { data } = await sb.storage.from('task-attachments').createSignedUrls(
    anexos.map((a) => a.storage_path),
    3600,
  );
  const map: Record<string, string> = {};
  (data ?? []).forEach((row, i) => {
    if (row?.signedUrl && anexos[i]) map[anexos[i].id] = row.signedUrl;
  });
  return map;
}
