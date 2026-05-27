// Arbor Walrus client wrapper
// 注意：@mysten/walrus 是獨立套件，不在 @mysten/sui 內

// 兩種選擇：
// (a) 用 @mysten/walrus SDK（功能完整）：
//     import { WalrusClient } from '@mysten/walrus';
//
// (b) 直接 fetch publisher / aggregator HTTP API（簡單）：
//     用下面這個 wrapper

const PUBLISHER_TESTNET = 'https://publisher.walrus-testnet.walrus.space';
const AGGREGATOR_TESTNET = 'https://aggregator.walrus-testnet.walrus.space';

export interface WalrusUploadResult {
  blobId: string;
  objectId?: string;
  registeredEpoch?: number;
  size: number;
}

export async function uploadBlob(
  data: Uint8Array,
  opts: { epochs?: number; permanent?: boolean; sendTo?: string } = {},
): Promise<WalrusUploadResult> {
  const params = new URLSearchParams();
  if (opts.epochs) params.set('epochs', String(opts.epochs));
  if (opts.permanent) params.set('permanent', 'true');
  if (opts.sendTo) params.set('send_object_to', opts.sendTo);

  const res = await fetch(`${PUBLISHER_TESTNET}/v1/blobs?${params}`, {
    method: 'PUT',
    body: data as BodyInit,
  });
  const json = await res.json();
  const created = json.newlyCreated?.blobObject ?? json.alreadyCertified?.blobObject;
  return {
    blobId: created.blobId,
    objectId: created.id,
    registeredEpoch: created.registeredEpoch,
    size: created.size,
  };
}

export async function downloadBlob(blobId: string): Promise<Uint8Array> {
  const res = await fetch(`${AGGREGATOR_TESTNET}/v1/blobs/${blobId}`);
  if (!res.ok) {
    throw new Error(`Walrus read failed (${res.status}) for blob ${blobId}`);
  }
  return new Uint8Array(await res.arrayBuffer());
}
