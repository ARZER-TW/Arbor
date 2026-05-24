// Arbor Seal client wrapper
// 注意：@mysten/seal 是獨立套件
import { SealClient, SessionKey } from '@mysten/seal';
import { SuiJsonRpcClient, getJsonRpcFullnodeUrl } from '@mysten/sui/jsonRpc';

// Testnet decentralized key server（從 https://seal-docs.wal.app/Pricing 拿）
const DECENTRALIZED_KEY_SERVER_OBJ_ID =
  '0xb012378c9f3799fb5b1a7083da74a4069e3c3f1c93de0b27212a5799ce1e1e98';
const AGGREGATOR_URL = 'https://seal-aggregator-testnet.mystenlabs.com';

export function newSealClient() {
  const suiClient = new SuiJsonRpcClient({
    url: getJsonRpcFullnodeUrl('testnet'),
    network: 'testnet',
  });
  return new SealClient({
    suiClient,
    serverConfigs: [
      {
        objectId: DECENTRALIZED_KEY_SERVER_OBJ_ID,
        aggregatorUrl: AGGREGATOR_URL,
        weight: 1,
      },
    ],
    verifyKeyServers: false, // 生產建議 true
  });
}

export { SealClient, SessionKey };
