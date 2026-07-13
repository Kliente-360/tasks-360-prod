# Prompt para adicionar `dominios` ao cliente (Tasks 360)

> Cola este prompt em Claude Code, Cursor, ou similar **na raiz do repo do seu app Tasks 360** (Supabase + frontend). Ele cobre backend (schema + edge function). O frontend você complementa depois.

---

## Prompt

Adicione suporte a um novo campo `dominios` na entidade Cliente do Tasks 360. O objetivo é permitir que automações externas (Apps Script lendo notas de reunião do Gemini) identifiquem o cliente correto a partir do domínio de email dos participantes da reunião — especialmente útil pra clientes cujo nome é acrônimo (ex: "CTF", "VB") onde o nome não aparece no domínio.

### 1. Migration Supabase

Crie uma nova migration em `supabase/migrations/` com timestamp atual:

```sql
-- Add dominios array to cliente for email-domain-based identification
ALTER TABLE cliente
  ADD COLUMN dominios text[] NOT NULL DEFAULT '{}';

-- Index pra lookup rápido por domínio (usa GIN porque é array)
CREATE INDEX idx_cliente_dominios ON cliente USING GIN (dominios);

-- Comentário explicando o uso
COMMENT ON COLUMN cliente.dominios IS
  'Lista de domínios de email associados ao cliente (ex: {"bodytech.com.br","bodytechfit.com.br"}). Usado por automações para identificar cliente a partir de participantes de reuniões.';
```

Cada domínio na lista é case-insensitive e SEM o `@` (ex: `"bodytech.com.br"`, não `"@bodytech.com.br"`).

### 2. Edge Function `get-clientes`

Localizar `supabase/functions/get-clientes/index.ts` (ou equivalente).

No SELECT que monta a resposta, **adicionar a coluna `dominios`** ao retorno JSON. A estrutura final do response deve ser:

```json
{
  "clientes": [
    {
      "id": "uuid",
      "nome": "Bodytech",
      "tier": "estrategico",
      "eh_interno": false,
      "dominios": ["bodytech.com.br"],
      "projetos": [...]
    }
  ]
}
```

**Compatibilidade:** clientes com `dominios = []` (array vazio) devem retornar como `"dominios": []` no JSON, não omitir o campo.

### 3. Validação no endpoint de criação/edição de cliente (se existir)

Se houver endpoint POST/PATCH pra cliente, validar que cada item de `dominios`:
- É string não vazia
- Não começa com `@`
- Não contém espaço
- Match regex simples `/^[a-z0-9.-]+\.[a-z]{2,}$/i`

Em caso de inválido, retornar 400 com mensagem clara.

### 4. Tipos TypeScript

Atualizar a interface/tipo do Cliente em `types/` (ou onde for declarado):

```ts
interface Cliente {
  // ... campos existentes
  dominios: string[];
}
```

### 5. Não fazer agora (deixar pra mim)

- ❌ Frontend (formulário de cliente, exibição) — eu complemento separado
- ❌ Backfill dos clientes existentes — eu populo manualmente via SQL Editor

### Critérios de aceitação

1. Rodar `supabase db push` (ou equivalente) aplica a migration sem erro
2. `GET /get-clientes` retorna o novo campo `dominios` em todos os clientes
3. Tipos TypeScript compilam sem erro
4. Testes existentes ainda passam (não quebrar nada)
