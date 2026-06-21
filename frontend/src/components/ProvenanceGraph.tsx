// Artifacts hero: DAG gutter + fixed-height commit rows (graph), the same rows
// without the gutter (list), and an `arbor log` terminal listing (raw).
import { Icon } from './icons';
import { Avatar, EventBadge, Hash, StatusBadge } from './primitives';
import {
  EVENT_COLOR,
  ROW,
  kindIcon,
  type Commit,
  type CommitStatus,
  type RepoModel,
} from '../lib/model';
import type { ViewMode } from './nav';

function CommitRow({
  model,
  c,
  selected,
  status,
  onSelect,
}: {
  model: RepoModel;
  c: Commit;
  selected: boolean;
  status: CommitStatus;
  onSelect: (id: string) => void;
}) {
  const agent = model.agents[c.agentId];
  return (
    <div className={`crow ${selected ? 'sel' : ''}`} style={{ height: ROW }} onClick={() => onSelect(c.id)}>
      <div className="crow-icon">
        <Icon name={kindIcon(c.kind)} size={14} color="var(--fg-1)" />
      </div>
      <div className="crow-main">
        <div className="crow-top">
          <EventBadge event={c.event} size="sm" />
          <span className="crow-name">{c.name}</span>
          {c.root && <span className="crow-flag">root</span>}
          {c.merge && !c.root && <span className="crow-flag merge">merge</span>}
        </div>
        <div className="crow-label">{c.label}</div>
      </div>
      <div className="crow-meta">
        <StatusBadge status={status} size="sm" />
        <span className="crow-hash" onClick={(e) => e.stopPropagation()}>
          <Hash value={c.hash} copy={c.blobId} />
        </span>
        <span className="crow-agent">
          <Avatar agent={agent} size={16} fallback={c.agentId} />
          {agent?.label ?? '—'}
        </span>
      </div>
    </div>
  );
}

export function ProvenanceGraph({
  model,
  view,
  selectedId,
  onSelect,
  statusFor,
}: {
  model: RepoModel;
  view: ViewMode;
  selectedId: string | null;
  onSelect: (id: string) => void;
  statusFor: (c: Commit) => CommitStatus;
}) {
  const { commits, edges, byId, lanes, laneColor } = model;
  const total = commits.length * ROW;
  const cx = (c: Commit) => lanes[c.lane] ?? 22;
  const cy = (c: Commit) => c.row * ROW + 28;

  if (view === 'raw') {
    return (
      <div className="raw-log">
        <div className="raw-cmd">
          <span className="rc-key">arbor</span> log --anchor sui --format=lineage
        </div>
        {commits.map((c) => {
          const st = statusFor(c);
          const col = st === 'pending' ? 'var(--pending)' : EVENT_COLOR[c.event];
          const glyph = c.merge ? '⎇' : c.root ? '◆' : c.event === 'fork' ? '⑂' : '●';
          return (
            <div key={c.id} className="raw-line" onClick={() => onSelect(c.id)}>
              <span className="raw-node" style={{ color: col }}>{glyph}</span>
              <span className="raw-hash" onClick={(e) => e.stopPropagation()}>
                <Hash value={c.hash === '—' ? '········' : c.hash.replace(/….*/, '').slice(0, 8)} copy={c.blobId} />
              </span>
              <span className="raw-name">{c.name}</span>
              <span className="raw-ev" style={{ color: col }}>{c.event}</span>
              <span className={`raw-st st-${st}`}>{st}</span>
              <span className="raw-agent">{model.agents[c.agentId]?.label ?? '—'}</span>
              <span className="raw-time">{c.time}</span>
            </div>
          );
        })}
      </div>
    );
  }

  const showGraph = view === 'graph';
  return (
    <div className="graph-wrap" style={{ paddingLeft: showGraph ? 96 : 14 }}>
      {showGraph && (
        <svg className="graph-svg" width="92" height={total} viewBox={`0 0 92 ${total}`}>
          {edges.map((e, i) => {
            const c = byId[e.from];
            const p = byId[e.to];
            if (!c || !p) return null;
            const x1 = cx(c), y1 = cy(c), x2 = cx(p), y2 = cy(p);
            const m1 = y1 + (y2 - y1) * 0.42, m2 = y2 - (y2 - y1) * 0.42;
            const d = x1 === x2
              ? `M ${x1} ${y1} L ${x2} ${y2}`
              : `M ${x1} ${y1} C ${x1} ${m1}, ${x2} ${m2}, ${x2} ${y2}`;
            const pending = statusFor(c) === 'pending' || statusFor(p) === 'pending';
            return (
              <path
                key={i}
                d={d}
                stroke={pending ? 'var(--pending)' : laneColor[e.lane] ?? 'var(--lane-1)'}
                strokeWidth="2"
                fill="none"
                opacity={pending ? 0.7 : 0.85}
                strokeDasharray={pending ? '3 3' : 'none'}
              />
            );
          })}
          {commits.map((c) => {
            const x = cx(c), y = cy(c);
            const st = statusFor(c);
            const col = laneColor[c.lane] ?? 'var(--lane-1)';
            const sel = c.id === selectedId;
            if (st === 'pending') {
              return (
                <g key={c.id}>
                  {sel && <circle cx={x} cy={y} r="9" fill="none" stroke="var(--pending)" strokeWidth="1.5" opacity="0.5" />}
                  <circle cx={x} cy={y} r="5" fill="var(--bg-1)" stroke="var(--pending)" strokeWidth="2" strokeDasharray="2 2" />
                </g>
              );
            }
            return (
              <g key={c.id}>
                {sel && <circle cx={x} cy={y} r="9" fill="none" stroke="var(--accent)" strokeWidth="1.5" />}
                <circle cx={x} cy={y} r={c.merge || c.root ? 6 : 5} fill={c.merge ? 'var(--bg-1)' : col} stroke={col} strokeWidth="2" />
                {(c.merge || c.root) && <circle cx={x} cy={y} r="2" fill={col} />}
              </g>
            );
          })}
        </svg>
      )}
      <div className="rows">
        {commits.map((c) => (
          <CommitRow
            key={c.id}
            model={model}
            c={c}
            selected={c.id === selectedId}
            status={statusFor(c)}
            onSelect={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
