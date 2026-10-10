package com.aurionxi.wallet.mainnet

import org.junit.Assert.*
import org.junit.Test
import com.aurionxi.wallet.BuildConfig
import java.math.BigInteger

class MainnetNativeSwapPolicyTest {
  @Test fun `swap release follows official Direct flavor and the native production gate`() {
    assertEquals(BuildConfig.APPLICATION_ID.endsWith(".direct") && BuildConfig.DIRECT_MAINNET_PRODUCTION_ENABLED, MainnetNativeSwapPolicy.isReleased())
  }
  private val sender="0x7e5f4552091a69125d5dfcb7b8c2659029395bdf"
  private fun review(row: List<String>): MainnetNativeIntentSemanticVerifier.ReviewedTransfer {
    val op=MainnetNativeSwapPolicy.Operation(row[0],row[1],row[2],row[3],"9300","9900","10000","100","0x"+"a".repeat(64),"2000000000")
    val asset=MainnetNativeIntentSemanticVerifier.Asset.values().single { it.wireValue==row[1] }
    return MainnetNativeIntentSemanticVerifier.ReviewedTransfer(56,sender,sender,asset,MainnetNativeIntentSemanticVerifier.tokenContract(asset),BigInteger(if(row[0]=="reset")"0" else row[3]),BigInteger("8"),BigInteger("400000"),BigInteger("50000000"),1L,swapOperation=op)
  }
  private fun fixtures()=requireNotNull(javaClass.classLoader!!.getResourceAsStream("swap-ethers-fixtures.tsv")).bufferedReader().use { it.readLines().filter(String::isNotBlank).map { row->row.split('\t') } }

  @Test fun `native calldata and signer identity match independent ethers fixtures for six routes and permissions`() {
    val rows=fixtures();assertEquals(10,rows.size)
    for(row in rows){
      val r=review(row);assertTrue(MainnetNativeSwapPolicy.validReview(r))
      val tx=MainnetNativeSwapPolicy.transaction(r)
      assertEquals(row[4],tx.to);assertEquals(BigInteger(row[5]),tx.valueWei);assertEquals(row[6],tx.data)
      assertTrue(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(r,row[7],sender))
      assertEquals(row[8],MainnetNativeLegacyTransactionVerifier.decode(row[7]).rawHash)
      for(changed in listOf(r.copy(recipientAddress=MainnetNativeSwapPolicy.ROUTER),r.copy(chainId=1),r.copy(nonce=BigInteger("9")),r.copy(amountWei=r.amountWei+BigInteger.ONE),r.copy(gasPriceWei=BigInteger("50000001"))))
        assertFalse(MainnetNativeIntentSemanticVerifier.matchesSignedRaw(changed,row[7],sender))
      assertFalse(MainnetNativeSwapPolicy.matches(r,tx.copy(data=tx.data+"00")))
      assertFalse(MainnetNativeSwapPolicy.matches(r,tx.copy(to=MainnetNativeSwapPolicy.FACTORY)))
      val op=requireNotNull(r.swapOperation)
      assertNotEquals(MainnetNativeReviewDigest.forTransfer(r),MainnetNativeReviewDigest.forTransfer(r.copy(swapOperation=op.copy(policyHash="0x"+"b".repeat(64)))))
      assertFalse(MainnetNativeSwapPolicy.valid(op.copy(minimumOutWei="0")))
      assertFalse(MainnetNativeSwapPolicy.valid(op.copy(taxBps="9400")))
    }
  }
}
