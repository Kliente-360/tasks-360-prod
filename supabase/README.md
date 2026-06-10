# `supabase/` — banco e edge functions

```
supabase/
├── README.md                  ← este arquivo
├── schema.sql                 snapshot CANÔNICO do banco em produção
├── seed.sql                   dados de exemplo (cold-start dev)
├── functions/                 Edge Functions ativas
│   ├── ingest-task/            cria/atualiza task (SF + automações IA)
│   ├── ingest-comment/         puxa comentários do Chatter
│   ├── dispatch-webhook/       envia task/comment changes pro SF (OAuth)
│   ├── delete-task/            apaga task com cascade
│   ├── cleanup-attachments/    cron diário · limpa anexos órfãos (30d)
│   ├── get-clientes/           leitura · clientes + domínios + projetos
│   ├── get-pessoas/            leitura · pessoas candidatas a responsável
│   └── get-tasks/              leitura · tasks por external_id
├── migrations/
│   ├── README.md              workflow + regras
│   ├── applied/.gitkeep       patches já rodados (vazio · histórico vive no schema + tag git)
│   └── *.sql                  migrations pendentes (raiz) — após rodar, mover pra applied/
└── seeds/.gitkeep             scripts de import pontuais (vazio)
```

## `schema.sql` · source of truth do estado vivo

Snapshot completo do banco em produção: tabelas, constraints, indexes,
functions, triggers, RLS policies, replica identity, publications. Gerado
em **10/06/2026 · v1.03.141** via queries em `pg_catalog`.

**Como usar:**

- **Cold-start** de novo projeto Supabase → rodar `schema.sql` no SQL
  Editor (uma única vez). Cria tudo do zero.
- **Auditoria/forensics** — ver função/trigger/policy atual sem precisar
  abrir o Dashboard.
- **Detectar drift** — comparar `pg_get_functiondef` / `pg_get_triggerdef`
  do DB com o que está aqui. Diferença = alguém editou via Dashboard sem
  refletir no repo.

**Quando atualizar:**

- Após cada migration rodada (idealmente, automaticamente).
- Antes de releases importantes.
- Quando descobrir drift entre repo ↔ DB.

**Como regenerar:**

Rodar os 8 blocos de query documentados em `supabase/migrations/README.md`
(seção "Regenerar schema.sql") e colar os outputs num novo `schema.sql`
mantendo a estrutura por seção atual.

## Migrations · workflow contínuo

1. Criar arquivo em `migrations/<YYYY-MM-DD>_<descricao>.sql`
2. Cabeçalho com motivo + idempotência
3. Rodar no SQL Editor
4. Mover pra `migrations/applied/` ao confirmar
5. **Idealmente:** atualizar `schema.sql` com o novo estado canônico
6. Bumpar `APP_VERSION` em `src/components/app-nav.tsx`

## Histórico pré-cleanup (jun/2026)

Os 53 migration files antigos foram esvaziados em **v1.03.134** (`schema.sql`
agora reflete o estado consolidado em vez do empilhamento de patches).

Pra recuperar qualquer arquivo histórico individual:

```bash
git show schema-pre-cleanup:supabase/migrations/applied/<file>.sql
```

A tag `schema-pre-cleanup` aponta pro commit `4fec7e2` (último antes da
limpeza).

## Setup do zero

```sql
-- 1. Schema completo
\i schema.sql

-- 2. (Opcional) Seed dev
\i seed.sql

-- 3. Migrations pendentes (se houver em raiz de migrations/)
\i migrations/<arquivo>.sql

-- 4. Deploy Edge Functions via Dashboard
--    (functions/<nome>/index.ts → Edge Functions UI → Deploy)
```

Realtime, RLS, triggers e tudo mais já vão configurados via `schema.sql`.
