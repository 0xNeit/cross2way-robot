const EthTx = require('ethereumjs-tx');
const log = require('./log');
const { web3, privateToAddress } = require('./utils');

class ChainHelper {
  constructor(chainConfig) {
    this.maxGas = chainConfig.gasLimit
    this.maxGasPrice = chainConfig.gasPrice
    this.chainId = chainConfig.chainId
    this.signTx = this.signTx.bind(this)
  }

  signTx = async (gasLimit, nonce, data, prvKey, value, to, _gasPrice) => {
    const gas = gasLimit > this.maxGas ? this.maxGas : gasLimit;
    const gasPrice = _gasPrice > this.maxGasPrice ? this.maxGasPrice : _gasPrice;

    const txParams = {
      nonce: web3.utils.toHex(nonce),
      gasPrice: gasPrice,
      gasLimit: web3.utils.toHex(gas),
      to: to,
      value: value,
      data: data,
      chainId: web3.utils.toHex(this.chainId),
    };
    log.info(JSON.stringify({...txParams, from: privateToAddress(prvKey)}));
    const privateKey = Buffer.from(prvKey, 'hex');

    const tx = new EthTx(txParams);
    tx.sign(privateKey);
    const serializedTx = tx.serialize();
    return '0x' + serializedTx.toString('hex');
  }
}

module.exports = {
  ChainHelper
};
