const db = require('../src/lib/sqlite_db')
const BigNumber = require('bignumber.js')

const testInsertDebt = () => {
  const data = {
    groupId : '0x1',
    chainType : 'btc',
    isDebtClean : 1,
    totalSupply : '111',
    totalReceive : '8208947716449',
    lastReceiveTx : 'aa',
  }
  db.insertDebt(data)
  // const data2 = {
  //   groupId : '0x2',
  //   chainType : 'btc',
  // }
  // db.insertDebt(data2)
}
const testInsertMsg = () => {
  const data = {
    groupId : '0x1',
    chainType : 'btc',
    receive : '8208947716449',
    tx : 'aa',
  }
  db.insertMsg(data)
  // const data2 = {
  //   groupId : '0x2',
  //   chainType : 'btc',
  // }
  // db.insertDebt(data2)
}

const testUpdateDebt = () => {
  const data = {
    groupId : '0x1',
    chainType : 'btc',
    isDebtClean : null,
    totalSupply : null,
    totalReceive : null,
    lastReceiveTx : 'aa',
  }
  db.updateDebt(data)
  const d2 = db.getDebt(data)
  if (d2.totalSupply === null) {
    console.log('total supply is null')
  }
}

const testBigNumber = () => {
  const a = '5'
  const b = '7'
  const c = BigNumber(a).plus(b)
  console.log(c.toString(10))
}

setTimeout(() => {
  testInsertMsg()
  // testUpdateDebt()
  // testBigNumber()
}, 0)