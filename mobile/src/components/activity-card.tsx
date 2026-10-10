import { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getTransactionExplorerUrl } from '@/config/network';
import type { ActivityItem } from '@/services/activity';
import { shortenAddress } from '@/utils/address';

type Props = {
  item: ActivityItem;
};

export function ActivityCard({ item }: Props) {
  const openTransaction = useCallback(() => {
    void Linking.openURL(getTransactionExplorerUrl(item.hash));
  }, [item.hash]);
  const dateLabel = item.timestamp.toLocaleDateString([], {
    month: 'short',
    day: 'numeric',
  });
  const directionColor = item.failed
    ? '#ff9d90'
    : item.direction === 'Received'
      ? '#7cf6bd'
      : '#f3ba2f';

  return (
    <Pressable
      accessibilityLabel={`${item.failed ? 'Failed' : item.direction} ${item.amount} ${item.symbol}, ${dateLabel}`}
      accessibilityHint="Opens transaction details on BscScan"
      accessibilityRole="link"
      onPress={openTransaction}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <View style={styles.details}>
        <Text style={[styles.direction, { color: directionColor }]}>
          {item.failed ? 'Failed' : item.direction}
        </Text>
        <Text style={styles.counterparty}>{shortenAddress(item.counterparty)}</Text>
      </View>
      <View style={styles.amountGroup}>
        <Text style={styles.amount}>{item.amount}</Text>
        <Text style={styles.meta}>{item.symbol} · {dateLabel}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#294038',
    paddingVertical: 15,
  },
  details: { flex: 1 },
  direction: { fontSize: 14, fontWeight: '800' },
  counterparty: { color: '#71867d', fontSize: 12, marginTop: 5 },
  amountGroup: { alignItems: 'flex-end', marginLeft: 16 },
  amount: { color: '#eff8f3', fontSize: 14, fontWeight: '700' },
  meta: { color: '#71867d', fontSize: 11, marginTop: 5 },
  pressed: { opacity: 0.65 },
});
