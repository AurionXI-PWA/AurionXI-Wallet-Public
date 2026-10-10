const CONNECTION_ERROR_PATTERN =
  /network|fetch|timeout|timed out|connection|disconnected|internet|socket|http request/i;

const CONTRACT_ERROR_PATTERN =
  /contract|execution reverted|abi|decode|returned no data|function selector/i;

export function getPortfolioErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (CONNECTION_ERROR_PATTERN.test(message)) {
    return 'Unable to reach BSC Testnet. Check your internet connection and try again.';
  }

  if (CONTRACT_ERROR_PATTERN.test(message)) {
    return 'The ARXI contract did not return valid data. Verify the network and try again.';
  }

  return 'Portfolio data could not be refreshed. Please try again in a moment.';
}
