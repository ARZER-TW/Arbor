/**
 * LLM-backed content generation for the demo agents. Provider is selected by
 * which API key is present in the environment:
 *   GEMINI_API_KEY (or GOOGLE_API_KEY) -> Gemini   (free tier — good for demos)
 *   ANTHROPIC_API_KEY                  -> Claude
 *   neither                            -> caller falls back to canned content
 *
 * The role system prompts and the agent pipeline are provider-agnostic; this is
 * the single seam that turns the scripted agents into real, functional AI agents.
 *
 * Model overrides: ARBOR_GEMINI_MODEL (default gemini-2.5-flash),
 *                  ARBOR_LLM_MODEL    (default claude-opus-4-7).
 */
import Anthropic from '@anthropic-ai/sdk';
import { GoogleGenAI } from '@google/genai';

export type Role = 'hunter' | 'analyst' | 'reporter';
export type Provider = 'gemini' | 'claude' | 'none';

const GEMINI_KEY = process.env.GEMINI_API_KEY ?? process.env.GOOGLE_API_KEY;
const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

const GEMINI_MODEL = process.env.ARBOR_GEMINI_MODEL ?? 'gemini-2.5-flash';
const CLAUDE_MODEL = process.env.ARBOR_LLM_MODEL ?? 'claude-opus-4-7';

const MAX_OUTPUT_TOKENS = 2048;

const SYSTEM: Record<Role, string> = {
  hunter:
    'You are Hunter, a DeFi protocol security scanner. Produce a SHORT surface-level scan: a markdown list of 3-5 suspected risks in the target protocol, one concise line each. Begin with a "# Surface Scan (Hunter)" heading. No preamble, no closing remarks.',
  analyst:
    'You are Analyst, a senior DeFi security analyst. Given Hunter\'s surface scan, analyse each finding: assign a severity (CRITICAL / HIGH / MEDIUM / LOW) and a one-sentence justification. Begin with a "# Deep Analysis (Analyst)" heading. Markdown, no preamble.',
  reporter:
    'You are Reporter. Given a surface scan and a deep analysis, consolidate a final risk report: an overall risk rating, the findings ranked by severity, and a one-line integration recommendation. Begin with a "# Final Risk Report (Reporter)" heading. Concise markdown, no preamble.',
};

export function provider(): Provider {
  if (GEMINI_KEY) return 'gemini';
  if (ANTHROPIC_KEY) return 'claude';
  return 'none';
}

export function llmAvailable(): boolean {
  return provider() !== 'none';
}

export function modelName(): string {
  const p = provider();
  if (p === 'gemini') return GEMINI_MODEL;
  if (p === 'claude') return CLAUDE_MODEL;
  return 'canned';
}

async function generateGemini(role: Role, context: string): Promise<string> {
  const ai = new GoogleGenAI({ apiKey: GEMINI_KEY! });
  const resp = await ai.models.generateContent({
    model: GEMINI_MODEL,
    contents: context,
    config: { systemInstruction: SYSTEM[role], maxOutputTokens: MAX_OUTPUT_TOKENS },
  });
  return (resp.text ?? '').trim();
}

async function generateClaude(role: Role, context: string): Promise<string> {
  const client = new Anthropic(); // reads ANTHROPIC_API_KEY
  const resp = await client.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    system: SYSTEM[role],
    messages: [{ role: 'user', content: context }],
  });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();
}

export async function generate(role: Role, context: string): Promise<string> {
  const p = provider();
  if (p === 'gemini') return generateGemini(role, context);
  if (p === 'claude') return generateClaude(role, context);
  throw new Error('no LLM provider configured (set GEMINI_API_KEY or ANTHROPIC_API_KEY)');
}
