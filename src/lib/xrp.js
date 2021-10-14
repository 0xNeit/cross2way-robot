"use strict"
const elliptic = require('elliptic')
const Secp256k1 = elliptic.ec('secp256k1');
const keypairs = require('ripple-keypairs')
const RippleAPI = require('ripple-lib').RippleAPI;
const log = require('./log')
const xrpConfigs = require('./configs-ncc').XRP
const NccChain = require('./ncc_chain')
const TimeoutPromise = require('./timeoutPromise')
const { default: BigNumber } = require('bignumber.js');

function pkToAddress(gpk) {
  const pubkey = Secp256k1.keyFromPublic("04" + gpk.slice(2), 'hex')
  const compressed = pubkey.getPublic(true, 'hex')
  
  const addr = keypairs.deriveAddress(compressed.toUpperCase())
  return addr
}

const dropsPerXrp = 1000000
const memo_smgDebt_type = 5

const XRP_CONN_READY_CHECK_TIMEOUT = 30*1000;  // 30s
const XRP_CONN_FAILED_RETRY_DELAY_MS = 3*1000  // 3s

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ripple
class XrpChain extends NccChain {
  constructor(configs, network) {
    const config = configs[network]
    super(config, network)

    this.api = new RippleAPI({ 
      server: this.rpc,
      timeout: 15 * 1000,
      maxFeeXRP: '' + 5 * dropsPerXrp,  // Must be of String type.
    });

    this.isApiReady = false
    this.reconnecting = false

    this.doListen()
    this.doConnect()
  }

  tryConnect(time) {
    setTimeout(()=> {
      that.reconnecting = true;
      that.doConnect();
    }, time);
  }

  doListen() {
    const self = this
    this.api.on('error', (code, msg) => {
      log.error(`XRP connection error. code: ${code}, msg: ${msg}.`, this.rpc)

      if (msg instanceof this.api.errors.DisconnectedError ||
        msg instanceof this.api.errors.NotConnectedError) {
          that.isApiReady = false;
          self.tryConnect(5 * 1000)
      }
    })

    this.api.on('connected', () => {
      this.isApiReady = true;
      this.reconnecting = false;
      log.info(`XRP connection connected.`, this.rpc);
    })

    this.api.on('disconnected', (code) => {
      log.warn('XRP connection disconnected. Code:', code)
      this.isApiReady = false
      self.tryConnect(5 * 1000)
    })
  }

  isReady() {
      return this.api.isConnected() && this.isApiReady;
  }

  doConnect() {
    const that = this;

    if(this.isReady()) {
      this.reconnecting = false
      return;
    }

    this.api.connect().then(() => {
      log.info("XRP doConnect() connected ...")
      that.isApiReady = true
      that.reconnecting = false

    }).catch( e => {
      log.error("XRP doConnect failed. Error: ", e)
      that.tryConnect(XRP_CONN_FAILED_RETRY_DELAY_MS)
    });
  }

  async waitForApiReady(timeoutMs = XRP_CONN_READY_CHECK_TIMEOUT) {
    const checkInterval = 100;  // ms

    let times = timeoutMs / checkInterval;

    while(!this.isReady()  && times > 0) {
      await sleep(checkInterval);
      times--;
    }

    if(!this.isReady() && !this.reconnecting) {
      this.reconnecting = true;
      this.doConnect();
    }

    if(!this.isReady()) {
      throw new Error(`XRP connection not ready within ${timeoutMs} seconds!`);
    }
  }

  async getBlockNumber() {
    await this.waitForApiReady()
    const blockNumber = await this.api.getLedgerVersion()
    return blockNumber
  }

  scanMessages = async (from, to, sgs) => {
    if (from > to) {
      return null
    }

    console.log(`scanMessages ${this.chainType} from = ${from} to = ${to}`)

    const coinUnit = this.coinUnit

    const msgs = []
    for (let i = 0; i < sgs.length; i++) {
      const sg = sgs[i]
      const self = this
  
      const options = {
        earliestFirst: true,
        minLedgerVersion: Number(from),
        maxLedgerVersion: Number(to),
        types: ['payment', 'accountDelete'],
      }
  
      const sgAddress = pkToAddress(sg.gpk2);
  
      await this.waitForApiReady()
  
      // txs send from storeManGroupAddress
      const txs = await self.api.getTransactions(sgAddress, {...options, initiated: true})
      
      txs.map(tx => {
        if (tx.type && tx.specification && tx.outcome) {
          const info = tx.specification
          if (info.destination && info.memos) {
            if (tx.type === 'payment' && info.source.address === sgAddress && tx.outcome.result === 'tesSUCCESS') {
              const memoAll = info.memos;
              if (!memoAll || !memoAll[0]) {
                return
              }
    
              const memo = memoAll[0]
              log.info("xrp chain memo found one cross-xrp Tx ... memo[0]: ", JSON.stringify(memo))
              
              if (!memo || memo.type !== 'CrossChainInfo' || memo.format !== 'text/plain') {
                return
              }
    
              const memoData = memo.data;
              const memo_return_type = memoData.substring(0, 2);
              if (parseInt(memo_return_type, 16) === memo_smgDebt_type && memoData.length === 66 && (info.source.address === sgAddress)) {
                const fromGroupId = '0x' + memoData.substr(2);
                const toAddress = info.destination.address;
                log.info(`from ${fromGroupId}, to ${toAddress}`)
                msgs.push({
                  msgType: 'DebtTransfer',
                  fromGroupId,
                  toAddress,
                  value: BigNumber(tx.outcome.deliveredAmount.value).multipliedBy(coinUnit).toString(),
                  tx: tx.id,
                })
              }
            }
          }
        }
      })
    }

    return msgs
  }

  // TODO: 检查提到scanMessage处, handle功能提出成公共模块
  handleMessages = (msgs, sgs, db, next) => {
    if (!msgs) {
      return
    }

    const items = []
    msgs.forEach(msg => {
      const { msgType, fromGroupId, toAddress, value, tx } = msg
      if (msgType === 'DebtTransfer') {
        const toSg = sgs.find(sg => (sg.preGroupId === fromGroupId))
        if (toSg) {
          if (!toSg.gpk2) {
            log.error(`${toSg.groupId} gpk2 not exist`)
          } else {
            const toAddress2 = this.getP2PKHAddress(toSg.gpk2)
            if (toAddress === toAddress2) {
              console.log(`from = ${fromGroupId}, to = ${toSg.groupId}, value = ${value}, tx = ${tx}`)
            
              items.push({
                groupId: fromGroupId,
                toGroupId : toSg.groupId,
                value,
                tx : tx,
              })
            }
          }
        }
      }
    })

    // insert to msg db
    const insertMsgs = db.db.transaction((items, next) => {
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        db.insertMsg({
          groupId: item.groupId,
          chainType: this.chainType,
          receive: item.value,
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
    insertMsgs(items, next)

    console.log('handleMessages finished')
  }

  getP2PKHAddress(gpk) {
    return pkToAddress(gpk, this.network)
  }

  close() {
    this.api.disconnect()
    log.info('close and disconnected.');
  }
}

// setTimeout(async () => {
//   const chain = new XrpChain(config[process.env.NETWORK_TYPE])
//   // await chain.scanBlock('19964353', '19964353', {gpk2: '0x60fc57b762f4f4c17c2fd6e8d093c4cd8f3e1ec431e6b508700160e66749ff7104b2e2fb7dad08e4eaca22dbf184ecede5ea24e7ec3b106905f1830a2a7f50b1'})
//   // await chain.scanBlock(19964353, 19964354, {gpk2: '0x042089c439045b2cfd283bb986697af2f5122792b3f60960d8026b7ce071a9cf1365798130f76a8a4f2d390d21db4bfab87b7f465cc9db38972494fb1de67866'})
//   const blockNumber = await chain.getBlockNumber()
//   await chain.scanBlock(blockNumber - 1000, blockNumber - 10, {gpk2: '0x042089c439045b2cfd283bb986697af2f5122792b3f60960d8026b7ce071a9cf1365798130f76a8a4f2d390d21db4bfab87b7f465cc9db38972494fb1de67866'})
//   console.log(`chain`)
// }, 0)

// console.log(pkToAddress("0x2e9ad92f5f541b6c2ddb672a70577c252aaa8b9b8dfdff9a5381912395985d12dc18f19ecb673a3b675697ae97913fcb69598c089f6d66ae7a3f6dc179e4da56"))

const xrpChain = new XrpChain(xrpConfigs, process.env.NETWORK_TYPE)

module.exports = {
  pkToAddress,
  xrpChain,
  XrpChain
}