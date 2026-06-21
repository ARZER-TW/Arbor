// Anchors: on-chain notarization table — each row binds a content hash (Walrus
// blob) to a Sui anchor (tx digest), linkable to the explorer.
import { Icon } from './icons';
import {
  kindIcon,
  shortAddr,
  suiscanPkgUrl,
  suiscanTxUrl,
  walrusBlobUrl,
  type Commit,
  type CommitStatus,
  type RepoModel,
} from '../lib/model';

export function AnchorsView({
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
  const anchored = model.commits.filter((c) => statusFor(c) !== 'pending' && c.txDigest).length;
  const pending = model.commits.length - anchored;

  return (
    <div className="grid-view">
      <div className="anchor-summary">
        <div className="ax-stat">
          <span className="ax-n">{anchored}</span>
          <span className="ax-l">anchored on Sui</span>
        </div>
        <div className="ax-sep" />
        <div className="ax-stat">
          <span className="ax-n" style={{ color: pending ? 'var(--pending)' : 'var(--fg-0)' }}>
            {pending}
          </span>
          <span className="ax-l">awaiting tx</span>
        </div>
        <div className="ax-sep" />
        <div className="ax-meta">
          <div className="ax-meta-row">
            <span className="ax-k">network</span>
            <span className="ax-v">Sui testnet</span>
          </div>
          <div className="ax-meta-row">
            <span className="ax-k">package</span>
            <a className="ax-v is-info" href={suiscanPkgUrl(model.packageId)} target="_blank" rel="noreferrer">
              {shortAddr(model.packageId)}
            </a>
          </div>
        </div>
      </div>

      <div className="atable">
        <div className="atable-head">
          <span className="ac-st">status</span>
          <span className="ac-name">artifact</span>
          <span className="ac-hash">content hash</span>
          <span className="ac-blob">walrus blob</span>
          <span className="ac-block">sui anchor</span>
          <span className="ac-time">notarized</span>
          <span className="ac-ext" />
        </div>
        {model.commits.map((c) => {
          const st = statusFor(c);
          const sel = c.id === selectedId;
          const isAnchored = st !== 'pending' && !!c.txDigest;
          const isRoot = c.blobId === '';
          return (
            <div className={`arow ${sel ? 'sel' : ''}`} key={c.id} onClick={() => onSelect(c.id)}>
              <span className="ac-st">
                <span className={`adot ${isAnchored ? 'ok' : 'pending'}`} />
                <span className={`ast ${isAnchored ? 'verified' : 'pending'}`}>
                  {isAnchored ? 'anchored' : 'pending'}
                </span>
              </span>
              <span className="ac-name">
                <Icon name={kindIcon(c.kind)} size={13} color="var(--fg-2)" />
                {c.name}
              </span>
              {isRoot ? (
                <>
                  <span className="ac-hash" style={{ color: 'var(--fg-3)' }}>
                    repository root
                  </span>
                  <span className="ac-blob" style={{ color: 'var(--fg-3)' }}>
                    no content blob
                  </span>
                </>
              ) : (
                <>
                  <span className="ac-hash">{c.hash}</span>
                  <a
                    className="ac-blob"
                    href={walrusBlobUrl(c.blobId)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {c.blob}
                  </a>
                </>
              )}
              <span className="ac-block">
                {isAnchored ? (
                  <span style={{ color: 'var(--accent)' }}>{c.anchorShort}</span>
                ) : (
                  <span style={{ color: 'var(--pending)' }}>awaiting tx…</span>
                )}
              </span>
              <span className="ac-time">{c.time}</span>
              <span className="ac-ext" onClick={(e) => e.stopPropagation()}>
                {isAnchored && (
                  <a href={suiscanTxUrl(c.txDigest)} target="_blank" rel="noreferrer" title="open in explorer">
                    <Icon name="external-link" size={12} />
                  </a>
                )}
              </span>
            </div>
          );
        })}
      </div>
      <div className="atable-foot">
        <Icon name="shield-check" size={12} color="var(--fg-3)" />
        each anchor binds a content hash to an immutable Sui object — bytes can't be swapped under the same id · content hash IS the Walrus blob id — identical bytes dedupe and cannot be tampered
      </div>
    </div>
  );
}
