# Migrations

## Estrutura

- **`./` (raiz)** · migrations escritas e pendentes de aplicação. Após rodar no SQL Editor do Dashboard, mover pra `applied/`.
- **`applied/`** · histórico cronológico das mudanças que já foram aplicadas ao banco. Esta pasta foi esvaziada na limpeza de jun/2026 (o histórico vive no git e no schema atual). Daqui em diante, todo patch novo segue o fluxo abaixo.

## Fluxo de migration nova

1. Criar `migrations/<YYYY-MM-DD>_<descricao>.sql`
2. Cabeçalho do SQL deve listar premissas (idempotência, dependências, rollback)
3. Rodar no SQL Editor do Dashboard (sem CLI — convenção do projeto)
4. Confirmar OK
5. Mover o arquivo pra `applied/` e commitar
6. Bumpar `APP_VERSION` em `src/components/app-nav.tsx` antes do commit em main

## Regras gerais

- **Idempotência sempre que possível** (`if not exists`, `drop ... if exists`).
- **Comentário no topo** explicando o quê e por quê.
- **Sem ALTER destrutivo sem rollback** — se for dropar coluna, anotar como reverter.
- **Dependências explícitas** no topo se o patch precisa de outro rodado antes.
