// Creates one disposable development account. Never prints private key material.
import {KeyPair} from 'near-api-js';
import {mkdir,readFile,writeFile,chmod} from 'node:fs/promises';
import {randomBytes} from 'node:crypto';

const path=new URL('../credentials/testnet-development.json',import.meta.url);
await mkdir(new URL('../credentials/',import.meta.url),{recursive:true,mode:0o700});
let credentials;
try { credentials=JSON.parse(await readFile(path,'utf8')); }
catch(error) {
  if(error.code!=='ENOENT')throw error;
  const key=KeyPair.fromRandom('ed25519');
  credentials={network_id:'testnet',account_id:`payoutlatch-dev-${randomBytes(4).toString('hex')}.testnet`,public_key:key.getPublicKey().toString(),private_key:key.toString()};
  await writeFile(path,JSON.stringify(credentials,null,2)+'\n',{mode:0o600,flag:'wx'});
}
await chmod(path,0o600);
const rpc=async(method,params)=>{
  const response=await fetch('https://rpc.testnet.fastnear.com',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:'payoutlatch-setup',method,params}),signal:AbortSignal.timeout(30000)});
  if(!response.ok)throw Error(`RPC HTTP ${response.status}`);
  return response.json();
};
let account=await rpc('query',{request_type:'view_account',finality:'final',account_id:credentials.account_id});
if(account.error?.cause?.name==='UNKNOWN_ACCOUNT'){
  const response=await fetch('https://helper.testnet.near.org/account',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({newAccountId:credentials.account_id,newAccountPublicKey:credentials.public_key}),signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error(`Account helper HTTP ${response.status}: ${(await response.text()).slice(0,300)}`);
  console.log(JSON.stringify({account_id:credentials.account_id,creation_requested:true}));
  for(let i=0;i<8;i++){
    account=await rpc('query',{request_type:'view_account',finality:'final',account_id:credentials.account_id});
    if(account.result)break;
    await new Promise(r=>setTimeout(r,1500));
  }
}
if(!account.result)throw Error(`Account not verified: ${JSON.stringify(account.error)}`);
const key=await rpc('query',{request_type:'view_access_key',finality:'final',account_id:credentials.account_id,public_key:credentials.public_key});
if(!key.result)throw Error('Account exists but generated access key was not verified.');
console.log(JSON.stringify({account_id:credentials.account_id,network:'testnet',balance_yocto:account.result.amount,access_key_permission:key.result.permission,verified:true,explorer:`https://testnet.nearblocks.io/address/${credentials.account_id}`},null,2));
