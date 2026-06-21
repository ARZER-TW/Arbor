// Arbor view-model. Maps the live read layer (lib/arbor.ts) into the shape the
// redesigned provenance dashboard renders: laid-out commits, DAG edges, branch
// lanes, and derived agents. Everything here is honest-equivalent to on-chain
// state — no placeholder strings:
//   - content hash  = the Walrus blob id (content address of the artifact)
//   - sui anchor    = the tx digest that notarized the node (links to Suiscan)
//   - producer/sig  = the Sui account that signed the commit
//   - allow-list    = the repository's on-chain AccessPolicy.writers
//   - k-of-n        = the repository's on-chain MergePolicy.approval_threshold
import { blobIdFromInt } from '@mysten/walrus';
import {
  PACKAGE_ID,
  readMergeRequests,
  readNode,
  readRepoPolicy,
  readTimeline,
  type EntryKind,
  type MergeRequestView,
  type RepoPolicy,
  type TimelineEntry,
} from './arbor';

export type CommitStatus = 'verified' | 'pending';

export interface Commit {
  id: string; // node object id
  row: number; // display order, 0 = newest (top)
  lane: number; // branch index → DAG lane
  parents: string[];
  event: EntryKind; // create | commit | fork | propose | merge
  merge: boolean;
  root: boolean;
  fork: boolean;
  branchPoint: boolean;
  name: string; // primary mono identifier (commit message)
  kind: string; // node kind → icon key
  label: string; // secondary descriptor line
  agentId: string; // creator address → key into the agents map
  status: CommitStatus;
  hash: string; // short content hash (Walrus blob id), or '—'
  blobId: string; // full Walrus blob id (base64url), '' for root
  blob: string; // walrus://<short>, or '—'
  txDigest: string; // sui anchor tx digest ('' if none)
  anchorShort: string; // short tx digest, or '' when awaiting
  sizeBytes: number | null; // filled lazily once the blob is fetched
  time: string; // relative ("4 min ago")
  timestampMs: number | null;
  branch: string;
  sig: string; // short signer address
  signer: string; // full signer address
  // merge governance (set only on an open merge request's result node)
  proposer?: string;
  mergeRequestId?: string;
  approvalsNeed?: number;
  approvers?: string[]; // eligible approver addresses (allow-list minus proposer)
  approvalsHave?: number;
}

export interface Edge {
  from: string; // child node id
  to: string; // parent node id
  lane: number; // lane to color the edge by (max of the two lanes)
}

export interface Branch {
  name: string;
  lane: number;
  status: CommitStatus;
  commits: number;
}

export interface Agent {
  id: string; // address (stable key)
  label: string; // display name (known map, else short address)
  initial: string;
  glyph: string; // role icon key (key-round = owner, cpu = agent)
  color: string; // lane CSS var
  tint: string; // avatar background
  fg: string; // avatar foreground
  key: string; // signer fingerprint (short address — honest equivalent)
  address: string;
  commits: number;
  status: 'active' | 'attesting';
  role: string;
  isOwner: boolean;
}

export interface RepoModel {
  repoId: string;
  org: string;
  repo: string;
  packageId: string;
  owner: string;
  writers: string[];
  approvalThreshold: number;
  publicRead: boolean;
  branchCount: number;
  commits: Commit[];
  byId: Record<string, Commit>;
  edges: Edge[];
  branches: Branch[];
  agents: Record<string, Agent>;
  agentList: Agent[];
  lanes: number[]; // x positions for the graph gutter
  laneColor: string[]; // lane → CSS var
  openMr: MergeRequestView | null;
  anchorShort: string; // newest anchor tx digest (header chip)
}

export const ROW = 56;

// ---- event coding (the one intentional multicolor deviation) ----------------
export const EVENT_COLOR: Record<EntryKind, string> = {
  create: 'var(--lane-4)', // purple
  commit: 'var(--accent)', // green
  fork: 'var(--info)', // blue
  propose: 'var(--pending)', // amber
  merge: 'var(--lane-6)', // teal
};
export const EVENT_ICON: Record<EntryKind, string> = {
  create: 'git-commit-horizontal',
  commit: 'git-commit-horizontal',
  fork: 'git-branch',
  propose: 'git-pull-request',
  merge: 'git-merge',
};
export const KIND_ICON: Record<string, string> = {
  model: 'box',
  report: 'file-text',
  analysis: 'file-text',
  log: 'terminal',
  checkpoint: 'package',
  config: 'sliders-horizontal',
  dataset: 'database',
  code: 'file-code-2',
};
export const kindIcon = (kind: string): string => KIND_ICON[kind] ?? 'file-text';

const LANE_VARS = [
  'var(--lane-1)',
  'var(--lane-2)',
  'var(--lane-3)',
  'var(--lane-4)',
  'var(--lane-5)',
  'var(--lane-6)',
];
const LANE_TINT = ['#14301c', '#11233b', '#2e2410', '#1f1430', '#2c1413', '#0c2e2a'];
const LANE_FG = ['#9be3a8', '#9ec8fb', '#e7c98a', '#c9a9f7', '#f2a8a2', '#8fe6da'];

// Optional address → human label/role. Fill in as real agent addresses become
// known; until then producers are derived from their address automatically.
export const KNOWN_AGENTS: Record<string, { name: string; role: string }> = {};

// ---- small formatters -------------------------------------------------------
export const shortAddr = (a?: string): string =>
  a ? `${a.slice(0, 6)}…${a.slice(-4)}` : '';
export const shortHash = (h?: string): string =>
  h ? `${h.slice(0, 8)}…${h.length > 12 ? h.slice(-4) : ''}` : '—';
export const shortDigest = (d?: string): string => (d ? `${d.slice(0, 8)}…` : '');

export const suiscanTxUrl = (digest: string): string =>
  `https://suiscan.xyz/testnet/tx/${digest}`;
export const walrusBlobUrl = (blobId: string): string =>
  `https://walruscan.com/testnet/blob/${blobId}`;
export const suiscanObjUrl = (id: string): string =>
  `https://suiscan.xyz/testnet/object/${id}`;
export const suiscanPkgUrl = (id: string): string =>
  `https://suiscan.xyz/testnet/object/${id}`;

export function timeAgo(ms: number | null, nowMs: number): string {
  if (!ms) return '—';
  const s = Math.max(0, Math.round((nowMs - ms) / 1000));
  if (s < 45) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

export function fmtSize(bytes: number | null): string {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(bytes < 10240 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const agentLabel = (addr: string): string => KNOWN_AGENTS[addr]?.name ?? shortAddr(addr);

// ---- ancestry (parents[0] chain → root) ------------------------------------
export function lineage(model: RepoModel, id: string): Commit[] {
  const out: Commit[] = [];
  let cur: Commit | undefined = model.byId[id];
  const seen = new Set<string>();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    out.push(cur);
    cur = cur.parents[0] ? model.byId[cur.parents[0]] : undefined;
  }
  return out; // newest → root
}

// ---- builder ----------------------------------------------------------------
export async function buildRepoModel(
  repoId: string,
  opts: { org?: string; nowMs?: number } = {},
): Promise<RepoModel> {
  const nowMs = opts.nowMs ?? Date.now();
  const [timeline, mrs, policy] = await Promise.all([
    readTimeline(repoId),
    readMergeRequests(repoId),
    readRepoPolicy(repoId).catch(() => null),
  ]);

  const pol: RepoPolicy = policy ?? {
    name: 'repository',
    owner: '',
    root: '',
    writers: [],
    approvalThreshold: 1,
    publicRead: true,
    branchCount: 0,
  };

  // De-duplicate timeline entries down to one per node, preferring the richest
  // (a node can surface as both a propose and a merge event).
  const eventRank: Record<EntryKind, number> = { create: 0, commit: 1, fork: 1, propose: 2, merge: 3 };
  const entryByNode = new Map<string, TimelineEntry>();
  for (const e of timeline) {
    if (!e.nodeId) continue;
    const prev = entryByNode.get(e.nodeId);
    if (!prev || eventRank[e.kind] >= eventRank[prev.kind]) entryByNode.set(e.nodeId, e);
  }
  const entries = [...entryByNode.values()].sort(
    (a, b) => (a.timestampMs ?? 0) - (b.timestampMs ?? 0),
  );

  // Enrich each node from chain (parents, blob id, message, kind, creator).
  const nodes = await Promise.all(
    entries.map((e) =>
      readNode(e.nodeId!).then(
        (n) => ({ e, n, ok: true as const }),
        () => ({ e, n: null, ok: false as const }),
      ),
    ),
  );

  const openMr = mrs.find((m) => m.status !== 2) ?? null;
  const pendingNodeId = openMr?.mergedNode;

  // Branch lanes — main first, then by first appearance.
  const branchOrder: string[] = [];
  const branchCommitCount = new Map<string, number>();
  for (const { e } of nodes) {
    const b = e.branch ?? 'main';
    if (!branchOrder.includes(b)) branchOrder.push(b);
    branchCommitCount.set(b, (branchCommitCount.get(b) ?? 0) + 1);
  }
  if (!branchOrder.includes('main')) branchOrder.unshift('main');
  branchOrder.sort((a, b) => (a === 'main' ? -1 : b === 'main' ? 1 : 0));
  const laneOf = (b: string) => Math.max(0, branchOrder.indexOf(b));

  // Build commits, newest first (row 0 = top).
  const ordered = [...nodes].reverse();
  const commits: Commit[] = ordered.map(({ e, n }, row) => {
    const event = e.kind;
    const branch = e.branch ?? 'main';
    const parents = n?.parents ?? e.parents ?? [];
    const creator = n?.creator ?? e.creator ?? '';
    const hasBlob = !!n && n.blobId !== 0n;
    const blobId = hasBlob ? blobIdFromInt(n!.blobId) : '';
    const isOpenMergeNode = e.nodeId === pendingNodeId;
    const merge = event === 'merge' || parents.length > 1 || isOpenMergeNode;
    const root = parents.length === 0 && event === 'create';
    const message = (n?.message ?? '').trim();
    const nodeKind = n?.kind ?? '';
    const status: CommitStatus = isOpenMergeNode ? 'pending' : 'verified';

    const c: Commit = {
      id: e.nodeId!,
      row,
      lane: laneOf(branch),
      parents,
      event,
      merge,
      root,
      fork: event === 'fork',
      branchPoint: false,
      name: message.split('\n')[0] || `node ${shortAddr(e.nodeId)}`,
      kind: nodeKind,
      label: buildLabel(event, branch, nodeKind, message),
      agentId: creator,
      status,
      hash: hasBlob ? shortHash(blobId) : '—',
      blobId,
      blob: hasBlob ? `walrus://${blobId.slice(0, 10)}…` : '—',
      txDigest: e.txDigest ?? '',
      anchorShort: e.txDigest ? shortDigest(e.txDigest) : '',
      sizeBytes: null,
      time: timeAgo(e.timestampMs, nowMs),
      timestampMs: e.timestampMs,
      branch,
      sig: creator ? shortAddr(creator) : '—',
      signer: creator,
    };

    if (isOpenMergeNode && openMr) {
      c.proposer = openMr.proposer;
      c.mergeRequestId = openMr.id;
      c.approvalsHave = openMr.approvals.length;
      const eligible = pol.writers.filter((w) => w !== openMr.proposer);
      c.approvers = eligible.length ? eligible : pol.writers;
      c.approvalsNeed = Math.max(1, pol.approvalThreshold);
    }
    return c;
  });

  const byId: Record<string, Commit> = Object.fromEntries(commits.map((c) => [c.id, c]));

  // Mark branch points (a node that is a parent of a node on a different branch).
  for (const c of commits) {
    for (const pid of c.parents) {
      const p = byId[pid];
      if (p && p.branch !== c.branch) p.branchPoint = true;
    }
  }

  // Edges child → parent.
  const edges: Edge[] = [];
  for (const c of commits) {
    for (const pid of c.parents) {
      const p = byId[pid];
      if (p) edges.push({ from: c.id, to: pid, lane: Math.max(c.lane, p.lane) });
    }
  }

  // Agents: the on-chain allow-list (writers) first — each gets a stable lane
  // color even with zero commits — then any creator seen on-chain but not listed.
  const agents: Record<string, Agent> = {};
  const order: string[] = [];
  const addAgent = (addr: string) => {
    if (!addr || agents[addr]) return;
    const i = order.length % LANE_VARS.length;
    order.push(addr);
    const primary = [...commits].reverse().find((c) => c.agentId === addr);
    agents[addr] = {
      id: addr,
      label: agentLabel(addr),
      initial: (KNOWN_AGENTS[addr]?.name?.[0] ?? addr.replace(/^0x/, '')[0] ?? '?').toUpperCase(),
      glyph: addr === pol.owner ? 'key-round' : 'cpu',
      color: LANE_VARS[i],
      tint: LANE_TINT[i],
      fg: LANE_FG[i],
      key: shortAddr(addr),
      address: addr,
      commits: 0,
      status: 'active',
      role: roleFor(addr, primary?.branch ?? 'main', addr === pol.owner),
      isOwner: addr === pol.owner,
    };
  };
  for (const w of pol.writers) addAgent(w);
  for (const c of [...commits].reverse()) addAgent(c.agentId);
  for (const c of commits) if (agents[c.agentId]) agents[c.agentId].commits += 1;
  if (openMr && agents[openMr.proposer]) agents[openMr.proposer].status = 'attesting';
  const agentList = order.map((a) => agents[a]);

  // Branch list with status (a branch is pending if it holds the open merge node).
  const branches: Branch[] = branchOrder.map((name) => {
    const lane = laneOf(name);
    const hasPending = commits.some((c) => c.branch === name && c.status === 'pending');
    return {
      name,
      lane,
      status: hasPending ? 'pending' : 'verified',
      commits: branchCommitCount.get(name) ?? 0,
    };
  });

  const lanes = branchOrder.map((_, i) => 22 + i * 24);
  const laneColor = branchOrder.map((_, i) => LANE_VARS[i % LANE_VARS.length]);
  const anchorShort = commits.find((c) => c.txDigest)?.anchorShort ?? '';
  const repoName = pol.name.replace(/\s*\(pending\)\s*$/i, '') || 'repository';

  return {
    repoId,
    org: opts.org ?? 'sui-overflow',
    repo: repoName,
    packageId: PACKAGE_ID,
    owner: pol.owner,
    writers: pol.writers,
    approvalThreshold: Math.max(1, pol.approvalThreshold),
    publicRead: pol.publicRead,
    branchCount: pol.branchCount || branchOrder.length,
    commits,
    byId,
    edges,
    branches,
    agents,
    agentList,
    lanes,
    laneColor,
    openMr,
    anchorShort,
  };
}

function roleFor(addr: string, branch: string, isOwner: boolean): string {
  if (KNOWN_AGENTS[addr]?.role) return KNOWN_AGENTS[addr].role;
  if (isOwner) return 'maintainer';
  if (branch && branch !== 'main') return branch.split('/').pop()!;
  return 'writer';
}

function buildLabel(event: EntryKind, branch: string, kind: string, message: string): string {
  const rest = message.split('\n').slice(1).join(' ').trim();
  if (rest) return rest;
  const k = kind ? `${kind} · ` : '';
  switch (event) {
    case 'create':
      return `${k}repository root · ${branch}`;
    case 'fork':
      return `${k}forked ${branch}`;
    case 'propose':
      return `${k}proposed merge → ${branch}`;
    case 'merge':
      return `${k}merge → ${branch}`;
    default:
      return `${k}commit on ${branch}`;
  }
}
