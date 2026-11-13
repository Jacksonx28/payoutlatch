# PayoutLatch submission draft

## One-line pitch

Approve a contributor payout once. Let an authorized agent execute it on NEAR without changing the terms or paying the same job twice.

## Problem

Agent workflows retry. A payout action that succeeds onchain but loses its client response can be submitted again. Meanwhile, giving an agent a broad treasury key grants more authority than it needs. Small agencies and contributor teams need a narrow payment instruction they can inspect, delegate and revoke.

## Product

An owner funds a job with a fixed recipient, amount and optional executor. The NEAR contract locks the job before transferring, settles it through a private attempt-checked callback, and rejects simultaneous or repeated executions. Confirmed transfer failures return to Approved; the owner can retry or refund. Each owner has an independent namespace and job list. The UI includes wallet connection, approval review, receipts, executor revocation and live-verifiable testnet evidence.

## What is live

- Contract: `payoutlatch-dev-f3d79e2d.testnet`
- Repo: https://github.com/Jacksonx28/payoutlatch
- App: https://payoutlatch.israeljackson854.chatgpt.site (confirm public judge access before submission)
- Evidence: `docs/TESTNET_PROOF.md` and the app's Onchain proof view
- Reproducible local run: `npm ci && npm run build && npm start`
- Agent adapter: `node scripts/agent.mjs KEY_FILE EXISTING_JOB_ID`

## Suggested fit

AI Security & Defense: an onchain authorization boundary for agent-triggered payments. The executor is an integration adapter, not a claimed autonomous AI model. Confirm the selected track's current wording; the public implementation demonstrates payment controls rather than an LLM reasoning feature.

## 90-second recording plan

1. **0–15s — Problem:** “Agents retry work. Money should not move twice because a request was repeated.” Show the overview and the human/agent/chain split.
2. **15–40s — Live use:** Connect a funded testnet wallet. Create a 0.001 NEAR job to a separate test account; show the exact deposit and optional executor. Approve in Meteor Wallet.
3. **40–60s — Settlement:** Release the job and open the Paid receipt. Show its explorer transaction. Explain that the executor cannot change amount or recipient.
4. **60–80s — Evidence:** Open Onchain proof, Verify live state, inspect the concurrency test and failed-delivery refund. Point to the public reproducible proof script for adversarial execution.
5. **80–90s — Boundary:** “Testnet prototype; code and upgrade-key limits are public. Built on NEAR.” Show repo URL.

## Before pressing submit

- Confirm current [official rules](https://nearhackathon.com/HACKATHON.md), track and deadline (last checked: Nov 14, 2026, 23:59 UTC).
- Record the working demo; publish the required X post with @NEARProtocol and #NEARHackathon. Include public repo and a working demo route.
- Supply your own mainnet prize address. The testnet development account cannot receive mainnet prizes.
- Verify the hosted URL works for a signed-out reviewer, or explicitly use the permitted reproducible local-demo path.
- Keep the public repo and demo available through judging. Do not claim an audit, production readiness or AI invoice adjudication.

This is preparation, not a submitted entry. The owner must review and submit the final payload.
