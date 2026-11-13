import {setupWalletSelector} from '@near-wallet-selector/core';
import {setupMeteorWallet} from '@near-wallet-selector/meteor-wallet';
export async function initializeWallet(config){
 return setupWalletSelector({network:{networkId:'testnet',nodeUrl:config.rpcUrl,helperUrl:'https://helper.testnet.near.org',explorerUrl:config.explorerUrl},modules:[setupMeteorWallet()]});
}
