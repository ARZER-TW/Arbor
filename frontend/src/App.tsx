import { useEffect, useState } from 'react';
import {
  ConnectButton,
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig,
} from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';
import './styles.css';
import {
  DEMO_REPO,
  readNodeText,
  readTimeline,
  type EntryKind,
  type NodeView,
  type TimelineEntry,
} from './lib/arbor';

const queryClient = new QueryClient();
const { networkConfig } = createNetworkConfig({
  testnet: { url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' },
  mainnet: { url: 'https://fullnode.mainnet.sui.io:443', network: 'mainnet' },
});

const KIND_COLOR: Record<EntryKind, string> = {
  create: 'var(--create)',
  commit: 'var(--commit)',
  fork: 'var(--fork)',
  propose: 'var(--propose)',
  merge: 'var(--merge)',
};

const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '');
const fmtTime = (ms: number | null) => (ms ? new Date(ms).toLocaleString() : '');

type Content =
  | { status: 'ok'; node: NodeView; text: string }
  | { status: 'err'; error: string };

function Viewer() {
  const [repoInput, setRepoInput] = useState(DEMO_REPO);
  const [repoId, setRepoId] = useState(DEMO_REPO);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [contents, setContents] = useState<Record<string, Content>>({});

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPicks([]);
    setContents({});
    readTimeline(repoId).then(
      (t) => {
        if (!cancelled) {
          setTimeline(t);
          setLoading(false);
        }
      },
      (e) => {
        if (!cancelled) {
          setError(String(e));
          setLoading(false);
        }
      },
    );
    return () => {
      cancelled = true;
    };
  }, [repoId]);

  useEffect(() => {
    for (const id of picks) {
      if (contents[id]) continue;
      readNodeText(id).then(
        (r) => setContents((c) => ({ ...c, [id]: { status: 'ok', ...r } })),
        (e) => setContents((c) => ({ ...c, [id]: { status: 'err', error: String(e) } })),
      );
    }
  }, [picks, contents]);

  const togglePick = (id: string) =>
    setPicks((prev) => {
      if (prev.includes(id)) return prev.filter((p) => p !== id);
      if (prev.length < 2) return [...prev, id];
      return [prev[1], id];
    });

  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <h1>Arbor</h1>
          <span className="tag">Git for AI agents — verifiable artifact provenance on Walrus + Sui</span>
        </div>
        <ConnectButton />
      </div>

      <div className="repobar">
        <input
          value={repoInput}
          onChange={(e) => setRepoInput(e.target.value)}
          spellCheck={false}
          placeholder="Repository object id (0x…)"
        />
        <button className="btn" onClick={() => setRepoId(repoInput.trim())}>
          Load
        </button>
      </div>

      <div className="grid">
        <section className="panel">
          <h2>Provenance timeline</h2>
          {loading && <div className="hint">loading…</div>}
          {error && <div className="err">{error}</div>}
          {!loading && !error && timeline.length === 0 && (
            <div className="hint">No Arbor events for this repository.</div>
          )}
          <ul className="timeline">
            {timeline.map((e, i) => {
              const slot = e.nodeId ? picks.indexOf(e.nodeId) : -1;
              return (
                <li
                  key={`${e.txDigest}-${i}`}
                  className={`entry${slot >= 0 ? ' picked' : ''}`}
                  onClick={() => e.nodeId && togglePick(e.nodeId)}
                >
                  <div className="rail">
                    <span className="dot" style={{ background: KIND_COLOR[e.kind] }} />
                    {i < timeline.length - 1 && <span className="line" />}
                  </div>
                  <div>
                    <div className="row1">
                      <span className="badge" style={{ background: KIND_COLOR[e.kind] }}>
                        {e.kind}
                      </span>
                      {e.branch && <span className="chip">{e.branch}</span>}
                      {e.kind === 'fork' && e.source && <span className="chip">from {e.source}</span>}
                      {slot >= 0 && <span className="pickmark">{slot === 0 ? 'A' : 'B'}</span>}
                    </div>
                    <div className="row2 mono">
                      {e.creator && <>by {short(e.creator)} · </>}
                      node {short(e.nodeId)} · {fmtTime(e.timestampMs)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel viewer">
          <h2>{picks.length === 2 ? 'Diff' : 'Artifact'}</h2>
          {picks.length === 0 && (
            <div className="empty">
              Click a node to view its content. Pick two to diff them.
            </div>
          )}
          {picks.length === 2 && <DiffHead a={contents[picks[0]]} b={contents[picks[1]]} />}
          <div className={picks.length === 2 ? 'panes' : 'single'}>
            {picks.map((id) => (
              <Pane key={id} content={contents[id]} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function DiffHead({ a, b }: { a?: Content; b?: Content }) {
  if (a?.status !== 'ok' || b?.status !== 'ok') return null;
  const identical = a.node.blobId === b.node.blobId;
  return (
    <div className="diffhead">
      <span className={`tag-state ${identical ? 'same' : 'diff'}`}>
        {identical ? 'identical (same Walrus blob)' : 'different content'}
      </span>
      <span className="kv mono">{identical ? 'content-addressed dedup' : `${short(a.node.id)} vs ${short(b.node.id)}`}</span>
    </div>
  );
}

function Pane({ content }: { content?: Content }) {
  if (!content) return <div className="pane"><div className="meta">loading…</div></div>;
  if (content.status === 'err') return <div className="pane"><pre className="err">{content.error}</pre></div>;
  const { node, text } = content;
  return (
    <div className="pane">
      <div className="meta mono">
        <div className="kv"><b>{node.kind}</b> · {node.message}</div>
        <div className="kv">by {short(node.creator)} · {fmtTime(node.createdAtMs)}</div>
        <div className="kv">node {short(node.id)} · parents {node.parents.length}</div>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <Viewer />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
