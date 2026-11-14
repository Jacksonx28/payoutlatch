import {setupWalletSelector,internalActionToNaj} from '@near-wallet-selector/core';
import {setupMeteorWallet} from '@near-wallet-selector/meteor-wallet';
export async function initializeWallet(config){
 return setupWalletSelector({network:{networkId:'testnet',nodeUrl:config.rpcUrl,helperUrl:'https://helper.testnet.near.org',explorerUrl:config.explorerUrl},modules:[setupMeteorWallet()]});
}

// Wallet Selector 10 adapters accept NEAR SDK actions, not legacy {type, params} objects.
export function functionCallAction(methodName,args,deposit){
 return internalActionToNaj({type:'FunctionCall',params:{methodName,args,gas:'100000000000000',deposit}});
}
