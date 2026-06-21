# Arbor — Frontend

The Arbor dashboard: a viewer for verifiable AI-agent artifact provenance on Walrus + Sui. It reads a repository's on-chain history, re-fetches each artifact from Walrus, and re-checks every version against its on-chain anchor and lineage, so what the UI shows is verified rather than asserted. Built with Vite + React 19 + `@mysten/dapp-kit`.

## Sections

The app is a sidebar dashboard with five sections:

- **Artifacts** — provenance graph, list, and raw `arbor-log` view of every version.
- **Lineage** — branch topology; trace any node back to its root.
- **Agents** — the producing agents plus the on-chain Access and Merge policy that governs them.
- **Anchors** — Walrus-blob to Sui-object notarization.
- **Keys** — ed25519 signing keys.

## Run

```bash
pnpm install
pnpm dev      # http://localhost:5173
pnpm build    # production build
```

## Network

Reads run against **Sui testnet** through a standalone JSON-RPC client. The repositories the viewer opens (`DEMO_REPO` and `PENDING_REPO`) are hardcoded exported constants in `src/lib/arbor.ts`, not environment variables.

## Browse read-only

No wallet is required to explore. The connect gate has a "browse read-only" entry that opens the dashboard against testnet directly. A wallet is only needed to sign merge approval and execution transactions.
