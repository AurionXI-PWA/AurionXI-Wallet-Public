import { StyleSheet, Text, View } from 'react-native';

type Tone = 'neutral' | 'verified' | 'warning';
const toneColors: Record<Tone, string> = {
  neutral: '#8da198',
  verified: '#7cf6bd',
  warning: '#f3ba2f',
};

type Props = { label: string; tone: Tone; value: string };

export function StatusCard({ label, tone, value }: Props) {
  return (
    <View accessibilityLabel={`${label}: ${value}`} accessible style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <View accessibilityElementsHidden style={styles.valueRow}>
        <View style={[styles.dot, { backgroundColor: toneColors[tone] }]} />
        <Text style={[styles.value, { color: toneColors[tone] }]}>{value}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#294038',
    paddingVertical: 14,
  },
  label: { color: '#91a69d', fontSize: 14 },
  valueRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  value: { fontSize: 13, fontWeight: '700' },
});
