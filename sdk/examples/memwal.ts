/**
 * Agent working memory via MemWal (Walrus Memory). This is the complement to
 * Arbor: MemWal holds an agent's scratch / recalled memory, Arbor holds the
 * versioned artifacts the agent produces. In Scenario A each agent recalls
 * prior context from MemWal before working and remembers a note afterwards,
 * while committing its actual deliverable to Arbor.
 *
 * Env-gated: set MEMWAL_KEY (Ed25519 delegate key, hex) and MEMWAL_ACCOUNT_ID
 * (Walrus Memory account object id) to enable. Without them this is a no-op, so
 * the demo still runs. serverUrl defaults to the public relayer.
 */
import { MemWal } from '@mysten-incubation/memwal';

const KEY = process.env.MEMWAL_KEY;
const ACCOUNT_ID = process.env.MEMWAL_ACCOUNT_ID;
const SERVER_URL = process.env.MEMWAL_SERVER_URL; // optional; SDK defaults to https://relayer.memwal.ai
const NAMESPACE = process.env.MEMWAL_NAMESPACE ?? 'arbor-demo';

export interface AgentMemory {
  readonly enabled: boolean;
  remember(note: string): Promise<void>;
  recall(query: string): Promise<string>;
}

class OffMemory implements AgentMemory {
  readonly enabled = false;
  async remember(): Promise<void> {}
  async recall(): Promise<string> {
    return '';
  }
}

class WalrusMemory implements AgentMemory {
  readonly enabled = true;
  private readonly mw: MemWal;

  constructor() {
    this.mw = MemWal.create({
      key: KEY!,
      accountId: ACCOUNT_ID!,
      ...(SERVER_URL ? { serverUrl: SERVER_URL } : {}),
      namespace: NAMESPACE,
    });
  }

  async remember(note: string): Promise<void> {
    await this.mw.rememberAndWait(note);
  }

  async recall(query: string): Promise<string> {
    const res = await this.mw.recall(query, 5);
    if (!res) return '';
    return typeof res === 'string' ? res : JSON.stringify(res);
  }
}

export function memwalAvailable(): boolean {
  return Boolean(KEY && ACCOUNT_ID);
}

export function memoryNamespace(): string {
  return NAMESPACE;
}

export function agentMemory(): AgentMemory {
  return memwalAvailable() ? new WalrusMemory() : new OffMemory();
}
