/* tasks 360 hi-fi — telas 2: Cadastros · Portal · Foco · Triagem · Calendário · Briefing · Timesheet */
const { useState: useState2 } = React;

// ─────────────────────────── CADASTROS ───────────────────────────
function Cadastros({ onNew }) {
  const [tab, setTab] = useState2('clientes');
  return (
    <div className="page">
      <PageBar
        title="Cadastros"
        narrative={<><b>{CLIENTES.length}</b> clientes <span className="sep">·</span> <b>{PROJETOS.length}</b> projetos <span className="sep">·</span> <b>{PESSOAS.length}</b> pessoas</>}
        actions={<Btn sm kind="primary" icon="plus" onClick={onNew}>{tab === 'clientes' ? 'Cliente' : tab === 'projetos' ? 'Projeto' : 'Pessoa'}</Btn>}
      />
      <div className="subtabs">
        <button className={'subtab' + (tab === 'clientes' ? ' on' : '')} onClick={() => setTab('clientes')}><Icon name="building" />Clientes <span className="count">{CLIENTES.length}</span></button>
        <button className={'subtab' + (tab === 'projetos' ? ' on' : '')} onClick={() => setTab('projetos')}><Icon name="folder" />Projetos <span className="count">{PROJETOS.length}</span></button>
        <button className={'subtab' + (tab === 'pessoas' ? ' on' : '')} onClick={() => setTab('pessoas')}><Icon name="users" />Pessoas <span className="count">{PESSOAS.length}</span></button>
      </div>

      <div className="tbl-wrap">
        {tab === 'clientes' && (
          <table className="tbl">
            <colgroup><col /><col style={{ width: 110 }} /><col style={{ width: 110 }} /><col style={{ width: 90 }} /><col style={{ width: 56 }} /></colgroup>
            <thead><tr><th>Cliente</th><th>Projetos</th><th>Tarefas</th><th>Sinal</th><th></th></tr></thead>
            <tbody>
              {CLIENTES.map((c) => (
                <tr key={c.id}>
                  <td><div className="t-title"><Avatar name={c.nome} green /><span>{c.nome}</span></div></td>
                  <td className="mono fs12 muted">{c.projetos}</td>
                  <td className="mono fs12 muted">{c.tarefas}</td>
                  <td><span className="status"><span className="d" style={{ background: c.sinal === 'verde' ? 'var(--ok)' : c.sinal === 'amarelo' ? 'var(--warn)' : 'var(--danger)' }} />{c.sinal}</span></td>
                  <td onClick={(e) => e.stopPropagation()}><span className="iconbtn"><Icon name="more" /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'projetos' && (
          <table className="tbl">
            <colgroup><col /><col style={{ width: 160 }} /><col style={{ width: 100 }} /><col style={{ width: 56 }} /></colgroup>
            <thead><tr><th>Projeto</th><th>Cliente</th><th>Tarefas</th><th></th></tr></thead>
            <tbody>
              {PROJETOS.map((p) => (
                <tr key={p.id}>
                  <td><div className="t-title"><Icon name="folder" className="muted" /><span>{p.nome}</span></div></td>
                  <td className="t-sub">{p.cliente}</td>
                  <td className="mono fs12 muted">{p.tarefas}</td>
                  <td onClick={(e) => e.stopPropagation()}><span className="iconbtn"><Icon name="more" /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {tab === 'pessoas' && (
          <table className="tbl">
            <colgroup><col /><col style={{ width: 140 }} /><col style={{ width: 100 }} /><col style={{ width: 56 }} /></colgroup>
            <thead><tr><th>Pessoa</th><th>Papel</th><th>Tarefas</th><th></th></tr></thead>
            <tbody>
              {PESSOAS.map((p) => (
                <tr key={p.id}>
                  <td><div className="t-title"><Avatar name={p.nome} /><span>{p.nome}</span></div></td>
                  <td className="t-sub">{p.role === 'socio' ? 'Sócio' : 'Consultor'}</td>
                  <td className="mono fs12 muted">{TASKS.filter((t) => t.resp === p.nome).length}</td>
                  <td onClick={(e) => e.stopPropagation()}><span className="iconbtn"><Icon name="more" /></span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────── PORTAL ───────────────────────────
function Portal({ onOpenTask }) {
  const cliente = 'Acme Corp';
  const tasks = TASKS.filter((t) => t.cliente === cliente);
  const ativas = tasks.filter((t) => t.status !== 'concluido');
  return (
    <div className="page">
      <div className="portal-head">
        <span className="switch"><Icon name="building" size={13} />{cliente}<Icon name="chevron-down" size={13} /></span>
        <div className="eyebrow">Portal do cliente</div>
        <h1>{cliente}</h1>
        <div className="sub">{ativas.length} tarefas ativas · 2 aguardando sua resposta</div>
      </div>
      <div className="kpi-grid grid4 mt20">
        <Kpi label="Ativas" value={ativas.length} delta="em execução" />
        <Kpi label="Entregues" value={34} delta="▲ 5 este mês" deltaUp />
        <Kpi label="Aguardando você" value={2} delta="responda p/ avançar" danger />
        <Kpi label="Horas no mês" value={48} suffix="h" delta="de 60h previstas" />
      </div>
      <div className="mt16 grid2">
        <div className="alert warn"><span className="ai"><Icon name="alert" /></span><div><div className="at">2 tarefas aguardando sua aprovação</div><div className="as">Fluxo de descontos e automação de follow-up precisam do seu OK.</div></div></div>
        <div className="alert ok"><span className="ai"><Icon name="check2" /></span><div><div className="at">Workshop de descoberta concluído</div><div className="as">Resumo e próximos passos disponíveis no briefing.</div></div></div>
      </div>
      <div className="mt16 section-card">
        <div className="section-head"><h3>Tarefas do projeto</h3><span className="chip mono">{ativas.length} ativas</span></div>
        <table className="tbl">
          <colgroup><col /><col style={{ width: 150 }} /><col style={{ width: 120 }} /><col style={{ width: 124 }} /></colgroup>
          <tbody>
            {ativas.map((t) => (
              <tr key={t.id} onClick={() => onOpenTask(t)}>
                <td><div className="t-title"><span>{t.titulo}</span></div></td>
                <td><span className="t-sub">{t.projeto || '—'}</span></td>
                <td>{t.prazo.late ? <span className="late">{t.prazo.label}</span> : <span className="mono fs12 muted">{t.prazo.label}</span>}</td>
                <td><StatusChip s={t.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─────────────────────────── FOCO ───────────────────────────
function Foco({ onOpenTask }) {
  const [seg, setSeg] = useState2('minhas');
  const [done, setDone] = useState2([]);
  const mine = TASKS.filter((t) => t.resp === 'Marina Alves' && t.status !== 'concluido');
  const list = seg === 'atrasadas' ? mine.filter((t) => t.prazo.late) : seg === 'hoje' ? mine.filter((t) => t.prazo.label === 'hoje' || t.prazo.late) : mine;
  const toggle = (id) => setDone((d) => d.includes(id) ? d.filter((x) => x !== id) : [...d, id]);
  return (
    <div className="page">
      <PageHeader
        title="Foco de hoje"
        context={<><b>{list.length}</b> tarefas <span className="sep">·</span> <b>{list.reduce((a, t) => a + t.h, 0)}h</b> previstas</>}
        right={<PillsFilter
          value={seg} onChange={setSeg}
          options={[
            { v: 'minhas', label: 'Minhas', count: mine.length },
            { v: 'atrasadas', label: 'Atrasadas', count: mine.filter((t) => t.prazo.late).length },
            { v: 'hoje', label: 'Hoje', count: mine.filter((t) => t.prazo.label === 'hoje' || t.prazo.late).length },
          ]} />}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((t) => (
          <div key={t.id} className="card pad linked" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px' }} onClick={() => onOpenTask(t)}>
            <Checkbox on={done.includes(t.id)} onClick={() => toggle(t.id)} />
            <div className="grow">
              <div style={{ fontWeight: 500, textDecoration: done.includes(t.id) ? 'line-through' : 'none', color: done.includes(t.id) ? 'var(--fg-muted)' : 'var(--fg)' }}>{t.titulo}</div>
              <div className="t-sub mt4">{t.cliente}{t.projeto ? ' · ' + t.projeto : ''}</div>
            </div>
            <span className="chip mono">{t.h}h</span>
            <Pri p={t.pri} />
            {t.prazo.late && <span className="late">{t.prazo.label}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────── TRIAGEM ───────────────────────────
function Triagem({ onOpenTask }) {
  const [pill, setPill] = useState2('todos');
  const items = [
    { id: 'r1', kind: 'cliente', task: TASKS[0], txt: 'Cliente respondeu sobre o fluxo de aprovação', when: 'há 2h' },
    { id: 'r2', kind: 'ia', task: TASKS[4], txt: 'IA criou tarefa a partir de e-mail do cliente', when: 'há 5h' },
    { id: 'r3', kind: 'semresp', task: TASKS[5], txt: 'Tarefa sem responsável há 3 dias', when: 'há 3d' },
    { id: 'r4', kind: 'cliente', task: TASKS[8], txt: 'Novo comentário do cliente em automação', when: 'ontem' },
  ];
  const meta = {
    cliente: { ic: 'message', label: 'resposta do cliente' },
    ia: { ic: 'refresh', label: 'criada por IA' },
    semresp: { ic: 'alert', label: 'sem responsável' },
  };
  const list = pill === 'todos' ? items : items.filter((i) => i.kind === pill);
  return (
    <div className="page">
      <PageHeader
        title="Triagem"
        context={<><b>{list.length}</b> itens aguardando decisão</>}
        right={<PillsFilter
          value={pill} onChange={setPill}
          options={[
            { v: 'todos', label: 'Todos', count: items.length },
            { v: 'cliente', label: 'Cliente respondeu', count: items.filter((i) => i.kind === 'cliente').length },
            { v: 'ia', label: 'Criadas por IA', count: items.filter((i) => i.kind === 'ia').length },
            { v: 'semresp', label: 'Sem responsável', count: items.filter((i) => i.kind === 'semresp').length },
          ]} />}
      />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {list.map((it) => {
          const m = meta[it.kind];
          return (
            <div key={it.id} className="card pad linked" style={{ display: 'flex', alignItems: 'flex-start', gap: 13, padding: '14px 16px' }} onClick={() => onOpenTask(it.task)}>
              <span style={{ width: 34, height: 34, borderRadius: 10, flex: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: it.kind === 'semresp' ? 'var(--warn-soft)' : 'var(--green-soft)', color: it.kind === 'semresp' ? 'var(--warn)' : 'var(--green)' }}><Icon name={m.ic} /></span>
              <div className="grow">
                <div style={{ fontWeight: 500 }}>{it.txt}</div>
                <div className="t-sub mt4">{it.task.titulo} — {it.task.cliente}</div>
              </div>
              <div className="col" style={{ alignItems: 'flex-end', gap: 8 }}>
                <span className="mono fs12 muted" style={{ whiteSpace: 'nowrap' }}>{it.when}</span>
                <span className="chip mono" style={{ textTransform: 'lowercase' }}>{m.label}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── CALENDÁRIO ───────────────────────────
function Calendario() {
  const { f, set, clear } = useFilters();
  const days = Array.from({ length: 30 }, (_, i) => i + 1);
  const visible = TASKS.filter((t) => matchFilters(t, f));
  const byDay = {};
  visible.forEach((t) => {
    let d = null;
    const m = /^(\d+) jun$/.exec(t.prazo.label);
    if (t.prazo.label === 'hoje') d = 1;
    else if (m) d = +m[1];
    if (d) (byDay[d] = byDay[d] || []).push(t);
  });
  const more = buildMore({ onExport: () => {}, can: { group: false, arch: false } });

  return (
    <div className="page">
      <PageHeader
        title="Junho 2026"
        titleAside={<div className="month-nav"><IconBtn name="chevron-left" bordered title="Mês anterior" /><IconBtn name="chevron-right" bordered title="Próximo mês" /></div>}
        context={<>prazos do mês <span className="sep">·</span> <b>{visible.filter((t) => t.prazo.late).length}</b> atrasados</>}
        right={<FilterBar f={f} set={set} onClear={clear} moreItems={more} />}
      />
      <div className="card pad" style={{ padding: 16 }}>
        <div className="cal" style={{ marginBottom: 5 }}>
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((d) => <div key={d} className="cal-h">{d}</div>)}
        </div>
        <div className="cal">
          {days.map((d) => {
            const dt = byDay[d] || [];
            return (
              <div key={d} className={'cal-c' + (d === 1 ? ' today' : '')}>
                <span className="n">{d}</span>
                {dt.slice(0, 3).map((t) => (
                  <span key={t.id} className={'cal-t' + (t.prazo.late ? ' late' : '')} data-s={t.status} title={t.titulo}>
                    <span className="cdot" /><span className="ct-txt">{t.titulo}</span>
                  </span>
                ))}
                {dt.length > 3 && <span className="mono fs12 muted" style={{ display: 'block', marginTop: 3 }}>+{dt.length - 3}</span>}
              </div>
            );
          })}
        </div>
        <div className="row gap16 mt16 wrap-f" style={{ fontSize: 11.5, color: 'var(--fg-muted)' }}>
          <span className="row gap6"><span className="cdot" style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--green)' }} />em andamento</span>
          <span className="row gap6"><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--danger)' }} />bloqueado / atrasado</span>
          <span className="row gap6"><span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--p3)' }} />backlog / concluído</span>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── BRIEFING ───────────────────────────
function Briefing() {
  return (
    <div className="page">
      <PageBar title="Briefing" narrative={<>Globex <span className="sep">·</span> Agentforce <span className="sep">·</span> atualizado há 2 dias</>} actions={<><Btn sm icon="download">Exportar</Btn><Btn sm kind="primary" icon="check2">Salvar</Btn></>} />
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div className="card pad" style={{ padding: 28 }}>
          <div className="eyebrow">Contexto <span className="acc">·</span> Pilar IA Aplicada</div>
          <h2 style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.025em', marginTop: 8 }}>Agente de triagem de leads — <em style={{ fontStyle: 'normal', color: 'var(--green)' }}>descoberta</em></h2>
          {[
            { t: 'Objetivo', b: 'Reduzir o tempo de resposta a leads inbound automatizando a triagem inicial com um agente de IA integrado ao CRM.' },
            { t: 'Escopo', b: 'Classificação de intenção, enriquecimento de dados e roteamento para o time comercial. Fora de escopo: disparo de propostas.' },
            { t: 'Critérios de sucesso', b: 'Tempo médio de primeira resposta < 10 min; 90% dos leads roteados corretamente nas 4 primeiras semanas.' },
          ].map((s) => (
            <div key={s.t} style={{ marginTop: 22 }}>
              <div className="msec-title">{s.t}</div>
              <p className="soft" style={{ fontSize: 15, lineHeight: 1.65 }}>{s.b}</p>
            </div>
          ))}
          <hr className="hr" style={{ margin: '24px 0' }} />
          <div className="row gap8 wrap-f"><span className="chip green">ia</span><span className="chip">salesforce</span><span className="chip">agentforce</span></div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── TIMESHEET ───────────────────────────
function Timesheet() {
  const { f, set, clear } = useFilters();
  const rows = [
    { task: 'Configurar fluxo de aprovação', cliente: 'Acme Corp', resp: 'Marina Alves', dias: [2, 1.5, 0, 2, 1] },
    { task: 'Treinar agente de IA', cliente: 'Globex', resp: 'Bruno Tavares', dias: [0, 2, 3, 1, 0] },
    { task: 'Pipeline de ingestão', cliente: 'Acme Corp', resp: 'Rafael Costa', dias: [1, 0, 2, 0, 2.5] },
    { task: 'Dashboard de churn', cliente: 'Globex', resp: 'Letícia Prado', dias: [0, 1, 0, 1.5, 1] },
  ];
  const shown = rows.filter((r) => {
    if (f.q && !(r.task + ' ' + r.cliente + ' ' + r.resp).toLowerCase().includes(f.q.toLowerCase())) return false;
    if (f.cliente && r.cliente !== f.cliente) return false;
    if (f.resp && r.resp !== f.resp) return false;
    return true;
  });
  const dd = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex'];
  const colTot = dd.map((_, i) => shown.reduce((a, r) => a + r.dias[i], 0));
  const total = colTot.reduce((a, b) => a + b, 0);
  const more = buildMore({ onExport: () => {}, can: { group: false, arch: false, ia: false } });

  return (
    <div className="page">
      <PageHeader
        title="Timesheet"
        context={<>semana 02–06 jun <span className="sep">·</span> <b>{total}h</b> lançadas</>}
        right={<FilterBar show={['cliente', 'resp']} f={f} set={set} onClear={clear} moreItems={more} />}
      />
      <div className="tbl-wrap">
        <table className="tbl">
          <colgroup><col /><col style={{ width: 130 }} /><col style={{ width: 120 }} />{dd.map((d) => <col key={d} style={{ width: 64 }} />)}<col style={{ width: 68 }} /></colgroup>
          <thead><tr><th>Tarefa</th><th>Cliente</th><th>Responsável</th>{dd.map((d) => <th key={d} className="right"><span className="th-in">{d}</span></th>)}<th className="right"><span className="th-in">Total</span></th></tr></thead>
          <tbody>
            {shown.map((r, i) => (
              <tr key={i}>
                <td><div className="t-title"><span>{r.task}</span></div></td>
                <td className="t-sub">{r.cliente}</td>
                <td><div className="cell-resp"><Avatar name={r.resp} sm /><span>{r.resp.split(' ')[0]}</span></div></td>
                {r.dias.map((h, j) => <td key={j} className="right mono fs12" style={{ color: h ? 'var(--fg-soft)' : 'var(--fg-muted)' }}>{h || '·'}</td>)}
                <td className="right mono fs13 bold">{r.dias.reduce((a, b) => a + b, 0)}</td>
              </tr>
            ))}
            <tr style={{ background: 'var(--bg-alt)' }}>
              <td className="bold" style={{ fontSize: 13 }}>Total</td><td></td><td></td>
              {colTot.map((h, j) => <td key={j} className="right mono fs12 bold">{h}</td>)}
              <td className="right mono fs13 bold" style={{ color: 'var(--green)' }}>{total}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

Object.assign(window, { Cadastros, Portal, Foco, Triagem, Calendario, Briefing, Timesheet });
