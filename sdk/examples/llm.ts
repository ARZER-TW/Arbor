/**
 * LLM-backed content generation for the demo agents. If ANTHROPIC_API_KEY is
 * set, each agent's artifact is produced by Claude with a role-specific system
 * prompt; callers fall back to canned content when no key is present, so the
 * demo always runs. This is the single seam that turns the scripted agents into
 * real, functional AI agents.
 *
 * Override the model with ARBOR_LLM_MODEL (e.g. claude-haiku-4-5 for speed/cost).
 */
import Anthropic from '@anthropic-ai/sdk';

export type Role = 'hunter' | 'analyst' | 'reporter';

const MODEL = process.env.ARBOR_LLM_MODEL ?? 'claude-opus-4-7';

const SYSTEM: Record<Role, string> = {
  hunter:
    'You are Hunter, a DeFi protocol security scanner. Produce a SHORT surface-level scan: a markdown list of 3-5 suspected risks in the target protocol, one concise line each. Begin with a "# Surface Scan (Hunter)" heading. No preamble, no closing remarks.',
  analyst:
    'You are Analyst, a senior DeFi security analyst. Given Hunter\'s surface scan, analyse each finding: assign a severity (CRITICAL / HIGH / MEDIUM / LOW) and a one-sentence justification. Begin with a "# Deep Analysis (Analyst)" heading. Markdown, no preamble.',
  reporter:
    'You are Reporter. Given a surface scan and a deep analysis, consolidate a final risk report: an overall risk rating, the findings ranked by severity, and a one-line integration recommendation. Begin with a "# Final Risk Report (Reporter)" heading. Concise markdown, no preamble.',
};

export function llmAvailable(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

export function modelName(): string {
  return MODEL;
}

export async function generate(role: Role, context: string): Promise<string> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 2048,
    system: SYSTEM[role],
    messages: [{ role: 'user', content: context }],
  });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}
