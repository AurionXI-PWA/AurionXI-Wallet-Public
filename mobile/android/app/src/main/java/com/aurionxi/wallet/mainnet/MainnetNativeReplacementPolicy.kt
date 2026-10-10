package com.aurionxi.wallet.mainnet

import java.math.BigInteger

/** Replacements preserve the original record; only exact mined receipts settle a nonce. */
internal object MainnetNativeReplacementPolicy {
  fun validReview(review: MainnetNativeIntentSemanticVerifier.ReviewedTransfer): Boolean =
    review.chainId == 56 && review.replacesTransactionHash?.matches(HASH) == true &&
      when (review.replacementKind) {
        "cancel" -> review.asset == MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB && review.assetContract == null &&
          review.amountWei == BigInteger.ZERO && review.senderAddress.equals(review.recipientAddress, true) && review.gasLimit == BigInteger.valueOf(21_000)
        "speed-up" -> review.amountWei > BigInteger.ZERO && review.amountWei.bitLength() <= 256
        else -> false
      }

  fun matchesOriginal(review: MainnetNativeIntentSemanticVerifier.ReviewedTransfer, original: MainnetEncryptedNonceJournal.Reservation): Boolean =
    validReview(review) && original.chainId == 56 && original.state == MainnetEncryptedNonceJournal.State.SUBMITTED &&
      original.replacesTransactionHash == null && original.senderAddress.equals(review.senderAddress, true) &&
      review.nonce == BigInteger.valueOf(original.nonce) && original.rawTransactionHash.equals(review.replacesTransactionHash, true) &&
      (review.replacementKind == "cancel" || (original.recipientAddress.equals(review.recipientAddress, true) &&
        original.assetId == review.asset.wireValue && original.amountWei == review.amountWei.toString()))

  fun related(original: MainnetEncryptedNonceJournal.Reservation, candidate: MainnetEncryptedNonceJournal.Reservation): Boolean =
    original.chainId == 56 && original.replacesTransactionHash == null && original.rawTransactionHash?.matches(HASH) == true &&
      candidate.chainId == original.chainId && candidate.senderAddress == original.senderAddress && candidate.nonce == original.nonce &&
      candidate.replacesTransactionHash == original.rawTransactionHash && when (candidate.replacementKind) {
        "cancel" -> candidate.assetId == "native-bnb" && candidate.recipientAddress == candidate.senderAddress && candidate.amountWei == "0"
        "speed-up" -> candidate.assetId == original.assetId && candidate.recipientAddress == original.recipientAddress && candidate.amountWei == original.amountWei
        else -> false
      }

  /** Pending/unknown evidence cannot settle either transaction. Reverts still consume a nonce. */
  fun superseded(record: MainnetEncryptedNonceJournal.Reservation, winner: MainnetEncryptedNonceJournal.Reservation): MainnetEncryptedNonceJournal.Reservation? {
    if (winner.state !in setOf(MainnetEncryptedNonceJournal.State.CONFIRMED, MainnetEncryptedNonceJournal.State.REVERTED) || winner.rawTransactionHash?.matches(HASH) != true || record.rawTransactionHash == winner.rawTransactionHash) return null
    if (record.rawTransactionHash?.matches(HASH) != true || record.state == MainnetEncryptedNonceJournal.State.DROPPED) return null
    if (record.state in setOf(MainnetEncryptedNonceJournal.State.CONFIRMED, MainnetEncryptedNonceJournal.State.REVERTED, MainnetEncryptedNonceJournal.State.CANCELLED)) return null
    val siblings = record.chainId == 56 && winner.chainId == 56 && record.senderAddress == winner.senderAddress && record.nonce == winner.nonce && record.replacesTransactionHash != null && record.replacesTransactionHash == winner.replacesTransactionHash
    if (!related(record, winner) && !related(winner, record) && !siblings) return null
    return record.copy(state = MainnetEncryptedNonceJournal.State.CANCELLED, cancelledByHash = winner.rawTransactionHash)
  }
  private val HASH = Regex("^0x[a-fA-F0-9]{64}$")
}
