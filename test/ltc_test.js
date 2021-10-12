const { pkToAddress, ltcChain,  LtcChain} = require('../src/lib/ltc')
const db = require('../src/lib/sqlite_db');
const ltcConfigs = require('../src/lib/configs-ncc').LTC;
const { getP2PKH, networks } = require('../src/lib/networks')

function testScan() {
  setTimeout(async () => {
    const sgs = db.getAllSga();
    const blockNumber = await ltcChain.getBlockNumber();
    const from = ltcChain.startBlockNumber
    const next = from + 3
    const msgs = await ltcChain.scanMessages(from, next)
    ltcChain.handleMessages(msgs, sgs, db, next)
  }, 0)
}

const gpk_1 = '0x60fc57b762f4f4c17c2fd6e8d093c4cd8f3e1ec431e6b508700160e66749ff7104b2e2fb7dad08e4eaca22dbf184ecede5ea24e7ec3b106905f1830a2a7f50b1'
const gpk_2 = '0x042089c439045b2cfd283bb986697af2f5122792b3f60960d8026b7ce071a9cf1365798130f76a8a4f2d390d21db4bfab87b7f465cc9db38972494fb1de67866'

function testPkToAddress() {
  let address = pkToAddress(gpk_1, 'testnet')
  console.log(`pkToAddress ${address}`)
  address = pkToAddress(gpk_2, 'testnet')
  console.log(`pkToAddress ${address}`)
  address = pkToAddress(gpk_1, 'mainnet')
  console.log(`pkToAddress ${address}`)
  address = pkToAddress(gpk_2, 'mainnet')
  console.log(`pkToAddress ${address}`)
}

const getAddress = () => {
  let address = getP2PKH(gpk_1, networks.litecoinTestnet)
  console.log(`getAddress ${address}`)
  address = getP2PKH(gpk_2, networks.litecoinTestnet)
  console.log(`getAddress ${address}`)
  address = getP2PKH(gpk_1, networks.litecoinMainnet)
  console.log(`getAddress ${address}`)
  address = getP2PKH(gpk_2, networks.litecoinMainnet)
  console.log(`getAddress ${address}`)
}

// const getAddress_2 = () => {
//   let address = getP2PKH_2(gpk_1, 'testnet')
//   console.log(`getAddress_2 ${address}`)
//   address = getP2PKH_2(gpk_2, 'testnet')
//   console.log(`getAddress_2 ${address}`)
//   address = getP2PKH_2(gpk_1, 'livenet')
//   console.log(`getAddress_2 ${address}`)
//   address = getP2PKH_2(gpk_2, 'livenet')
//   console.log(`getAddress_2 ${address}`)
// }

const getP2PKHAddress = () => {
  const b = new LtcChain(ltcConfigs, 'testnet')
  let address = b.getP2PKHAddress(gpk_1)
  console.log(`getP2PKHAddress ${address}`)
  address = b.getP2PKHAddress(gpk_2)
  console.log(`getP2PKHAddress ${address}`)

  const c = new LtcChain(ltcConfigs, 'mainnet')
  address = c.getP2PKHAddress(gpk_1)
  console.log(`getP2PKHAddress ${address}`)
  address = c.getP2PKHAddress(gpk_2)
  console.log(`getP2PKHAddress ${address}`)
  
}

setTimeout(async () => {
  // testPkToAddress()
  // getAddress()
  // getP2PKHAddress()

  await testScan()
}, 0)