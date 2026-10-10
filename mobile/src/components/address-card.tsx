import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { Address } from 'viem';

import { shortenAddress } from '@/utils/address';

type Props = { address: Address; onRemove: () => void };

export function AddressCard({ address, onRemove }: Props) {
  return (
    <View style={styles.card}>
      <View accessibilityLabel={`Watching address ${address}`} accessible>
        <Text style={styles.label}>WATCHING</Text>
        <Text style={styles.address}>{shortenAddress(address)}</Text>
      </View>
      <Pressable
        accessibilityHint="Returns to the address entry screen"
        accessibilityLabel="Change watched address"
        accessibilityRole="button"
        hitSlop={8}
        onPress={onRemove}
        style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
        <Text style={styles.buttonText}>Change</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderRadius: 18,
    padding: 16,
    backgroundColor: '#0c1c17',
    borderWidth: 1,
    borderColor: '#1b352c',
  },
  label: { color: '#6f857b', fontSize: 10, fontWeight: '800', letterSpacing: 1.5 },
  address: { color: '#eff8f3', fontSize: 17, fontWeight: '700', marginTop: 5 },
  button: { paddingVertical: 8, paddingHorizontal: 12 },
  buttonPressed: { opacity: 0.65 },
  buttonText: { color: '#7cf6bd', fontWeight: '700', fontSize: 13 },
});
