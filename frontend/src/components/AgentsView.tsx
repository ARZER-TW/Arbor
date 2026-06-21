// Agents: on-chain policy strip (AccessPolicy writers + MergePolicy k-of-n) and
// per-producer cards with keys, stats, and signed artifacts.
import { Icon } from './icons';
import { Avatar, EventBadge, Hash, StatusBadge } from './primitives';
import type { CSSProperties } from 'react';
import type { Agent, RepoModel } from '../lib/model';

export function AgentsView({
  model,
  onSelect,
}: {
  model: RepoModel;
  onSelect: (id: string) => void;
}) {
  const signedBy = (a: Agent) => model.commits.filter((c) => c.agentId === a.address);
  const branchesOf = (a: Agent) => [...new Set(signedBy(a).map((c) => c.branch))];

  return (
    <div className="grid-view">
      <div className="policy-strip">
        <div className="pol-card">
          <div className="pol-head">
            <Icon name="users" size={14} color="var(--fg-2)" />
            AccessPolicy · writer allow-list
          </div>
          <div className="pol-body">
            {model.agentList.filter((a) => model.writers.includes(a.address)).map((a) => (
              <span className="pol-chip" key={a.id}>
                <Avatar agent={a} size={14} fallback={a.address} />
                {a.label}
              </span>
            ))}
          </div>
          <div className="pol-note">
            only allow-listed agent keys may commit to this repository
          </div>
        </div>
        <div className="pol-card">
          <div className="pol-head">
            <Icon name="git-merge" size={14} color="var(--fg-2)" />
            MergePolicy · k-of-n approvals
          </div>
          <div className="pol-body">
            <span className="pol-kn">
              {model.approvalThreshold} <span className="pol-kn-dim">of</span> {model.writers.length || model.agentList.length}
            </span>
            <span className="pol-note" style={{ margin: 0 }}>
              approvals required · proposer excluded · stale-merge checked
            </span>
          </div>
        </div>
      </div>

      <div className="agent-grid">
        {model.agentList.map((a) => {
          const arts = signedBy(a);
          const cardStyle = { '--ac': a.color } as CSSProperties;
          return (
            <div className="agent-card" key={a.id} style={cardStyle}>
              <div className="agent-card-head">
                <Avatar agent={a} size={36} fallback={a.address} />
                <div className="agent-id">
                  <div className="agent-name">{a.label}</div>
                  <div className="agent-role">{a.role} agent</div>
                </div>
                <StatusBadge status={a.status === 'active' ? 'verified' : 'pending'} size="sm" />
              </div>
              <div className="agent-key">
                <Icon name="key-round" size={12} color="var(--fg-3)" />
                <Hash value={`ed25519 · ${a.key}`} info={false} copy={a.address} />
              </div>
              <div className="agent-stats">
                <div className="agent-stat">
                  <span className="as-n">{arts.length}</span>
                  <span className="as-l">commits signed</span>
                </div>
                <div className="agent-stat">
                  <span className="as-n">{branchesOf(a).length}</span>
                  <span className="as-l">branches</span>
                </div>
                <div className="agent-stat">
                  <span className="as-n" style={{ color: model.writers.includes(a.address) ? 'var(--accent)' : 'var(--fg-3)' }}>
                    {model.writers.includes(a.address) ? '✓' : '—'}
                  </span>
                  <span className="as-l">writer access</span>
                </div>
              </div>
              <div className="agent-arts">
                <div className="agent-arts-label">signed artifacts</div>
                {arts.length === 0 && <div className="agent-art-name" style={{ padding: '4px 8px' }}>no commits yet</div>}
                {arts.map((c) => (
                  <div className="agent-art" key={c.id} onClick={() => onSelect(c.id)}>
                    <EventBadge event={c.event} size="sm" />
                    <span className="agent-art-name">{c.name}</span>
                    <span className="agent-art-hash">{c.hash}</span>
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
