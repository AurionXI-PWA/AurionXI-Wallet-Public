import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const screen = readFileSync(resolve(__dirname, '../app/wallet/mainnet-activity.tsx'), 'utf8');
const card = readFileSync(resolve(__dirname, '../components/mainnet-activity-card.tsx'), 'utf8');
const activityHook = readFileSync(resolve(__dirname, '../hooks/use-mainnet-activity.ts'), 'utf8');

describe('Transaction-owned Activity UI wiring (source guards, not device tests)', () => {
  it('renders a single merged paged list, not separate receipt cards above activity', () => {
    expect(screen).toContain('mergeMainnetActivityEntries');
    expect(screen).toContain('entries.slice(0, visibleCount)');
    expect(screen).toContain('Show more transactions');
    expect(screen).not.toContain('MainnetTransferRecoveryCard');
    expect(screen).not.toContain('transfers.records.map');
  });
  it('binds the visible hash and accessible explorer action to exactly the same entry', () => {
    expect(card).toContain('getMainnetTransactionExplorerUrl(entry.hash)');
    expect(card).toContain('View transaction ${entry.hash} on BscScan');
    expect(card).toContain('style={styles.hash}>{entry.hash}</Text>');
    expect(card.indexOf('rows.map')).toBeLessThan(card.indexOf('TRANSACTION HASH'));
    expect(card).not.toContain('/address/');
  });
  it('only exposes status-refresh and never a signing/broadcast retry action', () => {
    expect(card).toContain('presentation.refreshAllowed');
    expect(card).toContain('onPress={onRefresh}');
    expect(card).not.toContain('sendMainnet');
    expect(card).not.toContain('broadcastMainnet');
    expect(card).toContain('catch { setLinkError(true); }');
  });
  it('gates Activity polling to the foreground and binds public items to the current address', () => {
    expect(screen).toContain('Boolean(address) && !isLocked && focused && foreground');
    expect(activityHook).toContain('address.toLowerCase() === itemsAddress.toLowerCase()');
    expect(activityHook).toContain('items: belongsToAddress && enabled ? items : []');
  });
});
