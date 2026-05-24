# Arbor

> 此檔由 `/sui-init-project` 產生。專案層守則優先於 `~/.claude/rules/sui-stack.md`。

## Project type

Hybrid (Move + TS SDK + dApp frontend)，整合 Walrus（去中心化 blob 儲存）+ Seal（threshold IBE access control）。

結構：
- `move/Arbor/` — 主 Move package
- `move/Arbor-seal-policy/` — Seal `seal_approve` access policy package
- `sdk/` — `@Arbor/sdk` TypeScript SDK（`@mysten/sui` v2）
- `frontend/` — Vite + React 19 + `@mysten/dapp-kit` dApp

## Sui stack used

打勾本專案實際依賴的模組（影響 Claude 該 grep 哪些 vendor）：

- [x] sui-framework            (Move standard library)
- [ ] sui-rust-sdk             (`sui-sdk` Rust crate)
- [x] sui-ts-sdk               (`@mysten/sui` npm package)
- [ ] sui-cryptography         (bls12381 / ed25519 / ristretto255 / etc.)
- [ ] deepbook-v3              (DEX / order book)
- [x] walrus                   (decentralized blob storage)
- [x] seal                     (threshold IBE)
- [ ] nautilus                 (TEE / Nitro enclave)
- [ ] zk (groth16/bulletproofs)

## Pinned versions

<!-- SUI-PINNED-VERSIONS:BEGIN -->
**Pinned versions** (as of 2026-05-24, network: `testnet`)

| Component | Track | Ref | Commit |
|-----------|-------|-----|--------|
| Sui Framework | testnet | `tags/testnet-v1.71.0` | `a3cc4467c9de` |
| Sui CLI       | testnet | `suiup default set sui@testnet` | `sui 1.71.0-a3cc4467c9de` |
| Seal           | main    | `heads/main` | `bd1b999f693e` |
| Walrus         | main    | `heads/main` | `76254d1d4eb7` |

Vendor 路徑（透過 `vendor/` symlink 連到 `~/sui-stack-vendor/`）：
- `vendor/sui` → `~/sui-stack-vendor/sui-testnet`
- `vendor/seal` → `~/sui-stack-vendor/seal`
- `vendor/walrus` → `~/sui-stack-vendor/walrus`

_由 `/sui-pin-versions` 維護，請勿手改此區塊。_
<!-- SUI-PINNED-VERSIONS:END -->

額外手動鎖定的 deps（如 walrus contract version、specific seal commit）放在這之後。

## Vendor symlinks

本專案在 `vendor/` 下軟連結到 `~/sui-stack-vendor/` 對應軌：

```
vendor/sui      → ~/sui-stack-vendor/sui-testnet
vendor/seal     → ~/sui-stack-vendor/seal       (if used)
vendor/walrus   → ~/sui-stack-vendor/walrus     (if used)
vendor/deepbook → ~/sui-stack-vendor/deepbookv3 (if used)
vendor/nautilus → ~/sui-stack-vendor/nautilus   (if used)
```

切版本：`/sui-pin-versions` 會更新本檔的 commit hash 並重建 symlink。

## Build commands

```bash
# Move
cd move/Arbor && sui move build && sui move test
cd move/Arbor-seal-policy && sui move build && sui move test

# SDK
cd sdk && pnpm install && pnpm build && pnpm test

# Frontend
cd frontend && pnpm install && pnpm dev    # 開發
cd frontend && pnpm build                  # 產出
```

## Domain knowledge / project invariants

{{PROJECT_SPECIFIC_RULES}}
<!--
這裡放只有本專案才有的規則。例如：
- Abyssal 的協議不變量（SPEC v2.1.1 抽出的硬性規則）
- DEX 專案的撮合邏輯邊界
- 任何「Claude 不該自由發揮」的部分
-->

## Hook behavior

PostToolUse hook (`~/.claude/hooks/sui/post-edit-move.sh`) 在編輯本專案 .move 檔時自動跑 `sui move build`。
- 暫時關閉本次編輯：`export CLAUDE_SUI_HOOK_BUILD=0`
- 永久關閉本專案：`touch .claude/sui-hooks-off`

## References (project-internal)

{{INTERNAL_DOCS}}
<!-- e.g. links to docs/SPEC.md, docs/ARCHITECTURE.md -->

## References (external)

- 全域 Sui 守則：`~/.claude/rules/sui-stack.md`
- 操作手冊：`~/.claude/skills/sui-stack-meta/SKILL.md`
- Vendor 索引：`~/sui-stack-vendor/STATUS.md`
