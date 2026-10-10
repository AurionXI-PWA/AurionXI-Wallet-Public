const { Interface, Transaction } = require('ethers');
const { POLICY } = require('./wallet-mainnet-production-policy');
const PINS = Object.freeze({ chainId:56, router:'0x10ed43c718714eb63d5aa57b78b54704e256024e', factory:'0xca143ce32fe78f1f7019d7d551a6402fc5350c73', arxi:'0x6ffec4860325f8bfb3f000354708a7d0cae4b250', usdt:'0x55d398326f99059ff775485246999027b3197955', wbnb:'0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c', arxiPair:'0xdf5ad8a9129f5c11655fa2576a3ec6d96d2b836a', bnbPair:'0x16b9a82891338f9ba80e2d6970fdda79d1eb0dae' });
const ABI = new Interface([
 'function approve(address,uint256) returns(bool)',
 'function swapExactTokensForTokensSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)',
 'function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256,address[],address,uint256) payable',
 'function swapExactTokensForETHSupportingFeeOnTransferTokens(uint256,uint256,address[],address,uint256)',
]);
const UINT=(1n<<256n)-1n;
function fail(code){ const e=new Error(code);e.code=code;e.status=422;throw e; }
function integer(v,zero=false){if(typeof v!=='string'||!(zero?/^(0|[1-9][0-9]{0,77})$/:/^[1-9][0-9]{0,77}$/).test(v)||BigInt(v)>UINT)fail('invalid_swap_integer');return BigInt(v);}
function address(v){if(typeof v!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(v)||/^0x0{40}$/i.test(v))fail('invalid_swap_address');return v.toLowerCase();}
function route(input,output){
 const names=['native-bnb','arxi','usdt'];if(!names.includes(input)||!names.includes(output)||input===output)fail('invalid_swap_assets');
 const token=a=>a==='native-bnb'?PINS.wbnb:PINS[a];
 return input==='arxi'&&output==='native-bnb'?[PINS.arxi,PINS.usdt,PINS.wbnb]:input==='native-bnb'&&output==='arxi'?[PINS.wbnb,PINS.usdt,PINS.arxi]:[token(input),token(output)];
}
function validateOperation(o){
 if(!o||typeof o!=='object'||Array.isArray(o)||!['swap','approve','reset'].includes(o.kind))fail('invalid_swap_operation');
 const allowed=['kind','inputAsset','outputAsset','intentAmountWei','minimumOutWei','estimatedOutWei','grossOutWei','taxBps','policyHash','deadline'];
 if(Object.keys(o).some(k=>!allowed.includes(k)))fail('invalid_swap_operation');
 const path=route(o.inputAsset,o.outputAsset);const amount=integer(o.intentAmountWei);
 const cap=o.inputAsset==='native-bnb'?POLICY.maxNativeBnbAmountWei:o.inputAsset==='arxi'?POLICY.maxArxiAmountWei:POLICY.maxUsdtAmountWei;
 if(amount>cap)fail('swap_amount_limit');
 const minimum=integer(o.minimumOutWei),estimated=integer(o.estimatedOutWei),gross=integer(o.grossOutWei),tax=integer(o.taxBps,true),deadline=integer(o.deadline);
 if(tax+600n>=10000n||minimum!==gross*(10000n-tax-600n)/10000n||minimum>estimated||estimated>gross||!/^0x[0-9a-f]{64}$/.test(o.policyHash))fail('invalid_swap_minimum');
 if(o.kind!=='swap'&&o.inputAsset==='native-bnb')fail('invalid_swap_approval');
 return {path,amount,minimum,deadline};
}
function transactionFor(sender,o){
 const {path,amount,minimum,deadline}=validateOperation(o);sender=address(sender);
 if(o.kind!=='swap')return {from:sender,to:PINS[o.inputAsset],value:0n,data:ABI.encodeFunctionData('approve',[PINS.router,o.kind==='reset'?0n:amount])};
 const name=o.inputAsset==='native-bnb'?'swapExactETHForTokensSupportingFeeOnTransferTokens':o.outputAsset==='native-bnb'?'swapExactTokensForETHSupportingFeeOnTransferTokens':'swapExactTokensForTokensSupportingFeeOnTransferTokens';
 const args=o.inputAsset==='native-bnb'?[minimum,path,sender,deadline]:[amount,minimum,path,sender,deadline];
 return {from:sender,to:PINS.router,value:o.inputAsset==='native-bnb'?amount:0n,data:ABI.encodeFunctionData(name,args)};
}
function validateSwapRelayRequest(body,now=Math.floor(Date.now()/1000)){
 const o=body?.swapOperation;const expected=transactionFor(body?.senderAddress,o);
 if(body.asset!==o.inputAsset||address(body.recipientAddress)!==expected.from||body.replacesTransactionHash!==undefined||body.replacementKind!==undefined)fail('invalid_swap_identity');
 const amount=integer(body.amountWei,true);if(amount!==(o.kind==='reset'?0n:integer(o.intentAmountWei)))fail('invalid_swap_amount');
 const nonce=integer(body.nonce,true),gas=integer(body.gasLimit),price=integer(body.gasPriceWei);
 if(nonce>BigInt(Number.MAX_SAFE_INTEGER)||gas>500000n||price>1000000000000n||gas*price>POLICY.maxFeeWei)fail('invalid_swap_fee');
 const deadline=integer(o.deadline);if(deadline<=BigInt(now)||deadline>BigInt(now+185))fail('swap_expired');
 if(typeof body.serializedTransaction!=='string'||!/^0x(?:[a-fA-F0-9]{2}){1,65536}$/.test(body.serializedTransaction))fail('invalid_serialized_transaction');
 let tx;try{tx=Transaction.from(body.serializedTransaction);}catch{fail('invalid_serialized_transaction');}
 if(!tx.isSigned()||tx.type!==0||tx.chainId!==56n||tx.hash?.toLowerCase()!==String(body.expectedHash).toLowerCase()||tx.from?.toLowerCase()!==expected.from||tx.to?.toLowerCase()!==expected.to||tx.value!==expected.value||tx.data.toLowerCase()!==expected.data.toLowerCase()||BigInt(tx.nonce)!==nonce||tx.gasLimit!==gas||tx.gasPrice!==price)fail('signed_swap_mismatch');
 return {serializedTransaction:body.serializedTransaction,expectedHash:tx.hash.toLowerCase(),senderAddress:expected.from,recipientAddress:expected.from,asset:o.inputAsset,amountWei:o.kind==='swap'?amount:0n,nonce,gasLimit:gas,gasPriceWei:price,swapOperation:Object.freeze({...o})};
}
module.exports={PINS,ABI,integer,address,route,validateOperation,transactionFor,validateSwapRelayRequest};
