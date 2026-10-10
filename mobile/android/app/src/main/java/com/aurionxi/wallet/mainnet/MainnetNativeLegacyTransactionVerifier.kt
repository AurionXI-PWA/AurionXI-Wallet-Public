package com.aurionxi.wallet.mainnet

import org.web3j.crypto.Hash
import org.web3j.crypto.Keys
import org.web3j.crypto.RawTransaction
import org.web3j.crypto.Sign
import org.web3j.crypto.TransactionEncoder
import java.math.BigInteger

/** Strict decoder for a legacy EIP-155 transaction. Typed, contract-creation,
 * and non-canonical RLP encodings are rejected before sender recovery. */
internal object MainnetNativeLegacyTransactionVerifier {
  internal data class Decoded(val chainId: Int, val senderAddress: String, val to: String, val valueWei: BigInteger, val data: String, val nonce: BigInteger, val gasLimit: BigInteger, val gasPriceWei: BigInteger, val rawHash: String)
  private sealed interface Item
  private data class Bytes(val value: ByteArray) : Item
  private data class Items(val value: List<Item>) : Item

  fun decode(rawHex: String): Decoded {
    val raw = hex(rawHex); val (root, end) = item(raw, 0, 0)
    require(end == raw.size && root is Items && root.value.size == 9) { "Invalid legacy Mainnet transaction." }
    val fields = root.value.map { require(it is Bytes) { "Invalid legacy Mainnet transaction." }; (it as Bytes).value }
    val nonce = quantity(fields[0]); val gasPrice = quantity(fields[1]); val gasLimit = quantity(fields[2]); val toBytes = fields[3]
    require(toBytes.size == 20) { "Contract creation is not permitted." }
    val value = quantity(fields[4]); val data = "0x" + toHex(fields[5]); val v = quantity(fields[6]); val r = quantity(fields[7]); val s = quantity(fields[8])
    require(r > BigInteger.ZERO && s > BigInteger.ZERO && r.bitLength() <= 256 && s.bitLength() <= 256 && s <= Sign.CURVE_PARAMS.n.shiftRight(1)) { "Invalid Mainnet signature." }
    require(v >= BigInteger.valueOf(35)) { "Unprotected Mainnet signature." }
    val adjusted = v.subtract(BigInteger.valueOf(35)); val recoveryId = adjusted.and(BigInteger.ONE).toInt(); val chain = adjusted.subtract(BigInteger.valueOf(recoveryId.toLong())).divide(BigInteger.TWO)
    require(chain == BigInteger.valueOf(56)) { "Wrong Mainnet transaction chain." }
    val to = "0x" + toHex(toBytes)
    val unsigned = RawTransaction.createTransaction(nonce, gasPrice, gasLimit, to, value, data)
    val signingHash = Hash.sha3(TransactionEncoder.encode(unsigned, chain.toLong()))
    val signature = Sign.SignatureData((recoveryId + 27).toByte(), leftPad32(r), leftPad32(s))
    val publicKey = Sign.signedMessageHashToKey(signingHash, signature)
    val sender = "0x" + Keys.getAddress(publicKey)
    return Decoded(56, sender.lowercase(), to.lowercase(), value, data.lowercase(), nonce, gasLimit, gasPrice, "0x" + toHex(Hash.sha3(raw)))
  }

  private fun item(bytes: ByteArray, start: Int, depth: Int): Pair<Item, Int> {
    require(depth <= MAX_RLP_DEPTH) { "Invalid RLP nesting." }
    require(start < bytes.size) { "Truncated RLP." }; val prefix = bytes[start].toInt() and 0xff
    if (prefix < 0x80) return Bytes(byteArrayOf(bytes[start])) to start + 1
    if (prefix <= 0xb7) { val size = prefix - 0x80; val offset = start + 1; require(offset + size <= bytes.size && !(size == 1 && (bytes[offset].toInt() and 0xff) < 0x80)) { "Non-canonical RLP." }; return Bytes(bytes.copyOfRange(offset, offset + size)) to offset + size }
    if (prefix <= 0xbf) { val lengthSize = prefix - 0xb7; val offset = start + 1; val size = length(bytes, offset, lengthSize); require(size >= 56 && offset + lengthSize + size <= bytes.size) { "Non-canonical RLP." }; val valueStart = offset + lengthSize; return Bytes(bytes.copyOfRange(valueStart, valueStart + size)) to valueStart + size }
    val list = prefix >= 0xf8; val lengthSize = if (list) prefix - 0xf7 else prefix - 0xc0; val offset = start + 1
    val size = if (list) length(bytes, offset, lengthSize) else prefix - 0xc0
    require((list && size >= 56 || !list) && offset + (if (list) lengthSize else 0) + size <= bytes.size) { "Non-canonical RLP." }
    val valueStart = offset + if (list) lengthSize else 0; val valueEnd = valueStart + size; val children = mutableListOf<Item>(); var cursor = valueStart
    while (cursor < valueEnd) { val (child, next) = item(bytes, cursor, depth + 1); children += child; cursor = next }
    require(cursor == valueEnd) { "Invalid RLP list." }; return Items(children) to valueEnd
  }
  private fun length(bytes: ByteArray, offset: Int, size: Int): Int { require(size in 1..4 && offset + size <= bytes.size && bytes[offset].toInt() != 0) { "Invalid RLP length." }; var result = 0L; repeat(size) { result = (result shl 8) or (bytes[offset + it].toLong() and 0xff) }; require(result <= bytes.size && (size == 1 || result >= (1L shl (8 * (size - 1))))) { "Invalid RLP length." }; return result.toInt() }
  private fun quantity(bytes: ByteArray): BigInteger { require(bytes.isEmpty() || bytes[0].toInt() != 0) { "Non-canonical integer." }; return if (bytes.isEmpty()) BigInteger.ZERO else BigInteger(1, bytes) }
  private fun leftPad32(value: BigInteger): ByteArray { val source = value.toByteArray().let { if (it.size == 33 && it[0].toInt() == 0) it.copyOfRange(1, 33) else it }; require(source.size <= 32) { "Invalid signature scalar." }; return ByteArray(32).also { System.arraycopy(source, 0, it, 32 - source.size, source.size) } }
  private fun hex(value: String): ByteArray { require(value.length <= MAX_RAW_HEX_LENGTH && value.matches(Regex("^0x[0-9a-fA-F]{2,}$")) && (value.length - 2) % 2 == 0) { "Invalid raw Mainnet transaction." }; return value.substring(2).chunked(2).map { it.toInt(16).toByte() }.toByteArray() }
  private fun toHex(value: ByteArray): String = value.joinToString("") { "%02x".format(it.toInt() and 0xff) }
  private const val MAX_RLP_DEPTH = 2
  private const val MAX_RAW_HEX_LENGTH = 131_074
}
