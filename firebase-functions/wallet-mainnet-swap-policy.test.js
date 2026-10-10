const test=require('node:test'),assert=require('node:assert/strict');
const {Wallet}=require('ethers');
const {route,PINS,transactionFor,validateOperation,validateSwapRelayRequest}=require('./wallet-mainnet-swap-policy');
const {enforceMainnetProductionPolicy}=require('./wallet-mainnet-production-policy');
const operation=(kind='swap',inputAsset='arxi',outputAsset='usdt')=>({kind,inputAsset,outputAsset,intentAmountWei:inputAsset==='native-bnb'?'100000000000000':'1000000000000000000',grossOutWei:'10000',estimatedOutWei:'9900',minimumOutWei:'9300',taxBps:'100',policyHash:'0x'+'a'.repeat(64),deadline:String(Math.floor(Date.now()/1000)+150)});
test('only fixed routes are admitted; BNB uses the USDT intermediate',()=>{
 assert.deepEqual(route('native-bnb','arxi'),[PINS.wbnb,PINS.usdt,PINS.arxi]);
 assert.deepEqual(route('arxi','native-bnb'),[PINS.arxi,PINS.usdt,PINS.wbnb]);
 assert.throws(()=>route('arxi','arxi'));assert.throws(()=>route('unknown','usdt'));
});
test('minimum is integer-bound once; no zero output or 100 percent tolerance',()=>{
 validateOperation(operation());assert.throws(()=>validateOperation({...operation(),minimumOutWei:'0'}));
 assert.throws(()=>validateOperation({...operation(),minimumOutWei:'9301'}));
 assert.throws(()=>validateOperation({...operation(),taxBps:'9400'}));
 assert.throws(()=>validateOperation({...operation(),path:[PINS.arxi,PINS.wbnb]}));
});
test('signed intent cannot change recipient, input, method or trailing calldata',async()=>{
 const wallet=Wallet.createRandom(),o=operation(),tx=transactionFor(wallet.address,o);
 const raw=await wallet.signTransaction({...tx,chainId:56,type:0,nonce:0,gasLimit:100000,gasPrice:50000000});
 const {Transaction}=require('ethers');const hash=Transaction.from(raw).hash;
 const body={serializedTransaction:raw,expectedHash:hash,senderAddress:wallet.address,recipientAddress:wallet.address,asset:'arxi',amountWei:o.intentAmountWei,nonce:'0',gasLimit:'100000',gasPriceWei:'50000000',swapOperation:o};
 const reviewed=validateSwapRelayRequest(body);assert.equal(reviewed.amountWei,1000000000000000000n);
 assert.throws(()=>validateSwapRelayRequest({...body,recipientAddress:PINS.router}));
 assert.throws(()=>validateSwapRelayRequest({...body,swapOperation:{...o,intentAmountWei:'2000000000000000000'}}));
 const altered=await wallet.signTransaction({...tx,data:tx.data+'00',chainId:56,type:0,nonce:0,gasLimit:100000,gasPrice:50000000});
 assert.throws(()=>validateSwapRelayRequest({...body,serializedTransaction:altered,expectedHash:Transaction.from(altered).hash}));
});
test('approval allowance is not counted as token spend; reset zero remains operation-specific',async()=>{
 const wallet=Wallet.createRandom();
 for(const kind of ['approve','reset']){
  const o=operation(kind),tx=transactionFor(wallet.address,o);const raw=await wallet.signTransaction({...tx,chainId:56,type:0,nonce:0,gasLimit:100000,gasPrice:50000000});
  const body={serializedTransaction:raw,expectedHash:require('ethers').Transaction.from(raw).hash,senderAddress:wallet.address,recipientAddress:wallet.address,asset:'arxi',amountWei:kind==='reset'?'0':o.intentAmountWei,nonce:'0',gasLimit:'100000',gasPriceWei:'50000000',swapOperation:o};
  const validated=validateSwapRelayRequest(body);assert.equal(validated.amountWei,0n);enforceMainnetProductionPolicy(validated);
 }
 assert.throws(()=>enforceMainnetProductionPolicy({asset:'arxi',senderAddress:wallet.address,recipientAddress:wallet.address,amountWei:0n,gasLimit:100000n,gasPriceWei:50000000n}));
});
