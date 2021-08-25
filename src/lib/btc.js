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

const send = () => {
  const client = createClient()

  try {
    client.send()
  } catch (e) {

  }
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
const op_return_smg_type = 2
const op_return_smgOtaRedeem_type = 3
const op_return_smgTransfer_type = 4
const op_return_smgOtaTransfer_type = 5
const op_return_smgDebt_type = 6

const op_return_begin = op_return_cross_type
const op_return_end = op_return_smgDebt_type

const getBalance = async (from, _to, sg) => {
  const client = getClient()
  try {
    const safeBlockNumber = 10

    const to = _to - safeBlockNumber

    if (from > to) {
      return null
    }

    const self = this;
    for (let curIndex = from; curIndex < to; curIndex++) {
      const bhash = await client.getBlockHash(curIndex)
      const block = await client.getBlock(bhash, 2)

      console.log(`blockNumber = ${curIndex} begin`)
      if (block && block.tx) {
        block.tx.forEach((tx) => {
          const vOut = tx.vout
          if (vOut.length === 1) {
            return
          }

          vOut.forEach(async (out) => {
            const scriptPubKey = out.scriptPubKey
            if (scriptPubKey && scriptPubKey.hex && scriptPubKey.hex.length > 6 && 0 == scriptPubKey.hex.indexOf('6a')) {
              const op_return = format_cross_op_return(scriptPubKey.asm);
              const op_return_type = parseInt(op_return.substring(0, 2), 16);
              if (op_return_type >= op_return_begin && op_return_type <= op_return_end) {
                console.log(`blockNumber = ${curIndex}, op = ${op_return_type} len = ${op_return.length}`)
                if (op_return_type === op_return_cross_type && op_return.length >= 46 && op_return.length <= 54) {
                  for (let j = 0; j < vOut.length; j++) {
                    const scriptPubKeyJ = vOut[j].scriptPubKey
                    if (scriptPubKeyJ &&
                      scriptPubKeyJ.type === "pubkeyhash" &&
                      scriptPubKeyJ.addresses && scriptPubKeyJ.addresses.length === 1 && scriptPubKeyJ.addresses.includes(accountName)) {
                      const tokenPairId = parseInt(op_return.substring(2, 6), 16);
                      const userAccount = op_return.substring(6, 46);
                      const networkFee = (op_return.length === 46) ? 0 : parseInt(op_return.substr(46), 16);
                      op.event = this.crossInfo.EVENT.Lock.walletRapid[0];
                      op.vout = vOut[j];
                      op.args = {
                        uniqueID: tx.txid,
                        value: vOut[j].value,
                        tokenPairID: tokenPairId,
                        userAccount: '0x' + userAccount,
                        tokenAccount: "0x0000000000000000000000000000000000000000",
                        fee: networkFee
                      };
                      break;
                    }
                  }
                } else if (op_return_type === op_return_smgDebt_type && op_return.length === 66 && vOut.length === 2) {
                  const srcSmg = '0x' + op_return.substr(2);
                  for (let j = 0; j < vOut.length; j++) {
                    if (vOut[j].scriptPubKey && vOut[j].scriptPubKey.addresses) {
                      op.event = 'TransferAssetLogger';
                      op.vout = vOut[j];
                      op.destSmgAddr = accountName;
                      op.args = {
                        uniqueID: tx.txid,
                        value: vOut[j].value,
                        srcSmgID: srcSmg
                      };
                      break;
                    }
                  }
                }
              }
            }
          })
        })
      }
    }
  } catch (e) {
    console.log(`getBalance error ${e}`)
  }
}

// setTimeout(async () => {
//   const blockNumber = await getClient().getBlockCount();
//   await getBalance(2065118, blockNumber, {
    
//   })
// }, 10)

module.exports = {
  pkToAddress,
  getBalance
}