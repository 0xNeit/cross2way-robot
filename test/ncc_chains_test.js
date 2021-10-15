const { gNccChains, gNccChainTypes } = require('../src/lib/ncc_chains')

setTimeout(async () => {
  for (let i = 0; i < gNccChainTypes.length; i++) {
    const chainType = gNccChainTypes[i]
    const chain = gNccChains[chainType].chain
    let blockNumber = chain.startBlockNumber
    if ( blockNumber ) {
      blockNumber = await chain.getBlockNumber()
    }
    console.log(`${chainType} ${blockNumber}`)
  }
}, 0)