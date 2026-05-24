import {
  ConnectButton,
  SuiClientProvider,
  WalletProvider,
  createNetworkConfig,
  useCurrentAccount,
} from '@mysten/dapp-kit';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@mysten/dapp-kit/dist/index.css';

// Provider tree 順序：Query → SuiClient → Wallet（不可顛倒）
const queryClient = new QueryClient();
const { networkConfig } = createNetworkConfig({
  testnet: { url: 'https://fullnode.testnet.sui.io:443', network: 'testnet' },
  mainnet: { url: 'https://fullnode.mainnet.sui.io:443', network: 'mainnet' },
});

function Inner() {
  const account = useCurrentAccount();
  if (!account) return <ConnectButton />;
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Arbor</h1>
        <ConnectButton />
      </header>
      <p>Connected: <code>{account.address}</code></p>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <SuiClientProvider networks={networkConfig} defaultNetwork="testnet">
        <WalletProvider autoConnect>
          <Inner />
        </WalletProvider>
      </SuiClientProvider>
    </QueryClientProvider>
  );
}
