import test from 'node:test';
import assert from 'node:assert/strict';
import {checkConfig, checkApproval, checkJob, STORAGE_RESERVE} from '../scripts/lib/verify-approval.mjs';
const contract = 'payoutlatch.testnet';
const expected = {hash: 'test-hash', owner: 'owner.testnet', reference: 'browser-1', recipient: 'payee.testnet', amount: '1000000000000000000000', executor: null};
const jobId = 'owner.testnet:browser-1';
const base64 = value => Buffer.from(JSON.stringify(value)).toString('base64');
function fixture() {
  const args = {reference: expected.reference, title: 'Browser approval', recipient: expected.recipient, amount: expected.amount, executor: null};
  return {
    final_execution_status: 'FINAL', status: {SuccessValue: base64(jobId)},
    transaction: {hash: expected.hash, signer_id: expected.owner, receiver_id: contract, public_key: 'ed25519:fixture', actions: [{FunctionCall: {method_name: 'approve_job', args: base64(args), deposit: String(BigInt(expected.amount) + STORAGE_RESERVE)}}]},
    transaction_outcome: {outcome: {status: {SuccessReceiptId: 'receipt'}}},
    receipts_outcome: [{outcome: {executor_id: contract, status: {SuccessValue: base64(jobId)}, logs: ['EVENT_JSON:' + JSON.stringify({standard: 'payoutlatch', version: '2.0.0', event: 'approved', data: [{job_id: jobId}]})]}}],
  };
}
const job = () => ({...expected, job_id: jobId, title: 'Browser approval', status: 'Approved'});
test('matches a final signed approval and exact deposit', () => {
  const approval = checkApproval(fixture(), expected, contract);
  assert.equal(approval.deposit, '21000000000000000000000');
  assert.deepEqual(checkJob(job(), expected, approval), {status: 'Approved', readyForRelease: true, currentExecutor: null, executorChangedSinceApproval: false});
});
test('rejects unrelated transactions and reviewed-term mismatches', () => {
  for (const mutate of [
    r => r.transaction.hash = 'another-hash',
    r => r.transaction.signer_id = 'stranger.testnet',
    r => r.transaction.receiver_id = 'another.testnet',
    r => r.transaction.actions[0].FunctionCall.method_name = 'execute',
    r => r.transaction.actions.push(r.transaction.actions[0]),
    r => r.transaction.actions[0].FunctionCall.deposit = expected.amount,
    r => r.status.SuccessValue = base64('owner.testnet:other'),
  ]) { const r = fixture(); mutate(r); assert.throws(() => checkApproval(r, expected, contract)); }
  for (const field of ['reference', 'recipient', 'amount', 'executor']) assert.throws(() => checkApproval(fixture(), {...expected, [field]: 'wrong'}, contract));
});
test('does not confuse pending, failed or missing receipt evidence with success', () => {
  for (const mutate of [
    r => r.final_execution_status = 'EXECUTED_OPTIMISTIC',
    r => r.status = {Failure: {ActionError: 'rejected'}},
    r => r.receipts_outcome[0].outcome.status = {Failure: 'failure'},
    r => r.receipts_outcome[0].outcome.logs = [],
    r => r.receipts_outcome[0].outcome.executor_id = 'other.testnet',
    r => r.receipts_outcome = [],
  ]) { const r = fixture(); mutate(r); assert.throws(() => checkApproval(r, expected, contract)); }
});
test('requires matching immutable terms; reports later settlement and delegation changes accurately', () => {
  const approval = checkApproval(fixture(), expected, contract);
  assert.throws(() => checkJob(null, expected, approval));
  for (const field of ['job_id', 'owner', 'reference', 'recipient', 'amount', 'title', 'status']) assert.throws(() => checkJob({...job(), [field]: 'wrong'}, expected, approval));
  assert.deepEqual(checkJob({...job(), status: 'Paid', executor: 'new.testnet'}, expected, approval), {status: 'Paid', readyForRelease: false, currentExecutor: 'new.testnet', executorChangedSinceApproval: true});
});
test('rejects mainnet and incompatible configs before RPC', () => {
  const config = {networkId: 'testnet', contractId: contract, version: '2.0.0-testnet', storageReserve: String(STORAGE_RESERVE)};
  checkConfig(config);
  for (const [field, value] of [['networkId', 'mainnet'], ['contractId', 'payoutlatch.near'], ['version', '3.0'], ['storageReserve', '0']]) assert.throws(() => checkConfig({...config, [field]: value}));
});
