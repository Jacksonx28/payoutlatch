# PayoutLatch

Approve the job. Pay it once.

PayoutLatch is an early NEAR prototype for crypto-paying agencies and DAOs delegating contractor payouts to agents. An owner funds a job with an immutable recipient and amount. Authorized executors can request that payment, but cannot redirect it or execute it again while pending or after success.

## Current status — 13 November 2026

- Rust NEAR contract implemented and compiled to WebAssembly; 10 unit tests pass.
- Local NEAR sandbox integration passes: concurrent execution pays exactly once (verified recipient balance), paid replay rejects, unauthorized callback rejects, failed transfer reopens the job, and owner cancellation returns its principal.
- Browser workflow implemented and manually exercised; 5 JavaScript model tests pass.
- Browser payments are **simulated**, reset on reload, and do not connect to a wallet or deployed contract.
- No live testnet deployment, AI invoice extraction, real shared receipts, or hackathon submission yet.
- This is a development prototype, not audited financial software.

## Try the interface

Requires Node.js 20 or newer. No runtime packages required.

```sh
npm start
# Open http://127.0.0.1:4174
npm test
```

1. Open **Workspace**, select **Approve a payout**, enter a unique ID, job title, named `.testnet` recipient and positive amount. The job appears as Ready to pay.
2. Select **Pay**. Observe Pending followed by Paid, then open its sample receipt.
3. Open **Field guide** and select **Try two requests**. The activity feed shows Agent B blocked and one simulated successful payment.
4. Revoke agent access, then attempt another payout. It is rejected. Existing in-flight requests are unaffected by revocation.
5. Cancel an approved job to simulate refunding its principal to its owner.

## Contract

One contract serves one owner. `new` must be called by that owner; deploy and initialize together in a live deployment. `set_executor` permits up to 20 executor accounts. For production, executors should have narrowly scoped keys and the contract account's upgrade keys need an explicit custody policy.

`approve_job(job_id, recipient, amount)` is owner-only. Attach exactly the principal plus **0.02 NEAR** retained storage reserve. Amounts are decimal strings in yoctoNEAR, not floating point numbers. Job IDs are permanent and limited to 96 bytes. No document contents are stored.

`execute(job_id)` accepts only the job identifier. The stored recipient and amount determine the transfer. Attach at least 40 Tgas; 100 Tgas is recommended in tooling.

State transitions:

```text
Approved -> Pending -> Paid
                    -> Approved (confirmed transfer failure)
Approved -> RefundPending -> Cancelled
                          -> Approved (confirmed refund failure)
```

Both Pending states reject new transfers. The private callback checks the attempt number and expected state. A timeout in a client is never proof of failure and must not reopen a job. A lost/failed callback conservatively leaves the job pending; there is no unsafe administrative unlock. The 0.02 NEAR storage reserve is not refunded on cancellation because identifiers and terminal states remain stored.

Build with the pinned Rust 1.86.0 toolchain and NEAR's optimizer. Raw `cargo build` output is not the deployment artifact:

```sh
npm ci
npm run test:contract
npm run build:contract
npm run test:sandbox
```

The current workspace has isolated Rust tooling under `.tooling/` (ignored). The scripts use it automatically when present; otherwise install Rust through rustup. The compatible, optimized deployment artifact is `artifacts/payoutlatch.wasm`.

## Boundaries

The guarantee is at most one successful transfer **per approved job ID**, for this contract's execution path. Creating another ID authorizes another payment. Payments made outside this contract are not deduplicated. The owner decides whether work is delivered; no AI or chain verifies delivery. Contract administrators with full-access deployment keys can change the code. Public NEAR state exposes recipients, amounts and job identifiers; do not place confidential invoice text in IDs.

Before submission: connect a wallet, deploy and exercise actual testnet payments, produce real transaction receipts, add the constrained invoice-to-job matching workflow, verify fresh-install steps, collect user feedback, and publish the required public repository and X demo. Do not present the simulated UI as live integration.

## Hackathon provenance and dependencies

Original project source created during the hackathon window on 13 November 2026 (Africa/Lagos), with AI coding assistance. No pre-existing product code copied. Dependencies: NEAR SDK 5.17.2 (Rust), NEAR Workspaces 5.0.0 (sandbox development only), cargo-near 0.23.0 (build only), and their lockfile-pinned transitive dependencies. The static interface uses browser-native APIs and a vendored GSAP 3.15.1 animation runtime. Google Fonts supplies IBM Plex Sans, IBM Plex Mono and Instrument Serif, with system fallbacks. The mark and payment-document illustration are original CSS. The npm development toolchain has audit advisories; it is not shipped to the browser and should not be used with production credentials. The last production dependency audit reported zero vulnerabilities.

Official resources: https://nearhackathon.com/HACKATHON.md and https://docs.near.org/smart-contracts/anatomy/crosscontract

Potential tracks: AI Security & Defense; Autonomous Business once the agent workflow is integrated. Testnet eligibility does not remove the need to demonstrate a working integration. No submission or prize claim has been made.

## Interface direction and references

The interface uses warm paper, ink-blue typography, fine rules and a restrained blue action color. Overview, Workspace, Field guide and Network are distinct hash-routed screens; sample ledger state persists while switching screens and resets on reload. The overview uses an original dimensional payment-document illustration, while operational screens prioritize readable ledger data. Reference workflows: [ThreeUI](https://threeui.com/) for dimensional composition, [Taste](https://www.tasteskill.dev/) for typography and restraint, [21st.dev](https://21st.dev/) for control composition, and [GSAP](https://gsap.com/) for purposeful state transitions. No template source or premium assets were copied.

GSAP 3.15.1 is vendored from the pinned npm package in `dist/vendor/gsap.min.js`, retaining its copyright/license header ([standard license](https://gsap.com/standard-license)). Google Fonts supplies IBM Plex Sans, IBM Plex Mono and Instrument Serif, with system fallbacks. Animations honor reduced-motion preferences and the app works without GSAP. Payment animations reflect the local simulation's state, not network confirmations. Search filters title, milestone ID and recipient; narrow layouts use payout cards.

UI verification: five ledger tests passed; browser checks covered search, approval, payment pending/success, receipt details, duplicate-request locking and revoked payment controls. Desktop, tablet and 390px mobile layouts were visually reviewed. Live-wallet payments remain pending.

## Guided demo and network choice

Start with **Try a sample payout** on Overview: review the prefilled sample job, approve, pay, then open its receipt. Progress follows that job's actual simulated state. The recovery scenario confirms a failed simulated transfer before allowing a retry under the same ID. The inbox also filters cancelled jobs. All sample data is ephemeral and no wallet or live AI is connected.

Use NEAR testnet for the first contract deployment. The official hackathon rules checked November 13, 2026 allow testnet-only projects in every track (Q-010); an own NEAR contract can satisfy integration requirements (Q-011). The website remains web-hosted, independently of the contract network. Prize receipt requires a separate mainnet account. No mainnet deployment is included in this release. Source: https://nearhackathon.com/HACKATHON.md

The website's network section accurately separates the working simulation and local contract tests from pending contract deployment, wallet connection and explorer-backed receipts. Current Site access remains owner-private. Judge access or the permitted reproducible local-demo route must be addressed before submission.

Validation for this release: ledger tests passed; browser walkthrough completed approval → pending → paid → receipt (3/3); the recovery walkthrough confirmed failure → same-ID retry → paid. Mobile layout checked at 390px with no page overflow. Browser reported no JavaScript errors during these checks.

Editorial redesign verification: 1280px desktop, 798px tablet and 390px mobile reviewed. Navigation changes the visible screen and supports browser history. The guided payout completed 3/3 steps; search found its paid record after switching to Workspace. The duplicate-request scenario and reduced-motion fallback remain available.
