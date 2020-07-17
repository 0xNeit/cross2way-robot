const WanTx = require('wanchainjs-tx');
const crypto = require('crypto');
const secp256k1 = require('secp256k1');
const log = require('./log');
const util = require('ethereumjs-util');

const maxGas = parseInt(process.env.GASLIMIT);

function signTx(gasLimit, nonce, data, prvKey, value, to) {
  const gas = gasLimit > maxGas ? maxGas : gasLimit;

  const txParams = {
    Txtype: 0x01,
    nonce: nonce,
    gasPrice: process.env.GASPRICE,
    gasLimit: gas,
    to: to,
    value: value,
    data: data,
    chainId: parseInt(process.env.CHAIN_ID, 16),
  };
  log.info(JSON.stringify(txParams));
  const privateKey = Buffer.from(prvKey, 'hex');

  const tx = new WanTx(txParams);
  tx.sign(privateKey);
  const serializedTx = tx.serialize();
  return '0x' + serializedTx.toString('hex');
}

function generateKeyPair() {
  const randomBuf = crypto.randomBytes(32);
  if (secp256k1.privateKeyVerify(randomBuf)) {
    const address = util.privateToAddress(randomBuf);
    return { 
      privateKey: util.bufferToHex(randomBuf, 'hex').replace(/^0x/i,''),
      address: util.bufferToHex(address,'hex')
    };
  } else {
    return generateKeyPair();
  }
}

module.exports = {
  signTx,
  generateKeyPair
};
