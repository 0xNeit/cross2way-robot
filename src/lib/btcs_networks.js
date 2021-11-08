
const bitcoin = require( 'bitcoinjs-lib' );
const bs58check = require('bs58check')

// Doge/ltc/btc都差不多, 只是用的network参数不同 我之前找到的一个network参数. 
const Networks = {
  // Bitcoin networks
  bitcoinMainnet: bitcoin.networks.bitcoin,
  bitcoinTestnet: bitcoin.networks.testnet,
  bitcoinSimnet: {
    messagePrefix: bitcoinPrefix,
    bip32: simnetBip32,
    bech32: 'sb',
    scriptHash: 0x7b,
    pubKeyHash: 0x3f,
    wif: 0x64,
  },
  bitcoinRegtest: bitcoin.networks.regtest,

  // Litecoin networks
  litecoinMainnet: {
    messagePrefix: litecoinPrefix,
    bip32: {
      private: 0x488ADE4,
      public: 0x488B21E,
    },
    bech32: 'ltc',
    scriptHash: 0x32,
    pubKeyHash: 0x30,
    wif: 0xb0,
  },
  litecoinTestnet: {
    messagePrefix: litecoinPrefix,
    bip32: testnetBip32,
    bech32: 'tltc',
    scriptHash: 0x3a,
    pubKeyHash: 0x6f,
    wif: 0xef,
  },
  litecoinSimnet: {
    messagePrefix: bitcoinPrefix,
    bip32: simnetBip32,
    bech32: 'sltc',
    scriptHash: 0x7b,
    pubKeyHash: 0x3f,
    wif: 0x64,
  },
  litecoinRegtest: {
    messagePrefix: litecoinPrefix,
    bip32: testnetBip32,
    bech32: 'rltc',
    scriptHash: 0x3a,
    pubKeyHash: 0x6f,
    wif: 0xef,
  },

  // Dogecoin networks
  dogecoinMainnet: {
    messagePrefix: dogecoinPrefix,
    bip32: {
      public: 0x02facafd,
      private: 0x02fac398,
    },
    pubKeyHash: 0x1e,
    scriptHash: 0x16,
    wif: 0x9e,
  },
  dogecoinTestnet: {
    messagePrefix: dogecoinPrefix,
    bip32: testnetBip32,
    pubKeyHash: 0x71,
    scriptHash: 0xc4,
    wif: 0xf1,
  },
  dogecoinRegtest: {
    messagePrefix: dogecoinPrefix,
    bip32: testnetBip32,
    pubKeyHash: 0x6f,
    scriptHash: 0xc4,
    wif: 0xef,
  },
};