const { gNccChains, gNccChainTypes } = require('../src/lib/ncc_chains')

const gpk = '0x42bc3d9d979383c2d3fc9fb28cbc6c83b5d1afdd20d5eab40e6c95f2c20ba4e4bce0d38e3956986a70e50193a5a10debd6af9c8f867089ee71a069b37f16a52e'

async function eachRun(calls) {
  for (let i = 0; i < gNccChainTypes.length; i++) {
    const chainType = gNccChainTypes[i]
    const chain = gNccChains[chainType].chain
    for(let j = 0; j < calls.length; j++) {
      await calls[j](chain)
    }
  }
}

async function testBlockNumber(chain) {
  let blockNumber = chain.startBlockNumber
  if ( blockNumber ) {
    blockNumber = await chain.getBlockNumber()
  }
  console.log(`${chain.chainType} ${blockNumber}`)
}

async function testBalance(chain) {
  const address = await chain.getP2PKHAddress(gpk)
  const balance = await chain.getBalance(address)
  console.log(`${chain.chainType} ${balance}`)
  console.log(`${chain.chainType} ${chain.toEther(balance)}`)
}

setTimeout(async () => {
  await eachRun([testBalance])
}, 0)