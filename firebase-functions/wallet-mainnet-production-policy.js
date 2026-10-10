const POLICY = Object.freeze({
  version: 1,
  chainId: 56n,
  releaseApproved: true,
  assets: Object.freeze(["native-bnb", "arxi", "usdt"]),
  maxNativeBnbAmountWei: 100_000_000_000_000_000n,
  maxArxiAmountWei: 5_000_000_000_000_000_000_000n,
  maxUsdtAmountWei: 100_000_000_000_000_000_000n,
  maxFeeWei: 100_000_000_000_000n,
  rollingWindowMs: 86_400_000,
  maxTransactionsPerWindow: 5,
  maxNativeBnbPerWindowWei: 100_000_000_000_000_000n,
  maxArxiPerWindowWei: 10_000_000_000_000_000_000_000n,
  maxUsdtPerWindowWei: 500_000_000_000_000_000_000n,
});

function policyError(code) { const error = new Error(code); error.code = code; error.status = 503; return error; }

/** Independent server lock. MAINNET_RELAY_ENABLED alone can never authorize production transfer submission. */
function enforceMainnetProductionPolicy(transaction, policy = POLICY) {
  if (transaction.swapOperation) require('./wallet-mainnet-swap-policy').validateOperation(transaction.swapOperation);
  if (!policy.releaseApproved) throw policyError("mainnet_production_policy_not_approved");
  const amountCap = transaction.asset === "native-bnb" ? policy.maxNativeBnbAmountWei
    : transaction.asset === "arxi" ? policy.maxArxiAmountWei
      : transaction.asset === "usdt" ? policy.maxUsdtAmountWei : undefined;
  if ((transaction.replacesTransactionHash && (!/^0x[0-9a-fA-F]{64}$/.test(transaction.replacesTransactionHash) || !["cancel", "speed-up"].includes(transaction.replacementKind)))
    || (!transaction.replacesTransactionHash && transaction.replacementKind !== undefined) || !policy.assets.includes(transaction.asset) || typeof amountCap !== "bigint" || amountCap <= 0n
    || (transaction.swapOperation && transaction.swapOperation.kind !== "swap" ? transaction.amountWei !== 0n : transaction.replacementKind === "cancel" ? transaction.asset !== "native-bnb" || transaction.amountWei !== 0n || transaction.senderAddress !== transaction.recipientAddress || transaction.gasLimit !== 21_000n : transaction.amountWei <= 0n) || transaction.amountWei > amountCap
    || transaction.gasLimit * transaction.gasPriceWei > policy.maxFeeWei) {
    const error = policyError("mainnet_production_policy_rejected"); error.status = 422; throw error;
  }
  return transaction;
}

module.exports = { POLICY, enforceMainnetProductionPolicy };
