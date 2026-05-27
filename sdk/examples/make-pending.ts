/**
 * Create a demo repo left in the "proposed, awaiting approval" state so the
 * viewer UI can exercise the approve / execute buttons.
 *
 * Writers = { funder (mnemonic addr), agent }. The agent proposes the merge,
 * so the funder (a writer, not the proposer) can approve it from the wallet UI.
 *
 * Run:  ARBOR_TEST_MNEMONIC="<12 words>" pnpm tsx examples/make-pending.ts
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { ArborClient } from '../src/index.js';

const PACKAGE_ID =
  '0x15e07f9fbdf36c730ffaed1fd8c39f12b46cfb38c5ccc3a48b599bc73041cf30';
const WRITE = { epochs: 10, permanent: true };

async function main() {
  const mnemonic = process.env.ARBOR_TEST_MNEMONIC;
  if (!mnemonic) throw new Error('Set ARBOR_TEST_MNEMONIC (12-word phrase).');

  const arbor = new ArborClient({ network: 'testnet', packageId: PACKAGE_ID });
  const funder = Ed25519Keypair.deriveKeypair(mnemonic.trim());
  const agent = Ed25519Keypair.generate();
  console.log('funder (can approve):', funder.toSuiAddress());
  console.log('agent (proposer):    ', agent.toSuiAddress());

  // Fund the agent.
  const fund = new Transaction();
  const [coin] = fund.splitCoins(fund.gas, [fund.pure.u64(100_000_000n)]);
  fund.transferObjects([coin], fund.pure.address(agent.toSuiAddress()));
  const fres = await arbor.client.signAndExecuteTransaction({ transaction: fund, signer: funder });
  await arbor.client.waitForTransaction({ digest: fres.digest });

  const repo = await arbor.createRepository(
    {
      name: 'defi-protocol-risk-review (pending)',
      rootBlobId: 0n,
      rootKind: 'report',
      rootMessage: 'scope',
      publicRead: true,
      writers: [funder.toSuiAddress(), agent.toSuiAddress()],
      approvalThreshold: 1n,
    },
    funder,
  );
  await arbor.client.waitForTransaction({ digest: repo.digest });

  const scan = await arbor.commitContent(
    { repoId: repo.repoId, branch: 'main', content: '# Surface Scan (Hunter)\nSuspected risks:\n1. Unbounded mint in admin module\n2. Oracle price lacks staleness check\n', kind: 'report', message: 'surface scan', write: WRITE },
    funder,
  );
  await arbor.client.waitForTransaction({ digest: scan.digest });

  const fk = await arbor.fork({ repoId: repo.repoId, source: 'main', newBranch: 'analyst' }, funder);
  await arbor.client.waitForTransaction({ digest: fk.digest });

  const ana = await arbor.commitContent(
    { repoId: repo.repoId, branch: 'analyst', content: '# Deep Analysis (Analyst)\n## R1 Unbounded mint\nSeverity: CRITICAL — admin can mint without a cap.\n## R2 Oracle staleness\nSeverity: HIGH.\n', kind: 'analysis', message: 'deep dive', write: WRITE },
    agent,
  );
  await arbor.client.waitForTransaction({ digest: ana.digest });

  const mainTip = await arbor.getBranchTip(repo.repoId, 'main');
  const analystTip = await arbor.getBranchTip(repo.repoId, 'analyst');
  const merged = '# Final Risk Report (Reporter)\nProtocol: LendingProtocolX\nOverall: HIGH RISK\n- CRITICAL: unbounded mint\n- HIGH: oracle staleness\nRecommendation: do not integrate until fixed.\n';
  const blobId = await arbor.walrus.write(new TextEncoder().encode(merged), WRITE);
  const mr = await arbor.proposeMerge(
    {
      repoId: repo.repoId,
      targetBranch: 'main',
      mergedBlobId: blobId,
      parents: [mainTip, analystTip],
      kind: 'report',
      message: 'consolidate into final report',
    },
    agent,
  );
  await arbor.client.waitForTransaction({ digest: mr.digest });

  console.log('\nPENDING repo ready (merge proposed, awaiting approval):');
  console.log('  repo:', repo.repoId);
  console.log('  mergeRequest:', mr.mergeRequestId, '(proposer = agent)');
  console.log('  approve from a wallet holding the funder address.');
}

main().catch((e) => {
  console.error('MAKE-PENDING FAIL:', e);
  process.exit(1);
});
