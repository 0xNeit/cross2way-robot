const { pkToAddress, chain} = require('../src/lib/dot')
const db = require('../src/lib/sqlite_db');

function getSgs() {
  const sg = db.getSga('0x000000000000000000000000000000000000000000000000006465765f303430');
  const sg1 = db.getSga('0x000000000000000000000000000000000000000000000000006465765f303431');
  const sgs = [sg, sg1]
  return sgs
}
function testScan() {
  setTimeout(async () => {
    const sgs = getSgs()
    const blockNumber = await chain.getBlockNumber();
    const from = chain.startBlockNumber
    const next = from + 2
    const msgs = await chain.scanMessages(from, next, sgs)
    chain.handleMessages(msgs, db, next)
  }, 0)
}

function testGetAddressFromSmgId() {
  const sgs = getSgs()
  const curSg = sgs[1]
  const address = chain.getAddressFromSmgId(curSg.groupId, sgs)
  
  console.log(`${curSg.groupId} address is ${address}`)
  return address
}


setTimeout(async () => {
  await testScan()
  // testGetAddressFromSmgId()
}, 10)