// ⌘K command palette: actions + jump-to-artifact.
import { useEffect, useRef, useState } from 'react';
import { Icon } from './icons';
import { kindIcon, type RepoModel } from '../lib/model';

export type CommandResult =
  | { kind: 'action'; id: 'verify-all' | 'goto-merge' }
  | { kind: 'artifact'; id: string };

interface Row {
  kind: 'action' | 'artifact';
  id: string;
  icon: string;
  label: string;
  hint?: string;
}

export function CommandPalette({
  model,
  open,
  onClose,
  onSelect,
}: {
  model: RepoModel | null;
  open: boolean;
  onClose: () => void;
  onSelect: (r: CommandResult) => void;
}) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (open) {
      setQ('');
      setSel(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);
  useEffect(() => {
    setSel(0);
  }, [q]);
  if (!open || !model) return null;

  const rows: Row[] = [
    { kind: 'action', id: 'verify-all', icon: 'shield-check', label: 'Verify all artifacts', hint: '↵' },
    ...(model.openMr
      ? [{ kind: 'action' as const, id: 'goto-merge', icon: 'git-pull-request', label: 'Open pending merge request' }]
      : []),
    ...model.commits.map((c) => ({
      kind: 'artifact' as const,
      id: c.id,
      icon: kindIcon(c.kind),
      label: c.name,
      hint: c.hash,
    })),
  ];
  const filtered = rows.filter((r) => r.label.toLowerCase().includes(q.toLowerCase()));
  const actions = filtered.filter((r) => r.kind === 'action');
  const artifacts = filtered.filter((r) => r.kind === 'artifact');

  const pick = (r: Row) => {
    if (r.kind === 'artifact') onSelect({ kind: 'artifact', id: r.id });
    else onSelect({ kind: 'action', id: r.id as 'verify-all' | 'goto-merge' });
  };

  const scrollRow = (i: number) => {
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${i}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  };

  return (
    <div className="cmd-overlay" onClick={onClose}>
      <div className="cmd" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-search">
          <Icon name="search" size={15} color="var(--fg-3)" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                const next = Math.min(sel + 1, filtered.length - 1);
                setSel(next);
                scrollRow(next);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                const next = Math.max(sel - 1, 0);
                setSel(next);
                scrollRow(next);
              } else if (e.key === 'Enter' && filtered[sel]) {
                pick(filtered[sel]);
              }
            }}
            placeholder="Run a command or jump to an artifact…"
          />
          <span className="esc" onClick={onClose}>ESC</span>
        </div>
        <div className="cmd-list" ref={listRef}>
          {filtered.length === 0 && <div className="cmd-empty">No matches</div>}
          {actions.length > 0 && <div className="cmd-group">Actions</div>}
          {actions.map((r, i) => (
            <div
              key={r.id}
              data-index={i}
              className={`cmd-row ${i === sel ? 'on' : ''}`}
              onClick={() => pick(r)}
            >
              <Icon name={r.icon} size={15} />
              <span className="cmd-label">{r.label}</span>
              {r.hint && <span className="cmd-hint">{r.hint}</span>}
            </div>
          ))}
          {artifacts.length > 0 && <div className="cmd-group">Artifacts</div>}
          {artifacts.map((r, i) => {
            const gi = actions.length + i;
            return (
              <div
                key={r.id}
                data-index={gi}
                className={`cmd-row ${gi === sel ? 'on' : ''}`}
                onClick={() => pick(r)}
              >
                <Icon name={r.icon} size={15} />
                <span className="cmd-label">{r.label}</span>
                <span className="cmd-hint mono">{r.hint}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
