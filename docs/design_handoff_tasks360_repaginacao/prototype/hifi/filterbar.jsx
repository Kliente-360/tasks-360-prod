/* tasks 360 hi-fi — FilterBar único + PageHeader + PillsFilter + ⋯ MoreMenu */
const { useState: useStateF, useEffect: useEffectF, useRef: useRefF } = React;

/* opções derivadas dos dados */
const OPT_CLIENTE = () => CLIENTES.map((c) => ({ v: c.nome, label: c.nome }));
const OPT_PROJETO = () => PROJETOS.map((p) => ({ v: p.nome, label: p.nome }));
const OPT_RESP = () => PESSOAS.map((p) => ({ v: p.nome, label: p.nome.split(' ')[0] }));
const OPT_PRAZO = () => ([
  { v: 'atrasadas', label: 'Atrasadas' },
  { v: 'hoje', label: 'Hoje' },
  { v: 'semana', label: 'Esta semana' },
  { v: 'sem', label: 'Sem prazo' },
]);

const EMPTY_FILTERS = { q: '', cliente: '', projeto: '', resp: '', prazo: '' };

/* predicado compartilhado — busca em TODOS os campos */
function matchFilters(t, f) {
  if (f.q) {
    const q = f.q.toLowerCase();
    const hay = [t.titulo, t.cliente, t.projeto, t.resp, (t.tags || []).join(' ')].join(' ').toLowerCase();
    if (!hay.includes(q)) return false;
  }
  if (f.cliente && t.cliente !== f.cliente) return false;
  if (f.projeto && t.projeto !== f.projeto) return false;
  if (f.resp && t.resp !== f.resp) return false;
  if (f.prazo === 'atrasadas' && !t.prazo.late) return false;
  if (f.prazo === 'hoje' && t.prazo.label !== 'hoje' && !t.prazo.late) return false;
  if (f.prazo === 'sem' && t.prazo.label !== '—') return false;
  if (f.prazo === 'semana' && t.prazo.label === '—') return false;
  return true;
}
function countActive(f) {
  return ['cliente', 'projeto', 'resp', 'prazo'].filter((k) => f[k]).length + (f.q ? 1 : 0);
}

/* hook click-outside */
function useClickAway(onAway) {
  const ref = useRefF(null);
  useEffectF(() => {
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) onAway(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onAway]);
  return ref;
}

/* select de filtro com popover real */
function FilterSelect({ icon, label, value, options, onChange }) {
  const [open, setOpen] = useStateF(false);
  const ref = useClickAway(() => setOpen(false));
  const cur = options.find((o) => o.v === value);
  return (
    <span className="fs-wrap" ref={ref}>
      <button className={'fselect' + (value ? ' on' : '')} onClick={() => setOpen((o) => !o)}>
        {icon && <Icon name={icon} />}
        {value ? cur.label : label}
        <Icon name="chevron-down" />
      </button>
      {open && (
        <div className="fmenu">
          <button className={!value ? 'sel' : ''} onClick={() => { onChange(''); setOpen(false); }}>
            Todos {!value && <Icon name="check" size={14} />}
          </button>
          <div className="fmenu-div" />
          {options.map((o) => (
            <button key={o.v} className={value === o.v ? 'sel' : ''} onClick={() => { onChange(o.v); setOpen(false); }}>
              {o.label} {value === o.v && <Icon name="check" size={14} />}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/* ⋯ menu — itens podem ser toggle/action e vir desabilitados por contexto */
function MoreMenu({ items }) {
  const [open, setOpen] = useStateF(false);
  const ref = useClickAway(() => setOpen(false));
  return (
    <span className="fs-wrap" ref={ref}>
      <button className="iconbtn bordered" onClick={() => setOpen((o) => !o)} title="Mais opções" aria-label="Mais opções"><Icon name="more" /></button>
      {open && (
        <div className="fmenu more">
          {items.map((it, i) => it.divider ? <div key={i} className="fmenu-div" /> : (
            <button
              key={it.key}
              className={'more-item' + (it.active ? ' active' : '') + (it.enabled === false ? ' disabled' : '')}
              disabled={it.enabled === false}
              onClick={() => { if (it.enabled !== false) { it.onClick && it.onClick(); if (it.kind !== 'toggle') setOpen(false); } }}
            >
              {it.kind === 'toggle' && <span className={'mini-toggle' + (it.active ? ' on' : '')} />}
              {it.icon && it.kind !== 'toggle' && <Icon name={it.icon} size={15} />}
              <span className="grow">{it.label}</span>
              {it.hint && <span className="more-hint">{it.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </span>
  );
}

/* a barra: busca + filtros configuráveis + limpar + ⋯ */
function FilterBar({ show = ['cliente', 'projeto', 'resp', 'prazo'], f, set, onClear, moreItems }) {
  const active = countActive(f);
  return (
    <div className="filterbar inline">
      <Search width={208} value={f.q} onChange={(v) => set('q', v)} placeholder="Buscar em tudo…" />
      {show.includes('cliente') && <FilterSelect icon="building" label="Cliente" value={f.cliente} options={OPT_CLIENTE()} onChange={(v) => set('cliente', v)} />}
      {show.includes('projeto') && <FilterSelect icon="folder" label="Projeto" value={f.projeto} options={OPT_PROJETO()} onChange={(v) => set('projeto', v)} />}
      {show.includes('resp') && <FilterSelect icon="users" label="Responsável" value={f.resp} options={OPT_RESP()} onChange={(v) => set('resp', v)} />}
      {show.includes('prazo') && <FilterSelect icon="calendar" label="Prazo" value={f.prazo} options={OPT_PRAZO()} onChange={(v) => set('prazo', v)} />}
      {active > 0 && (
        <button className="fselect clear" onClick={onClear}><Icon name="x" />Limpar ({active})</button>
      )}
      {moreItems && <MoreMenu items={moreItems} />}
    </div>
  );
}

/* pills (Foco / Triagem) */
function PillsFilter({ options, value, onChange, multi }) {
  return (
    <div className="pills">
      {options.map((o) => {
        const on = multi ? value.includes(o.v) : value === o.v;
        return (
          <button key={o.v} className={'pill-f' + (on ? ' on' : '')} onClick={() => onChange(o.v)}>
            {o.icon && <Icon name={o.icon} size={13} />}{o.label}
            {o.count != null && <span className="pf-count">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

/* header interno — uma linha: [título+contexto + aside] ........ [controles] */
function PageHeader({ title, context, titleAside, right }) {
  return (
    <div className="pageheader">
      <div className="ph-left">
        <div className="ph-titles">
          <h1>{title}</h1>
          {context && <div className="narr">{context}</div>}
        </div>
        {titleAside}
      </div>
      {right && <div className="ph-right">{right}</div>}
    </div>
  );
}

/* hook de filtros local por tela */
function useFilters() {
  const [f, setF] = useStateF(EMPTY_FILTERS);
  const set = (k, v) => setF((cur) => ({ ...cur, [k]: v }));
  const clear = () => setF(EMPTY_FILTERS);
  return { f, set, clear };
}

Object.assign(window, { FilterBar, FilterSelect, MoreMenu, PillsFilter, PageHeader, useFilters, matchFilters, countActive, EMPTY_FILTERS });
