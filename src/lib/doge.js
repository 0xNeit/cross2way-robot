const bitcoin = require( 'bitcoinjs-lib' );
const bs58check = require('bs58check')
const { BtcBase } = require('./btc')
const dogeConfigs = require('./configs-ncc').DOGE;
const { getP2PKH, networks } = require('./networks')

// scriptHash: 0xc4, //  for segwit (start with 2)

// pubKeyHash: 0x6f
function pkToAddress(gpk, network = 'mainnet') {
  const dogeNetwork = network === 'mainnet' ? networks.dogecoinMainnet : networks.dogecoinTestnet
  const address = getP2PKH(gpk, dogeNetwork)

  return address
}

class DogeChain extends BtcBase {
  constructor(configs, network) {
    super(configs, network)
  }

  getP2PKHAddress(gpk) {
    return pkToAddress(gpk, this.network)
  }
}

const chain = new DogeChain(dogeConfigs, process.env.NETWORK_TYPE)

module.exports = {
  pkToAddress,
  chain,
  DogeChain,
}