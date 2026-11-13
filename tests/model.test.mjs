import test from 'node:test';import assert from 'node:assert/strict';
import {DemoLedger,toYocto,formatNear} from '../dist/model.mjs';
function ledger(){const l=new DemoLedger();l.approve({id:'job-1',title:'Edit',recipient:'editor.testnet',amount:'0.5'});return l;}
test('decimal amounts retain full precision',()=>{assert.equal(toYocto('0.000000000000000000000001'),'1');assert.equal(formatNear(toYocto('123.456')),'123.456');for(const x of ['0','-1','1e4','NaN','0.0000000000000000000000001'])assert.throws(()=>toYocto(x));});
test('simulated concurrent agent requests produce one payment',()=>{const l=ledger(),a=l.start('job-1');assert.throws(()=>l.start('job-1'));l.settle('job-1',a);assert.throws(()=>l.start('job-1'));assert.equal(l.get('job-1').status,'Paid');});
test('failure is retryable but stale callbacks are not',()=>{const l=ledger(),a=l.start('job-1');l.settle('job-1',a,false);const b=l.start('job-1');assert.throws(()=>l.settle('job-1',a));l.settle('job-1',b);});
test('revocation blocks new execution but not pending settlement',()=>{const l=ledger(),a=l.start('job-1');l.enabled=false;l.settle('job-1',a);assert.equal(l.get('job-1').status,'Paid');assert.throws(()=>l.start('job-1'));});
test('cancelled job ID cannot be reused',()=>{const l=ledger(),a=l.start('job-1','Owner',true);l.settle('job-1',a,true,true);assert.throws(()=>l.start('job-1'));assert.throws(()=>l.approve({id:'job-1',title:'Another',recipient:'editor.testnet',amount:'1'}));});
