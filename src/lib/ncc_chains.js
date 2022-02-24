const nccConfigs = require('./configs-ncc')

let gNccChains = {}
let gNccChainTypes = null
const getNccChains = () => {
  gNccChainTypes = Object.keys(nccConfigs)
  gNccChainTypes.forEach(chainType => {
    // btc, xrp, ltc, doge,
    const nccChain = require('./' + chainType.toLowerCase())
    gNccChains[chainType] = nccChain
  })
}

getNccChains()

module.exports = {
  gNccChains,
  gNccChainTypes
}