package com.aurionxi.wallet.mainnet

import org.jetbrains.kotlin.com.intellij.openapi.util.Disposer
import org.jetbrains.kotlin.cli.common.messages.MessageCollector
import org.jetbrains.kotlin.cli.common.config.addKotlinSourceRoots
import org.jetbrains.kotlin.cli.jvm.compiler.EnvironmentConfigFiles
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinCoreEnvironment
import org.jetbrains.kotlin.cli.jvm.compiler.KotlinToJVMBytecodeCompiler
import org.jetbrains.kotlin.cli.jvm.config.addJvmClasspathRoots
import org.jetbrains.kotlin.config.CommonConfigurationKeys
import org.jetbrains.kotlin.config.CompilerConfiguration
import org.jetbrains.kotlin.psi.KtCallExpression
import org.jetbrains.kotlin.psi.KtFile
import org.jetbrains.kotlin.psi.KtImportDirective
import org.jetbrains.kotlin.psi.KtLambdaExpression
import org.jetbrains.kotlin.psi.KtPsiFactory
import org.jetbrains.kotlin.psi.KtStringTemplateExpression
import org.jetbrains.kotlin.psi.KtTreeVisitorVoid
import org.jetbrains.kotlin.psi.KtTypeAlias
import org.jetbrains.kotlin.resolve.DescriptorUtils
import org.jetbrains.kotlin.resolve.BindingContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class MainnetSignerPsiEnforcementTest {
  data class SigningCall(val file: String, val expression: String)

  @Test
  fun `ECKeyPair direct signer resolves to a forbidden semantic call`() {
    val fixture = File.createTempFile("point12j-ec-key-pair-", ".kt").apply {
      writeText(
        """
        package com.aurionxi.wallet.mainnet
        import org.web3j.crypto.Credentials
        fun bypass(credentials: Credentials, hash: ByteArray) = credentials.ecKeyPair.sign(hash)
        """.trimIndent(),
      )
    }
    val disposable = Disposer.newDisposable()
    try {
      val configuration = CompilerConfiguration().apply {
        put(CommonConfigurationKeys.MESSAGE_COLLECTOR_KEY, MessageCollector.NONE)
        put(CommonConfigurationKeys.MODULE_NAME, "point12j-ec-key-pair-fixture")
        addKotlinSourceRoots(listOf(fixture.absolutePath))
        addJvmClasspathRoots(System.getProperty("java.class.path").orEmpty().split(File.pathSeparator).map(::File).filter(File::exists))
      }
      val environment = KotlinCoreEnvironment.createForProduction(
        disposable,
        configuration,
        EnvironmentConfigFiles.JVM_CONFIG_FILES,
      )
      val analysis = requireNotNull(KotlinToJVMBytecodeCompiler.analyze(environment)) { "Fixture semantic analysis did not return a result" }
      analysis.throwIfError()
      val resolvedCalls = mutableListOf<String>()
      environment.getSourceFiles().single().accept(object : KtTreeVisitorVoid() {
        override fun visitCallExpression(expression: KtCallExpression) {
          super.visitCallExpression(expression)
          val call = analysis.bindingContext[BindingContext.CALL, expression.calleeExpression] ?: return
          val descriptor = analysis.bindingContext[BindingContext.RESOLVED_CALL, call]?.resultingDescriptor ?: return
          resolvedCalls += DescriptorUtils.getFqName(descriptor).asString()
        }
      })
      assertTrue(
        "ECKeyPair.sign fixture did not resolve to the forbidden signer: $resolvedCalls",
        resolvedCalls.any { it == "org.web3j.crypto.ECKeyPair.sign" && it in FORBIDDEN_RESOLVED_SIGNING_CALLS },
      )
    } finally {
      Disposer.dispose(disposable)
      fixture.delete()
    }
  }

  @Test
  fun `production signer APIs are AST constrained to the final boundary signer`() {
    val sourceRoot = File(System.getProperty("user.dir"), "src/main/java")
    assertTrue("Production source root not found: $sourceRoot", sourceRoot.isDirectory)

    val disposable = Disposer.newDisposable()
    try {
      val productionSources = sourceRoot.walkTopDown().filter { it.isFile && it.extension == "kt" }.toList()
      val configuration = CompilerConfiguration().apply {
        put(CommonConfigurationKeys.MESSAGE_COLLECTOR_KEY, MessageCollector.NONE)
        put(CommonConfigurationKeys.MODULE_NAME, "mainnet-signer-enforcement")
        addKotlinSourceRoots(productionSources.map(File::getAbsolutePath))
        addJvmClasspathRoots(System.getProperty("java.class.path").orEmpty().split(File.pathSeparator).map(::File).filter(File::exists))
      }
      val environment = KotlinCoreEnvironment.createForProduction(
        disposable,
        configuration,
        EnvironmentConfigFiles.JVM_CONFIG_FILES,
      )
      val factory = KtPsiFactory(environment.project, false)
      val calls = mutableListOf<SigningCall>()
      val violations = mutableListOf<String>()

      // Inspect the compiler-owned PSI used by the semantic pass below. Re-parsing
      // production files with a separate KtPsiFactory can attach named lambdas to
      // a different synthetic parent and falsely reject the approved final-boundary
      // signer even though the compiler resolves the same call correctly.
      environment.getSourceFiles().forEach { source ->
        inspect(source, source.name, calls, violations)
      }

      val analysis = requireNotNull(KotlinToJVMBytecodeCompiler.analyze(environment)) { "Kotlin semantic analysis did not return a result" }
      analysis.throwIfError()
      val resolvedSigners = mutableListOf<SigningCall>()
      val semanticViolations = mutableListOf<String>()
      environment.getSourceFiles().forEach { source ->
        source.accept(object : KtTreeVisitorVoid() {
          override fun visitCallExpression(expression: KtCallExpression) {
            super.visitCallExpression(expression)
            val call = analysis.bindingContext[BindingContext.CALL, expression.calleeExpression] ?: return
            val descriptor = analysis.bindingContext[BindingContext.RESOLVED_CALL, call]?.resultingDescriptor ?: return
            val fqName = DescriptorUtils.getFqName(descriptor).asString()
            if (fqName == "org.web3j.crypto.TransactionEncoder.signMessage") {
              resolvedSigners += SigningCall(source.name, fqName)
              if (source.name != "MainnetNativeTransactionSigner.kt" || !directNonEscapingFinalBoundaryUse(expression)) {
                semanticViolations += "${source.name}: resolved signer escaped final boundary $fqName"
              }
            }
            if (fqName in FORBIDDEN_RESOLVED_SIGNING_CALLS || FORBIDDEN_RESOLVED_CALL_PREFIXES.any(fqName::startsWith)) {
              semanticViolations += "${source.name}: resolved alternate signing/reflection call $fqName"
            }
          }
        })
      }
      assertTrue("Semantic signer violations:\n${semanticViolations.joinToString("\n")}", semanticViolations.isEmpty())
      assertEquals(
        listOf(SigningCall("MainnetNativeTransactionSigner.kt", "org.web3j.crypto.TransactionEncoder.signMessage")),
        resolvedSigners,
      )

      ADVERSARIAL_FIXTURES.forEachIndexed { index, source ->
        val fixtureViolations = mutableListOf<String>()
        inspect(factory.createFile("Adversarial$index.kt", source), "Adversarial$index.kt", mutableListOf(), fixtureViolations)
        assertTrue("Adversarial signer fixture $index escaped enforcement", fixtureViolations.isNotEmpty())
      }

      assertTrue("Unauthorized signer constructs:\n${violations.joinToString("\n")}", violations.isEmpty())
      assertEquals(
        listOf(SigningCall("MainnetNativeTransactionSigner.kt", "TransactionEncoder.signMessage")),
        calls,
      )
    } finally {
      Disposer.dispose(disposable)
    }
  }

  private fun inspect(
    file: KtFile,
    fileName: String,
    signingCalls: MutableList<SigningCall>,
    violations: MutableList<String>,
  ) {
    file.accept(object : KtTreeVisitorVoid() {
      override fun visitImportDirective(importDirective: KtImportDirective) {
        super.visitImportDirective(importDirective)
        val imported = importDirective.importedFqName?.asString().orEmpty()
        if (imported.startsWith("org.web3j.crypto.") && importDirective.aliasName != null) {
          violations += "$fileName: aliased crypto import ${importDirective.text}"
        }
        val allowed = ALLOWED_WEB3J_IMPORTS[fileName].orEmpty()
        if (imported.startsWith("org.web3j.crypto.") && imported !in allowed) {
          violations += "$fileName: unauthorized crypto import $imported"
        }
        if (FORBIDDEN_SIGNING_IMPORT_PREFIXES.any(imported::startsWith)) {
          violations += "$fileName: unauthorized signing provider import $imported"
        }
        if ((imported.startsWith("java.security.") || imported.startsWith("javax.crypto.")) &&
          imported !in ALLOWED_PLATFORM_CRYPTO_IMPORTS[fileName].orEmpty()) {
          violations += "$fileName: non-allowlisted platform crypto import $imported"
        }
        if (FORBIDDEN_REFLECTION_IMPORT_PREFIXES.any(imported::startsWith)) {
          violations += "$fileName: reflection import is forbidden $imported"
        }
      }

      override fun visitTypeAlias(typeAlias: KtTypeAlias) {
        super.visitTypeAlias(typeAlias)
        violations += "$fileName: typealias is forbidden in the Mainnet security package (${typeAlias.name})"
      }

      override fun visitStringTemplateExpression(expression: KtStringTemplateExpression) {
        super.visitStringTemplateExpression(expression)
        if (REFLECTIVE_SIGNER_NAMES.any { expression.text.contains(it, ignoreCase = true) }) {
          violations += "$fileName: signer/reflection token in string literal ${expression.text}"
        }
      }

      override fun visitCallExpression(expression: KtCallExpression) {
        super.visitCallExpression(expression)
        val callee = expression.calleeExpression?.text.orEmpty()
        val qualified = expression.parent?.text?.substringBefore('(')?.trim().orEmpty()
        if (callee == "signMessage") {
          signingCalls += SigningCall(fileName, qualified)
          val allowedSigner = fileName == "MainnetNativeTransactionSigner.kt" &&
            qualified == "TransactionEncoder.signMessage" && directNonEscapingFinalBoundaryUse(expression)
          if (!allowedSigner) violations += "$fileName: unauthorized signing call $qualified"
        }
        if (callee in REFLECTION_CALLS) violations += "$fileName: reflective call $callee is forbidden"
        if (FORBIDDEN_QUALIFIED_CALL_PREFIXES.any(qualified::startsWith)) {
          violations += "$fileName: alternate signing/reflection provider call $qualified"
        }
        if (callee == "sign" && (qualified.contains(".ecKeyPair.sign") || qualified.endsWith("ECKeyPair.sign"))) {
          violations += "$fileName: direct ECKeyPair signing call $qualified"
        }
        if (callee in ALTERNATE_SIGNING_CALLS) {
          val allowedRecovery = fileName == "MainnetNativeLegacyTransactionVerifier.kt" &&
            qualified == "Sign.signedMessageHashToKey"
          if (!allowedRecovery) violations += "$fileName: unauthorized signing call $qualified"
        }
      }
    })
  }

  private fun directNonEscapingFinalBoundaryUse(expression: KtCallExpression): Boolean {
    var ancestor = expression.parent
    var lambda: KtLambdaExpression? = null
    var boundary: KtCallExpression? = null
    while (ancestor != null) {
      if (lambda == null && ancestor is KtLambdaExpression) lambda = ancestor
      if (ancestor is KtCallExpression) {
        val qualified = ancestor.parent?.text?.substringBefore('(')?.trim().orEmpty()
        if (qualified == "MainnetNativeFinalKeyUseBoundary.execute") {
          boundary = ancestor
          break
        }
      }
      ancestor = ancestor.parent
    }
    val cryptographicLambda = lambda ?: return false
    if (boundary == null || cryptographicLambda.parent?.text?.trim()?.startsWith("cryptographicUse =") != true) return false
    val onlyStatement = cryptographicLambda.bodyExpression?.statements?.singleOrNull()?.text?.replace(Regex("\\s+"), "")
    return onlyStatement == "Numeric.toHexString(TransactionEncoder.signMessage(transaction,56L,credentials))"
  }

  companion object {
    private val ALLOWED_WEB3J_IMPORTS = mapOf(
      "MainnetNativeLegacyTransactionVerifier.kt" to setOf(
        "org.web3j.crypto.Hash", "org.web3j.crypto.Keys", "org.web3j.crypto.RawTransaction",
        "org.web3j.crypto.Sign", "org.web3j.crypto.TransactionEncoder",
      ),
      "MainnetNativeSigningCoordinator.kt" to setOf("org.web3j.crypto.Hash"),
      "MainnetNativeTransactionSigner.kt" to setOf(
        "org.web3j.crypto.Hash", "org.web3j.crypto.RawTransaction", "org.web3j.crypto.TransactionEncoder",
      ),
      "MainnetNativeVaultMigration.kt" to setOf(
        "org.web3j.crypto.Bip32ECKeyPair", "org.web3j.crypto.Credentials", "org.web3j.crypto.MnemonicUtils",
      ),
    )
    private val FORBIDDEN_SIGNING_IMPORT_PREFIXES = setOf(
      "org.bouncycastle.crypto.signers.",
      "org.bouncycastle.math.ec.",
      "org.hyperledger.besu.nativelib.secp256k1.",
    )
    private val ALLOWED_PLATFORM_CRYPTO_IMPORTS = mapOf(
      "MainnetNativeAuthorizationRegistry.kt" to setOf("java.security.SecureRandom"),
      "MainnetNativeSignedPayloadStore.kt" to setOf("java.security.SecureRandom"),
      "MainnetEncryptedNonceJournal.kt" to setOf("java.security.KeyStore", "javax.crypto.Cipher", "javax.crypto.KeyGenerator", "javax.crypto.SecretKey", "javax.crypto.spec.GCMParameterSpec"),
      "MainnetNativeVaultMigration.kt" to setOf("java.security.KeyStore", "javax.crypto.Cipher", "javax.crypto.KeyGenerator", "javax.crypto.SecretKey", "javax.crypto.spec.GCMParameterSpec"),
      "MainnetNativeSigningController.kt" to setOf("javax.crypto.Cipher"),
      "MainnetNativeSigningCoordinator.kt" to setOf("javax.crypto.Cipher"),
      "MainnetNativeTransactionSigner.kt" to setOf("javax.crypto.Cipher"),
    )
    private val FORBIDDEN_REFLECTION_IMPORT_PREFIXES = setOf(
      "java.lang.reflect.", "java.lang.invoke.", "kotlin.reflect.",
    )
    private val FORBIDDEN_QUALIFIED_CALL_PREFIXES = setOf(
      "java.security.Signature.", "java.security.KeyPairGenerator.", "javax.crypto.Mac.",
      "org.bouncycastle.", "org.hyperledger.besu.nativelib.secp256k1.",
      "Class.forName", "ClassLoader.", "java.lang.ClassLoader.", "MethodHandles.", "java.lang.invoke.MethodHandles.",
    )
    private val FORBIDDEN_RESOLVED_CALL_PREFIXES = setOf(
      "java.security.Signature.", "java.security.KeyPairGenerator.", "javax.crypto.Mac.",
      "org.bouncycastle.crypto.signers.", "org.hyperledger.besu.nativelib.secp256k1.",
      "java.lang.Class.forName", "java.lang.ClassLoader.", "java.lang.invoke.MethodHandles.",
      "kotlin.reflect.",
    )
    private val FORBIDDEN_RESOLVED_SIGNING_CALLS = setOf(
      "org.web3j.crypto.ECKeyPair.sign",
      "org.web3j.crypto.Sign.signMessage",
      "org.web3j.crypto.Sign.signPrefixedMessage",
      "org.web3j.crypto.Sign.signTypedData",
      "org.web3j.crypto.Sign.signAuthorization",
    )
    private val REFLECTION_CALLS = setOf(
      "forName", "loadClass", "getMethod", "getDeclaredMethod", "getDeclaredField",
      "invoke", "unreflect", "findStatic", "findVirtual", "call", "callBy",
    )
    private val REFLECTIVE_SIGNER_NAMES = setOf("signMessage", "TransactionEncoder", "secp256k1")
    private val ALTERNATE_SIGNING_CALLS = setOf(
      "signPrefixedMessage", "signTypedData", "signAuthorization", "createSignatureData",
      "signedMessageHashToKey",
    )
    private val ADVERSARIAL_FIXTURES = listOf(
      "package com.aurionxi.wallet.mainnet\nfun bypass(key: java.security.PrivateKey) = java.security.Signature.getInstance(\"NONEwithECDSA\").apply { initSign(key) }.sign()",
      "package com.aurionxi.wallet.mainnet\nfun bypass(loader: ClassLoader) = loader.loadClass(\"org.web3j.crypto.TransactionEncoder\")",
      "package com.aurionxi.wallet.mainnet\nimport java.lang.invoke.MethodHandles\nfun bypass() = MethodHandles.lookup()",
      "package com.aurionxi.wallet.mainnet\nfun escape() { val deferred = { TransactionEncoder.signMessage(transaction, 56L, credentials) }; MainnetNativeFinalKeyUseBoundary.execute({ true }, {}, {}, { deferred }) }",
      "package com.aurionxi.wallet.mainnet\nfun bypass(credentials: org.web3j.crypto.Credentials, hash: ByteArray) = credentials.ecKeyPair.sign(hash)",
      "package com.aurionxi.wallet.mainnet\nfun bypass(hash: ByteArray, key: org.web3j.crypto.ECKeyPair) = org.web3j.crypto.Sign.signMessage(hash, key)",
    )
  }
}
