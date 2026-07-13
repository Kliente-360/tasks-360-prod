# Mega-prompt pra colar em conversa nova do Cowork (conta Team)

> Usa esse prompt **uma única vez** numa conversa nova do Cowork da conta Team, depois que você já tiver:
> - Logado na Team account
> - Adicionado o MCP `tasks360` no `claude_desktop_config.json` (passo 2 do MIGRATION.md)
> - Reiniciado o Cowork
> - Selecionado a pasta `/Users/felipegonzaga/Documents/Claude/Projects/Tasks from Email` como working folder

---

## Cole isso na conversa:

```
Estou migrando minha automação Tasks 360 de uma conta Anthropic Pro pra essa Team account. A infra externa (Cloudflare Worker MCP, Apps Script, API Tasks 360) já está rodando e é a mesma — só preciso recriar o lado Cowork.

Faça o seguinte, em ordem, sem perguntar a cada passo:

PASSO 1 — Sanity check de connectors
- Liste os MCPs disponíveis (deve ter pelo menos: tasks360, Drive Google, Gmail)
- Chame mcp__tasks360__get_clientes pra confirmar que o MCP custom funciona
- Se algum não estiver ok, PARE e me diga qual falta

PASSO 2 — Salvar memória de contexto
Salva nas tuas memórias:
- user: Felipe Silva, founder Kliente360 (felipe@kliente360.com), construindo automação de tasks vinda de notas Gemini de reuniões com clientes
- project: Tasks 360 = app interno (Supabase) que recebe tasks via API. MCP custom proxy hospedado em https://tasks360-mcp.felipe-kliente360.workers.dev. Apps Script roda 10/10min processando emails do gemini-notes@google.com. Domínios internos: kliente360.com.
- feedback: Felipe quer SEMPRE aprovar antes de criar tasks no app. Não criar nada sem mostrar a proposta antes. Para Google Doc URL, sempre extrair via IA (formato livre), classificar interno/externo via lista de participantes do doc, e mostrar tabela editável pra aprovação.
- reference: Apps Script no script.google.com (projeto "Tasks360 — Gemini Ingestor"); Worker no Cloudflare account do Felipe; Supabase project = nxtlipldmsopscpshrfd

PASSO 3 — Recriar o artifact "Doc → Tasks 360"
- Lê o arquivo /Users/felipegonzaga/Documents/Claude/Projects/Tasks from Email/outputs/doc-to-tasks-artifact.html (se existir) OU o arquivo equivalente no projeto
- Se não existir nessa pasta, lê de /Users/felipegonzaga/Documents/Claude/Projects/Tasks from Email/apps-script/ e adjacentes pra reconstruir
- Cria o artifact via mcp__cowork__create_artifact com id="doc-to-tasks-360"
- Lista de mcp_tools que ele usa:
    mcp__tasks360__get_clientes
    mcp__tasks360__get_pessoas
    mcp__tasks360__ingest_task
    mcp__e7b05088-287e-4cc8-a3dc-93647f7dc720__read_file_content
    mcp__b02406f3-7ed6-4cc2-9538-26ef343fae82__search_threads
    mcp__b02406f3-7ed6-4cc2-9538-26ef343fae82__get_thread

PASSO 4 — Publicar artifact pra organização
- Após criar, me dá um passo-a-passo curto de COMO publicar pra org via UI do Cowork (botão Publish/Share), porque essa parte não tem tool
- Aviso que cada membro do time precisa adicionar o MCP `tasks360` no próprio claude_desktop_config.json (mesmo conteúdo)

PASSO 5 — Resumo final
- Confirma que tudo subiu (catálogo respondendo, artifact criado)
- Lista 1-2 próximas ações que valem fazer (ex: testar o artifact com 1 doc real, configurar Apps Script pros outros internos)
- NÃO crie tasks nem use scheduled tasks aqui

Se algo falhar em qualquer passo, NÃO PARE — registra o erro e segue. Reporta tudo no final.
```

---

## Depois que rodar

Felipe deve verificar no Cowork:

1. ✅ MCP `tasks360` listado em Settings → Connectors
2. ✅ Artifact "Doc → Tasks 360" aparece na sidebar
3. ✅ Artifact carrega catálogo (8 clientes, 8 pessoas)
4. ✅ Artifact lista emails recentes do Gemini
5. ✅ Memórias salvas (verifica em `~/Library/Application Support/Claude/local-agent-mode-sessions/<nova-session>/spaces/<...>/memory/`)
6. ⏳ Publicar pra org (passo manual via UI)

Se algum desses falhar, abre nova conversa comigo e me diz o que travou.
