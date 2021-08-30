const { Keyring, ApiPromise, WsProvider } = require('@polkadot/api');
// const { decodeAddress, encodeAddress } = require('@polkadot/keyring');

const _util = require("@polkadot/util");
const _utilCrypto = require("@polkadot/util-crypto");

const provider = new WsProvider(process.env.RPC_URL_DOT);
let api = null
setTimeout(async () => {
  api = await ApiPromise.create({ provider: provider });
}, 0)

// function pkToObj (pkStr) {
//   let result = toByteArray(pkStr)
//   console.log("pkToObj result: ", result);
//   return result;
// }

// // to Uint8Array Type
// const toByteArray = hexString =>
//   new Uint8Array(hexString.match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
  
// function publicKeyToAddress(publicKey){
//   let pkObj = publicKey;

//   if("string" === typeof publicKey) {
//       console.log("publicKeyToAddress() convert string type public-key to object ....");
//       pkObj = pkToObj(publicKey)
//   }

//   const raw = TYPE_ADDRESS["ecdsa"](pkObj);

//   const keyRing = new Keyring({type: 'ecdsa' });
//   const toSS58 = keyRing.encodeAddress;

//   return toSS58(raw);
// }

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

class DotChain {
  constructor(chainConfig) {

  }
}

module.exports = {
  longPubKeyToAddress,
  getBalance,
}