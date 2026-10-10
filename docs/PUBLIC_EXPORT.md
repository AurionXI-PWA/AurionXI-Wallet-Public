# Public export — 10 October 2026

Source baseline: `6e4c2f69685a3c9775ac35bfafc51b62fa10110d`.
Before copying, every selected file was compared by SHA-256 with the canonical
wallet working source. The private checkout was clean. The public repository
was cloned separately while empty; no private `.git` directory or commit
ancestry was copied.

## Copied source

- 793 tracked mobile files: app source, Android code/resources/Gradle wrapper,
  native module, lockfile/configuration and tests.
- 28 tracked wallet backend files: wallet modules/tests, swap manifest, package
  files and ignore rules.
- 142 private tracked paths were excluded from that copy allowlist.

The public-file manifest records SHA-256 hashes and whether each file is an
unchanged copy, an adapted file or newly prepared public documentation/config.
The manifest excludes itself to avoid recursive hashing.
Git preserves the exported line endings; manifest SHA-256 values cover exact
file bytes rather than normalized text.

## Deliberate adaptations

- Replaced stale private/mobile READMEs with current public documentation.
- Added a wallet-only Firebase `index.js`; no website visits, payment processing,
  launch rewards or private admin-email/bootstrap code is exported.
- Removed the owner's absolute JDK path from `mobile/android/gradle.properties`.
- Replaced the owner-specific release-key path/alias in the signing example.
- Updated the signing-template regression test to require generic placeholders;
  release credential enforcement tests remain intact.
- Added Direct signing/App Check templates containing placeholders only.
- Added public ignore rules, security guidance and licensing-boundary notice.

No app signing/broadcast/swap security logic or transaction limits were changed.
Public token/router addresses, app identifiers, certificate/code pins, public
RPC URLs and endpoint names remain where needed to inspect the real design.
They are not secret credentials.

## Not published

Private history; actual environment/configuration files; keystores/passwords;
service-account credentials; private keys/seeds; APKs; dependency/build caches;
device evidence and screenshots; support logs; internal audit/quotation files;
website/UPI/payment code; database exports and user/address-registry records.
Internal audit prose is not represented as an external audit certificate.

## Verification scope

Publication checks cover the exported snapshot: allowlist/path checks,
credential-pattern review, dependency/import completeness and selected source
tests. They do not independently prove a live deployment, chain transaction,
installed APK identity or that no undiscovered sensitive content exists.
No release build, installation, deployment or real transaction is performed.
