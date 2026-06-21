// Left sidebar: brand, repo selector, nav, branches, chain-status footer.
import { Icon, BrandGlyph } from './icons';
import type { NavId } from './nav';
import { NAV_ITEMS } from './nav';
import type { RepoModel } from '../lib/model';

export function Sidebar({
  model,
  activeNav,
  setActiveNav,
  activeBranch,
  setActiveBranch,
  onToggleRepo,
}: {
  model: RepoModel | null;
  activeNav: NavId;
  setActiveNav: (n: NavId) => void;
  activeBranch: string;
  setActiveBranch: (b: string) => void;
  onToggleRepo: () => void;
}) {
  const branches = model?.branches ?? [];
  const laneColor = model?.laneColor ?? [];
  return (
    <aside className="sidebar">
      <div className="sb-brand">
        <BrandGlyph size={22} />
        <span className="sb-word">arbor</span>
        <div className="sb-tagline">Git for AI agents · verifiable provenance</div>
      </div>

      <button className="sb-repo" onClick={onToggleRepo} title="switch repository">
        <Icon name="database" size={13} color="var(--fg-2)" />
        <div className="sb-repo-name">
          <span className="org">{model?.org ?? 'sui-overflow'}/</span>
          <span className="rp">{model?.repo ?? '…'}</span>
        </div>
        <Icon name="chevrons-up-down" size={13} color="var(--fg-3)" />
      </button>

      <nav className="sb-nav">
        {NAV_ITEMS.map((n) => (
          <button
            key={n.id}
            className={`sb-item ${activeNav === n.id ? 'on' : ''}`}
            onClick={() => setActiveNav(n.id)}
          >
            <Icon name={n.icon} size={15} />
            {n.label}
          </button>
        ))}
      </nav>

      <div className="sb-section">
        <div className="sb-label">Branches</div>
        {branches.map((b) => (
          <button
            key={b.name}
            className={`sb-branch ${activeBranch === b.name ? 'on' : ''}`}
            onClick={() => setActiveBranch(b.name)}
          >
            <span className="lane-dot" style={{ background: laneColor[b.lane] }} />
            <span className="bn">{b.name}</span>
            {b.status === 'pending' ? (
              <Icon name="loader" size={12} color="var(--pending)" />
            ) : (
              <span className="bc">{b.commits}</span>
            )}
          </button>
        ))}
      </div>

      <div className="sb-foot">
        <div className="chain-stat">
          <span className="pulse" />
          <div>
            <div className="cs-top">Sui · synced</div>
            <div className="cs-sub">testnet{model?.anchorShort ? ` · ${model.anchorShort}` : ''}</div>
          </div>
          <Icon name="settings" size={14} color="var(--fg-3)" />
        </div>
      </div>
    </aside>
  );
}
