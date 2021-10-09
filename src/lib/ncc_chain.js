const configs = require('./configs-ncc')
const { getChain } = require('./web3_chains')
// Non-contract chains : btc, ltc, xrp, dot
class NccChain {
  constructor(config) {
    Object.assign(this, config)
  }

  getBlockNumber() {
    throw new Error(`getBlockNumber not implemented`)
  }

  loadStartBlockNumber() {
    throw new Error(`loadStartBlockNumber not implemented`)
  }

  scanMessages() {
    throw new Error('scanMessages not implemented')
  }

  async scanEvents(sgs, db) {
    const blockNumber = this.getBlockNumber()

    const from = this.loadStartBlockNumber()
    const to = blockNumber - this.safeBlockCount

    db.updateScan({chainType: this.chainType, blockNumber: next});

    if (from > to) {
      return []
    }

    const msgs = this.scanMessages(from, to, sgs)
    return msgs
  }
}

setTimeout(async () => {

}, 0)

module.exports = NccChain