# Prompt para tornar `cliente` opcional na ingest-task (Tasks 360)

> Cola este prompt em Claude Code, Cursor, ou similar **na raiz do repo do seu app Tasks 360**. Cobre backend (Edge Function + schema). Frontend você complementa.

---

## Prompt

Tornar o campo `cliente` opcional na Edge Function `/ingest-task` do Tasks 360.

**Motivação:** automações externas (Apps Script lendo notas do Gemini) podem criar tasks quando há reunião com participante externo mas o cliente não pôde ser identificado com certeza (ex: domínio não cadastrado, conflito entre múltiplos clientes possíveis). Nesses casos, criar a task sem cliente — o usuário reatribui manualmente depois.

### 1. Edge Function `ingest-task`

Localizar `supabase/functions/ingest-task/index.ts` (ou equivalente).

Mudanças necessárias:

1. **Schema de input:** mudar `cliente` de obrigatório → opcional (nullable string)
2. **Lógica de match:** se `cliente` vier null/undefined, **não tentar** o match e seguir criando a task com `cliente_id = null`
3. **Validação adicional:** se `cliente` veio como string mas não bateu com nenhum cliente cadastrado, retornar 400 (comportamento atual mantido — só pra evitar typos)

Esqueleto da mudança:

```ts
// Antes
const cliente = await findClienteByName(body.cliente);  // throws se não achar
const tarefa = { titulo, cliente_id: cliente.id, ... };

// Depois
let cliente_id: string | null = null;
if (body.cliente !== undefined && body.cliente !== null && body.cliente !== '') {
  const cliente = await findClienteByName(body.cliente);
  if (!cliente) return resp400(`cliente "${body.cliente}" não encontrado`);
  cliente_id = cliente.id;
}
const tarefa = { titulo, cliente_id, ... };
```

### 2. Schema do banco

A coluna `tarefa.cliente_id` precisa permitir `NULL`:

- Se já é nullable: nada a fazer
- Se é NOT NULL hoje: criar migration

```sql
ALTER TABLE tarefa
  ALTER COLUMN cliente_id DROP NOT NULL;
```

(Verifique se existem foreign keys ou checks que assumem cliente_id presente — ajustar se necessário.)

### 3. Idem para `projeto`

Aproveitando a mudança, garantir que `projeto` também é opcional (provavelmente já é — `projeto_id` deve permitir NULL). Se `cliente` é null, `projeto` também tem que ser null (não dá pra ter projeto sem cliente).

```ts
// Forçar projeto null quando cliente null
if (cliente_id === null) projeto_id = null;
```

### 4. Tipos TypeScript

```ts
// Antes
interface IngestTaskInput {
  cliente: string;     // required
  // ...
}

// Depois
interface IngestTaskInput {
  cliente?: string | null;
  // ...
}
```

### 5. Validações que continuam

- `external_id` ainda obrigatório
- `titulo` ainda obrigatório
- Se `responsavel` vier mas não bater → 400 (comportamento atual)

### 6. Não fazer agora (deixar pra Felipe)

- ❌ Frontend: como exibir/editar tasks sem cliente, fluxo de "triagem", etc.
- ❌ Migration de tasks existentes (não deveria ter nenhuma agora — todas têm cliente)

### Critérios de aceitação

1. `POST /ingest-task` com body sem campo `cliente` retorna 201/200 e cria task com `cliente_id = null`
2. `POST /ingest-task` com `cliente: ""` ou `cliente: null` também aceita e cria sem cliente
3. `POST /ingest-task` com `cliente: "NomeQueNaoExiste"` continua retornando 400
4. Tasks com cliente_id null aparecem nas queries normais (não são filtradas por engano)
