import { blobIdToInt, blobIdFromInt } from '@mysten/walrus';

export interface WriteOptions {
  epochs?: number;
  permanent?: boolean;
}

/**
 * Storage backend for artifact content. Decouples Arbor from *how* bytes reach
 * Walrus, so the HTTP-gateway store below can be swapped for an SDK/WAL-funded
 * one without touching `ArborClient`.
 */
export interface WalrusStore {
  /** Upload content; returns the Walrus blob id as a u256 (matches on-chain `blob_id`). */
  write(content: Uint8Array, opts?: WriteOptions): Promise<bigint>;
  /** Fetch content by its u256 blob id. */
  read(blobId: bigint): Promise<Uint8Array>;
}

const DEFAULT_PUBLISHER = 'https://publisher.walrus-testnet.walrus.space';
const DEFAULT_AGGREGATOR = 'https://aggregator.walrus-testnet.walrus.space';

export interface HttpWalrusStoreOptions {
  publisherUrl?: string;
  aggregatorUrl?: string;
  defaultEpochs?: number;
}

/**
 * Uploads / downloads via the Walrus public HTTP publisher + aggregator. The
 * gateway pays storage, so the caller needs no WAL token; the blob still lives
 * on the decentralized Walrus storage nodes (only ingestion is relayed).
 * Content-addressing holds: identical bytes yield the same blob id.
 */
export class HttpWalrusStore implements WalrusStore {
  readonly publisherUrl: string;
  readonly aggregatorUrl: string;
  readonly defaultEpochs: number;

  constructor(opts: HttpWalrusStoreOptions = {}) {
    this.publisherUrl = (opts.publisherUrl ?? DEFAULT_PUBLISHER).replace(/\/$/, '');
    this.aggregatorUrl = (opts.aggregatorUrl ?? DEFAULT_AGGREGATOR).replace(/\/$/, '');
    this.defaultEpochs = opts.defaultEpochs ?? 5;
  }

  async write(content: Uint8Array, opts: WriteOptions = {}): Promise<bigint> {
    const epochs = opts.epochs ?? this.defaultEpochs;
    const permanent = opts.permanent ?? true;
    const url = `${this.publisherUrl}/v1/blobs?epochs=${epochs}${permanent ? '&permanent=true' : ''}`;
    const res = await fetch(url, { method: 'PUT', body: content });
    if (!res.ok) {
      throw new Error(`Walrus publish failed (${res.status}): ${await safeText(res)}`);
    }
    return blobIdToInt(blobIdFromResponse(await res.json()));
  }

  async read(blobId: bigint): Promise<Uint8Array> {
    const id = blobIdFromInt(blobId);
    const res = await fetch(`${this.aggregatorUrl}/v1/blobs/${id}`);
    if (!res.ok) {
      throw new Error(`Walrus read failed (${res.status}) for blob ${id}`);
    }
    return new Uint8Array(await res.arrayBuffer());
  }
}

function blobIdFromResponse(json: unknown): string {
  const j = json as {
    newlyCreated?: { blobObject?: { blobId?: string } };
    alreadyCertified?: { blobId?: string };
  };
  const id = j?.newlyCreated?.blobObject?.blobId ?? j?.alreadyCertified?.blobId;
  if (typeof id !== 'string') {
    throw new Error(`unexpected publisher response: ${JSON.stringify(json)}`);
  }
  return id;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '<no body>';
  }
}
