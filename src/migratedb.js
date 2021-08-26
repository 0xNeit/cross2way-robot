const db = require('./lib/sqlite_db')
const ScanEvent = require('./scan_event');
const { getChain } = require('./lib/web3_chains')
const otherChainsConfig = require('./lib/configs-other')

async function v0Tov1() {
  try {
    // add btc, ltc, xrp, dot, scan start position
    const otherChains = Object.keys(otherChainsConfig)
    otherChains.forEach(chain => {
      db.db.prepare(`insert into scan values (@chainType, @blockNumber)`).run({
        chainType: chain,
        blockNumber: otherChainsConfig[chain][process.env.NETWORK_TYPE].startBlockNumber
      });
    })

    // add preGroupId for old records in table sga
    db.db.exec(`alter table sga add column preGroupId char(66);`)
    db.db.exec(`alter table sga add column workStart integer;`)
    db.db.exec(`alter table sga add column workDuration integer;`)
    db.db.exec(`alter table sga add column registerDuration integer;`)
  
    const chainWan = getChain('wanchain', process.env.NETWORK_TYPE);
    const sgaWan = chainWan.loadContract('StoremanGroupDelegate')
    const scanInst = new ScanEvent(
      sgaWan,
      process.env.REGISTER_START_EVENT,
      process.env.CHAINTYPE_WAN,
    );

    const blockNumber = await chainWan.getBlockNumber()
    const from = parseInt(process.env.SCAN_WAN_FROM)
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