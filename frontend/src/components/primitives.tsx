// Shared presentational primitives: Button, StatusBadge, Avatar, EventBadge,
// Kbd, Hash. Ported from the design prototype to typed React with props instead
// of window globals.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from './icons';
import { EVENT_COLOR, EVENT_ICON, type Agent, type CommitStatus } from '../lib/model';
import type { EntryKind } from '../lib/arbor';

type ButtonVariant = 'primary' | 'secondary' | 'ghost';
type Size = 'sm' | 'md';

export function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  children,
  onClick,
  disabled,
  style,
}: {
  variant?: ButtonVariant;
  size?: Size;
  icon?: string;
  children?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  style?: CSSProperties;
}) {
  const cls = `btn btn-${variant} ${size === 'sm' ? 'btn-sm' : ''} ${disabled ? 'btn-dis' : ''}`;
  return (
    <button className={cls} onClick={disabled ? undefined : onClick} disabled={disabled} style={style}>
      {icon && <Icon name={icon} size={size === 'sm' ? 13 : 15} />}
      {children}
    </button>
  );
}

const STATUS: Record<
  string,
  { color: string; bg: string; border: string; icon: string; label: string }
> = {
  verified: {
    color: 'var(--verified)',
    bg: 'var(--accent-faint)',
    border: 'var(--accent-line)',
    icon: 'badge-check',
    label: 'Verified',
  },
  pending: {
    color: 'var(--pending)',
    bg: 'var(--pending-faint)',
    border: '#473714',
    icon: 'loader',
    label: 'Pending',
  },
  tampered: {
    color: 'var(--danger)',
    bg: 'var(--danger-faint)',
    border: '#4a2220',
    icon: 'shield-x',
    label: 'Tampered',
  },
};

export function StatusBadge({
  status,
  size = 'md',
}: {
  status: CommitStatus | 'tampered';
  size?: Size;
}) {
  const s = STATUS[status] ?? STATUS.verified;
  return (
    <span
      className="badge"
      style={{
        color: s.color,
        background: s.bg,
        borderColor: s.border,
        fontSize: size === 'sm' ? 10 : 11,
        padding: size === 'sm' ? '2px 7px' : '3px 9px',
      }}
    >
      <Icon name={s.icon} size={size === 'sm' ? 11 : 12} />
      {s.label}
    </span>
  );
}

export function Avatar({
  agent,
  size = 18,
  fallback,
}: {
  agent?: Agent;
  size?: number;
  fallback?: string;
}) {
  const tint = agent ? agent.tint : 'var(--bg-3)';
  const fg = agent ? agent.fg : 'var(--fg-1)';
  const fallbackInitial = (fallback ?? '?')[0].toUpperCase();
  return (
    <span
      className="avatar"
      style={{
        width: size,
        height: size,
        background: tint,
        color: fg,
        fontSize: size * 0.46,
        boxShadow: agent
          ? `inset 0 0 0 1px color-mix(in srgb, ${agent.color} 40%, transparent)`
          : 'none',
      }}
    >
      {agent?.glyph ? (
        <Icon name={agent.glyph} size={Math.round(size * 0.5)} color={fg} />
      ) : (
        fallbackInitial
      )}
    </span>
  );
}

export function EventBadge({ event, size = 'md' }: { event: EntryKind; size?: Size }) {
  const col = EVENT_COLOR[event] ?? 'var(--fg-2)';
  const ic = EVENT_ICON[event] ?? 'git-commit-horizontal';
  return (
    <span
      className="evb"
      style={{
        color: col,
        borderColor: `color-mix(in srgb, ${col} 38%, transparent)`,
        background: `color-mix(in srgb, ${col} 11%, transparent)`,
        fontSize: size === 'sm' ? 9 : 9.5,
        padding: size === 'sm' ? '1px 6px' : '2px 7px',
      }}
    >
      <Icon name={ic} size={size === 'sm' ? 10 : 11} />
      {event}
    </span>
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <span className="kbd">{children}</span>;
}

export function Hash({
  value,
  info = true,
  copy,
  href,
}: {
  value: string;
  info?: boolean;
  copy?: string; // full value to copy (defaults to `value`)
  href?: string;
}) {
  const [copied, setCopied] = useState(false);
  const onClick = () => {
    const text = copy ?? value;
    try {
      void navigator.clipboard?.writeText(text);
    } catch {
      /* clipboard may be unavailable; the flash still confirms intent */
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 900);
  };
  const inner = (
    <>
      {copied && <Icon name="check" size={11} color="var(--accent)" />} {value}
    </>
  );
  if (href) {
    return (
      <a
        className={`hashv ${info ? 'is-info' : ''}`}
        href={href}
        target="_blank"
        rel="noreferrer"
        title="open in explorer"
      >
        {inner}
      </a>
    );
  }
  return (
    <button
      type="button"
      className={`hashv ${info ? 'is-info' : ''}`}
      onClick={onClick}
      title="copy"
      aria-label={`copy ${value}`}
      style={{
        appearance: 'none',
        background: 'none',
        border: 0,
        padding: 0,
        margin: 0,
        fontSize: 'inherit',
        fontWeight: 'inherit',
        color: info ? undefined : 'inherit',
        lineHeight: 'inherit',
        verticalAlign: 'baseline',
        cursor: 'pointer',
      }}
    >
      {inner}
    </button>
  );
}
