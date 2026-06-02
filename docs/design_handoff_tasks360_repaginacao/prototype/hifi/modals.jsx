/* tasks 360 hi-fi — modais: TaskModal · ClienteModal */
const { useState: useState3 } = React;

function TaskModal({ task, onClose }) {
  const [tab, setTab] = useState3('comentarios');
  if (!task) return null;
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal w-task" onClick={(e) => e.stopPropagation()}>
        <div className="mhead dark">
          <span className="crumb">{task.cliente}<span className="sep">/</span>{task.projeto || '—'}</span>
          <span className="mtitle">{task.titulo}</span>
          <Pri p={task.pri} />
          <span className="save"><span className="d" />salvo</span>
          <button className="iconbtn ic-x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="mbody">
          <div className="mleft">
            <div className="msec">
              <div className="msec-title">Descrição</div>
              <p className="soft" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
                Implementar o fluxo no Salesforce com regras de aprovação por alçada. Validar com o time comercial antes de publicar em produção. Considerar limites por faixa de desconto.
              </p>
            </div>
            <div className="msec">
              <div className="msec-title">Checklist</div>
              <div className="checkline done"><Checkbox on onClick={() => {}} /><span>Mapear alçadas de aprovação</span></div>
              <div className="checkline"><Checkbox onClick={() => {}} /><span>Configurar regras no Flow Builder</span></div>
              <div className="checkline"><Checkbox onClick={() => {}} /><span>Testar em sandbox</span></div>
            </div>
            <div className="msec">
              <div className="msec-title">Detalhes</div>
              <div className="field-row">
                <div className="field"><label className="lbl">Responsável</label><div className="sel"><select defaultValue={task.resp}>{PESSOAS.map((p) => <option key={p.id}>{p.nome}</option>)}</select><Icon name="chevron-down" /></div></div>
                <div className="field"><label className="lbl">Prazo</label><input className="inp" defaultValue="2026-06-12" /></div>
              </div>
              <div className="field-row">
                <div className="field"><label className="lbl">Prioridade</label><div className="sel"><select defaultValue={task.pri}><option>P0</option><option>P1</option><option>P2</option><option>P3</option></select><Icon name="chevron-down" /></div></div>
                <div className="field"><label className="lbl">Esforço (h)</label><input className="inp" defaultValue={task.h} /></div>
              </div>
            </div>
          </div>
          <div className="mright">
            <div className="mright-tabs">
              <button className={'subtab' + (tab === 'comentarios' ? ' on' : '')} onClick={() => setTab('comentarios')}><Icon name="message" />Comentários <span className="count">3</span></button>
              <button className={'subtab' + (tab === 'anexos' ? ' on' : '')} onClick={() => setTab('anexos')}><Icon name="paperclip" />Anexos</button>
              <button className={'subtab' + (tab === 'log' ? ' on' : '')} onClick={() => setTab('log')}><Icon name="history" />Log</button>
            </div>
            <div className="mright-body">
              {tab === 'comentarios' && <>
                <div className="msg">
                  <div className="mh"><Avatar name="Marina Alves" green sm /><span className="who">Marina</span><span className="when">há 2h</span></div>
                  <div className="body">Validei as alçadas com o comercial. Faixa acima de 20% precisa de aprovação do diretor.</div>
                </div>
                <div className="msg cliente">
                  <div className="mh"><Avatar name="Cliente Acme" sm /><span className="who">Cliente · Acme</span><span className="when">ontem</span></div>
                  <div className="body">Confirmado. Podem seguir com essa regra de alçada.</div>
                </div>
                <div className="msg">
                  <div className="mh"><Avatar name="João Diniz" sm /><span className="who">João</span><span className="when">2 dias</span></div>
                  <div className="body">Subi a primeira versão no sandbox para testes.</div>
                </div>
              </>}
              {tab === 'anexos' && <div className="muted fs13" style={{ textAlign: 'center', padding: 24 }}>Nenhum anexo ainda.</div>}
              {tab === 'log' && <div className="muted fs13" style={{ textAlign: 'center', padding: 24 }}>Histórico de alterações.</div>}
            </div>
            <div style={{ borderTop: '1px solid var(--line)', padding: '12px 18px', background: 'var(--bg)' }}>
              <textarea className="inp" placeholder="Escreva um comentário… use @ para mencionar" style={{ minHeight: 52 }} />
            </div>
          </div>
        </div>
        <div className="mfoot">
          <span className="hint">⌘↵ salvar</span>
          <span className="sp" />
          <Btn sm kind="danger" icon="x">Excluir</Btn>
          <Btn sm onClick={onClose}>Fechar</Btn>
          <Btn sm kind="primary" icon="check2">Salvar</Btn>
        </div>
      </div>
    </div>
  );
}

function ClienteModal({ onClose }) {
  return (
    <div className="modal-bg" onClick={onClose}>
      <div className="modal w-form" onClick={(e) => e.stopPropagation()}>
        <div className="mhead portal">
          <Icon name="building" />
          <span className="mtitle">Novo cliente</span>
          <button className="iconbtn ic-x" onClick={onClose}><Icon name="x" /></button>
        </div>
        <div className="mleft" style={{ padding: 22 }}>
          <div className="field"><label className="lbl">Nome</label><input className="inp" placeholder="Ex: Acme Corp" autoFocus /></div>
          <div className="field-row">
            <div className="field"><label className="lbl">Domínios</label><input className="inp" placeholder="acme.com" /></div>
            <div className="field"><label className="lbl">Tipo</label><div className="sel"><select><option>Externo</option><option>Interno</option></select><Icon name="chevron-down" /></div></div>
          </div>
          <div className="field"><label className="lbl">Sócio responsável</label><div className="sel"><select>{PESSOAS.filter((p) => p.role === 'socio').map((p) => <option key={p.id}>{p.nome}</option>)}</select><Icon name="chevron-down" /></div></div>
        </div>
        <div className="mfoot">
          <span className="sp" />
          <Btn sm onClick={onClose}>Cancelar</Btn>
          <Btn sm kind="primary" icon="check2">Criar cliente</Btn>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { TaskModal, ClienteModal });
