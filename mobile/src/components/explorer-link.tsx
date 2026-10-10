import { useCallback } from 'react';
import { Linking, Pressable, StyleSheet, Text } from 'react-native';

type Props = {
  label: string;
  url: string;
};

export function ExplorerLink({ label, url }: Props) {
  const openExplorer = useCallback(() => {
    void Linking.openURL(url);
  }, [url]);

  return (
    <Pressable
      accessibilityHint="Opens BscScan in your browser"
      accessibilityLabel={`${label} on BscScan`}
      accessibilityRole="link"
      onPress={openExplorer}
      style={({ pressed }) => [styles.link, pressed && styles.pressed]}>
      <Text style={styles.text}>{label} ↗</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  link: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#315548',
    paddingHorizontal: 14,
    flex: 1,
  },
  pressed: { opacity: 0.65 },
  text: { color: '#7cf6bd', fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
