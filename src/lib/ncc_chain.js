const configs = require('./configs-ncc')
const { getChain } = require('./web3_chains')
const { default: BigNumber } = require('bignumber.js');
// Non-contract chains : btc, ltc, xrp, dot
class NccChain {
  constructor(config, network) {
    Object.assign(this, config)
    this.network = network
    this.coinUnit = new BigNumber(10).pow(config.decimals)
  }

  getBlockNumber() {
    throw new Error(`getBlockNumber not implemented`)
  }

  async scanMessages() {
    throw new Error('scanMessages not implemented')
  }

  handleMessages(msgs, sgs, db, next) {
    throw new Error('handleMessages not implemented')
  }

  getP2PKHAddress() {
    throw new Error(`getP2PKHAddress not implemented`)
  }
}

module.exports = NccChain