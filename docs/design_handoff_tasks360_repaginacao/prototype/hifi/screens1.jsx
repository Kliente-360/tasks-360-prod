/* tasks 360 hi-fi — telas 1: Dashboard · Backlog · Kanban (FilterBar único) */
const { useState: useState1, useMemo } = React;

// itens do ⋯ padrão; cada tela liga/desliga conforme contexto
function buildMore({ group, onGroup, arch, onArch, ia, onIa, onExport, can }) {
  can = can || {};
  return [
    { key: 'group', kind: 'action', icon: 'columns', label: 'Agrupar' + (group ? ': ' + (group === 'cliente' ? 'Cliente' : 'Responsável') : ''), enabled: can.group !== false, onClick: onGroup, hint: group ? '✓' : '' },
    { key: 'arch', kind: 'toggle', label: 'Mostrar arquivadas', enabled: can.arch !== false, active: arch, onClick: onArch },
    { key: 'ia', kind: 'toggle', label: 'Somente criadas por IA', enabled: can.ia !== false, active: ia, onClick: onIa },
    { divider: true },
    { key: 'export', kind: 'action', icon: 'download', label: 'Exportar CSV', enabled: can.export !== false, onClick: onExport },
  ];
}

// ─────────────────────────── DASHBOARD ───────────────────────────
function Dashboard({ onOpenTask }) {
  const { f, set, clear } = useFilters();
  const [ia, setIa] = useState1(false);
  const base = TASKS.filter((t) => t.status !== 'concluido' && (!ia || t.ai));
  const scoped = base.filter((t) => matchFilters(t, f)); // cards afetados por filtro
  const andamento = scoped.filter((t) => t.status === 'andamento').length;
  const backlog = scoped.filter((t) => t.status === 'backlog').length;
  const atrasadas = scoped.filter((t) => t.prazo.late).length;
  const bloqueadas = scoped.filter((t) => t.status === 'bloqueado').length;
  const maxT = Math.max(...THROUGHPUT);

  const more = buildMore({ ia, onIa: () => setIa((v) => !v), onExport: () => {}, can: { group: false, arch: false } });

  return (
    <div className="page">
      <PageHeader
        title="Visão geral"
        context={<><b>{scoped.length}</b> tarefas no recorte <span className="sep">·</span> throughput <b>9,2</b>/sem <span className="sep">·</span> <b>{atrasadas}</b> atrasadas</>}
        right={<FilterBar f={f} set={set} onClear={clear} moreItems={more} />}
      />

      <div className="kpi-grid grid4">
        <Kpi label="Em andamento" value={andamento} delta="▲ 6 essa semana" deltaUp />
        <Kpi label="Backlog" value={backlog} delta="no recorte" />
        <Kpi label="Bloqueadas" value={bloqueadas} delta={bloqueadas ? 'precisa destravar' : 'ok'} />
        <Kpi label="Atrasadas" value={atrasadas} delta="precisa ação" danger />
      </div>

      <div className="mt16" style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 14 }}>
        <div className="section-card">
          <div className="section-head"><div><h3>Throughput</h3><div className="sub">concluídas por semana · 12 semanas</div></div><span className="tag-global" title="Visão histórica — não afetada pelos filtros">não filtrado</span></div>
          <div style={{ padding: 18 }}>
            <div className="bars">
              {THROUGHPUT.map((v, i) => (
                <div key={i} style={{ display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <div className={'bar' + (i === THROUGHPUT.length - 1 ? ' now' : '')} style={{ height: (v / maxT) * 100 + '%' }} />
                  <div className="barlabel">{i === THROUGHPUT.length - 1 ? 'agora' : 's' + (i + 1)}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="section-card">
          <div className="section-head"><h3>Carga por pessoa</h3><span className="tag-global" title="Visão da equipe — não afetada pelos filtros">não filtrado</span></div>
          <div style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 13 }}>
            {CARGA.map((c) => (
              <div key={c.nome} className="loadrow">
                <Avatar name={c.nome} sm />
                <div className="track"><div className={'fill' + (c.pct > 85 ? ' over' : '')} style={{ width: c.pct + '%' }} /></div>
                <span className="pct">{c.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="mt16 section-card">
        <div className="section-head"><div><h3>Precisa de atenção</h3><div className="sub">prioridade alta ou atrasada, no recorte atual</div></div><Btn sm kind="ghost" iconRight="chevron-right">Ver backlog</Btn></div>
        <table className="tbl">
          <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 130 }} /><col style={{ width: 70 }} /><col style={{ width: 100 }} /></colgroup>
          <tbody>
            {scoped.filter((t) => t.prazo.late || t.pri === 'P0').slice(0, 5).map((t) => (
              <tr key={t.id} onClick={() => onOpenTask(t)}>
                <td><div className="t-title"><span>{t.titulo}</span></div></td>
                <td><span className="t-sub">{t.cliente}{t.projeto ? ' · ' + t.projeto : ''}</span></td>
                <td><div className="cell-resp"><Avatar name={t.resp} sm /><span>{t.resp.split(' ')[0]}</span></div></td>
                <td><Pri p={t.pri} /></td>
                <td>{t.prazo.late ? <span className="late">{t.prazo.label}</span> : <span className="mono fs12 muted">{t.prazo.label}</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────── BACKLOG ───────────────────────────
function Backlog({ onOpenTask }) {
  const { f, set, clear } = useFilters();
  const [group, setGroup] = useState1('');
  const [arch, setArch] = useState1(false);
  const [ia, setIa] = useState1(false);
  const [sort, setSort] = useState1({ k: 'pri', dir: 'asc' });
  const [sel, setSel] = useState1([]);

  const onSort = (k) => setSort((s) => s.k === k ? { k, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { k, dir: 'asc' });
  const cycleGroup = () => setGroup((g) => g === '' ? 'cliente' : g === 'cliente' ? 'resp' : '');

  const filtered = useMemo(() => {
    let arr = TASKS.filter((t) => (arch || t.status !== 'concluido') && (!ia || t.ai) && matchFilters(t, f));
    const priRank = { P0: 0, P1: 1, P2: 2, P3: 3 };
    arr = [...arr].sort((a, b) => {
      let av, bv;
      if (sort.k === 'pri') { av = priRank[a.pri]; bv = priRank[b.pri]; }
      else if (sort.k === 'h') { av = a.h; bv = b.h; }
      else { av = a[sort.k] ?? a.titulo; bv = b[sort.k] ?? b.titulo; if (sort.k === 'prazo') { av = a.prazo.label; bv = b.prazo.label; } }
      if (av < bv) return sort.dir === 'asc' ? -1 : 1;
      if (av > bv) return sort.dir === 'asc' ? 1 : -1;
      return 0;
    });
    return arr;
  }, [f, sort, arch, ia]);

  const totalH = filtered.reduce((a, t) => a + t.h, 0);
  const nAtras = filtered.filter((t) => t.prazo.late).length;
  const toggleSel = (id) => setSel((s) => s.includes(id) ? s.filter((x) => x !== id) : [...s, id]);

  const more = buildMore({
    group, onGroup: cycleGroup, arch, onArch: () => setArch((v) => !v),
    ia, onIa: () => setIa((v) => !v), onExport: () => {},
  });

  const Row = (t) => (
    <tr key={t.id} className={sel.includes(t.id) ? 'sel' : ''} onClick={() => onOpenTask(t)}>
      <td onClick={(e) => e.stopPropagation()}><Checkbox on={sel.includes(t.id)} onClick={() => toggleSel(t.id)} /></td>
      <td><div className="t-title">{t.ai && <span className="tag-ai" title="Criada por IA"><Icon name="refresh" size={9} />IA</span>}<span>{t.titulo}</span></div></td>
      <td><span className="t-sub">{t.cliente}{t.projeto ? ' · ' + t.projeto : ''}</span></td>
      <td><div className="cell-resp"><Avatar name={t.resp} sm /><span>{t.resp.split(' ')[0]}</span></div></td>
      <td><Pri p={t.pri} /></td>
      <td className="right mono fs12 muted">{t.h}</td>
      <td>{t.prazo.late ? <span className="late">{t.prazo.label}</span> : <span className="mono fs12 muted">{t.prazo.label}</span>}</td>
      <td><StatusChip s={t.status} /></td>
    </tr>
  );

  const groups = useMemo(() => {
    if (!group) return null;
    const key = group === 'cliente' ? 'cliente' : 'resp';
    const m = new Map();
    filtered.forEach((t) => { const g = t[key] || '—'; if (!m.has(g)) m.set(g, []); m.get(g).push(t); });
    return Array.from(m.entries());
  }, [filtered, group]);

  return (
    <div className="page">
      <PageHeader
        title="Backlog"
        context={<><b>{filtered.length}</b> abertas <span className="sep">·</span> <b>{nAtras}</b> atrasadas <span className="sep">·</span> <b>{totalH}h</b></>}
        right={<FilterBar f={f} set={set} onClear={clear} moreItems={more} />}
      />

      <div className="tbl-wrap">
        <table className="tbl">
          <colgroup><col style={{ width: 44 }} /><col /><col style={{ width: 168 }} /><col style={{ width: 132 }} /><col style={{ width: 64 }} /><col style={{ width: 48 }} /><col style={{ width: 92 }} /><col style={{ width: 124 }} /></colgroup>
          <thead>
            <tr>
              <th><Checkbox on={sel.length === filtered.length && filtered.length > 0} onClick={() => setSel(sel.length === filtered.length ? [] : filtered.map((t) => t.id))} /></th>
              <SortTh label="Tarefa" k="titulo" sort={sort} onSort={onSort} />
              <SortTh label="Cliente · Projeto" k="cliente" sort={sort} onSort={onSort} />
              <SortTh label="Responsável" k="resp" sort={sort} onSort={onSort} />
              <SortTh label="Pri" k="pri" sort={sort} onSort={onSort} />
              <SortTh label="h" k="h" sort={sort} onSort={onSort} right />
              <SortTh label="Prazo" k="prazo" sort={sort} onSort={onSort} />
              <th>Status</th>
            </tr>
          </thead>
          {!group && <tbody>{filtered.map(Row)}</tbody>}
          {group && groups.map(([g, items]) => (
            <tbody key={g}>
              <tr className="grp"><td colSpan={8}><div className="grp-in"><span className="grp-l"><Icon name="chevron-down" size={13} />{g}</span><span className="grp-m">{items.length} · {items.reduce((a, t) => a + t.h, 0)}h</span></div></td></tr>
              {items.map(Row)}
            </tbody>
          ))}
        </table>
      </div>
      {filtered.length === 0 && <div className="muted fs13" style={{ textAlign: 'center', padding: 40 }}>Nenhuma tarefa no recorte atual.</div>}

      {sel.length > 0 && (
        <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 50, background: 'var(--bg-dark)', color: '#fff', borderRadius: 'var(--r-pill)', padding: '9px 10px 9px 18px', display: 'flex', alignItems: 'center', gap: 14, boxShadow: 'var(--sh-lg)' }}>
          <span className="mono" style={{ fontSize: 12.5 }}>{sel.length} selecionada{sel.length > 1 ? 's' : ''}</span>
          <span style={{ width: 1, height: 20, background: 'rgba(255,255,255,.2)' }} />
          <button className="btn btn-sm" style={{ background: 'transparent', color: 'rgba(255,255,255,.9)', border: '1px solid rgba(255,255,255,.2)' }}>Atribuir</button>
          <button className="btn btn-sm" style={{ background: 'transparent', color: 'rgba(255,255,255,.9)', border: '1px solid rgba(255,255,255,.2)' }}>Prioridade</button>
          <button className="btn btn-sm" style={{ background: 'transparent', color: 'rgba(255,255,255,.9)', border: '1px solid rgba(255,255,255,.2)' }}>Prazo</button>
          <button className="iconbtn" style={{ color: 'rgba(255,255,255,.7)' }} onClick={() => setSel([])}><Icon name="x" /></button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── KANBAN ───────────────────────────
function Kanban({ onOpenTask }) {
  const { f, set, clear } = useFilters();
  const [view, setView] = useState1('macro');
  const [ia, setIa] = useState1(false);
  const [arch, setArch] = useState1(false);
  const cols = [
    { k: 'backlog', label: 'Backlog', cls: '' },
    { k: 'andamento', label: 'Em andamento', cls: 'andamento' },
    { k: 'bloqueado', label: 'Bloqueado', cls: 'bloqueado' },
    { k: 'concluido', label: 'Concluído', cls: 'concluido' },
  ];
  const visible = TASKS.filter((t) => (!ia || t.ai) && matchFilters(t, f));
  const more = buildMore({ arch, onArch: () => setArch((v) => !v), ia, onIa: () => setIa((v) => !v), onExport: () => {}, can: { group: false } });

  return (
    <div className="page">
      <PageHeader
        title="Kanban"
        context={<>{visible.filter((t) => t.status !== 'concluido').length} ativas no recorte</>}
        titleAside={<Seg options={[{ v: 'macro', label: 'Macro' }, { v: 'op', label: 'Operação' }]} value={view} onChange={setView} />}
        right={<FilterBar f={f} set={set} onClear={clear} moreItems={more} />}
      />
      <div className="kanban">
        {cols.map((col) => {
          const items = visible.filter((t) => t.status === col.k);
          return (
            <div key={col.k}>
              <div className="kcol-head">
                <span className={'eyebrow' + (col.k === 'andamento' ? ' active' : '')}>{col.label}</span>
                <span className="kc">{items.length}</span>
              </div>
              <div className={'kcol ' + col.cls}>
                {items.map((t) => (
                  <div key={t.id} className={'kcard' + (col.k === 'concluido' ? ' done' : '')} onClick={() => onOpenTask(t)}>
                    <div className="kt">{t.titulo}</div>
                    <div className="kc-sub">{t.cliente}{t.projeto ? ' · ' + t.projeto : ''}</div>
                    <div className="kmeta"><Pri p={t.pri} /><Avatar name={t.resp} sm /></div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

Object.assign(window, { Dashboard, Backlog, Kanban });
