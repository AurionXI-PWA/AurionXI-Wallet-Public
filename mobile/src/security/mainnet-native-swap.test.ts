import {beforeEach,expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({prepare:vi.fn(),send:vi.fn()}));
vi.mock('react-native',()=>({Platform:{OS:'android'},NativeModules:{AurionXIMainnetSecurity:{prepareNativeMainnetSwap:mocks.prepare,sendNativeMainnetSwap:mocks.send}}}));
import {prepareNativeSwap,sendNativeSwap} from './mainnet-native-swap';
import {isSwapOperationMetadata} from './mainnet-swap-policy';
const sender='0x1111111111111111111111111111111111111111';
const hash=`0x${'a'.repeat(64)}`;
const quote=()=>({chainId:56,senderAddress:sender,inputAsset:'arxi',outputAsset:'usdt',amountWei:'1000000000000000000',operation:{kind:'swap',inputAsset:'arxi',outputAsset:'usdt',intentAmountWei:'1000000000000000000',grossOutWei:'10000',estimatedOutWei:'9900',minimumOutWei:'9300',taxBps:'100',policyHash:`0x${'b'.repeat(64)}`,deadline:String(Math.floor(Date.now()/1000)+180)},estimatedOutWei:'9900',minimumOutWei:'9300',nonce:'8',gas:'400000',gasPrice:'50000000',observedAt:Date.now(),executionEnabled:true,remainingSteps:1});
beforeEach(()=>{vi.clearAllMocks();mocks.prepare.mockResolvedValue(JSON.stringify(quote()));mocks.send.mockResolvedValue({state:'submitted',transactionHash:hash});});
it('preserves exact reviewed intent and sends only the native operation',async()=>{
 const q=await prepareNativeSwap(sender,'arxi','usdt','1000000000000000000');
 expect(Object.isFrozen(q)).toBe(true);expect(Object.isFrozen(q.operation)).toBe(true);
 await expect(sendNativeSwap(q,2)).resolves.toEqual({state:'submitted',transactionHash:hash});
 expect(mocks.send).toHaveBeenCalledWith(expect.objectContaining({recipient:sender,nonce:'8',swapOperation:q.operation}),2);
 expect(JSON.stringify(mocks.send.mock.calls)).not.toContain('serializedTransaction');
});
it('rejects changed intent, invalid minima, expired reviews and unsafe nonce/fees before signing',async()=>{
 for(const change of [{chainId:97},{senderAddress:`0x${'2'.repeat(40)}`},{outputAsset:'native-bnb'},{amountWei:'2'},{minimumOutWei:'0'},{estimatedOutWei:'1'},{observedAt:Date.now()-90000},{observedAt:Date.now()+10000},{nonce:'9007199254740992'},{gas:'500001'},{gasPrice:'1000000000000'},{remainingSteps:0}]){
  mocks.prepare.mockResolvedValueOnce(JSON.stringify({...quote(),...change}));
  await expect(prepareNativeSwap(sender,'arxi','usdt','1000000000000000000')).rejects.toThrow();
 }
 expect(mocks.send).not.toHaveBeenCalled();
});
it('disabled and stale reviews never invoke native signing',async()=>{
 const q=await prepareNativeSwap(sender,'arxi','usdt','1000000000000000000');
 for(const change of [{executionEnabled:false},{observedAt:Date.now()-90000}])await expect(sendNativeSwap({...q,...change},2)).rejects.toThrow();
 expect(mocks.send).not.toHaveBeenCalled();
});
it('reset authorizes zero allowance while retaining the exact desired swap amount',async()=>{
 const q=quote();q.operation.kind='reset';q.remainingSteps=3;mocks.prepare.mockResolvedValue(JSON.stringify(q));
 await sendNativeSwap(await prepareNativeSwap(sender,'arxi','usdt',q.amountWei),2);
 expect(mocks.send.mock.calls[0][0].amount).toBe('0');expect(mocks.send.mock.calls[0][0].swapOperation.intentAmountWei).toBe(q.amountWei);
});
it('unknown submission retains its exact hash and malformed results cannot create success',async()=>{
 const q=await prepareNativeSwap(sender,'arxi','usdt','1000000000000000000');
 mocks.send.mockResolvedValueOnce({state:'submission-unknown',transactionHash:hash});
 await expect(sendNativeSwap(q,2)).resolves.toEqual({state:'submission-unknown',transactionHash:hash});
 for(const bad of [{state:'confirmed',transactionHash:hash},{state:'submitted',transactionHash:'0x123'},null]){mocks.send.mockResolvedValueOnce(bad);await expect(sendNativeSwap(q,2)).rejects.toThrow('Check Activity');}
});
it('Activity metadata rejects impossible received amounts and permission on native BNB',()=>{
 const op=quote().operation;
 expect(isSwapOperationMetadata({...op,receivedAmountWei:'9400'})).toBe(true);
 expect(isSwapOperationMetadata({...op,receivedAmountWei:'9200'})).toBe(false);
 expect(isSwapOperationMetadata({...op,kind:'approve',inputAsset:'native-bnb'})).toBe(false);
});
