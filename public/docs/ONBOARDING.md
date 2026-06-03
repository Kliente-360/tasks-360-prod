# tasks 360 — guia de onboarding

> Três perspectivas da mesma ferramenta. Leia a sua, dê uma passada de olho nas outras.
>
> **Versão atual**: v1.02.229 · jun/2026 · pós-cutover. Para o manual técnico de cada feature, ver [`HOWTO.md`](./HOWTO.md). Para o manual do cliente externo, ver [`HOWTO_CLIENTE.md`](./HOWTO_CLIENTE.md).

---

# CEO · gestão e tomada de decisão

> "Olho nas pessoas certas, nos clientes certos, na hora certa."

## Para que serve, do seu lugar

O tasks 360 é a fonte de verdade do que está rolando na operação. Você não precisa abrir Notion, Drive, Slack e planilhas pra entender saúde de cliente, capacidade do time e onde está atrasando. **Briefing** te dá a leitura de 1 minuto com ação requerida; **Dashboard** consolida visões executivas pra leitura mais detalhada.

**Premissa central**: o app é opinativo. Não tem 30 campos pra preencher. Tem o mínimo necessário pra responder: *isso está atrasado? quem está sobrecarregado? onde estamos perdendo cliente?*

## Conceitos que importam pra você

- **Cliente.tier** — `estratégico` / `potencial` / `descoberta`. Heurísticas usam isso pra escalar alertas. Ex: tarefa atrasada de cliente estratégico pisca no banner; descoberta não.
- **Projeto.tipo** — `sustentação` / `projeto` / `discovery`. Define como ler capacidade e lead time esperado.
- **Projeto.sla_* + orcamento_horas** — habilitam alertas de SLA iminente e de estouro de orçamento.
- **Heurísticas pré-IA** — alertas determinísticos, sem caixa-preta. Cada um tem critério explícito. As mais críticas viram banner; o resto vive no Briefing.
- **Status como verdade única** — não há "status real" e "status do app". O que está no app É o estado da operação. Se o time não atualizar, você está cego.
- **Saúde por projeto** — semáforo verde/âmbar/vermelho com critérios fixos. Vermelho = atrasadas, SLA quase vencido, ou bloqueio +5d. Não é palpite.
- **Capacidade por pessoa** — % alocado vs capacidade declarada (`capacidade_horas_semana`). Vermelho = overflow.

## Onde abrir todo dia

- **Briefing** (aba dedicada, só admin) — sua primeira tela do dia. Headline narrativa no topo + seções colapsáveis com: clientes em atenção, heatmap de capacidade do time, projetos com orçamento estourando, conquistas da semana, disciplina de comentário, sugestões de redistribuição. Leitura de 1-2 min com ação.
- **Dashboard** (admin/interno) — cockpit operacional pra leitura mais profunda. KPIs, semáforo de projetos, heatmap W0–W3, throughput 12 semanas, lead time por cliente, sinal por pessoa.

## Como ler o Dashboard em 90 segundos

1. **Banner de heurísticas no topo** — leia primeiro. Se tem item ali, alguma coisa precisa de atenção esta semana.
2. **Semáforo de projetos** — qualquer vermelho é conversa de hoje, não de amanhã.
3. **Capacidade por pessoa** — se alguém está em vermelho, ou você redistribui ou aceita o atraso conscientemente.
4. **Lead time por cliente** — tendência. Se está subindo num cliente, esse cliente está virando dor.
5. **Throughput 12 semanas** — barra empilhada verde/vermelha mostra entregas no prazo vs atrasadas. Tendência de execução.

## Casos de uso práticos

**1-on-1 com sócio / head de operação**
- Abrir **Briefing** → bullets de ação requerida com nome próprio. Decisão direta.
- "Por que essa tarefa estratégica está em vermelho?" Click → modal da task → linha do tempo mostra quando entrou, quem mexeu, quando foi reaberta.

**Reunião de cliente**
- Filtrar Backlog por cliente → ordenar por prazo → ver o que está em risco.
- Ou abrir o **Portal do cliente** (mesmo a partir do seu login admin, com seletor "visualizar como cliente") pra ver exatamente o que o cliente vê.

**Decisão de contratação**
- **Briefing → Capacidade vs demanda** dá leitura semanal de utilização. Sobrecarga persistente em 3+ semanas = sinal de contratação.

**Decisão de demitir cliente**
- Cliente de descoberta consumindo horas de projeto estratégico → ver Dashboard (Volume por cliente + Lead time por cliente).

## Dicas de produtividade

- **Briefing antes do Dashboard**. Briefing é a leitura de 1 min com ação; Dashboard é a leitura de 5 min com dado bruto.
- **Cmd+K (command palette)** — buscar qualquer task/cliente/projeto sem clicar. Ponto de entrada padrão.
- **Atalho `g d`** Dashboard · `g b` Backlog · `g f` Meu foco · `g c` Calendário · `g t` Triagem · `g l` limpa filtros.
- **Não preencha tarefas**. Sua função é ler o sistema, não alimentá-lo.
- **Defina `tier` em todos os clientes**. Sem isso, metade das heurísticas não funciona.
- **Defina `capacidade_horas_semana` em todas as pessoas**. Sem isso, heatmap e heurísticas de carga não funcionam.

## O que NÃO fazer

- Não abrir 50 abas de "ideias" no app. Use Notion/Drive pra exploração; tasks 360 é só o que está em execução.
- Não usar pra micro-gestão ("cliquei na task do Fulano de manhã pra ver se ele já mexeu"). O Briefing/Dashboard respondem isso sem precisar abrir task.
- Não trocar os critérios de heurística sem alinhar. São determinísticos por design.

## Novidades recentes (v1.02 · jun/2026)

- **Cutover concluído**: Alpine desativado. Vercel é a única produção. Realtime ativado nas 4 tabelas core (tasks/clientes/projetos/pessoas) — mudanças de outros usuários aparecem em tempo real, sem precisar clicar na logo pra refetch.
- **Portal cliente v2**: ativo, com header verde Kliente, KPIs com delta, sparkline 6 meses de entregas, lead time 90d, comentários públicos bidirecionais, botão "Já respondi" pra cliente destravar bloqueio.
- **Cronômetro start/stop**: time tracking real por task. Habilita honestidade na medição vs estimativa.
- **Briefing colapsável + conquistas da semana anterior**: seções recolhem; conquistas W-1 entram pra dar contexto positivo na leitura.
- **Tasks criadas por IA**: automação externa (Cowork lendo notas de reunião) cria tasks via API. Elas chegam com chip 🤖 IA e caem na Triagem pra um humano atribuir cliente/responsável.
- **Badge PWA com atrasadas**: ícone no celular/desktop mostra contador de tasks atrasadas. Mesmo com o app fechado.

---

# Gerente de projetos · agilista

> "Cerimônia bem feita = todo mundo sabe o que fazer no dia seguinte sem perguntar."

## Para que serve, do seu lugar

O tasks 360 é onde você **conduz** as cerimônias e o time **executa**. Refinamento, daily, retro, planning — todas usam o app como artefato único. Sua função é manter o backlog limpo, priorizado, com prazo realista, e garantir que o time saiba o que fazer.

Você é a pessoa que mais usa o app no dia-a-dia depois dos analistas.

## Conceitos que importam pra você

- **Etapa (status macro)** + **subetapa** — etapa é o macro (backlog / andamento / bloqueado / concluído), subetapa é o detalhe operacional. Trigger sincroniza automaticamente; você só mexe na subetapa.
- **Subetapas oficiais** (11):
  - `backlog`, `priorizado`, `em_definicao`, `escopo_definido` — fase de preparação
  - `em_desenvolvimento`, `em_homologacao`, `em_revisao`, `pronto_producao`, `em_implantacao` — fase ativa
  - `bloqueado` — pausa com motivo
  - `concluido` — entregue
- **Esforço em horas** (não pontos) — decisão deliberada do produto. Se time não souber estimar, treine; não troque de unidade.
- **Prioridade P0–P3** — P0 = pra ontem; P1 = essa semana; P2 = essa quinzena; P3 = quando der.
- **Complexidade** vs **esforço** — complexidade é "quão difícil"; esforço é "quanto tempo". Tarefa pode ser simples mas longa.
- **Reopen_count** — incrementa automaticamente quando volta de `concluido`. Se ≥2, a task fica visível como reaberta no modal.
- **Bloqueado por** — campo obrigatório quando você seta `bloqueado`. Diz **o que** está travando ("aguardando cliente", "aguardando engenharia", "depende de outra task"). Comentário inline também é exigido — sem isso o app não deixa salvar.
- **`visivel_cliente` na task / comment** — controla o que aparece no Portal. Use com intenção: padrão é interno; marca público quando o cliente precisa ver.
- **`escopo` da task + `skills` da pessoa** — campos de classificação técnica (ex: "SF Admin", "IA/Conversacional"). Dropdown de responsável destaca pessoas com skills compatíveis.

## Onde abrir todo dia

- **Meu foco** — primeira parada de qualquer pessoa do time (admin ou interno). Card "Seu dia" no topo + 6 seções colapsáveis (Atrasadas · Pra hoje · Bloqueadas · Sem comentário 24h · Sem esforço · Sem horas realizadas). Cada card tem inline-edit dos campos críticos + botão **Resolver** que risca como "tratado hoje" sem persistir em DB (zera ao virar o dia). Bolinha vermelha na aba mostra total pendente. Tasks podem aparecer em mais de uma seção; resolver em uma não afeta as outras.
- **Triagem** (só admin) — fila de tasks ainda não prontas pra trabalhar. Falta cliente/projeto/responsável (sempre obrigatórios) ou prazo/esforço (a partir de `escopo_definido`), ou são tasks 🤖 IA aguardando aceite. Inline-edit dos 5 campos no próprio card · botões **Aceitar** (IA → backlog) / **Rejeitar** com motivo / **Salvar** (manual). Edição é pendente — só persiste no clique. Bolinha vermelha na aba mostra a fila.

## Guia de uso por cerimônia

### Refinamento (1-2x/semana)
1. Abrir **Triagem** → cards já mostram o que falta resolver (chips à direita).
2. Pra cada task, preencher cliente · projeto · responsável · prazo · esforço inline. Quando completar, clicar **Salvar** (manual) ou **Aceitar** (IA pré-triagem). Pra descartar IA, **Rejeitar** com motivo.
3. Mover pra subetapa adequada via inline status (ou pelo modal completo se precisar mexer mais).

### Daily (15 min)
1. Abrir **Kanban**.
2. Cada pessoa puxa o que está em andamento e diz: feito ontem, hoje, impedimentos.
3. Impedimento real → analista move pra `bloqueado` com motivo + comentário inline (app força preencher).
4. Não use o app pra reportar tempo — analista preenche `tempo_real_horas` ao fechar, ou usa o **cronômetro** start/stop pra registrar automaticamente.

### Planning (semanal)
1. **Briefing → Capacidade**. Heatmap pessoa × semana. Quem está com sobrecarga em verde claro/âmbar/vermelho pra próximas 4 semanas.
2. Backlog filtrado por `escopo_definido`, ordenar por prioridade, atribuir respeitando capacidade.
3. Definir prazo. Se time pediu prazo curto, anote complexidade alta — o sinal de "não vai entregar" aparece no Briefing depois.

### Retro (quinzenal)
1. Dashboard → **Throughput 12 semanas** (pra ver evolução com barra empilhada verde/vermelha), **Lead time por cliente**.
2. Banner de heurísticas — quais alertas mais apareceram nas últimas semanas?
3. Linha do tempo da task em discussão (modal → aba Histórico) — mostra exatamente o que mudou, quem mexeu, quando reabriu.

## Casos de uso práticos

**Cliente reclamou de atraso**
- Filtrar Backlog por cliente. Ordenar por prazo. Identificar o que de fato atrasou.
- Histórico da task → quando o prazo mudou? Quem moveu pra `bloqueado` com motivo "aguardando cliente"? Tem evidência.

**Pessoa nova no time**
- Atribuir tasks pequenas (esforço <4h) e simples (complexidade baixa) primeiro.
- Marcar skills no cadastro da pessoa pra o sistema sugerir match.

**Tarefa parada há 2 semanas**
- Aging do backlog mostra (cor da borda do card no Backlog). Decidir: arquivar (não vai fazer), ou repriorizar (vai fazer agora).
- Não deixar morrer no meio. Backlog inflado = sinal de gerência ruim.

**Replanejar projeto**
- Cadastros → editar projeto → ajustar `sla_*` ou `orcamento_horas`.
- Heurística de SLA iminente passa a alertar com base nos novos limites.

**Briefing acusou "disciplina de comentário" baixa**
- Tasks em andamento que ficaram >24h sem comentário ficam na seção de disciplina. Cobre o analista responsável (não Slack — comentário direto na task com @mention).

## Dicas de produtividade

- **Cmd+K** é seu melhor amigo. Pular pra task, pra cliente, pra projeto sem clicar.
- **Bulk actions** na tabela do Backlog: selecione N tasks e mude pessoa/etapa/prioridade de uma vez. Use isso em planning.
- **`g k` Kanban · `g b` Backlog · `g d` Dashboard · `g t` Triagem · `g c` Calendário · `g l` limpa filtros** — ganha 30s por hora.
- **@mention em comentário** dispara notif. Use pra escalar pro analista certo sem mandar Slack.
- **Arquive cliente/projeto inativo** — somem dos selects sem perder histórico. Toggle "incluir arquivados" reaparece quando precisa.
- **Filtro de Status no Calendário** — vê só atrasadas, ou só em andamento, etc, em vez do mês todo.

## O que NÃO fazer

- **Não inventar etapa nova** — etapas e subetapas são opinativas. Se sua operação não cabe, conversa com o produto antes de hackear.
- **Não usar `bloqueado_por` como diário** — campo é um motivo, uma frase. Discussão vai em comentário (também obrigatório).
- **Não aceitar task sem prazo nem esforço** em etapa avançada. Triagem reclama por design.
- **Não fechar task que não foi entregue** — analista preenche `tempo_real_horas` antes de marcar `concluido`. Sem isso, você não consegue medir nada.
- **Não usar P0 pra tudo**. Se tudo é P0, nada é. P0 é raro.

## Novidades recentes (v1.02 · jun/2026)

- **Bloqueado exige justificativa**: ao setar `bloqueado`, o app força preencher `bloqueado_por` + comentário inline. Acabou bloqueio órfão.
- **Tasks por IA na Triagem**: chip 🤖 + filtro próprio combinável com `sem resp.` / `sem prazo` / `sem esforço`.
- **Cronômetro + Timesheet**: analista pode iniciar timer numa task; quando para, registra `time_entries`. Aba Timesheet mostra histórico (admin vê todos com filtro de pessoa; outros só os deles).
- **Escopo + skills**: classificação técnica da task pareada com skills da pessoa. Dropdown de responsável destaca matches.
- **Disciplina de comentário**: tasks em andamento sem comentário recente aparecem em seção dedicada no Meu foco e no Briefing.

---

# Analista · execução

> "Saber o que fazer agora, sem perguntar e registrar pro time saber o que rolou."

## Para que serve, do seu lugar

O tasks 360 te diz o que fazer hoje (**Meu foco**), recebe o que você produziu (status, tempo real, comentários), e mantém histórico do que aconteceu. Você não precisa lembrar do que combinou na daily — está no app.

A regra de ouro: **se mexer, atualize**. O status desatualizado prejudica todo mundo. Tudo que estiver em andamento com os Status relacionados abaixo precisam ter um **comentário diário** do desenvolvimento, mesmo que seja "não consegui começar ainda" ou "sem alteração":

> **Status que exigem comentário diário**: `em_desenvolvimento` · `em_revisao`

## Conceitos que importam pra você

- **Meu foco** — primeira aba que você abre todo dia. Suas tasks priorizadas, com vencidas no topo.
- **Backlog ou Kanban | Subetapa** — onde você atualiza estado. As principais:
  - `priorizado` — próxima atividade no gatilho, selecionado pelo cliente ou gerência.
  - `em_definicao` — definindo estrutura com engenheiro.
  - `escopo_definido` — gerência colocou pra você pegar.
  - `em_desenvolvimento` — você puxou e está executando.
  - `em_homologacao` — passou a bola pro cliente. *Pausa o cronômetro do nosso lado.*
  - `em_revisao` — cliente homologou, mas precisamos revisar algum ponto que foi levantado na homologação.
  - `pronto_producao` — aguardando a data para a subida.
  - `em_implantacao` — implantação em andamento.
  - `bloqueado` — não consegue prosseguir por algum motivo; **obrigatório** preencher `bloqueado_por` + comentário inline.
  - `concluido` — finalizado, entregue.
- **Prioridade** — P0 a P3: P0 = pra ontem; P1 = essa semana; P2 = essa quinzena; P3 = quando der.
- **Esforço estimado** — *não é cobrança*, é planejamento. Se gastou 8h numa task de 4h, registra real e segue.
- **Tempo real (`tempo_real_horas`)** — preenche ao fechar. Sem isso, não tem aprendizado. Alternativa: usar o **cronômetro** (play/stop no header) que registra automaticamente.
- **Comentário público (`visivel_cliente`)** — checkbox no comentário. Marcado = cliente vê no Portal. Desmarcado = só time interno. *Em dúvida, deixe interno.*
- **@mention** — `@nome` em comentário avisa a pessoa. Use pra perguntar ou repassar.
- **Reabrir uma task** — não tem botão "reabrir": muda de `concluido` pra outra subetapa. Trigger incrementa `reopen_count`. Se reabrir 2+ vezes, fica visível como reaberta.

## Guia de uso, dia típico

### Manhã (5 min)
1. **Meu foco** (`g f`). Bolinha vermelha na aba mostra quantos itens pedem atenção.
2. Percorrer as 6 seções (Atrasadas → Pra hoje → Bloqueadas → Sem comentário → Sem esforço → Sem horas). Em cada card, ajustar inline (prazo · esforço · horas · status · motivo · comment) e clicar **Salvar**.
3. Pra itens que já tratou mas não precisam mudança no banco, clicar **Resolver** — risca o card só hoje, descontra da bolinha vermelha, zera ao virar o dia.
4. Quando começar a trabalhar uma task de fato → mover pra `em_desenvolvimento`.

### Durante (toda hora que mudar de assunto)
- Se trocou de task: comente o que já foi realizado de forma simples e mova a anterior para o status adequado caso seja necessário.
- Pergunta pendente? Comentário com @mention. Se descobriu algo novo durante o desenvolvimento (subtarefa, dependência) → criar task nova.
- **Cronômetro**: se quiser registro automático de tempo, clica play na task ativa. Quando parar (ou trocar de task), o tempo entra na sua Timesheet.

### Ao fechar uma task
1. Preencher `tempo_real_horas` — quanto efetivamente consumiu (ou deixa o cronômetro fazer).
2. Se tem entrega visível pro cliente → criar comentário **público** com link/print.
3. Mover pra status correspondente: `em_homologacao` | `pronto_producao` | `concluido`.

### Final do dia (2 min)
- Olhar **Meu foco** | **Kanban**, verificar se há algo no macro `andamento` que ficou sem comentário, ou alguma task com status desatualizado. A seção "Sem comentário" no Foco mostra exatamente quais.

## Casos de uso práticos

**Cliente respondeu — task estava em `bloqueado`**
- Mover pra `em_desenvolvimento` (ou `escopo_definido` se vai pegar amanhã).
- Comentário com resumo do que cliente respondeu (público assim ele já vê no Portal; interno se for tradução pro time).

**Dúvida no meio da execução**
- Comentário na task com @mention da pessoa.
- *Não* mover pra `bloqueado` por dúvida pequena — só se realmente travou.

**Estimativa furou (gastou muito mais que esperado)**
- Registra `tempo_real_horas` honestamente. Heurística "estimativa furada" vai pingar; não é cobrança, é insumo pra time estimar melhor da próxima.

**Chegou pedido novo direto pra você**
- Criar task (`n` ou Cmd+K → "criar"). Título + cliente + descrição mínima.
- Deixa em `backlog` sem responsável/prazo — vai aparecer na **Triagem** pro gerente refinar e priorizar.

## Dicas de produtividade

- **`g f` Meu foco** — atalho mais usado. Memorize.
- **`n`** abre task nova de qualquer lugar.
- **Cmd+K** busca task pelo título. Mais rápido que rolar.
- **Comentário curto e datado mentalmente** — "20/05 enviado mockup v2" vale mais que "ok mandado".
- **Notifications (sino)** — checa de vez em quando. @mention pra você fica lá. Chips de filtro separam por tipo (menção / atribuição / mudança de status / cliente respondeu).
- **Não use `bloqueado` como "preguiça"**. Bloqueado tem motivo factual; senão é só `escopo_definido`.

## O que NÃO fazer

- **Não fechar task sem `tempo_real_horas`**. Mata o aprendizado coletivo.
- **Não deixar tudo em `em_desenvolvimento`**. Use `bloqueado` / `em_revisao` / `em_homologacao` quando for o caso.
- **Não comentar em público sem checar** — `visivel_cliente` vai pro Portal. Em dúvida, interno (e depois você pode trocar se mudar de ideia).
- **Não usar comentário pra discussão longa de design**. Discussão vai em call e registra um comentário resumido.
- **Não trocar prazo sem comentário**. Histórico mostra a mudança, mas o "por quê" some se você não escrever.

## Novidades recentes (v1.02 · jun/2026)

- **Cronômetro start/stop**: botão play no header — registra tempo automaticamente em `time_entries`. Aba **Timesheet** mostra seu histórico.
- **Bloqueado exige justificativa**: ao mover pra `bloqueado`, o app força preencher `bloqueado_por` + comentário. Acabou de ficar travado sem motivo.
- **Disciplina de comentário**: tasks em andamento sem comentário recente entram numa seção no Meu foco. Lembrete passivo sem ninguém te cobrar.
- **Chip 🤖 IA**: algumas tasks chegam de automação externa (Cowork lendo notas de reunião) e aparecem com o chip 🤖 IA antes do título. Trate igual a qualquer task — só saiba que o título e a descrição vieram de uma IA e podem precisar de ajuste fino ao triar.
- **Notificações por tipo**: o sino agora separa menção / atribuição / mudança de status / cliente respondeu com chips de filtro. Mais fácil achar o que é pra você.
- **Meu foco com narrativa**: a aba abre com um resumo heurístico do dia (o que está atrasado, o que é prioridade).
- **ESC encadeado no modal**: ESC fecha o elemento mais interno primeiro (picker @mention → linha de checklist vazia → reply → lightbox → modal).
- **Mobile FAB**: botão flutuante `+ task` no canto inferior direito do celular pra criar tarefa rápido.
- **Badge PWA**: ícone do app no celular mostra contador de tasks atrasadas, mesmo com o app fechado.

---

> Dúvidas? Pingue o gerente de projetos no canal #ops. Esse guia evolui — sugestões de melhoria também viram task.
