import { describe, expect, it } from 'vitest';

import { getPortfolioErrorMessage } from './portfolio-error';

describe('getPortfolioErrorMessage', () => {
  it('describes connectivity failures without exposing technical details', () => {
    expect(getPortfolioErrorMessage(new Error('HTTP request timed out'))).toBe(
      'Unable to reach BSC Testnet. Check your internet connection and try again.',
    );
  });

  it('describes invalid contract responses', () => {
    expect(getPortfolioErrorMessage(new Error('Contract returned no data'))).toBe(
      'The ARXI contract did not return valid data. Verify the network and try again.',
    );
  });

  it('uses a safe fallback for unknown failures', () => {
    expect(getPortfolioErrorMessage(new Error('Unexpected failure'))).toBe(
      'Portfolio data could not be refreshed. Please try again in a moment.',
    );
  });
});
