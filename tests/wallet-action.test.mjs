import test from 'node:test';
import assert from 'node:assert/strict';
import {najActionToInternal} from '@near-wallet-selector/core';
import {functionCallAction} from '../src/wallet.mjs';
test('Meteor accepts the payable approval action with exact amounts and arguments', () => {
 const args={reference:'browser-check',title:'Browser check',recipient:'payoutlatch.testnet',amount:'1000000000000000000000',executor:null};
 const legacy={type:'FunctionCall',params:{methodName:'approve_job',args,gas:'100000000000000',deposit:'21000000000000000000000'}};
 // This is the conversion used by the installed Meteor adapter.
 assert.throws(()=>najActionToInternal(legacy),/Unsupported NAJ action/);
 assert.deepEqual(najActionToInternal(functionCallAction('approve_job',args,legacy.params.deposit)),legacy);
});
test('Meteor accepts zero-deposit release, refund and revocation actions', () => {
 for(const method of ['execute','cancel','set_executor']){
  const args={job_id:'owner.testnet:browser-check',...(method==='set_executor'?{executor:null}:{})};
  assert.deepEqual(najActionToInternal(functionCallAction(method,args,'0')),{type:'FunctionCall',params:{methodName:method,args,gas:'100000000000000',deposit:'0'}});
 }
});
