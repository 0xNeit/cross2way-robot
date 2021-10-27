const db = require('./lib/sqlite_db')
const ScanEvent = require('./scan_event');
const { getChain } = require('./lib/web3_chains')
const { gNccChains } = require('./lib/ncc_chains')

async function v0Tov1() {
  try {
    // create msg table
    // storeManGroupId, token, totalSupply, totalReceive
    db.db.exec(`
      create table msg (
        groupId char(66) NOT NULL,
        chainType char(20) NOT NULL,
        receive char(80) NOT NULL,
        tx char(128) NOT NULL
      );
    `)
    // create debt table
    // storeManGroupId, token, totalSupply, totalReceive
    db.db.exec(`
      create table debt (
        groupId char(66) NOT NULL,
        chainType char(20) NOT NULL,
        isDebtClean int,
        totalSupply char(80),
        totalReceive char(80),
        lastReceiveTx char(128)
      );
    `)

    // add btc, ltc, xrp, dot, scan start position
    const chainTypes = Object.keys(gNccChains)
    for (let i = 0; i < chainTypes.length; i++) {
      const chainType = chainTypes[i]
      const chain = gNccChains[chainType].chain
      let blockNumber = chain.startBlockNumber
      if ( !blockNumber ) {
        blockNumber = await chain.getBlockNumber() - chain.safeBlockCount
      }

      blockNumber = blockNumber - 1
      db.db.prepare(`insert into scan values (@chainType, @blockNumber)`).run({
        chainType,
        blockNumber
      });
    }

    // add preGroupId for old records in table sga
    db.db.exec(`alter table sga add column preGroupId char(66);`)
    db.db.exec(`alter table sga add column workStart integer;`)
    db.db.exec(`alter table sga add column workDuration integer;`)
    db.db.exec(`alter table sga add column registerDuration integer;`)
  
    // update sga fields (preGroupId, workStart, workDuration, registerDuration) info 
    const chainWan = getChain('wanchain', process.env.NETWORK_TYPE);
    const sgaWan = chainWan.loadContract('StoremanGroupDelegate')
    const scanInst = new ScanEvent(
      sgaWan,
      process.env.REGISTER_START_EVENT,
      process.env.CHAINTYPE_WAN,
    );

    const blockNumber = await chainWan.getBlockNumber()
    const from = parseInt(process.env.SCAN_WAN_FROM) - 1
    const to = blockNumber - parseInt(process.env.SCAN_UNCERTAIN_BLOCK)
    const step = parseInt(process.env.SCAN_STEP)
    await scanInst.scanStoremanGroup(from, to, step);
  } catch (e) {
    console.error(`migrate from v0 to v1 failed: ${e}`)
  }
}

setTimeout(async () => {
  await v0Tov1()
}, 10)