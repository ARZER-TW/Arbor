import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';
import { Transaction } from '@mysten/sui/transactions';

export type Network = 'mainnet' | 'testnet' | 'devnet' | 'localnet';

export class ArborClient {
  readonly client: SuiJsonRpcClient;
  readonly packageId: string;

  constructor(opts: { network: Network; packageId: string }) {
    this.client = new SuiJsonRpcClient({
      url: getJsonRpcFullnodeUrl(opts.network),
      network: opts.network,
    });
    this.packageId = opts.packageId;
  }

  // Example: build a `create` PTB targeting your module's `main::create(name)`
  buildCreateTx(name: string): Transaction {
    const tx = new Transaction();
    tx.moveCall({
      target: `${this.packageId}::main::create`,
      arguments: [tx.pure.vector('u8', Array.from(new TextEncoder().encode(name)))],
    });
    return tx;
  }
}
