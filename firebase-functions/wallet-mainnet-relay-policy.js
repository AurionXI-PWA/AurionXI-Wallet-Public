const { Transaction } = require("ethers");

const CHAIN_ID = 56n;
const ARXI = "0x6ffec4860325f8bfb3f000354708a7d0cae4b250";
const USDT = "0x55d398326f99059ff775485246999027b3197955";
const TRANSFER = "0xa9059cbb";
const MAX_GAS = 500_000n;
const MAX_GAS_PRICE_WEI = 1_000_000_000_000n;
const UINT256_MAX = (1n << 256n) - 1n;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

function failure(code) { const error = new Error(code); error.code = code; return error; }
function address(value, code) {
  const normalized = String(value || "").toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(normalized)) throw failure(code);
  return normalized;
}
function positive(value, code) {
  const text = String(value || "");
  if (!/^[1-9][0-9]{0,77}$/.test(text)) throw failure(code);
  return BigInt(text);
}
function nonnegative(value, code) {
  const text = String(value || "");
  if (!/^(0|[1-9][0-9]{0,77})$/.test(text)) throw failure(code);
  return BigInt(text);
}
function hash(value) {
  const normalized = String(value || "").toLowerCase();
  if (!/^0x[0-9a-f]{64}$/.test(normalized)) throw failure("invalid_expected_hash");
  return normalized;
}
function raw(value) {
  const serialized = String(value || "").trim();
  if (!/^0x[0-9a-fA-F]{2,131072}$/.test(serialized) || serialized.length % 2 !== 0) throw failure("invalid_serialized_transaction");
  return serialized;
}
function erc20Data(recipient, amount) {
  return `${TRANSFER}${recipient.slice(2).padStart(64, "0")}${amount.toString(16).padStart(64, "0")}`;
}

/**
 * Pure deny-by-default policy for the future Mainnet relay. It accepts only
 * native BNB and pinned ARXI/USDT ERC-20 transfer shapes, exactly matching the
 * public intent already reviewed and signed by the device.
 */
function validateMainnetRelayRequest(body) {
  const serializedTransaction = raw(body?.serializedTransaction);
  const expectedHash = hash(body?.expectedHash);
  const senderAddress = address(body?.senderAddress, "invalid_sender_address");
  const recipientAddress = address(body?.recipientAddress, "invalid_recipient_address");
  if (recipientAddress === ZERO_ADDRESS) throw failure("invalid_recipient_address");
  const asset = String(body?.asset || "");
  const replacesTransactionHash = body?.replacesTransactionHash === undefined ? undefined : hash(body.replacesTransactionHash);
  const replacementKind = body?.replacementKind;
  if ((replacesTransactionHash && !["cancel", "speed-up"].includes(replacementKind)) || (!replacesTransactionHash && replacementKind !== undefined)) throw failure("invalid_replacement_intent");
  const amountWei = replacementKind === "cancel" ? nonnegative(body?.amountWei, "invalid_amount_wei") : positive(body?.amountWei, "invalid_amount_wei");
  const nonce = nonnegative(body?.nonce, "invalid_nonce");
  const gasLimit = positive(body?.gasLimit, "invalid_gas_limit");
  const gasPriceWei = positive(body?.gasPriceWei, "invalid_gas_price");
  if (asset !== "native-bnb" && asset !== "arxi" && asset !== "usdt") throw failure("unsupported_asset");
  if (amountWei > UINT256_MAX || nonce > BigInt(Number.MAX_SAFE_INTEGER) || gasLimit > MAX_GAS || gasPriceWei > MAX_GAS_PRICE_WEI) throw failure("invalid_transaction_policy");
  let transaction;
  try { transaction = Transaction.from(serializedTransaction); } catch { throw failure("invalid_serialized_transaction"); }
  if (!transaction.isSigned() || !transaction.hash || transaction.type !== 0 || transaction.chainId !== CHAIN_ID) throw failure("mainnet_chain_type_or_signature_required");
  if (transaction.hash.toLowerCase() !== expectedHash || transaction.from.toLowerCase() !== senderAddress) throw failure("signed_transaction_identity_mismatch");
  if (BigInt(transaction.nonce) !== nonce || transaction.gasLimit !== gasLimit || transaction.gasPrice !== gasPriceWei) throw failure("signed_transaction_fee_or_nonce_mismatch");
  if (replacesTransactionHash && (replacesTransactionHash === expectedHash || (replacementKind === "speed-up" && amountWei <= 0n))) throw failure("invalid_replacement_intent");
  if (replacementKind === "cancel" && (asset !== "native-bnb" || amountWei !== 0n || recipientAddress !== senderAddress || gasLimit !== 21_000n || replacesTransactionHash === expectedHash)) throw failure("invalid_cancellation_intent");
  if (asset === "native-bnb") {
    if (!transaction.to || transaction.to.toLowerCase() !== recipientAddress || transaction.value !== amountWei || transaction.data !== "0x") throw failure("native_transfer_mismatch");
  } else {
    const tokenContract = asset === "usdt" ? USDT : ARXI;
    if (!transaction.to || transaction.to.toLowerCase() !== tokenContract || transaction.value !== 0n || transaction.data.toLowerCase() !== erc20Data(recipientAddress, amountWei)) {
      throw failure(asset === "usdt" ? "usdt_transfer_mismatch" : "arxi_transfer_mismatch");
    }
  }
  return { serializedTransaction, expectedHash, senderAddress, recipientAddress, asset, amountWei, nonce, gasLimit, gasPriceWei, ...(replacesTransactionHash ? { replacesTransactionHash, replacementKind } : {}) };
}

module.exports = { ARXI, USDT, CHAIN_ID, erc20Data, validateMainnetRelayRequest };
