const bitcoin = require( 'bitcoinjs-lib' );
const bs58check = require('bs58check')
const BtcClient = require('bitcoin-core');
const { version } = require('keythereum');

function pkToAddress(gpk, network = 'mainnet') {
  console.log(`..${"04" + gpk.slice(2)}`)
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
  console.log(`hash160 ${b20.toString('hex')}`)
  const payload = Buffer.concat([v, b20])
  const address = bs58check.encode(payload)

  console.log(address)

  return address
}
// getP2SHAddress(hashVal, publicKey, networkInfo) {
//   const p2sh = bitcoin.payments.p2sh({
//       network: networkInfo,
//       redeem: {
//           output: this.getRedeemScript(hashVal, publicKey),
//           network: networkInfo
//       },
//   });
//   return p2sh.address;
// }

function hash160ToAddress(h, network = 'mainnet') {
  console.log(`hash160ToAddress h = ${h}`)
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
  const b20 = h
  console.log(`hash160 ${b20.toString('hex')}`)
  const payload = Buffer.concat([v, b20])
  const address = bs58check.encode(payload)

  console.log(address)

  return address
}

const configs = {
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
  const conf = configs[network]
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
    gClient = createClient(process.env.NETWORK_TYPE)
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

function format_cross_op_return (op_return) {
  //$log.debug('OP_RETURN Unformatted: ' + op_return);
  var content = '';
  if (op_return && op_return.indexOf("OP_RETURN") > -1) {
    var op_string = new String(op_return);
    content = op_string.substring(op_string.indexOf("OP_RETURN") + 9, op_string.length).trim();
  }
  //$log.debug('OP_RETURN Formatted: ' + content);
  return content;
};

const op_return_cross_type = 1
const op_return_smgDebt_type = 6

const op_return_begin = op_return_cross_type
const op_return_end = op_return_smgDebt_type

const scanMessages = async (from, _to, sgs) => {
  const client = getClient()
  try {
    const safeBlockNumber = 10

    const to = _to - safeBlockNumber

    if (from > to) {
      return null
    }

    const msgs = []

    for (let curIndex = from; curIndex < to; curIndex++) {
      const bhash = await client.getBlockHash(curIndex)
      const block = await client.getBlock(bhash, 2)

      console.log(`blockNumber = ${curIndex} begin`)
      if (!block || !block.tx) {
        continue
      }
      block.tx.forEach((tx) => {
        const vOut = tx.vout
        if (vOut.length === 1) {
          return
        }
        
        vOut.forEach(async (out) => {
          const scriptPubKey = out.scriptPubKey
          if (scriptPubKey && scriptPubKey.hex && scriptPubKey.hex.length > 6 && scriptPubKey.hex.startsWith('6a')) {
            const op_return = format_cross_op_return(scriptPubKey.asm);
            const op_return_type = parseInt(op_return.substring(0, 2), 16);
            if (op_return_type >= op_return_begin && op_return_type <= op_return_end) {
              console.log(`blockNumber = ${curIndex}, op = ${op_return_type} len = ${op_return.length}`)
              if (op_return_type === op_return_smgDebt_type && op_return.length === 66 && vOut.length === 2) {
                const fromGroupId = '0x' + op_return.substr(2);
                for (let j = 0; j < vOut.length; j++) {
                  if (vOut[j].scriptPubKey && vOut[j].scriptPubKey.addresses) {
                    // const toHash160 = vOut[j].scriptPubKey.hex.match(/^76a914(.{40})88ac$/)[1]
                    const toSg = sgs.find(sg => (sg.preGroupId === fromGroupId))
                    const toAddress = pkToAddress(toSg.gpk2, process.env.NETWORK_TYPE)
                    if (vOut[j].scriptPubKey.addresses.length === 1 && vOut[j].scriptPubKey.addresses[0] === toAddress) {
                      console.log(`from = ${fromGroupId}, to = ${toSg.groupId}, value = ${vOut[j].value}, tx = ${tx.txid}`)
                    
                      msgs.push({
                        from: fromGroupId,
                        coin: 'BTC',
                        to : toSg.groupId,
                        value: vOut[j].value,
                        tx : tx.txid,
                      })
                      break;
                    }
                  }
                }
              }
            }
          }
        })
      })
    }

    return msgs
  } catch (e) {
    console.log(`scanMessages error ${e}`)
    return null
  }
}

// 方案一 1. 从上个storeMan的endTime开始, 扫描发送到下个storeMan的交易,累加起来,如果超过本资产的债务,则设置本种债务为clean状态
function getDebtTasks(preGroupId, nextGroupId, preEndTime, totalDebt, receivedDebt) {
  gNewTasks[preGroupId] = {
    nextGroupId,
    preEndTime,
    totalDebt,
    receivedDebt
  }
  return gNewTasks
}

// 2. 如果所有债务都为clean,设置wan上的状态

setTimeout(async () => {
  // pkToAddress('0x60fc57b762f4f4c17c2fd6e8d093c4cd8f3e1ec431e6b508700160e66749ff7104b2e2fb7dad08e4eaca22dbf184ecede5ea24e7ec3b106905f1830a2a7f50b1', 'testnet')
  // pkToAddress('0x042089c439045b2cfd283bb986697af2f5122792b3f60960d8026b7ce071a9cf1365798130f76a8a4f2d390d21db4bfab87b7f465cc9db38972494fb1de67866', 'testnet')

  const db = require('./sqlite_db');
  setTimeout(async () => {
    const sgs = db.getAllSga();
    const blockNumber = await getClient().getBlockCount();
    await scanMessages(2063996, 2063996 + 12, sgs)
  }, 0)
}, 10)

module.exports = {
  pkToAddress,
  scanMessages,
}