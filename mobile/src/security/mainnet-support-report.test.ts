import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), native: vi.fn() }));
vi.mock('@react-native-async-storage/async-storage', () => ({ default: { getItem: mocks.get, setItem: mocks.set } }));
vi.mock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: { AurionXIMainnetSecurity: { getNativeMainnetSupportReport: mocks.native } } }));
import { cleanSupportFields, createMainnetSupportReport, parseNativeSupportReport } from './mainnet-support-report';
const sender = '0x1111111111111111111111111111111111111111';
const hash = `0x${'a'.repeat(64)}`;
const id = '11111111-1111-1111-1111-111111111111';
const event = () => ({ sender, operationId: id, at: Date.now(), nonce: '6', stage: 'receipt', outcome: 'unknown', reason: 'receipt_and_transaction_not_found', hash });
const report = () => ({ schemaVersion: 1, chainId: 56, sender, generatedAt: Date.now(), reportId: id, packageName: 'com.aurionxi.wallet.direct',
  versionName: '1.0.0-direct', buildFingerprint: 'a'.repeat(64), automaticTime: true, storageStatus: 'available', historyReset: false,
  nativeJournalStatus: 'available', events: [event()], nativeRecords: [{ nonce: '6', hash, journalState: 'SUBMITTED' }] });
describe('durable public support report', () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.get.mockResolvedValue(null); mocks.set.mockResolvedValue(undefined); mocks.native.mockResolvedValue(JSON.stringify(report())); });
  it('preserves unknown versus failed checks and strips secrets at every exported native boundary', () => {
    const unsafe = { privateKey: 'never-export', pin: 'never-export', authorizationId: 'never-export', rawTransaction: 'never-export', appCheckToken: 'never-export' };
    const parsed = parseNativeSupportReport(JSON.stringify({ ...report(), ...unsafe, events: [{ ...event(), ...unsafe },
      { ...event(), outcome: 'unavailable', reason: 'timeout', httpStatus: '503', ...unsafe }], nativeRecords: [{ ...report().nativeRecords[0], ...unsafe }] }), sender);
    expect(JSON.stringify(parsed)).not.toContain('never-export');
    expect(parsed.events.map(e => e.outcome)).toEqual(['unknown', 'unavailable']);
    expect(parsed.events[1].reason).toBe('timeout');
  });
  it('rejects wrong-wallet, malformed and oversized native exports instead of laundering them into a saved report', () => {
    for (const bad of [{ sender: `0x${'2'.repeat(40)}` }, { chainId: 97 }, { events: [{ ...event(), sender: `0x${'2'.repeat(40)}` }] },
      { events: Array(129).fill(event()) }, { generatedAt: -1 }, { buildFingerprint: 'not-a-build' }, { events: [{ ...event(), operationId: 'bad' }] }]) {
      expect(() => parseNativeSupportReport(JSON.stringify({ ...report(), ...bad }), sender)).toThrow();
    }
    expect(() => parseNativeSupportReport(' '.repeat(300001), sender)).toThrow();
    expect(cleanSupportFields({ errorCode: 'credential', httpStatus: '999', hash: 'bad', nonce: '-1', stage: 'a'.repeat(500) })).toEqual({});
  });
  it('exports missing journal and corrupt storage explicitly, rather than treating an empty array as cleared recovery', async () => {
    mocks.native.mockResolvedValue(JSON.stringify({ ...report(), nativeJournalStatus: 'unavailable', nativeRecords: [], storageStatus: 'unreadable', events: [], historyReset: true }));
    mocks.get.mockResolvedValue('{broken');
    const saved = JSON.parse(await createMainnetSupportReport(sender));
    expect(saved.nativeJournalStatus).toBe('unavailable'); expect(saved.historyReset).toBe(true);
    expect(saved.cacheStatus).toBe('unreadable_or_unavailable');
    expect(mocks.set).toHaveBeenCalledWith(`@aurionxi/mainnet-support-report/v1/${sender}`, expect.any(String));
    expect(saved.evidenceNotes.join(' ')).toContain('does not establish');
  });
  it('saves valid dated cached pointers without promoting cache to native authority or serializing injected payloads', async () => {
    mocks.get.mockResolvedValue(JSON.stringify([{ version: 1, chainId: 56, transactionHash: hash, senderAddress: sender,
      recipientAddress: sender, assetId: 'native-bnb', amountWei: '200000000000000', nonce: 6, submittedAt: Date.now(), receiptState: 'submission-unknown', rawTransaction: 'never-export' }, { malformed: true }]));
    const value = JSON.parse(await createMainnetSupportReport(sender));
    expect(value.cacheStatus).toBe('partially_unreadable'); expect(value.cacheRecords).toHaveLength(1);
    expect(JSON.stringify(value)).not.toContain('never-export'); expect(value.cacheRecords[0].receiptState).toBe('submission-unknown');
    expect(mocks.native).toHaveBeenCalledWith(sender);
  });
  it('surfaces failure to save a report instead of telling the user it was saved', async () => {
    mocks.set.mockRejectedValueOnce(new Error('disk full'));
    await expect(createMainnetSupportReport(sender)).rejects.toThrow('disk full');
  });
});
