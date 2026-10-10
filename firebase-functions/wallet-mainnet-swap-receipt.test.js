const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const ethers=require('ethers');
const {PINS,transactionFor}=require('./wallet-mainnet-swap-policy');
const sender='0x1111111111111111111111111111111111111111',other='0x2222222222222222222222222222222222222222',hash='0x'+'a'.repeat(64);
const abi=new ethers.Interface(['event Transfer(address indexed from,address indexed to,uint256 value)','event Approval(address indexed owner,address indexed spender,uint256 value)','event Withdrawal(address indexed src,uint256 wad)']);
const operation=(outputAsset='native-bnb',kind='swap')=>({kind,inputAsset:'arxi',outputAsset,intentAmountWei:'1000000000000000000',grossOutWei:'10000',estimatedOutWei:'9900',minimumOutWei:'9300',taxBps:'100',policyHash:'0x'+'b'.repeat(64),deadline:'2000000000'});
function log(address,event,args){return {address,...abi.encodeEventLog(abi.getEvent(event),args)};}
function reader(o,patch={}){
 const expected=transactionFor(sender,o),runtime='0x6000';
 const state={chain:'0x38',tx:{hash,from:sender,...expected,chainId:56n},receipt:{hash,status:1,blockNumber:100,logs:[]},code:runtime,...patch};
 class Provider{async send(){return state.chain;}async getTransaction(){return state.tx;}async getTransactionReceipt(){return state.receipt;}async getCode(address,block){assert.equal(address,PINS.router);assert.equal(block,100);return state.code;}destroy(){}}
 const module={exports:{}};
 // Exercise the real receipt implementation with deterministic provider data; no external RPC.
 vm.runInNewContext(fs.readFileSync(require.resolve('./wallet-mainnet-swap-receipt'),'utf8'),{module,require:name=>name==='ethers'?{...ethers,JsonRpcProvider:Provider}:name==='./wallet-mainnet-swap-manifest.json'?{contracts:[{address:PINS.router,runtimeHash:ethers.keccak256(runtime)}]}:require(name)});
 return {state,read:()=>module.exports.readSwapReceipt('http://fixture.invalid',hash,sender,o)};
}
test('native payout accepts exactly the inbound output and pre-existing router WBNB dust',async()=>{
 for(const dust of [0n,7n]){const {state,read}=reader(operation());state.receipt.logs=[log(PINS.wbnb,'Transfer',[PINS.bnbPair,PINS.router,9400n]),log(PINS.wbnb,'Withdrawal',[PINS.router,9400n+dust])];const r=await read();assert.equal(r.state,'confirmed');assert.equal(r.receivedAmountWei,String(9400n+dust));assert.equal(r.outputEvidence,'verified-router-payout');}
});
test('native output cannot be invented from unrelated withdrawal, missing inbound or changed router',async()=>{
 const {state,read}=reader(operation());
 for(const logs of [[log(PINS.wbnb,'Withdrawal',[PINS.router,9400n])],[log(PINS.wbnb,'Transfer',[PINS.bnbPair,PINS.router,9400n]),log(PINS.wbnb,'Withdrawal',[PINS.router,9300n])],[log(PINS.wbnb,'Transfer',[PINS.bnbPair,PINS.router,9400n]),log(PINS.wbnb,'Withdrawal',[other,9400n])]]){state.receipt.logs=logs;await assert.rejects(read);}
 state.code='0x6001';await assert.rejects(read,{message:'swap_router_changed'});
});
test('token amount requires exact output token, last pair, wallet and minimum',async()=>{
 const {state,read}=reader(operation('usdt'));
 state.receipt.logs=[log(PINS.usdt,'Transfer',[PINS.arxiPair,sender,9400n])];assert.equal((await read()).receivedAmountWei,'9400');
 for(const logs of [[log(PINS.usdt,'Transfer',[PINS.arxiPair,other,9400n])],[log(PINS.arxi,'Transfer',[PINS.arxiPair,sender,9400n])],[log(PINS.usdt,'Transfer',[other,sender,9400n])],[log(PINS.usdt,'Transfer',[PINS.arxiPair,sender,9200n])]]){state.receipt.logs=logs;await assert.rejects(read,{message:'swap_output_evidence_missing'});}
});
test('permission requires exact owner, pinned router and allowance including reset zero',async()=>{
 for(const kind of ['approve','reset']){const o=operation('usdt',kind),{state,read}=reader(o),amount=kind==='reset'?0n:BigInt(o.intentAmountWei);state.receipt.logs=[log(PINS.arxi,'Approval',[sender,PINS.router,amount])];assert.equal((await read()).operationKind,kind);state.receipt.logs=[log(PINS.arxi,'Approval',[sender,other,amount])];await assert.rejects(read,{message:'swap_approval_evidence_missing'});}
});
test('missing transaction, pending receipt and revert stay distinct and never invent received assets',async()=>{
 const {state,read}=reader(operation());state.tx=null;assert.equal((await read()).state,'unknown');
 state.tx={hash,from:sender,...transactionFor(sender,operation()),chainId:56n};state.receipt=null;assert.equal((await read()).state,'pending');
 state.receipt={hash,status:0,blockNumber:100,logs:[]};const r=await read();assert.equal(r.state,'reverted');assert.equal(r.receivedAmountWei,undefined);
});
test('exact hash, signed sender, calldata, value and chain bind receipt identity',async()=>{
 for(const patch of [{hash:'0x'+'c'.repeat(64)},{from:other},{data:'0x00'},{value:1n},{chainId:97n}]){const {state,read}=reader(operation());Object.assign(state.tx,patch);await assert.rejects(read,{message:'swap_receipt_identity_mismatch'});}
 const {read}=reader(operation(),{chain:'0x61'});await assert.rejects(read,{message:'wrong_chain'});
});
