import {connect,keyStores,KeyPair,transactions} from 'near-api-js';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const creds=JSON.parse(await readFile(new URL('../credentials/testnet-development.json',import.meta.url),'utf8'));
if(creds.network_id!=='testnet'||!creds.account_id.endsWith('.testnet'))throw Error('This script supports testnet only');
const keys=new keyStores.InMemoryKeyStore();await keys.setKey('testnet',creds.account_id,KeyPair.fromString(creds.private_key));
const near=await connect({networkId:'testnet',nodeUrl:'https://rpc.testnet.fastnear.com',keyStore:keys});
const account=await near.account(creds.account_id);
const code=await readFile(new URL('../artifacts/payoutlatch.wasm',import.meta.url));
const sha=createHash('sha256').update(code).digest('hex');
let version;try{version=await account.viewFunction({contractId:creds.account_id,methodName:'version',args:{}})}catch{}
let deployment=null;try{const previous=JSON.parse(await readFile(new URL('../dist/config.json',import.meta.url),'utf8'));if(previous.contractId===creds.account_id)deployment=previous.deploymentTransaction}catch{}
if(!version){const out=await account.signAndSendTransaction({receiverId:creds.account_id,actions:[transactions.deployContract(code),transactions.functionCall('new',{},100000000000000n,0n)]});deployment=out.transaction.hash;}
else if(version!=='2.0.0-testnet')throw Error('Existing state has an incompatible version; deploy to a fresh account');
const actual=await near.connection.provider.query({request_type:'view_code',finality:'final',account_id:creds.account_id});
if(createHash('sha256').update(Buffer.from(actual.code_base64,'base64')).digest('hex')!==sha)throw Error('Deployed code differs from the local build');
const config={networkId:'testnet',contractId:creds.account_id,rpcUrl:'https://rpc.testnet.fastnear.com',walletUrl:'https://wallet.meteorwallet.app',explorerUrl:'https://testnet.nearblocks.io',version:'2.0.0-testnet',storageReserve:'20000000000000000000000',wasmSha256:sha,deploymentTransaction:deployment};
await writeFile(new URL('../dist/config.json',import.meta.url),JSON.stringify(config,null,2)+'\n');
console.log(JSON.stringify(config,null,2));
