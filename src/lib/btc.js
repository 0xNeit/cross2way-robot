const bitcoin = require( 'bitcoinjs-lib' );
const bs58check = require('bs58check')
const BtcClient = require('bitcoin-core');

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

const config = {
  'testnet': {
    "nodeUrl": "52.40.34.234:36893",
    "feeUrl": "https://api.blockcypher.com/v1/btc/test3",
    "foundationAddr": "mpSRUeY5RWgxUyEFr7Dn1QCffZMJhPehwx",
    "chainID": "2147483648",
    rpcuser: 'wanglu',
    rpcpassword: 'Wanchain888',
  },
  'mainnet': {
    "nodeUrl": "nodes.wandevs.org:26893",
    "feeUrl": "https://api.blockcypher.com/v1/btc/main",
    "foundationAddr": "bc1q8ak3pfl9r3julum2s9763tvt8rmcxtzqll8s2l",
    "chainID": "2147492648",
    rpcuser: 'wanglu',
    rpcpassword: 'Wanchain888',
  },
  'regtest': {
    "nodeUrl": "127.0.0.1:8332",
    "feeUrl": "https://api.blockcypher.com/v1/btc/test3",
    "foundationAddr": "mpSRUeY5RWgxUyEFr7Dn1QCffZMJhPehwx",
    "chainID": "2147483648",
    rpcuser: 'mpc',
    rpcpassword: 'wanglubtc',
  }
}

function createClient() {
  return new BtcClient({
    // bitcoin, testnet, regtest
    network: 'regtest',
    host: '127.0.0.1',
    port: '8332',
    username: "mpc",
    password: "wanglubtc",
    timeout: 600000,
  })
}

const getBlockNumber = async () => {
  const client = createClient()

  try {
    const blockNumber = await client.getBlockCount();
    console.log(`current block ${blockNumber}`)
  } catch (e) {
    console.log(`getBlockCount failed ${e}`)
  }
}


// setInterval(async () => {
//   await getBlockNumber();
// }, 1000)

module.exports = {
  pkToAddress
}