import {NativeModules,Platform} from 'react-native';
import type {Address,Hash} from 'viem';
import {isSwapOperation,SWAP_PINS,type SwapAsset,type SwapOperation} from './mainnet-swap-policy';
export type NativeSwapQuote = Readonly<{chainId:56;senderAddress:Address;inputAsset:SwapAsset;outputAsset:SwapAsset;amountWei:string;operation:SwapOperation;estimatedOutWei:string;minimumOutWei:string;nonce:string;gas:string;gasPrice:string;observedAt:number;executionEnabled:boolean;remainingSteps:number}>;
type Bridge={prepareNativeMainnetSwap:(sender:string,input:string,output:string,amount:string)=>Promise<string>;sendNativeMainnetSwap:(review:Record<string,unknown>,epoch:number)=>Promise<unknown>};
const decimal=(v:unknown,zero=false)=>typeof v==='string'&&(zero?/^(0|[1-9][0-9]{0,77})$/:/^[1-9][0-9]{0,77}$/).test(v);
function module(): Bridge {if(Platform.OS!=='android'||!NativeModules.AurionXIMainnetSecurity?.prepareNativeMainnetSwap||!NativeModules.AurionXIMainnetSecurity?.sendNativeMainnetSwap)throw Error('Swap is unavailable in this APK.');return NativeModules.AurionXIMainnetSecurity as Bridge;}
export async function prepareNativeSwap(sender:Address,input:SwapAsset,output:SwapAsset,amountWei:string):Promise<NativeSwapQuote>{
 const raw=await module().prepareNativeMainnetSwap(sender,input,output,amountWei);if(typeof raw!=='string'||raw.length>16384)throw Error('Invalid swap review.');
 const q=JSON.parse(raw) as NativeSwapQuote;
 if(q.chainId!==56||q.senderAddress?.toLowerCase()!==sender.toLowerCase()||q.inputAsset!==input||q.outputAsset!==output||q.amountWei!==amountWei||!isSwapOperation(q.operation)||q.operation.inputAsset!==input||q.operation.outputAsset!==output||q.operation.intentAmountWei!==amountWei
  || !decimal(q.nonce,true)||BigInt(q.nonce)>BigInt(Number.MAX_SAFE_INTEGER)||!decimal(q.gas)||BigInt(q.gas)>500000n||!decimal(q.gasPrice)||BigInt(q.gas)*BigInt(q.gasPrice)>100000000000000n||!Number.isSafeInteger(q.observedAt)||q.observedAt>Date.now()+5000||Date.now()-q.observedAt>=90000||typeof q.executionEnabled!=='boolean'||!decimal(q.estimatedOutWei)||q.estimatedOutWei!==q.operation.estimatedOutWei||q.minimumOutWei!==q.operation.minimumOutWei||!Number.isInteger(q.remainingSteps)||q.remainingSteps<1||q.remainingSteps>3)throw Error('Invalid swap review.');
 return Object.freeze({...q,operation:Object.freeze({...q.operation})});
}
export async function sendNativeSwap(q:NativeSwapQuote,epoch:number):Promise<{state:'submitted'|'submission-unknown'|'not-submitted';transactionHash:Hash}>{
 if(!Number.isSafeInteger(epoch)||epoch<0||!q.executionEnabled||Date.now()-q.observedAt>=90000||!isSwapOperation(q.operation))throw Error('Refresh the swap review.');
 const review={chainId:56,senderAddress:q.senderAddress,recipient:q.senderAddress,assetId:q.inputAsset,assetContract:q.inputAsset==='native-bnb'?null:SWAP_PINS[q.inputAsset],amount:q.operation.kind==='reset'?'0':q.amountWei,nonce:q.nonce,gas:q.gas,gasPrice:q.gasPrice,observedAt:String(q.observedAt),swapOperation:q.operation};
 const result=await module().sendNativeMainnetSwap(review,epoch);
 if(!result||typeof result!=='object')throw Error('Check Activity for this operation.');
 const r=result as Record<string,unknown>;
 if(!['submitted','submission-unknown','not-submitted'].includes(String(r.state))||typeof r.transactionHash!=='string'||!/^0x[0-9a-fA-F]{64}$/.test(r.transactionHash))throw Error('Check Activity for this operation.');
 return {state:r.state as 'submitted'|'submission-unknown'|'not-submitted',transactionHash:r.transactionHash as Hash};
}
