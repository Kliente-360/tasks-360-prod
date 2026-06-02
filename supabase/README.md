# `supabase/` — banco e edge functions

```
supabase/
├── README.md                  ← este arquivo
├── schema.sql                 baseline original (rodar UMA vez ao criar projeto)
├── seed.sql                   dados de exemplo opcionais
├── realtime.sql               configuração de Realtime (✅ aplicado em jun/2026)
├── functions/                 Edge Functions ativas
│   ├── ingest-task/            cria/atualiza task (SF + automações IA)
│   ├── ingest-comment/         puxa comentários do Chatter
│   ├── delete-task/            apaga task com cascade
│   ├── cleanup-attachments/    cron diário · limpa anexos órfãos (30d)
│   ├── get-clientes/           leitura · clientes + domínios + projetos
│   └── get-pessoas/            leitura · pessoas candidatas a responsável
├── migrations/
│   ├── README.md              regras de migration
│   ├── applied/               patches já rodados em produção (histórico)
│   └── *.sql                  migrations na raiz = pendentes de aplicar e mover pra applied/
└── seeds/                     scripts de import de dados pontuais
    └── import_2026-05-09.sql  carga inicial via CSV
```

## Setup do zero (projeto novo)

Ordem de execução no SQL Editor:
1. `schema.sql` — cria tabelas-núcleo
2. `realtime.sql` — habilita Realtime nas tabelas
3. `migrations/applied/*` + migrations soltas na raiz de `migrations/` — todas em ordem cronológica pelo filename
4. `seed.sql` ou `seeds/import_*.sql` — dados (opcional)
5. Deploy das edge functions em `functions/`

## Manutenção contínua

- Mudanças no schema → criar arquivo `migrations/<data>_<nome>.sql`
- Rodar no SQL Editor
- Mover pra `migrations/applied/` ao confirmar que rodou OK (feito manualmente — sem automação)
- Commit
