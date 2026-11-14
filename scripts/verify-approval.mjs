// No keys, wallet connection, account creation, signing or broadcast. Testnet reads only.
import {readFile} from 'node:fs/promises';
import {toYocto} from '../dist/model.mjs';
import {TESTNET_RPC, checkConfig, checkApproval, checkJob} from './lib/verify-approval.mjs';
const usage = 'Usage: npm run verify:approval -- TX_HASH OWNER REFERENCE RECIPIENT AMOUNT_NEAR [EXECUTOR]';
try {
  const inputs = process.argv.slice(2);
  if (inputs.length < 5 || inputs.length > 6) throw Error(usage);
  const [hash, owner, reference, recipient, amountNear, executor = null] = inputs;
  if (!/^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(hash)) throw Error('Expected a NEAR transaction hash');
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(reference)) throw Error('Invalid job reference');
  const expected = {hash, owner, reference, recipient, amount: toYocto(amountNear), executor};
  const config = JSON.parse(await readFile(new URL('../dist/config.json', import.meta.url), 'utf8'));
  checkConfig(config);
  async function rpc(method, params) {
    const response = await fetch(TESTNET_RPC, {
      method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({jsonrpc: '2.0', id: 'verify-approval', method, params}),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw Error(`Testnet RPC HTTP ${response.status}; rerun this read-only check`);
    const body = await response.json();
    if (body.error) throw Error(`Testnet RPC: ${JSON.stringify(body.error)}. Do not create another approval to retry verification.`);
    if (!body.result) throw Error('Missing RPC result');
    return body.result;
  }
  const result = await rpc('tx', {tx_hash: hash, sender_account_id: owner, wait_until: 'FINAL'});
  const approval = checkApproval(result, expected, config.contractId);
  const state = await rpc('query', {request_type: 'call_function', finality: 'final', account_id: config.contractId, method_name: 'get_job', args_base64: Buffer.from(JSON.stringify({job_id: approval.jobId})).toString('base64')});
  const job = JSON.parse(Buffer.from(state.result).toString('utf8'));
  const current = checkJob(job, expected, approval);
  console.log(JSON.stringify({
    result: 'PASS', network: 'testnet', checkedAt: new Date().toISOString(), rpc: TESTNET_RPC,
    approvalVerified: true, browserWalletActionVerified: false,
    browserNote: 'Chain evidence verifies the signed approval, not which UI signed it. Record the manual Meteor approval separately.',
    contract: config.contractId, transaction: hash, signer: owner, publicKey: approval.publicKey,
    jobId: approval.jobId, signedTerms: approval.args, depositYocto: approval.deposit,
    finalBlockHeight: state.block_height, finalBlockHash: state.block_hash, ...current,
    explorer: `https://testnet.nearblocks.io/txns/${hash}`,
  }, null, 2));
} catch (error) {
  console.error(`Verification NOT confirmed: ${error.message}`);
  process.exitCode = 1;
}
