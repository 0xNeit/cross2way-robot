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

      block.block.extrinsics.forEach((extrinsic, index) => {
        const {  method: { args, method, section } } = extrinsic;

        if (section === 'utility' && method === 'batchAll') {
          const { isSigned, signer } = extrinsic

          if (!isSigned || !signer) {
            return
          }

          const from = signer.toString()

          const batch_Args = JSON.parse(JSON.stringify(args))

          if(batch_Args.length !== 1 || batch_Args[0].length != 2 ) {
            return
          }

          const msg = {}
          
          msg.tx = extrinsic.hash.toHex()

          batch_Args[0].forEach( call => {
            const callInfo = api.findCall(call.callIndex);
            
            if(callInfo.section === 'balances' && callInfo.method === 'transferKeepAlive' && call.args && call.args.dest) {
              // TODO: check toAddress is next storeManGroup's address
              // msg.toAddress = call.args.dest.id
              msg.toGroupId = getStoreManGroupGpk(call.args.dest.id)
              msg.value = call.args.value
            } else if (callInfo.section === 'system' && callInfo.method === 'remark' && call.args && (call.args.remark || call.args._remark)) {
              const memoData = asciiToHex(hexTrip0x(call.args._remark ? call.args._remark : call.args.remark))
              const memoParsed = parseMemo(memoData)

              // TODO: check from is current storeManGroup's address
              if (memoParsed.memoType === TYPE.smgDebt  && getStoreManAddress(memoParsed.srcSmg) === from) {
                msg.groupId = memoParsed.srcSmg
              }
            }
          })

          if ( msg.tx && msg.toAddress && msg.groupId && msg.value ) {
            msgs.push(msg)
          }
        }
      })
      log.info(`block ${i} ${hash} ${block}`)
    }

    return msgs
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
}

const dotChain = new DotChain(dotConfigs, process.env.NETWORK_TYPE)

module.exports = {
  pkToAddress,
  dotChain,
}