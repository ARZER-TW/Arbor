// Keys: local session key banner + agent signing keys with revoke/reinstate.
// Revoke is local UI state (the on-chain revoke path is future work); already
// anchored artifacts keep their proof regardless.
import { useState } from 'react';
import { Icon } from './icons';
import { Avatar, Button, StatusBadge } from './primitives';
import { shortAddr, type RepoModel } from '../lib/model';

export function KeysView({
  model,
  account,
}: {
  model: RepoModel;
  account: string | null;
}) {
  const [revoked, setRevoked] = useState<Record<string, boolean>>({});
  const signedBy = (addr: string) => model.commits.filter((c) => c.agentId === addr).length;
  const sessionKey = account ? shortAddr(account) : 'no wallet connected';

  return (
    <div className="grid-view">
      <div className="key-session">
        <div className="ks-left">
          <Icon name="key-round" size={15} color="var(--accent)" />
          <div>
            <div className="ks-top">Local session key · {account ? 'loaded' : 'awaiting wallet'}</div>
            <div className="ks-sub mono">
              {account ? `${sessionKey} · this browser` : 'connect a wallet to sign'}
            </div>
          </div>
        </div>
        {account && (
          <span className="cn-ok">
            <Icon name="check" size={12} color="var(--accent)" />
            ready to sign
          </span>
        )}
      </div>

      <div className="key-label">Agent signing keys · {model.agentList.length} active</div>
      <div className="key-list">
        {model.agentList.map((a) => {
          const isRev = revoked[a.id];
          return (
            <div className={`key-row ${isRev ? 'rev' : ''}`} key={a.id}>
              <Avatar agent={a} size={26} fallback={a.address} />
              <div className="key-main">
                <div className="key-top">
                  <span className="key-owner">{a.label}</span>
                  <span className="key-algo">Ed25519</span>
                </div>
                <div className="key-fp mono">{a.address}</div>
              </div>
              <div className="key-meta">
                <div className="key-meta-n">{signedBy(a.address)}</div>
                <div className="key-meta-l">commits signed</div>
              </div>
              <div className="key-st">
                {isRev ? (
                  <span
                    className="badge"
                    style={{ color: 'var(--danger)', background: 'var(--danger-faint)', borderColor: '#4a2220', fontSize: 10, padding: '2px 8px' }}
                  >
                    <Icon name="shield-x" size={11} />
                    revoked
                  </span>
                ) : (
                  <StatusBadge status="verified" size="sm" />
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                icon={isRev ? 'rotate-ccw' : 'ban'}
                onClick={() => setRevoked((r) => ({ ...r, [a.id]: !r[a.id] }))}
              >
                {isRev ? 'Reinstate' : 'Revoke'}
              </Button>
            </div>
          );
        })}

        <div className="key-row rev">
          <span className="avatar" style={{ width: 26, height: 26, background: 'var(--bg-3)', color: 'var(--fg-3)', fontSize: 12 }}>
            R
          </span>
          <div className="key-main">
            <div className="key-top">
              <span className="key-owner">rotated key (legacy)</span>
              <span className="key-algo">Ed25519</span>
            </div>
            <div className="key-fp mono">0x11ab…7f02 · superseded</div>
          </div>
          <div className="key-meta">
            <div className="key-meta-n">0</div>
            <div className="key-meta-l">commits signed</div>
          </div>
          <div className="key-st">
            <span
              className="badge"
              style={{ color: 'var(--danger)', background: 'var(--danger-faint)', borderColor: '#4a2220', fontSize: 10, padding: '2px 8px' }}
            >
              <Icon name="shield-x" size={11} />
              revoked
            </span>
          </div>
          <span className="key-added mono">rotated out</span>
        </div>
      </div>
      <div className="atable-foot">
        <Icon name="info" size={12} color="var(--fg-3)" />
        revoking a key invalidates future commits — already-anchored artifacts keep their proof, signed before revocation
      </div>
    </div>
  );
}
