// Top bar: breadcrumb + counts pill, ⌘K search, graph/list/raw toggle
// (Artifacts only), Verify-all, and the wallet ConnectButton.
import { ConnectButton } from '@mysten/dapp-kit';
import { Icon } from './icons';
import { Button, Kbd } from './primitives';
import { NAV_CRUMB, type NavId, type ViewMode } from './nav';
import type { RepoModel } from '../lib/model';

const SEG: [ViewMode, string][] = [
  ['graph', 'git-branch'],
  ['list', 'list'],
  ['raw', 'code'],
];

export function TopBar({
  model,
  nav,
  view,
  setView,
  onCommand,
  onVerifyAll,
  verifying,
}: {
  model: RepoModel | null;
  nav: NavId;
  view: ViewMode;
  setView: (v: ViewMode) => void;
  onCommand: () => void;
  onVerifyAll: () => void;
  verifying: boolean;
}) {
  const onMain = nav === 'artifacts' || nav === 'lineage';
  const crumb = NAV_CRUMB[nav];
  const counts = model
    ? `${model.commits.length} artifact${model.commits.length === 1 ? '' : 's'} · ${model.agentList.length} agent${model.agentList.length === 1 ? '' : 's'}`
    : '';
  return (
    <header className="topbar">
      <div className="tb-crumb">
        <Icon name="git-branch" size={14} color="var(--fg-2)" />
        <span className="crumb-dim">{model?.repo ?? 'arbor'}</span>
        <span className="crumb-sep">/</span>
        <span className="crumb-cur">{crumb}</span>
        {onMain && model && (
          <span className="crumb-tag">
            <span className="lane-dot" style={{ background: 'var(--lane-1)' }} />
            {counts}
          </span>
        )}
      </div>

      <div className="tb-actions">
        <button className="tb-search" onClick={onCommand}>
          <Icon name="search" size={13} color="var(--fg-3)" />
          <span>Search…</span>
          <Kbd>⌘K</Kbd>
        </button>

        {nav === 'artifacts' && (
          <div className="seg">
            {SEG.map(([v, ic]) => (
              <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>
                <Icon name={ic} size={13} />
                {v}
              </button>
            ))}
          </div>
        )}

        <Button
          variant="primary"
          size="sm"
          icon={verifying ? 'loader' : 'shield-check'}
          onClick={onVerifyAll}
        >
          {verifying ? 'Verifying…' : 'Verify all'}
        </Button>

        <span className="wallet">
          <ConnectButton />
        </span>
      </div>
    </header>
  );
}
