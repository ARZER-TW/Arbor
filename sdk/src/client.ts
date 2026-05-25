import {
  SuiJsonRpcClient,
  getJsonRpcFullnodeUrl,
} from '@mysten/sui/jsonRpc';
import type { SuiTransactionBlockResponse } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';
import { bcs } from '@mysten/sui/bcs';
import { SUI_CLOCK_OBJECT_ID } from '@mysten/sui/utils';
import type { Signer } from '@mysten/sui/cryptography';
import { HttpWalrusStore } from './walrus.js';
import type { WalrusStore, WriteOptions } from './walrus.js';

export type Network = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

const REPO_MODULE = 'repository';
const MERGE_MODULE = 'merge';

const ZERO_ADDRESS =
  '0x0000000000000000000000000000000000000000000000000000000000000000';

export interface ArborClientOptions {
  network: Network;
  packageId: string;
  /** Provide a pre-built client (e.g. dapp-kit's) instead of constructing one. */
  client?: SuiJsonRpcClient;
  /** Storage backend for artifact content. Defaults to the public HTTP gateway. */
  walrus?: WalrusStore;
}

export interface CreateRepositoryArgs {
  name: string;
  /** Walrus blob id of the initial root artifact content. */
  rootBlobId: bigint;
  rootKind: string;
  rootMessage: string;
  publicRead: boolean;
  /** Addresses allowed to write/merge. The creator is always added. */
  writers: string[];
  /** Distinct approvals required to merge. 0 = auto-merge. */
  approvalThreshold: bigint;
}

export interface ForkArgs {
  repoId: string;
  source: string;
  newBranch: string;
}

export interface CommitArgs {
  repoId: string;
  branch: string;
  blobId: bigint;
  kind: string;
  message: string;
  metadataBlobId?: bigint | null;
}

export interface ProposeMergeArgs {
  repoId: string;
  targetBranch: string;
  /** Walrus blob id of the pre-computed merged content. */
  mergedBlobId: bigint;
  /** ArtifactNode ids being merged (multi-parent). */
  parents: string[];
  kind: string;
  message: string;
  metadataBlobId?: bigint | null;
}

export interface MergeRequestRef {
  repoId: string;
  mergeRequestId: string;
}

export interface TimelineEvent {
  type: string;
  timestampMs: number | null;
  txDigest: string;
  data: Record<string, unknown>;
}

export interface CommitContentArgs {
  repoId: string;
  branch: string;
  content: Uint8Array | string;
  kind: string;
  message: string;
  metadata?: Uint8Array | string | null;
  write?: WriteOptions;
}

export interface ArtifactNodeView {
  id: string;
  repo: string;
  blobId: bigint;
  parents: string[];
  creator: string;
  createdAtMs: number;
  kind: string;
  message: string;
  metadataBlobId: bigint | null;
}

export interface NodeDiffSide {
  nodeId: string;
  blobId: bigint;
  content: Uint8Array;
  text: string;
}

export interface NodeDiff {
  a: NodeDiffSide;
  b: NodeDiffSide;
  /** True when both nodes reference the same Walrus blob (content-addressed). */
  identical: boolean;
}

/**
 * ArborClient — typed wrapper over the Arbor Move package.
 *
 * Each operation has a `*Tx` builder (returns a `Transaction` for a wallet to
 * sign) and an `async` executor that signs + executes with a `Signer` and
 * returns the relevant ids parsed from emitted events.
 */
export class ArborClient {
  readonly client: SuiJsonRpcClient;
  readonly packageId: string;
  readonly walrus: WalrusStore;

  constructor(opts: ArborClientOptions) {
    this.client =
      opts.client ??
      new SuiJsonRpcClient({
        url: getJsonRpcFullnodeUrl(opts.network),
        network: opts.network,
      });
    this.packageId = opts.packageId;
    this.walrus = opts.walrus ?? new HttpWalrusStore();
  }

  private target(module: string, fn: string): `${string}::${string}::${string}` {
    return `${this.packageId}::${module}::${fn}`;
  }

  // === PTB builders (no signer; usable by dapp-kit wallets) ===

  createRepositoryTx(args: CreateRepositoryArgs): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target(REPO_MODULE, 'create_repository'),
      arguments: [
        tx.pure.string(args.name),
        tx.pure.u256(args.rootBlobId),
        tx.pure.string(args.rootKind),
        tx.pure.string(args.rootMessage),
        tx.pure.bool(args.publicRead),
        tx.pure.vector('address', args.writers),
        tx.pure.u64(args.approvalThreshold),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  forkTx(args: ForkArgs): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target(REPO_MODULE, 'fork_branch'),
      arguments: [
        tx.object(args.repoId),
        tx.pure.string(args.source),
        tx.pure.string(args.newBranch),
      ],
    });
    return tx;
  }

  commitTx(args: CommitArgs): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target(REPO_MODULE, 'commit'),
      arguments: [
        tx.object(args.repoId),
        tx.pure.string(args.branch),
        tx.pure.u256(args.blobId),
        tx.pure.string(args.kind),
        tx.pure.string(args.message),
        tx.pure.option('u256', args.metadataBlobId ?? null),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  proposeMergeTx(args: ProposeMergeArgs): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target(MERGE_MODULE, 'propose_merge'),
      arguments: [
        tx.object(args.repoId),
        tx.pure.string(args.targetBranch),
        tx.pure.u256(args.mergedBlobId),
        tx.pure.vector('id', args.parents),
        tx.pure.string(args.kind),
        tx.pure.string(args.message),
        tx.pure.option('u256', args.metadataBlobId ?? null),
        tx.object(SUI_CLOCK_OBJECT_ID),
      ],
    });
    return tx;
  }

  approveTx(ref: MergeRequestRef): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target(MERGE_MODULE, 'approve'),
      arguments: [tx.object(ref.repoId), tx.object(ref.mergeRequestId)],
    });
    return tx;
  }

  executeMergeTx(ref: MergeRequestRef): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target(MERGE_MODULE, 'execute_merge'),
      arguments: [tx.object(ref.repoId), tx.object(ref.mergeRequestId)],
    });
    return tx;
  }

  // === executors (backend / agents with a Signer) ===

  async createRepository(args: CreateRepositoryArgs, signer: Signer) {
    const resp = await this.run(this.createRepositoryTx(args), signer);
    const ev = eventJson(resp, '::repository::RepositoryCreated');
    return {
      digest: resp.digest,
      repoId: ev?.repo_id as string,
      rootNode: ev?.root_node as string,
    };
  }

  async fork(args: ForkArgs, signer: Signer) {
    const resp = await this.run(this.forkTx(args), signer);
    const ev = eventJson(resp, '::repository::BranchForked');
    return { digest: resp.digest, tip: ev?.tip as string };
  }

  async commit(args: CommitArgs, signer: Signer) {
    const resp = await this.run(this.commitTx(args), signer);
    const ev = eventJson(resp, '::repository::Committed');
    return { digest: resp.digest, nodeId: ev?.node_id as string };
  }

  async proposeMerge(args: ProposeMergeArgs, signer: Signer) {
    const resp = await this.run(this.proposeMergeTx(args), signer);
    const ev = eventJson(resp, '::merge::MergeProposed');
    return {
      digest: resp.digest,
      mergeRequestId: ev?.mr_id as string,
      mergedNode: ev?.merged_node as string,
    };
  }

  async approve(ref: MergeRequestRef, signer: Signer) {
    const resp = await this.run(this.approveTx(ref), signer);
    const ev = eventJson(resp, '::merge::MergeApproved');
    return {
      digest: resp.digest,
      status: Number(ev?.status ?? 0),
      approvals: Number(ev?.approvals ?? 0),
    };
  }

  async executeMerge(ref: MergeRequestRef, signer: Signer) {
    const resp = await this.run(this.executeMergeTx(ref), signer);
    const ev = eventJson(resp, '::merge::MergeExecuted');
    return { digest: resp.digest, nodeId: ev?.node_id as string };
  }

  // === reads ===

  /** Current tip ArtifactNode id of a branch, via devInspect of `branch_tip`. */
  async getBranchTip(repoId: string, branch: string): Promise<string> {
    const tx = new Transaction();
    tx.moveCall({
      target: this.target(REPO_MODULE, 'branch_tip'),
      arguments: [tx.object(repoId), tx.pure.string(branch)],
    });
    const res = await this.client.devInspectTransactionBlock({
      transactionBlock: tx,
      sender: ZERO_ADDRESS,
    });
    const rv = res.results?.[0]?.returnValues?.[0];
    if (!rv) throw new Error(`branch_tip("${branch}") returned no value`);
    return bcs.Address.parse(new Uint8Array(rv[0]));
  }

  /**
   * Repository timeline: commit / fork / merge events, oldest first. The DAG is
   * reconstructed by the consumer from each node's parents; this returns the
   * raw provenance events filtered to one repository.
   */
  async getTimeline(repoId: string): Promise<TimelineEvent[]> {
    const out: TimelineEvent[] = [];
    for (const module of [REPO_MODULE, MERGE_MODULE]) {
      const page = await this.client.queryEvents({
        query: { MoveModule: { package: this.packageId, module } },
        order: 'ascending',
        limit: 200,
      });
      for (const e of page.data) {
        const data = (e.parsedJson ?? {}) as Record<string, unknown>;
        if (data.repo_id === repoId || data.repo === repoId) {
          out.push({
            type: e.type,
            timestampMs: e.timestampMs ? Number(e.timestampMs) : null,
            txDigest: e.id.txDigest,
            data,
          });
        }
      }
    }
    out.sort((a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0));
    return out;
  }

  // === content (Walrus) ===

  /** Read a frozen ArtifactNode's on-chain fields. */
  async getNode(nodeId: string): Promise<ArtifactNodeView> {
    const obj = await this.client.getObject({
      id: nodeId,
      options: { showContent: true },
    });
    const content = obj.data?.content;
    if (!content || content.dataType !== 'moveObject') {
      throw new Error(`node ${nodeId} not found or not a Move object`);
    }
    const f = content.fields as Record<string, any>;
    return {
      id: nodeId,
      repo: f.repo as string,
      blobId: BigInt(f.blob_id),
      parents: (f.parents ?? []) as string[],
      creator: f.creator as string,
      createdAtMs: Number(f.created_at_ms),
      kind: f.kind as string,
      message: f.message as string,
      metadataBlobId: parseOptionU256(f.metadata_blob_id),
    };
  }

  /** Upload content to Walrus, then commit the resulting blob id onto `branch`. */
  async commitContent(args: CommitContentArgs, signer: Signer) {
    const blobId = await this.walrus.write(toBytes(args.content), args.write);
    let metadataBlobId: bigint | null = null;
    if (args.metadata != null) {
      metadataBlobId = await this.walrus.write(toBytes(args.metadata), args.write);
    }
    const res = await this.commit(
      {
        repoId: args.repoId,
        branch: args.branch,
        blobId,
        kind: args.kind,
        message: args.message,
        metadataBlobId,
      },
      signer,
    );
    return { ...res, blobId };
  }

  /** Fetch the Walrus content referenced by a node. */
  async readNodeContent(nodeId: string): Promise<Uint8Array> {
    const node = await this.getNode(nodeId);
    return this.walrus.read(node.blobId);
  }

  /** Compare two artifact nodes by content. `identical` uses content-addressing. */
  async diff(aId: string, bId: string): Promise<NodeDiff> {
    const [a, b] = await Promise.all([this.diffSide(aId), this.diffSide(bId)]);
    return { a, b, identical: a.blobId === b.blobId };
  }

  private async diffSide(nodeId: string): Promise<NodeDiffSide> {
    const node = await this.getNode(nodeId);
    const content = await this.walrus.read(node.blobId);
    return {
      nodeId,
      blobId: node.blobId,
      content,
      text: new TextDecoder().decode(content),
    };
  }

  private run(tx: Transaction, signer: Signer): Promise<SuiTransactionBlockResponse> {
    return this.client.signAndExecuteTransaction({
      transaction: tx,
      signer,
      options: { showEffects: true, showEvents: true, showObjectChanges: true },
    });
  }
}

function eventJson(
  resp: SuiTransactionBlockResponse,
  typeSuffix: string,
): Record<string, any> | undefined {
  const e = resp.events?.find((ev) => ev.type.endsWith(typeSuffix));
  return e?.parsedJson as Record<string, any> | undefined;
}

function toBytes(content: Uint8Array | string): Uint8Array {
  return typeof content === 'string' ? new TextEncoder().encode(content) : content;
}

/** Parse a Move `Option<u256>` from parsed object content (value, {vec:[...]}, or null). */
function parseOptionU256(v: unknown): bigint | null {
  if (v == null) return null;
  if (typeof v === 'object' && Array.isArray((v as { vec?: unknown[] }).vec)) {
    const vec = (v as { vec: unknown[] }).vec;
    return vec.length > 0 ? BigInt(vec[0] as string) : null;
  }
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint') {
    return BigInt(v);
  }
  return null;
}
