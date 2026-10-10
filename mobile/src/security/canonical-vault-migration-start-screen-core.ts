import type { CanonicalVaultMigrationStartUiModel } from './canonical-vault-migration-start-ui-model';

export type CanonicalVaultMigrationStartScreenModel = CanonicalVaultMigrationStartUiModel & {
  inputLabel?: string;
  primaryButton?: {
    enabled: false;
    label: string;
  };
  secureEntry: boolean;
};

export function getCanonicalVaultMigrationStartScreenModel(
  model: CanonicalVaultMigrationStartUiModel,
): CanonicalVaultMigrationStartScreenModel {
  const primaryButton = model.primaryAction === 'none'
    ? undefined
    : {
        enabled: false as const,
        label: model.primaryAction === 'verify-pin'
          ? 'Verify PIN'
          : model.primaryAction === 'confirm-authorization'
            ? 'Confirm authorization'
            : 'Start optimization',
      };
  return {
    ...model,
    inputLabel: model.input === 'pin'
      ? 'Wallet PIN'
      : model.input === 'confirmation'
        ? 'Confirmation phrase'
        : undefined,
    primaryButton,
    secureEntry: model.input === 'pin',
  };
}

export function normalizeCanonicalVaultMigrationStartInput(
  input: CanonicalVaultMigrationStartUiModel['input'],
  value: string,
): string {
  if (input === 'pin') return value.replace(/\D/g, '').slice(0, 6);
  if (input === 'confirmation') return value.slice(0, 64);
  return '';
}
