# Setup pra Membros do Time — Tasks 360 Gemini Ingestor

> Guia rápido pra configurar o ingestor de notas do Gemini na sua conta Google.
> Tempo estimado: **5 minutos**.

## O que isso faz

A cada 10 minutos, lê suas notas de reunião do Gemini (do seu Gmail) e cria tasks correspondentes no Tasks 360, pulando reuniões 100% internas e tarefas que são responsabilidade do cliente.

## Pré-requisito

- Estar logado no Google com sua conta `@kliente360.com`
- Ter o `Code.gs` (o Felipe te manda) — também disponível em `/Documents/Claude/Projects/Tasks from Email/apps-script/Code.gs`
- Pegar com o Felipe o valor da `TASKS360_API_KEY` (não compartilhar fora do time)

## Passos

### 1. Criar o projeto

1. https://script.google.com → **+ Novo projeto**
2. Apaga o conteúdo padrão de `Code.gs`
3. Cola o conteúdo do arquivo `Code.gs` que o Felipe enviou
4. Renomeia o projeto (canto superior esquerdo) para `Tasks360 — Gemini Ingestor`
5. Salva (`Cmd+S`)

### 2. Configurar Script Properties

1. Engrenagem na sidebar esquerda → **Project Settings**
2. Role até **Script Properties** → **Add script property**
3. Adiciona estas duas:

| Property | Value |
|---|---|
| `TASKS360_API_KEY` | _(pega com o Felipe — mesma pra todos)_ |
| `TASKS360_BASE_URL` | `https://nxtlipldmsopscpshrfd.supabase.co` |

4. **Save script properties**

### 3. Aprovar permissões

1. Volta ao editor (ícone `< >`)
2. No dropdown de funções (em cima), seleciona `debug_listClientes`
3. **Run**
4. Popup "Authorization required" → **Review permissions**
5. Escolhe sua conta `@kliente360.com`
6. "Google hasn't verified this app" → **Advanced** → **Go to ... (unsafe)**  
   (Seguro: é o seu próprio script, ninguém mais executa.)
7. Concede acesso a Gmail, Calendar, External requests
8. Confere o **Execution log** — deve mostrar a lista de clientes

### 4. Testar `main` manualmente

1. Dropdown → `main` → **Run**
2. Olha o log:
   - "Iniciando run …"
   - "N thread(s) encontrada(s)"
   - Se for `0`, pode ser que não tenha email do Gemini nas últimas 2h — tudo bem, é normal
3. Se quiser testar com janela ampla: edita `SEARCH_WINDOW = 'newer_than:7d'` no topo do `Code.gs`, roda, depois volta pra `'newer_than:2h'`

### 5. Configurar o trigger automático

1. Sidebar → **relógio** ("Triggers") → **+ Add Trigger**
2. Configura:
   - Function: `main`
   - Deployment: `Head`
   - Event source: `Time-driven`
   - Type: `Minutes timer`
   - Interval: `Every 10 minutes`
   - Failure notification: `Notify me immediately`
3. **Save**

Pronto. Agora seu script roda na nuvem do Google a cada 10 min, mesmo com seu computador desligado.

---

## Como funciona o fluxo

1. Script busca emails de `gemini-notes@google.com` no SEU Gmail das últimas 2h **que ainda não tem nenhuma das labels `tasks360/processado` ou `tasks360/skip`**
2. Pra cada nota:
   - Identifica a reunião e o cliente (via título e participantes do calendar)
   - Pula se for 100% interna ou sem attendees externos
   - Pra cada action item, identifica o responsável (você ou outro interno cadastrado no Tasks 360)
   - Cria a task via API Tasks 360 (mesma pra todos do time)
3. **Labels aplicadas após processar:**
   - `tasks360/processado` → o script criou/atualizou tasks dessa reunião
   - `tasks360/skip` → o script decidiu não criar tasks (reunião 100% interna, sem participante externo, cliente interno, ou nenhum action item encontrado)
   - Erro de API → nenhuma label, próximo run retry automaticamente
4. **Idempotência dupla:**
   - `external_id` usa o Message-ID global do email → mesmo se o script rodar em duas contas, a task é criada UMA vez (a 2ª faz update).
   - Label no Gmail → mesmo email não é reprocessado, mesmo se você deletar tasks no app.

### Quando uma task volta a aparecer no app depois que você deletou

Se você deletar uma task que veio do script e ela reapareceu: provavelmente a thread foi processada ANTES das labels entrarem em produção (versão antiga do script). Solução: aplique manualmente a label `tasks360/processado` na thread do Gmail correspondente.

### Como forçar reprocessar uma reunião

Remova a label `tasks360/processado` ou `tasks360/skip` (o que tiver) da thread no Gmail. Próximo run (em até 10min) pega de novo.

### Investigar reuniões que foram skipadas

Filtra no Gmail por `label:tasks360/skip` — você vê todas as threads onde o script decidiu NÃO criar tasks. Útil pra detectar:
- Reuniões com cliente externo mas que o script achou que eram internas (ex: convite sem confirmação do guest externo no calendar)
- Notas Gemini sem action items detectáveis pelo parser
- Casos onde a regra de "cliente interno" pegou errado

## Troubleshooting

| Sintoma | Causa | Fix |
|---|---|---|
| `Defina TASKS360_API_KEY...` | Script Properties não setadas | Passo 2 |
| `HTTP 401` em get-clientes | API key errada | Confere com Felipe |
| Trigger não dispara | Quota Apps Script estourou (raro) | Espera 24h ou checa Triggers |
| Tasks duplicadas | Bug — me avisa imediatamente | Felipe investiga |

## Convenções

- **Não mexa nas constantes do topo** (`INTERNAL_DOMAIN`, `GEMINI_SENDER`, etc.) sem alinhar com o Felipe — afeta a lógica de filtro
- **Não compartilhe** a `TASKS360_API_KEY` fora do time
- Se você criar reuniões com cliente novo (não cadastrado no Tasks 360), as tasks vão sair sem cliente identificado e ficam pra triagem manual

## Atualizações de código

Quando o Felipe avisar que tem versão nova do `Code.gs`:

1. Abre seu script no script.google.com
2. Substitui o conteúdo de `Code.gs` pela versão nova
3. Salva (`Cmd+S`)
4. Pronto — o trigger pega a versão nova automaticamente na próxima execução
