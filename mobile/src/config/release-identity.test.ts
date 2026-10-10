import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const appConfig = JSON.parse(readFileSync(join(root, 'app.json'), 'utf8')) as {
  expo: { name: string; version: string; android: { package: string } };
};
const packageConfig = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as { version: string };

describe('V1.0 release identity', () => {
  it('uses the V1.0 public name and synchronized package version', () => {
    expect(appConfig.expo.name).toBe('AurionXI Wallet');
    expect(appConfig.expo.version).toBe('1.0.0');
    expect(packageConfig.version).toBe('1.0.0');
  });

  it('uses the V1.0 production Android package', () => {
    expect(appConfig.expo.android.package).toBe('com.aurionxi.wallet');
  });
});
