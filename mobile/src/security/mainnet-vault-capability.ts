import { MAINNET_RELEASE_POSTURE } from './mainnet-release-security';

/**
 * Source-controlled capability for device-local Mainnet vault operations.
 * This deliberately permits create/import/unlock in private preview but is
 * not a signing or broadcast capability. Those remain denied by the separate
 * Mainnet release posture and production-release gate.
 */
export const MAINNET_DEVICE_LOCAL_VAULT_CAPABILITY = Object.freeze({
  enabled: true,
  releasePosture: MAINNET_RELEASE_POSTURE,
  signingEnabled: false,
  broadcastEnabled: false,
});
