const { Keyring, ApiPromise, WsProvider } = require('@polkadot/api');
// const { decodeAddress, encodeAddress } = require('@polkadot/keyring');
const config = require('./configs-other').DOT

const _util = require("@polkadot/util");
const _utilCrypto = require("@polkadot/util-crypto");

const provider = new WsProvider(process.env.RPC_URL_DOT);
let api = null
setTimeout(async () => {
  api = await ApiPromise.create({ provider: provider });
}, 0)


function longPubKeyToAddress(longPubKey, ss58Format = 42) {
  longPubKey = '0x04'+longPubKey.slice(2);
  const tmp = _util.hexToU8a(longPubKey);
  const pubKeyCompress = _utilCrypto.secp256k1Compress(tmp);
  const hash = _utilCrypto.blake2AsU8a(pubKeyCompress);
  const keyring = new Keyring({ type: 'ecdsa', ss58Format: ss58Format });
  const address = keyring.encodeAddress(hash);
  return address
}

async function getBalance(address) {
  // Wait until we are ready and connected
  await api.isReady;  //Ref: https://polkadot.js.org/docs/api/start/create/

  // Retrieve the last timestamp
  const now = await api.query.timestamp.now();

  // Retrieve the account balance & nonce via the system module
  const { nonce, data: balance } = await api.query.system.account(address);
  console.log(`Now: ${now}: balance of ${balance.free} and a nonce of ${nonce}`);
  return Number(balance.free.toString());
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
    const provider = new WsProvider(chainConfig.rpc)
    Object.assign(this, chainConfig)
  }

  async createApi() {
    const api = await ApiPromise.create({ provider })
    this.api = api
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

    await this.api.isReady
    return this.api
  }


  async getBlockNumber() {
    const lastHeader = await this.api.rpc.chain.getHeader()
    const blockNumber = lastHeader.number.toNumber()
    return blockNumber
  }

  async scanBlock(from, to, sg) {
    for(let i = fromBlk; i < toBlk; i++) {
    }
  }
}

setTimeout(async () => {
  const chain = new DotChain(config[process.env.NETWORK_TYPE])
  await chain.createApi()
  // Retrieve the chain name
  // const chainName = await api.rpc.system.chain()

  // Retrieve the latest header
  const num = await chain.getBlockNumber()

  // Log the information
  console.log(` last block #${num} `)
}, 0)

module.exports = {
  longPubKeyToAddress,
  getBalance,
}