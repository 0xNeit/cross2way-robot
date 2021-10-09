const bitcoin = require( 'bitcoinjs-lib' );
const bs58check = require('bs58check')
const BtcClient = require('bitcoin-core');
const { version } = require('keythereum');
const btcConfigs = require('./configs-ncc').BTC;
const { default: BigNumber } = require('bignumber.js');
const NccChain = require('./ncc_chain')


const op_return_cross_type = 1
const op_return_smgDebt_type = 6

const op_return_begin = op_return_cross_type
const op_return_end = op_return_smgDebt_type

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

class BtcChain extends NccChain {
  constructor(config) {
    super(config)

    const [host, port] = config.rpc.split(':')
    const {rpcUser, rpcPassword} = config

    this.api = new BtcClient({
      host,
      port,
      username: rpcUser,
      password: rpcPassword,
      timeout: 600000,
    })

    this.coinUnit = new BigNumber(10).pow(config.decimals)
  }

  getBlockNumber = async () => {
    return await this.api.getBlockCount();
  }

  scanMessages = async (from, to) => {
    const client = this.api
    
    if (from > to) {
      return null
    }

    console.log(`scanMessages BTC from = ${from} to = ${to}`)
    const msgs = []

    for (let curIndex = from; curIndex < to; curIndex++) {
      const bHash = await client.getBlockHash(curIndex)
      const block = await client.getBlock(bHash, 2)

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
                    msgs.push({
                      msgType: 'DebtTransfer',
                      vOut: vOut[j],
                      fromGroupId,
                      tx
                    })
                  }
                }
              }
            }
          }
        })
      })
    }

    return msgs
  }

  handleMessages = (msgs, sgs, db) => {
    const items = []
    msgs.forEach(msg => {
      const { msgType, vOut, fromGroupId, tx } = msg
      if (msgType === 'DebtTransfer') {
        const toSg = sgs.find(sg => (sg.preGroupId === fromGroupId))
        const toAddress = pkToAddress(toSg.gpk2, process.env.NETWORK_TYPE)
        if (vOut.scriptPubKey.addresses.length === 1 && vOut.scriptPubKey.addresses[0] === toAddress) {
          console.log(`from = ${fromGroupId}, to = ${toSg.groupId}, value = ${vOut.value}, tx = ${tx.txid}`)
        
          items.push({
            groupId: fromGroupId,
            toGroupId : toSg.groupId,
            value: vOut.value,
            tx : tx.txid,
          })
        }
      }
    })

    // insert to msg db
    const insertMsgs = db.db.transaction((items) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        item.receive = BigNumber(item.value).multipliedBy(this.coinUnit).toString()
        db.insertMsg({
          groupId: item.groupId,
          coinType: this.coinType,
          receive: item.receive,
          tx: item.tx,
        })
      }
    })
    insertMsgs(items)
    db.updateScan({chainType: this.chainType, blockNumber: next});

    console.log('handleMessages finished')
  }
}

const btcChain = new BtcChain(btcConfigs[process.env.NETWORK_TYPE])

setTimeout(async () => {
  // pkToAddress('0x60fc57b762f4f4c17c2fd6e8d093c4cd8f3e1ec431e6b508700160e66749ff7104b2e2fb7dad08e4eaca22dbf184ecede5ea24e7ec3b106905f1830a2a7f50b1', 'testnet')
  // pkToAddress('0x042089c439045b2cfd283bb986697af2f5122792b3f60960d8026b7ce071a9cf1365798130f76a8a4f2d390d21db4bfab87b7f465cc9db38972494fb1de67866', 'testnet')

  const db = require('./sqlite_db');
  setTimeout(async () => {
    const sgs = db.getAllSga();
    const blockNumber = await btcChain.getBlockNumber();
    const msgs = await btcChain.scanMessages(2063996, 2063996 + 3, sgs)
    btcChain.handleMessages(msgs, sgs, db)
  }, 0)
}, 10)

module.exports = {
  pkToAddress,
  btcChain,
}