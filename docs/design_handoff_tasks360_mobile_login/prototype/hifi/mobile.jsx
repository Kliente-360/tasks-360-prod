/* tasks 360 hi-fi MOBILE — shell + 5 telas + sheets */
const { useState: useStateM } = React;

const M_TABS = [
  { id: 'briefing', label: 'Briefing', icon: 'file' },
  { id: 'foco', label: 'Foco', icon: 'target' },
  { id: 'backlog', label: 'Backlog', icon: 'list' },
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'portal', label: 'Portal', icon: 'building' },
];

const ME = 'Marina Alves';

/* ───────────── card de tarefa (padrão mobile) ───────────── */
function TaskCard({ t, onOpen }) {
  return (
    <div className="tcard" onClick={() => onOpen(t)}>
      <div className="top">
        <div style={{ minWidth: 0 }}>
          <div className="ttl">{t.titulo}</div>
          <div className="sub">{t.cliente}{t.projeto ? ' · ' + t.projeto : ''}</div>
        </div>
        <Pri p={t.pri} />
      </div>
      <div className="meta">
        <Avatar name={t.resp} sm />
        <span className="fs12 muted">{t.resp.split(' ')[0]}</span>
        <span className="sp" />
        {t.ai && <span className="tag-ai"><Icon name="refresh" size={9} />IA</span>}
        {t.prazo.late
          ? <span className="late">{t.prazo.label}</span>
          : <span className="mono fs12 muted">{t.prazo.label}</span>}
      </div>
    </div>
  );
}

/* ───────────── FOCO ───────────── */
function MFoco({ onOpen }) {
  const [seg, setSeg] = useStateM('minhas');
  const [done, setDone] = useStateM([]);
  const mine = TASKS.filter((t) => t.resp === ME && t.status !== 'concluido');
  const list = seg === 'atrasadas' ? mine.filter((t) => t.prazo.late)
    : seg === 'hoje' ? mine.filter((t) => t.prazo.label === 'hoje' || t.prazo.late)
    : mine;
  const toggle = (id) => setDone((d) => d.includes(id) ? d.filter((x) => x !== id) : [...d, id]);
  const segs = [
    { v: 'minhas', label: 'Minhas', ct: mine.length },
    { v: 'atrasadas', label: 'Atrasadas', ct: mine.filter((t) => t.prazo.late).length },
    { v: 'hoje', label: 'Hoje', ct: mine.filter((t) => t.prazo.label === 'hoje' || t.prazo.late).length },
  ];
  return (
    <div className="m-scroll">
      <div className="m-pagetitle">
        <h1>Foco de <em>hoje</em></h1>
        <div className="narr"><b>{list.length}</b> tarefas <span className="sep">·</span> <b>{list.reduce((a, t) => a + t.h, 0)}h</b> previstas</div>
      </div>
      <div className="m-pills">
        {segs.map((s) => (
          <button key={s.v} className={'m-pill' + (seg === s.v ? ' on' : '')} onClick={() => setSeg(s.v)}>
            {s.label}<span className="ct">{s.ct}</span>
          </button>
        ))}
      </div>
      <div className="m-list">
        {list.map((t) => (
          <div key={t.id} className={'tcard check' + (done.includes(t.id) ? ' done' : '')}>
            <Checkbox on={done.includes(t.id)} onClick={() => toggle(t.id)} />
            <div className="body" onClick={() => onOpen(t)}>
              <div className="ttl">{t.titulo}</div>
              <div className="sub">{t.cliente}{t.projeto ? ' · ' + t.projeto : ''}</div>
            </div>
            <div className="col" style={{ alignItems: 'flex-end', gap: 7 }}>
              <Pri p={t.pri} />
              <span className="chip mono" style={{ padding: '1px 7px' }}>{t.h}h</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ───────────── BACKLOG ───────────── */
function MBacklog({ onOpen, filters, setFilters, openFilters }) {
  const [q, setQ] = useStateM('');
  let list = TASKS.filter((t) => t.status !== 'concluido');
  if (q) list = list.filter((t) => [t.titulo, t.cliente, t.projeto, t.resp, (t.tags || []).join(' ')].join(' ').toLowerCase().includes(q.toLowerCase()));
  if (filters.cliente) list = list.filter((t) => t.cliente === filters.cliente);
  if (filters.resp) list = list.filter((t) => t.resp === filters.resp);
  if (filters.pri) list = list.filter((t) => t.pri === filters.pri);
  if (filters.prazo === 'atrasadas') list = list.filter((t) => t.prazo.late);
  const nActive = ['cliente', 'resp', 'pri', 'prazo'].filter((k) => filters[k]).length;
  return (
    <div className="m-scroll">
      <div className="m-pagetitle">
        <h1>Backlog</h1>
        <div className="narr"><b>{list.length}</b> abertas <span className="sep">·</span> <b>{list.filter((t) => t.prazo.late).length}</b> atrasadas <span className="sep">·</span> <b>{list.reduce((a, t) => a + t.h, 0)}h</b></div>
      </div>
      <div className="m-filterbar">
        <label className="m-search"><Icon name="search" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar tudo…" /></label>
        <button className={'m-fbtn' + (nActive ? ' on' : '')} onClick={openFilters}>
          <Icon name="filter" size={16} />
          {nActive > 0 && <span className="badge">{nActive}</span>}
        </button>
      </div>
      {nActive > 0 && (
        <div className="m-pills" style={{ marginBottom: 12 }}>
          {filters.cliente && <button className="m-pill on" onClick={() => setFilters({ ...filters, cliente: '' })}>{filters.cliente}<Icon name="x" size={12} /></button>}
          {filters.resp && <button className="m-pill on" onClick={() => setFilters({ ...filters, resp: '' })}>{filters.resp.split(' ')[0]}<Icon name="x" size={12} /></button>}
          {filters.pri && <button className="m-pill on" onClick={() => setFilters({ ...filters, pri: '' })}>{filters.pri}<Icon name="x" size={12} /></button>}
          {filters.prazo && <button className="m-pill on" onClick={() => setFilters({ ...filters, prazo: '' })}>Atrasadas<Icon name="x" size={12} /></button>}
        </div>
      )}
      <div className="m-list">
        {list.map((t) => <TaskCard key={t.id} t={t} onOpen={onOpen} />)}
      </div>
    </div>
  );
}

/* ───────────── DASHBOARD ───────────── */
function MDashboard({ onOpen }) {
  const abertas = TASKS.filter((t) => t.status !== 'concluido');
  const andamento = abertas.filter((t) => t.status === 'andamento').length;
  const atrasadas = abertas.filter((t) => t.prazo.late).length;
  const bloq = abertas.filter((t) => t.status === 'bloqueado').length;
  const maxT = Math.max(...THROUGHPUT);
  return (
    <div className="m-scroll">
      <div className="m-pagetitle">
        <h1>Visão geral</h1>
        <div className="narr"><b>{abertas.length}</b> ativas <span className="sep">·</span> throughput <b>9,2</b>/sem</div>
      </div>
      <div className="m-kpis">
        <Kpi label="Em andamento" value={andamento} delta="▲ 6 essa sem." deltaUp />
        <Kpi label="Backlog" value={abertas.filter((t) => t.status === 'backlog').length} delta="estável" />
        <Kpi label="Bloqueadas" value={bloq} delta="2 clientes" />
        <Kpi label="Atrasadas" value={atrasadas} delta="ação" danger />
      </div>
      <div className="m-sec mt14">
        <div className="h"><div><h3>Throughput</h3><div className="sub">concluídas / semana · 12 sem</div></div><Icon name="trend" className="ic-lg muted" /></div>
        <div className="body">
          <div className="bars">
            {THROUGHPUT.map((v, i) => (
              <div key={i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div className={'bar' + (i === THROUGHPUT.length - 1 ? ' now' : '')} style={{ height: (v / maxT) * 100 + '%' }} />
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="m-sec mt14">
        <div className="h"><h3>Carga por pessoa</h3></div>
        <div className="body" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {CARGA.map((c) => (
            <div key={c.nome} className="loadrow">
              <Avatar name={c.nome} sm />
              <div className="track"><div className={'fill' + (c.pct > 85 ? ' over' : '')} style={{ width: c.pct + '%' }} /></div>
              <span className="pct">{c.pct}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="m-sec mt14">
        <div className="h"><div><h3>Precisa de atenção</h3><div className="sub">priorize hoje</div></div></div>
        <div className="m-list" style={{ padding: 12, gap: 9 }}>
          {abertas.filter((t) => t.prazo.late || t.pri === 'P0').slice(0, 3).map((t) => <TaskCard key={t.id} t={t} onOpen={onOpen} />)}
        </div>
      </div>
    </div>
  );
}

/* ───────────── BRIEFING (digest operacional) ───────────── */
function MBriefing({ onOpen }) {
  const criticos = [
    { at: '6 pessoas acima da capacidade esta semana', ad: 'Edu 1240% · Henrique 680% · Felipe 325% · +3' },
    { at: '5 sustentações estourando contrato em alguma semana', ad: 'Sustentação · 180% · Sustentação · 365% · Sustentação · 661%' },
    { at: '8 tarefas atrasadas em clientes estratégicos', ad: 'Bodytech: 3 · Kliente 360: 4 · CTF: 1' },
    { at: '13 tarefas para triagem', ad: '11 sem prazo · 2 sem esforço' },
  ];
  const atencao = [
    { at: '1 pessoa acima da capacidade próxima semana', ad: 'Felipe 115%' },
    { at: '2 projetos em risco de estourar escopo (90–110%)', ad: 'Sales Cloud 101% · Sales Cloud 100%' },
  ];
  const clientes = [
    { nm: 'TotalPass', tag: 'potencial', sinal: 'var(--danger)', lt: '1 task atrasada', act: 'Conversar hoje sobre prazo' },
    { nm: 'Bodytech', tag: 'estratégico', sinal: 'var(--danger)', lt: '3 tasks atrasadas', act: 'Revisar plano da semana' },
    { nm: 'Globex', tag: 'ativo', sinal: 'var(--warn)', lt: '1 sustentação em risco', act: 'Alinhar escopo' },
  ];
  return (
    <div className="m-scroll">
      <div className="m-pagetitle">
        <h1>Briefing</h1>
        <div className="narr">resumo operacional <span className="sep">·</span> <b>quinta, 12 jun</b></div>
      </div>

      <div className="m-sec">
        <div className="b-seehead">
          <div className="t">
            <h3>Alertas</h3>
            <span className="b-counts">
              <span className="b-count crit">4 críticos</span>
              <span className="b-count att">6 atenção</span>
            </span>
          </div>
          <span className="b-link">ver todos (10)</span>
        </div>
        <div className="b-alerts">
          {criticos.map((a, i) => (
            <div key={'c' + i} className="b-alert crit"><span className="dot" /><div><div className="at">{a.at}</div><div className="ad">{a.ad}</div></div></div>
          ))}
          {atencao.map((a, i) => (
            <div key={'a' + i} className="b-alert att"><span className="dot" /><div><div className="at">{a.at}</div><div className="ad">{a.ad}</div></div></div>
          ))}
        </div>
      </div>

      <div className="m-sec mt14">
        <div className="b-seehead">
          <div className="t"><h3>Clientes em atenção</h3></div>
          <span className="muted fs12 mono">7 clientes</span>
        </div>
        <div>
          {clientes.map((c) => (
            <div key={c.nm} className="b-cli">
              <div className="top">
                <span className="sd" style={{ background: c.sinal }} />
                <span className="nm">{c.nm}</span>
                <span className="chip" style={{ padding: '2px 8px' }}>{c.tag}</span>
              </div>
              <div className="lt">{c.lt}</div>
              <span className="act"><span style={{ fontSize: 14 }}>→</span>{c.act}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────────── PORTAL ───────────── */
function MPortal({ onOpen }) {
  const cliente = 'Acme Corp';
  const tasks = TASKS.filter((t) => t.cliente === cliente && t.status !== 'concluido');
  return (
    <div className="m-scroll">
      <div className="portal-head" style={{ padding: '18px 18px' }}>
        <div className="m-eyebrow" style={{ color: 'rgba(255,255,255,.55)' }}>Portal do cliente</div>
        <h1 style={{ fontSize: 22, fontWeight: 600, marginTop: 6 }}>{cliente}</h1>
        <div style={{ fontSize: 12.5, color: 'rgba(255,255,255,.72)', marginTop: 4 }}>{tasks.length} ativas · 2 aguardando você</div>
      </div>
      <div className="m-kpis mt14">
        <Kpi label="Ativas" value={tasks.length} delta="em execução" />
        <Kpi label="Entregues" value={34} delta="▲ 5 no mês" deltaUp />
        <Kpi label="Aguardando você" value={2} delta="responda" danger />
        <Kpi label="Horas no mês" value={48} suffix="h" delta="de 60h" />
      </div>
      <div className="alert warn mt14">
        <span className="ai"><Icon name="alert" /></span>
        <div><div className="at">2 tarefas aguardando aprovação</div><div className="as">Descontos e follow-up precisam do seu OK.</div></div>
      </div>
      <div className="m-sec mt14">
        <div className="h"><h3>Tarefas do projeto</h3><span className="chip mono">{tasks.length} ativas</span></div>
        <div className="m-list" style={{ padding: 12, gap: 9 }}>
          {tasks.map((t) => <TaskCard key={t.id} t={t} onOpen={onOpen} />)}
        </div>
      </div>
    </div>
  );
}

/* ───────────── PROFILE SHEET ───────────── */
function ProfileSheet({ onClose }) {
  const rows = [
    { ic: 'sun', t: 'Tema', s: 'Claro · automático', val: 'Claro' },
    { ic: 'file', t: 'Manual da ferramenta', s: 'Guia de uso e boas práticas' },
    { ic: 'help', t: 'Onboarding', s: 'Refazer o tour inicial' },
  ];
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <div className="prof-card">
          <span className="pa">MA</span>
          <div><div className="pn">Marina Alves</div><div className="pr">Sócia · Kliente 360</div></div>
        </div>
        <div className="m-group">
          {rows.map((r) => (
            <button key={r.t} className="m-row" onClick={onClose}>
              <span className="ric"><Icon name={r.ic} /></span>
              <div className="rbody"><div className="rt">{r.t}</div><div className="rs">{r.s}</div></div>
              {r.val ? <span className="val">{r.val}</span> : <Icon name="chevron-right" className="chev" size={16} />}
            </button>
          ))}
        </div>
        <button className="btn mt14" style={{ width: '100%', justifyContent: 'center', color: 'var(--danger)', borderColor: 'transparent' }} onClick={onClose}>Sair</button>
      </div>
    </div>
  );
}

/* ───────────── FILTER SHEET (backlog) ───────────── */
function FilterSheet({ filters, setFilters, onClose }) {
  const [f, setF] = useStateM(filters);
  const cycle = (key, opts) => () => { const i = opts.indexOf(f[key]); setF({ ...f, [key]: opts[(i + 1) % opts.length] }); };
  const clientes = ['', ...CLIENTES.map((c) => c.nome)];
  const resps = ['', ...PESSOAS.map((p) => p.nome)];
  const pris = ['', 'P0', 'P1', 'P2', 'P3'];
  const prazos = ['', 'atrasadas'];
  const label = (v, none) => v ? (v === 'atrasadas' ? 'Atrasadas' : v) : none;
  return (
    <div className="sheet-bg" onClick={onClose}>
      <div className="sheet" onClick={(e) => e.stopPropagation()}>
        <div className="grab" />
        <h2>Filtros</h2>
        <div className="sh-sub">aplicam à lista do backlog</div>
        <div className="m-group">
          <button className="m-row" onClick={cycle('cliente', clientes)}><span className="ric"><Icon name="building" /></span><div className="rbody"><div className="rt">Cliente</div></div><span className="val">{label(f.cliente, 'Todos')}</span></button>
          <button className="m-row" onClick={cycle('resp', resps)}><span className="ric"><Icon name="users" /></span><div className="rbody"><div className="rt">Responsável</div></div><span className="val">{f.resp ? f.resp.split(' ')[0] : 'Todos'}</span></button>
          <button className="m-row" onClick={cycle('pri', pris)}><span className="ric"><Icon name="alert" /></span><div className="rbody"><div className="rt">Prioridade</div></div><span className="val">{label(f.pri, 'Todas')}</span></button>
          <button className="m-row" onClick={cycle('prazo', prazos)}><span className="ric"><Icon name="calendar" /></span><div className="rbody"><div className="rt">Prazo</div></div><span className="val">{label(f.prazo, 'Qualquer')}</span></button>
        </div>
        <div className="filter-actions">
          <button className="btn" onClick={() => { setFilters({ cliente: '', resp: '', pri: '', prazo: '' }); onClose(); }}>Limpar</button>
          <button className="btn btn-primary" onClick={() => { setFilters(f); onClose(); }}>Aplicar</button>
        </div>
      </div>
    </div>
  );
}

/* ───────────── TASK DETAIL (full screen) ───────────── */
function MTaskDetail({ task, onClose }) {
  return (
    <div className="detail-bg">
      <div className="detail-head">
        <div style={{ minWidth: 0 }}>
          <div className="crumb">{task.cliente}<span className="sep">/</span>{task.projeto || '—'}</div>
          <h2>{task.titulo}</h2>
          <div className="save"><span className="d" />salvo · agora há pouco</div>
        </div>
        <button className="x" onClick={onClose}><Icon name="x" /></button>
      </div>
      <div className="detail-body">
        <div className="dsec">
          <div className="t">Descrição</div>
          <p className="soft" style={{ fontSize: 14, lineHeight: 1.6 }}>Implementar o fluxo no Salesforce com regras de aprovação por alçada. Validar com o time comercial antes de publicar em produção.</p>
        </div>
        <div className="dsec">
          <div className="t">Detalhes</div>
          <div className="dfield"><span className="l">Responsável</span><div className="v"><Avatar name={task.resp} sm /><span style={{ marginLeft: 8 }}>{task.resp}</span></div></div>
          <div style={{ display: 'flex', gap: 10 }}>
            <div className="dfield" style={{ flex: 1 }}><span className="l">Prazo</span><div className="v mono">{task.prazo.label}</div></div>
            <div className="dfield" style={{ flex: 1 }}><span className="l">Esforço</span><div className="v mono">{task.h}h</div></div>
          </div>
          <div className="dfield"><span className="l">Prioridade / Status</span><div className="v" style={{ gap: 8 }}><Pri p={task.pri} /><StatusChip s={task.status} /></div></div>
        </div>
        <div className="dsec">
          <div className="t">Checklist</div>
          <div className="dline done"><Checkbox on onClick={() => {}} /><span>Mapear alçadas de aprovação</span></div>
          <div className="dline"><Checkbox onClick={() => {}} /><span>Configurar regras no Flow Builder</span></div>
          <div className="dline"><Checkbox onClick={() => {}} /><span>Testar em sandbox</span></div>
        </div>
        <div className="dsec">
          <div className="t">Comentários · 2</div>
          <div className="dmsg"><div className="mh"><Avatar name="Marina Alves" green sm /><span className="who">Marina</span><span className="when">há 2h</span></div><div className="bd">Validei as alçadas com o comercial. Acima de 20% precisa de aprovação do diretor.</div></div>
          <div className="dmsg cliente"><div className="mh"><Avatar name="Cliente Acme" sm /><span className="who">Cliente · Acme</span><span className="when">ontem</span></div><div className="bd">Confirmado, podem seguir com essa regra.</div></div>
        </div>
      </div>
      <div className="detail-foot">
        <button className="btn" onClick={onClose}>Fechar</button>
        <button className="btn btn-primary"><Icon name="check2" />Salvar</button>
      </div>
    </div>
  );
}

/* ───────────── SHELL ───────────── */
function MobileApp() {
  const H = (typeof location !== 'undefined' ? location.hash.slice(1) : '');
  const TABS = ['briefing', 'foco', 'backlog', 'dashboard', 'portal'];
  const [tab, setTab] = useStateM(TABS.includes(H) ? H : (H === 'filtros' ? 'backlog' : 'foco'));
  const [task, setTask] = useStateM(H === 'detail' ? TASKS[0] : null);
  const [profile, setProfile] = useStateM(H === 'profile');
  const [filterSheet, setFilterSheet] = useStateM(H === 'filtros');
  const [filters, setFilters] = useStateM({ cliente: '', resp: '', pri: '', prazo: '' });

  const screens = {
    foco: <MFoco onOpen={setTask} />,
    backlog: <MBacklog onOpen={setTask} filters={filters} setFilters={setFilters} openFilters={() => setFilterSheet(true)} />,
    dashboard: <MDashboard onOpen={setTask} />,
    briefing: <MBriefing />,
    portal: <MPortal onOpen={setTask} />,
  };

  return (
    <div className="m-app">
      <header className="m-header">
        <div className="brand"><Mark size={24} /><b>tasks 360</b></div>
        <span className="sp" />
        <button className="iconbtn" title="Notificações" style={{ position: 'relative' }}><Icon name="bell" /><span className="dot-badge" /></button>
        <button className="m-prof" title="Perfil" onClick={() => setProfile(true)}>MA</button>
      </header>

      <main className="m-main">{screens[tab]}</main>

      <nav className="m-tabbar">
        {M_TABS.map((t) => (
          <button key={t.id} className={'m-tab' + (tab === t.id ? ' on' : '')} onClick={() => setTab(t.id)}>
            <Icon name={t.icon} /><span>{t.label}</span>
          </button>
        ))}
      </nav>

      {profile && <ProfileSheet onClose={() => setProfile(false)} />}
      {filterSheet && <FilterSheet filters={filters} setFilters={setFilters} onClose={() => setFilterSheet(false)} />}
      {task && <MTaskDetail task={task} onClose={() => setTask(null)} />}
    </div>
  );
}

Object.assign(window, { MobileApp });
