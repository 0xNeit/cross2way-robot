const { Keyring, ApiPromise, WsProvider } = require('@polkadot/api');
const _util = require("@polkadot/util");
const _utilCrypto = require("@polkadot/util-crypto");
// const { decodeAddress, encodeAddress } = require('@polkadot/keyring');
const config = require('./configs-other').DOT
const log = require('./log')

// const provider = new WsProvider(process.env.RPC_URL_DOT);
// let api = null
// setTimeout(async () => {
//   api = await ApiPromise.create({ provider: provider });
// }, 0)

// export enum PolkadotSS58Format {
// 	polkadot = 0,
// 	kusama = 2,
// 	westend = 42,
// 	substrate = 42,
// }
function longPubKeyToAddress(longPubKey, network = 'mainnet') {
  longPubKey = '0x04'+longPubKey.slice(2);
  const tmp = _util.hexToU8a(longPubKey);
  let ss58Format = 42
  switch(network) {
    case 'mainnet':
      ss58Format = 0
      break
  }
  const pubKeyCompress = _utilCrypto.secp256k1Compress(tmp);
  const hash = _utilCrypto.blake2AsU8a(pubKeyCompress);
  const keyring = new Keyring({ type: 'ecdsa', ss58Format: ss58Format });
  const address = keyring.encodeAddress(hash);
  return address
}

function sleep(ms) {
  return new Promise(function(resolve, reject) {
    setTimeout(function() {
      resolve();
    }, ms);
  })
}

// polka
class DotChain {
  constructor(chainConfig) {
    Object.assign(this, chainConfig)
  }

  async createApi() {
    const provider = new WsProvider(this.rpc)
    this.api = await ApiPromise.create({ provider })
  }

  async waitApiReady() {
    while (!this.api) {
      await sleep(10)
    }
    await this.api.isReady
  }

  async getBlockNumber() {
    await this.waitApiReady()
    const lastHeader = await this.api.rpc.chain.getHeader()
    const blockNumber = lastHeader.number.toNumber()
    return blockNumber
  }

  /**
   *   filter out Tx with memo send to/from  storemanScAddr
   *
   * @param extrinsic
   * @param index:  The position index of transaction/extrinsic inside a block;
   * @param storemanScAddr:   use to match Tx's destination address
   *
   * @return {null} : return one transaction/extrinsic scan result object if found.
   * @private
   */
   _scanMemoTx(extrinsic, index, storemanScAddr) {
    const log = this.log;
    const api = this.api;
    let scanResultTx = null

    try{

      const { isSigned, signer, method: { args, method, section } } = extrinsic;
      // log.info("args: ", JSON.stringify(args));

      if(method !== 'batchAll') {
        return null;
      }

      // 每处理一个 extrinsic 都会給下面的 from/to/value/memo 变量重新赋值一次
      let from = "";
      let dest = "";
      let value = 0;
      let memo = "";
      let bMatched = false;

      if(isSigned && signer) {
        from = signer.toString();
      }

      let batch_Args = JSON.parse(JSON.stringify(args))

      if(batch_Args.length !== 1) {
        console.log("Invalid batch Tx");
        return null;
      }

      batch_Args.forEach( args => {

        if(args.length !== 2) {
          console.log("Invalid batch Tx");
          return;
        }

        args.forEach( call => {

          const callInfo = api.findCall(call.callIndex);

          if(callInfo.section === 'balances' &&
              (callInfo.method === 'transferKeepAlive' || callInfo.method === 'transferAll') &&
              call.args && call.args.dest && (call.args.dest.id === storemanScAddr || from === storemanScAddr)){

            bMatched = true
            dest = call.args.dest.id;
            value = call.args.value;
          }

          if(callInfo.section === 'system' &&
              callInfo.method === 'remark' &&
              call.args && call.args._remark) {
            memo = asciiToHex(hexTrip0x(call.args._remark));
          }
        })
      })

      if(bMatched) {
        scanResultTx = {}
        scanResultTx['args'] = {}

        scanResultTx.isBridge = true;
        scanResultTx.transactionHash = extrinsic.hash.toHex();
        scanResultTx.memo = memo;
        scanResultTx.src_address = from;
        scanResultTx.des_address = dest;
        scanResultTx.value = value;
        scanResultTx.storeman = storemanScAddr;
        const bValid = this._parseMemo(scanResultTx);
        if(!bValid) {
          return null;
        }
      }
    }catch (e) {
      log.error('Polka parsing memo type transaction got error: ', e)
    }
    return scanResultTx;
  }


  /**
   * Parse memo.
   * If it is a valid memo, then will update `scanResultTx` object and return true;
   * otherwise, will return false and keep `scanResultTx` unchanged.
   * @param scanResultTx
   * @return {boolean}
   * @private
   */
  _parseMemo(scanResultTx) {

    let memoData = scanResultTx.memo;
    let startIndex = 0;

    const memoParsed = parseMemo(memoData)

    if (memoParsed.memoType === MemoType.cross && scanResultTx.des_address === scanResultTx.storeman) {

      scanResultTx.event = this.crossInfo.EVENT.Lock.walletRapid[0];; // 表明这个Tx 是用户在 polka上完成了对 smg 的转账
      scanResultTx['args'] = {
        uniqueID: scanResultTx.transactionHash,
        value: scanResultTx.value,
        tokenPairID: memoParsed.tokenPairID,
        userAccount: '0x' + memoParsed.userAccount,
        tokenAccount: "0x0000000000000000000000000000000000000000",
        fee: memoParsed.networkFee
      }
    } else if (memoParsed.memoType === MemoType.smg && scanResultTx.src_address === scanResultTx.storeman) {
      scanResultTx.event = this.crossInfo.EVENT.Release.smgRapid[0];  // 这个与 moduleConfig.js 中的 crossInfoDict 中的 EVENT[Release][smgRapid] 中的 保持一致就行
      scanResultTx['args'] = {
        uniqueID: memoParsed.hashX,
        value: scanResultTx.value,
        tokenPairID: memoParsed.tokenPairID,
        userAccount: scanResultTx.des_address
      }
    } else if (memoParsed.memoType === MemoType.smgDebt  && scanResultTx.src_address === scanResultTx.storeman) {
      // TODO： to be implemented , then test and checking if bellow code  is workable
      scanResultTx.event = 'TransferAssetLogger';
      scanResultTx.destSmgAddr = scanResultTx.des_address;  // to address is: next storemanGroup
      scanResultTx['args'] = {
        uniqueID: scanResultTx.transactionHash,
        value: scanResultTx.value,
        srcSmgID: memoParsed.srcSmg
      }

      if(this.getLockAddressBySmgID(memoParsed.srcSmg) !== scanResultTx.src_address) { // add checking according to code review.
        this.log.warn("[PolkaChain_MemoMode] found invalid smg debt tx.")
        return false
      }

    }  else if (memoParsed.memoType === MemoType.smgProxy  && scanResultTx.src_address === scanResultTx.storeman) {
      // TODO： to be implemented , then test and checking if bellow code  is workable
      scanResultTx.isDelete = true;
      scanResultTx.event = 'smgProxyLogger';    //TODO: 在 BaseAgent 中处理 'smgProxyLogger' 时， 对 DOT 做特殊处理（参考现有 XRP 的 ）
      scanResultTx.destSmgAddr = scanResultTx.des_address;
      scanResultTx['args'] = {
        uniqueID: scanResultTx.transactionHash,
        value: scanResultTx.value,
        srcSmgID: memoParsed.srcSmg,
        timestamp: memoParsed.timestamp
      }

      if(this.getLockAddressBySmgID(memoParsed.srcSmg) !== scanResultTx.src_address) { // add checking according to code review.
        this.log.warn("[PolkaChain_MemoMode] found invalid smg proxy tx.")
        return false
      }

    } else {
      this.log.warn("[PolkaChain_MemoMode] parse memo invalid data")
      return false;
    }

    scanResultTx.smgID = this.getMyChainSmgID(scanResultTx.storeman);
    scanResultTx.smgPublicKey = this.getMyChainStoremanPK(scanResultTx.storeman);
    return true;
  }

  async scanBlock(from, to, sg) {
    const self = this

    await this.waitApiReady()
    const api = this.api

    const interesting_methods = ['batchAll'];
    for(let i = from; i < to; i++) {
      let blkTimestamp = 0;
      const resultPerBlock = {
        timestamp: null,
        blk_hash: blk_hash,
        blk_num: blockNum,
        matchedTxs:[]
      }
      const hash = await api.rpc.chain.getBlockHash(i)
      const block = await api.rpc.chain.getBlock(hash)
      block.block.extrinsics.forEach((extrinsic, index) => {
        const {  method: { args, method, section } } = extrinsic;
        log.info('method: ', method, "args: ", JSON.stringify(args), 'section: ', section)

        if(section === "timestamp" && method === "set") {
          blkTimestamp = args[0].toString();
          resultPerBlock.timestamp = parseInt(blkTimestamp);
        }
        if(interesting_methods.includes(method)) {
        }
        if (section === 'utility' && method === 'batchAll') {
          ret = self._scanMemoTx(extrinsic, index, storemanScAddr);
        }
      })
      log.info(`block ${i} ${hash} ${block}`)
    }
  }

  async getBalance(address) {
    await this.waitApiReady()

    const api = this.api
  
    // Retrieve the last timestamp
    const now = await api.query.timestamp.now()
  
    // Retrieve the account balance & nonce via the system module
    const { nonce, data: balance } = await api.query.system.account(address);
    console.log(`Now: ${now}: balance of ${balance.free} and a nonce of ${nonce}`);
    return Number(balance.free.toString());
  }
}

const dotChain = new DotChain(config[process.env.NETWORK_TYPE])
setTimeout(async () => {
  await dotChain.createApi()
}, 0)

module.exports = {
  longPubKeyToAddress,
  dotChain,
}