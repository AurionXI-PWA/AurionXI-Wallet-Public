import { describe, expect, it } from 'vitest';

import { getMainnetPublicActivityExplorerUrl } from './mainnet-public-activity';

describe('Mainnet public activity boundary', () => {
  it('uses only the public Mainnet explorer route', () => {
    expect(getMainnetPublicActivityExplorerUrl('0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6')).toBe('https://bscscan.com/address/0xEf7c8E41ba2707c2E92b8837Ff4B5EB55cec27e6#tokentxns');
  });
});
