const bitcoin = require( 'bitcoinjs-lib' );
const bs58check = require('bs58check')
const BtcClient = require('bitcoin-core');
const { version } = require('keythereum');

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
    host: '52.40.34.234',
    port: '36893',
    rpcuser: 'wanglu',
    rpcpassword: 'Wanchain888',
    network: 'testnet',
  },
  'mainnet': {
    "nodeUrl": "nodes.wandevs.org:26893",
    "feeUrl": "https://api.blockcypher.com/v1/btc/main",
    "foundationAddr": "bc1q8ak3pfl9r3julum2s9763tvt8rmcxtzqll8s2l",
    "chainID": "2147492648",
    host: 'nodes.wandevs.org',
    port: '26893',
    rpcuser: 'wanglu',
    rpcpassword: 'Wanchain888',
    network: 'bitcoin',
  },
  'regtest': {
    "nodeUrl": "127.0.0.1:8332",
    "feeUrl": "https://api.blockcypher.com/v1/btc/test3",
    "foundationAddr": "mpSRUeY5RWgxUyEFr7Dn1QCffZMJhPehwx",
    "chainID": "2147483648",
    host: '127.0.0.1',
    port: '8332',
    rpcuser: 'mpc',
    rpcpassword: 'wanglubtc',
    network: 'regtest',
  }
}

function createClient(network) {
  const conf = conf[network]
  return new BtcClient({
    // bitcoin, testnet, regtest
    network: conf.network,
    host: conf.host,
    port: conf.port,
    username: conf.rpcuser,
    password: conf.rpcpassword,
    timeout: 600000,
  })
}

let gClient = null
const getClient = () => {
  if (!gClient) {
    gClient = createClient()
  }
  return gClient
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

const getCrossScAddr = () => {
  
}

const getBalance = async (from, to, sg) => {
  const client = getClient()
  try {
    const safeBlockNumber = 10
    const blockNumber = await client.getBlockCount();
    if (blockNumber < to + safeBlockNumber) {
      return null
    }

    if (from > to) {
      return null
    }

    for (let curIndex = from; curIndex < to; curIndex++) {
      let bhash = await client.getBlockHash(blockNumber)
      let block = await client.getBlock(bhash, 2)

      if (block && block.tx) {
        let multiTx = block.tx.map((tx) => {
        })
      }
    }
  } catch (e) {
    console.log(`getBalance error ${e}`)
  }

}

// tx-> hex
// 01000000       01  186f9f998a5aa6f048e51dd8419a14d8a0f1a8a2836dd734d2804fe65fa35779 00000000                8b                  48     [ 3045022100884d142d86652a3f47 ba4746ec719bbfbd040a570b1deccbb6498c75c4ae24cb02204b9f039 ff08df09cbe9f6addac960298cad530a863ea8f53982c09db8f6e3813 01410484ecc0d46f1918b30928fa0e4ed99f16a0fb4fde0735e7ade84 16ab9fe423cc5412336376789d172787ec3457eee41c04f4938de5cc1 7b4a10fa336a8d752adfffffffff0260e31600000000001976a914ab6 8025513c3dbd2f7b92a94e0581f5d50f654e788acd0ef800000000000 1976a9147f9b1a7fb68d60c536c2fd8aeaa53a8f3cc025a888ac 00000000
// version(4) + vin(1-9字节)                 +     vin的 txid(32,反序)                 + vOutIndex(4)  +   解锁脚本长度(1字节)  +     

// 186f9f998a5aa6f048e51dd8419a14d8a0f1a8a2836dd734d2804fe65fa35779
// 01000000     01    524d288f25cada331c298e21995ad070e1d1a0793e818f2f7cfb5f6122ef3e71 00000000                8c                  49     [ 3046022100a59e516883459706ac2e6ed6a97ef9788942d3c96a0108f2699fa48d9a5725d1022100f9bb4434943e87901c0c96b5f3af4e7ba7b83e12c69b1edbfe6965f933fcd17d0141 ] 04e5a0b4de6c09bd9d3f730ce56ff42657da3a7ec4798c0ace2459fb007236bc3249f70170509ed663da0300023a5de700998bfec49d4da4c66288a58374626c8dffffffff0180969800000000001976a9147f9b1a7fb68d60c536c2fd8aeaa53a8f3cc025a888ac00000000



module.exports = {
  pkToAddress,
  getBalance
}