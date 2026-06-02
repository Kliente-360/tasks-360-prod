/* tasks 360 hi-fi — app root */
const { useState: useStateA, useEffect: useEffectA } = React;

function Cronometro() {
  const [running, setRunning] = useStateA(false);
  const [secs, setSecs] = useStateA(8048); // 02:14:08 (demo)
  useEffectA(() => {
    if (!running) return;
    const id = setInterval(() => setSecs((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [running]);
  const fmt = (s) => [Math.floor(s / 3600), Math.floor(s / 60) % 60, s % 60].map((n) => String(n).padStart(2, '0')).join(':');
  return (
    <button className={'timer-btn' + (running ? ' running' : '')} onClick={() => setRunning((r) => !r)} title={running ? 'Parar cronômetro' : 'Iniciar cronômetro'}>
      <Icon name={running ? 'square' : 'play'} />
      {fmt(secs)}
    </button>
  );
}

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'backlog', label: 'Backlog', icon: 'list' },
  { id: 'kanban', label: 'Kanban', icon: 'columns' },
  { id: 'foco', label: 'Foco', icon: 'target' },
  { id: 'triagem', label: 'Triagem', icon: 'inbox' },
  { id: 'calendario', label: 'Calendário', icon: 'calendar' },
  { id: 'briefing', label: 'Briefing', icon: 'file' },
  { id: 'timesheet', label: 'Timesheet', icon: 'timer' },
  { id: 'portal', label: 'Portal', icon: 'building' },
  { id: 'cadastros', label: 'Cadastros', icon: 'sliders' },
];

const TAB_IDS = ['dashboard', 'backlog', 'kanban', 'foco', 'triagem', 'calendario', 'briefing', 'timesheet', 'portal', 'cadastros'];
function initialTab() {
  const h = (location.hash || '').slice(1);
  return TAB_IDS.includes(h) ? h : 'dashboard';
}
function App() {
  const [tab, setTabState] = useStateA(initialTab);
  const setTab = (id) => { setTabState(id); try { history.replaceState(null, '', '#' + id); } catch (e) {} };
  const [task, setTask] = useStateA(() => (location.hash === '#modal' ? TASKS[0] : null));
  const [newCliente, setNewCliente] = useStateA(() => location.hash === '#novocliente');
  const onOpenTask = (t) => setTask(t);

  const screens = {
    dashboard: <Dashboard onOpenTask={onOpenTask} />,
    backlog: <Backlog onOpenTask={onOpenTask} />,
    kanban: <Kanban onOpenTask={onOpenTask} />,
    foco: <Foco onOpenTask={onOpenTask} />,
    triagem: <Triagem onOpenTask={onOpenTask} />,
    calendario: <Calendario />,
    briefing: <Briefing />,
    timesheet: <Timesheet />,
    portal: <Portal onOpenTask={onOpenTask} />,
    cadastros: <Cadastros onNew={() => setNewCliente(true)} />,
  };

  return (
    <div className="app">
      <header className="hdr">
        <div className="hdr-top">
          <div className="hdr-brand">
            <Mark size={24} />
            <b>tasks 360</b>
          </div>
          <span className="hdr-spacer" />
          <div className="hdr-actions">
            <Cronometro />
            <span className="hdr-sep" />
            <IconBtn name="download" title="Exportar" />
            <IconBtn name="help" title="Ajuda" />
            <IconBtn name="sun" title="Tema" />
            <span className="hdr-sep" />
            <Btn sm kind="primary" icon="plus" onClick={() => onOpenTask(TASKS[0])}>Tarefa</Btn>
            <IconBtn name="bell" title="Notificações" badge />
            <span className="av green" title="Você">MA</span>
          </div>
        </div>
        <nav className="hdr-tabs">
          {NAV.map((n) => (
            <button key={n.id} className={'tab' + (tab === n.id ? ' active' : '')} onClick={() => setTab(n.id)}>
              <Icon name={n.icon} size={15} />{n.label}
            </button>
          ))}
        </nav>
      </header>

      {screens[tab]}

      {task && <TaskModal task={task} onClose={() => setTask(null)} />}
      {newCliente && <ClienteModal onClose={() => setNewCliente(false)} />}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
