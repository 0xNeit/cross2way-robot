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
      this.reconnecting = true;
      this.doConnect();
    }, time);
  }

  doListen() {
    const self = this
    this.api.on('error', (code, msg) => {
      log.error(`XRP connection error. code: ${code}, msg: ${msg}.`, this.rpc)

      if (msg instanceof this.api.errors.DisconnectedError ||
        msg instanceof this.api.errors.NotConnectedError) {
          self.isApiReady = false;
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

  async getBalance(address) {
    await this.waitForApiReady()
    log.info(`${address}`)
    try {
      // TODO:　有没有判断账户存在的接口
      const balances = await this.api.getBalances(address)
      const balance = balances.find(b => b.currency === this.chainType)
      return this.toWei(balance.value)
    } catch(e) {
      if (e.name === 'RippledError') {
        if (e.message === 'Account not found') {
          return '0'
        }
      }
      log.warn(`xrp getBalance ${address} exception`, e)
      throw e
    }
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
        types: ['payment'],
      }
  
      if (!sg.gpk2 || sg.gpk2.length < 130) {
        continue
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
                const toSmgInfo = this.getSmgInfoFromPreSmgId(fromGroupId, sgs)
                if (!toSmgInfo) {
                  return
                }

                if (toSmgInfo.address != toAddress) {
                  log.error(`bad debt tx! chainType ${this.chainType}, tx = ${tx.id} value = ${tx.outcome.deliveredAmount.value}, from = ${fromGroupId} to = ${toSmgInfo.groupId}, toSgAddress ${toSmgInfo.address} != toAddress ${toAddress}`)
                  return
                }

                const msg = {
                  groupId: fromGroupId,
                  chainType: this.chainType,
                  value: BigNumber(tx.outcome.deliveredAmount.value).multipliedBy(coinUnit).toString(),
                  tx: tx.id,
                }
                msgs.push(msg)

                log.info(`from = ${fromGroupId}, to = ${toSmgInfo.groupId}, toAddress = ${toSmgInfo.address}, value = ${msg.value}, tx = ${msg.tx}`)
              }
            }
          }
        }
      })
    }

    return msgs
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

const chain = new XrpChain(xrpConfigs, process.env.NETWORK_TYPE)

module.exports = {
  pkToAddress,
  chain,
  XrpChain
}