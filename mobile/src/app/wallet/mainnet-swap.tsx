import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  AppState,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatUnits, parseUnits, type Address, type Hash } from "viem";
import {
  prepareNativeSwap,
  sendNativeSwap,
  type NativeSwapQuote,
} from "@/security/mainnet-native-swap";
import {
  SWAP_ASSETS,
  swapSymbol,
  type SwapAsset,
} from "@/security/mainnet-swap-policy";
import {
  formatSwapAmount,
  matchesSwapScreenIntent,
  spendableSwapBalance,
} from "@/security/mainnet-swap-ui-policy";
import { useMainnetSessionLock } from "@/security/mainnet-session-lock-provider";
import { readMainnetWalletIdentityRecord } from "@/security/wallet-identity-record-store";
import { useSensitiveScreenProtection } from "@/security/use-sensitive-screen-protection";
import { useMainnetTransfers } from "@/hooks/use-mainnet-transfers";
import {
  fetchMainnetPortfolio,
  type MainnetPortfolio,
} from "@/services/mainnet-portfolio";
import { MainnetSwapAssetIcon as AssetIcon } from "@/components/mainnet-swap-asset-icon";
import { MainnetSupportReportButton } from "@/components/mainnet-support-report-button";

const NAMES: Record<SwapAsset, string> = {
  "native-bnb": "BNB",
  arxi: "AurionXI",
  usdt: "Tether USD",
};
function balanceOf(p: MainnetPortfolio | undefined, a: SwapAsset) {
  return p?.assets[
    a === "native-bnb" ? "bnbWei" : a === "arxi" ? "arxiWei" : "usdtWei"
  ];
}
function dollars(p: MainnetPortfolio | undefined, a: SwapAsset, value: string) {
  const price =
    p?.valuation.status === "available"
      ? p.valuation.assets?.[a === "native-bnb" ? "bnb" : a]?.priceUsd
      : undefined;
  if (!price) return "—";
  const number = Number(value) * Number(price);
  return Number.isFinite(number)
    ? `$${number.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : "—";
}

export default function MainnetSwapScreen() {
  useSensitiveScreenProtection();
  const router = useRouter();
  const session = useMainnetSessionLock();
  const { isLocked, authorizationEpoch, isAuthorizationActive } = session;
  const [sender, setSender] = useState<Address>();
  const [input, setInput] = useState<SwapAsset>("native-bnb");
  const [output, setOutput] = useState<SwapAsset>("arxi");
  const [amount, setAmount] = useState("");
  const [quote, setQuote] = useState<NativeSwapQuote>();
  const [busy, setBusy] = useState<"review" | "confirm">();
  const [message, setMessage] = useState<string>();
  const [pendingHash, setPendingHash] = useState<Hash>();
  const [now, setNow] = useState(() => Date.now());
  const [selector, setSelector] = useState<"from" | "to">();
  const [details, setDetails] = useState(false);
  const [portfolio, setPortfolio] = useState<MainnetPortfolio>();
  const [balanceLoading, setBalanceLoading] = useState(false);
  const [balanceVersion, setBalanceVersion] = useState(0);
  const [resumeReview, setResumeReview] = useState(false);
  const inFlight = useRef(false),
    mounted = useRef(true),
    intent = useRef("");
  const key = [
    sender?.toLowerCase(),
    input,
    output,
    amount,
    authorizationEpoch,
  ].join(":");
  useLayoutEffect(() => {
    intent.current = key;
  }, [key]);
  const transfers = useMainnetTransfers(sender, !isLocked);
  useEffect(() => {
    let active = true;
    if (isLocked) {
      // Session lock invalidates externally loaded wallet identity immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSender(undefined);
      setQuote(undefined);
      setPortfolio(undefined);
      return;
    }
    void readMainnetWalletIdentityRecord()
      .then((x) => {
        if (active && x) setSender(x.publicAddress);
        else if (active) setMessage("Unlock your wallet to continue.");
      })
      .catch(() => {
        if (active)
          setMessage("Your wallet could not be opened. Unlock again.");
      });
    return () => {
      active = false;
    };
  }, [isLocked]);
  useEffect(() => {
    if (!sender || isLocked) return;
    let active = true;
    // This effect starts a new external portfolio request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setBalanceLoading(true);
    void fetchMainnetPortfolio(sender)
      .then((p) => {
        if (active) setPortfolio(p);
      })
      .catch(() => {
        if (active) setPortfolio(undefined);
      })
      .finally(() => {
        if (active) setBalanceLoading(false);
      });
    return () => {
      active = false;
    };
  }, [sender, isLocked, balanceVersion]);
  useEffect(() => {
    mounted.current = true;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "background") {
        setQuote(undefined);
        setSelector(undefined);
        setDetails(false);
        setResumeReview(false);
      }
    });
    return () => {
      mounted.current = false;
      clearInterval(timer);
      sub.remove();
    };
  }, []);
  useEffect(() => {
    // Authorization or swap intent changed; invalidate the old external review.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuote(undefined);
    setResumeReview(false);
  }, [key]);
  useEffect(() => {
    // A different wallet identity must not retain the previous wallet's receipt.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingHash(undefined);
    setMessage(undefined);
  }, [sender]);
  const pending = transfers.records.find(
    (x) => x.transactionHash.toLowerCase() === pendingHash?.toLowerCase(),
  );
  const outstanding = transfers.nativeRecords.find((x) =>
    [
      "submitted",
      "pending",
      "submission-unknown",
      "status-unavailable",
    ].includes(x.receiptState),
  );
  useEffect(() => {
    if (!pendingHash && outstanding)
      // External native recovery records provide the authoritative pending hash.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPendingHash(outstanding.transactionHash);
  }, [outstanding, pendingHash]);
  useEffect(() => {
    if (
      !pending ||
      !["confirmed", "reverted", "not-submitted"].includes(pending.receiptState)
    )
      return;
    // Consume a terminal receipt from the external transaction store once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPendingHash(undefined);
    setQuote(undefined);
    setBalanceVersion((x) => x + 1);
    if (
      pending.receiptState === "confirmed" &&
      pending.operation?.kind !== "swap" &&
      pending.operation
    ) {
      setMessage("Permission updated. Preparing your swap…");
      setResumeReview(true);
    } else
      setMessage(
        pending.receiptState === "confirmed"
          ? "Swap completed."
          : "This transaction did not complete. Review again.",
      );
  }, [pending]);
  const expired = !quote || now >= quote.observedAt + 90000;
  const blockedTransaction = !!pendingHash || !!outstanding;
  const rejectReason = useCallback(() => {
    if (isLocked || !isAuthorizationActive(authorizationEpoch))
      return "Unlock your wallet to continue.";
    if (!sender) return "Your wallet is still opening.";
    if (blockedTransaction)
      return "Check your pending transaction before continuing.";
    if (transfers.unavailable)
      return "Previous transactions could not be checked. Refresh to continue.";
    if (transfers.refreshing) return "Checking your previous transactions…";
    return undefined;
  }, [
    isLocked,
    isAuthorizationActive,
    authorizationEpoch,
    sender,
    blockedTransaction,
    transfers.unavailable,
    transfers.refreshing,
  ]);
  const prepare = useCallback(async () => {
    const reason = rejectReason();
    if (reason) {
      setMessage(reason);
      return;
    }
    if (inFlight.current) return;
    const epoch = authorizationEpoch,
      requested = key;
    inFlight.current = true;
    setBusy("review");
    setMessage(undefined);
    setQuote(undefined);
    Keyboard.dismiss();
    try {
      if (
        !/^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(amount) ||
        amount.length > 79
      )
        throw Error("Enter a valid amount.");
      const value = parseUnits(amount, 18);
      if (value <= 0n) throw Error("Enter an amount greater than zero.");
      const q = await prepareNativeSwap(
        sender!,
        input,
        output,
        value.toString(),
      );
      if (
        mounted.current &&
        intent.current === requested &&
        isAuthorizationActive(epoch)
      )
        setQuote(q);
    } catch (e) {
      if (mounted.current && intent.current === requested)
        setMessage(
          e instanceof Error
            ? e.message
            : "Swap review is unavailable. Try again.",
        );
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(undefined);
    }
  }, [
    rejectReason,
    authorizationEpoch,
    key,
    amount,
    sender,
    input,
    output,
    isAuthorizationActive,
  ]);
  // A permission receipt triggers a fresh quote only. Every signature still needs its own tap and biometrics.
  useEffect(() => {
    if (
      resumeReview &&
      !busy &&
      !pendingHash &&
      !outstanding &&
      !transfers.refreshing &&
      !transfers.unavailable &&
      sender &&
      !isLocked
    ) {
      // Confirmed permission permits a fresh review, never an automatic signature.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setResumeReview(false);
      void prepare();
    }
  }, [
    resumeReview,
    busy,
    pendingHash,
    outstanding,
    transfers.refreshing,
    transfers.unavailable,
    sender,
    isLocked,
    prepare,
  ]);
  async function confirm() {
    const reason = rejectReason();
    if (reason) {
      setMessage(reason);
      return;
    }
    if (inFlight.current) return;
    if (
      !quote ||
      expired ||
      Date.now() >= quote.observedAt + 90000 ||
      !quote.executionEnabled
    ) {
      setQuote(undefined);
      setMessage("Refresh your swap quote to continue.");
      return;
    }
    if (!matchesSwapScreenIntent(quote, sender!, input, output, amount)) {
      setQuote(undefined);
      setMessage("Your swap changed. Review it again.");
      return;
    }
    const epoch = authorizationEpoch,
      requested = key;
    inFlight.current = true;
    setBusy("confirm");
    setMessage(undefined);
    Keyboard.dismiss();
    try {
      const result = await sendNativeSwap(quote, epoch);
      if (
        mounted.current &&
        intent.current === requested &&
        isAuthorizationActive(epoch)
      ) {
        setPendingHash(result.transactionHash);
        setQuote(undefined);
        setMessage(
          result.state === "submitted"
            ? "Transaction submitted."
            : result.state === "submission-unknown"
              ? "Confirming your transaction status."
              : "Check this transaction before trying again.",
        );
        transfers.refreshHash(result.transactionHash);
      }
    } catch (e) {
      if (mounted.current && intent.current === requested) {
        setQuote(undefined);
        setMessage(
          e instanceof Error
            ? e.message
            : "Check Activity before trying again.",
        );
        transfers.refresh();
      }
    } finally {
      inFlight.current = false;
      if (mounted.current) setBusy(undefined);
    }
  }
  function choose(asset: SwapAsset) {
    if (busy || blockedTransaction) return;
    if (selector === "from") {
      setInput(asset);
      if (asset === output) setOutput(input);
    } else {
      setOutput(asset);
      if (asset === input) setInput(output);
    }
    setSelector(undefined);
    setMessage(undefined);
  }
  function fraction(percent: number) {
    const value = balanceOf(portfolio, input);
    if (value === undefined || busy || blockedTransaction) return;
    setAmount(
      formatUnits(
        (spendableSwapBalance(input, value) * BigInt(percent)) / 100n,
        18,
      ),
    );
    setMessage(undefined);
  }
  const inputBalance = balanceOf(portfolio, input),
    validAmount =
      /^(0|[1-9][0-9]*)(\.[0-9]{1,18})?$/.test(amount) &&
      amount.length <= 79 &&
      Number(amount) > 0;
  const needsRefresh =
    !!quote &&
    (expired ||
      (!!sender &&
        !matchesSwapScreenIntent(quote, sender, input, output, amount)));
  const label =
    busy === "review"
      ? "Getting quote…"
      : busy === "confirm"
        ? "Confirm on your phone…"
        : isLocked
          ? "Unlock wallet"
          : blockedTransaction
            ? "Check status"
            : transfers.unavailable
              ? "Refresh activity"
              : transfers.refreshing
                ? "Checking activity…"
                : !sender
                  ? "Opening wallet…"
                  : quote && !needsRefresh
                    ? quote.executionEnabled
                      ? quote.operation.kind === "reset"
                        ? "Reset permission"
                        : quote.operation.kind === "approve"
                          ? `Approve ${swapSymbol(input)}`
                          : "Confirm swap"
                      : "Swap unavailable"
                    : needsRefresh
                      ? "Refresh quote"
                      : "Review swap";
  const disabled =
    !!busy ||
    (!isLocked &&
      !blockedTransaction &&
      !transfers.unavailable &&
      (transfers.refreshing ||
        !sender ||
        !validAmount ||
        (!!quote && !needsRefresh && !quote.executionEnabled)));
  function primary() {
    if (isLocked) {
      router.replace("/wallet/mainnet-unlock" as never);
      return;
    }
    if (blockedTransaction) {
      const hash = pendingHash || outstanding?.transactionHash;
      if (hash) transfers.refreshHash(hash);
      return;
    }
    if (transfers.unavailable) {
      transfers.refresh();
      return;
    }
    if (quote && !needsRefresh) void confirm();
    else void prepare();
  }
  const received = quote ? formatSwapAmount(quote.estimatedOutWei) : "0";
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Back to wallet"
            disabled={!!busy}
            onPress={() => router.replace("/wallet/mainnet-readonly" as never)}
            style={styles.headerButton}
          >
            <Text style={styles.back}>‹</Text>
          </Pressable>
          <Text style={styles.title}>Swap</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap details"
            disabled={!!busy}
            onPress={() => {
              Keyboard.dismiss();
              setDetails(true);
            }}
            style={styles.headerButton}
          >
            <Text style={styles.info}>ⓘ</Text>
          </Pressable>
        </View>
        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.network}>
            <View style={styles.networkDot} />
            <Text style={styles.networkText}>BNB Smart Chain</Text>
          </View>
          <View style={styles.assetCard}>
            <Text style={styles.eyebrow}>You pay</Text>
            <View style={styles.amountRow}>
              <TextInput
                accessibilityLabel="Swap amount"
                value={amount}
                onChangeText={(v) => {
                  setAmount(v);
                  setMessage(undefined);
                }}
                editable={!busy && !blockedTransaction && !isLocked}
                placeholder="0"
                placeholderTextColor="#9CA5B3"
                keyboardType="decimal-pad"
                style={styles.input}
                maxLength={79}
              />
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select pay asset"
                disabled={!!busy || blockedTransaction || isLocked}
                onPress={() => {
                  Keyboard.dismiss();
                  setSelector("from");
                }}
                style={styles.assetPill}
              >
                <AssetIcon asset={input} />
                <Text style={styles.symbol}>{swapSymbol(input)}</Text>
                <Text style={styles.chevron}>⌄</Text>
              </Pressable>
            </View>
            <View style={styles.balanceRow}>
              <Text style={styles.fiat}>
                {dollars(portfolio, input, amount || "0")}
              </Text>
              <View style={styles.balanceRight}>
                <Text style={styles.balance}>
                  Balance:{" "}
                  {balanceLoading
                    ? "…"
                    : inputBalance === undefined
                      ? "—"
                      : formatSwapAmount(inputBalance)}{" "}
                  {swapSymbol(input)}
                </Text>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Use maximum available amount"
                  disabled={
                    inputBalance === undefined ||
                    !!busy ||
                    blockedTransaction ||
                    isLocked
                  }
                  onPress={() => fraction(100)}
                >
                  <Text style={styles.max}>Max</Text>
                </Pressable>
              </View>
            </View>
          </View>
          <View style={styles.directionRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reverse swap assets"
              disabled={!!busy || blockedTransaction || isLocked}
              style={styles.direction}
              onPress={() => {
                setInput(output);
                setOutput(input);
                setAmount("");
                setMessage(undefined);
              }}
            >
              <Text style={styles.directionText}>↓</Text>
            </Pressable>
          </View>
          <View style={styles.assetCard}>
            <Text style={styles.eyebrow}>You receive</Text>
            <View style={styles.amountRow}>
              <Text
                style={[styles.received, !quote && styles.placeholder]}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {received}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Select receive asset"
                disabled={!!busy || blockedTransaction || isLocked}
                onPress={() => {
                  Keyboard.dismiss();
                  setSelector("to");
                }}
                style={styles.assetPill}
              >
                <AssetIcon asset={output} />
                <Text style={styles.symbol}>{swapSymbol(output)}</Text>
                <Text style={styles.chevron}>⌄</Text>
              </Pressable>
            </View>
            <Text style={styles.fiat}>
              {quote
                ? dollars(
                    portfolio,
                    output,
                    formatUnits(BigInt(quote.estimatedOutWei), 18),
                  )
                : "Estimated amount"}
            </Text>
          </View>
          <View style={styles.quickAmounts}>
            {[25, 50, 75, 100].map((n) => (
              <Pressable
                key={n}
                accessibilityRole="button"
                accessibilityLabel={`Use ${n}% of available amount`}
                disabled={
                  inputBalance === undefined ||
                  !!busy ||
                  blockedTransaction ||
                  isLocked
                }
                onPress={() => fraction(n)}
                style={styles.quickButton}
              >
                <Text style={styles.quickText}>
                  {n === 100 ? "Max" : `${n}%`}
                </Text>
              </Pressable>
            ))}
          </View>
          {quote ? (
            <View style={styles.summary}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Minimum received</Text>
                <Text style={styles.summaryValue}>
                  {formatSwapAmount(quote.minimumOutWei)} {swapSymbol(output)}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>
                  Network fee
                  {quote.operation.kind !== "swap" ? " · approval" : ""}
                </Text>
                <Text style={styles.summaryValue}>
                  {formatSwapAmount(
                    (BigInt(quote.gas) * BigInt(quote.gasPrice)).toString(),
                    9,
                  )}{" "}
                  BNB
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>AurionXI Wallet fee</Text>
                <Text style={styles.free}>0%</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Slippage</Text>
                <Text style={styles.summaryValue}>Auto</Text>
              </View>
              {quote.operation.kind !== "swap" ? (
                <Text style={styles.permissionNote}>
                  {quote.operation.kind === "reset"
                    ? "Reset your existing permission first."
                    : "Approve tokens for this swap."}{" "}
                  The swap follows after confirmation.
                </Text>
              ) : null}
            </View>
          ) : (
            <Text style={styles.intro}>
              Swap BNB, ARXI and USDT with zero wallet fees.
            </Text>
          )}
          {quote && !quote.executionEnabled ? (
            <Text style={styles.notice}>Swap is temporarily unavailable.</Text>
          ) : null}
          {message ? (
            <View style={styles.noticeCard}>
              <Text accessibilityRole="alert" style={styles.notice}>
                {message}
              </Text>
            </View>
          ) : null}
          {transfers.unavailable ? (
            <Text style={styles.notice}>
              Previous transactions could not be checked. Tap Refresh activity.
            </Text>
          ) : null}
          {blockedTransaction ? (
            <View style={styles.pendingCard}>
              <View style={styles.pendingDot} />
              <View style={styles.flex}>
                <Text style={styles.pendingTitle}>Transaction in progress</Text>
                <Text style={styles.pendingCopy}>
                  Check status to continue.
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                onPress={() =>
                  router.replace("/wallet/mainnet-activity" as never)
                }
              >
                <Text style={styles.max}>Activity</Text>
              </Pressable>
            </View>
          ) : null}
        </ScrollView>
        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled, busy: !!busy }}
            disabled={disabled}
            onPress={primary}
            style={[styles.primary, disabled && styles.primaryDisabled]}
          >
            {busy || transfers.refreshing ? (
              <ActivityIndicator color={disabled ? "#8995AA" : "#FFF"} />
            ) : null}
            <Text
              style={[
                styles.primaryText,
                disabled && styles.primaryTextDisabled,
              ]}
            >
              {label}
            </Text>
          </Pressable>
          <Text style={styles.footerNote}>
            {quote?.operation.kind === "approve"
              ? "Approve tokens, then confirm your swap."
              : "AurionXI Wallet swap fee 0%"}
          </Text>
        </View>
      </KeyboardAvoidingView>
      <Modal
        visible={!!selector}
        transparent
        animationType="slide"
        onRequestClose={() => setSelector(undefined)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close asset selection"
            style={styles.scrim}
            onPress={() => setSelector(undefined)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Select token</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close token picker"
                onPress={() => setSelector(undefined)}
              >
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            {SWAP_ASSETS.map((a) => (
              <Pressable
                key={a}
                accessibilityRole="button"
                accessibilityLabel={`Choose ${swapSymbol(a)}`}
                onPress={() => choose(a)}
                style={styles.tokenRow}
              >
                <AssetIcon asset={a} />
                <View style={styles.flex}>
                  <Text style={styles.tokenName}>{swapSymbol(a)}</Text>
                  <Text style={styles.tokenSubtitle}>{NAMES[a]}</Text>
                </View>
                <Text style={styles.tokenBalance}>
                  {balanceOf(portfolio, a) === undefined
                    ? "—"
                    : formatSwapAmount(balanceOf(portfolio, a)!)}
                </Text>
                {a === (selector === "from" ? input : output) ? (
                  <Text style={styles.selection}>✓</Text>
                ) : null}
              </Pressable>
            ))}
            <Text style={styles.sheetFootnote}>BNB Smart Chain · Mainnet</Text>
          </View>
        </View>
      </Modal>
      <Modal
        visible={details}
        transparent
        animationType="slide"
        onRequestClose={() => setDetails(false)}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close swap details"
            style={styles.scrim}
            onPress={() => setDetails(false)}
          />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>Swap details</Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close details"
                onPress={() => setDetails(false)}
              >
                <Text style={styles.close}>×</Text>
              </Pressable>
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.detailsCopy}>
                Slippage is automatic. Network fees are paid in BNB. AurionXI
                Wallet charges no swap fee.
              </Text>
              {quote ? (
                <>
                  <Text style={styles.detailsLabel}>
                    Estimated received · exact amount
                  </Text>
                  <Text selectable style={styles.detailsCopy}>
                    {formatUnits(BigInt(quote.estimatedOutWei), 18)}{" "}
                    {swapSymbol(output)}
                  </Text>
                  <Text style={styles.detailsLabel}>
                    Minimum received · exact amount
                  </Text>
                  <Text selectable style={styles.detailsCopy}>
                    {formatUnits(BigInt(quote.minimumOutWei), 18)}{" "}
                    {swapSymbol(output)}
                  </Text>
                  {quote.remainingSteps > 1 ? (
                    <Text style={styles.detailsCopy}>
                      {quote.remainingSteps} transactions are required. Each
                      uses a network fee.
                    </Text>
                  ) : null}
                </>
              ) : null}
              {pendingHash ? (
                <>
                  <Text style={styles.detailsLabel}>Transaction hash</Text>
                  <Text selectable style={styles.detailsCopy}>
                    {pendingHash}
                  </Text>
                </>
              ) : null}
              <View style={styles.support}>
                <MainnetSupportReportButton
                  sender={sender}
                  disabled={!!busy || transfers.refreshing || isLocked}
                />
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  safe: { flex: 1, backgroundColor: "#F8FAFD" },
  header: {
    height: 60,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
  },
  headerButton: {
    height: 44,
    width: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  back: { fontSize: 38, lineHeight: 42, color: "#16223B" },
  info: { fontSize: 24, color: "#52657F" },
  title: { fontSize: 20, fontWeight: "700", color: "#16223B" },
  content: { paddingHorizontal: 20, paddingBottom: 20 },
  network: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 4,
    marginBottom: 22,
  },
  networkDot: {
    height: 7,
    width: 7,
    borderRadius: 4,
    backgroundColor: "#F0B90B",
  },
  networkText: { fontSize: 12, fontWeight: "600", color: "#697991" },
  assetCard: {
    backgroundColor: "#FFF",
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    borderColor: "#E9EEF5",
  },
  eyebrow: {
    fontSize: 13,
    fontWeight: "600",
    color: "#748197",
    marginBottom: 12,
  },
  amountRow: { flexDirection: "row", alignItems: "center", gap: 10 },
  input: {
    flex: 1,
    fontSize: 34,
    fontWeight: "500",
    color: "#16223B",
    paddingVertical: 5,
    minWidth: 0,
  },
  assetPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    backgroundColor: "#F2F5FA",
    borderRadius: 24,
    paddingVertical: 8,
    paddingLeft: 8,
    paddingRight: 12,
  },
  icon: { height: 28, width: 28, borderRadius: 14 },
  iconCenter: { alignItems: "center", justifyContent: "center" },
  iconLetter: { color: "#FFF", fontSize: 21, fontWeight: "800" },
  symbol: { fontSize: 17, fontWeight: "700", color: "#16223B" },
  chevron: { fontSize: 19, color: "#697991" },
  balanceRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 6,
    marginTop: 12,
  },
  balanceRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    flexWrap: "wrap",
  },
  balance: { fontSize: 11, color: "#748197" },
  fiat: { fontSize: 13, color: "#748197", marginTop: 4 },
  max: {
    fontSize: 12,
    fontWeight: "700",
    color: "#316DE8",
    paddingVertical: 5,
  },
  directionRow: {
    height: 12,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  direction: {
    height: 42,
    width: 42,
    borderRadius: 21,
    backgroundColor: "#EDF2FA",
    borderWidth: 5,
    borderColor: "#F8FAFD",
    alignItems: "center",
    justifyContent: "center",
  },
  directionText: { fontSize: 25, lineHeight: 29, color: "#52657F" },
  received: {
    flex: 1,
    fontSize: 32,
    fontWeight: "500",
    color: "#16223B",
    paddingVertical: 5,
  },
  placeholder: { color: "#9CA5B3" },
  quickAmounts: { flexDirection: "row", gap: 8, marginTop: 16 },
  quickButton: {
    flex: 1,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#EDF2FA",
    borderRadius: 12,
  },
  quickText: { fontSize: 12, fontWeight: "600", color: "#52657F" },
  summary: { marginTop: 22, paddingHorizontal: 4, gap: 15 },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    alignItems: "flex-start",
  },
  summaryLabel: { fontSize: 12, color: "#748197", flex: 1 },
  summaryValue: {
    fontSize: 12,
    fontWeight: "600",
    color: "#23344D",
    textAlign: "right",
    flex: 1,
  },
  free: { fontSize: 12, fontWeight: "700", color: "#148A69" },
  permissionNote: {
    fontSize: 12,
    lineHeight: 19,
    color: "#748197",
    backgroundColor: "#EDF2FA",
    borderRadius: 12,
    padding: 12,
  },
  intro: {
    fontSize: 12,
    lineHeight: 19,
    color: "#8793A7",
    textAlign: "center",
    marginTop: 24,
  },
  noticeCard: {
    marginTop: 16,
    padding: 12,
    backgroundColor: "#EDF2FA",
    borderRadius: 12,
  },
  notice: { fontSize: 13, lineHeight: 20, color: "#52657F" },
  pendingCard: {
    marginTop: 18,
    padding: 14,
    borderRadius: 16,
    backgroundColor: "#EEF3FC",
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  pendingDot: {
    height: 9,
    width: 9,
    borderRadius: 5,
    backgroundColor: "#E5AD2C",
  },
  pendingTitle: { fontSize: 13, fontWeight: "700", color: "#23344D" },
  pendingCopy: { fontSize: 12, color: "#748197", marginTop: 4 },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderTopColor: "#E9EEF5",
    backgroundColor: "#F8FAFD",
  },
  primary: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    borderRadius: 17,
    backgroundColor: "#316DE8",
  },
  primaryDisabled: { backgroundColor: "#E3EAF6" },
  primaryText: { fontSize: 16, fontWeight: "700", color: "#FFF" },
  primaryTextDisabled: { color: "#8A97AD" },
  footerNote: {
    fontSize: 11,
    color: "#8793A7",
    textAlign: "center",
    marginTop: 10,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: "rgba(16,28,50,0.35)",
  },
  sheet: {
    maxHeight: "78%",
    backgroundColor: "#FFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 34,
  },
  sheetHandle: {
    height: 4,
    width: 36,
    backgroundColor: "#DEE5EE",
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 20,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  sheetTitle: { fontSize: 20, fontWeight: "700", color: "#16223B" },
  close: { fontSize: 28, color: "#748197", paddingHorizontal: 8 },
  tokenRow: {
    minHeight: 76,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#EFF3F8",
  },
  tokenName: { fontSize: 16, fontWeight: "700", color: "#16223B" },
  tokenSubtitle: { fontSize: 12, color: "#748197", marginTop: 4 },
  tokenBalance: { fontSize: 13, fontWeight: "600", color: "#52657F" },
  selection: { fontSize: 18, color: "#316DE8" },
  sheetFootnote: {
    fontSize: 12,
    color: "#8793A7",
    textAlign: "center",
    marginTop: 22,
  },
  detailsCopy: {
    fontSize: 13,
    lineHeight: 21,
    color: "#52657F",
    marginBottom: 12,
  },
  detailsLabel: {
    fontSize: 12,
    fontWeight: "700",
    color: "#16223B",
    marginBottom: 6,
    marginTop: 6,
  },
  support: {
    backgroundColor: "#0C1C3D",
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingBottom: 16,
    marginTop: 6,
  },
});
