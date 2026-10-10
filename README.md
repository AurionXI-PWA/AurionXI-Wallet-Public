# AurionXI Wallet — Public Source

Public source snapshot of the AurionXI Android wallet and its wallet-specific
Firebase backend. The official Direct wallet supports BNB, ARXI and USDT on
BNB Smart Chain (chain ID 56), with send/receive flows and six directed swap
routes between the three assets. Live operation is reported by the release
owner; publication of this source is not an independent audit or certification.

## Repository layout

- `mobile/`: React Native/Expo app, Android native signing/vault code, assets,
  configuration, native Argon2 module and tests.
- `firebase-functions/`: wallet portfolio, activity, pre-sign, relay, swap and
  consented public-address registry modules and tests. Its entry point exports
  wallet functions only; website, UPI/payment and admin-bootstrap functions are
  deliberately excluded.
- `docs/PUBLIC_EXPORT.md`: snapshot provenance, publication boundaries and
  adaptations made for this public repository.
- `docs/PUBLIC_FILE_MANIFEST.json`: exported-file inventory and SHA-256 hashes.

PIN/biometric authorization, native key custody, transaction-bound handles,
receipt recovery and mandatory policy checks remain in the published source.
No wallet seed, private key, owner signing certificate private key or production
credential is included.

## Local development and tests

Use the Node version required by the selected project, npm, an Android SDK and
a compatible JDK. The Firebase project declares Node 24. Mobile dependencies
and their exact versions are recorded in `mobile/package-lock.json`.

```powershell
cd mobile
npm ci
npm run typecheck
npm test
```

For the backend, from the repository root:

```powershell
cd firebase-functions
npm ci
node --test wallet-*.test.js
```

Run these on your own development machine. This publication process does not
build an APK, install an app, deploy Firebase functions or send transactions.

## Configuration and official builds

This is a source snapshot, not a turnkey production deployment. Backend secret
values are supplied separately through Firebase Secret Manager. Configure your
own Firebase project and Android app registrations; `google-services.json`,
`.firebaserc`, actual `.env` files and signing properties are not published.
Use the `*.properties.example` files as templates only.

The native app and relay deliberately pin public chain addresses, endpoints,
app identities and contract/code hashes. These identifiers are not private
credentials. A fork must review and configure its own app/service identities
consistently; changing JavaScript environment variables alone is insufficient.
Do not bypass those checks or connect an unreviewed fork to production funds.

An official Direct release requires the owner's separately held signing key
and configuration. A developer-built APK is not the official release, cannot
impersonate its certificate and may not pass the official relay's App Check.
Production and testnet variants must remain isolated.

Public source history starts with this export. No private repository history,
local device evidence, APKs, audit correspondence, customer/registry records or
website source has been imported.

## Security assessment and private validation

The deployed AurionXI TokenDiamond received a **90.61/100** score in a
SolidityScan static assessment, with **0 Critical, 0 High and 0 Medium** findings
reported. Read the complete
[ARXI Token Audit Report](https://www.aurionxi.com/ARXI_Token_Audit_Report.pdf)
for its scope, methodology, remaining findings and disclaimers. This assessment
does not certify the wallet application or guarantee that the protocol is free
from vulnerabilities.

Additional Mainnet operational validation and configuration scripts are kept
private because they contain production-administration workflows. A sanitized
technical walkthrough or selected evidence may be shared during a verified
technical interview or under NDA. The executable wallet and backend tests that
are included in this public source can be run using the commands above.

## Security and licensing

See [SECURITY.md](SECURITY.md) for reporting guidance and [LICENSE.md](LICENSE.md)
for the publication's licensing boundary. Do not interpret this repository as
a security guarantee or as permission to reuse third-party trademarks.
