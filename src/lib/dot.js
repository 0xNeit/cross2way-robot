const { Keyring, ApiPromise, WsProvider } = require('@polkadot/api');
const _util = require("@polkadot/util");
const _utilCrypto = require("@polkadot/util-crypto");
// const { decodeAddress, encodeAddress } = require('@polkadot/keyring');
const dotConfigs = require('./configs-ncc').DOT
const NccChain = require('./ncc_chain')
const log = require('./log')
const crypto = require('crypto')

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
function pkToAddress(longPubKey, network = 'mainnet') {
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

function sha256(hexString) {
  let kBuf = Buffer.from(hexString.slice(2), 'hex');
  let hash = crypto.createHash("sha256").update(kBuf);
  return '0x' + hash.digest("hex");
}

function asciiToHex(asciiStr) {
  return asciiStr.match(/.{1,2}/g).reduce((acc,char) => acc + String.fromCharCode(parseInt(char, 16)),"");
}

function hexTrip0x(hex) {
  if (0 == hex.indexOf('0x')) {
    return hex.slice(2);
  }
  return hex;
}

const isBatchTxFailed = (blkEvents, index, api) => {
  let bFailed = true;
  const eventsPerTx = blkEvents
      .filter(({ phase }) => {
        return phase.isApplyExtrinsic &&
            phase.asApplyExtrinsic.eq(index)
      })
      .map(({ event }) => {

        // for 'batchAll' call:
        if(api.events.system.ExtrinsicSuccess.is(event)) {
          bFailed = false;
        }

        // for 'batch' call:
        // if(api.events.utility.BatchCompleted.is(event)) {
        //   bFailed = false;
        // }

        return `${event.section}.${event.method}`
      });

  // console.log("xx event: ", api.events.utility.BatchInterrupted);
  log.info(`tx events: ${eventsPerTx.join(', ') || 'no events'}`);
  return bFailed;
}

const filerSuccessTx = async (scannedTxs, api, blkHash) => {
  const blkEvents = await api.query.system.events.at(blkHash);

  return scannedTxs.filter(tx => {
    const bFailed = isBatchTxFailed(blkEvents, tx.indexInBlock, api);
    if(bFailed) {
      log.info(`Pokla scan discard failed tx: block: ${blkHash}, index: ${tx.indexInBlock}. tx detail:  ${JSON.stringify(tx)}`);
    }
    return !bFailed;
  })
}

const TYPE = {
  cross: 1,  //TODO: rename to 'UserLock'
  smg: 2,     //TODO: rename to 'SmgRelease'
  smgDebt: 5,
  smgProxy:6,
  Invalid: -1,
}

const MemoTypeLen = 2;
const TokenPairIDLen = 4;
const WanAccountLen = 40;
const TimeStampLen = 16;
const SmgIDLen = 64;

function parseMemo(memoData) {
  let result = {memoType: TYPE.Invalid};

  let memoType = memoData.substring(0, MemoTypeLen);
  memoType = parseInt(memoType);

  let startIndex = MemoTypeLen;

  if(memoType === TYPE.smgDebt){
    if(memoData.length !== 66) {
        return result
    }
    const srcSmg = '0x' + memoData.substr(startIndex);
    result = {memoType, srcSmg}
  }

  return result
}

// polka
class DotChain extends NccChain {
  constructor(configs, network) {
    const config = configs[network]
    super(config, network)

    setTimeout(() => {
      this.createApi()
    }, 0)
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
  
  getP2PKHAddress(gpk) {
    return pkToAddress(gpk, this.network)
  }

  scanMessages = async (from, to, sgs) => {
    if (from > to) {
      return null
    }

    log.info(`scanMessages ${this.chainType} from = ${from} to = ${to}`);

    const self = this;
    const api = this.api;

    await this.waitApiReady();

    for (let i = 0; i < sgs.length; i++) {
      sgs[i].sgAddress = this.getP2PKHAddress(sgs[i].gpk2)
    }

    const msgs = []

    for(let i = from; i <= to; i++) {
      const blockNum = i
      const hash = (await api.rpc.chain.getBlockHash(blockNum)).toString()
      const block = await api.rpc.chain.getBlock(hash)

      let blkTimestamp = 0;
      const resultPerBlock = {
        timestamp: null,
        blk_hash: hash,
        blk_num: blockNum,
        matchedTxs:[]
      }

      block.block.extrinsics.forEach((extrinsic, index) => {
        const {  method: { args, method, section } } = extrinsic;

        log.info('method: ', method, "args: ", JSON.stringify(args), 'section: ', section)

        if(section === "timestamp" && method === "set") {
          blkTimestamp = args[0].toString();
          resultPerBlock.timestamp = parseInt(blkTimestamp);
        }

        const interesting_methods = ['batchAll'];

        if(interesting_methods.includes(method)) {
          let ret

          if (section === 'utility' && method === 'batchAll') {
            ret = self._scanMemoTx(extrinsic, index, sgs);
            if (ret) {
              if (['TransferAssetLogger'].includes(ret.event)) {
                ret.args['xHash'] = sha256(ret.transactionHash + blockNum + index);  // do hash for string: transactionHash +  blockNum + index
                ret.args.uniqueID = ret.args['xHash'];
                ret.hashX = ret.args['xHash'];
              }
              ret.indexInBlock = index;
              ret.blockNumber = blockNum;
              ret.blockHash = hash;
              resultPerBlock.matchedTxs.push(ret)
            }
          }
        }
      })
      log.info(`block ${i} ${hash} ${block}`)
    }
  }


  handleMessages = (msgs, sgs, db, next) => {
    if (!msgs) {
      return
    }

    const items = []
    msgs.forEach(msg => {
      const { msgType, fromGroupId, toAddress, tx, value } = msg
      if (msgType === 'DebtTransfer') {
        const toSg = sgs.find(sg => (sg.preGroupId === fromGroupId))
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

   _scanMemoTx(extrinsic, index, sgs) {
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
              call.args && call.args.dest) {
            const sg = sgs.find(sg => sg.sgAddress === from)
            if (sg) {
              bMatched = true
              dest = call.args.dest.id;
              value = call.args.value;
            } 
          }

          if(callInfo.section === 'system' &&
              callInfo.method === 'remark' &&
              call.args && (call.args.remark || call.args._remark)) {
            memo = asciiToHex(hexTrip0x(call.args._remark ? call.args._remark : call.args.remark));
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
        scanResultTx.storeman = from;
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

  _parseMemo(scanResultTx) {
    let memoData = scanResultTx.memo;

    const memoParsed = parseMemo(memoData)

    if (memoParsed.memoType === TYPE.smgDebt  && scanResultTx.src_address === scanResultTx.storeman) {
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

    }

    scanResultTx.smgID = this.getMyChainSmgID(scanResultTx.storeman);
    scanResultTx.smgPublicKey = this.getMyChainStoremanPK(scanResultTx.storeman);
    return true;
  }
}

const dotChain = new DotChain(dotConfigs, process.env.NETWORK_TYPE)

module.exports = {
  pkToAddress,
  dotChain,
}