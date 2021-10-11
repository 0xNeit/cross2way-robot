const { btcChain, pkToAddress } = require('../src/lib/btc')
const db = require('../src/lib/sqlite_db');

function testScan() {
  setTimeout(async () => {
    const sgs = db.getAllSga();
    const blockNumber = await btcChain.getBlockNumber();
    const from = 2063995 + 1
    const next = from + 3
    const msgs = await btcChain.scanMessages(from, next)
    btcChain.handleMessages(msgs, sgs, db, next)
  }, 0)
}

function testPkToAddress() {
  pkToAddress('0x60fc57b762f4f4c17c2fd6e8d093c4cd8f3e1ec431e6b508700160e66749ff7104b2e2fb7dad08e4eaca22dbf184ecede5ea24e7ec3b106905f1830a2a7f50b1', 'testnet')
  pkToAddress('0x042089c439045b2cfd283bb986697af2f5122792b3f60960d8026b7ce071a9cf1365798130f76a8a4f2d390d21db4bfab87b7f465cc9db38972494fb1de67866', 'testnet')
}

setTimeout(async () => {
  await testScan()
}, 10)
