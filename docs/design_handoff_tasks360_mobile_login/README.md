# Handoff — tasks 360 · Mobile + Login (Design System Kliente 360)

> **Para o desenvolvedor (Claude Code):** addendum ao handoff principal (`design_handoff_tasks360_repaginacao`). Cobre as **telas mobile** e as **telas de login** (desktop + mobile) da repaginação. Tokens, tipografia, cor e componentes-base são os mesmos do pacote principal — aqui documentamos só o que é novo/específico destas telas.

---

## 0. Arquivos deste pacote

- `prototype/tasks 360 mobile.html` — protótipo **mobile** (app dentro de um iPhone), interativo. 5 abas + sheets + detalhe de tarefa.
- `prototype/tasks 360 login.html` — **login desktop** (split-screen), responsivo (vira login mobile abaixo de 900px sozinho).
- `prototype/tasks 360 login mobile.html` — **login mobile** emoldurado no iPhone (mesma tela, para apresentar junto ao protótipo mobile).
- `prototype/hifi/*` — CSS + componentes compartilhados (mesmos do handoff principal): `app.css` (tokens + componentes), `mobile.css` (layout mobile), `icons.jsx`, `ui.jsx`, `data.jsx`, `ios-frame.jsx`, `mobile.jsx`, `screens1/2.jsx`, `modals.jsx`, `app.jsx`.
- `screenshots/` — capturas de todas as telas (mobile + login).

**Fidelidade:** hi-fi — recriar pixel-a-pixel na stack real (Next.js + Tailwind + `globals.css`), reusando os tokens do §2 do handoff principal. O protótipo usa React+Babel no browser **apenas como referência**.

---

## 1. Contexto

Mesmo app `tasks-360-prod`. O mobile **não é um app separado** — é o mesmo produto em viewport pequeno. A regra que o time definiu:

> No mobile, **só 5 abas**, nesta ordem: **Briefing · Foco · Backlog · Dashboard · Portal**. Todo o resto (Kanban, Triagem, Calendário, Timesheet, Cadastros) **não aparece** no mobile. O header mostra **só** logo + notificações + perfil.

---

## 2. Shell mobile

Ref: `prototype/hifi/mobile.jsx` (`MobileApp`) + `prototype/hifi/mobile.css`.

### 2.1 Header (`.m-header`)
- Uma linha: **aperture + "tasks 360"** à esquerda · espaçador · **sino** (com dot-badge de notificação) · **avatar de perfil**.
- Nada de versão, busca global, exportar, tema, "+ tarefa" — tudo isso sai do header no mobile.
- Fundo sólido `var(--bg)` + borda inferior `var(--line)`. **Não usar `backdrop-filter`** (quebra em captura/export e não há conteúdo rolando atrás).

### 2.2 Tab bar inferior — "FCA" (`.m-tabbar`)
- **Barra de navegação inferior fixa** com 5 itens (ícone Lucide + label 10px), na ordem **Briefing · Foco · Backlog · Dashboard · Portal**.
- Ícones: briefing=`file`, foco=`target`, backlog=`list`, dashboard=`grid`, portal=`building`.
- Aba ativa em **verde editorial** (`--green`); inativa em `--fg-muted`.
- `padding-bottom` extra (~24px) para limpar o home indicator do iOS / safe-area.
- Tela inicial padrão: **Foco**.

### 2.3 Menu de perfil (bottom sheet) (`ProfileSheet`)
- Tocar no avatar abre um **bottom sheet** com: card do usuário no topo + lista agrupada (`.m-group` / `.m-row`):
  - **Tema** (ícone `sun`) — valor à direita ("Claro")
  - **Manual da ferramenta** (ícone `file`)
  - **Onboarding** (ícone `help`) — refazer o tour
  - botão **Sair** (texto vermelho)
- Sheet: `.sheet-bg` (overlay) + `.sheet` (cartão arredondado 24px no topo, sobe de baixo, com grab handle).

---

## 3. Telas mobile (uma a uma)

Todas começam com `.m-pagetitle` (h1 + narrativa de contexto com `<b>` nos números) e usam os mesmos chips/avatars/KPIs do desktop.

| Tela | Componente | Anatomia |
|---|---|---|
| **Foco** | `MFoco` | Título "Foco de **hoje**" (verde-em) + pills **Minhas / Atrasadas / Hoje** (com contadores) + lista de cards-tarefa com checkbox, prioridade e horas. |
| **Backlog** | `MBacklog` | Título + contexto. **Busca** (todos os campos) + botão de **filtro** que abre o `FilterSheet` (Cliente/Responsável/Prioridade/Prazo). Chips de filtro ativo (removíveis). Lista de `TaskCard`. |
| **Dashboard** | `MDashboard` | KPIs 2×2 (`.m-kpis`), gráfico de **Throughput** (barras), **Carga por pessoa** (barras de progresso), "Precisa de atenção" (lista). |
| **Briefing** | `MBriefing` | **Digest operacional** (NÃO é leitura editorial): card **"Alertas"** com contadores `N críticos`/`N atenção` + "ver todos (N)"; alertas críticos (dot cheio vermelho) e de atenção (dot vazado âmbar) com título + detalhe; seção **"Clientes em atenção"** com sinal semafórico, tag, atraso em vermelho e ação verde "→ …". |
| **Portal** | `MPortal` | Header verde-escuro (`--bg-portal`) com nome do cliente; KPIs 2×2; alerta semafórico; lista de tarefas do projeto. |

### 3.1 Card de tarefa mobile (`TaskCard` / `.tcard`)
Padrão único: título + prioridade no topo; cliente·projeto como sub; rodapé com avatar+responsável, tag IA (se houver) e prazo (vermelho se atrasado). É a versão mobile da linha de tabela do desktop.

### 3.2 Detalhe de tarefa (full-screen) (`MTaskDetail` / `.detail-*`)
Tocar numa tarefa abre **tela cheia** deslizando de baixo: header escuro (`--bg-dark`) com breadcrumb + título + "salvo automaticamente"; corpo com Descrição, Detalhes (responsável/prazo/esforço/prioridade-status), Checklist, Comentários; footer com Fechar/Salvar.

### 3.3 Filtros mobile (`FilterSheet`)
Bottom sheet com os mesmos 4 filtros do desktop (Cliente, Responsável, Prioridade, Prazo) em linhas agrupadas + **Limpar / Aplicar**. A busca filtra **todos os campos**. É a forma mobile do componente único `FilterBar` (§3.2 do handoff principal).

---

## 4. Login

Ref: `prototype/tasks 360 login.html` (desktop responsivo) + `prototype/tasks 360 login mobile.html` (emoldurado).

### 4.1 Estrutura (dois acessos)
- **Time interno** → botão **"Acesso Time Interno"** (SSO Google; mantém o logo G colorido).
- **Acessar como cliente externo** → input de e-mail + botão **"Receber código por email"** (magic-code). O CTA começa **desabilitado** (verde-claro) e habilita quando o e-mail é válido (regex simples); ao enviar, vira "Código enviado →".
- Rodapé: "Não está cadastrado? **Peça acesso ao admin do espaço.**" (link verde).

### 4.2 Desktop — split-screen
- **Esquerda:** painel de marca escuro (`--bg-dark`) com **aperture em marca d'água** (círculos verdes baixa opacidade), wordmark, eyebrow "Acesso · time & clientes", headline **"Conhecimento aplicado, _como serviço_."** (verde-em em "como serviço"), lead "Gestão do time, dos prazos e dos clientes em um só lugar.", rodapé mono.
- **Direita:** formulário (sem repetir a marca, pois já está à esquerda). "Entrar" + os dois acessos.

### 4.3 Responsivo / mobile
- Abaixo de **900px**, o painel de marca **some** e o formulário ganha a marca no topo (aperture + "tasks 360", **sem** o subtítulo "por Kliente 360"). É exatamente o que a versão emoldurada (`login mobile`) mostra.

### 4.4 Decisões de copy do time (já aplicadas)
- Lead = "Gestão do time, dos prazos e dos clientes em um só lugar."
- Botão interno = "Acesso Time Interno" (sem o eyebrow "Time interno · Kliente 360").
- Eyebrow externo = "Acessar como cliente externo".
- Removidos: subtítulo "Acesso restrito a pessoas cadastradas." e o subtítulo "por Kliente 360" do formulário.

---

## 5. Onde implementar no repo

| Tela | Arquivo no repo (sugestão) | Notas |
|---|---|---|
| Login | `src/app/login/page.tsx` (ou rota de auth existente) | Split-screen desktop, colapsa no mobile. Dois fluxos: Google SSO + magic-code por e-mail. Validação de e-mail client-side; CTA desabilitado até válido. |
| Shell mobile | `src/components/app-nav.tsx` (responsivo) | Em viewport mobile: header reduz a logo+notif+perfil; navegação vira **tab bar inferior** com as 5 abas. As demais rotas continuam existindo (deep-link), só não aparecem na tab bar mobile. |
| Telas mobile | os mesmos `*-client.tsx` das telas | Cada tela já existe; adaptar o layout para mobile (cards no lugar de tabela, pills no lugar de FilterBar em Foco, FilterSheet no Backlog). Reusar os componentes compartilhados. |
| Menu de perfil | novo `profile-sheet.tsx` | Bottom sheet: Tema, Manual da ferramenta, Onboarding, Sair. |
| Detalhe de tarefa mobile | reusar `task-modal.tsx` em modo full-screen no mobile | Mesmo conteúdo do modal desktop, em tela cheia. |

---

## 6. Tokens, tipografia, cor, ícones
Idênticos ao handoff principal (`design_handoff_tasks360_repaginacao`, §2): Inter + JetBrains Mono, verde editorial `#007A3D`, `#009900` só na aperture, neutros, sem gradiente, ícones Lucide, sem emoji. Os valores exatos vivem em `prototype/hifi/app.css` (`:root`).

> ⚠️ **Não usar `backdrop-filter`** em header/tab bar/overlays mobile — quebra em captura e não agrega (nada rola atrás de elementos irmãos). Use superfícies sólidas.

## 7. Screenshots
Em `screenshots/`: as 5 telas mobile — `01-foco`, `02-backlog`, `03-dashboard`, `04-briefing`, `05-portal` — mais `09-login-desktop` e `10-login-mobile`.

Os **overlays** (detalhe de tarefa full-screen, bottom sheet de filtros e menu de perfil) não entram como imagem estática — a ferramenta de captura descarta camadas sobrepostas (mesma limitação do handoff anterior com os modais). Eles estão descritos em detalhe nos §2.3, §3.2 e §3.3 e podem ser vistos ao vivo abrindo o protótipo: toque numa tarefa (detalhe), no botão de filtro do Backlog (sheet de filtros) ou no avatar (menu de perfil).
