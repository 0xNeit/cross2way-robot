const { pkToAddress, dotChain} = require('../src/lib/dot')
const db = require('../src/lib/sqlite_db');

function testScan() {
  setTimeout(async () => {
    const sg = db.getSga('0x000000000000000000000000000000000000000000000000006465765f303430');
    const sg1 = db.getSga('0x000000000000000000000000000000000000000000000000006465765f303431');
    const sgs = [sg, sg1]
    const blockNumber = await dotChain.getBlockNumber();
    const from = dotChain.startBlockNumber
    const next = blockNumber
    const msgs = await dotChain.scanMessages(from, next, sgs)
    dotChain.handleMessages(msgs, sgs, db, next)
  }, 0)
}

setTimeout(async () => {
  await testScan()
}, 10)