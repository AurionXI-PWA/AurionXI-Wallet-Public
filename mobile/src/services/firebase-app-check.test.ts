import { describe, expect, it } from 'vitest';

import { appCheckRequestHeaders } from './firebase-app-check';

describe('Firebase App Check request headers', () => {
  it('never invents a token and sends only a supplied token', () => {
    expect(appCheckRequestHeaders(undefined)).toEqual({});
    expect(appCheckRequestHeaders('verified-token')).toEqual({ 'X-Firebase-AppCheck': 'verified-token' });
  });
});
