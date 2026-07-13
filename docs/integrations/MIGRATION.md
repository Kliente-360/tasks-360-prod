# Migração pra conta Cowork Team

> Cenário: você vai logar no Cowork desktop com a **conta Anthropic Team** (Google `felipe@kliente360.com` continua o mesmo). Apps Script e Cloudflare Worker NÃO precisam mudar — só recriar o lado Cowork (artifact + MCP + memória).

## O que NÃO migra (continua funcionando)

- ✅ **Cloudflare Worker MCP** (`https://tasks360-mcp.felipe-kliente360.workers.dev`) — está no seu Cloudflare, acessível por URL
- ✅ **Google Apps Script** (Tasks360 — Gemini Ingestor) — segue rodando na sua conta Google
- ✅ **Triggers do Apps Script** (10 min) — idem
- ✅ **API Tasks 360** (Supabase) — agnóstica

## O que migra (5 passos, ~15 min)

### 1. Logar Cowork na conta Team

1. Quit completo do Cowork (Cmd+Q)
2. Abre Cowork → desloga da conta atual → loga na **conta Team Anthropic**
3. Confere: Settings → você deve ver "Team plan" ou "Organization: Kliente360"
4. Aceita autorizar Drive e Gmail (vai pedir OAuth da conta Google)
5. Confirma que `felipe@kliente360.com` é a conta Google selecionada

### 2. Adicionar o MCP custom `tasks360`

Edita o config do Cowork (`~/Library/Application Support/Claude/claude_desktop_config.json`) na **conta nova**:

```json
{
  "mcpServers": {
    "tasks360": {
      "command": "npx",
      "args": [
        "-y",
        "mcp-remote",
        "https://tasks360-mcp.felipe-kliente360.workers.dev/mcp",
        "--header",
        "Authorization: Bearer <MCP_AUTH_TOKEN · pegar com Felipe>"
      ]
    }
  }
}
```

Quit + reabre Cowork. Em uma conversa nova, pede "lista clientes do Tasks 360" pra confirmar que o MCP responde.

### 3. Recriar o artifact "Doc → Tasks 360"

Abre uma conversa nova no Cowork (conta Team) e cola o conteúdo de [MIGRATION-PROMPT.md](./MIGRATION-PROMPT.md). Ele guia o Claude pra recriar tudo automaticamente.

### 4. Publicar o artifact pra organização

Após o artifact ser criado:

1. Abre o artifact na sidebar
2. Procura o botão **Publish** ou **Share** (ícone de avião de papel ou três pontos)
3. Escolhe **"Share with organization"** (ou similar)
4. Confirma — vira público pra todos do time

Cada membro do time, depois de logado no Cowork, consegue ver e abrir esse artifact em "Shared artifacts" ou "Team artifacts".

### 5. Documentação pro time (depois da publicação)

Compartilha [SETUP-USERS.md](./apps-script/SETUP-USERS.md) com o time pra eles configurarem:
- Apps Script no próprio Google deles (Gemini emails de cada um → tasks)
- Custom MCP `tasks360` no Cowork deles (mesmo JSON da seção 2)

---

## Estrutura de arquivos pro time

| Arquivo | Quem usa | Função |
|---|---|---|
| [tasks360-mcp/Code.gs](./tasks360-mcp/) | Você (deploy) | MCP server (já deployado) |
| [apps-script/Code.gs](./apps-script/Code.gs) | Cada membro do time | Apps Script de ingestão automática |
| [apps-script/SETUP-USERS.md](./apps-script/SETUP-USERS.md) | Cada membro do time | Como instalar o Apps Script |
| [tasks360-mcp/cowork-config-snippet.json](./tasks360-mcp/cowork-config-snippet.json) | Cada membro do time | Config do MCP custom no Cowork |
| Artifact "Doc → Tasks 360" | Cada membro do time | UI pra triagem manual de docs/emails |

---

## Manutenção e mudanças futuras

Quando precisar atualizar:

- **MCP server (`tasks360-mcp`)** → você roda `npx wrangler deploy` na sua conta Cloudflare. Atualização propaga pra todos automaticamente (mesma URL).
- **Apps Script** → cada membro precisa colar a versão nova manualmente (até implementarmos Service Account + Domain Wide Delegation, ver [ROADMAP.md](./ROADMAP.md))
- **Artifact** → você (Felipe) edita no Cowork da org. Mudanças aparecem pra todo o time automaticamente (compartilhado).

## Troubleshooting

| Sintoma | Causa | Fix |
|---|---|---|
| MCP `tasks360` não aparece | Config não foi salvo no lugar certo | Confere `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Artifact não publica | Plano não é Team/Enterprise | Confere em Settings → Plan |
| Drive/Gmail pede auth de novo | Conta Google diferente da anterior | Re-autoriza com `felipe@kliente360.com` |
| Artifact dá erro 404 | Tool name divergente | Reabre conversa nova; se persistir, me avisa |
