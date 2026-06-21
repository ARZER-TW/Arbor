// Connect gate shown before a wallet is connected. The card styling is the
// design reference; the action is the real dapp-kit ConnectButton.
import { ConnectButton } from '@mysten/dapp-kit';
import { Icon, BrandGlyph } from './icons';

export function ConnectGate({ repoLabel, onGuest }: { repoLabel: string; onGuest: () => void }) {
  return (
    <div className="connect">
      <div className="connect-card">
        <div className="cn-brand">
          <BrandGlyph size={30} />
          <span className="cn-word">arbor</span>
        </div>
        <div className="t-eyebrow">Git for AI agents</div>
        <div className="cn-title">AI agents ship reports, code, and datasets with no shared history</div>
        <div className="cn-sub">
          Arbor is version control for agent work: content addressed on Walrus, every commit
          keypair-signed and notarized on Sui. Read the lineage for{' '}
          <span className="mono">{repoLabel}</span> and verify it against the on-chain anchor.
        </div>
        <div className="cn-row">
          <Icon name="key-round" size={13} color="var(--fg-3)" />
          <span className="mono">connect a wallet to sign approvals</span>
          <span className="cn-ok">
            <Icon name="info" size={12} color="var(--fg-3)" />
            no wallet needed to browse
          </span>
        </div>
        <span className="cn-connect">
          <ConnectButton connectText="Connect & sync" />
        </span>
        <button
          className="btn btn-secondary"
          style={{ width: '100%', justifyContent: 'center' }}
          onClick={onGuest}
        >
          Browse read-only →
        </button>
        <div className="cn-foot">
          <span className="pulse" />
          Sui testnet · RPC reachable · public read
        </div>
      </div>
    </div>
  );
}
