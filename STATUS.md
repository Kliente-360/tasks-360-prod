# STATUS.md — estado vivo do roadmap

> Fonte única de verdade do estado atual. Ler/atualizar todo começo de sessão relevante.
> `ROADMAP.md` = arquivo histórico imutável — não editar para refletir estado corrente.
>
> **Versão**: v1.02.214 · **Atualizado**: 01/06/2026

---

## NOW · pré-cutover (§9.3.1)

Todos os 3 concluídos → libera **§9.3.9 Cutover Vercel** (§9.3.9 do ROADMAP.md tem o plano completo).

- [ ] Revisar Dashboard
- [ ] Revisar Briefing
- [ ] Revisar Portal cliente

---

## NEXT · pós-cutover · sem IA (§9.3.2)

### ✅ Entregues

- ✅ Dashboard (mai/2026)
- ✅ Briefing (mai/2026)
- ✅ Calendário · filtro de Status
- ✅ Bloqueado exige `bloqueadoPor` + comentário inline
- ✅ Kliente 360 · só admin cria task neste cliente
- ✅ Escopo da task (`tasks.escopo text[]`) + `pessoas.skills` já existia (jun/2026)
- ✅ Briefing · dot de comentário novo (jun/2026)
- ✅ Cronômetro start/stop + aba Timesheet (jun/2026)

### ⏳ Pendentes

- [ ] Push notifications · Badge API ✅ · falta VAPID + Edge Function `send-push` + UI de permissão
- [ ] Triagem obrigatória para tasks criadas por IA (flag `triada_em`)
- [ ] Saved views / filtros nomeados
- [ ] Sticky thead Backlog

---

## LATER · só IA (§9.3.3)

Pré-req: ter chave Anthropic em env do Supabase. Sequência recomendada:

- [ ] `ai-suggest` (Haiku · ~R$0,015/exec) ⭐ — começar aqui
- [ ] `ai-weekly-summary` (Sonnet + cron sáb) ⭐⭐
- [ ] `ai-risk-scanner` (Sonnet · cron diário)
- [ ] Resumir thread de task · "TL;DR" (Sonnet · botão no modal)
- [ ] `ai-suggest-tags` (Haiku · depende de Tags — ver abaixo)
- [ ] Auto-triage com IA (depende de `ai-suggest` + Triagem obrigatória)
- [ ] Aba Foco com IA leve

---

## COLD · parqueado conscientemente (§9.3.4)

- `ai-chat` com tool use — adiar até `ai-suggest` + `ai-risk-scanner` validados em prod
- Workspaces 3 pilares (Salesforce · Dados · IA) — precisa spec própria + pós-cutover
- Heurísticas: Skill mismatch · Senioridade malalocada · Churn risk · Cliente em fricção

---

## DESCONTINUADOS (§9.3.5)

Tags · Tipo de trabalho · Dependências UI · Templates de projeto · WhatsApp digest · Slack integration · iCal feed · Triage inbox Linear-style · Importação CSV · File/Protocol/Share handlers · Multi-workspace externo · Faturamento NFe · API pública · Aba Adoção · Email digest semanal · Notif digest hourly

---

## Promessas centrais

| Promessa | Status |
|---|---|
| Visibilidade gerencial (Dashboard + Briefing) | ✅ Entregue mai/2026 |
| Colaboração viva (realtime) | ⏸ Canal pronto · publication dorme até Cutover Fase A |
| Diferenciação por IA | ❌ Zero em prod — 1ª prioridade pós-cutover |
| Portal cliente | ⏸ Portado, validando |
| Time tracking (cronômetro) | ✅ Entregue jun/2026 |

---

## Próximo passo imediato

→ Revisar **Dashboard / Briefing / Portal cliente** (NOW — qualquer ordem, são desacoplados).
→ Quando os 3 done: executar **Cutover Vercel** (~1h ativo · plano em §9.3.9 do ROADMAP.md).
