import { useEffect, useState } from 'react';
import {
  ConnectButton,
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { Transaction } from '@mysten/sui/transactions';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import '@mysten/dapp-kit/dist/index.css';
import './styles.css';
import {
  DEMO_REPO,
  PENDING_REPO,
  MR_STATUS,
  buildApproveTx,
  buildExecuteMergeTx,
  readClient,
  readMergeRequests,
  readNodeText,
  readTimeline,
  type EntryKind,
  type MergeRequestView,
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
const renderMarkdown = (text: string): string =>
  DOMPurify.sanitize(marked.parse(text, { async: false }) as string);

type Content =
  | { status: 'ok'; node: NodeView; text: string }
  | { status: 'err'; error: string };

function Viewer() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [repoInput, setRepoInput] = useState(DEMO_REPO);
  const [repoId, setRepoId] = useState(DEMO_REPO);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [mrs, setMrs] = useState<MergeRequestView[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [contents, setContents] = useState<Record<string, Content>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [actionErr, setActionErr] = useState<string | null>(null);

  async function load(id: string) {
    setLoading(true);
    setError(null);
    try {
      const [t, m] = await Promise.all([readTimeline(id), readMergeRequests(id)]);
      setTimeline(t);
      setMrs(m);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setPicks([]);
    setContents({});
    setActionErr(null);
    void load(repoId);
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
    setPicks((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : prev.length < 2 ? [...prev, id] : [prev[1], id],
    );

  async function act(mrId: string, tx: Transaction) {
    setBusy(mrId);
    setActionErr(null);
    try {
      const res = await signAndExecute({ transaction: tx });
      await readClient.waitForTransaction({ digest: res.digest });
      await load(repoId);
    } catch (e) {
      setActionErr(String(e));
    } finally {
      setBusy(null);
    }
  }

  const openMrs = mrs.filter((m) => m.status !== MR_STATUS.MERGED);

  const loadRepo = (id: string) => {
    setRepoInput(id);
    setRepoId(id);
  };

  return (
    <div className="app">
      <div className="header">
        <div className="brand">
          <div className="brand-row">
            <img className="logo" src="/logo.svg" alt="Arbor" width={34} height={34} />
            <h1>Arbor</h1>
          </div>
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
        <button className="btn" onClick={() => loadRepo(repoInput.trim())}>
          Load
        </button>
        <button className="btn ghost" onClick={() => loadRepo(PENDING_REPO)}>
          Review demo
        </button>
      </div>

      {openMrs.length > 0 && (
        <section className="panel mr-panel">
          <h2>Merge requests</h2>
          {openMrs.map((mr) => {
            const isProposer = account?.address === mr.proposer;
            const ready = mr.status === MR_STATUS.READY;
            return (
              <div className="mr-row" key={mr.id}>
                <div className="mr-info">
                  <span className={`tag-state ${ready ? 'ready' : 'pending'}`}>{ready ? 'ready' : 'pending'}</span>
                  <span className="chip">→ {mr.targetBranch}</span>
                  <span className="kv mono">
                    by {short(mr.proposer)} · {mr.approvals.length} approval{mr.approvals.length === 1 ? '' : 's'}
                  </span>
                </div>
                <div className="mr-actions">
                  <button className="btn ghost" onClick={() => togglePick(mr.mergedNode)}>
                    Review result
                  </button>
                  {!ready ? (
                    <button
                      className="btn"
                      disabled={!account || isProposer || busy === mr.id}
                      onClick={() => act(mr.id, buildApproveTx(repoId, mr.id))}
                    >
                      {busy === mr.id ? '…' : 'Approve'}
                    </button>
                  ) : (
                    <button
                      className="btn"
                      disabled={!account || busy === mr.id}
                      onClick={() => act(mr.id, buildExecuteMergeTx(repoId, mr.id))}
                    >
                      {busy === mr.id ? '…' : 'Execute merge'}
                    </button>
                  )}
                </div>
                {!ready && !account && <div className="hint">connect a wallet to approve</div>}
                {!ready && isProposer && (
                  <div className="hint">proposer can't self-approve — connect a different writer</div>
                )}
              </div>
            );
          })}
          {actionErr && <div className="err">{actionErr}</div>}
        </section>
      )}

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
            <div className="empty">Click a node to view its content. Pick two to diff them.</div>
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
      <span className="kv mono">
        {identical ? 'content-addressed dedup' : `${short(a.node.id)} vs ${short(b.node.id)}`}
      </span>
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
      <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(text) }} />
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
