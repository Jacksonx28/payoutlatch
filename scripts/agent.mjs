// Non-interactive executor for a human-approved job. Never creates approvals.
import {connect,keyStores,KeyPair} from 'near-api-js';
import {readFile} from 'node:fs/promises';
const [keyFile,jobId]=process.argv.slice(2);
if(!keyFile||!jobId)throw Error('Usage: node scripts/agent.mjs /absolute/path/to/testnet-key.json owner.testnet:reference');
const config=JSON.parse(await readFile('dist/config.json','utf8'));
const credentials=JSON.parse(await readFile(keyFile,'utf8'));
if(config.networkId!=='testnet'||(credentials.network_id&&credentials.network_id!=='testnet'))throw Error('Testnet only');
const keyStore=new keyStores.InMemoryKeyStore();
await keyStore.setKey('testnet',credentials.account_id,KeyPair.fromString(credentials.private_key));
const near=await connect({networkId:'testnet',nodeUrl:config.rpcUrl,keyStore});
const account=await near.account(credentials.account_id);
const get=()=>account.viewFunction({contractId:config.contractId,methodName:'get_job',args:{job_id:jobId}});
const job=await get();
if(!job)throw Error('Unknown job ID. Ask the owner for the existing approval.');
if(job.status==='Paid'||job.status==='Cancelled'){console.log(JSON.stringify({job_id:jobId,status:job.status,action:'none; terminal state'}));process.exit(0)}
if(job.status!=='Approved')throw Error('Job is pending. Query it later; do not create another approval.');
if(![job.owner,job.executor].includes(credentials.account_id))throw Error('This account is not authorized for the job.');
const result=await account.functionCall({contractId:config.contractId,methodName:'execute',args:{job_id:jobId},gas:100000000000000n,attachedDeposit:0n});
console.log(JSON.stringify({job_id:jobId,status:(await get()).status,transaction:result.transaction.hash,explorer:`${config.explorerUrl}/txns/${result.transaction.hash}`},null,2));
