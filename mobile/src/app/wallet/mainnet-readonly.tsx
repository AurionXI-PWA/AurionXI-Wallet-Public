import { Redirect, useRouter } from "expo-router";
import * as Clipboard from "expo-clipboard";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { formatUnits, type Address } from "viem";

import {
  getAssetTargetsForNetwork,
  type NetworkAssetTarget,
} from "@/config/asset-targets";
import { NETWORK_TARGETS } from "@/config/network-targets";
import { evaluateMainnetReadiness } from "@/security/mainnet-readiness-policy";
import {
  fetchMainnetPortfolio,
  type MainnetPortfolio,
} from "@/services/mainnet-portfolio";
import { useMainnetSessionLock } from "@/security/mainnet-session-lock-provider";
import { useMainnetSendFlow } from "@/security/mainnet-send-flow-provider";
import {
  getMainnetVaultV3Status,
  type VaultStatus,
} from "@/security/vault-store";
import { readMainnetWalletIdentityRecord } from "@/security/wallet-identity-record-store";
import { MainnetWalletBrandMark } from "@/components/mainnet-wallet-brand-mark";
import { formatSwapAmount } from "@/security/mainnet-swap-ui-policy";
import { registerPublicWalletAddress } from "@/services/wallet-address-registry";
import { readWalletRegistryConsent, writeWalletRegistryConsent } from "@/storage/wallet-address-registry-consent";

type AssetId = NetworkAssetTarget["id"];
const ASSETS = getAssetTargetsForNetwork(NETWORK_TARGETS.mainnet);
const BALANCE_KEYS = {
  "native-bnb": "bnbWei",
  arxi: "arxiWei",
  usdt: "usdtWei",
  usdc: "usdcWei",
  eth: "ethWei",
  btcb: "btcbWei",
} as const;
const PRIMARY_IDS: AssetId[] = ["arxi", "usdt", "native-bnb"];
function balanceOf(p: MainnetPortfolio | undefined, id: AssetId) {
  return p?.assets[BALANCE_KEYS[id]];
}
function usd(value?: string) {
  if (!value || !/^\d+(\.\d{2})$/.test(value)) return "$—";
  const [whole, fraction] = value.split(".");
  return `$${Number(whole).toLocaleString("en-US")}.${fraction}`;
}
function tokenBalance(value: string) {
  const [whole, fraction] = formatSwapAmount(value).split(".");
  if (whole.startsWith("<")) return formatSwapAmount(value);
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return fraction ? grouped + "." + fraction : grouped;
}
function price(value?: string) {
  if (!value || !/^\d+(\.\d+)?$/.test(value)) return "—";
  const number = Number(value);
  if (!Number.isFinite(number)) return "—";
  if (number > 0 && number < 0.000001) return "<$0.000001";
  return `$${number.toLocaleString("en-US", { maximumFractionDigits: number >= 1 ? 2 : 6 })}`;
}
function AssetMark({ asset }: { asset: NetworkAssetTarget }) {
  if (asset.id === "arxi") return <MainnetWalletBrandMark size={44} />;
  return (
    <View
      style={[
        styles.assetMark,
        styles.assetMarkCenter,
        { backgroundColor: asset.accent },
      ]}
    >
      <Text style={styles.assetGlyph}>
        {asset.id === "native-bnb"
          ? "◆"
          : asset.id === "usdt"
            ? "₮"
            : asset.id === "eth"
              ? "Ξ"
              : asset.id === "btcb"
                ? "₿"
                : "$"}
      </Text>
    </View>
  );
}

export default function MainnetReadOnlyScreen() {
  const router = useRouter();
  const { isLocked, authorizationEpoch, isAuthorizationActive } =
    useMainnetSessionLock();
  const { setQuote } = useMainnetSendFlow();
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | "loading">(
    "loading",
  );
  const [walletAddress, setWalletAddress] = useState<Address>();
  const [portfolio, setPortfolio] = useState<MainnetPortfolio>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();
  const [addressCopied, setAddressCopied] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<NetworkAssetTarget>();
  const mounted = useRef(true),
    request = useRef(0),
    inFlight = useRef(false);
  const canRead = evaluateMainnetReadiness("read").allowed;

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current += 1;
    };
  }, []);
  useEffect(() => {
    let active = true;
    void getMainnetVaultV3Status()
      .then((status) => {
        if (active) setVaultStatus(status);
      })
      .catch(() => {
        if (active) setVaultStatus("unsupported");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (vaultStatus === "present" && isLocked)
      router.replace("/wallet/mainnet-unlock" as never);
  }, [isLocked, router, vaultStatus]);
  useEffect(() => {
    let active = true;
    if (isLocked || vaultStatus !== "present") {
      request.current += 1;
      inFlight.current = false;
      // A lock or unavailable vault invalidates the externally loaded public account immediately.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setWalletAddress(undefined);
      setPortfolio(undefined);
      setLoading(false);
      setAccountOpen(false);
      setSelectedAsset(undefined);
      setAddressCopied(false);
      return;
    }
    void readMainnetWalletIdentityRecord()
      .then((identity) => {
        if (active && identity) setWalletAddress(identity.publicAddress);
      })
      .catch(() => {
        if (active) setError("Your wallet could not be opened. Unlock again.");
      });
    return () => {
      active = false;
    };
  }, [isLocked, vaultStatus]);
  useEffect(() => {
    if (!walletAddress || isLocked) return;
    void readWalletRegistryConsent().then(async (record) => {
      if (!record || record.registered || record.publicAddress.toLowerCase() !== walletAddress.toLowerCase()) return;
      await registerPublicWalletAddress(walletAddress, record.origin);
      await writeWalletRegistryConsent({ ...record, registered: true });
    }).catch(() => undefined);
  }, [walletAddress, isLocked]);
  const load = useCallback(async () => {
    if (
      !canRead ||
      !walletAddress ||
      isLocked ||
      !isAuthorizationActive(authorizationEpoch) ||
      inFlight.current
    )
      return;
    const id = ++request.current,
      epoch = authorizationEpoch;
    const active = () =>
      mounted.current && request.current === id && isAuthorizationActive(epoch);
    inFlight.current = true;
    setLoading(true);
    setError(undefined);
    try {
      const result = await fetchMainnetPortfolio(walletAddress);
      if (active()) setPortfolio(result);
    } catch {
      if (active())
        setError("Could not refresh balances. Pull down to try again.");
    } finally {
      if (active()) {
        inFlight.current = false;
        setLoading(false);
      }
    }
  }, [
    authorizationEpoch,
    canRead,
    isAuthorizationActive,
    isLocked,
    walletAddress,
  ]);
  useEffect(() => {
    // Hydrated wallet identity starts one external portfolio read. Refreshes thereafter are user initiated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (walletAddress) void load();
  }, [walletAddress, load]);
  useEffect(() => {
    if (!addressCopied) return;
    const timer = setTimeout(() => setAddressCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [addressCopied]);
  const copyWalletAddress = async () => {
    if (!walletAddress || isLocked) return;
    const epoch = authorizationEpoch;
    try {
      await Clipboard.setStringAsync(walletAddress);
      if (mounted.current && isAuthorizationActive(epoch))
        setAddressCopied(true);
    } catch {
      if (mounted.current && isAuthorizationActive(epoch))
        setError("Address could not be copied. Open Receive to share it.");
    }
  };
  function openSend() {
    if (
      !portfolio ||
      !walletAddress ||
      !isAuthorizationActive(authorizationEpoch)
    )
      return;
    setQuote({
      walletAddress,
      chainId: 56,
      bnbWei: portfolio.assets.bnbWei,
      arxiWei: portfolio.assets.arxiWei,
      usdtWei: portfolio.assets.usdtWei,
      blockNumber: portfolio.blockNumber,
      pendingNonce: portfolio.quote.pendingNonce,
      gasPriceWei: portfolio.quote.gasPriceWei,
      observedAt: portfolio.quote.observedAt,
    });
    setSelectedAsset(undefined);
    router.push("/wallet/mainnet-send-review" as never);
  }
  function navigate(
    path:
      | "/wallet/mainnet-swap"
      | "/wallet/mainnet-receive"
      | "/wallet/mainnet-activity"
      | "/wallet/mainnet-assets"
      | "/wallet/settings",
  ) {
    if (!isAuthorizationActive(authorizationEpoch)) return;
    setSelectedAsset(undefined);
    setAccountOpen(false);
    router.push(path as never);
  }
  const assetQuote = (id: AssetId) =>
    portfolio?.valuation.status === "available"
      ? portfolio.valuation.assets?.[id === "native-bnb" ? "bnb" : id]
      : undefined;
  const visibleAssets = [
    ...PRIMARY_IDS.map((id) => ASSETS.find((a) => a.id === id)!),
    ...ASSETS.filter(
      (a) =>
        !PRIMARY_IDS.includes(a.id) &&
        BigInt(balanceOf(portfolio, a.id) ?? "0") > 0n,
    ),
  ];
  const sendDisabled = !portfolio || isLocked;

  if (vaultStatus !== "loading" && vaultStatus !== "present")
    return <Redirect href={"/wallet/mainnet-onboarding" as never} />;
  if (isLocked || vaultStatus === "loading" || !walletAddress)
    return (
      <SafeAreaView style={styles.safe}>
        <StatusBar style="dark" />
        <View accessibilityLabel="Opening wallet" style={styles.opening}>
          <ActivityIndicator color="#3169EE" />
          <Text style={styles.muted}>{error || "Opening wallet…"}</Text>
          {error ? (
            <Pressable
              accessibilityRole="button"
              onPress={() => router.replace("/wallet/mainnet-unlock" as never)}
              style={styles.sheetAction}
            >
              <Text style={styles.sheetActionText}>Unlock wallet</Text>
            </Pressable>
          ) : null}
        </View>
      </SafeAreaView>
    );
  return (
    <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => void load()}
            tintColor="#3169EE"
            colors={["#3169EE"]}
          />
        }
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Open wallet account"
            accessibilityRole="button"
            onPress={() => setAccountOpen(true)}
            style={styles.walletSelector}
          >
            <MainnetWalletBrandMark size={36} />
            <View style={styles.walletNameGroup}>
              <Text style={styles.walletName}>AurionXI Wallet</Text>
              <Text style={styles.network}>
                <Text style={styles.networkDot}>● </Text>BNB Smart Chain
              </Text>
            </View>
            <Text style={styles.chevron}>⌄</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Open wallet settings"
            accessibilityRole="button"
            onPress={() => navigate("/wallet/settings")}
            style={styles.headerButton}
          >
            <Text style={styles.menuGlyph}>☰</Text>
          </Pressable>
        </View>
        <View style={styles.balanceSection}>
          <Text style={styles.balanceLabel}>Total balance</Text>
          <Text
            accessibilityLabel="Total wallet balance"
            accessibilityLiveRegion="polite"
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.55}
            style={styles.total}
          >
            {portfolio
              ? usd(
                  portfolio.valuation.status === "available"
                    ? portfolio.valuation.totalUsd
                    : undefined,
                )
              : loading
                ? "Loading…"
                : "$—"}
          </Text>
          <View style={styles.balanceMeta}>
            <Text style={styles.muted}>
              {portfolio?.valuation.status === "available"
                ? "USD · BNB Smart Chain"
                : "USD value unavailable"}
            </Text>
            <View style={styles.addressRow}>
              <Text
                selectable
                accessibilityLabel="Mainnet wallet address"
                style={styles.addressText}
              >
                {walletAddress}
              </Text>
              <Pressable
                accessibilityLabel="Copy Mainnet wallet address"
                accessibilityRole="button"
                onPress={() => void copyWalletAddress()}
                style={styles.copyIconButton}
              >
                <Text style={styles.copyIcon}>{addressCopied ? "✓" : "⧉"}</Text>
              </Pressable>
            </View>
          </View>
        </View>
        <View style={styles.actions}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Swap BNB, ARXI or USDT"
            onPress={() => navigate("/wallet/mainnet-swap")}
            style={styles.action}
          >
            <Text style={[styles.actionGlyph, styles.brand]}>⇅</Text>
            <Text style={styles.actionText}>Swap</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Send assets"
            accessibilityHint={
              sendDisabled
                ? "Refresh balances to enable sending"
                : "Opens the transfer form"
            }
            disabled={sendDisabled}
            onPress={openSend}
            style={[styles.action, sendDisabled && styles.disabled]}
          >
            <Text style={styles.actionGlyph}>↗</Text>
            <Text style={styles.actionText}>Send</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Receive assets"
            onPress={() => navigate("/wallet/mainnet-receive")}
            style={styles.action}
          >
            <Text style={styles.actionGlyph}>↙</Text>
            <Text style={styles.actionText}>Receive</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open activity history"
            onPress={() => navigate("/wallet/mainnet-activity")}
            style={styles.action}
          >
            <Text style={styles.actionGlyph}>◷</Text>
            <Text style={styles.actionText}>History</Text>
          </Pressable>
        </View>
        {error ? (
          <View style={styles.notice}>
            <Text accessibilityRole="alert" style={styles.noticeText}>
              {error}
            </Text>
            <Pressable
              accessibilityRole="button"
              disabled={loading}
              onPress={() => void load()}
              style={styles.retry}
            >
              <Text style={styles.brandText}>Retry</Text>
            </Pressable>
          </View>
        ) : null}
        {!portfolio && loading ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator color="#3169EE" />
            <Text style={styles.muted}>Loading your assets…</Text>
          </View>
        ) : null}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Tokens</Text>
          <Pressable
            accessibilityLabel="View all assets"
            accessibilityRole="button"
            onPress={() => navigate("/wallet/mainnet-assets")}
            style={styles.viewAll}
          >
            <Text style={styles.brandText}>View all ›</Text>
          </Pressable>
        </View>
        <View style={styles.tokens}>
          {visibleAssets.map((asset) => {
            const balance = balanceOf(portfolio, asset.id),
              value = assetQuote(asset.id);
            return (
              <Pressable
                key={asset.id}
                accessibilityLabel={`View ${asset.symbol} details`}
                accessibilityRole="button"
                onPress={() => setSelectedAsset(asset)}
                style={({ pressed }) => [
                  styles.tokenRow,
                  pressed && styles.pressed,
                ]}
              >
                <AssetMark asset={asset} />
                <View style={styles.tokenDescription}>
                  <Text numberOfLines={1} style={styles.tokenName}>
                    {asset.id === "native-bnb" ? "BNB" : asset.name}
                  </Text>
                  <Text style={styles.tokenPrice}>
                    {price(value?.priceUsd)}
                    <Text style={styles.tokenSymbol}> · {asset.symbol}</Text>
                  </Text>
                </View>
                <View style={styles.tokenValues}>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    style={styles.tokenUsd}
                  >
                    {usd(value?.valueUsd)}
                  </Text>
                  <Text
                    numberOfLines={1}
                    adjustsFontSizeToFit
                    minimumFontScale={0.7}
                    style={styles.tokenBalance}
                  >
                    {balance === undefined ? "—" : tokenBalance(balance)}{" "}
                    {asset.symbol}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.networkFooter}>
          <View style={styles.smallDot} />
          <Text style={styles.footerText}>BNB Smart Chain</Text>
          <Text style={styles.footerDivider}>·</Text>
          <Text style={styles.footerText}>Pull down to refresh</Text>
        </View>
      </ScrollView>
      <View style={styles.navigation}>
        <View
          accessibilityLabel="Wallet dashboard selected"
          style={styles.navItem}
        >
          <Text style={[styles.navGlyph, styles.brand]}>⌂</Text>
          <Text style={[styles.navLabel, styles.brand]}>Home</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Assets section"
          onPress={() => navigate("/wallet/mainnet-assets")}
          style={styles.navItem}
        >
          <Text style={styles.navGlyph}>◇</Text>
          <Text style={styles.navLabel}>Assets</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Open swap"
          onPress={() => navigate("/wallet/mainnet-swap")}
          style={styles.navItem}
        >
          <View style={styles.swapBubble}>
            <Text style={styles.swapBubbleGlyph}>⇅</Text>
          </View>
          <Text style={[styles.navLabel, styles.brand]}>Swap</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Activity section"
          onPress={() => navigate("/wallet/mainnet-activity")}
          style={styles.navItem}
        >
          <Text style={styles.navGlyph}>◷</Text>
          <Text style={styles.navLabel}>Activity</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Wallet settings and network selection"
          onPress={() => navigate("/wallet/settings")}
          style={styles.navItem}
        >
          <Text style={styles.navGlyph}>☷</Text>
          <Text style={styles.navLabel}>Settings</Text>
        </Pressable>
      </View>
      <Modal
        visible={accountOpen || !!selectedAsset}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setAccountOpen(false);
          setSelectedAsset(undefined);
        }}
      >
        <View style={styles.modalRoot}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close wallet details"
            style={styles.scrim}
            onPress={() => {
              setAccountOpen(false);
              setSelectedAsset(undefined);
            }}
          />
          <SafeAreaView edges={["bottom"]} style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.sheetHeader}>
              <Text style={styles.sheetTitle}>
                {selectedAsset ? selectedAsset.symbol : "Your wallet"}
              </Text>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Close details"
                onPress={() => {
                  setAccountOpen(false);
                  setSelectedAsset(undefined);
                }}
                style={styles.headerButton}
              >
                <Text style={styles.closeGlyph}>×</Text>
              </Pressable>
            </View>
            <ScrollView contentContainerStyle={styles.sheetContent}>
              {selectedAsset ? (
                <>
                  <View style={styles.assetHero}>
                    <AssetMark asset={selectedAsset} />
                    <Text style={styles.sheetAssetName}>
                      {selectedAsset.name}
                    </Text>
                    <Text style={styles.sheetTotal}>
                      {usd(assetQuote(selectedAsset.id)?.valueUsd)}
                    </Text>
                    <Text selectable style={styles.sheetAssetBalance}>
                      {balanceOf(portfolio, selectedAsset.id) === undefined
                        ? "—"
                        : formatUnits(
                            BigInt(balanceOf(portfolio, selectedAsset.id)!),
                            18,
                          )}{" "}
                      {selectedAsset.symbol}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.muted}>Price</Text>
                    <Text style={styles.detailValue}>
                      {price(assetQuote(selectedAsset.id)?.priceUsd)}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.muted}>Network</Text>
                    <Text style={styles.detailValue}>BNB Smart Chain</Text>
                  </View>
                  {selectedAsset.address ? (
                    <>
                      <Text style={styles.contractLabel}>Contract address</Text>
                      <Text selectable style={styles.fullAddress}>
                        {selectedAsset.address}
                      </Text>
                    </>
                  ) : null}
                  <View style={styles.sheetActions}>
                    {PRIMARY_IDS.includes(selectedAsset.id) ? (
                      <Pressable
                        accessibilityRole="button"
                        onPress={() => navigate("/wallet/mainnet-swap")}
                        style={styles.sheetAction}
                      >
                        <Text style={styles.sheetActionText}>Swap</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => navigate("/wallet/mainnet-receive")}
                      style={styles.sheetActionSecondary}
                    >
                      <Text style={styles.brandText}>Receive</Text>
                    </Pressable>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.contractLabel}>
                    BNB Smart Chain · Mainnet
                  </Text>
                  <Text
                    selectable
                    accessibilityLabel="Mainnet wallet address"
                    style={styles.fullAddress}
                  >
                    {walletAddress}
                  </Text>
                  <View style={styles.sheetActions}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => void copyWalletAddress()}
                      style={styles.sheetAction}
                    >
                      <Text style={styles.sheetActionText}>
                        {addressCopied ? "Copied ✓" : "Copy address"}
                      </Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => navigate("/wallet/mainnet-receive")}
                      style={styles.sheetActionSecondary}
                    >
                      <Text style={styles.brandText}>Receive</Text>
                    </Pressable>
                  </View>
                </>
              )}
            </ScrollView>
          </SafeAreaView>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#FFFFFF" },
  content: { paddingHorizontal: 22, paddingTop: 12, paddingBottom: 28 },
  opening: { flex: 1, alignItems: "center", justifyContent: "center", gap: 14 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  walletSelector: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    gap: 10,
    minHeight: 54,
  },
  walletLogo: { width: 36, height: 36, borderRadius: 18 },
  walletNameGroup: { flexShrink: 1 },
  walletName: { color: "#142033", fontSize: 17, fontWeight: "600" },
  network: { color: "#89929F", fontSize: 11, marginTop: 4 },
  networkDot: { color: "#F0B90B", fontSize: 9 },
  chevron: { color: "#7B8799", fontSize: 21, marginLeft: 3 },
  headerButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  menuGlyph: { color: "#263346", fontSize: 25 },
  balanceSection: { marginTop: 30 },
  balanceLabel: { color: "#7B8799", fontSize: 13, marginBottom: 8 },
  total: {
    color: "#111827",
    fontSize: 44,
    fontWeight: "600",
    letterSpacing: -1.3,
  },
  balanceMeta: { alignItems: "flex-start", gap: 11, marginTop: 11 },
  muted: { color: "#89929F", fontSize: 12 },
  addressRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F7FA",
    borderRadius: 13,
    width: "100%",
    paddingLeft: 12,
    minHeight: 52,
  },
  addressText: {
    color: "#66758B",
    fontSize: 12,
    lineHeight: 19,
    fontWeight: "500",
    flex: 1,
    flexShrink: 1,
    minWidth: 0,
    paddingVertical: 9,
  },
  copyIconButton: {
    width: 44,
    minHeight: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  copyIcon: { color: "#3169EE", fontSize: 23 },
  actions: { flexDirection: "row", gap: 10, marginTop: 27, marginBottom: 30 },
  action: {
    flex: 1,
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F5F6F8",
    borderRadius: 18,
    gap: 5,
  },
  actionGlyph: { color: "#27364A", fontSize: 29, fontWeight: "400" },
  actionText: { color: "#27364A", fontSize: 12, fontWeight: "500" },
  disabled: { opacity: 0.38 },
  brand: { color: "#3169EE" },
  brandText: { color: "#3169EE", fontSize: 12, fontWeight: "600" },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  sectionTitle: { color: "#172236", fontSize: 22, fontWeight: "600" },
  viewAll: { minHeight: 44, paddingLeft: 10, justifyContent: "center" },
  tokens: { marginTop: 1 },
  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 89,
    gap: 12,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#F0F2F5",
  },
  pressed: { opacity: 0.6 },
  assetMark: { width: 44, height: 44, borderRadius: 22 },
  assetMarkCenter: { alignItems: "center", justifyContent: "center" },
  assetGlyph: { color: "#FFFFFF", fontSize: 27, fontWeight: "700" },
  tokenDescription: { flex: 1, minWidth: 0 },
  tokenName: { color: "#233047", fontSize: 16, fontWeight: "500" },
  tokenPrice: { color: "#7B8799", fontSize: 12, marginTop: 7 },
  tokenSymbol: { color: "#9BA4B2", fontSize: 11 },
  tokenValues: { maxWidth: "45%", alignItems: "flex-end" },
  tokenUsd: { color: "#202C40", fontSize: 17, fontWeight: "500" },
  tokenBalance: { color: "#89929F", fontSize: 12, marginTop: 7 },
  networkFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 24,
    flexWrap: "wrap",
  },
  smallDot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: "#F0B90B",
  },
  footerText: { color: "#A3ACBA", fontSize: 10 },
  footerDivider: { color: "#C1C8D2", fontSize: 12 },
  navigation: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
    backgroundColor: "#FFFFFF",
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "#E8ECF2",
    minHeight: 76,
    paddingBottom: 5,
    paddingTop: 7,
  },
  navItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 56,
    gap: 5,
  },
  navGlyph: { fontSize: 24, color: "#89929F", height: 28, lineHeight: 28 },
  navLabel: { color: "#89929F", fontSize: 10, fontWeight: "500" },
  swapBubble: {
    width: 47,
    height: 47,
    borderRadius: 24,
    backgroundColor: "#3169EE",
    alignItems: "center",
    justifyContent: "center",
    marginTop: -20,
  },
  swapBubbleGlyph: { color: "#FFFFFF", fontSize: 27 },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFF6E9",
    borderRadius: 14,
    paddingLeft: 14,
    paddingVertical: 4,
    marginBottom: 12,
  },
  noticeText: { flex: 1, color: "#96733B", fontSize: 12, lineHeight: 18 },
  retry: { minHeight: 44, justifyContent: "center", paddingHorizontal: 14 },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingBottom: 20,
  },
  modalRoot: { flex: 1, justifyContent: "flex-end" },
  scrim: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(16,27,45,0.38)",
  },
  sheet: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    maxHeight: "80%",
    paddingHorizontal: 22,
  },
  sheetHandle: {
    alignSelf: "center",
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#DAE0E9",
    marginTop: 12,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 8,
  },
  sheetTitle: { color: "#172236", fontSize: 20, fontWeight: "600" },
  closeGlyph: { color: "#7B8799", fontSize: 28 },
  sheetContent: { paddingTop: 14, paddingBottom: 20 },
  fullAddress: {
    color: "#26364E",
    fontSize: 14,
    lineHeight: 23,
    marginTop: 10,
  },
  contractLabel: { color: "#89929F", fontSize: 12, marginTop: 15 },
  sheetActions: { flexDirection: "row", gap: 12, marginTop: 24 },
  sheetAction: {
    flex: 1,
    backgroundColor: "#3169EE",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    minHeight: 52,
    paddingHorizontal: 14,
  },
  sheetActionText: { color: "#FFFFFF", fontSize: 14, fontWeight: "600" },
  sheetActionSecondary: {
    flex: 1,
    backgroundColor: "#F0F4FF",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 16,
    minHeight: 52,
  },
  assetHero: { alignItems: "center", gap: 10 },
  sheetAssetName: { color: "#26364E", fontSize: 16 },
  sheetTotal: { color: "#172236", fontSize: 30, fontWeight: "600" },
  sheetAssetBalance: { color: "#7B8799", fontSize: 12, textAlign: "center" },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 44,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#EDF0F5",
  },
  detailValue: { color: "#26364E", fontSize: 12 },
});
