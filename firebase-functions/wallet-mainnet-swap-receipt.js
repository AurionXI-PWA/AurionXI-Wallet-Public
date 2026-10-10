const {JsonRpcProvider,Interface}=require('ethers');
const {PINS,address,route,transactionFor}=require('./wallet-mainnet-swap-policy');
const logs=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)','event Approval(address indexed owner,address indexed spender,uint256 value)','event Withdrawal(address indexed src,uint256 wad)']);
async function readSwapReceipt(rpcUrl,hash,sender,operation){
 sender=address(sender);if(!/^0x[0-9a-f]{64}$/.test(hash))throw Error('invalid_swap_hash');
 const expected=transactionFor(sender,operation),p=new JsonRpcProvider(rpcUrl,56,{staticNetwork:true});
 try{
  if(await p.send('eth_chainId',[])!=='0x38')throw Error('wrong_chain');
  const [receipt,tx]=await Promise.all([p.getTransactionReceipt(hash),p.getTransaction(hash)]);
  if(!tx)return {hash,state:'unknown'};
  if(tx.hash.toLowerCase()!==hash||tx.from.toLowerCase()!==sender||tx.to?.toLowerCase()!==expected.to||tx.data.toLowerCase()!==expected.data.toLowerCase()||tx.value!==expected.value||tx.chainId!==56n)throw Error('swap_receipt_identity_mismatch');
  if(!receipt)return {hash,state:'pending'};
  if(receipt.hash.toLowerCase()!==hash||receipt.status!==0&&receipt.status!==1)throw Error('invalid_receipt');
  if(receipt.status===0)return {hash,state:'reverted',blockNumber:String(receipt.blockNumber)};
  const parse=receipt.logs.flatMap(log=>{try{const event=logs.parseLog(log);return event?[{address:log.address.toLowerCase(),event}]:[];}catch{return [];}});
  if(operation.kind!=='swap'){
   const value=operation.kind==='reset'?0n:BigInt(operation.intentAmountWei);
   if(!parse.some(x=>x.address===PINS[operation.inputAsset]&&x.event.name==='Approval'&&x.event.args.owner.toLowerCase()===sender&&x.event.args.spender.toLowerCase()===PINS.router&&x.event.args.value===value))throw Error('swap_approval_evidence_missing');
   return {hash,state:'confirmed',blockNumber:String(receipt.blockNumber),operationKind:operation.kind};
  }
  const output=operation.outputAsset,minimum=BigInt(operation.minimumOutWei);let received=0n;
  if(output==='native-bnb'){
   // The verified exact router call reverts if its native payout fails. Logs alone are not recipient proof.
   const manifest=require('./wallet-mainnet-swap-manifest.json');const routerPin=manifest.contracts.find(x=>x.address===PINS.router);
   const {keccak256}=require('ethers');if(!routerPin||keccak256(await p.getCode(PINS.router,receipt.blockNumber))!==routerPin.runtimeHash)throw Error('swap_router_changed');
   const withdrawals=parse.filter(x=>x.address===PINS.wbnb&&x.event.name==='Withdrawal'&&x.event.args.src.toLowerCase()===PINS.router);
   if(withdrawals.length!==1)throw Error('swap_native_output_missing');received=withdrawals[0].event.args.wad;
   const inbound=parse.filter(x=>x.address===PINS.wbnb&&x.event.name==='Transfer'&&x.event.args.from.toLowerCase()===PINS.bnbPair&&x.event.args.to.toLowerCase()===PINS.router).reduce((sum,x)=>sum+x.event.args.value,0n);
   // Supporting-fee router unwraps its entire WBNB balance, including pre-existing dust.
   if(inbound<=0n||received<inbound)throw Error('swap_native_output_mismatch');
  }else{
   const path=route(operation.inputAsset,output),lastPair=path.at(-1)===PINS.arxi?PINS.arxiPair:path.at(-2)===PINS.arxi?PINS.arxiPair:PINS.bnbPair;
   received=parse.filter(x=>x.address===PINS[output]&&x.event.name==='Transfer'&&x.event.args.from.toLowerCase()===lastPair&&x.event.args.to.toLowerCase()===sender).reduce((sum,x)=>sum+x.event.args.value,0n);
  }
  if(received<minimum||received<=0n)throw Error('swap_output_evidence_missing');
  return {hash,state:'confirmed',blockNumber:String(receipt.blockNumber),operationKind:'swap',outputAsset:output,receivedAmountWei:received.toString(),outputEvidence:output==='native-bnb'?'verified-router-payout':'recipient-transfer-logs'};
 }finally{p.destroy();}
}
module.exports={readSwapReceipt};
