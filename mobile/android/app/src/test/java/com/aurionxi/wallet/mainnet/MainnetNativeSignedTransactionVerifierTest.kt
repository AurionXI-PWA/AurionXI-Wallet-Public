package com.aurionxi.wallet.mainnet

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.web3j.crypto.Credentials
import org.web3j.crypto.ECKeyPair
import org.web3j.crypto.Hash
import org.web3j.crypto.RawTransaction
import org.web3j.crypto.TransactionEncoder
import org.web3j.utils.Numeric
import java.math.BigInteger

class MainnetNativeSignedTransactionVerifierTest {
  private val credentials = Credentials.create(ECKeyPair.create(BigInteger.ONE))
  private val sender = credentials.address.lowercase()
  private val recipient = "0xd778c4a7cc7398e20aa73fba5af5021c54d2bb5b"
  private val gasPrice = BigInteger("50000000")

  @Test fun `accepts only the exact signed native BNB review`() {
    val review = review(MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB, BigInteger.ONE)
    val raw = Numeric.toHexString(TransactionEncoder.signMessage(RawTransaction.createTransaction(BigInteger.ZERO, gasPrice, BigInteger("21000"), recipient, BigInteger.ONE, "0x"), 56L, credentials))
    val decoded = MainnetNativeLegacyTransactionVerifier.decode(raw)
    assertEquals(sender, decoded.senderAddress); assertEquals(56, decoded.chainId); assertEquals(Hash.sha3(raw), decoded.rawHash); assertTrue(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review, raw, sender))
    for (changed in listOf(
      review.copy(recipientAddress = sender), review.copy(amountWei = BigInteger.TWO), review.copy(nonce = BigInteger.ONE),
      review.copy(gasLimit = BigInteger("21001")), review.copy(gasPriceWei = gasPrice.add(BigInteger.ONE)),
      review.copy(senderAddress = recipient), review.copy(assetContract = MainnetNativeIntentSemanticVerifier.arxiContract()),
    )) assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(changed, raw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review, raw, recipient))
  }

  @Test fun `accepts only fixed signed ARXI transfer calldata`() {
    val review = review(MainnetNativeIntentSemanticVerifier.Asset.ARXI, BigInteger("2000000")); val data = MainnetNativeIntentSemanticVerifier.erc20TransferData(recipient, review.amountWei)
    val raw = Numeric.toHexString(TransactionEncoder.signMessage(RawTransaction.createTransaction(BigInteger.ZERO, gasPrice, BigInteger("65000"), MainnetNativeIntentSemanticVerifier.arxiContract(), BigInteger.ZERO, data), 56L, credentials))
    assertTrue(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review, raw, sender)); assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review.copy(asset = MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB), raw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review.copy(assetContract = recipient), raw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review.copy(recipientAddress = sender), raw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review.copy(amountWei = BigInteger.ONE), raw, sender))
  }

  @Test fun `USDT signing binds its contract amount recipient and asset and rejects approval`() {
    val review = review(MainnetNativeIntentSemanticVerifier.Asset.USDT, BigInteger("1000000000000000001"))
    val data = MainnetNativeIntentSemanticVerifier.erc20TransferData(recipient, review.amountWei)
    val raw = sign(RawTransaction.createTransaction(BigInteger.ZERO, gasPrice, review.gasLimit, MainnetNativeIntentSemanticVerifier.usdtContract(), BigInteger.ZERO, data))
    assertTrue(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review, raw, sender))
    assertEquals("usdt", review.asset.wireValue); assertEquals("USDT", review.asset.symbol)
    for (changed in listOf(review.copy(asset = MainnetNativeIntentSemanticVerifier.Asset.ARXI),
      review.copy(assetContract = MainnetNativeIntentSemanticVerifier.arxiContract()), review.copy(amountWei = BigInteger.ONE),
      review.copy(recipientAddress = sender), review.copy(nonce = BigInteger.ONE))) {
      assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(changed, raw, sender))
    }
    val approval = "0x095ea7b3" + sender.removePrefix("0x").padStart(64, '0') + "1".padStart(64, '0')
    for ((contract, value, calldata) in listOf(
      Triple(MainnetNativeIntentSemanticVerifier.arxiContract(), BigInteger.ZERO, data),
      Triple(MainnetNativeIntentSemanticVerifier.usdtContract(), BigInteger.ONE, data),
      Triple(MainnetNativeIntentSemanticVerifier.usdtContract(), BigInteger.ZERO, approval),
      Triple(MainnetNativeIntentSemanticVerifier.usdtContract(), BigInteger.ZERO, data + "00"))) {
      assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review,
        sign(RawTransaction.createTransaction(BigInteger.ZERO, gasPrice, review.gasLimit, contract, value, calldata)), sender))
    }
    val arxi = review.copy(asset = MainnetNativeIntentSemanticVerifier.Asset.ARXI, assetContract = MainnetNativeIntentSemanticVerifier.arxiContract())
    assertFalse(MainnetNativeReviewDigest.forTransfer(review) == MainnetNativeReviewDigest.forTransfer(arxi))
  }

  @Test fun `rejects another chain`() {
    val review = review(MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB, BigInteger.ONE)
    val raw = Numeric.toHexString(TransactionEncoder.signMessage(RawTransaction.createTransaction(BigInteger.ZERO, gasPrice, BigInteger("21000"), recipient, BigInteger.ONE, "0x"), 1L, credentials))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review, raw, sender))
  }

  @Test fun `rejects approval arbitrary calldata contract creation and typed transactions`() {
    val review = review(MainnetNativeIntentSemanticVerifier.Asset.ARXI, BigInteger.ONE)
    val approval = "0x095ea7b3" + sender.removePrefix("0x").padStart(64, '0') + BigInteger.ONE.toString(16).padStart(64, '0')
    val approvalRaw = sign(RawTransaction.createTransaction(BigInteger.ZERO, gasPrice, BigInteger("65000"), MainnetNativeIntentSemanticVerifier.arxiContract(), BigInteger.ZERO, approval))
    val arbitraryRaw = sign(RawTransaction.createTransaction(BigInteger.ZERO, gasPrice, BigInteger("65000"), MainnetNativeIntentSemanticVerifier.arxiContract(), BigInteger.ZERO, "0x12345678"))
    val creationRaw = sign(RawTransaction.createContractTransaction(BigInteger.ZERO, gasPrice, BigInteger("65000"), BigInteger.ZERO, "0x6000"))
    val nativeRaw = sign(RawTransaction.createTransaction(BigInteger.ZERO, gasPrice, BigInteger("21000"), recipient, BigInteger.ONE, "0x"))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review, approvalRaw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review, arbitraryRaw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review, creationRaw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review(MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB, BigInteger.ONE), "0x02${nativeRaw.removePrefix("0x")}", sender))
  }

  @Test fun `rejects zero recipient oversized quantities malformed raw and excessive fees`() {
    val review = review(MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB, BigInteger.ONE)
    val raw = sign(RawTransaction.createTransaction(BigInteger.ZERO, gasPrice, BigInteger("21000"), recipient, BigInteger.ONE, "0x"))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review.copy(recipientAddress = "0x${"0".repeat(40)}"), raw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review.copy(amountWei = BigInteger.ONE.shiftLeft(256)), raw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review.copy(nonce = BigInteger.valueOf(Long.MAX_VALUE).add(BigInteger.ONE)), raw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review.copy(gasLimit = BigInteger("500001")), raw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review.copy(gasPriceWei = BigInteger("1000000000001")), raw, sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review, "0x01", sender))
    assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(review, "0x${"00".repeat(65_537)}", sender))
  }

  private fun sign(transaction: RawTransaction) = Numeric.toHexString(TransactionEncoder.signMessage(transaction, 56L, credentials))

  private fun review(asset: MainnetNativeIntentSemanticVerifier.Asset, amount: BigInteger) = MainnetNativeIntentSemanticVerifier.ReviewedTransfer(56, sender, recipient, asset, MainnetNativeIntentSemanticVerifier.tokenContract(asset), amount, BigInteger.ZERO, if (asset == MainnetNativeIntentSemanticVerifier.Asset.NATIVE_BNB) BigInteger("21000") else BigInteger("65000"), gasPrice, 1_000L)
}
