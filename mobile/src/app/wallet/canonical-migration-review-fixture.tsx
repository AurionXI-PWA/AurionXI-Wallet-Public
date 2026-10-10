import { Redirect } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { CanonicalVaultMigrationLoadedStartScreenHarness } from '@/components/canonical-vault-migration-loaded-start-screen-harness';
import {
  getCanonicalVaultMigrationWriteFreeFixtureDependencies,
  type CanonicalVaultMigrationWriteFreeFixtureMode,
} from '@/security/canonical-vault-migration-write-free-fixture-dependencies';
import { useSensitiveScreenProtection } from '@/security/use-sensitive-screen-protection';

export default function CanonicalMigrationReviewFixtureScreen() {
  useSensitiveScreenProtection();
  const [mode, setMode] = useState<CanonicalVaultMigrationWriteFreeFixtureMode>('unavailable');
  const dependencies = useMemo(
    () => getCanonicalVaultMigrationWriteFreeFixtureDependencies(mode),
    [mode],
  );
  if (!__DEV__) return <Redirect href="/wallet" />;
  return (
    <View style={styles.screen}>
      <View style={styles.controls}>
        <Text style={styles.label}>DEBUG WRITE-FREE FIXTURE</Text>
        <Text style={styles.body}>Tests loading, unavailable, retry, and lifecycle UI only.</Text>
        <View style={styles.actions}>
          <Pressable accessibilityRole="button" onPress={() => setMode('loading')} style={styles.button}>
            <Text style={styles.buttonText}>Show loading</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => setMode('unavailable')} style={styles.button}>
            <Text style={styles.buttonText}>Show unavailable</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.preview}>
        <CanonicalVaultMigrationLoadedStartScreenHarness key={mode} {...dependencies} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: 10, marginTop: 10 },
  body: { color: '#9eb2a9', fontSize: 13, marginTop: 4 },
  button: { borderColor: '#7cf6bd', borderRadius: 9, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8 },
  buttonText: { color: '#7cf6bd', fontSize: 12, fontWeight: '800' },
  controls: { backgroundColor: '#0b1e18', padding: 14 },
  label: { color: '#f3ba2f', fontSize: 11, fontWeight: '900' },
  preview: { flex: 1 },
  screen: { backgroundColor: '#071310', flex: 1 },
});
