import { formatUnits, parseUnits, type Address } from "viem";
import type { NativeSwapQuote } from "./mainnet-native-swap";
import type { SwapAsset } from "./mainnet-swap-policy";

/** Addresses are identities, not case-sensitive display strings. Native signing revalidates independently. */
export function matchesSwapScreenIntent(
  q: NativeSwapQuote,
  sender: Address,
  input: SwapAsset,
  output: SwapAsset,
  amount: string,
): boolean {
  try {
    return (
      q.senderAddress.toLowerCase() === sender.toLowerCase() &&
      q.inputAsset === input &&
      q.outputAsset === output &&
      q.operation.inputAsset === input &&
      q.operation.outputAsset === output &&
      parseUnits(amount, 18).toString() === q.amountWei &&
      q.operation.intentAmountWei === q.amountWei
    );
  } catch {
    return false;
  }
}
export function formatSwapAmount(wei: string, places = 6): string {
  const [whole, fraction = ""] = formatUnits(BigInt(wei), 18).split(".");
  const trimmed = fraction.slice(0, places).replace(/0+$/, "");
  if (whole === "0" && !trimmed && BigInt(wei) > 0n)
    return `<${places ? `0.${"0".repeat(places - 1)}1` : "1"}`;
  return trimmed ? `${whole}.${trimmed}` : whole;
}
/** UI convenience only; authoritative amount, fee and balance checks remain native/server-side. */
export function spendableSwapBalance(
  asset: SwapAsset,
  balanceWei: string,
): bigint {
  const caps = {
    "native-bnb": 100000000000000000n,
    arxi: 5000000000000000000000n,
    usdt: 100000000000000000000n,
  };
  const balance = BigInt(balanceWei),
    reserved = asset === "native-bnb" ? 100000000000000n : 0n;
  const available = balance > reserved ? balance - reserved : 0n;
  return available < caps[asset] ? available : caps[asset];
}
