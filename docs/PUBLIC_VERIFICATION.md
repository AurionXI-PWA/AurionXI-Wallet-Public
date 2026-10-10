# Public snapshot verification — 10 October 2026

## Completed checks

- Every one of the 821 allowlisted copied files matched the canonical working
  source by SHA-256 before public-only adaptations.
- `mobile`: `npm run typecheck` passed.
- `mobile`: full Vitest suite passed, **284 files / 1,256 tests**.
- `firebase-functions`: `node --check index.js` passed.
- `firebase-functions`: wallet test suite passed, **67 tests**.
- Local `require()` paths in exported backend JavaScript resolve to included
  files; the wallet-only entry preserves initialization before function use.
- Public ignore rules cover actual environment/signing/App Check properties,
  `google-services.json`, keystores, APKs, evidence and local dependency links.
- Snapshot path/text scans found no unexplained credential-pattern matches.
  Two credential-bearing URLs are explicit `https://user:pass@...example`
  rejection-test fixtures, not credentials. Recovery tests contain known
  public mnemonic vectors, not operator wallet recovery data.
- No private Git ancestry is imported. File hashes and provenance are recorded
  in `PUBLIC_FILE_MANIFEST.json`.

## Limits and observations

Existing local dependencies were reused through ignored `node_modules`
junctions; no dependency installation was performed. This is not a fresh-machine
dependency reproducibility test. Vitest emitted the existing CommonJS/ESM
configuration-loader warning; the full suite nevertheless passed.
The initial Git whitespace check reported existing CRLF/trailing-space and
blank-EOF formatting in copied files. These were retained to preserve source
bytes; this export does not claim a whitespace-clean source baseline.

Native Android tests are included but were not executed in this publication
step. No APK build, device installation, deployment, live RPC submission or
independent chain/installed-build verification was performed.

Pattern scans are heuristic and not a professional security audit or proof
that all possible sensitive information has been identified. This report is
publication verification, not a Mainnet/public-release certification.
