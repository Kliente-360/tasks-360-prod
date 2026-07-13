# Tasks 360 ← Notas Gemini

Automação que transforma notas de reunião do Gemini em tasks no app Tasks 360.

## Componentes

```
┌─────────────────┐                 ┌──────────────────────────┐
│ Gemini Notes    │  ── email ─→    │ Apps Script (felipe@k360)│
│ (Gmail)         │                 │  Trigger 10/10 min       │
└─────────────────┘                 │  • Lê emails             │
                                    │  • Extrai action items   │
                                    │  • Cliente match (regex) │
                                    │  • Calendar lookup       │
                                    │  • POST tasks 360        │
                                    └────────────┬─────────────┘
                                                 │
┌─────────────────┐                 ┌────────────▼─────────────┐
│ Cowork Artifact │  ── triagem ──→ │ Cloudflare Worker MCP    │
│  Doc → Tasks    │      manual     │  tasks360-mcp.felipe-... │
└─────────────────┘                 │  • get_clientes          │
                                    │  • get_pessoas           │
                                    │  • ingest_task           │
                                    └────────────┬─────────────┘
                                                 │
                                    ┌────────────▼─────────────┐
                                    │ Supabase Edge Functions  │
                                    │  /functions/v1/...       │
                                    │  + tabela tarefa         │
                                    └──────────────────────────┘
```

## Arquivos

- 📄 [tasks360-mcp/](./tasks360-mcp/) — Cloudflare Worker MCP server (TypeScript)
- 📄 [apps-script/](./apps-script/) — Google Apps Script (JavaScript) + setup pro time
- 📄 [outputs/](.) — Artifact HTML (sob `/sessions/.../outputs/doc-to-tasks-artifact.html`)
- 📄 [ROADMAP.md](./ROADMAP.md) — v2 (Claude API), v3 (real-time), v4 (Domain Wide Delegation)
- 📄 [MIGRATION.md](./MIGRATION.md) — passos pra migrar Cowork pra conta Team
- 📄 [MIGRATION-PROMPT.md](./MIGRATION-PROMPT.md) — mega-prompt pra colar na conversa nova
- 📄 [prompt-add-dominios-cliente.md](./prompt-add-dominios-cliente.md) — prompt pra adicionar campo `dominios` no schema cliente
- 📄 [prompt-cliente-opcional.md](./prompt-cliente-opcional.md) — prompt pra tornar cliente opcional na API

## Como funciona no dia a dia

1. **Reunião acontece** → Gemini gera nota e manda email
2. **Apps Script** (10 min depois) processa o email → cria tasks com cliente/responsável identificado
3. **Triagem manual** (Felipe abre o artifact "Doc → Tasks 360" no Cowork) pra docs específicos OU emails que precisam de revisão antes
4. Tasks aparecem no app Tasks 360 com `external_id` determinístico (idempotente)

## Decisões importantes (memória)

- Reunião 100% interna (todos `@kliente360.com`) → não cria tasks
- Action item assignado a funcionário do cliente → não cria task
- Action item assignado a interno cadastrado → cria com responsável
- Action item assignado a interno NÃO cadastrado (ex: Eduardo) → cria com responsável vazio
- Cliente não identificado / conflito → cria SEM cliente (API aceita) e prefixa descrição com "⚠ Cliente sugerido: ..."
- `external_id` formato: `cowork-mail-<thread_id>-<idx>` (Apps Script: `cowork-<rfc_msg_id>-<idx>`); doc: `cowork-doc-<doc_id>-<idx>`
