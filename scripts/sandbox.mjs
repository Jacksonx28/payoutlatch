import {Worker} from 'near-workspaces';
import assert from 'node:assert/strict';
const worker=await Worker.init();
try {
  const root=worker.rootAccount;
  const contract=await root.createSubAccount('latch',{initialBalance:'10000000000000000000000000'});
  const owner=await root.createSubAccount('owner');
  const a=await root.createSubAccount('agent-a'),b=await root.createSubAccount('agent-b');
  const recipient=await root.createSubAccount('editor');
  await contract.deploy('artifacts/payoutlatch.wasm');
  await owner.call(contract,'new',{owner:owner.accountId});
  for(const agent of [a,b])await owner.call(contract,'set_executor',{account:agent.accountId,enabled:true});
  const amount='100000000000000000000000';
  await owner.call(contract,'approve_job',{job_id:'edit-01',recipient:recipient.accountId,amount},{attachedDeposit:'120000000000000000000000'});
  const before=BigInt((await recipient.balance()).total.toString());
  const outcomes=await Promise.allSettled([a,b].map(agent=>agent.call(contract,'execute',{job_id:'edit-01'},{gas:'100000000000000'})));
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);
  assert.equal((await contract.view('get_job',{job_id:'edit-01'})).status,'Paid');
  assert.equal(BigInt((await recipient.balance()).total.toString())-before,BigInt(amount));
  await assert.rejects(()=>a.call(contract,'execute',{job_id:'edit-01'},{gas:'100000000000000'}));
  await assert.rejects(()=>a.call(contract,'on_transfer',{job_id:'edit-01',attempt:1,refund:false},{gas:'100000000000000'}));
  console.log('PASS: real sandbox transfer, concurrent duplicate rejection, recipient balance delta, replay rejection, private callback enforcement.');
  await owner.call(contract,'approve_job',{job_id:'bad-recipient',recipient:'missing-account.test.near',amount},{attachedDeposit:'120000000000000000000000'});
  await a.call(contract,'execute',{job_id:'bad-recipient'},{gas:'100000000000000'});
  assert.equal((await contract.view('get_job',{job_id:'bad-recipient'})).status,'Approved');
  await owner.call(contract,'cancel',{job_id:'bad-recipient'},{gas:'100000000000000'});
  assert.equal((await contract.view('get_job',{job_id:'bad-recipient'})).status,'Cancelled');
  console.log('PASS: failed transfer unlocks only after callback; owner can reclaim funds.');
} finally { await worker.tearDown(); }
