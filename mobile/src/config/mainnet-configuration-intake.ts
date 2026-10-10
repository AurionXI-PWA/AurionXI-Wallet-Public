export type MainnetConfigurationInput = {
  rpcUrl?: string;
  arxiContract?: string;
  contractVerifiedByReleaseOwner: boolean;
};

export type MainnetConfigurationIntake =
  | { accepted: true; rpcUrl: string; arxiContract: `0x${string}` }
  | { accepted: false; reasons: readonly ('missing-rpc-url' | 'rpc-must-use-https' | 'missing-arxi-contract' | 'invalid-arxi-contract' | 'contract-not-release-verified')[] };

const ADDRESS_PATTERN = /^0x[a-fA-F0-9]{40}$/;

/**
 * Syntax and release-approval validation only. It intentionally does not make
 * a network call, create a client, or alter the active network.
 */
export function validateMainnetConfigurationIntake(
  input: MainnetConfigurationInput,
): MainnetConfigurationIntake {
  const reasons: ('missing-rpc-url' | 'rpc-must-use-https' | 'missing-arxi-contract' | 'invalid-arxi-contract' | 'contract-not-release-verified')[] = [];
  const rpcUrl = input.rpcUrl?.trim();
  const arxiContract = input.arxiContract?.trim();

  if (!rpcUrl) reasons.push('missing-rpc-url');
  else if (!isHttpsUrl(rpcUrl)) reasons.push('rpc-must-use-https');

  if (!arxiContract) reasons.push('missing-arxi-contract');
  else if (!ADDRESS_PATTERN.test(arxiContract)) reasons.push('invalid-arxi-contract');

  if (!input.contractVerifiedByReleaseOwner) reasons.push('contract-not-release-verified');

  if (reasons.length > 0) return { accepted: false, reasons };
  return { accepted: true, rpcUrl: rpcUrl!, arxiContract: arxiContract as `0x${string}` };
}

function isHttpsUrl(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}
