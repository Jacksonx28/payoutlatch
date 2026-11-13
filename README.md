# PayoutLatch

**Human-approved payouts. Agent execution with an onchain limit.**

An agency owner approves a contributor, an exact NEAR amount and an optional agent account. That executor can release the payment, but cannot change its destination, increase its amount or pay the same job twice. A transfer locks the job before it leaves the contract; only its callback can settle or reopen it.

## Working release

- **NEAR testnet contract:** [`payoutlatch-dev-f3d79e2d.testnet`](https://testnet.nearblocks.io/address/payoutlatch-dev-f3d79e2d.testnet), version `2.0.0-testnet`.
- **Website:** [PayoutLatch](https://payoutlatch.israeljackson854.chatgpt.site). Hosted access may require the owner's permission; the complete local demo below works independently of Sites.
- **Live receipts:** [verification report](docs/TESTNET_PROOF.md), also in the app's **Onchain proof** view. No wallet is needed to inspect them.
- Wallet connection, funded approval, release, owner refund, executor revocation, owner-specific lists, search and public job links are implemented.
- A real testnet run demonstrated one successful transfer from two concurrent executions, exact recipient balance increase, rejected replay, failed-delivery recovery, owner-only cancellation and executor revocation.
- 14 Rust unit tests, a real local NEAR sandbox integration and 5 JavaScript model/precision tests pass. The JS demo model is retained as a test fixture; it is **not** used for live payment state.

This is a testnet prototype, not audited production financial software. There is no AI model making approval decisions. The included executor can be called by an agent, scheduler or human.

## Run locally

Use Node.js 20.19+ (22 LTS recommended), npm and a browser. The checked-in static build can run immediately; a clean dependency installation rebuilds the wallet bundle.

```sh
git clone https://github.com/Jacksonx28/payoutlatch.git
cd payoutlatch
npm ci
npm run build
npm start
# http://127.0.0.1:4174
```

1. Open **Onchain proof → Verify live state**. Open the paid receipt and its explorer transaction. This is a read-only demo with real chain data.
2. Select **Connect wallet**. Use [Meteor Wallet testnet](https://wallet.meteorwallet.app), create/fund a separate test account if needed, and approve the connection. The popup must be allowed.
3. Select **New payout**. Use an existing recipient, a unique reference, an amount such as `0.001` and optionally an executor account. The app verifies recipient existence before approval. Test accounts only; no real funds.
4. Review the wallet transaction. Deposit = principal + **0.02 NEAR** retained storage; gas is extra. The contract checks the exact deposit.
5. Open the job and **Release payout**, or send its copied job link to the assigned executor. Inspect the callback-confirmed state and explorer transaction.
6. For a second Approved job, **Cancel & refund** returns its principal to its owner. **Revoke executor** removes its delegation while keeping owner execution available.

Meteor Wallet creates a limited function-call access key for `execute`, `cancel` and `set_executor`. Zero-deposit actions may use that key after an in-app confirmation; the payable approval requires wallet authorization. Disconnect removes the local wallet connection. Never paste a seed phrase into PayoutLatch. The application contains no development-account private keys.

## Agent execution

The executable adapter accepts only an existing job ID. It cannot approve a job, set a new amount or redirect funds. Terminal jobs are a no-op; pending jobs require a later read, not another approval.

```sh
node scripts/agent.mjs /absolute/path/to/executor-testnet.json owner.testnet:reference
```

The key file is local, outside the public repository:

```json
{"network_id":"testnet","account_id":"your-agent.testnet","private_key":"YOUR_LOCAL_TESTNET_KEY"}
```

Use a dedicated testnet executor account, preferably with an access key scoped to this contract's `execute` method. The owner sets that account in the approval. To integrate any agent framework, invoke the command on its approved job ID and inspect the returned chain status. A failed/unknown network response must trigger a state read before retry. The contract independently enforces authorization and duplicate protection.

## Contract API

Each job has its own owner. References are namespaced as `owner_account:reference`; another wallet cannot reserve your references. Records and terminal IDs are permanent.

| Method | Parameters | Authority / deposit |
|---|---|---|
| `new` | none | Deploy and initialize atomically on a fresh account |
| `approve_job` | `reference`, `title`, `recipient`, `amount`, `executor` (account or null) | Any wallet becomes that job's owner; exactly principal + 0.02 NEAR |
| `execute` | `job_id` | Job owner or its current executor; no deposit |
| `cancel` | `job_id` | Job owner; refunds principal to that owner |
| `set_executor` | `job_id`, `executor` (account or null) | Job owner, Approved only |
| `get_job` | `job_id` | Public view, null if absent |
| `get_jobs` | `owner`, optional `from_index`, optional `limit` | Public view, maximum 50 per page |
| `get_job_count` | `owner` | Public view |
| `storage_reserve`, `version` | none | Public views |

`amount` is an integer decimal string in yoctoNEAR (10^24 per NEAR), never a floating point value. References: 1–64 ASCII letters, digits, `_` or `-`. Titles: nonblank, at most 120 UTF-8 bytes. The browser displays human NEAR decimals using BigInt conversion. Use 100 Tgas for execution/refund; the contract rejects less than 40 Tgas.

```text
Approved → Pending       → Paid
                         → Approved (confirmed transfer failure)
Approved → RefundPending → Cancelled
                         → Approved (confirmed refund failure)
```

The private callback verifies attempt number and expected state. A timeout is not a confirmed failure. There is no administrative force-unlock; callback failure may leave a job pending. Cancellation retains the storage reserve because the terminal record remains.

## Contract build and verification

Rust 1.86.0 is pinned in `rust-toolchain.toml`; install it with rustup and add `wasm32-unknown-unknown`. The scripts use isolated `.tooling/` installations if present. NEAR's optimizer produces `artifacts/payoutlatch.wasm`; do not deploy an unoptimized cargo artifact.

```sh
npm test
npm run test:contract
npm run build:contract
npm run test:sandbox
```

The sandbox checks concurrent/replay protection, exact recipient balance, cross-owner isolation, namespaced IDs, private callbacks, failed transfer/refund and revocation. It starts a local NEAR node and requires network/download access the first time.

To deploy **your own disposable testnet instance**, rather than changing the public demo:

```sh
node scripts/create-testnet.mjs
node scripts/deploy-testnet.mjs
npm run test:live
```

Creation uses the public testnet account helper (subject to availability). Credentials go only to ignored `credentials/` with restrictive permissions. Deployment initializes atomically, verifies the uploaded WASM against its SHA-256, and writes public `dist/config.json`. The live proof script creates disposable subaccounts and spends test tokens. It updates `dist/evidence.json` and the proof report. Review those public changes before publishing your fork.

Deployed WASM SHA-256: `6599b312a6d84698ffcd1a328f0475e951a9baa5ac73c7ecc58589b75fc3804b`.

## Browser verification

Desktop (1440px), tablet (800px) and mobile (390px) layouts were reviewed. Public receipts were queried from live testnet; the approval form showed the exact 0.021 NEAR deposit for a 0.001 payment. The Meteor adapter loads without startup errors. A user-signed browser transaction remains to be verified; the recorded live transaction tests were run with disposable development keys through the NEAR SDK.

## Trust boundaries

- At most one successful transfer **per approved job ID**, through this contract. A new reference is a new approval; payments outside the contract are not deduplicated.
- Human owners decide whether work is satisfactory. There is no invoice identity matching, dispute adjudication, delivery oracle or AI-quality verification.
- The deployer retains a full-access upgrade key on the testnet account. Code can be replaced. A production release needs audit and an explicit immutable/upgrade governance policy.
- Recipients, amounts, titles and references are public. Do not put confidential invoice content in them.
- RPC reads depend on the configured provider. The UI labels refresh failures and uses confirmed chain state for status. Explorer transaction links are a convenience; copied public job links can always query current state.
- Testnet only. No mainnet toggle or automatic network migration. Storage reserve and gas are not refundable.

## Hackathon submission

Testnet-only projects are eligible in every track under Q-010 of the [official FAQ](https://nearhackathon.com/HACKATHON.md); Q-011 permits your own NEAR contract. The website is web-hosted; the payment contract is deployed on NEAR. Prize receipt requires a separate **mainnet** account. No prize account, X post or final submission has been supplied by this repository.

See [submission copy and demo script](docs/SUBMISSION.md). Verify the live rules and deadlines immediately before submission. Do not describe this as audited, unconditionally secure or an autonomous AI model.

## Design and provenance

Original project created during the hackathon window on 13 November 2026 with AI coding assistance. The interface is a compact NEAR-oriented payment workspace: black, off-white, green actions, original latch mark, public proof page and responsive controls. It uses DM Sans and Space Grotesk from Google Fonts, with system fallbacks.

Reference workflows: [ThreeUI](https://threeui.com/) for dimensional explanation, [Taste](https://www.tasteskill.dev/) for typography and restraint, [21st.dev](https://21st.dev/) for controls and states, [GSAP](https://gsap.com/) for short entrance motion respecting reduced motion. No premium template or assets were copied. GSAP's pinned vendored runtime retains its license header.

NEAR SDK 5.17.2, Wallet Selector 10.1.4, near-api-js 5.1.1, esbuild 0.28.2 and all transitive versions are locked. The npm audit reports low-severity crypto-library advisories in production dependencies and higher-severity advisories in the sandbox/build development toolchain. Pinned overrides for nanoid and decode-uri-component remove the reported high-severity browser advisories (production audit: 15 low, zero moderate/high/critical). This is not a zero-advisory production release; do not use production keys with these development scripts.
