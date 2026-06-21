import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig,
  useCurrentAccount,
  useSignAndExecuteTransaction,
} from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';
import './styles.css';
import {
  DEMO_REPO,
  PENDING_REPO,
  buildApproveTx,
  buildCommitTx,
  buildCreateRepositoryTx,
  buildExecuteMergeTx,
  nodeIdFromTx,
  readClient,
  repoIdFromTx,
  uploadContent,
} from './lib/arbor';
import {
  buildRepoModel,
  type Commit,
  type RepoModel,
} from './lib/model';
import { verifyArtifact, verifyAll, type VerifyStep, type VerifyResult } from './lib/verify';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { ProvenanceGraph } from './components/ProvenanceGraph';
import { DetailPanel } from './components/DetailPanel';
import { LineageView } from './components/LineageView';
import { AgentsView } from './components/AgentsView';
import { AnchorsView } from './components/AnchorsView';
import { KeysView } from './components/KeysView';
import { CommandPalette, type CommandResult } from './components/CommandPalette';
import { ComposeModal } from './components/ComposeModal';
import { HowItWorks } from './components/HowItWorks';
import { ConnectGate } from './components/ConnectGate';
import type { NavId, ViewMode } from './components/nav';

const queryClient = new QueryClient();
const { networkConfig } = createNetworkConfig({
  testnet: { url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' },
  mainnet: { url: 'https://fullnode.mainnet.sui.io:443', network: 'mainnet' },
});

function headFor(nav: NavId, view: ViewMode, model: RepoModel | null): [string, string] {
  const n = model?.commits.length ?? 0;
  const agents = model?.agentList.length ?? 0;
  switch (nav) {
    case 'lineage':
      return ['Lineage', 'branch topology · click a node to trace its chain → root'];
    case 'agents':
      return ['Agents', `${agents} producer${agents === 1 ? '' : 's'} · keypair-signed · on-chain access policy`];
    case 'anchors':
      return ['Anchors', 'on-chain notarization · Walrus blob → Sui object'];
    case 'keys':
      return ['Keys', 'ed25519 signing keys · rotation & revocation'];
    default:
      return [
        view === 'graph' ? 'Provenance graph' : view === 'list' ? 'Artifacts' : 'arbor log',
        `${n} artifact${n === 1 ? '' : 's'} · newest first`,
      ];
  }
}

function Dashboard() {
  const account = useCurrentAccount();
  const { mutateAsync: signAndExecute } = useSignAndExecuteTransaction();

  const [repoId, setRepoId] = useState(DEMO_REPO);
  const [model, setModel] = useState<RepoModel | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [activeNav, setActiveNav] = useState<NavId>('artifacts');
  const [view, setView] = useState<ViewMode>('graph');
  const [activeBranch, setActiveBranch] = useState('main');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [cmdOpen, setCmdOpen] = useState(false);

  const [verifyResults, setVerifyResults] = useState<Record<string, VerifyResult>>({});
  const [verifySteps, setVerifySteps] = useState<VerifyStep[]>([]);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [verifyingAll, setVerifyingAll] = useState(false);
  const [verifyAllResult, setVerifyAllResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);

  const [composeOpen, setComposeOpen] = useState(false);
  const [howOpen, setHowOpen] = useState(false);
  const [writeBusy, setWriteBusy] = useState(false);
  const [writeErr, setWriteErr] = useState<string | null>(null);

  const load = useCallback(async (id: string, keepSelection?: string | null) => {
    setLoading(true);
    setError(null);
    try {
      const m = await buildRepoModel(id);
      setModel(m);
      setActiveBranch((b) => (m.branches.some((x) => x.name === b) ? b : 'main'));
      setSelectedId((prev) => {
        const keep = keepSelection ?? prev;
        if (keep && m.byId[keep]) return keep;
        const pending = m.commits.find((c) => c.status === 'pending');
        return pending?.id ?? m.commits[0]?.id ?? null;
      });
    } catch (e) {
      console.error(e);
      setError("Couldn't reach Sui testnet.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setVerifyResults({});
    setVerifyAllResult(null);
    setActionErr(null);
    void load(repoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCmdOpen((o) => !o);
      }
      if (e.key === 'Escape') setCmdOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const statusFor = useCallback((c: Commit) => c.status, []);

  const selected = selectedId && model ? model.byId[selectedId] ?? null : null;

  const runVerify = useCallback(
    async (commit: Commit) => {
      if (!model) return;
      setVerifyingId(commit.id);
      setVerifySteps([]);
      try {
        const res = await verifyArtifact(commit, model, setVerifySteps);
        setVerifyResults((p) => ({ ...p, [commit.id]: res }));
      } catch (e) {
        console.error(e);
      } finally {
        setVerifyingId(null);
      }
    },
    [model],
  );

  const onVerifyAll = useCallback(async () => {
    if (!model) return;
    setVerifyingAll(true);
    try {
      const r = await verifyAll(model, () => {});
      setVerifyAllResult(`${r.verified}/${r.total} on-chain · ${r.walrusLive} live on Walrus`);
    } catch (e) {
      console.error(e);
    } finally {
      setVerifyingAll(false);
    }
  }, [model]);

  const act = useCallback(
    async (build: () => ReturnType<typeof buildApproveTx>) => {
      if (!model?.openMr) return;
      setBusy(true);
      setActionErr(null);
      try {
        const tx = build();
        const res = await signAndExecute({ transaction: tx });
        await readClient.waitForTransaction({ digest: res.digest });
        await load(repoId, selectedId);
      } catch (e) {
        setActionErr(String(e));
      } finally {
        setBusy(false);
      }
    },
    [model, signAndExecute, load, repoId, selectedId],
  );

  const onApprove = useCallback(() => {
    if (model?.openMr) void act(() => buildApproveTx(repoId, model.openMr!.id));
  }, [act, model, repoId]);
  const onExecuteMerge = useCallback(() => {
    if (model?.openMr) void act(() => buildExecuteMergeTx(repoId, model.openMr!.id));
  }, [act, model, repoId]);

  const onCreate = useCallback(
    async (name: string, content: string, message: string) => {
      if (!account) return;
      setWriteBusy(true);
      setWriteErr(null);
      try {
        let rootBlobId = 0n;
        if (content.trim()) rootBlobId = (await uploadContent(content)).blobIdInt;
        const tx = buildCreateRepositoryTx({
          name,
          rootBlobId,
          rootKind: 'report',
          rootMessage: message,
          publicRead: true,
          writers: [account.address],
          approvalThreshold: 1n,
        });
        const res = await signAndExecute({ transaction: tx });
        await readClient.waitForTransaction({ digest: res.digest });
        const newId = await repoIdFromTx(res.digest);
        if (newId) {
          setComposeOpen(false);
          setRepoId(newId);
        } else {
          // Tx committed but the id couldn't be resolved — surface the digest
          // rather than silently bouncing back to the previously-viewed repo.
          setWriteErr(`Repository created in tx ${res.digest}, but its id could not be resolved.`);
        }
      } catch (e) {
        setWriteErr(String(e));
      } finally {
        setWriteBusy(false);
      }
    },
    [account, signAndExecute, repoId],
  );

  const onCommitArtifact = useCallback(
    async (branch: string, content: string, message: string) => {
      if (!account) return;
      if (!content.trim()) {
        setWriteErr('A commit needs artifact content.');
        return;
      }
      setWriteBusy(true);
      setWriteErr(null);
      try {
        const blobId = (await uploadContent(content)).blobIdInt;
        const tx = buildCommitTx({ repoId, branch, blobId, kind: 'report', message });
        const res = await signAndExecute({ transaction: tx });
        await readClient.waitForTransaction({ digest: res.digest });
        const newNode = await nodeIdFromTx(res.digest);
        setComposeOpen(false);
        setActiveNav('artifacts');
        await load(repoId, newNode ?? selectedId);
      } catch (e) {
        setWriteErr(String(e));
      } finally {
        setWriteBusy(false);
      }
    },
    [account, signAndExecute, load, repoId, selectedId],
  );

  const jumpToArtifact = useCallback((id: string) => {
    setActiveNav('artifacts');
    setSelectedId(id);
  }, []);

  const onCmd = useCallback(
    (r: CommandResult) => {
      setCmdOpen(false);
      if (r.kind === 'artifact') jumpToArtifact(r.id);
      else if (r.id === 'verify-all') void onVerifyAll();
      else if (r.id === 'goto-merge' && model?.openMr) jumpToArtifact(model.openMr.mergedNode);
    },
    [jumpToArtifact, onVerifyAll, model],
  );

  const toggleRepo = useCallback(() => {
    setRepoId((r) => (r === DEMO_REPO ? PENDING_REPO : DEMO_REPO));
  }, []);

  const [headTitle, headSub] = useMemo(
    () => headFor(activeNav, view, model),
    [activeNav, view, model],
  );
  const showDetail = activeNav === 'artifacts';

  const writers = model?.writers ?? [];
  const canAct = !!account && writers.includes(account.address);
  const isProposer = !!account && !!selected?.proposer && account.address === selected.proposer;

  return (
    <div className="app">
      <Sidebar
        model={model}
        activeNav={activeNav}
        setActiveNav={setActiveNav}
        activeBranch={activeBranch}
        setActiveBranch={setActiveBranch}
        onToggleRepo={toggleRepo}
      />
      <div className="main">
        <TopBar
          model={model}
          nav={activeNav}
          view={view}
          setView={setView}
          onCommand={() => setCmdOpen(true)}
          onVerifyAll={onVerifyAll}
          verifying={verifyingAll}
          onCompose={() => {
            setWriteErr(null);
            setComposeOpen(true);
          }}
          onHow={() => setHowOpen(true)}
        />
        <div className="work">
          <div className={`canvas ${showDetail ? '' : 'full'}`}>
            <div className="canvas-head">
              <span className="ch-title">{headTitle}</span>
              <span className="ch-sub">
                {headSub}
                {verifyAllResult ? ` · ${verifyAllResult}` : ''}
              </span>
            </div>
            <div className="canvas-scroll">
              {loading && <div className="view-msg">loading provenance from Sui…</div>}
              {error && (
                <div className="view-msg err">
                  {error}
                  <div style={{ marginTop: 12 }}>
                    <button
                      className="btn btn-secondary btn-sm"
                      onClick={() => void load(repoId, selectedId)}
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}
              {!loading && !error && model && model.commits.length === 0 && (
                <div className="view-msg">No Arbor events for this repository.</div>
              )}
              {!loading && !error && model && model.commits.length > 0 && (
                <>
                  {activeNav === 'artifacts' && (
                    <ProvenanceGraph
                      model={model}
                      view={view}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      statusFor={statusFor}
                    />
                  )}
                  {activeNav === 'lineage' && (
                    <LineageView
                      model={model}
                      selectedId={selectedId}
                      onSelect={setSelectedId}
                      statusFor={statusFor}
                    />
                  )}
                  {activeNav === 'agents' && <AgentsView model={model} onSelect={jumpToArtifact} />}
                  {activeNav === 'anchors' && (
                    <AnchorsView
                      model={model}
                      selectedId={selectedId}
                      onSelect={jumpToArtifact}
                      statusFor={statusFor}
                    />
                  )}
                  {activeNav === 'keys' && (
                    <KeysView model={model} account={account?.address ?? null} />
                  )}
                </>
              )}
            </div>
          </div>
          {showDetail && model && (
            <DetailPanel
              model={model}
              commit={selected}
              status={selected ? statusFor(selected) : null}
              verifyResult={selected ? verifyResults[selected.id] ?? null : null}
              verifySteps={
                verifyingId && selected && verifyingId === selected.id ? verifySteps : null
              }
              verifying={!!selected && verifyingId === selected.id}
              onVerify={runVerify}
              onApprove={onApprove}
              onExecuteMerge={onExecuteMerge}
              busy={busy}
              actionErr={actionErr}
              canAct={canAct}
              isProposer={isProposer}
            />
          )}
        </div>
      </div>
      <CommandPalette model={model} open={cmdOpen} onClose={() => setCmdOpen(false)} onSelect={onCmd} />
      <ComposeModal
        open={composeOpen}
        onClose={() => setComposeOpen(false)}
        account={account?.address ?? null}
        repoName={model?.repo ?? 'repository'}
        branches={model?.branches.map((b) => b.name) ?? ['main']}
        canCommit={canAct}
        busy={writeBusy}
        error={writeErr}
        onCreate={onCreate}
        onCommit={onCommitArtifact}
      />
      <HowItWorks open={howOpen} onClose={() => setHowOpen(false)} />
    </div>
  );
}

function Root() {
  const account = useCurrentAccount();
  const [guest, setGuest] = useState(false);
  if (!account && !guest) {
    return (
      <ConnectGate
        repoLabel="sui-overflow/defi-protocol-risk-review"
        onGuest={() => setGuest(true)}
      />
    );
  }
  return <Dashboard />;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <Root />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
