const bitcoin = require( 'bitcoinjs-lib' );
const bs58check = require('bs58check')
const { BtcBase } = require('./btc')
const ltcConfigs = require('./configs-ncc').LTC;

// scriptHash: 0xc4, //  for segwit (start with 2)

// pubKeyHash: 0x6f
function pkToAddress(gpk, network = 'mainnet') {
  const pkBuffer = Buffer.from("04" + gpk.slice(2), 'hex')
  const hash160 = bitcoin.crypto.hash160
  let prefix = 0x00
  switch(network) {
    case 'mainnet':
      prefix = 0x30
      break
    default:
      prefix = 0x6f
      break
  }
  const v = Buffer.from([prefix])
  const b20 = hash160(Buffer.from(pkBuffer, 'hex'))
  const payload = Buffer.concat([v, b20])
  const address = bs58check.encode(payload)

  return address
}

class LtcChain extends BtcBase {
  constructor(configs, network) {
    super(configs, network)
  }

  getP2PKHAddress(gpk) {
    return pkToAddress(gpk, this.network)
  }
}

const chain = new LtcChain(ltcConfigs, process.env.NETWORK_TYPE)

module.exports = {
  pkToAddress,
  chain,
  LtcChain,
}