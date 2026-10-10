// Public wallet-only entry point. Website, payment and admin-bootstrap
// functions from the private project are intentionally not exported here.
const admin = require('firebase-admin');

admin.initializeApp();

exports.walletTestnetActivity = require('./wallet-history').walletTestnetActivity;
exports.walletTestnetBroadcast = require('./wallet-testnet-broadcast').walletTestnetBroadcast;
exports.walletMainnetPortfolio = require('./wallet-mainnet-readonly').walletMainnetPortfolio;
exports.walletMainnetActivity = require('./wallet-mainnet-history').walletMainnetActivity;
exports.walletMainnetPreSignSnapshot = require('./wallet-mainnet-presign').walletMainnetPreSignSnapshot;
exports.walletMainnetBroadcast = require('./wallet-mainnet-broadcast').walletMainnetBroadcast;
exports.walletMainnetSwapQuote = require('./wallet-mainnet-swap-quote').walletMainnetSwapQuote;
exports.walletAddressRegistry = require('./wallet-address-registry').walletAddressRegistry;
exports.getWalletAddressRegistry = require('./wallet-address-registry').getWalletAddressRegistry;
