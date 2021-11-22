const { Keyring, ApiPromise, WsProvider } = require('@polkadot/api');
const _util = require("@polkadot/util");
const _utilCrypto = require("@polkadot/util-crypto");
// const { decodeAddress, encodeAddress } = require('@polkadot/keyring');
const dotConfigs = require('./configs-ncc').DOT
const NccChain = require('./ncc_chain')
const log = require('./log')
const crypto = require('crypto')
const BigNumber = require('bignumber.js')

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
    const api = await ApiPromise.create({ provider })

    // TODO log
    api.on('connected', () => {
        console.log(' Polka API has been connected to the endpoint');
    });

    api.on('ready', () => {
        console.log(' Polka API ready...');
    });

    api.on('disconnected', () => {
        console.log(' Polka API has been disconnected from the endpoint');
    });

    api.on('error', (error) => {
        console.log(' Polka API got an error: ', error);
    });

    this.api = await api.isReady;


    this.api.isTestNet = () => RPC_URL === TEST_NET
  }

  async waitApiReady() {
    while (!this.api ) {
      await sleep(100)
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
    return balance.free.toString(10)
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
      if (!sgs[i].gpk2 || sgs[i].gpk2.length < 130) {
        continue
      }
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

          const msg = {
            chainType: this.chainType,
            tx: extrinsic.hash.toHex()
          }
          
          let toAddress = null

          batch_Args[0].forEach( call => {
            const callInfo = api.findCall(call.callIndex);
            
            if(callInfo.section === 'balances' && callInfo.method === 'transferKeepAlive' && call.args && call.args.dest) {
              toAddress = call.args.dest.id
              msg.value = BigNumber(call.args.value).toString(10)
            } else if (callInfo.section === 'system' && callInfo.method === 'remark' && call.args && (call.args.remark || call.args._remark)) {
              const memoData = asciiToHex(hexTrip0x(call.args._remark ? call.args._remark : call.args.remark))
              const memoParsed = parseMemo(memoData)

              const groupId = memoParsed.srcSmg
              const fromAddress = this.getAddressFromSmgId(groupId, sgs)
              if (memoParsed.memoType === TYPE.smgDebt  && fromAddress && fromAddress === from) {
                msg.groupId = memoParsed.srcSmg
              }
            }
          })

          if (msg.groupId && msg.value && toAddress) {
            const toSmgInfo = this.getSmgInfoFromPreSmgId(msg.groupId, sgs)
            if (toSmgInfo && toSmgInfo.address === toAddress) {
              msgs.push(msg)

              log.info(`from = ${msg.groupId}, to = ${toSmgInfo.groupId}, toAddress = ${toSmgInfo.address}, value = ${msg.value}, tx = ${msg.tx}`)
            } else {
              log.error(`bad debt tx! chainType ${msg.chainType}, tx = ${msg.tx} value = ${msg.value}, from = ${msg.groupId} to = ${toSmgInfo.groupId}, toSgAddress ${toSmgInfo.address} != toAddress ${toAddress}`)
            }
          }
        }
      })
    }

    return msgs
  }
}

const chain = new DotChain(dotConfigs, process.env.NETWORK_TYPE)

module.exports = {
  pkToAddress,
  chain,
}