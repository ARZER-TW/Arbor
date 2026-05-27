// Arbor read layer for the viewer UI. Reads run against a standalone testnet
// client (no wallet needed); writes (approve/execute) return a Transaction for
// the connected wallet to sign.
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { blobIdFromInt } from '@mysten/walrus';
import { downloadBlob } from './walrusClient';

export const PACKAGE_ID =
  '0x15e07f9fbdf36c730ffaed1fd8c39f12b46cfb38c5ccc3a48b599bc73041cf30';
export const DEMO_REPO =
  '0x0ee348ef290038d45424cb4921cd84acb14080c3ddb4d8f9701ecd518bfb5808';

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
  for (const module of ['repository', 'merge']) {
    const page = await readClient.queryEvents({
      query: { MoveModule: { package: PACKAGE_ID, module } },
      order: 'ascending',
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
