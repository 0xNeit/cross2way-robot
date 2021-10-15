const { pkToAddress, chain} = require('../src/lib/xrp')
const db = require('../src/lib/sqlite_db');

function testScan() {
  setTimeout(async () => {
    const sg = db.getSga('0x000000000000000000000000000000000000000000000000006465765f303430');
    const sg2 = db.getSga('0x000000000000000000000000000000000000000000000000006465765f303431');
    const sgs = [sg, sg2]
    const blockNumber = await chain.getBlockNumber();
    const from = chain.startBlockNumber
    const next = blockNumber
    const msgs = await chain.scanMessages(from, next, sgs)
    chain.handleMessages(msgs, db, next)
  }, 0)
}

setTimeout(async () => {
  await testScan()
}, 10)