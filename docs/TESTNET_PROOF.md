# Live testnet evidence

Verified 2026-11-13T21:09:49.546Z. Contract: payoutlatch-dev-f3d79e2d.testnet.

- Two concurrent executions: exactly one succeeds; recipient receives exactly 0.001 NEAR.
- Replay of a paid job is rejected.
- Confirmed transfer failure unlocks the job; owner cancellation refunds principal.
- Another account cannot cancel; a revoked executor cannot execute.

## One payout. Two execution attempts.

Job: `payoutlatch-dev-f3d79e2d.testnet:race-mwfgzrwn`

Final state: Paid. [Approval](https://testnet.nearblocks.io/txns/7D4SFeQeXCvHXP1ghAu3s7LxFsaBdxnuEfEXRahy11P2) · [Settlement](https://testnet.nearblocks.io/txns/48SRffSWFKRDUh41eSMdRFjkK75WC7qqffosCk8iCYm1)

## Failed delivery → owner refund

Job: `payoutlatch-dev-f3d79e2d.testnet:recovery-mwfgzrwn`

Final state: Cancelled. [Approval](https://testnet.nearblocks.io/txns/GdAz7u2RiVs1PXP9rSQnwQoWd9GAzbgncfZAqTb8e8fi) · [Settlement](https://testnet.nearblocks.io/txns/HKp2HDFQ7ngqhX194SjNuAyWfDZAYXBse4UBRBTcewcm) · [Failed delivery](https://testnet.nearblocks.io/txns/CdQ8bRhcPSDJJaQgD2B8q7iU1hBk2rUHPSinUGPWhr1c)

## Revoked executor

Job: `payoutlatch-dev-f3d79e2d.testnet:revoked-mwfgzrwn`

Final state: Cancelled. [Approval](https://testnet.nearblocks.io/txns/7jqvQZE24vSX9eNw6gyC68xorvb8aJoFaossh2HAoxy2) · [Settlement](https://testnet.nearblocks.io/txns/2wL6eHKmVYcpuWzWQB596xCh22d4LK9xtfYqcegihMZG)
