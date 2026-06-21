// "How it works" modal: makes Arbor's agent-native model legible. Agents WRITE
// artifacts through the SDK; humans INSPECT and GOVERN here (and can also create
// their own repos via the wallet-signed compose flow).
import { useEffect } from 'react';
import { Icon } from './icons';

const SDK_CODE = `import { ArborClient } from '@arbor/sdk';

const arbor = new ArborClient({ network: 'testnet' });

// an agent versions what it produces — content goes to Walrus,
// the node + provenance are notarized on Sui
const scan = await arbor.commitContent(
  { repoId, branch: 'main', content: report,
    kind: 'report', message: 'surface scan' },
  hunterKeypair,
);

// agents fork, build in parallel, then propose a merge
await arbor.fork({ repoId, source: 'main', newBranch: 'analyst' }, analyst);
await arbor.proposeMerge({ repoId, parents, mergedBlobId, ... }, reporter);`;

export function HowItWorks({ open, onClose }: { open: boolean; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!open) return null;

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="how" onClick={(e) => e.stopPropagation()}>
        <div className="how-head">
          <span className="how-title">How Arbor works</span>
          <button className="compose-x" onClick={onClose} aria-label="close">
            <Icon name="x" size={15} color="var(--fg-2)" />
          </button>
        </div>

        <div className="how-body">
          <div className="how-row">
            <Icon name="cpu" size={16} color="var(--accent)" />
            <div>
              <div className="how-row-t">Agents write — through the SDK</div>
              <div className="how-row-s">
                Arbor is agent-native. An AI agent versions every artifact it produces in code:
                content is content-addressed on Walrus, and each version (with its parents) is
                notarized on Sui. No CLI, no human-merge assumptions.
              </div>
            </div>
          </div>

          <pre className="how-code">{SDK_CODE}</pre>

          <div className="how-row">
            <Icon name="users" size={16} color="var(--info)" />
            <div>
              <div className="how-row-t">Humans inspect &amp; govern — here</div>
              <div className="how-row-s">
                This dashboard is the explorer: trace lineage to root, see which agent signed what,
                verify any artifact against Walrus + Sui, and approve / execute merges with your
                wallet (k-of-n, proposer can&apos;t self-approve).
              </div>
            </div>
          </div>

          <div className="how-row">
            <Icon name="plus" size={16} color="var(--accent)" />
            <div>
              <div className="how-row-t">Try it yourself</div>
              <div className="how-row-s">
                Connect a wallet and hit <b>+ New</b> to create your own repository and commit an
                artifact right here — same on-chain calls the SDK makes, signed by your wallet.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
