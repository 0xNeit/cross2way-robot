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

  }

  getBlockNumber = async () => {
    return await this.api.getBlockCount();
  }

  scanMessages = async (from, to, sgs) => {
    if (from > to) {
      return null
    }
    
    const client = this.api

    console.log(`scanMessages ${this.chainType} from = ${from} to = ${to}`)
    const msgs = []

    const coinUnit = this.coinUnit
    for (let curIndex = from; curIndex <= to; curIndex++) {
      const bHash = await client.getBlockHash(curIndex)
      // const block = await client.getBlock(bHash, 2)
      const block = await client.getBlockByHash(bHash, {
        summary : false,
        extension : 'json'
      })

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
            try {
              const op_return = format_cross_op_return(scriptPubKey.asm);
              const op_return_type = parseInt(op_return.substring(0, 2), 16);
              if (op_return_type >= op_return_begin && op_return_type <= op_return_end) {
                console.log(`blockNumber = ${curIndex}, op = ${op_return_type} len = ${op_return.length}`)
                if (op_return_type === op_return_smgDebt_type && op_return.length === 66 && vOut.length === 2) {
                  const fromGroupId = '0x' + op_return.substr(2);
                  for (let j = 0; j < vOut.length; j++) {
                    if (vOut[j].scriptPubKey && vOut[j].scriptPubKey.addresses && vOut[j].scriptPubKey.addresses.length === 1) {
                      // 验证fromGroupId, 是某一个storeManGroup的; 验证toAddress,是nextStoreMan的地址
                      const toAddress = vOut[j].scriptPubKey.addresses[0]
                      const toSmgInfo = this.getSmgInfoFromPreSmgId(fromGroupId, sgs)
                      if (!toSmgInfo) {
                        return
                      }

                      if (toSmgInfo.address != toAddress) {
                        log.info(`from = ${fromGroupId} to = ${toSmgInfo.groupId}, toSgAddress ${toSmgInfo.address} != toAddress ${toAddress}`)
                        return
                      }

                      const msg = {
                        groupId: fromGroupId,
                        chainType: this.chainType,
                        value: BigNumber(vOut[j].value).multipliedBy(coinUnit).toString(),
                        tx: tx.txid,
                      }
                      msgs.push(msg)

                      log.info(`from = ${fromGroupId}, to = ${toSmgInfo.groupId}, toAddress = ${toSmgInfo.address}, value = ${msg.receive}, tx = ${msg.tx}`)
                    }
                  }
                }
              }
            } catch(e) {
              log.warn(`${this.chainType} scanMessages op_return parse failed ${scriptPubKey.hex} ${e}`)
            }
          }
        })
      })
    }

    return msgs
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

const chain = new BtcChain(btcConfigs, process.env.NETWORK_TYPE)

module.exports = {
  pkToAddress,
  BtcBase,
  chain,
  BtcChain,
}