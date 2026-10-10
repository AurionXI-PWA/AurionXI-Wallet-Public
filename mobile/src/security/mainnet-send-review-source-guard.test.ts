import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Mainnet send review route boundary', () => {
  it('does not accept security-sensitive quotes through navigation parameters', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/wallet/mainnet-send-review.tsx'), 'utf8');
    expect(source).not.toContain('useLocalSearchParams');
    expect(source).toContain('isMainnetTrustedQuoteFresh');
    expect(source).toContain("<Redirect href={'/wallet/mainnet-readonly'");
  });

  it('opens a dedicated preview route instead of rendering sensitive details inline', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/wallet/mainnet-send-review.tsx'), 'utf8');
    const preview = readFileSync(join(process.cwd(), 'src/app/wallet/mainnet-transfer-preview.tsx'), 'utf8');
    expect(source).toContain("router.push('/wallet/mainnet-transfer-preview'");
    expect(source).not.toContain('Verify native vault');
    expect(preview).toContain('Transfer Preview');
    expect(preview).toContain('Mainnet signing and broadcasting are not enabled.');
  });

  it('keeps the review result reachable while the Android keyboard is open', () => {
    const source = readFileSync(join(process.cwd(), 'src/app/wallet/mainnet-send-review.tsx'), 'utf8');
    expect(source).toContain('automaticallyAdjustKeyboardInsets');
    expect(source).toContain('keyboardDismissMode="on-drag"');
    expect(source).toContain('Keyboard.dismiss()');
    expect(source).toContain('scrollToEnd({ animated: true })');
    expect(source).toContain('flexGrow: 1');
  });
});
