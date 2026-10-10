export type SwapAsset = 'native-bnb' | 'arxi' | 'usdt';
export type SwapOperationMetadata = Readonly<{ kind: 'swap' | 'approve' | 'reset'; inputAsset: SwapAsset; outputAsset: SwapAsset;
  intentAmountWei: string; estimatedOutWei: string; minimumOutWei: string; receivedAmountWei?: string }>;
export type SwapOperation = Omit<SwapOperationMetadata, 'receivedAmountWei'> & Readonly<{grossOutWei: string; taxBps: string; policyHash: string; deadline: string}>;
export const SWAP_PINS = Object.freeze({chainId:56,router:'0x10ed43c718714eb63d5aa57b78b54704e256024e',factory:'0xca143ce32fe78f1f7019d7d551a6402fc5350c73',arxi:'0x6ffec4860325f8bfb3f000354708a7d0cae4b250',usdt:'0x55d398326f99059ff775485246999027b3197955',wbnb:'0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c',arxiPair:'0xdf5ad8a9129f5c11655fa2576a3ec6d96d2b836a',bnbPair:'0x16b9a82891338f9ba80e2d6970fdda79d1eb0dae'});
export const SWAP_ASSETS: readonly SwapAsset[] = ['native-bnb','arxi','usdt'];
export const swapSymbol = (asset: SwapAsset) => asset === 'native-bnb' ? 'BNB' : asset.toUpperCase();
const positive = (v: unknown): v is string => typeof v === 'string' && /^[1-9][0-9]{0,77}$/.test(v) && BigInt(v) < 1n << 256n;
export function isSwapOperationMetadata(value: unknown): value is SwapOperationMetadata {
  if(!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const o = value as Record<string,unknown>;
  return ['swap','approve','reset'].includes(String(o.kind)) && SWAP_ASSETS.includes(o.inputAsset as SwapAsset) && SWAP_ASSETS.includes(o.outputAsset as SwapAsset) && o.inputAsset !== o.outputAsset
    && (o.kind === 'swap' || o.inputAsset !== 'native-bnb') && positive(o.intentAmountWei) && positive(o.estimatedOutWei) && positive(o.minimumOutWei) && BigInt(o.minimumOutWei) <= BigInt(o.estimatedOutWei)
    && (o.receivedAmountWei === undefined || positive(o.receivedAmountWei) && BigInt(o.receivedAmountWei) >= BigInt(o.minimumOutWei));
}
export function isSwapOperation(value: unknown): value is SwapOperation {
  if(!isSwapOperationMetadata(value))return false;
  const o=value as SwapOperation;
  if(!positive(o.grossOutWei) || typeof o.taxBps !== 'string' || !/^(0|[1-9][0-9]{0,3})$/.test(o.taxBps) || !positive(o.deadline) || !/^0x[0-9a-f]{64}$/.test(o.policyHash))return false;
  const tolerance=BigInt(o.taxBps)+600n;
  return tolerance<10000n && BigInt(o.estimatedOutWei)<=BigInt(o.grossOutWei) && BigInt(o.minimumOutWei)===BigInt(o.grossOutWei)*(10000n-tolerance)/10000n;
}
