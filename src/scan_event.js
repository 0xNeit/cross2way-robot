const log = require('./lib/log');
const db = require('./lib/sqlite_db');
const logAndSendMail = require('./lib/email');

class ScanEvent {
  constructor(contract, eventName, chainType, step, uncertainBlockCount, delay) {
    this.contract = contract;
    this.eventName = eventName;
    this.chainType = chainType;
    this.step = step;
    this.uncertainBlockCount = uncertainBlockCount;
    this.delay = delay;
    this.eventHandlers = {};

    this.bScanning = false;
    this.lastException = null;
  }

  static eventHandlers = {};
  static parseRegisterStartEvent(events, next) {
    for (let i = 0; i < events.length; i++) {
      const event = events[i];
      const config = {
        groupId: event.returnValues.groupId,
        status: 0,
        deposit: "0",
        chain1: 0,
        chain2: 0,
        curve1: 0,
        curve2: 0,
        gpk1: "0",
        gpk2: "0",
        startTime: 0,
        endTime: 0,
        updateTime: 0,
        preGroupId: event.returnValues.preGroupId,
        workStart: event.returnValues.workStart,
        workDuration: event.returnValues.workDuration,
        registerDuration: event.returnValues.registerDuration,
      };
      const sga = db.getSga(event.returnValues.groupId);
      if (!sga) {
        db.insertSga(config);
      } else {
        if (!sga.preGroupId) {
          db.updateSgaReg({
            groupId: event.returnValues.groupId,
            preGroupId: event.returnValues.preGroupId,
            workStart: event.returnValues.workStart,
            workDuration: event.returnValues.workDuration,
            registerDuration: event.returnValues.registerDuration,
          })
        }
      }
    }
  }

  async doScan(from, step, to) {
    console.log(`doScan ${this.chainType} from  = ${from}, step = ${step}, to = ${to}`);
    let next = from + step;
    if (next > to) {
      next = to;
    }
    log.info(`begin scan from=${from}, to=${next}`);
  
    const events = await this.contract.core.getPastEvents(this.contract.address, from, next, this.contract.contract, this.eventName);
    const transaction = db.db.transaction(ScanEvent.eventHandlers[this.eventName]);
    transaction(events, next);
    db.updateScan({chainType: this.chainType, blockNumber: next});
  
    if (next < to) {
      setTimeout( async () => {
        await this.doScan(next + 1, step, to); 
      }, 0);
    } else {
      this.lastException = null;
      this.bScanning = false;
    }
  }
  
  async scanNewStoremanGroup() {
    const from = db.getScan(this.chainType).blockNumber + 1;
    const step = this.step;
    const to = await this.contract.core.getBlockNumber() - this.uncertainBlockCount;
  
    if (from > to) {
      this.bScanning = false;
      log.info(`scan same block! ${to}`)
      return;
    }
  
    log.info(`scan from=${from}, to=${to}`);
    await this.doScan(from, step, to);
  }

  async scanStoremanGroup(from, to, step) {
    log.info(`scan from=${from}, to=${to}`);
    if (from > to) {
      return
    }
    await this.doScan(from, step, to);
  }
  
  // scan to blockNumber = current - SCAN_UNCERTAIN_BLOCK, 
  // scanEvent(chainContract, eventName, chainKey) {
  scanEvent() {
    // if already in scanning, return
    if (this.bScanning) {
      log.info(`chainKey = ${this.chainType}, scanning = ${this.bScanning}`);
      return;
    }
    this.bScanning = true;

    // post an event begin to scan
    setTimeout(async () => {
      try {
        // await scanNewStoremanGroup(chainContract, eventName);
        await this.scanNewStoremanGroup();
      } catch (e) {
        if (this.lastException !== e) {
          this.lastException = e;
          await logAndSendMail("scanNewStoremanGroup exception", e instanceof Error ? e.stack : e);
        }
        this.bScanning = false;
      }
    }, this.delay);
  }
}

ScanEvent.eventHandlers[process.env.REGISTER_START_EVENT] = ScanEvent.parseRegisterStartEvent;


// setTimeout(async () => {
//   await scanNewStoremanGroup();
// }, 0)

// process.on('unhandledRejection', (err) => {
//   // logAndSendMail('unhandled exception', `${err}`, true);
//   log.error(err);
//   bScanning = false;
// });

// process.on('beforeExit', (code) => {})
// process.on('exit', (code) => {})
// process.on('SIGINT', function() {});

// module.exports = scanEvent;

module.exports = ScanEvent;
