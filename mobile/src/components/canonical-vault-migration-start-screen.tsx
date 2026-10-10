import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { dispatchCanonicalVaultMigrationEphemeralSubmit } from '@/security/canonical-vault-migration-ephemeral-submit-binding-core';
import { getCanonicalVaultMigrationInputEnablement } from '@/security/canonical-vault-migration-input-enablement-policy';
import type { CanonicalVaultMigrationLocalSubmitEvent } from '@/security/canonical-vault-migration-local-submit-policy';
import {
  normalizeCanonicalVaultMigrationStartInput,
} from '@/security/canonical-vault-migration-start-screen-core';
import type { CanonicalVaultMigrationStartViewState } from '@/security/canonical-vault-migration-start-view-controller';

type CanonicalVaultMigrationStartScreenProps = {
  onSubmit: (event: CanonicalVaultMigrationLocalSubmitEvent) => void;
  state: CanonicalVaultMigrationStartViewState;
};

function InteractiveSection({
  onSubmit,
  state,
}: CanonicalVaultMigrationStartScreenProps) {
  const { screen } = state;
  const [value, setValue] = useState('');
  const enablement = getCanonicalVaultMigrationInputEnablement(state, value);
  if (!screen.inputLabel && !screen.primaryButton) return null;
  return (
    <View>
      {screen.inputLabel ? (
        <View style={styles.fieldGroup}>
          <Text style={styles.fieldLabel}>{screen.inputLabel}</Text>
          <TextInput
            accessibilityLabel={screen.inputLabel}
            autoCapitalize={screen.input === 'confirmation' ? 'characters' : 'none'}
            autoComplete="off"
            editable={enablement.editable}
            keyboardType={screen.input === 'pin' ? 'number-pad' : 'default'}
            onChangeText={(next) => setValue(normalizeCanonicalVaultMigrationStartInput(screen.input, next))}
            placeholder={enablement.editable ? `Enter ${screen.inputLabel.toLowerCase()}` : 'Unavailable'}
            placeholderTextColor="#63766e"
            secureTextEntry={screen.secureEntry}
            style={styles.input}
            value={value}
          />
        </View>
      ) : null}
      {screen.primaryButton ? (
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ busy: state.busy, disabled: !enablement.locallyEligible }}
          disabled={!enablement.locallyEligible}
          onPress={() => {
            try {
              const result = dispatchCanonicalVaultMigrationEphemeralSubmit(state, value, onSubmit);
              if (result.dispatched) setValue(result.nextValue);
            } finally {
              setValue('');
            }
          }}
          style={({ pressed }) => [
            styles.disabledButton,
            enablement.locallyEligible && styles.locallyEligibleButton,
            pressed && styles.pressed,
          ]}>
          <Text style={[styles.disabledButtonText, enablement.locallyEligible && styles.locallyEligibleButtonText]}>
            {screen.primaryButton.label}
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}

export function CanonicalVaultMigrationStartScreen({ onSubmit, state }: CanonicalVaultMigrationStartScreenProps) {
  const { screen } = state;
  return (
    <View style={styles.screen}>
      <Text style={styles.eyebrow}>WALLET STORAGE SAFETY</Text>
      <Text accessibilityRole="header" style={styles.title}>{screen.title}</Text>
      <Text style={styles.body}>{screen.body}</Text>

      {screen.confirmationPhrase ? (
        <View style={styles.phraseCard}>
          <Text style={styles.phraseLabel}>TYPE EXACTLY</Text>
          <Text selectable style={styles.phrase}>{screen.confirmationPhrase}</Text>
        </View>
      ) : null}

      <InteractiveSection key={screen.input} onSubmit={onSubmit} state={state} />

      {state.error ? <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text> : null}

      <Text style={styles.foundationNote}>Local validation only. Authorization actions are not connected in this build.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: '#9eb2a9', fontSize: 15, lineHeight: 23, marginTop: 12 },
  disabledButton: { alignItems: 'center', backgroundColor: '#29453a', borderRadius: 14, marginTop: 22, opacity: 0.55, paddingVertical: 15 },
  disabledButtonText: { color: '#b5c9c0', fontSize: 14, fontWeight: '900' },
  eyebrow: { color: '#7cf6bd', fontSize: 11, fontWeight: '900', letterSpacing: 1.6 },
  error: { color: '#ffaaa0', fontSize: 13, lineHeight: 19, marginTop: 14 },
  fieldGroup: { marginTop: 22 },
  fieldLabel: { color: '#dff8eb', fontSize: 13, fontWeight: '800', marginBottom: 8 },
  foundationNote: { color: '#7f938a', fontSize: 12, lineHeight: 18, marginTop: 16, textAlign: 'center' },
  input: { backgroundColor: '#0b1e18', borderColor: '#2f5145', borderRadius: 14, borderWidth: 1, color: '#f6fbf8', fontSize: 16, paddingHorizontal: 16, paddingVertical: 14 },
  locallyEligibleButton: { backgroundColor: '#345f4e', opacity: 0.82 },
  locallyEligibleButtonText: { color: '#dff8eb' },
  phrase: { color: '#f3d98c', fontSize: 16, fontWeight: '900', letterSpacing: 0.8, marginTop: 8 },
  phraseCard: { backgroundColor: '#201b0d', borderColor: '#8a743f', borderRadius: 14, borderWidth: 1, marginTop: 22, padding: 16 },
  phraseLabel: { color: '#bda963', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  pressed: { opacity: 0.72 },
  screen: { backgroundColor: '#071310', flex: 1, justifyContent: 'center', padding: 24 },
  title: { color: '#f6fbf8', fontSize: 30, fontWeight: '800', marginTop: 12 },
});
