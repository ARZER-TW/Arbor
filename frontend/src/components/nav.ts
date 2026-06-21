// Shared nav definitions for the sidebar, top bar breadcrumb, and canvas head.
export type NavId = 'artifacts' | 'lineage' | 'agents' | 'anchors' | 'keys';
export type ViewMode = 'graph' | 'list' | 'raw';

export const NAV_ITEMS: { id: NavId; icon: string; label: string }[] = [
  { id: 'artifacts', icon: 'box', label: 'Artifacts' },
  { id: 'lineage', icon: 'git-branch', label: 'Lineage' },
  { id: 'agents', icon: 'cpu', label: 'Agents' },
  { id: 'anchors', icon: 'anchor', label: 'Anchors' },
  { id: 'keys', icon: 'key-round', label: 'Keys' },
];

export const NAV_CRUMB: Record<NavId, string> = {
  artifacts: 'artifacts',
  lineage: 'lineage',
  agents: 'agents',
  anchors: 'anchors',
  keys: 'keys',
};
