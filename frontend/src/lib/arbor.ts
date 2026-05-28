// Arbor read layer for the viewer UI. Reads run against a standalone testnet
// client (no wallet needed); writes (approve/execute) return a Transaction for
// the connected wallet to sign.
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { blobIdFromInt } from '@mysten/walrus';
import { downloadBlob } from './walrusClient';

export const PACKAGE_ID =
  '0x15e07f9fbdf36c730ffaed1fd8c39f12b46cfb38c5ccc3a48b599bc73041cf30';
// Multi-agent DeFi risk review produced by real Gemini agents with real MemWal
// working memory (Scenario A).
export const DEMO_REPO =
  '0x56776e06ae8a0fa7dd046d11e3a4538192084422846d2eda68832a98656bba25';
// A repo left with a pending merge request, to exercise the approve / execute flow.
export const PENDING_REPO =
  '0x63cb18e2af9e4c29aea917023996b04622f0da59effa6f70fe00c053530637ab';

export const MR_STATUS = { PENDING: 0, READY: 1, MERGED: 2 } as const;

export const readClient = new SuiJsonRpcClient({
  url: getJsonRpcFullnodeUrl('testnet'),
  network: 'testnet',
});

export type EntryKind = 'create' | 'commit' | 'fork' | 'propose' | 'merge';

export interface TimelineEntry {
  kind: EntryKind;
  timestampMs: number | null;
  txDigest: string;
  nodeId?: string;
  branch?: string;
  source?: string;
  creator?: string;
  parents: string[];
  mergeRequestId?: string;
}

export interface NodeView {
  id: string;
  blobId: bigint;
  parents: string[];
  creator: string;
  kind: string;
  message: string;
  createdAtMs: number;
}

export async function readTimeline(repoId: string): Promise<TimelineEntry[]> {
  const out: TimelineEntry[] = [];
  // Descending so a freshly-created repo's events are always in the newest page
  // (ascending returns the oldest events and truncates recent repos as the
  // package's event log grows).
  for (const module of ['repository', 'merge']) {
    const page = await readClient.queryEvents({
      query: { MoveModule: { package: PACKAGE_ID, module } },
      order: 'descending',
      limit: 1000,
    });
    for (const e of page.data) {
      const d = (e.parsedJson ?? {}) as Record<string, any>;
      if (d.repo_id !== repoId && d.repo !== repoId) continue;
      const base = {
        timestampMs: e.timestampMs ? Number(e.timestampMs) : null,
        txDigest: e.id.txDigest,
        parents: [] as string[],
      };
      if (e.type.endsWith('::RepositoryCreated')) {
        out.push({ ...base, kind: 'create', nodeId: d.root_node, branch: 'main', creator: d.owner });
      } else if (e.type.endsWith('::Committed')) {
        out.push({ ...base, kind: 'commit', nodeId: d.node_id, branch: d.branch, creator: d.creator, parents: d.parent ? [d.parent] : [] });
      } else if (e.type.endsWith('::BranchForked')) {
        out.push({ ...base, kind: 'fork', branch: d.new_branch, source: d.source, nodeId: d.tip });
      } else if (e.type.endsWith('::MergeProposed')) {
        out.push({ ...base, kind: 'propose', nodeId: d.merged_node, branch: d.target_branch, creator: d.proposer, mergeRequestId: d.mr_id });
      } else if (e.type.endsWith('::MergeExecuted')) {
        out.push({ ...base, kind: 'merge', nodeId: d.node_id, branch: d.target_branch, mergeRequestId: d.mr_id });
      }
    }
  }
  out.sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));
  return out;
}

export async function readNode(nodeId: string): Promise<NodeView> {
  const obj = await readClient.getObject({ id: nodeId, options: { showContent: true } });
  const content = obj.data?.content;
  if (!content || content.dataType !== 'moveObject') {
    throw new Error(`node ${nodeId} not found`);
  }
  const f = content.fields as Record<string, any>;
  return {
    id: nodeId,
    blobId: BigInt(f.blob_id),
    parents: (f.parents ?? []) as string[],
    creator: f.creator as string,
    kind: f.kind as string,
    message: f.message as string,
    createdAtMs: Number(f.created_at_ms),
  };
}

export async function readNodeText(nodeId: string): Promise<{ node: NodeView; text: string }> {
  const node = await readNode(nodeId);
  const id = blobIdFromInt(node.blobId);
  // Freshly published blobs can take a moment to propagate to the aggregator.
  let lastErr: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const bytes = await downloadBlob(id);
      return { node, text: new TextDecoder().decode(bytes) };
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 1500));
    }
  }
  throw lastErr;
}

export interface MergeRequestView {
  id: string;
  targetBranch: string;
  mergedNode: string;
  proposer: string;
  status: number; // 0 pending, 1 ready, 2 merged
  approvals: string[];
  createdAtMs: number;
}

export async function readMergeRequests(repoId: string): Promise<MergeRequestView[]> {
  const page = await readClient.queryEvents({
    query: { MoveModule: { package: PACKAGE_ID, module: 'merge' } },
    order: 'descending',
    limit: 200,
  });
  const ids = new Set<string>();
  for (const e of page.data) {
    if (!e.type.endsWith('::MergeProposed')) continue;
    const d = (e.parsedJson ?? {}) as Record<string, any>;
    if (d.repo === repoId && d.mr_id) ids.add(d.mr_id as string);
  }
  const out: MergeRequestView[] = [];
  for (const id of ids) {
    const obj = await readClient.getObject({ id, options: { showContent: true } });
    const c = obj.data?.content;
    if (!c || c.dataType !== 'moveObject') continue;
    const f = c.fields as Record<string, any>;
    const approvals = (f.approvals?.fields?.contents ?? f.approvals?.contents ?? []) as string[];
    out.push({
      id,
      targetBranch: f.target_branch as string,
      mergedNode: f.merged_node as string,
      proposer: f.proposer as string,
      status: Number(f.status),
      approvals,
      createdAtMs: Number(f.created_at_ms),
    });
  }
  out.sort((a, b) => a.createdAtMs - b.createdAtMs);
  return out;
}

export function buildApproveTx(repoId: string, mergeRequestId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::merge::approve`,
    arguments: [tx.object(repoId), tx.object(mergeRequestId)],
  });
  return tx;
}

export function buildExecuteMergeTx(repoId: string, mergeRequestId: string): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::merge::execute_merge`,
    arguments: [tx.object(repoId), tx.object(mergeRequestId)],
  });
  return tx;
}
