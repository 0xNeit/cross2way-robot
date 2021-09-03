"use strict"
const elliptic = require('elliptic')
const Secp256k1 = elliptic.ec('secp256k1');
const keypairs = require('ripple-keypairs')
const RippleAPI = require('ripple-lib').RippleAPI;
const log = require('./log')
const config = require('./configs-other').XRP
const TimeoutPromise = require('./timeoutPromise')

function pkToAddress(gpk) {
  const pubkey = Secp256k1.keyFromPublic("04" + gpk.slice(2), 'hex')
  const compressed = pubkey.getPublic(true, 'hex')
  console.log("pubkey compressed:", compressed)
  
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
class XrpChain {
  constructor(chainConfig) {
    this.api = new RippleAPI({ 
      server: chainConfig.rpc,
      timeout: 15 * 1000,
      maxFeeXRP: '' + 5 * dropsPerXrp,  // Must be of String type.
    });

    Object.assign(this, chainConfig)

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

  async scanBlock(from, to, sg) {
    const self = this

    const options = {
      earliestFirst: true,
      minLedgerVersion: Number(from),
      maxLedgerVersion: Number(to),
      types: ['payment', 'accountDelete'],
    }

    const sgAddress = pkToAddress(sg.gpk2);

    await this.waitForApiReady()

    const fee = await this.api.getFee()
    const accountInfo = await this.api.getAccountInfo(sgAddress)

    // txs send from storemanGroupAddress
    // const txs = await self.api.getTransactions(sgAddress, {...options, initiated: true})

    // txs send to storemanGroupAddress
    const txs = await self.api.getTransactions(sgAddress, {...options, initiated: false})
    txs.map(tx => {info
      const info = tx.specification
      if (tx.type === 'accountDelete' || (info.destination && info.memos)) {
        if (tx.type === 'payment' && info && (info.destination.address === sgAddress || info.source.address === sgAddress) && tx.outcome && tx.outcome.result === 'tesSUCCESS') {
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

          if (parseInt(memo_return_type, 16) === memo_smgDebt_type && memoData.length === 66 &&
            (info.source.address === storemanAddr || info.destination.address === storemanAddr)) {
              const preGroupId = '0x' + memoData.substr(2);
              const nextGroupId = info.destination.address;
              log.info(`pre ${preGroupId}, next ${nextGroupId}`)
          }
        }
      }
    })
    
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
module.exports = {
  pkToAddress
}