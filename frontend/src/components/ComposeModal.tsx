// Write flow: a human connects a wallet and creates their own repository or
// commits a new artifact. Content is uploaded to Walrus; the create/commit
// transaction is signed by the connected wallet. This is what turns the
// dashboard from a read-only explorer into a product you can actually use.
import { useEffect, useState } from 'react';
import { ConnectButton } from '@mysten/dapp-kit';
import { Icon } from './icons';
import { Button } from './primitives';

type Mode = 'create' | 'commit';

const SAMPLE = '# Risk note\n\n- finding: oracle price lacks a staleness check\n- severity: HIGH\n';

export function ComposeModal({
  open,
  onClose,
  account,
  repoName,
  branches,
  canCommit,
  busy,
  error,
  onCreate,
  onCommit,
}: {
  open: boolean;
  onClose: () => void;
  account: string | null;
  repoName: string;
  branches: string[];
  canCommit: boolean;
  busy: boolean;
  error: string | null;
  onCreate: (name: string, content: string, message: string) => void;
  onCommit: (branch: string, content: string, message: string) => void;
}) {
  const [mode, setMode] = useState<Mode>('create');
  const [name, setName] = useState('');
  const [content, setContent] = useState('');
  const [message, setMessage] = useState('');
  const [branch, setBranch] = useState('main');

  useEffect(() => {
    if (open) {
      setMode(canCommit ? 'commit' : 'create');
      setName('');
      setContent('');
      setMessage('');
      setBranch(branches[0] ?? 'main');
    }
  }, [open, canCommit, branches]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  if (!open) return null;

  const canSubmit =
    !!account &&
    !busy &&
    message.trim().length > 0 &&
    (mode === 'create' ? name.trim().length > 0 : content.trim().length > 0);

  const submit = () => {
    if (!canSubmit) return;
    if (mode === 'create') onCreate(name.trim(), content, message.trim());
    else onCommit(branch, content, message.trim());
  };

  return (
    <div className="cmd-overlay" onClick={() => !busy && onClose()}>
      <div className="compose" onClick={(e) => e.stopPropagation()}>
        <div className="compose-head">
          <div className="compose-tabs">
            <button
              className={mode === 'create' ? 'on' : ''}
              onClick={() => setMode('create')}
              disabled={busy}
            >
              <Icon name="plus" size={13} /> New repository
            </button>
            <button
              className={mode === 'commit' ? 'on' : ''}
              onClick={() => canCommit && setMode('commit')}
              disabled={busy || !canCommit}
              title={canCommit ? '' : 'connect an allow-listed writer of this repo'}
            >
              <Icon name="file-plus" size={13} /> Commit artifact
            </button>
          </div>
          <button className="compose-x" onClick={() => !busy && onClose()} aria-label="close">
            <Icon name="x" size={15} color="var(--fg-2)" />
          </button>
        </div>

        {!account ? (
          <div className="compose-body">
            <div className="compose-connect">
              <Icon name="key-round" size={18} color="var(--fg-2)" />
              <div>
                <div className="compose-connect-t">Connect a wallet to write</div>
                <div className="compose-connect-s">
                  Reads are public; creating a repo or committing an artifact is a wallet-signed Sui
                  transaction. Content is stored on Walrus.
                </div>
              </div>
            </div>
            <span className="wallet" style={{ display: 'flex' }}>
              <ConnectButton connectText="Connect wallet" />
            </span>
          </div>
        ) : (
          <div className="compose-body">
            {mode === 'create' ? (
              <label className="compose-field">
                <span className="compose-label">Repository name</span>
                <input
                  className="compose-input"
                  placeholder="my-risk-reviews"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={busy}
                />
              </label>
            ) : (
              <label className="compose-field">
                <span className="compose-label">Branch · {repoName}</span>
                <select
                  className="compose-input"
                  value={branch}
                  onChange={(e) => setBranch(e.target.value)}
                  disabled={busy}
                >
                  {branches.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="compose-field">
              <span className="compose-label">
                Message <span className="compose-req">required</span>
              </span>
              <input
                className="compose-input"
                placeholder={mode === 'create' ? 'scope' : 'surface scan'}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                disabled={busy}
              />
            </label>

            <label className="compose-field">
              <span className="compose-label">
                Artifact content{' '}
                {mode === 'create' ? (
                  <span className="compose-opt">stored on Walrus · optional</span>
                ) : (
                  <span className="compose-req">stored on Walrus · required</span>
                )}
              </span>
              <textarea
                className="compose-textarea"
                placeholder={SAMPLE}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                disabled={busy}
                rows={6}
              />
            </label>

            {error && <div className="action-err">{error}</div>}

            <div className="compose-foot">
              <span className="compose-hint">
                {mode === 'create'
                  ? 'You become the owner + sole writer. 1-of-1 approvals.'
                  : 'Signed by your wallet as an allow-listed writer.'}
              </span>
              <Button
                variant="primary"
                icon={busy ? 'loader' : mode === 'create' ? 'plus' : 'file-plus'}
                onClick={submit}
                disabled={!canSubmit}
              >
                {busy
                  ? mode === 'create'
                    ? 'Creating…'
                    : 'Committing…'
                  : mode === 'create'
                    ? 'Create repository'
                    : 'Commit to ' + branch}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
