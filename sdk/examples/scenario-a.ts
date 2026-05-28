/**
 * Scenario A — Multi-agent DeFi risk review on Arbor.
 *
 * Three agents collaborate on one versioned report, each on its own branch,
 * each signing its own commits (distinct creators in the provenance DAG):
 *   Hunter   - surface scan of suspected risks       (creates repo, commits to main)
 *   Analyst  - deep dive on each finding             (forks `analyst`, commits)
 *   Reporter - consolidates into the final report    (proposes merge to main)
 * Analyst approves (a proposer cannot self-approve), Reporter executes.
 *
 * Content is produced by Claude when ANTHROPIC_API_KEY is set (real AI agents),
 * and falls back to canned text otherwise so the demo always runs. Each agent
 * builds on the previous agent's output — a genuine pipeline.
 *
 * Run:  ARBOR_TEST_MNEMONIC="<12 words>" [ANTHROPIC_API_KEY=...] pnpm tsx examples/scenario-a.ts
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { ArborClient } from '../src/index.js';
import { generate, llmAvailable, modelName, provider, type Role } from './llm.js';
import { agentMemory, memoryNamespace } from './memwal.js';

const PACKAGE_ID =
  '0x15e07f9fbdf36c730ffaed1fd8c39f12b46cfb38c5ccc3a48b599bc73041cf30';
const WRITE = { epochs: 10, permanent: true };
const TARGET = 'LendingProtocolX, a Sui lending market';

// Deterministic fallback used when no ANTHROPIC_API_KEY is present.
const CANNED: Record<Role, string> = {
  hunter:
    '# Surface Scan (Hunter)\nSuspected risks:\n1. Unbounded mint in admin module\n2. Oracle price lacks staleness check\n3. Liquidation threshold updatable without timelock\n',
  analyst:
    '# Deep Analysis (Analyst)\n## R1 Unbounded mint\nSeverity: CRITICAL — admin can mint without a cap.\n## R2 Oracle staleness\nSeverity: HIGH — stale price enables underpriced liquidations.\n## R3 Liquidation timelock\nSeverity: MEDIUM — instant threshold changes risk cascades.\n',
  reporter:
    '# Final Risk Report (Reporter)\nProtocol: LendingProtocolX\nOverall: HIGH RISK\n\nFindings:\n- CRITICAL: unbounded mint (R1)\n- HIGH: oracle staleness (R2)\n- MEDIUM: liquidation timelock (R3)\n\nRecommendation: do not integrate until R1 is fixed.\n',
};

async function produce(role: Role, context: string): Promise<string> {
  if (llmAvailable()) {
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        return await generate(role, context);
      } catch (e) {
        const transient = /\b(503|429)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|high demand/i.test(String(e));
        if (attempt < 2 && transient) {
          await new Promise((r) => setTimeout(r, 4000));
          continue;
        }
        console.warn(`  LLM ${role} failed, using canned content:`, String(e));
        break;
      }
    }
  }
  return CANNED[role];
}

async function main() {
  const mnemonic = process.env.ARBOR_TEST_MNEMONIC;
  if (!mnemonic) throw new Error('Set ARBOR_TEST_MNEMONIC (12-word phrase).');

  const arbor = new ArborClient({ network: 'testnet', packageId: PACKAGE_ID });
  const funder = Ed25519Keypair.deriveKeypair(mnemonic.trim());

  const hunter = Ed25519Keypair.generate();
  const analyst = Ed25519Keypair.generate();
  const reporter = Ed25519Keypair.generate();
  const addr = {
    hunter: hunter.toSuiAddress(),
    analyst: analyst.toSuiAddress(),
    reporter: reporter.toSuiAddress(),
  };
  console.log('agents:', addr);
  console.log('content:', llmAvailable() ? `${provider()} (${modelName()})` : 'canned fallback');

  // Agent working memory (MemWal) — complements Arbor: MemWal holds recalled
  // scratch memory, Arbor holds the versioned artifacts. No-op without creds.
  const mem = agentMemory();
  console.log('memory:', mem.enabled ? `MemWal (ns=${memoryNamespace()})` : 'off');
  const withMemory = (base: string, recalled: string) =>
    recalled ? `Relevant prior memory:\n${recalled}\n\n${base}` : base;

  // Fund all three agents in one transaction from the funder.
  const fund = new Transaction();
  const coins = fund.splitCoins(fund.gas, [
    fund.pure.u64(100_000_000n),
    fund.pure.u64(100_000_000n),
    fund.pure.u64(100_000_000n),
  ]);
  fund.transferObjects([coins[0]], fund.pure.address(addr.hunter));
  fund.transferObjects([coins[1]], fund.pure.address(addr.analyst));
  fund.transferObjects([coins[2]], fund.pure.address(addr.reporter));
  const fres = await arbor.client.signAndExecuteTransaction({ transaction: fund, signer: funder });
  await arbor.client.waitForTransaction({ digest: fres.digest });
  console.log('funded agents:', fres.digest);

  // Hunter creates the repo (all three are writers; 1 approval needed to merge).
  const repo = await arbor.createRepository(
    {
      name: 'defi-protocol-risk-review',
      rootBlobId: 0n,
      rootKind: 'report',
      rootMessage: 'scope',
      publicRead: true,
      writers: [addr.hunter, addr.analyst, addr.reporter],
      approvalThreshold: 1n,
    },
    hunter,
  );
  await arbor.client.waitForTransaction({ digest: repo.digest });
  console.log('\nrepo:', repo.repoId);

  // Hunter recalls prior context (MemWal), scans, commits to main (Arbor), remembers a note.
  const hunterMem = await mem.recall(`known risks in lending protocols like ${TARGET}`);
  const hunterText = await produce('hunter', withMemory(`Target protocol: ${TARGET}. Produce your surface scan.`, hunterMem));
  const scan = await arbor.commitContent(
    { repoId: repo.repoId, branch: 'main', content: hunterText, kind: 'report', message: 'surface scan', write: WRITE },
    hunter,
  );
  await arbor.client.waitForTransaction({ digest: scan.digest });
  await mem.remember(`Hunter surface scan of ${TARGET}:\n${hunterText}`);
  console.log('Hunter   commit main    ->', scan.nodeId);

  // Analyst forks `analyst`, builds on Hunter's scan, and commits the deep dive.
  const fk = await arbor.fork({ repoId: repo.repoId, source: 'main', newBranch: 'analyst' }, analyst);
  await arbor.client.waitForTransaction({ digest: fk.digest });
  const analystMem = await mem.recall('severity rationale for DeFi lending risks');
  const analystText = await produce(
    'analyst',
    withMemory(`Surface scan from Hunter:\n\n${hunterText}\n\nProduce your deep analysis.`, analystMem),
  );
  const ana = await arbor.commitContent(
    { repoId: repo.repoId, branch: 'analyst', content: analystText, kind: 'analysis', message: 'deep dive', write: WRITE },
    analyst,
  );
  await arbor.client.waitForTransaction({ digest: ana.digest });
  await mem.remember(`Analyst deep analysis of ${TARGET}:\n${analystText}`);
  console.log('Analyst  commit analyst ->', ana.nodeId);

  // Reporter consolidates both into the final report and proposes the merge (multi-parent).
  const mainTip = await arbor.getBranchTip(repo.repoId, 'main');
  const analystTip = await arbor.getBranchTip(repo.repoId, 'analyst');
  const reporterMem = await mem.recall(`final risk report style for ${TARGET}`);
  const reporterText = await produce(
    'reporter',
    withMemory(
      `Surface scan:\n${hunterText}\n\nDeep analysis:\n${analystText}\n\nProduce the final consolidated risk report.`,
      reporterMem,
    ),
  );
  const blobId = await arbor.walrus.write(new TextEncoder().encode(reporterText), WRITE);
  const mr = await arbor.proposeMerge(
    {
      repoId: repo.repoId,
      targetBranch: 'main',
      mergedBlobId: blobId,
      parents: [mainTip, analystTip],
      kind: 'report',
      message: 'consolidate into final report',
    },
    reporter,
  );
  await arbor.client.waitForTransaction({ digest: mr.digest });
  console.log('Reporter propose merge  ->', mr.mergeRequestId, '(merged node', mr.mergedNode + ')');

  // Analyst approves (Analyst is not the proposer); Reporter executes.
  const ap = await arbor.approve({ repoId: repo.repoId, mergeRequestId: mr.mergeRequestId }, analyst);
  await arbor.client.waitForTransaction({ digest: ap.digest });
  console.log('Analyst  approve        -> status', ap.status, `(${ap.approvals} approval)`);
  const ex = await arbor.executeMerge({ repoId: repo.repoId, mergeRequestId: mr.mergeRequestId }, reporter);
  await arbor.client.waitForTransaction({ digest: ex.digest });
  console.log('Reporter execute merge  -> main now', ex.nodeId);

  const tl = await arbor.getTimeline(repo.repoId);
  console.log(`\nprovenance timeline (${tl.length} events):`);
  for (const e of tl) console.log('  -', e.type.split('::').slice(-1)[0]);

  const finalText = new TextDecoder().decode(await arbor.readNodeContent(ex.nodeId));
  console.log('\nfinal report on main:\n');
  console.log(finalText.split('\n').map((l) => '  ' + l).join('\n'));

  console.log('\nSCENARIO A complete. repo:', repo.repoId);
}

main().catch((e) => {
  console.error('SCENARIO A FAIL:', e);
  process.exit(1);
});
