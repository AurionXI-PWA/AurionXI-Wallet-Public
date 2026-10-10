import { Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * UI-only network context. Switching remains deliberately unavailable until
 * the separately reviewed Mainnet readiness package is enabled.
 */
export function NetworkSelectorCard({ compact = false, onOpenMainnet }: { compact?: boolean; onOpenMainnet?: () => void }) {
  return (
    <View
      accessibilityLabel="Selected network: BNB Smart Chain Testnet. BNB Smart Chain Mainnet public balance view is available; sending is unavailable."
      style={[styles.card, compact && styles.compactCard]}>
      <Text style={styles.label}>NETWORK SELECTOR</Text>
      <View style={styles.optionSelected}>
        <View>
          <Text style={styles.optionTitle}>BNB Smart Chain Testnet</Text>
          <Text style={styles.optionDetail}>Currently selected · Chain ID 97</Text>
        </View>
        <Text style={styles.selectedBadge}>ACTIVE</Text>
      </View>
      <Pressable accessibilityHint="Opens a public Mainnet balance view without accessing wallet secrets" accessibilityRole="button" onPress={onOpenMainnet} style={({ pressed }) => [styles.optionReadOnly, pressed && styles.pressed]}>
        <View>
          <Text style={styles.optionTitleDisabled}>BNB Smart Chain</Text>
          <Text style={styles.optionDetail}>Mainnet · Public balances only</Text>
        </View>
        <Text style={styles.readOnlyBadge}>READ ONLY</Text>
      </Pressable>
      {!compact ? <Text style={styles.note}>Mainnet uses a separate, public-address view. Wallet creation, signing, and broadcasting remain unavailable.</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#0b1e18', borderColor: '#315046', borderRadius: 16, borderWidth: 1, marginTop: 18, padding: 14 },
  compactCard: { marginTop: 16 },
  label: { color: '#7cf6bd', fontSize: 11, fontWeight: '900', letterSpacing: 1.4 },
  optionSelected: { alignItems: 'center', backgroundColor: '#123326', borderColor: '#7cf6bd', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 10, padding: 12 },
  optionReadOnly: { alignItems: 'center', backgroundColor: '#111b2d', borderColor: '#6170b0', borderRadius: 12, borderWidth: 1, flexDirection: 'row', justifyContent: 'space-between', marginTop: 8, padding: 12 },
  optionTitle: { color: '#e5f5ed', fontSize: 14, fontWeight: '800' },
  optionTitleDisabled: { color: '#9eb2a9', fontSize: 14, fontWeight: '800' },
  optionDetail: { color: '#8ea49a', fontSize: 12, marginTop: 3 },
  selectedBadge: { color: '#062015', backgroundColor: '#7cf6bd', borderRadius: 20, fontSize: 10, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 5 },
  readOnlyBadge: { color: '#d9dcff', borderColor: '#8f9af4', borderRadius: 20, borderWidth: 1, fontSize: 10, fontWeight: '900', overflow: 'hidden', paddingHorizontal: 8, paddingVertical: 4 },
  note: { color: '#8ea49a', fontSize: 12, lineHeight: 18, marginTop: 10 },
  pressed: { opacity: 0.76 },
});
