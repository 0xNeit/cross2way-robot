"use strict"
const elliptic = require('elliptic')
const Secp256k1 = elliptic.ec('secp256k1');
const keypairs = require('ripple-keypairs')
const RippleAPI = require('ripple-lib').RippleAPI;
const log = require('./log')
const config = require('./configs-ncc').XRP

function pkToAddress(gpk) {
  const pubkey = Secp256k1.keyFromPublic("04" + gpk.slice(2), 'hex')
  const compressed = pubkey.getPublic(true, 'hex')
  console.log("pubkey compressed:", compressed)
  
  const addr = keypairs.deriveAddress(compressed.toUpperCase())
  return addr
}

const XRP_CONN_READY_CHECK_TIMEOUT = 30*1000;  // 30s
const XRP_CONN_FAILED_RETRY_DELAY_MS = 3*1000  // 3s

const dropsPerXrp = 1000000

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
          tryConnect(5 * 1000)
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
      tryConnect(5 * 1000)
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
}

setTimeout(async () => {
  const chain = new XrpChain(config[process.env.NETWORK_TYPE])
  console.log(`chain`)
}, 0)

// console.log(pkToAddress("0x2e9ad92f5f541b6c2ddb672a70577c252aaa8b9b8dfdff9a5381912395985d12dc18f19ecb673a3b675697ae97913fcb69598c089f6d66ae7a3f6dc179e4da56"))
module.exports = {
  pkToAddress
}