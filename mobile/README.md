# AurionXI Wallet mobile source

The Android/Expo wallet supports BNB, ARXI and USDT send/receive and six directed
swap routes in the official Direct flavor. See the root README for setup,
configuration boundaries and licensing.

- UI and security/application logic: `src/`
- Android native vault/signing/App Check and native tests: `android/`
- Native Argon2 bridge: `modules/aurionxi-argon2/`
- JavaScript/TypeScript regression tests: colocated `*.test.*` files and `tests/`

Use `npm ci`, `npm run typecheck` and `npm test` for local verification. Production
signing files and Firebase configuration are intentionally absent. Do not
replace native policy enforcement with JavaScript signing or publish secrets.

`LICENSE` preserves the existing Expo template notice; it does not by itself
license all AurionXI-authored code. See `../LICENSE.md`.
