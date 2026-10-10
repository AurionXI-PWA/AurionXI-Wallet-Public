import { StyleSheet, Text, View } from 'react-native';

type Props = { accent: string; amount: string; name: string; symbol: string };

export function AssetCard({ accent, amount, name, symbol }: Props) {
  return (
    <View accessibilityLabel={`${name}, ${amount} ${symbol}`} accessible style={styles.card}>
      <View accessibilityElementsHidden style={[styles.icon, { backgroundColor: accent }]}>
        <Text style={styles.iconText}>{symbol.slice(0, 1)}</Text>
      </View>
      <View style={styles.identity}>
        <Text style={styles.symbol}>{symbol}</Text>
        <Text style={styles.name}>{name}</Text>
      </View>
      <Text adjustsFontSizeToFit maxFontSizeMultiplier={1.4} numberOfLines={1} style={styles.amount}>
        {amount}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 18,
    minHeight: 76,
    padding: 16,
    marginBottom: 10,
    backgroundColor: '#09152e',
    borderWidth: 1,
    borderColor: '#19396f',
  },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconText: { color: '#061126', fontSize: 18, fontWeight: '900' },
  identity: { marginLeft: 12, flex: 1 },
  symbol: { color: '#f6fbf8', fontSize: 16, fontWeight: '800' },
  name: { color: '#91acd5', fontSize: 12, marginTop: 2 },
  amount: { color: '#f6fbf8', fontSize: 19, fontWeight: '700', maxWidth: '45%' },
});
