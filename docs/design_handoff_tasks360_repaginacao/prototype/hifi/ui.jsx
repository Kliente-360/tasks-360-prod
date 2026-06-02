/* tasks 360 hi-fi — UI primitivos compartilhados */
const { useState } = React;

function Mark({ size = 24 }) {
  return (
    <span className={'mark sz-' + size} aria-hidden="true">
      <span/><span/><span/><span/>
    </span>
  );
}

function Btn({ kind = '', sm, icon, iconRight, children, onClick, title }) {
  const cls = ['btn', kind && 'btn-' + kind, sm && 'btn-sm'].filter(Boolean).join(' ');
  return (
    <button className={cls} onClick={onClick} title={title}>
      {icon && <Icon name={icon} />}
      {children}
      {iconRight && <Icon name={iconRight} />}
    </button>
  );
}

function IconBtn({ name, onClick, title, bordered, badge }) {
  return (
    <button className={'iconbtn' + (bordered ? ' bordered' : '')} onClick={onClick} title={title} aria-label={title}>
      <Icon name={name} />
      {badge && <span className="dot-badge" />}
    </button>
  );
}

function Seg({ options, value, onChange }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={o.v} className={value === o.v ? 'on' : ''} onClick={() => onChange(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

function Search({ placeholder = 'Buscar…', value, onChange, width }) {
  return (
    <label className="search" style={width ? { width, minWidth: 0 } : undefined}>
      <Icon name="search" />
      <input value={value || ''} placeholder={placeholder} onChange={(e) => onChange && onChange(e.target.value)} />
    </label>
  );
}

/* select de filtro — quando `value` tem valor, fica verde (ativo) */
function FSelect({ label, value, options, onChange }) {
  const on = !!value;
  const cur = options.find((o) => o.v === value);
  return (
    <span className={'fselect' + (on ? ' on' : '')} onClick={(e) => {
      // ciclo simples de demonstração: avança pra próxima opção
      const idx = options.findIndex((o) => o.v === value);
      const next = options[(idx + 1) % options.length];
      onChange && onChange(next.v);
    }}>
      {on ? (cur ? cur.label : label) : label}
      <Icon name="chevron-down" />
    </span>
  );
}

function Pri({ p }) { return <span className={'pri ' + p}><span className="d" />{p}</span>; }

function StatusChip({ s }) {
  const labels = { andamento: 'andamento', bloqueado: 'bloqueado', concluido: 'concluído', backlog: 'backlog' };
  return <span className="status" data-s={s}><span className="d" />{labels[s] || s}</span>;
}

function Avatar({ name, green, sm }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return <span className={'av' + (green ? ' green' : '') + (sm ? ' sm' : '')}>{initials}</span>;
}

function Kpi({ label, value, suffix, delta, deltaUp, danger }) {
  return (
    <div className={'kpi' + (danger ? ' danger' : '')}>
      <div className="lab">{label}</div>
      <div className="val">{value}{suffix && <span style={{ fontSize: 13, color: 'var(--fg-muted)', fontWeight: 600 }}>{suffix}</span>}</div>
      <div className={'delta' + (deltaUp ? ' up' : '')}>{delta || '\u00A0'}</div>
    </div>
  );
}

/* cabeçalho de coluna ordenável */
function SortTh({ label, k, sort, onSort, right }) {
  const active = sort && sort.k === k;
  const cls = ['sortable', active && 'sorted', right && 'right'].filter(Boolean).join(' ');
  const icon = !active ? 'sort' : sort.dir === 'asc' ? 'arrow-up' : 'arrow-down';
  return (
    <th className={cls} onClick={() => onSort && onSort(k)}>
      <span className="th-in">{label}<Icon name={icon} /></span>
    </th>
  );
}

function Checkbox({ on, onClick }) {
  return (
    <span className={'cbx' + (on ? ' on' : '')} onClick={(e) => { e.stopPropagation(); onClick && onClick(); }}>
      {on && <Icon name="check" size={11} />}
    </span>
  );
}

/* page-bar padrão A: título + narrativa | ações */
function PageBar({ title, narrative, actions }) {
  return (
    <div className="pagebar">
      <div>
        <h1>{title}</h1>
        {narrative && <div className="narr">{narrative}</div>}
      </div>
      {actions && <div className="pagebar-actions">{actions}</div>}
    </div>
  );
}

Object.assign(window, { Mark, Btn, IconBtn, Seg, Search, FSelect, Pri, StatusChip, Avatar, Kpi, SortTh, Checkbox, PageBar });
