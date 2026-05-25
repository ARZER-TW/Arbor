/**
 * Live Walrus + testnet round-trip: real content through the full path
 * (upload -> commit -> read back -> diff), plus a content-addressing check
 * (same bytes committed twice yield the same blob id).
 *
 * Run:  ARBOR_TEST_MNEMONIC="<12 words>" pnpm tsx scripts/walrus-roundtrip.ts
 */
import { Ed25519Keypair } from '@mysten/sui/keypairs/ed25519';
import { ArborClient } from '../src/client.js';

const PACKAGE_ID =
  '0x15e07f9fbdf36c730ffaed1fd8c39f12b46cfb38c5ccc3a48b599bc73041cf30';

const WRITE = { epochs: 2, permanent: false };

const REPORT_V1 = 'Arbor DeFi risk report v1\n- finding: protocol X has unbounded mint\n';
const ANALYSIS = 'Arbor analysis\n- severity: HIGH\n- recommend: add supply cap\n';

async function main() {
  const mnemonic = process.env.ARBOR_TEST_MNEMONIC;
  if (!mnemonic) throw new Error('Set ARBOR_TEST_MNEMONIC (12-word phrase).');

  const arbor = new ArborClient({ network: 'testnet', packageId: PACKAGE_ID });
  const a = Ed25519Keypair.deriveKeypair(mnemonic.trim());
  console.log('signer:', a.toSuiAddress());

  // Repo with auto-merge (threshold 0) since this test does not merge.
  const repo = await arbor.createRepository(
    {
      name: 'walrus-roundtrip',
      rootBlobId: 0n,
      rootKind: 'report',
      rootMessage: 'root',
      publicRead: true,
      writers: [a.toSuiAddress()],
      approvalThreshold: 0n,
    },
    a,
  );
  await arbor.client.waitForTransaction({ digest: repo.digest });
  console.log('repo:', repo.repoId);

  // 1. Commit real content; content goes to Walrus, blob id goes on-chain.
  const c1 = await arbor.commitContent(
    { repoId: repo.repoId, branch: 'main', content: REPORT_V1, kind: 'report', message: 'v1', write: WRITE },
    a,
  );
  await arbor.client.waitForTransaction({ digest: c1.digest });
  console.log('1. commit v1 node:', c1.nodeId, '| blobId(u256):', c1.blobId.toString());

  // 2. Read it back from Walrus via the node, verify byte-for-byte.
  const readBack = await withRetry(() => arbor.readNodeContent(c1.nodeId));
  const text = new TextDecoder().decode(readBack);
  console.log('2. read back matches:', text === REPORT_V1);
  if (text !== REPORT_V1) throw new Error(`content mismatch:\n${text}`);

  // 3. Fork + commit different content, then diff the two nodes.
  const fk = await arbor.fork({ repoId: repo.repoId, source: 'main', newBranch: 'analyst' }, a);
  await arbor.client.waitForTransaction({ digest: fk.digest });
  const c2 = await arbor.commitContent(
    { repoId: repo.repoId, branch: 'analyst', content: ANALYSIS, kind: 'analysis', message: 'deep dive', write: WRITE },
    a,
  );
  await arbor.client.waitForTransaction({ digest: c2.digest });
  const d = await withRetry(() => arbor.diff(c1.nodeId, c2.nodeId));
  console.log('3. diff identical:', d.identical, '(expected false)');
  console.log('   --- main ---\n' + indent(d.a.text) + '   --- analyst ---\n' + indent(d.b.text));

  // 4. Content-addressing: commit the SAME bytes again -> same blob id.
  const c3 = await arbor.commitContent(
    { repoId: repo.repoId, branch: 'main', content: REPORT_V1, kind: 'report', message: 'v1 again', write: WRITE },
    a,
  );
  await arbor.client.waitForTransaction({ digest: c3.digest });
  console.log('4. same content => same blobId:', c3.blobId === c1.blobId, `(${c3.nodeId} vs ${c1.nodeId} are distinct nodes)`);
  if (c3.blobId !== c1.blobId) throw new Error('content-addressing broke: blob ids differ');

  console.log('\nWALRUS ROUND-TRIP PASS.');
}

function indent(s: string): string {
  return s.split('\n').map((l) => (l ? '     ' + l : l)).join('\n') + '\n';
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 5, delayMs = 2500): Promise<T> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (e) {
      last = e;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
  throw last;
}

main().catch((e) => {
  console.error('WALRUS ROUND-TRIP FAIL:', e);
  process.exit(1);
});
