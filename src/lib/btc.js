const bitcoin = require( 'bitcoinjs-lib' );
const bs58check = require('bs58check')
const BtcClient = require('bitcoin-core')

function pkToAddress(gpk, network = 'mainnet') {
  const pkBuffer = Buffer.from("04" + gpk.slice(2), 'hex')
  const hash160 = bitcoin.crypto.hash160
  let prefix = 0x00
  switch(network) {
    case 'mainnet':
      prefix = 0x00
      break
    default:
      prefix = 0x6f
      break
  }
  const v = Buffer.from([prefix])
  const b20 = hash160(Buffer.from(pkBuffer, 'hex'))
  const payload = Buffer.concat([v, b20])
  const address = bs58check.encode(payload)

  console.log(address)

  return address
}

module.exports = {
  pkToAddress
}