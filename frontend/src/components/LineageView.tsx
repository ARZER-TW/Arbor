// Lineage: a spacious branch-swimlane DAG with trace-to-root highlighting.
import { Avatar, EventBadge } from './primitives';
import {
  EVENT_COLOR,
  lineage,
  type Commit,
  type CommitStatus,
  type RepoModel,
} from '../lib/model';

export function LineageView({
  model,
  selectedId,
  onSelect,
  statusFor,
}: {
  model: RepoModel;
  selectedId: string | null;
  onSelect: (id: string) => void;
  statusFor: (c: Commit) => CommitStatus;
}) {
  const { commits, edges, byId, branches, laneColor } = model;
  const laneX = (lane: number) => 120 + lane * 252;
  const headY = 64;
  const rowH = 96;
  const nodeY = (r: number) => headY + 40 + r * rowH;
  const maxRow = commits.length ? Math.max(...commits.map((c) => c.row)) : 0;
  const height = nodeY(maxRow) + 64;
  const width = laneX(Math.max(0, branches.length - 1)) + 320;

  const traceIds = selectedId ? lineage(model, selectedId).map((c) => c.id) : [];
  const onTrace = (from: string, to: string) => {
    const c = byId[from];
    return !!c && traceIds.includes(from) && c.parents[0] === to && traceIds.includes(to);
  };

  return (
    <div className="lin-wrap">
      <div className="lin-legend">
        {(Object.entries(EVENT_COLOR) as [Commit['event'], string][]).map(([ev, col]) => (
          <span className="lin-leg" key={ev}>
            <span className="lin-leg-dot" style={{ background: col }} />
            {ev}
          </span>
        ))}
        <span className="lin-leg-spacer" />
        <span className="lin-leg-note">parents[0] chain → root highlights on select</span>
      </div>
      <div className="lin-scroll">
        <div className="lin-canvas" style={{ width, height, minWidth: width }}>
          {branches.map((b) => (
            <div key={b.name} className="lin-col" style={{ left: laneX(b.lane) - 11 }}>
              <span className="lane-dot" style={{ background: laneColor[b.lane] }} />
              <span className="lin-col-name">{b.name}</span>
            </div>
          ))}
          <svg className="lin-svg" width={width} height={height}>
            {branches.map((b) => (
              <line
                key={b.name}
                x1={laneX(b.lane)}
                y1={headY + 18}
                x2={laneX(b.lane)}
                y2={height - 24}
                stroke="var(--border-1)"
                strokeWidth="1"
                strokeDasharray="2 5"
              />
            ))}
            {edges.map((e, i) => {
              const c = byId[e.from];
              const p = byId[e.to];
              if (!c || !p) return null;
              const x1 = laneX(c.lane), y1 = nodeY(c.row), x2 = laneX(p.lane), y2 = nodeY(p.row);
              const m1 = y1 + (y2 - y1) * 0.42, m2 = y2 - (y2 - y1) * 0.42;
              const d = x1 === x2
                ? `M ${x1} ${y1} L ${x2} ${y2}`
                : `M ${x1} ${y1} C ${x1} ${m1}, ${x2} ${m2}, ${x2} ${y2}`;
              const traced = onTrace(e.from, e.to);
              const pending = statusFor(c) === 'pending' || statusFor(p) === 'pending';
              return (
                <path
                  key={i}
                  d={d}
                  fill="none"
                  stroke={traced ? 'var(--accent)' : pending ? 'var(--pending)' : laneColor[e.lane] ?? 'var(--lane-1)'}
                  strokeWidth={traced ? 2.5 : 2}
                  opacity={traced ? 1 : 0.5}
                  strokeDasharray={pending && !traced ? '3 3' : 'none'}
                />
              );
            })}
            {commits.map((c) => {
              const x = laneX(c.lane), y = nodeY(c.row), st = statusFor(c);
              const col = EVENT_COLOR[c.event];
              const sel = c.id === selectedId, traced = traceIds.includes(c.id);
              return (
                <g key={c.id} style={{ cursor: 'pointer' }} onClick={() => onSelect(c.id)}>
                  {(sel || traced) && (
                    <circle cx={x} cy={y} r="15" fill="none" stroke={sel ? 'var(--accent)' : 'var(--accent-line)'} strokeWidth="1.5" opacity={sel ? 1 : 0.7} />
                  )}
                  {st === 'pending' ? (
                    <circle cx={x} cy={y} r="8" fill="var(--bg-1)" stroke="var(--pending)" strokeWidth="2.5" strokeDasharray="2.5 2.5" />
                  ) : (
                    <circle cx={x} cy={y} r={c.merge || c.root ? 9 : 8} fill={c.merge ? 'var(--bg-1)' : col} stroke={col} strokeWidth="2.5" />
                  )}
                  {(c.merge || c.root) && st !== 'pending' && <circle cx={x} cy={y} r="3" fill={col} />}
                </g>
              );
            })}
          </svg>
          {commits.map((c) => {
            const x = laneX(c.lane), y = nodeY(c.row), sel = c.id === selectedId;
            const agent = model.agents[c.agentId];
            return (
              <div
                key={c.id}
                className={`lin-label ${sel ? 'sel' : ''}`}
                style={{ left: x + 22, top: y - 19 }}
                onClick={() => onSelect(c.id)}
              >
                <div className="lin-label-top">
                  <EventBadge event={c.event} size="sm" />
                  <span className="lin-label-name">{c.name}</span>
                  {c.root && <span className="crow-flag">root</span>}
                </div>
                <div className="lin-label-sub">
                  <Avatar agent={agent} size={13} fallback={c.agentId} />
                  {agent?.label ?? '—'}
                  <span className="lin-label-hash">{c.hash}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
