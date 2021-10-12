const bitcoin = require( 'bitcoinjs-lib' );
const bs58check = require('bs58check')
const BtcClient = require('bitcoin-core');
const { version } = require('keythereum');
const btcConfigs = require('./configs-ncc').BTC;
const { default: BigNumber } = require('bignumber.js');
const NccChain = require('./ncc_chain')
const log = require('./log');

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

  return address
}

class BtcBase extends NccChain {
  constructor(configs, network) {
    const config = configs[network]

    super(config, network)

    const [host, port] = config.rpc.split(':')
    const {rpcUser, rpcPassword} = config

    this.api = new BtcClient({
      network,
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

    console.log(`scanMessages ${this.chainType} from = ${from} to = ${to}`)
    const msgs = []

    for (let curIndex = from; curIndex <= to; curIndex++) {
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

  handleMessages = (msgs, sgs, db, next) => {
    if (!msgs) {
      return
    }

    const items = []
    msgs.forEach(msg => {
      const { msgType, vOut, fromGroupId, tx } = msg
      if (msgType === 'DebtTransfer') {
        const toSg = sgs.find(sg => (sg.preGroupId === fromGroupId))
        const toAddress = this.getP2PKHAddress(toSg.gpk2)
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
          chainType: this.chainType,
          receive: item.receive,
          tx: item.tx,
        })

        // 设置转移的资产总量, 超过债务时,设置债务clean为true
        const assets = db.getMsgsByGroupId({groupId: item.groupId, chainType: this.chainType})
        const reducer = (sum, asset) => sum.plus(BigNumber(asset.receive))
        const totalAssets = assets.reduce(reducer, BigNumber(0))
        const debt = db.getDebt({groupId: item.groupId, chainType: this.chainType})
        if (debt) {
          if (totalAssets.comparedTo(BigNumber(debt.totalSupply)) >= 0) {
            debt.isDebtClean = 1
          }
          debt.totalReceive = totalAssets.toString()
          debt.lastReceiveTx = item.tx
          db.updateDebt(debt)
        } else {
          log.error(`debt not exist, ${item.groupId}, ${item.chainType}, ${totalAssets}`)
        }
      }
      db.updateScan({chainType: this.chainType, blockNumber: next});
    })
    insertMsgs(items)

    console.log('handleMessages finished')
  }
}

class BtcChain extends BtcBase {
  constructor(configs, network) {
    super(configs, network)
  }

  getP2PKHAddress(gpk) {
    return pkToAddress(gpk, this.network)
  }
}

const btcChain = new BtcChain(btcConfigs, process.env.NETWORK_TYPE)

module.exports = {
  pkToAddress,
  BtcBase,
  btcChain,
  BtcChain,
}