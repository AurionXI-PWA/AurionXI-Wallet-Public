import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Address } from 'viem';

import { BiometricStatusCard } from '@/components/biometric-status-card';
import { AssetCard } from '@/components/asset-card';
import { ActivityCard } from '@/components/activity-card';
import { CanonicalVaultMigrationStatusCard } from '@/components/canonical-vault-migration-status-card';
import { ExplorerLink } from '@/components/explorer-link';
import { StatusCard } from '@/components/status-card';
import { VaultReplacementRecoveryCard } from '@/components/vault-replacement-recovery-card';
import { VaultIdentityIntegrityCard } from '@/components/vault-identity-integrity-card';
import { getPublicAsset } from '@/config/assets';
import {
  ARXI_TOKEN,
  getAddressExplorerUrl,
  PRIVATE_PREVIEW_BUILD,
  SIGNING_FEATURE,
  WALLET_SECRET_FEATURE,
} from '@/config/network';
import { usePortfolio } from '@/hooks/use-portfolio';
import { useActivity } from '@/hooks/use-activity';
import { auditStoredBiometricIntegrity } from '@/security/biometric-integrity';
import { decodeRecoveryVaultPayload } from '@/security/recovery-vault-payload';
import { getActiveVaultStatus } from '@/security/vault-active-identity-snapshot';
import { readLegacyVaultV3, readTestnetVaultV3, type VaultStatus } from '@/security/vault-store';
import { useSessionLock } from '@/security/session-lock-provider';
import { useWalletOnboarding } from '@/security/wallet-onboarding-provider';
import {
  BiometricWorkflowError,
  unlockStoredVaultWithBiometrics,
} from '@/security/vault-biometric-workflow';
import { zeroizeBytes } from '@/security/secret-memory';
import { readWalletIdentityRecord } from '@/security/wallet-identity-record-store';
import { shortenAddress } from '@/utils/address';

const PREVIEW_PAYLOAD = new TextEncoder().encode('aurionxi-pin-security-preview-v1');

function payloadMatches(actual: Uint8Array): boolean {
  return actual.length === PREVIEW_PAYLOAD.length && actual.every(
    (byte, index) => byte === PREVIEW_PAYLOAD[index],
  );
}

export default function SecureWalletStartScreen() {
  const router = useRouter();
  const { dispatch } = useWalletOnboarding();
  const { isLocked, lock, unlock } = useSessionLock();
  const [vaultStatus, setVaultStatus] = useState<VaultStatus | 'loading'>('loading');
  const [biometricConfigured, setBiometricConfigured] = useState(false);
  const [biometricBusy, setBiometricBusy] = useState(false);
  const [biometricError, setBiometricError] = useState<string | null>(null);
  const [publicAddress, setPublicAddress] = useState<Address | null>(null);
  const [namespaceMigrationNeeded, setNamespaceMigrationNeeded] = useState(false);
  const [dashboardMessage, setDashboardMessage] = useState<string | null>(null);
  const autoBiometricPrompted = useRef(false);
  const { portfolio, state: portfolioState, error: portfolioError, refresh: refreshPortfolio } = usePortfolio(publicAddress ?? undefined);
  const { coverage: activityCoverage, items: activity, state: activityState, refresh: refreshActivity, showingSavedHistory } = useActivity(publicAddress ?? undefined);
  const bnbAsset = getPublicAsset('native-bnb');
  const arxiAsset = getPublicAsset('arxi');
  const usdtAsset = getPublicAsset('usdt');

  useEffect(() => {
    let active = true;
    void getActiveVaultStatus()
      .then(async (status) => {
        if (active) setVaultStatus(status);
        if (status === 'present') {
          const audit = await auditStoredBiometricIntegrity();
          if (active) {
            setBiometricConfigured(audit.biometricUnlockAllowed);
            if (audit.state === 'missing-tracking') {
              setBiometricError('Biometric storage is inconsistent. Use PIN and re-enroll biometric access.');
            }
          }
        }
      })
      .catch(() => {
        if (active) setVaultStatus('unsupported');
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void Promise.all([readLegacyVaultV3(), readTestnetVaultV3()])
      .then(([legacy, namespaced]) => {
        if (active) setNamespaceMigrationNeeded(legacy !== null && namespaced === null);
      })
      .catch(() => {
        if (active) setNamespaceMigrationNeeded(false);
      });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    if (!WALLET_SECRET_FEATURE.enabled || vaultStatus !== 'present' || isLocked) {
      // Clear cached public identity immediately when secret access is unavailable.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPublicAddress(null);
      return;
    }
    let active = true;
    void readWalletIdentityRecord()
      .then((identity) => {
        if (active) setPublicAddress(identity?.publicAddress ?? null);
      })
      .catch(() => {
        if (active) setPublicAddress(null);
      });
    return () => {
      active = false;
    };
  }, [isLocked, vaultStatus]);

  const begin = (flow: 'create' | 'import') => {
    dispatch({ type: flow === 'create' ? 'BEGIN_CREATE' : 'BEGIN_IMPORT' });
    router.push('/wallet/responsibility');
  };

  async function unlockWithBiometrics() {
    let payload: Uint8Array | undefined;
    setBiometricBusy(true);
    setBiometricError(null);
    try {
      payload = await unlockStoredVaultWithBiometrics();
      if (WALLET_SECRET_FEATURE.enabled) {
        const decoded = decodeRecoveryVaultPayload(payload);
        zeroizeBytes(decoded.entropy);
      } else if (!payloadMatches(payload)) {
        throw new Error('Unexpected preview payload.');
      }
      unlock();
      router.replace('/wallet/testnet-dashboard' as never);
    } catch (caught) {
      setBiometricError(
        caught instanceof BiometricWorkflowError && caught.outcome === 'enrollment-changed'
          ? 'Device biometrics changed. Unlock with PIN, then re-enroll biometric access.'
          : caught instanceof BiometricWorkflowError && caught.outcome === 'session-invalidated'
            ? 'Biometric session ended when the app left the foreground. Try again or use your PIN.'
          : caught instanceof BiometricWorkflowError && caught.outcome === 'busy'
            ? 'A biometric prompt is already active. Complete it or use your PIN.'
            : caught instanceof BiometricWorkflowError && (
              caught.outcome === 'locked-out' || caught.outcome === 'cooldown'
            )
              ? 'Biometrics are temporarily locked. Use your PIN and try again later.'
          : caught instanceof BiometricWorkflowError
            ? 'Biometric unlock did not complete. Use your PIN instead.'
          : 'Biometric unlock failed closed. Use your PIN instead.',
      );
    } finally {
      zeroizeBytes(payload);
      setBiometricBusy(false);
    }
  }

  // A biometric prompt is offered once when an opted-in wallet starts locked.
  // Cancellation is deliberately non-destructive: the PIN route remains the
  // only fallback and the prompt will not loop while this screen is open.
  useEffect(() => {
    if (
      vaultStatus !== 'present'
      || !isLocked
      || !biometricConfigured
      || biometricBusy
      || autoBiometricPrompted.current
    ) return;
    autoBiometricPrompted.current = true;
    void unlockWithBiometrics();
    // The ref prevents repeated prompts; this effect intentionally reacts only
    // to lock-state and capability changes, not to each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [biometricBusy, biometricConfigured, isLocked, vaultStatus]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable
          accessibilityLabel="Return to Mainnet wallet"
          accessibilityRole="button"
          onPress={() => router.replace('/wallet/mainnet-readonly' as never)}
          style={({ pressed }) => [styles.testnetBack, pressed && styles.pressed]}>
          <Text style={styles.testnetBackText}>‹ Back to Mainnet</Text>
        </Pressable>
        {vaultStatus === 'present' && isLocked ? (
          <View style={styles.launchBrand}>
            <View style={styles.launchMark}><Image accessibilityLabel="AurionXI Wallet logo" source={require('../../assets/wallet-logo.webp')} style={styles.launchLogo} /></View>
            <Text style={styles.launchName}>AURIONXI</Text>
            <Text style={styles.launchTagline}>SECURE WALLET</Text>
          </View>
        ) : null}
        <Text style={styles.eyebrow}>SECURE LOCAL WALLET</Text>
        <Text style={styles.title}>
          {vaultStatus === 'present'
            ? isLocked
              ? WALLET_SECRET_FEATURE.enabled
                ? 'Unlock wallet'
                : 'Unlock security preview'
              : WALLET_SECRET_FEATURE.enabled
                ? 'Wallet unlocked'
                : 'Security preview unlocked'
            : WALLET_SECRET_FEATURE.enabled
              ? 'Create or import a wallet'
              : 'Choose a setup path'}
        </Text>
        <Text style={styles.body}>
          {vaultStatus === 'present'
            ? isLocked
              ? WALLET_SECRET_FEATURE.enabled
                ? 'An encrypted wallet is stored only on this device.'
                : 'An encrypted synthetic test vault is stored on this device.'
              : WALLET_SECRET_FEATURE.enabled
                ? 'Your wallet is available for this active session. Sending requires a fresh review, PIN confirmation, and separate broadcast confirmation.'
                : 'The encrypted synthetic test vault is available for this active session.'
            : WALLET_SECRET_FEATURE.enabled
              ? 'Recovery information is handled only on this device. Sending is protected by fresh review, PIN confirmation, and separate broadcast confirmation.'
              : 'This security preview never generates, imports, or stores wallet secrets.'}
        </Text>
        {vaultStatus === 'loading' ? (
          <ActivityIndicator accessibilityLabel="Checking secure storage" color="#7cf6bd" size="large" />
        ) : vaultStatus === 'present' ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                if (isLocked) router.push('/wallet/pin');
                else lock();
              }}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>{isLocked ? 'Use PIN instead' : 'Lock now'}</Text>
            </Pressable>
            {isLocked && !WALLET_SECRET_FEATURE.enabled ? (
              <Pressable
                accessibilityHint="Opens the protected legacy synthetic-vault replacement review"
                accessibilityRole="button"
                onPress={() => router.push('/wallet/synthetic-vault-replacement' as never)}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Replace synthetic test vault</Text>
              </Pressable>
            ) : null}
            {isLocked && biometricConfigured ? (
              <Pressable
                accessibilityRole="button"
                disabled={biometricBusy}
                onPress={() => void unlockWithBiometrics()}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                {biometricBusy ? (
                  <ActivityIndicator color="#7cf6bd" />
                ) : (
                  <Text style={styles.secondaryText}>Use biometric again</Text>
                )}
              </Pressable>
            ) : null}
            {biometricError ? (
              <Text accessibilityRole="alert" style={styles.error}>{biometricError}</Text>
            ) : null}
            {__DEV__ && !isLocked ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push('/wallet/identity-transition-fixture')}
                style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                <Text style={styles.secondaryText}>Stage identity transition test</Text>
              </Pressable>
            ) : null}
          </>
        ) : vaultStatus === 'empty' ? (
          <>
            <Pressable
              accessibilityRole="button"
              onPress={() => begin('create')}
              style={({ pressed }) => [styles.primary, pressed && styles.pressed]}>
              <Text style={styles.primaryText}>Create a wallet</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => begin('import')}
              style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
              <Text style={styles.secondaryText}>Import a wallet</Text>
            </Pressable>
            {PRIVATE_PREVIEW_BUILD ? (
              <View style={styles.tokenReferenceCard}>
                <Text style={styles.tokenReferenceLabel}>ARXI CONTRACT</Text>
                <Text selectable style={styles.tokenReferenceAddress}>{ARXI_TOKEN.address}</Text>
                <Text style={styles.tokenReferenceBody}>
                  Public network reference. View the verified contract on BscScan; reviewed transfers are supported after secure confirmation, while buying, selling, and swapping remain disabled.
                </Text>
                <View style={styles.tokenReferenceAction}>
                  <ExplorerLink
                    label="View ARXI on BscScan"
                    url={getAddressExplorerUrl(ARXI_TOKEN.address)}
                  />
                </View>
              </View>
            ) : null}
          </>
        ) : vaultStatus === 'corrupt' ? (
          <Pressable
            accessibilityHint="Opens the protected recovery flow without changing existing encrypted data"
            accessibilityRole="button"
            onPress={() => begin('import')}
            style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
            <Text style={styles.secondaryText}>Recover with phrase</Text>
          </Pressable>
        ) : null}
        {vaultStatus === 'present' && !isLocked && WALLET_SECRET_FEATURE.enabled && publicAddress ? (
          <>
            <View style={styles.dashboardHeader}>
              <View>
                <Text style={styles.dashboardName}>AurionXI Wallet</Text>
                <Text selectable style={styles.dashboardAddress}>{shortenAddress(publicAddress)}</Text>
              </View>
              <View style={styles.versionBadge}><Text style={styles.versionBadgeText}>V1.0</Text></View>
            </View>
            <View style={styles.totalCard}>
              <Text style={styles.totalLabel}>TOTAL BALANCE</Text>
              <Text style={styles.totalValue}>{portfolio ? 'On-chain assets' : 'Loading assets…'}</Text>
              <Text style={styles.totalCaption}>{portfolio ? 'BNB · ARXI · USDT' : 'Public balance read in progress'}</Text>
              <Text style={styles.totalDisclosure}>Live USD valuation coming soon</Text>
            </View>
            <View style={styles.actionRow}>
              <Pressable accessibilityLabel="Send assets" accessibilityRole="button" onPress={() => router.push(portfolio ? `/wallet/transaction-review?bnbBalanceWei=${portfolio.bnbBalanceWei}&gasPriceWei=${portfolio.gasPriceWei}&walletAddress=${publicAddress}` as never : '/wallet/transaction-review' as never)} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
                <Text style={styles.actionIcon}>↑</Text><Text style={styles.actionText}>Send</Text>
              </Pressable>
              <Pressable accessibilityLabel="Receive assets" accessibilityRole="button" onPress={() => router.push('/wallet/receive' as never)} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
                <Text style={styles.actionIcon}>↓</Text><Text style={styles.actionText}>Receive</Text>
              </Pressable>
              <Pressable accessibilityHint="Swap is planned for a later reviewed release" accessibilityLabel="Swap, coming soon" accessibilityRole="button" onPress={() => setDashboardMessage('Swap is coming soon. No swap or approval is enabled in this release.')} style={({ pressed }) => [styles.actionButton, styles.actionDisabled, pressed && styles.pressed]}>
                <Text style={styles.actionIcon}>↔</Text><Text style={styles.actionText}>Swap</Text>
              </Pressable>
              <Pressable accessibilityLabel="Show activity" accessibilityRole="button" onPress={() => setDashboardMessage('Recent activity is shown below. Full public history remains available on BscScan.')} style={({ pressed }) => [styles.actionButton, pressed && styles.pressed]}>
                <Text style={styles.actionIcon}>◷</Text><Text style={styles.actionText}>History</Text>
              </Pressable>
            </View>
            {dashboardMessage ? <Text accessibilityLiveRegion="polite" style={styles.dashboardMessage}>{dashboardMessage}</Text> : null}
            <View style={styles.assetSectionHeader}>
              <Text style={styles.assetSectionTitle}>My Assets</Text>
              <Pressable accessibilityHint="Custom asset discovery is planned for a later reviewed release" accessibilityLabel="Add asset, coming soon" accessibilityRole="button" onPress={() => setDashboardMessage('Add Asset is coming soon. This release shows only the reviewed asset list.')}><Text style={styles.addAssetText}>＋ Add Asset</Text></Pressable>
            </View>
          </>
        ) : null}
        {vaultStatus === 'present' && !isLocked && WALLET_SECRET_FEATURE.enabled && publicAddress ? (
          <View style={styles.identityCard}>
            <Text style={styles.identityLabel}>WALLET IDENTITY</Text>
            <Text selectable style={styles.identityAddress}>{shortenAddress(publicAddress)}</Text>
            <Text style={styles.identityBody}>Public wallet address · local signing requires secure confirmation</Text>
            <View style={styles.identityActions}>
              <ExplorerLink label="View on BscScan" url={getAddressExplorerUrl(publicAddress)} />
            </View>
          </View>
        ) : null}
        {vaultStatus === 'present' && !isLocked && WALLET_SECRET_FEATURE.enabled && publicAddress ? (
          <View style={styles.balanceCard}>
            <View style={styles.balanceHeader}>
              <Text style={styles.identityLabel}>ASSETS</Text>
              {portfolioState === 'loading' || portfolioState === 'refreshing' ? (
                <ActivityIndicator accessibilityLabel="Reading public wallet balances" color="#7cf6bd" size="small" />
              ) : null}
            </View>
              <Text style={styles.balanceBody}>Public blockchain data only · {SIGNING_FEATURE.enabled ? 'Secure send enabled' : 'signing disabled'}</Text>
            {portfolioState === 'loading' ? (
              <Text accessibilityLiveRegion="polite" style={styles.balanceStatus}>Reading public wallet balances…</Text>
            ) : null}
            {portfolioError ? (
              <>
                <Text accessibilityRole="alert" style={styles.error}>{portfolioError}</Text>
                <Pressable accessibilityHint="Attempts a public balance read again without changing wallet data" accessibilityLabel="Retry balance refresh" accessibilityRole="button" onPress={refreshPortfolio} style={({ pressed }) => [styles.secondary, pressed && styles.pressed]}>
                  <Text style={styles.secondaryText}>Try balance refresh again</Text>
                </Pressable>
              </>
            ) : null}
              {portfolio && bnbAsset && arxiAsset && usdtAsset ? (
                <>
                  <View style={styles.assetList}>
                    <AssetCard accent={bnbAsset.accent} amount={portfolio.bnbBalance} name={bnbAsset.name} symbol={bnbAsset.symbol} />
                    <AssetCard accent={arxiAsset.accent} amount={portfolio.arxiBalance} name={arxiAsset.name} symbol={arxiAsset.symbol} />
                    <AssetCard accent={usdtAsset.accent} amount={portfolio.usdtBalance} name={usdtAsset.name} symbol={usdtAsset.symbol} />
                  </View>
                  <Text accessibilityLiveRegion="polite" style={styles.balanceStatus}>{portfolio.updatedLabel} · Block #{portfolio.blockNumber}</Text>
                  <View style={styles.integrityStatus}>
                    <StatusCard label="ARXI transfers" tone={portfolio.isPaused ? 'warning' : 'verified'} value={portfolio.isPaused ? 'Paused' : 'Active'} />
                    <StatusCard label="Data freshness" tone={portfolio.isBlockStale ? 'warning' : 'verified'} value={portfolio.blockFreshness} />
                    <StatusCard label="Network" tone="neutral" value="BNB Smart Chain · 97" />
                  </View>
                  <Pressable accessibilityHint="Refreshes public balance data only" accessibilityLabel="Refresh balances" accessibilityRole="button" onPress={refreshPortfolio} style={({ pressed }) => [styles.balanceRefresh, pressed && styles.pressed]}>
                  <Text style={styles.balanceRefreshText}>Refresh balances</Text>
                </Pressable>
              </>
            ) : null}
          </View>
        ) : null}
        {vaultStatus === 'present' && !isLocked && WALLET_SECRET_FEATURE.enabled && publicAddress ? (
          <View style={styles.activityCard}>
            <View style={styles.balanceHeader}>
              <Text style={styles.identityLabel}>ACTIVITY</Text>
              {activityState === 'loading' ? <ActivityIndicator accessibilityLabel="Reading public wallet activity" color="#7cf6bd" size="small" /> : null}
            </View>
            <Text style={styles.balanceBody}>Public blockchain data only · {SIGNING_FEATURE.enabled ? 'Secure send enabled' : 'signing disabled'}</Text>
            {activityState === 'ready' && activityCoverage === 'recent-curated-token-transfers' ? (
              <Text accessibilityLiveRegion="polite" style={styles.balanceStatus}>Latest {Math.min(activity.length, 5)} ARXI and USDT transfers · Full history on BscScan</Text>
            ) : null}
            {activityState === 'ready' && showingSavedHistory ? (
              <Text accessibilityLiveRegion="polite" style={styles.balanceStatus}>Showing last verified public history · Refresh will retry</Text>
            ) : null}
            {activityState === 'unconfigured' || activityState === 'error' ? (
              <>
                <Text style={styles.activityTitle}>{activityState === 'unconfigured' ? 'History provider not connected' : 'History is temporarily unavailable'}</Text>
                <Text style={styles.activityBody}>Balances remain independently available from the selected network.</Text>
                <Pressable accessibilityHint="Refreshes public activity only" accessibilityLabel="Retry activity refresh" accessibilityRole="button" onPress={refreshActivity} style={({ pressed }) => [styles.activityRefresh, pressed && styles.pressed]}>
                  <Text style={styles.balanceRefreshText}>Try activity refresh again</Text>
                </Pressable>
              </>
            ) : activityState === 'ready' && activity.length === 0 ? (
              <>
                <Text style={styles.activityTitle}>No recent activity</Text>
                <Text style={styles.activityBody}>No recent supported transfer was returned in the available activity window.</Text>
              </>
            ) : (
              activity.slice(0, 5).map((item) => <ActivityCard item={item} key={item.id} />)
            )}
            {activityState === 'ready' ? (
              <Pressable accessibilityHint="Refreshes public activity only" accessibilityLabel="Refresh activity" accessibilityRole="button" onPress={refreshActivity} style={({ pressed }) => [styles.activityRefresh, pressed && styles.pressed]}>
                <Text style={styles.balanceRefreshText}>Refresh activity</Text>
              </Pressable>
            ) : null}
          </View>
        ) : null}
        {vaultStatus === 'present' && WALLET_SECRET_FEATURE.enabled ? (
          namespaceMigrationNeeded ? (
            <Pressable
              accessibilityHint="Opens PIN-authenticated Testnet storage migration; legacy data is retained"
              accessibilityRole="button"
              onPress={() => router.push('/wallet/testnet-namespace-migration' as never)}
              style={({ pressed }) => [styles.namespaceMigrationCard, pressed && styles.pressed]}>
              <Text style={styles.sendReviewLabel}>SECURE STORAGE UPDATE</Text>
              <Text style={styles.sendReviewTitle}>Move Testnet wallet to its own namespace</Text>
              <Text style={styles.sendReviewBody}>PIN confirmation and biometric re-enrollment required. Legacy data is retained.</Text>
            </Pressable>
          ) : null
        ) : null}
        {vaultStatus === 'present' && WALLET_SECRET_FEATURE.enabled ? (
          <Pressable
            accessibilityHint={isLocked
              ? 'Unlocks the wallet with your PIN before opening the send review'
              : 'Opens a transfer review before secure signing'}
            accessibilityLabel={isLocked ? 'Unlock to send assets' : 'Prepare a transfer'}
            accessibilityRole="button"
            onPress={() => router.push(isLocked
              ? '/wallet/pin'
              : (portfolio
                ? `/wallet/transaction-review?bnbBalanceWei=${portfolio.bnbBalanceWei}&gasPriceWei=${portfolio.gasPriceWei}&walletAddress=${publicAddress}`
                : '/wallet/transaction-review') as never)}
            style={({ pressed }) => [styles.sendReviewButton, isLocked && styles.sendReviewLocked, pressed && styles.pressed]}>
            <View style={styles.sendReviewHeader}>
              <Text style={styles.sendReviewLabel}>{isLocked ? 'SEND · LOCKED' : 'SEND ASSETS'}</Text>
              <Text accessibilityElementsHidden style={styles.sendReviewArrow}>→</Text>
            </View>
            <Text style={styles.sendReviewTitle}>{isLocked ? 'Unlock to send assets' : 'Send assets'}</Text>
            <Text style={styles.sendReviewBody}>tBNB · ARXI · USDT</Text>
            <Text style={styles.sendReviewStatus}>{isLocked
              ? 'Unlock with PIN to begin a secure signing review'
              : SIGNING_FEATURE.enabled ? 'Details → Review → Confirm → Broadcast' : 'Signing is unavailable in this build'}</Text>
          </Pressable>
        ) : null}
        {vaultStatus === 'present' && !isLocked ? <BiometricStatusCard /> : null}
        {vaultStatus === 'present' && WALLET_SECRET_FEATURE.enabled ? (
          <View accessibilityLabel="AurionXI Assistant coming later" style={styles.assistantCard}>
            <Text style={styles.assistantLabel}>AURIONXI ASSISTANT · COMING LATER</Text>
            <Text style={styles.assistantTitle}>Clearer wallet insights, without adding clutter.</Text>
            <Text style={styles.assistantBody}>Future releases may add opt-in portfolio and transaction guidance. It will remain separate from wallet security and signing.</Text>
          </View>
        ) : null}
        {!WALLET_SECRET_FEATURE.enabled ? (
          <>
            <VaultIdentityIntegrityCard />
            <VaultReplacementRecoveryCard />
            <CanonicalVaultMigrationStatusCard />
          </>
        ) : null}
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>
            {vaultStatus === 'corrupt'
              ? 'Encrypted vault validation failed'
              : vaultStatus === 'unsupported'
                ? 'Secure device storage is required'
                : WALLET_SECRET_FEATURE.enabled
                  ? 'Wallet protection active'
                  : 'Security preview active'}
          </Text>
          <Text style={styles.noticeBody}>
            {vaultStatus === 'corrupt'
              ? 'The app failed closed. Existing encrypted data was not changed.'
              : vaultStatus === 'unsupported'
                ? 'PIN setup is unavailable on this device. No fallback storage will be used.'
                : WALLET_SECRET_FEATURE.enabled
                  ? 'Native Argon2id, encrypted PIN protection, and persistent retry cooldown protect device-local recovery data. Secure signing requires a fresh PIN and separate broadcast confirmation; Mainnet access remains disabled.'
                  : 'Native Argon2id, encrypted PIN protection, and persistent retry cooldown are enabled for synthetic test data. Wallet-secret handling remains disabled.'}
          </Text>
        </View>
      </ScrollView>
      {vaultStatus === 'present' && !isLocked && WALLET_SECRET_FEATURE.enabled ? (
        <View style={styles.bottomNavigation}>
          <Pressable accessibilityLabel="Wallet dashboard" accessibilityRole="button" style={styles.navItem}><Text style={styles.navIconActive}>▣</Text><Text style={styles.navTextActive}>Wallet</Text></Pressable>
          <Pressable accessibilityLabel="Assets section" accessibilityRole="button" onPress={() => setDashboardMessage('Your reviewed assets are shown above.')} style={styles.navItem}><Text style={styles.navIcon}>◇</Text><Text style={styles.navText}>Assets</Text></Pressable>
          <Pressable accessibilityLabel="Activity section" accessibilityRole="button" onPress={() => setDashboardMessage('Recent activity is shown below.')} style={styles.navItem}><Text style={styles.navIcon}>◷</Text><Text style={styles.navText}>Activity</Text></Pressable>
          <Pressable accessibilityLabel="Wallet settings and network selection" accessibilityRole="button" onPress={() => router.push('/wallet/settings' as never)} style={styles.navItem}><Text style={styles.navIcon}>⚙</Text><Text style={styles.navText}>Settings</Text></Pressable>
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#050b1d' },
  testnetBack: { alignSelf: 'flex-start', borderColor: '#4f90f4', borderRadius: 10, borderWidth: 1, marginBottom: 18, paddingHorizontal: 12, paddingVertical: 8 },
  testnetBackText: { color: '#b7d9ff', fontSize: 13, fontWeight: '800' },
  content: { flexGrow: 1, padding: 24, paddingBottom: 104, justifyContent: 'center' },
  dashboardHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16, marginTop: 4 },
  dashboardName: { color: '#f6fbff', fontSize: 20, fontWeight: '900' },
  dashboardAddress: { color: '#87a4d7', fontSize: 12, fontWeight: '700', marginTop: 4 },
  versionBadge: { backgroundColor: '#132a58', borderColor: '#4f90f4', borderRadius: 10, borderWidth: 1, paddingHorizontal: 9, paddingVertical: 5 },
  versionBadgeText: { color: '#abd0ff', fontSize: 11, fontWeight: '900' },
  totalCard: { backgroundColor: '#123a9e', borderColor: '#4292ff', borderRadius: 18, borderWidth: 1, padding: 20, shadowColor: '#176fff', shadowOpacity: 0.38, shadowRadius: 20 },
  totalLabel: { color: '#a8ceff', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  totalValue: { color: '#f7fbff', fontSize: 28, fontWeight: '900', marginTop: 10 },
  totalCaption: { color: '#d9eaff', fontSize: 13, fontWeight: '700', marginTop: 6 },
  totalDisclosure: { color: '#9fc5ff', fontSize: 11, marginTop: 16 },
  actionRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 18 },
  actionButton: { alignItems: 'center', minHeight: 64, width: '23%' },
  actionDisabled: { opacity: 0.62 },
  actionIcon: { backgroundColor: '#0b2556', borderColor: '#194d9c', borderRadius: 22, borderWidth: 1, color: '#72b6ff', fontSize: 22, height: 44, overflow: 'hidden', paddingTop: 8, textAlign: 'center', width: 44 },
  actionText: { color: '#c8daff', fontSize: 11, fontWeight: '800', marginTop: 7 },
  dashboardMessage: { color: '#a9caff', fontSize: 12, lineHeight: 18, marginTop: 12 },
  assetSectionHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 24 },
  assetSectionTitle: { color: '#f6fbff', fontSize: 19, fontWeight: '900' },
  addAssetText: { color: '#67b4ff', fontSize: 13, fontWeight: '800' },
  bottomNavigation: { alignItems: 'center', backgroundColor: '#060d20', borderColor: '#152c58', borderTopWidth: 1, flexDirection: 'row', justifyContent: 'space-around', minHeight: 72, paddingBottom: 8, paddingTop: 8 },
  navItem: { alignItems: 'center', justifyContent: 'center', minHeight: 52, minWidth: 58 },
  navIcon: { color: '#7589ae', fontSize: 20, lineHeight: 22 },
  navIconActive: { color: '#5ca8ff', fontSize: 20, lineHeight: 22 },
  navText: { color: '#7589ae', fontSize: 10, fontWeight: '800', marginTop: 3 },
  navTextActive: { color: '#5ca8ff', fontSize: 10, fontWeight: '900', marginTop: 3 },
  launchBrand: { alignItems: 'center', marginBottom: 30 },
  launchMark: { alignItems: 'center', backgroundColor: '#123d9d', borderColor: '#59a5ff', borderRadius: 22, borderWidth: 1, height: 52, justifyContent: 'center', shadowColor: '#276fff', shadowOpacity: 0.5, shadowRadius: 18, width: 52 },
  launchLogo: { borderRadius: 18, height: 38, width: 38 },
  launchName: { color: '#f6fbf8', fontSize: 26, fontWeight: '900', letterSpacing: 3, marginTop: 14 },
  launchTagline: { color: '#a891f6', fontSize: 10, fontWeight: '900', letterSpacing: 2.2, marginTop: 5 },
  eyebrow: { color: '#62b2ff', fontSize: 12, fontWeight: '800', letterSpacing: 2 },
  title: { color: '#f6fbf8', fontSize: 32, fontWeight: '800', marginTop: 12 },
  body: { color: '#b5c8e8', fontSize: 15, lineHeight: 23, marginTop: 12, marginBottom: 20 },
  primary: {
    backgroundColor: '#287cf5',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 10,
  },
  primaryText: { color: '#f7fbff', fontSize: 15, fontWeight: '800' },
  secondary: {
    borderColor: '#5ca8ff',
    borderWidth: 1,
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 15,
    marginTop: 12,
  },
  secondaryText: { color: '#9dccff', fontSize: 15, fontWeight: '800' },
  tokenReferenceCard: {
    backgroundColor: '#0b1e18',
    borderColor: '#2f5145',
    borderRadius: 16,
    borderWidth: 1,
    marginTop: 18,
    padding: 16,
  },
  tokenReferenceLabel: { color: '#7cf6bd', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  tokenReferenceAddress: { color: '#e5fff0', fontSize: 13, fontWeight: '700', lineHeight: 20, marginTop: 8 },
  tokenReferenceBody: { color: '#9eb2a9', fontSize: 13, lineHeight: 20, marginTop: 9 },
  tokenReferenceAction: { flexDirection: 'row', marginTop: 12 },
  pressed: { opacity: 0.78 },
  error: { color: '#ffaaa0', fontSize: 13, lineHeight: 19, marginTop: 12 },
  identityCard: {
    backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 16,
  },
  identityLabel: { color: '#7cf6bd', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  identityAddress: { color: '#f6fbf8', fontSize: 19, fontWeight: '800', marginTop: 8 },
  identityBody: { color: '#9eb2a9', fontSize: 13, lineHeight: 20, marginTop: 7 },
  identityActions: { flexDirection: 'row', marginTop: 12 },
  balanceCard: {
    backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 16,
  },
  activityCard: {
    backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 16,
  },
  balanceHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  balanceBody: { color: '#9eb2a9', fontSize: 13, lineHeight: 20, marginTop: 7 },
  balanceStatus: { color: '#8ea49a', fontSize: 12, lineHeight: 18, marginTop: 12 },
  assetList: { marginTop: 14 },
  integrityStatus: { marginTop: 12 },
  balanceRefresh: { alignSelf: 'flex-start', justifyContent: 'center', marginTop: 4, minHeight: 44, paddingVertical: 8 },
  balanceRefreshText: { color: '#7cf6bd', fontSize: 13, fontWeight: '800' },
  activityTitle: { color: '#dff8eb', fontSize: 14, fontWeight: '800', marginTop: 14 },
  activityBody: { color: '#8ea49a', fontSize: 13, lineHeight: 20, marginTop: 6 },
  activityRefresh: { alignSelf: 'flex-start', justifyContent: 'center', marginTop: 10, minHeight: 44, paddingVertical: 8 },
  assistantCard: { backgroundColor: '#16112b', borderColor: '#6847b0', borderRadius: 16, borderWidth: 1, marginTop: 12, padding: 16 },
  assistantLabel: { color: '#c5afff', fontSize: 10, fontWeight: '900', letterSpacing: 1.15 },
  assistantTitle: { color: '#f4efff', fontSize: 16, fontWeight: '900', lineHeight: 22, marginTop: 7 },
  assistantBody: { color: '#c4b9db', fontSize: 13, lineHeight: 20, marginTop: 7 },
  sendReviewButton: { backgroundColor: '#123326', borderColor: '#7cf6bd', borderRadius: 18, borderWidth: 1, marginTop: 18, padding: 18 },
  namespaceMigrationCard: { backgroundColor: '#151b31', borderColor: '#a891f6', borderRadius: 18, borderWidth: 1, marginTop: 18, padding: 18 },
  sendReviewLocked: { backgroundColor: '#10251b', borderColor: '#4aa37d' },
  sendReviewHeader: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between' },
  sendReviewLabel: { color: '#7cf6bd', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  sendReviewArrow: { color: '#7cf6bd', fontSize: 25, fontWeight: '500', lineHeight: 25 },
  sendReviewTitle: { color: '#f6fbf8', fontSize: 19, fontWeight: '900', marginTop: 7 },
  sendReviewBody: { color: '#9eb2a9', fontSize: 13, lineHeight: 20, marginTop: 6 },
  sendReviewStatus: { color: '#aeeccd', fontSize: 12, fontWeight: '700', marginTop: 9 },
  notice: {
    backgroundColor: '#0b1e18',
    borderColor: '#1d3b30',
    borderWidth: 1,
    borderRadius: 16,
    padding: 16,
    marginTop: 24,
  },
  noticeTitle: { color: '#dff8eb', fontSize: 14, fontWeight: '700' },
  noticeBody: { color: '#8ea49a', fontSize: 13, lineHeight: 20, marginTop: 6 },
});
