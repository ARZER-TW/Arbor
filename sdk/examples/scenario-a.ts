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
 * Run:  ARBOR_TEST_MNEMONIC="<12 words>" pnpm tsx examples/scenario-a.ts
 *
 * Content here is deterministic so the demo always runs. `generate()` is the
 * single seam to swap in real LLM-backed agents (Claude API) later.
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { ArborClient } from '../src/index.js';

const PACKAGE_ID =
  '0x15e07f9fbdf36c730ffaed1fd8c39f12b46cfb38c5ccc3a48b599bc73041cf30';
const WRITE = { epochs: 10, permanent: true };

// --- agent "thinking" (deterministic stand-in for an LLM call) ---
function generate(role: 'root' | 'hunter' | 'analyst' | 'reporter'): string {
  switch (role) {
    case 'root':
      return '# Risk Review Scope\nTarget: LendingProtocolX (testnet)\nGoal: assess solvency and security risks before integration.\n';
    case 'hunter':
      return '# Surface Scan (Hunter)\nSuspected risks:\n1. Unbounded mint in admin module\n2. Oracle price lacks staleness check\n3. Liquidation threshold updatable without timelock\n';
    case 'analyst':
      return '# Deep Analysis (Analyst)\n## R1 Unbounded mint\nSeverity: CRITICAL — admin can mint without a cap.\n## R2 Oracle staleness\nSeverity: HIGH — stale price enables underpriced liquidations.\n## R3 Liquidation timelock\nSeverity: MEDIUM — instant threshold changes risk cascades.\n';
    case 'reporter':
      return '# Final Risk Report (Reporter)\nProtocol: LendingProtocolX\nOverall: HIGH RISK\n\nFindings:\n- CRITICAL: unbounded mint (R1)\n- HIGH: oracle staleness (R2)\n- MEDIUM: liquidation timelock (R3)\n\nRecommendation: do not integrate until R1 is fixed.\n';
  }
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

  // Hunter commits the surface scan to main.
  const scan = await arbor.commitContent(
    { repoId: repo.repoId, branch: 'main', content: generate('hunter'), kind: 'report', message: 'surface scan', write: WRITE },
    hunter,
  );
  await arbor.client.waitForTransaction({ digest: scan.digest });
  console.log('Hunter   commit main    ->', scan.nodeId);

  // Analyst forks `analyst` and commits the deep dive.
  const fk = await arbor.fork({ repoId: repo.repoId, source: 'main', newBranch: 'analyst' }, analyst);
  await arbor.client.waitForTransaction({ digest: fk.digest });
  const ana = await arbor.commitContent(
    { repoId: repo.repoId, branch: 'analyst', content: generate('analyst'), kind: 'analysis', message: 'deep dive', write: WRITE },
    analyst,
  );
  await arbor.client.waitForTransaction({ digest: ana.digest });
  console.log('Analyst  commit analyst ->', ana.nodeId);

  // Reporter proposes a merge into main with the consolidated report (multi-parent).
  const mainTip = await arbor.getBranchTip(repo.repoId, 'main');
  const analystTip = await arbor.getBranchTip(repo.repoId, 'analyst');
  const blobId = await arbor.walrus.write(new TextEncoder().encode(generate('reporter')), WRITE);
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

  // Show the provenance timeline and the final report.
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
