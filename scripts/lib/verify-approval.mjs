// Read-only evidence checks. A chain signature does not identify the wallet UI used.
import assert from 'node:assert/strict';
export const TESTNET_RPC = 'https://rpc.testnet.fastnear.com';
export const STORAGE_RESERVE = 20000000000000000000000n;
export function checkConfig(config) {
  assert.equal(config.networkId, 'testnet', 'Testnet only');
  assert.match(config.contractId, /^[a-z0-9_-]+(?:\.[a-z0-9_-]+)*\.testnet$/, 'Expected a named testnet contract');
  assert.equal(config.version, '2.0.0-testnet', 'Unsupported contract version');
  assert.equal(config.storageReserve, String(STORAGE_RESERVE), 'Unexpected storage reserve');
}
export function checkApproval(result, expected, contractId) {
  const tx = result.transaction;
  assert.ok(tx, 'Transaction not available; retry this read, not the approval');
  assert.equal(result.final_execution_status, 'FINAL', 'Transaction is not final yet; retry this read');
  assert.equal(tx.hash, expected.hash, 'Wrong transaction hash');
  assert.equal(tx.signer_id, expected.owner, 'Wrong transaction signer');
  assert.equal(tx.receiver_id, contractId, 'Wrong contract');
  assert.equal(tx.actions?.length, 1, 'Expected one direct approval action');
  const call = tx.actions[0].FunctionCall;
  assert.equal(call?.method_name, 'approve_job', 'Transaction is not an approval');
  const args = JSON.parse(Buffer.from(call.args, 'base64').toString('utf8'));
  for (const field of ['reference', 'recipient', 'amount', 'executor']) {
    assert.deepEqual(args[field], expected[field], `Approval ${field} differs from reviewed terms`);
  }
  assert.equal(call.deposit, String(BigInt(expected.amount) + STORAGE_RESERVE), 'Incorrect approval deposit');
  assert.ok(Object.hasOwn(result.status ?? {}, 'SuccessValue'), 'Approval execution did not succeed');
  const jobId = `${expected.owner}:${expected.reference}`;
  assert.equal(JSON.parse(Buffer.from(result.status.SuccessValue, 'base64').toString('utf8')), jobId, 'Unexpected approval return value');
  const receipts = result.receipts_outcome;
  assert.ok(Array.isArray(receipts) && receipts.length, 'Missing receipt outcomes');
  for (const item of [result.transaction_outcome, ...receipts]) {
    const status = item?.outcome?.status;
    assert.ok(status && (Object.hasOwn(status, 'SuccessValue') || Object.hasOwn(status, 'SuccessReceiptId')), 'A transaction receipt failed or is incomplete');
  }
  const approved = receipts.some(({outcome}) => outcome.executor_id === contractId && outcome.logs.some(log => {
    if (!log.startsWith('EVENT_JSON:')) return false;
    try {
      const event = JSON.parse(log.slice(11));
      return event.standard === 'payoutlatch' && event.version === '2.0.0' && event.event === 'approved' && event.data.some(d => d.job_id === jobId);
    } catch { return false; }
  }));
  assert.ok(approved, 'Missing contract approval event for this job');
  return {jobId, args, deposit: call.deposit, publicKey: tx.public_key};
}
export function checkJob(job, expected, approval) {
  assert.ok(job, 'Approval job not found in final state; retry this read');
  assert.equal(job.job_id, approval.jobId, 'Wrong job');
  for (const field of ['owner', 'reference', 'recipient', 'amount']) {
    assert.equal(job[field], expected[field], `Onchain ${field} differs from reviewed terms`);
  }
  assert.equal(job.title, approval.args.title, 'Onchain title differs from signed approval');
  assert.ok(['Approved', 'Pending', 'Paid', 'RefundPending', 'Cancelled'].includes(job.status), 'Unknown job state');
  return {
    status: job.status,
    readyForRelease: job.status === 'Approved',
    currentExecutor: job.executor,
    executorChangedSinceApproval: job.executor !== expected.executor,
  };
}
