// Right inspector: head, action area (merge-request governance card / real
// provenance verification with live steps + result banner), on-chain fields,
// and the static lineage → root.
import type { ReactNode } from 'react';
import { Icon } from './icons';
import { Avatar, Button, EventBadge, Hash, StatusBadge } from './primitives';
import {
  fmtSize,
  lineage,
  kindIcon,
  suiscanTxUrl,
  walrusBlobUrl,
  type Commit,
  type CommitStatus,
  type RepoModel,
} from '../lib/model';
import type { StepStatus, VerifyResult, VerifyStep } from '../lib/verify';

// status → node class (matching the CSS the styles unit added) + glyph + color.
const STEP_VIS: Record<StepStatus, { cls: string; icon: string; color: string }> = {
  ok: { cls: 'done', icon: 'check', color: 'var(--accent)' },
  warn: { cls: 'warn', icon: 'alert-triangle', color: 'var(--pending)' },
  fail: { cls: 'fail', icon: 'x-circle', color: 'var(--danger)' },
  running: { cls: 'active', icon: 'loader', color: 'var(--accent)' },
  pending: { cls: '', icon: 'dot', color: 'var(--fg-3)' },
};

function bannerFor(r: VerifyResult): { cls: string; icon: string; color: string } {
  if (!r.ok) return { cls: 'verify-banner-fail', icon: 'shield-x', color: 'var(--danger)' };
  if (r.steps.some((s) => s.status === 'warn'))
    return { cls: 'verify-banner-warn', icon: 'alert-triangle', color: 'var(--pending)' };
  return { cls: 'verified-banner', icon: 'shield-check', color: 'var(--accent)' };
}

// Live (or last) verification steps, real status straight from verify.ts.
function VerifySteps({ steps }: { steps: VerifyStep[] }) {
  return (
    <div style={{ marginTop: 12 }}>
      {steps.map((s, i) => {
        const v = STEP_VIS[s.status];
        return (
          <div key={s.key} className={`pf-step ${v.cls}`.trim()}>
            <div className="pf-rail">
              <span className="pf-node">
                <Icon name={v.icon} size={11} color={v.color} />
              </span>
              {i < steps.length - 1 && <span className="pf-line" />}
            </div>
            <div className="pf-body">
              <span className="pf-name">{s.label}</span>
              {s.detail && <span className="pf-detail">{s.detail}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Static, factual ancestry from the model (root → this). No animation.
function LineageChain({ model, commit }: { model: RepoModel; commit: Commit }) {
  const chain = [...lineage(model, commit.id)].reverse();
  return (
    <div className="proof">
      {chain.map((c, i) => (
        <div key={c.id} className="pf-step">
          <div className="pf-rail">
            <span className="pf-node">
              <Icon name="dot" size={11} color={model.laneColor[c.lane]} />
            </span>
            {i < chain.length - 1 && <span className="pf-line" />}
          </div>
          <div className="pf-body">
            <span className="pf-name">{c.name}</span>
            <span className="pf-hash">{c.hash}</span>
          </div>
          {c.root && <span className="pf-tag">root</span>}
        </div>
      ))}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="df">
      <span className="df-k">{label}</span>
      <span className="df-v mono">{children}</span>
    </div>
  );
}

export function DetailPanel({
  model,
  commit,
  status,
  verifyResult,
  verifySteps,
  verifying,
  onVerify,
  onApprove,
  onExecuteMerge,
  busy,
  actionErr,
  canAct,
  isProposer,
}: {
  model: RepoModel;
  commit: Commit | null;
  status: CommitStatus | null;
  verifyResult: VerifyResult | null;
  verifySteps: VerifyStep[] | null;
  verifying: boolean;
  onVerify: (commit: Commit) => void;
  onApprove: () => void;
  onExecuteMerge: () => void;
  busy: boolean;
  actionErr: string | null;
  canAct: boolean;
  isProposer: boolean;
}) {
  if (!commit || !status) {
    return (
      <div className="detail empty">
        <Icon name="mouse-pointer-click" size={20} color="var(--fg-3)" />
        <span>Select an artifact to inspect its provenance</span>
      </div>
    );
  }

  const agent = model.agents[commit.agentId];
  const proposerAgent = commit.proposer ? model.agents[commit.proposer] : undefined;
  const isMR = !!commit.proposer && status !== 'verified';
  const need = commit.approvalsNeed ?? model.approvalThreshold;
  const have = commit.approvalsHave ?? 0;
  const approvers = commit.approvers ?? [];
  const ready = have >= need;

  const isRoot = commit.blobId === '';
  const sizeVal = verifyResult?.sizeBytes ?? commit.sizeBytes;
  const stepsToShow = verifying ? verifySteps : verifyResult?.steps ?? null;
  const banner = verifyResult ? bannerFor(verifyResult) : null;

  return (
    <div className="detail">
      <div className="dt-head">
        <div className="dt-title">
          <div className="dt-icon">
            <Icon name={kindIcon(commit.kind)} size={16} color="var(--fg-1)" />
          </div>
          <div>
            <div className="dt-name">{commit.name}</div>
            <div className="dt-branch">
              <EventBadge event={commit.event} size="sm" />
              <span className="lane-dot" style={{ background: model.laneColor[commit.lane] }} />
              {commit.branch}
            </div>
          </div>
        </div>
        <StatusBadge status={status} />
      </div>

      <div className="dt-action">
        {isMR ? (
          <div className="mr-gov">
            <div className="mr-gov-top">
              <Icon name="git-pull-request" size={14} color="var(--pending)" />
              <span>
                merge request → <b>{commit.branch}</b>
              </span>
            </div>
            <div className="mr-gov-by">
              proposed by{' '}
              <span className="df-agent">
                <Avatar agent={proposerAgent} size={15} fallback={commit.proposer} />
                {proposerAgent?.label ?? '—'}
              </span>
            </div>
            <div className="mr-appr">
              {approvers.map((addr, i) => {
                const ok = i < have;
                const a = model.agents[addr];
                return (
                  <div className={`mr-appr-row ${ok ? 'ok' : ''}`} key={addr}>
                    <Icon
                      name={ok ? 'check-circle-2' : 'circle'}
                      size={13}
                      color={ok ? 'var(--accent)' : 'var(--fg-3)'}
                    />
                    <Avatar agent={a} size={15} fallback={addr} />
                    <span className="mr-appr-name">{a?.label ?? addr}</span>
                    <span className="mr-appr-st">{ok ? 'approved' : 'awaiting'}</span>
                  </div>
                );
              })}
            </div>
            <div className="mr-gov-prog">
              {have} of {need} approval{need === 1 ? '' : 's'} · k-of-n on Sui
            </div>
            {!ready ? (
              <Button
                variant="primary"
                icon={busy ? 'loader' : 'check'}
                onClick={onApprove}
                disabled={!canAct || isProposer || busy}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {busy ? 'Approving…' : 'Approve merge'}
              </Button>
            ) : (
              <Button
                variant="primary"
                icon={busy ? 'loader' : 'git-merge'}
                onClick={onExecuteMerge}
                disabled={!canAct || busy}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {busy ? 'Merging…' : 'Execute merge'}
              </Button>
            )}
            <div className="mr-gov-note">
              <Icon name="info" size={11} color="var(--fg-3)" />
              proposer can't self-approve — separation of duties
            </div>
            {!canAct && (
              <div className="mr-gov-note">connect an allow-listed writer to act</div>
            )}
            {isProposer && (
              <div className="mr-gov-note">you proposed this — switch to a different writer</div>
            )}
            {actionErr && <div className="action-err">{actionErr}</div>}
          </div>
        ) : (
          <>
            <Button
              variant="primary"
              icon={verifying ? 'loader' : 'shield-check'}
              onClick={() => onVerify(commit)}
              disabled={verifying}
              style={{ width: '100%', justifyContent: 'center' }}
            >
              {verifying ? 'Verifying…' : 'Verify provenance'}
            </Button>

            {stepsToShow && stepsToShow.length > 0 && <VerifySteps steps={stepsToShow} />}

            {verifyResult && !verifying && banner && (
              <div className={banner.cls} style={{ marginTop: 12 }}>
                <Icon name={banner.icon} size={15} color={banner.color} />
                {verifyResult.summary}
              </div>
            )}
          </>
        )}
      </div>

      <div className="dt-fields">
        <Field label="content hash">
          {isRoot ? (
            <span style={{ color: 'var(--fg-3)' }}>repository root · no content blob</span>
          ) : (
            <Hash value={commit.hash} copy={commit.blobId} />
          )}
        </Field>
        <Field label="walrus blob">
          {isRoot ? (
            <span style={{ color: 'var(--fg-3)' }}>repository root · no content blob</span>
          ) : (
            <a
              className="hashv is-info"
              href={walrusBlobUrl(commit.blobId)}
              target="_blank"
              rel="noreferrer"
            >
              {commit.blob}
            </a>
          )}
        </Field>
        <Field label="sui anchor">
          {commit.txDigest ? (
            <Hash value={commit.anchorShort} info={false} href={suiscanTxUrl(commit.txDigest)} />
          ) : (
            <span style={{ color: 'var(--pending)' }}>awaiting tx…</span>
          )}
        </Field>
        {sizeVal != null && <Field label="size">{fmtSize(sizeVal)}</Field>}
        <Field label="producer">
          <span className="df-agent">
            <Avatar agent={agent} size={15} fallback={commit.agentId} />
            {agent?.label ?? '—'}
          </span>
        </Field>
        <Field label="signature">{commit.sig === '—' ? '—' : `ed25519 · ${commit.sig}`}</Field>
        <span style={{ fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--fg-3)' }}>
          content hash = Walrus blob id (content-addressed)
        </span>
      </div>

      <div className="dt-section-label">Lineage → root</div>
      <LineageChain model={model} commit={commit} />
    </div>
  );
}
