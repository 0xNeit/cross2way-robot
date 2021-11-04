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

async function testBalance() {
  let balance = await chain.getBalance('ryCVQhoU2BJ6hEDwgtCqbwQvkDzkiepAC')
  console.log(balance)

  const sg = db.getSga('0x000000000000000000000000000000000000000000746573746e65745f303033')
  const address = chain.getP2PKHAddress(sg.gpk2)
  console.log(address)
  balance = await chain.getBalance(address)
  console.log(balance)
}

setTimeout(async () => {
  await testBalance()
}, 10)