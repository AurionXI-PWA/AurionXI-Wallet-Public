const { JsonRpcProvider,Contract,Interface,keccak256,toUtf8Bytes,toBeHex }=require('ethers');
const {onRequest}=require('firebase-functions/v2/https');
const {defineSecret,defineBoolean}=require('firebase-functions/params');
const {PINS,integer,address,route,validateOperation,transactionFor}=require('./wallet-mainnet-swap-policy');
const {POLICY}=require('./wallet-mainnet-production-policy');
const BSC_MAINNET_RPC_URL=defineSecret('BSC_MAINNET_RPC_URL');
const MAINNET_SWAP_ENABLED=defineBoolean('MAINNET_SWAP_ENABLED',{default:true});
const tokenAbi=[
 'function balanceOf(address) view returns(uint256)','function allowance(address,address) view returns(uint256)',
 'function calculateTaxes(address,address,uint256,bool,bool) view returns(uint256,uint8)',
 'function getTaxConfig() view returns(uint256,uint256,uint256,uint256)',
 'function getMicroSellConfiguration() view returns(bool,uint256,uint256,uint256)',
 'function getPanicSellConfig() view returns(bool,uint256,uint256,uint256,uint256,uint256,uint256)',
 'function getWalletFlags(address) view returns(bool,bool,bool,bool,bool,bool,bool)',
 'function getPairAddress() view returns(address)','function isLPPair(address) view returns(bool)',
 'function canBuy(address,uint256) view returns(bool,string)','function canSell(address,uint256) view returns(bool,string)',
 'function totalSupply() view returns(uint256)','function feeCollector() view returns(address)',
 'function facetAddress(bytes4) view returns(address)','function liquidityLocker() view returns(address)',
];
const pairAbi=['function token0() view returns(address)','function token1() view returns(address)','function factory() view returns(address)','function getReserves() view returns(uint112,uint112,uint32)'];
function problem(code){const e=new Error(code);e.code=code;e.status=422;throw e;}
function clean(v){return typeof v==='bigint'?v.toString():Array.isArray(v)?Array.from(v,clean):v;}
async function readDiamondOwner(p,block){
 // LibDiamond: four mapping/array slots precede contractOwner. TokenDiamond has no owner() selector.
 const slot=toBeHex(BigInt(keccak256(toUtf8Bytes('diamond.standard.diamond.storage')))+4n,32);
 const word=await p.getStorage(PINS.arxi,slot,block);
 if(!/^0x0{24}[0-9a-fA-F]{40}$/.test(word))problem('swap_owner_unavailable');
 return address('0x'+word.slice(-40));
}
async function verifyManifest(p,block){
 const manifest=require('./wallet-mainnet-swap-manifest.json');
 const token=new Contract(PINS.arxi,['function facetAddress(bytes4) view returns(address)'],p);
 await Promise.all(manifest.contracts.map(async x=>{if(keccak256(await p.getCode(x.address,block))!==x.runtimeHash)problem('swap_contract_changed');}));
 await Promise.all(manifest.selectors.map(async x=>{if((await token.facetAddress(x.selector,{blockTag:block})).toLowerCase()!==x.facet)problem('swap_contract_changed');}));
 return manifest.identity;
}
async function readSwapSnapshot(input,rpcUrl){
 const sender=address(input?.senderAddress),path=route(input?.inputAsset,input?.outputAsset),amount=integer(input?.amountWei);
 const cap=input.inputAsset==='native-bnb'?POLICY.maxNativeBnbAmountWei:input.inputAsset==='arxi'?POLICY.maxArxiAmountWei:POLICY.maxUsdtAmountWei;
 if(amount>cap)problem('swap_amount_limit');
 const reviewed=input.reviewedOperation;
 if(reviewed){validateOperation(reviewed);if(reviewed.inputAsset!==input.inputAsset||reviewed.outputAsset!==input.outputAsset||reviewed.intentAmountWei!==input.amountWei)problem('swap_review_changed');}
 const p=new JsonRpcProvider(rpcUrl,56,{staticNetwork:true});
 try{
  const chain=await p.send('eth_chainId',[]);if(chain!=='0x38')problem('mainnet_chain_required');
  const block=await p.getBlockNumber(),at={blockTag:block};
  const router=new Contract(PINS.router,['function factory() view returns(address)','function WETH() view returns(address)','function getAmountsOut(uint256,address[]) view returns(uint256[])'],p);
  const factory=new Contract(PINS.factory,['function getPair(address,address) view returns(address)'],p);
  const arxi=new Contract(PINS.arxi,tokenAbi,p);
  // Verify pinned runtimes/selectors before calling possibly upgraded contract code.
  const [header,manifest,nonce,latest,gasPrice,bnbBalance]=await Promise.all([p.getBlock(block),verifyManifest(p,block),p.getTransactionCount(sender,'pending'),p.getTransactionCount(sender,'latest'),p.send('eth_gasPrice',[]),p.getBalance(sender,block)]);
  const [actualFactory,wbnb]=await Promise.all([router.factory(at),router.WETH(at)]);
  if(actualFactory.toLowerCase()!==PINS.factory||wbnb.toLowerCase()!==PINS.wbnb)problem('swap_contract_changed');
  if(nonce!==latest)problem('swap_previous_transaction_pending');
  if(!header||Math.abs(Date.now()/1000-header.timestamp)>90)problem('swap_quote_stale');
  await Promise.all([[PINS.arxi,PINS.usdt,PINS.arxiPair],[PINS.usdt,PINS.wbnb,PINS.bnbPair]].map(async([a,b,expected])=>{
   if((await factory.getPair(a,b,at)).toLowerCase()!==expected)problem('swap_pair_changed');
   const pair=new Contract(expected,pairAbi,p);const [a0,a1,f,r]=await Promise.all([pair.token0(at),pair.token1(at),pair.factory(at),pair.getReserves(at)]);
   if(f.toLowerCase()!==PINS.factory||![a0.toLowerCase(),a1.toLowerCase()].includes(a)||![a0.toLowerCase(),a1.toLowerCase()].includes(b)||r[0]<=0n||r[1]<=0n)problem('swap_liquidity_unavailable');
  }));
  const inputToken=input.inputAsset==='native-bnb'?null:new Contract(PINS[input.inputAsset],tokenAbi,p);
  const [allowance,tokenBalance]=inputToken?await Promise.all([inputToken.allowance(sender,PINS.router,at),inputToken.balanceOf(sender,at)]):[0n,bnbBalance];
  if(tokenBalance<amount)problem('swap_insufficient_balance');
  const gross=(await router.getAmountsOut(amount,path,at)).at(-1);let estimated=gross,taxBps=0n,policy=[manifest];
  if(input.inputAsset==='arxi'||input.outputAsset==='arxi'){
   const buy=input.outputAsset==='arxi',taxBase=buy?gross:amount;
   const [normal,micro,panic,supply,senderFlags,pairFlags,recipientFlags,pairAddress,lp,calculated,eligibility,locker,owner]=await Promise.all([
    arxi.getTaxConfig(at),arxi.getMicroSellConfiguration(at),arxi.getPanicSellConfig(at),arxi.totalSupply(at),arxi.getWalletFlags(sender,at),arxi.getWalletFlags(PINS.arxiPair,at),arxi.getWalletFlags(sender,at),arxi.getPairAddress(at),arxi.isLPPair(PINS.arxiPair,at),
    arxi.calculateTaxes(buy?PINS.arxiPair:sender,buy?sender:PINS.arxiPair,taxBase,buy,!buy,at),buy?arxi.canBuy(sender,gross,at):arxi.canSell(sender,amount,at),arxi.liquidityLocker(at),readDiamondOwner(p,block),
   ]);
   if(pairAddress.toLowerCase()!==PINS.arxiPair&&!lp)problem('swap_pair_not_registered');
   if(!eligibility[0])problem('swap_not_allowed');
   // TradeFacet early exchange bypass overrides the calculator. Other fee exemptions are handled there.
   const tax=senderFlags[1]||pairFlags[1]||!buy&&(sender===locker.toLowerCase()||sender===owner.toLowerCase())?0n:calculated[0];
   if(tax>taxBase)problem('invalid_swap_tax');
   taxBps=(tax*10000n+taxBase-1n)/taxBase;
   estimated=buy?gross-tax:(await router.getAmountsOut(amount-tax,path,at)).at(-1);
   policy.push(clean(normal),clean(micro),clean(panic),supply.toString(),clean(senderFlags),clean(pairFlags),clean(recipientFlags),pairAddress.toLowerCase(),lp,taxBps.toString(),calculated[1].toString(),locker.toLowerCase(),owner.toLowerCase());
  }
  if(taxBps+600n>=10000n)problem('swap_tolerance_unavailable');
  const minimum=gross*(10000n-taxBps-600n)/10000n;if(minimum<=0n||estimated<minimum)problem('swap_minimum_unavailable');
  const kind=input.inputAsset!=='native-bnb'&&allowance<amount?(input.inputAsset==='arxi'&&allowance>0n?'reset':'approve'):'swap';
  const policyHash=keccak256(toUtf8Bytes(JSON.stringify(policy)));
  const operation={kind,inputAsset:input.inputAsset,outputAsset:input.outputAsset,intentAmountWei:amount.toString(),minimumOutWei:minimum.toString(),estimatedOutWei:estimated.toString(),grossOutWei:gross.toString(),taxBps:taxBps.toString(),policyHash,deadline:String(header.timestamp+180)};
  if(reviewed){
   if(reviewed.kind!==kind||reviewed.policyHash!==policyHash||BigInt(reviewed.deadline)<=BigInt(header.timestamp+15)||BigInt(reviewed.deadline)>BigInt(header.timestamp+185))problem('swap_review_changed');
   if(kind==='swap'&&estimated<BigInt(reviewed.minimumOutWei))problem('swap_price_changed');
   Object.assign(operation,reviewed); // immutable approved minimum/deadline, never silently lowered
  }
  const tx=transactionFor(sender,operation),price=BigInt(gasPrice);
  if(price<=0n||price>1000000000000n)problem('swap_fee_unavailable');
  const rpcTx={from:sender,to:tx.to,value:'0x'+tx.value.toString(16),data:tx.data,gasPrice:'0x'+price.toString(16),gas:'0x7a120'};
  let gas;try{gas=BigInt(await p.send('eth_estimateGas',[rpcTx,'pending']));await p.send('eth_call',[rpcTx,'pending']);}catch(cause){const error=new Error('swap_simulation_failed');error.code='swap_simulation_failed';error.status=422;error.rpcReason=String(cause?.info?.error?.message||cause?.shortMessage||'RPC unavailable').slice(0,200);throw error;}
  gas=(gas*120n+99n)/100n;if(gas<=0n||gas>500000n||gas*price>POLICY.maxFeeWei)problem('swap_fee_unavailable');
  // Conservative reserve for each still-required step, including reset/approval before the final swap.
  const steps=kind==='reset'?3n:kind==='approve'?2n:1n;
  const reserve=kind==='swap'?gas*price:steps*500000n*price;
  if(bnbBalance<reserve+(input.inputAsset==='native-bnb'?amount:0n))problem('swap_insufficient_gas');
  if(input.reviewedNonce!==undefined&&(integer(input.reviewedNonce,true)!==BigInt(nonce)||integer(input.reviewedGas)<gas||integer(input.reviewedGas)>500000n||integer(input.reviewedGasPrice)<price||integer(input.reviewedGas)*integer(input.reviewedGasPrice)>POLICY.maxFeeWei))problem('swap_review_changed');
  return {chainId:56,senderAddress:sender,inputAsset:input.inputAsset,outputAsset:input.outputAsset,amountWei:amount.toString(),operation,allowanceWei:allowance.toString(),estimatedOutWei:estimated.toString(),minimumOutWei:operation.minimumOutWei,nonce:String(nonce),gas:String(gas),gasPrice:String(price),blockNumber:String(block),chainTimestamp:String(header.timestamp),observedAt:Date.now(),walletFeeBps:0,approvalRequired:kind!=='swap',remainingSteps:Number(steps),simulatedOperation:kind};
 }finally{p.destroy();}
}
const buckets=new Map();
const walletMainnetSwapQuote=onRequest({region:'asia-south1',secrets:[BSC_MAINNET_RPC_URL],timeoutSeconds:60,maxInstances:2,concurrency:10},async(req,res)=>{
 res.set('Cache-Control','no-store');
 if(req.method!=='POST'||req.path!=='/v1/bsc-mainnet/swap-quote'){res.status(404).json({error:'not_found'});return;}
 try{
  if(Buffer.byteLength(JSON.stringify(req.body||{}))>4096)problem('invalid_swap_request');
  const key=String(req.ip||'unknown'),now=Date.now(),old=buckets.get(key),bucket=old&&now-old.start<60000?old:{start:now,count:0};
  if(buckets.size>2000)buckets.clear();buckets.set(key,bucket);if(++bucket.count>12)problem('swap_rate_limited');
  const quote=await readSwapSnapshot(req.body,BSC_MAINNET_RPC_URL.value());res.json({...quote,executionEnabled:MAINNET_SWAP_ENABLED.value()});
 }catch(e){res.status(e.status||503).json({error:e.code||'swap_quote_unavailable'});}
});
module.exports={readSwapSnapshot,walletMainnetSwapQuote,MAINNET_SWAP_ENABLED};
