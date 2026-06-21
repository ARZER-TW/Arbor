// Arbor read layer for the viewer UI. Reads run against a standalone testnet
// client (no wallet needed); writes (approve/execute) return a Transaction for
// the connected wallet to sign.
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { blobIdFromInt, blobIdToInt } from '@mysten/walrus';
import { downloadBlob, uploadBlob } from './walrusClient';

const SUI_CLOCK = '0x6';

export const PACKAGE_ID =
  '0x15e07f9fbdf36c730ffaed1fd8c39f12b46cfb38c5ccc3a48b599bc73041cf30';
// Multi-agent DeFi risk review (Hunter / Analyst / Reporter, each its own keypair).
// Content is deterministic and durably stored on Walrus (permanent blobs), so the
// dashboard's real "Verify provenance" can re-fetch every artifact and confirm it.
export const DEMO_REPO =
  '0xf527f982266028d9f9d36c0a0d553b1e353abd8fd857b57fcc6fcf8d5ec8fc1e';
// A repo left with a pending merge request, to exercise the approve / execute flow.
export const PENDING_REPO =
  '0xaa58e63c0e41be61c33d7ebc35d7ba402479c47d737d3420d10102734d235c4b';

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

export interface RepoPolicy {
  name: string;
  owner: string;
  root: string;
  writers: string[];
  approvalThreshold: number;
  publicRead: boolean;
  branchCount: number;
}

export async function readRepoPolicy(repoId: string): Promise<RepoPolicy> {
  const obj = await readClient.getObject({ id: repoId, options: { showContent: true } });
  const c = obj.data?.content;
  if (!c || c.dataType !== 'moveObject') throw new Error(`repository ${repoId} not found`);
  const f = c.fields as Record<string, any>;
  const access = f.access?.fields ?? {};
  const writers = (access.writers?.fields?.contents ?? access.writers?.contents ?? []) as string[];
  return {
    name: String(f.name ?? ''),
    owner: String(f.owner ?? ''),
    root: String(f.root ?? ''),
    writers,
    approvalThreshold: Number(f.merge?.fields?.approval_threshold ?? 1),
    publicRead: Boolean(access.public_read ?? true),
    branchCount: Number(f.branches?.fields?.size ?? 0),
  };
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

// === write path (wallet-signed): a human can create their own repo + commit ===

export interface CreateRepoInput {
  name: string;
  rootBlobId: bigint; // 0n when the root has no content blob
  rootKind: string;
  rootMessage: string;
  publicRead: boolean;
  writers: string[];
  approvalThreshold: bigint;
}

export function buildCreateRepositoryTx(input: CreateRepoInput): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::repository::create_repository`,
    arguments: [
      tx.pure.string(input.name),
      tx.pure.u256(input.rootBlobId),
      tx.pure.string(input.rootKind),
      tx.pure.string(input.rootMessage),
      tx.pure.bool(input.publicRead),
      tx.pure.vector('address', input.writers),
      tx.pure.u64(input.approvalThreshold),
      tx.object(SUI_CLOCK),
    ],
  });
  return tx;
}

export interface CommitInput {
  repoId: string;
  branch: string;
  blobId: bigint;
  kind: string;
  message: string;
}

export function buildCommitTx(input: CommitInput): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${PACKAGE_ID}::repository::commit`,
    arguments: [
      tx.object(input.repoId),
      tx.pure.string(input.branch),
      tx.pure.u256(input.blobId),
      tx.pure.string(input.kind),
      tx.pure.string(input.message),
      tx.pure.option('u256', null),
      tx.object(SUI_CLOCK),
    ],
  });
  return tx;
}

// Upload text content to Walrus (permanent) and return the u256 blob id used on-chain.
export async function uploadContent(
  text: string,
): Promise<{ blobIdInt: bigint; blobId: string; size: number }> {
  const res = await uploadBlob(new TextEncoder().encode(text), { epochs: 30, permanent: true });
  return { blobIdInt: blobIdToInt(res.blobId), blobId: res.blobId, size: res.size };
}

// Pull the new repository object id out of a create-repository transaction.
export async function repoIdFromTx(digest: string): Promise<string | null> {
  const tx = await readClient.getTransactionBlock({ digest, options: { showEvents: true } });
  const ev = (tx.events ?? []).find((e) => e.type.endsWith('::RepositoryCreated'));
  const d = (ev?.parsedJson ?? {}) as Record<string, unknown>;
  return (d.repo_id as string) ?? null;
}

// Pull the new node id out of a commit transaction (to select it after committing).
export async function nodeIdFromTx(digest: string): Promise<string | null> {
  const tx = await readClient.getTransactionBlock({ digest, options: { showEvents: true } });
  const ev = (tx.events ?? []).find((e) => e.type.endsWith('::Committed'));
  const d = (ev?.parsedJson ?? {}) as Record<string, unknown>;
  return (d.node_id as string) ?? null;
}
