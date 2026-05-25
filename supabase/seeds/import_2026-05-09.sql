-- ============================================================
-- import_2026-05-09.sql
-- Carga inicial de tasks via CSV.
--
-- Premissas (decisões já validadas com o usuário):
--   - Clientes / projetos / pessoas existentes são reaproveitados
--     SEM CRIAR NOVOS, exceto a pessoa "Edu" (mapping para "Luis Eduardo"
--     no CSV) que é criada idempotente.
--   - Pessoa: cadastros existentes são pelo primeiro nome
--     (Karen, Drieli, Felipe, Elder, Edu, Henrique, Fernando, João).
--     Múltiplos responsáveis no CSV: pega o primeiro nome.
--     "Luis Eduardo" → Edu (criado idempotente neste script).
--   - Datas DD/MM/YYYY → YYYY-MM-DD. Inválidas (asap, ND, sem data,
--     "Não foi combinado data") → NULL.
--   - "06/05/20226" (typo Indigo) → 2026-05-06.
--   - Título vazio → usa descrição como título (TotalPass × 7, Multimais).
--   - Título == nome do cliente → mergeia "Cliente: descrição" (Aurora × 3,
--     Indigo × 1).
--   - CTF: trazer todas as 14 entradas, incluindo as 6 duplicatas do CSV.
--   - Defaults quando vazios: prioridade=P2, esforço=0, complexidade=media.
--   - "Data de Entrada" vazia → criado_em default (now()).
--   - Subetapa derivada de "Status" do CSV; trigger preenche tasks.status
--     automaticamente.
--
-- ⚠️  RODAR APENAS UMA VEZ. Re-rodar duplica todas as tasks.
-- ============================================================

begin;

-- 1) Pessoa nova: Edu (mapeia "Luis Eduardo" do CSV).
insert into pessoas (nome)
select 'Edu'
where not exists (select 1 from pessoas where nome = 'Edu');

-- 2) Carga em bloco com IDs resolvidos no topo do bloco PL/pgSQL.
do $$
declare
  -- clientes
  v_aurora       uuid := (select id from clientes where nome = 'Aurora');
  v_bodytech     uuid := (select id from clientes where nome = 'Bodytech');
  v_ctf          uuid := (select id from clientes where nome = 'CTF');
  v_indigo       uuid := (select id from clientes where nome = 'Indigo');
  v_multimais    uuid := (select id from clientes where nome = 'Multimais');
  v_pao          uuid := (select id from clientes where nome = 'Pão e Talho');
  v_totalpass    uuid := (select id from clientes where nome = 'TotalPass');
  v_vb           uuid := (select id from clientes where nome = 'VB');
  -- projetos
  v_p_aurora     uuid := (select id from projetos where nome = 'Sales Cloud Intercâmbios' and cliente_id = v_aurora);
  v_p_bt         uuid := (select id from projetos where nome = 'Sustentação BT' and cliente_id = v_bodytech);
  v_p_ctf        uuid := (select id from projetos where nome = 'Sustentação CTF' and cliente_id = v_ctf);
  v_p_indigo     uuid := (select id from projetos where nome = 'Sales Cloud Estacionamentos' and cliente_id = v_indigo);
  v_p_multimais  uuid := (select id from projetos where nome = 'Sustentação Multimais' and cliente_id = v_multimais);
  v_p_pao        uuid := (select id from projetos where nome = 'Sustentação Pão' and cliente_id = v_pao);
  v_p_totalpass  uuid := (select id from projetos where nome = 'WhatsApp TPweb' and cliente_id = v_totalpass);
  v_p_vb         uuid := (select id from projetos where nome = 'Sustentação VB' and cliente_id = v_vb);
  -- pessoas (cadastros pelo primeiro nome)
  v_karen        uuid := (select id from pessoas where nome = 'Karen');
  v_drieli       uuid := (select id from pessoas where nome = 'Drieli');
  v_felipe       uuid := (select id from pessoas where nome = 'Felipe');
  v_elder        uuid := (select id from pessoas where nome = 'Elder');
  v_edu          uuid := (select id from pessoas where nome = 'Edu');
  v_henrique     uuid := (select id from pessoas where nome = 'Henrique');
  v_fernando     uuid := (select id from pessoas where nome = 'Fernando');
  v_joao         uuid := (select id from pessoas where nome = 'João');
begin
  -- Sanity checks: aborta se algum cliente/projeto/pessoa-chave estiver
  -- faltando (evita inserir tasks com FKs erradas).
  if v_aurora is null    then raise exception 'cliente Aurora não encontrado';    end if;
  if v_bodytech is null  then raise exception 'cliente Bodytech não encontrado';  end if;
  if v_ctf is null       then raise exception 'cliente CTF não encontrado';       end if;
  if v_indigo is null    then raise exception 'cliente Indigo não encontrado';    end if;
  if v_multimais is null then raise exception 'cliente Multimais não encontrado'; end if;
  if v_pao is null       then raise exception 'cliente Pão e Talho não encontrado'; end if;
  if v_totalpass is null then raise exception 'cliente TotalPass não encontrado'; end if;
  if v_vb is null        then raise exception 'cliente VB não encontrado';        end if;
  if v_p_aurora is null      then raise exception 'projeto Sales Cloud Intercâmbios (Aurora) não encontrado'; end if;
  if v_p_bt is null          then raise exception 'projeto Sustentação BT não encontrado';                    end if;
  if v_p_ctf is null         then raise exception 'projeto Sustentação CTF não encontrado';                   end if;
  if v_p_indigo is null      then raise exception 'projeto Sales Cloud Estacionamentos (Indigo) não encontrado'; end if;
  if v_p_multimais is null   then raise exception 'projeto Sustentação Multimais não encontrado';             end if;
  if v_p_pao is null         then raise exception 'projeto Sustentação Pão não encontrado';                   end if;
  if v_p_totalpass is null   then raise exception 'projeto WhatsApp TPweb (TotalPass) não encontrado';        end if;
  if v_p_vb is null          then raise exception 'projeto Sustentação VB não encontrado';                    end if;
  if v_karen is null     then raise exception 'pessoa Karen não encontrada';     end if;
  if v_drieli is null    then raise exception 'pessoa Drieli não encontrada';    end if;
  if v_felipe is null    then raise exception 'pessoa Felipe não encontrada';    end if;
  if v_elder is null     then raise exception 'pessoa Elder não encontrada';     end if;
  if v_edu is null       then raise exception 'pessoa Edu não encontrada (rodar a primeira parte do script)'; end if;
  if v_henrique is null  then raise exception 'pessoa Henrique não encontrada'; end if;
  if v_fernando is null  then raise exception 'pessoa Fernando não encontrada'; end if;
  if v_joao is null      then raise exception 'pessoa João não encontrada';     end if;

  -- ============== AURORA (5) ==============
  insert into tasks (titulo, descricao, cliente_id, projeto_id, pessoa_id, prioridade, esforco, complexidade, prazo, subetapa) values
    ('Aurora: Conector Salesforce/ Ou verificar outra solução para google forms', '', v_aurora, v_p_aurora, v_karen, 'P2', 0, 'baixa', '2026-05-29'::date, 'em_desenvolvimento'),
    ('Ajustes de Leads', 'verificando o que precisa ser feito para detalhar melhor, tem alguns docs q elas enviaram e algumas conversas feitas, juntar tudo isso e começar a construção ou ajuste do que precisa', v_aurora, v_p_aurora, v_karen, 'P2', 0, 'alta', '2026-05-29'::date, 'em_definicao'),
    ('Ajustes em Vendas', 'verificando o que precisa ser feito para detalhar melhor, tem alguns docs q elas enviaram e algumas conversas feitas, juntar tudo isso e começar a construção ou ajuste do que precisa', v_aurora, v_p_aurora, v_karen, 'P2', 0, 'alta', '2026-05-29'::date, 'em_definicao'),
    ('Aurora: Subida e testes em Produção', '', v_aurora, v_p_aurora, v_karen, 'P2', 0, 'alta', '2026-05-27'::date, 'backlog'),
    ('Aurora: Levantamento de objetos e campos', '', v_aurora, v_p_aurora, v_karen, 'P2', 0, 'baixa', '2026-05-06'::date, 'concluido');

  -- ============== BODYTECH (55) ==============
  insert into tasks (titulo, descricao, cliente_id, projeto_id, pessoa_id, prioridade, esforco, complexidade, prazo, subetapa, criado_em) values
    ('[BT] E-mail - Base de Clientes a vencer - Bolsistas - Disparos template', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'backlog', '2026-04-02'::timestamptz),
    ('[SAC] Ajuste de horário Thais - Erro no horário do SAC', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2026-03-30'::timestamptz),
    ('[MKT] Jornadas com Prospects EVO', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2026-03-24'::timestamptz),
    ('[SAC] Mensagem para cliente caso atendente/Unidade esteja Offline', E'Como unidade/atendente quero que o sistema envie uma mensagem automática avisando que talvez o atendimento demore - caso a unidade a qual estou transferindo ele esteja indisponível - para que meu cliente não crie uma expectativa de atendimento rápido."\nDescrição\nHenrique comentou que isso é possível, mas é necessário atualizar o fluxo para LWC', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[SAC] - Segurança - Dados compartilhaveis entre unidades', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[SAC] - Dados de matrícula(EVO/Site/Franquias)', E'"A gente conversou um pouco sobre a questão da Thais puxar informações sobre valores e se as unidades têm ou não taxa de matrícula. \n\nPodemos seguir com as infos que estão hoje no site BCC sim. A Cynthia geralmente recebe essas informações e atualiza no site.\n\nExistem algumas questões que envolvem essa info de matrícula que temos que considerar:\n\n- Em uma mesma unidade, teremos planos e periodicidades com ou sem taxa de matrícula no site.\n\n- Existem unidades que trabalham algumas condições especiais no balcão, e a própria equipe em geral da unidade tem uma certa autonomia para não cobrar matrícula em algumas situações.\n\nSendo assim, acho que valeria a gente programar a Thais para que sempre reforce que essas são as condições do nosso site.\n\nPor exemplo: O valor da taxa de matrícula para o plano Student na unidade Bodytech Norte Shopping é de R$ XXX,00.\nEssas são as condições disponíveis em nosso site oficial.\n\nSe tiverem alguma questão ou precisem de mais alguma info do nosso lado, é só falar!\n" email da Isa', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[SAC] - Exceções ao optout para templates ativos', E'Padrão\nDCC\nCancelamento de aula', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-30'::timestamptz),
    ('[BOT] Ser Capaz de Opt Out', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-10-30'::timestamptz),
    ('[SAC] BT Transbordo SAC - Pós Encerramento', E'"Oi, Karen, tudo bem?\n\nHoje, em alguns casos, forçamos o fechamento do atendimento com uma mensagem sinalizando ao cliente que está muito tempo sem responder. Após essa mensagem, nossa equipe espera alguns minutos e fecha.\n\nA questão é que muitos clientes acabam voltando um tempo depois. Nesses casos, a gente conseguiria criar uma regra que estipule - todo cliente que tiver um caso fechado há menos de 2 horas, ele volte para fila? Ao invés de cair no fluxo da Thais? Não sei se é possível.\n\nBjs, Isa"', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[BOT] BT Pass', 'Rever Bot para que quando questionado sobre BT Pass seja feita validação da unidade para saber se ela disponibiliza o serviço.', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[SAC] Licenças Regionais', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[MKT] Integração com site para captura de Leads e jornada', E'Lançamento até março/26\n\nwebtolead, e entrar na jornada ao receber o lead\nplano A, converteu de lead pra contato\nplano B, sai da jornada por tempo\nplano C, optout da jornada no canal\nplano D, SAC pode converter / tirar da jornada\n\nmais pra frente: jornada carrinho abandonado', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-12-16'::timestamptz),
    ('[SAC] WP   - Usuario de Opted Out', '', v_bodytech, v_p_bt, v_felipe, 'P2', 0, 'media', null, 'backlog', '2026-03-02'::timestamptz),
    ('[SAC] Email Bodytech - Retorno lista de atividades na unidade', 'Ajustar quando tiver natação colocar a frase "(Lembrando que o acesso às aulas pode ter variações conforme o plano escolhido. Por exemplo, natação e nado livre são exclusivas dos planos + natação)', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'backlog', '2026-01-16'::timestamptz),
    ('[MKT] Jornada Inativos', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[MKT] Jornada DCC', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[MKT] Email dinamico para MC', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[MKT] Transbordo direto de jornada para unidade', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[MKT] Integração EVO para push em MC', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[MKT] Jornada Carrinho abandonado', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[SAC] App mobile para atendimento', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('ARCHIVE - Estruturar processo', E'Definição:\nEmail_Marketing_Enviado__c 15 dias\nTemplateWhatsAppEnviado 15 dias\nAcessoAcademia__c 60 dias', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[SAC] App whatsapp Ativo', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[SAC] Envio de mensagem automatica  - Aceitar caso', E'Como atendente, quero que o sistema envie a primeira mensagem para o cliente ao aceitar o caso para o tempo de primeira resposta não seja tão grande (às vezes esqueço de fazer o envio da mensagem ao aceitar o caso) e o cliente saiba que estou com ele no atendimento."\n\nÉ possível o envio de uma mensagem automática quando o SAC aceita uma conversa/caso?\nDemanda da Isabela\n\n*@Henrique Barbosa atribui você como proprietário dessa conversa pois a Isa já comentou contigo sobre isso lá no grupo com o time do SAC e formalizou essa demanda comigo na minha última reunião com ela no dia 20/06', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[SAC] Mensagem padrão Thais - Transbordo horario Off do SAC', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[SAC] Melhorias identificadas em Conversas', E'1 — *495431 — Unidade Maria Angélica / Jd Botânico Problema: a unidade consta jiu-jitsu na grade, mas a Thaís respondeu que não há jiu-jitsu.\nSolicitação: ajustar a base/fluxo para que o bot confirme corretamente a existência da aula de jiu-jitsu na grade da unidade\n* Pilates Circuit — Unidade Shopping Rio Poty (prever palavra "pilates")\nSolicitação: na lista inicial de prioridades/atividades para a Unidade Shopping Rio Poty, posicionar Pilates Circuit como segunda opção.\nAlém disso, garantir que o bot reconheça a palavra-chave "pilates" e direcione corretamente para esse item.\n\n2 — 510109 — Informação sobre personal\nProblema: cliente solicitou informações sobre personal e o bot informou que "não tinha".\nSolicitação: quando o usuário mencionar a palavra personal, o bot deve responder com o texto padronizado abaixo (substituir qualquer resposta atual que negue a existência do serviço):\n\nO personal é um profissional contratado à parte, fora do plano da academia. A coordenação da unidade pode indicar nomes de profissionais que atuam por lá, se você quiser.\nO personal precisa ativar um contrato com a Bodytech, então o ideal é que ele vá até a academia pra conversar com o coordenador responsável.\nOs repasses (valores pagos à Bodytech pelo personal) variam de unidade para unidade.\n\n3 — 515435 — Planos família\nProblema: a Thaís respondeu de forma ambígua sobre planos família.\nSolicitação: padronizar resposta para:\n\nA BT não tem planos coletivos/família, apenas individuais. Mas temos opções para vários perfis e diferentes tipos de contratação 🙂\n\n(usar esse texto para intents relacionadas a "plano família", "planos coletivos", etc.)\n\n4 — 498985 — Envio indevido de informações de login ao falar de valores/planos\nProblema: quando a cliente tentou falar de valores/planos, o bot enviou informações de login — experiência ruim (nota zero). Parece ocorrer quando o usuário não segue exatamente o fluxo.\nSolicitação: revisar o fluxo de conversação para impedir o envio automático de instruções de login quando a intenção do usuário for apenas consultar valores/planos. Sugestão operacional: só disparar mensagens de login/recuperação de conta após confirmação explícita do usuário (ex.: "Quero acessar minha conta" / intenção de login), e manter separada a rota de consulta a preços/planos.\n\nas solicitações da Isa para a Thaís. Ela quer que a primeira seja prioridade', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[MKT] Comunicação interna e RH no MCE', E'Data cloud?\nConexão com o Protheus\nE eventualmente base EVO de personal externo', v_bodytech, v_p_bt, v_felipe, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('Time BT atualizando Base', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('Time BT classificando interações', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('Sugestão Unidades - Notificação tipo Chrome', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('Experiencia OnePage SAC/Unidade', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'backlog', '2025-07-29'::timestamptz),
    ('[SAC] Nova arquitetura para Grounding Agentforce', '', v_bodytech, v_p_bt, v_elder, 'P2', 0, 'media', null, 'backlog', '2026-02-02'::timestamptz),
    ('[SAC] Whatsapp - Pedidos de parar promoções', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'priorizado', '2026-04-19'::timestamptz),
    ('[SAC] CSAT atendente e unidade', E'nota: CSAT priorizando whats com os 4 atores, depois email\n(se bot transborda, além do cliente, o atendente humano poder avaliar a Thaís; sinalizar nominal quem estaria sendo analisado?)\nnota: agentforce, monitorar qualidade e principalmente consumo\na: trazer itens de suporte ITSM', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'priorizado', '2025-10-01'::timestamptz),
    ('[MKT] Integração com GA4', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'priorizado', '2026-03-31'::timestamptz),
    ('[MKT] Jornada para prospects Jd Botanico', '', v_bodytech, v_p_bt, v_felipe, 'P2', 0, 'media', null, 'priorizado', '2026-03-31'::timestamptz),
    ('[SAC] Templates ativo', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'priorizado', '2026-03-03'::timestamptz),
    ('[TI] Responder em Massa para todos os casos pendurados em 1 incidente', E'notificacao de email resolvido, para os solicitantes por email\nfechar um incidente atualiza os status dos casos relacionados\ntrigger da notificacao ao encerrar o caso', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'priorizado', '2026-04-06'::timestamptz),
    ('[SAC] Observação para proteger juridicamente Agentforce', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'priorizado', '2026-04-10'::timestamptz),
    ('[SAC] Melhorias atendimento SAC', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'em_desenvolvimento', '2026-03-09'::timestamptz),
    ('[MKT] Relatorio dos impactados campanha Jd Botanico', '', v_bodytech, v_p_bt, v_felipe, 'P2', 0, 'media', null, 'em_desenvolvimento', '2026-04-11'::timestamptz),
    ('[MKT] Tombamento de jornadas base nova', E'1- Kids\n2- Fitness\n3- Fitness franquia\n4- Wellhub\n5- Student Plan', v_bodytech, v_p_bt, v_felipe, 'P2', 0, 'media', null, 'em_desenvolvimento', '2025-07-29'::timestamptz),
    ('[TI] Processo SAC escalar casos para TI', '', v_bodytech, v_p_bt, v_elder, 'P2', 0, 'media', null, 'em_desenvolvimento', '2026-03-31'::timestamptz),
    ('[TI] Criação de Marcos Suporte EVO', '', v_bodytech, v_p_bt, v_elder, 'P2', 0, 'media', null, 'em_desenvolvimento', '2026-03-31'::timestamptz),
    ('[SAC] Link de Matricula enviado pela Thais', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'em_desenvolvimento', '2026-05-04'::timestamptz),
    ('[SAC] Verificar demais criações Franquias', E'*entregar o formula de maio\n*padronizar', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'em_desenvolvimento', '2026-05-04'::timestamptz),
    ('[BT] Demandas novo portal', '', v_bodytech, v_p_bt, null, 'P2', 0, 'media', null, 'em_desenvolvimento', '2026-05-04'::timestamptz),
    ('[SAC] Novo site  - Formulario de contato', '', v_bodytech, v_p_bt, v_elder, 'P2', 0, 'media', null, 'em_homologacao', '2025-12-01'::timestamptz),
    ('[SAC] Sugestão de melhoria de filtro de planos', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'em_homologacao', '2026-02-23'::timestamptz),
    ('[SAC] Férias Ana Beatriz - mudança fila', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'em_homologacao', '2026-05-04'::timestamptz),
    ('[TI] Unidade teste na estrutura API', '', v_bodytech, v_p_bt, v_felipe, 'P2', 0, 'media', null, 'em_homologacao', '2026-04-27'::timestamptz),
    ('[MKT] Consultar direto view VW_GYMPASS_FORMULA', '', v_bodytech, v_p_bt, v_felipe, 'P2', 0, 'media', null, 'em_homologacao', '2026-03-17'::timestamptz),
    ('[SAC] CSAT Thais no relatorio  - com comentarios', '', v_bodytech, v_p_bt, v_karen, 'P2', 0, 'media', null, 'em_homologacao', '2026-06-04'::timestamptz),
    ('[MKT] BU BTFIT', '', v_bodytech, v_p_bt, v_edu, 'P2', 0, 'media', null, 'em_revisao', '2025-10-29'::timestamptz),
    ('[MKT] Jornada client', E'agendamento client\njornada ao agendar\njornada se faltar\noutros:\nrealizou agenda\nfaltou na agenda\nperíodo sem agendar\nalterar / cancelar agenda', v_bodytech, v_p_bt, v_felipe, 'P2', 0, 'media', null, 'em_revisao', '2025-09-29'::timestamptz);

  -- ============== CTF (14 — incluindo as 6 dups do CSV) ==============
  insert into tasks (titulo, descricao, cliente_id, projeto_id, pessoa_id, prioridade, esforco, complexidade, prazo, subetapa, criado_em) values
    ('PRJTASK0217324 - Inclusão do produto Antecipação de CTE', 'Inclusão de novo produto Antecipação (de pagamento), nessária criação de campos, objetos, adequação do processo de análise de crédito já que esse produto passará por um aval do time de gestão de crédito', v_ctf, v_p_ctf, v_henrique, 'P0', 40, 'media', null, 'em_desenvolvimento', '2026-04-24'::timestamptz),
    ('REQ0801628 Automatizar envio Proposta', 'Gerar e enviar proposta comercial a partir do Salesforce - criar campos para que todos os parâmetros da proposta sejam inseridos no Salesforce para cada produto, elaborar tela para cada disponibilizar apenas os campos pertinentes conforme campos específicos de cada', v_ctf, v_p_ctf, v_henrique, 'P1', 10, 'alta', null, 'pronto_producao', '2026-03-01'::timestamptz),
    ('PRJTASK0215832 - Inclusão do produto Cartão Fuel Mastercard no Salesforce', 'Inclusão do produto Cartão Fuel Mastercard, em princípio seguirá a mesma configuração do Cartão Sem Parar CTF + QR Code', v_ctf, v_p_ctf, v_henrique, 'P3', 5, 'baixa', null, 'backlog', '2026-04-24'::timestamptz),
    ('PRJTASK0217326 - Salesforce Fuel CTF - CNPJ Alfanumérico - Adequação da Jornada', 'Permitir a inclusão de CNPJ alfanumérico, precisa revisar todas todas as regras de validação de campos CNPJ em lead, conta, Postos e em qualquer outro objeto. Revisar classes apex para verificar se precisa alterar (em geral todas que limpam o CNPJ utilizando replaceAll([^0-9])', v_ctf, v_p_ctf, v_henrique, 'P3', 20, 'media', '2025-06-01'::date, 'backlog', '2026-04-09'::timestamptz),
    ('Analisar impacto sobre a atualização da forma de autenticação do Office 365 e SF', E'Microsoft vai mudar a integração com Salesforce a partir de Agosto/2026, precisa verificar impacto e se huver solicitar abertura de chamado junto ao time que cuida do Exchange\n\nMicrosoft is retiring Exchange Web Services (EWS) for Microsoft Office 365. To avoid service disruption, upgrade your Microsoft connection by August 3, 2026.', v_ctf, v_p_ctf, v_henrique, 'P1', 8, 'baixa', null, 'backlog', '2025-07-15'::timestamptz),
    ('REQ0813461/RITM0892310 - Atualização cadastral - SalesForce', 'Atualizar campo em usuário Filial de Venda', v_ctf, v_p_ctf, v_henrique, 'P2', 1, 'baixa', '2026-05-07'::date, 'em_desenvolvimento', '2025-04-29'::timestamptz),
    ('REQ0811950/RITM0890291 - Regra de obrigação de converter um lead em oportunidade', 'Obrigar a converter lead em oportunidade', v_ctf, v_p_ctf, null, 'P2', 0, 'baixa', null, 'backlog', '2026-04-24'::timestamptz),
    ('REQ0811935/RITM0890274 - Integração SalesForce x Docusign', 'Gerar contrato no Docusign a partir do Salesforce', v_ctf, v_p_ctf, null, 'P2', 0, 'alta', null, 'backlog', '2026-04-24'::timestamptz),
    -- duplicatas do bloco CSV (mantidas conforme decisão do usuário)
    ('PRJTASK0217324 - Inclusão do produto Antecipação de CTE', 'Inclusão de novo produto Antecipação (de pagamento), nessária criação de campos, objetos, adequação do processo de análise de crédito já que esse produto passará por um aval do time de gestão de crédito', v_ctf, v_p_ctf, v_henrique, 'P0', 40, 'media', null, 'em_desenvolvimento', '2026-04-24'::timestamptz),
    ('REQ0801628 Automatizar envio Proposta', 'Gerar e enviar proposta comercial a partir do Salesforce - criar campos para que todos os parâmetros da proposta sejam inseridos no Salesforce para cada produto, elaborar tela para cada disponibilizar apenas os campos pertinentes conforme campos específicos de cada', v_ctf, v_p_ctf, v_henrique, 'P1', 10, 'alta', null, 'pronto_producao', '2026-03-01'::timestamptz),
    ('PRJTASK0215832 - Inclusão do produto Cartão Fuel Mastercard no Salesforce', 'Inclusão do produto Cartão Fuel Mastercard, em princípio seguirá a mesma configuração do Cartão Sem Parar CTF + QR Code', v_ctf, v_p_ctf, v_henrique, 'P3', 5, 'baixa', null, 'backlog', '2026-04-24'::timestamptz),
    ('PRJTASK0217326 - Salesforce Fuel CTF - CNPJ Alfanumérico - Adequação da Jornada', 'Permitir a inclusão de CNPJ alfanumérico, precisa revisar todas todas as regras de validação de campos CNPJ em lead, conta, Postos e em qualquer outro objeto. Revisar classes apex para verificar se precisa alterar (em geral todas que limpam o CNPJ utilizando replaceAll([^0-9])', v_ctf, v_p_ctf, v_henrique, 'P3', 20, 'media', '2025-06-01'::date, 'backlog', '2026-04-09'::timestamptz),
    ('Analisar impacto sobre a atualização da forma de autenticação do Office 365 e SF', E'Microsoft vai mudar a integração com Salesforce a partir de Agosto/2026, precisa verificar impacto e se huver solicitar abertura de chamado junto ao time que cuida do Exchange\n\nMicrosoft is retiring Exchange Web Services (EWS) for Microsoft Office 365. To avoid service disruption, upgrade your Microsoft connection by August 3, 2026.', v_ctf, v_p_ctf, v_henrique, 'P1', 8, 'baixa', null, 'backlog', '2025-07-15'::timestamptz),
    ('REQ0813461/RITM0892310 - Atualização cadastral - SalesForce', 'Atualizar campo em usuário Filial de Venda', v_ctf, v_p_ctf, v_henrique, 'P2', 1, 'baixa', '2026-05-07'::date, 'em_desenvolvimento', '2025-04-29'::timestamptz);

  -- ============== INDIGO (3) ==============
  insert into tasks (titulo, descricao, cliente_id, projeto_id, pessoa_id, prioridade, esforco, complexidade, prazo, subetapa, criado_em) values
    ('Projeto Sales Cloud', 'Projeto fim-a-fim, migração RD Station para salesforce. Import de dados, disposição layout, automação de conversão de lead, automação solicitação e envio de proposta por e-mail.', v_indigo, v_p_indigo, v_felipe, 'P1', 25, 'media', '2026-05-07'::date, 'pronto_producao', '2026-04-10'::timestamptz),
    ('Revisão dos Flows de Lead e Solicitação de Proposta', '', v_indigo, v_p_indigo, v_fernando, 'P1', 8, 'media', '2026-05-06'::date, 'concluido', '2026-05-05'::timestamptz),
    ('Indigo: Go Live', '', v_indigo, v_p_indigo, v_joao, 'P2', 8, 'media', null, 'pronto_producao', '2026-05-07'::timestamptz);

  -- ============== MULTIMAIS (1) ==============
  insert into tasks (titulo, descricao, cliente_id, projeto_id, pessoa_id, prioridade, esforco, complexidade, prazo, subetapa) values
    ('Detalhar escopo integração vindi', '', v_multimais, v_p_multimais, null, 'P2', 0, 'media', null, 'backlog');

  -- ============== PÃO E TALHO (10) ==============
  insert into tasks (titulo, descricao, cliente_id, projeto_id, pessoa_id, prioridade, esforco, complexidade, prazo, subetapa) values
    ('Alerta de erro legível em flows', '', v_pao, v_p_pao, v_fernando, 'P2', 6, 'media', '2026-05-05'::date, 'em_desenvolvimento'),
    ('Ajustes da última subida, todo dia tem várias coisas para ajustar. Estou adicionando no Asana na tarefa Perfis e Papéis, pois é de lá ainda.', '', v_pao, v_p_pao, v_drieli, 'P2', 0, 'media', null, 'em_desenvolvimento'),
    ('Planilha para ajuste de carteiras', 'Aguardando cliente pq estou esperando a devolutiva, eles precisam me devolver uma planilha para atualização no salesforce de contas.', v_pao, v_p_pao, v_drieli, 'P2', 0, 'media', null, 'em_desenvolvimento'),
    ('Automatizações em endereços, bairros, cálculo de km e frete', '', v_pao, v_p_pao, v_drieli, 'P2', 0, 'alta', null, 'backlog'),
    ('Redefinição de casos na folga dos analistas/executivos', '', v_pao, v_p_pao, v_drieli, 'P2', 0, 'baixa', null, 'backlog'),
    ('List viwer para status de caso', '', v_pao, v_p_pao, v_drieli, 'P2', 0, 'baixa', null, 'backlog'),
    ('Relatórios de gestão operacional e executiva', '', v_pao, v_p_pao, v_drieli, 'P2', 0, 'media', null, 'backlog'),
    ('URGENTE Revisar flow omni de distribuicao de casos', '', v_pao, v_p_pao, v_felipe, 'P2', 0, 'media', null, 'backlog'),
    ('Melhoria calcular tempo a partir da hora de saída para evento via API', '', v_pao, v_p_pao, v_joao, 'P2', 0, 'media', null, 'backlog'),
    ('Omni versão 3', '', v_pao, v_p_pao, v_henrique, 'P2', 0, 'alta', null, 'backlog');

  -- ============== TOTALPASS (7) ==============
  insert into tasks (titulo, descricao, cliente_id, projeto_id, pessoa_id, prioridade, esforco, complexidade, prazo, subetapa) values
    ('Documentação guia rapido de configuração para novo template', '', v_totalpass, v_p_totalpass, null, 'P2', 0, 'media', null, 'backlog'),
    ('Documentação guia rapido de configuração para novo usuario', '', v_totalpass, v_p_totalpass, null, 'P2', 0, 'media', null, 'backlog'),
    ('Documentação guia rapido de configuração para whatsapp', '', v_totalpass, v_p_totalpass, null, 'P2', 0, 'media', null, 'backlog'),
    ('Detalhar escopo 1 - Whatsapp para relacionamento: dimencionamento de tarefas e esforço do projeto', '', v_totalpass, v_p_totalpass, null, 'P2', 0, 'media', null, 'backlog'),
    ('Detalhar escopo 2 - Salesforce para gestão de casos e-mail e boot portal: dimencionamento de tarefas e esforço do projeto', '', v_totalpass, v_p_totalpass, null, 'P2', 0, 'media', null, 'backlog'),
    ('Detalhar escopo whatasapp para academias', '', v_totalpass, v_p_totalpass, null, 'P2', 0, 'media', null, 'backlog'),
    ('Detalhar escopo agentforce SDR', '', v_totalpass, v_p_totalpass, null, 'P2', 0, 'media', null, 'backlog');

  -- ============== VB (3) ==============
  insert into tasks (titulo, descricao, cliente_id, projeto_id, pessoa_id, prioridade, esforco, complexidade, prazo, subetapa, criado_em) values
    ('Integração BeeDoo', 'Disposição de tela no layout de conta (Seção lateral) com autenticação SSO para treinamento interno do time. Integração por embed, com popup. O trabalho técnico ficou para o time Beedoo, da nossa parte só dispor o caminho e o laypout.', v_vb, v_p_vb, null, 'P3', 10, 'baixa', null, 'pronto_producao', '2026-02-02'::timestamptz),
    ('Integração SIG', 'Automatizar o ciclo de vida de documentos (contratos, termos ou ordens de serviço) originados no SIG, utilizando o Salesforce para orquestrar o envio e a coleta de assinaturas através da API do DocuSign', v_vb, v_p_vb, v_henrique, 'P2', 5, 'media', null, 'pronto_producao', '2026-03-30'::timestamptz),
    ('Integração Motor Crédito', 'Garantia de integração com o Motor de crédito antes que o cliente seja enviado ao SIG, atendendo as novas regras de PLD.', v_vb, v_p_vb, v_joao, 'P1', 3, 'media', '2026-06-01'::date, 'pronto_producao', '2026-04-29'::timestamptz);

  raise notice 'import concluído: 98 tasks inseridas (5 Aurora + 55 Bodytech + 14 CTF + 3 Indigo + 1 Multimais + 10 Pão e Talho + 7 TotalPass + 3 VB)';
end $$;

commit;
