/**
 * Live testnet round-trip: exercises the full Arbor spine against the deployed
 * package to verify on-chain (de)serialization and shared-object resolution.
 *
 * Run:  ARBOR_TEST_MNEMONIC="<12 words>" pnpm tsx scripts/roundtrip.ts
 *
 * No secret is hardcoded; the mnemonic is read from the environment.
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { Transaction } from '@mysten/sui/transactions';
import { ArborClient } from '../src/client.js';

const PACKAGE_ID =
  '0x15e07f9fbdf36c730ffaed1fd8c39f12b46cfb38c5ccc3a48b599bc73041cf30';

async function main() {
  const mnemonic = process.env.ARBOR_TEST_MNEMONIC;
  if (!mnemonic) throw new Error('Set ARBOR_TEST_MNEMONIC (12-word phrase).');

  const arbor = new ArborClient({ network: 'testnet', packageId: PACKAGE_ID });

  // Signer A = funded testnet account from the mnemonic.
  const a = Ed25519Keypair.deriveKeypair(mnemonic.trim());
  const aAddr = a.toSuiAddress();
  console.log('signer A:', aAddr);

  // Signer B = ephemeral, funded by A (needed because a proposer cannot self-approve).
  const b = Ed25519Keypair.generate();
  const bAddr = b.toSuiAddress();
  console.log('signer B (ephemeral):', bAddr);

  // Fund B with 0.1 SUI from A.
  const fund = new Transaction();
  const [coin] = fund.splitCoins(fund.gas, [fund.pure.u64(100_000_000n)]);
  fund.transferObjects([coin], fund.pure.address(bAddr));
  const fres = await arbor.client.signAndExecuteTransaction({
    transaction: fund,
    signer: a,
    options: { showEffects: true },
  });
  await arbor.client.waitForTransaction({ digest: fres.digest });
  console.log('   funded B (0.1 SUI):', fres.digest);

  // 1. A creates the repo: writers {A, B}, 1 approval required.
  const repo = await arbor.createRepository(
    {
      name: 'roundtrip-defi-research',
      rootBlobId: 1n,
      rootKind: 'report',
      rootMessage: 'root',
      publicRead: true,
      writers: [aAddr, bAddr],
      approvalThreshold: 1n,
    },
    a,
  );
  await arbor.client.waitForTransaction({ digest: repo.digest });
  console.log('1. repo:', repo.repoId, '| root node:', repo.rootNode);

  // 2. A commits to main.
  const c1 = await arbor.commit(
    { repoId: repo.repoId, branch: 'main', blobId: 2n, kind: 'report', message: 'hunter scan' },
    a,
  );
  await arbor.client.waitForTransaction({ digest: c1.digest });
  console.log('2. commit main:', c1.nodeId);

  // 3. A forks `analyst` from main.
  const fk = await arbor.fork({ repoId: repo.repoId, source: 'main', newBranch: 'analyst' }, a);
  await arbor.client.waitForTransaction({ digest: fk.digest });
  console.log('3. fork analyst tip:', fk.tip);

  // 4. B commits to analyst.
  const c2 = await arbor.commit(
    { repoId: repo.repoId, branch: 'analyst', blobId: 3n, kind: 'analysis', message: 'deep dive' },
    b,
  );
  await arbor.client.waitForTransaction({ digest: c2.digest });
  console.log('4. B commit analyst:', c2.nodeId);

  const mainTip = await arbor.getBranchTip(repo.repoId, 'main');
  const analystTip = await arbor.getBranchTip(repo.repoId, 'analyst');
  console.log('   tips -> main:', mainTip, '| analyst:', analystTip);

  // 5. B proposes merge analyst -> main with multi-parent. THIS exercises vector<ID>.
  const mr = await arbor.proposeMerge(
    {
      repoId: repo.repoId,
      targetBranch: 'main',
      mergedBlobId: 4n,
      parents: [mainTip, analystTip],
      kind: 'report',
      message: 'merge analyst into main',
    },
    b,
  );
  await arbor.client.waitForTransaction({ digest: mr.digest });
  console.log('5. propose merge (vector<ID> serialized OK):', mr.mergeRequestId, '| merged:', mr.mergedNode);

  // 6. A approves (A != proposer B).
  const ap = await arbor.approve({ repoId: repo.repoId, mergeRequestId: mr.mergeRequestId }, a);
  await arbor.client.waitForTransaction({ digest: ap.digest });
  console.log('6. approve -> status:', ap.status, '| approvals:', ap.approvals);

  // 7. A executes the merge.
  const ex = await arbor.executeMerge({ repoId: repo.repoId, mergeRequestId: mr.mergeRequestId }, a);
  await arbor.client.waitForTransaction({ digest: ex.digest });
  console.log('7. execute merge node:', ex.nodeId);

  const finalTip = await arbor.getBranchTip(repo.repoId, 'main');
  if (finalTip !== mr.mergedNode) {
    throw new Error(`main tip ${finalTip} != merged node ${mr.mergedNode}`);
  }

  const tl = await arbor.getTimeline(repo.repoId);
  console.log(`\ntimeline (${tl.length} events):`);
  for (const e of tl) console.log('  -', e.type.split('::').slice(-1)[0]);

  console.log('\nROUND-TRIP PASS: full spine verified on testnet.');
  console.log('repo:', repo.repoId);
}

main().catch((e) => {
  console.error('ROUND-TRIP FAIL:', e);
  process.exit(1);
});
