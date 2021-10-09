
const Sqlite3 = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { promisify, sleep } = require("./utils");

console.log(os.platform());
console.log(os.homedir());

class DB {
  constructor() {
    this.isInit = false;
    setTimeout(()=> {
      if (!this.isInit) {
        this.init();
      }
    }, 0);
  }

  init(filePath) {
    this.isInit = true;
    if (!fs.existsSync(path.resolve(__dirname, "../../db"))) {
      fs.mkdirSync(path.resolve(__dirname, "../../db"));
    }
    if (!filePath) {
      filePath = path.resolve(__dirname, "../../db/oracleRobot.db")
    }

    let db = null;
    if (!fs.existsSync(filePath)) {
      // db = new Sqlite3(filePath, {verbose: console.log});
      db = new Sqlite3(filePath);
      db.exec(`
        create table scan (
          chainType char(20) PRIMARY KEY NOT NULL,
          blockNumber integer
        );

        create table sga (
          groupId char(66) PRIMARY KEY NOT NULL,
          status integer,
          deposit char(100),
          chain1 integer,
          chain2 integer,
          curve1 integer,
          curve2 integer,
          gpk1 char(256),
          gpk2 char(256),
          startTime integer,
          endTime integer,

          updateTime integer
        );
      `);
      db.prepare(`insert into scan values (?, ?)`).run(process.env.CHAINTYPE_WAN, parseInt(process.env.SCAN_WAN_FROM) - 1);
    } else {
      db = new Sqlite3(filePath);
    }
    this.db = db;
  }

  getAllScan() {
    return this.db.prepare(`select * from scan`).all();
  }
  getScan(chainType) {
    return this.db.prepare(`select * from scan where chainType = ?`).get(chainType);
  }

  insertScanForce(item) {
    try {
      this.db.prepare(`insert into scan values (@chainType, @blockNumber)`).run(item);
    } catch (e) {
      if (e.code === "SQLITE_CONSTRAINT_PRIMARYKEY") {
        this.updateScan(item);
      } else {
        throw e;
      }
    }
  }

  insertScan(item) {
    this.db.prepare(`insert into scan values (@chainType, @blockNumber)`).run(item);
  }

  updateScan(item) {
    this.db.prepare(`update scan set blockNumber = @blockNumber where chainType = @chainType`).run(item);
  }

  insertDebt(item) {
    this.db.prepare(`insert into debt values (@groupId, @coinType, @isDebtClean, @totalSupply, @totalReceive, @lastReceiveTx)`).run(item);
  }

  updateDebt(item) {
    this.db.prepare(`update debt set isDebtClean = @isDebtClean, totalSupply = @totalSupply, totalReceive = @totalReceive, lastReceiveTx = @lastReceiveTx where groupId = @groupId, coinType=@coinType`).run(item);
  }

  getDebt(item) {
    return this.db.prepare(`select * from debt where groupId = @groupId, coinType=@coinType`).run(item);
  }

  getAllDebt() {
    return this.db.prepare(`select * from debt`).all();
  }

  insertMsg(item) {
    this.db.prepare(`insert into msg values (@groupId, @coinType, @receive, @tx)`).run(item);
  }

  getMsgs(item) {
    return this.db.prepare(`select * from msg where groupId = @groupId, coinType=@coinType`).run(item);
  }

  getAllUnCleanDebt() {
    return this.db.prepare(`select * from debt where isDebtClean == 0`).all();
  }

  getDebtsByGroupId(item) {
    return this.db.prepare(`select * from debt where groupId == @groupId`).run(item);
  }

  // store man group admin
  getAllSga() {
    return this.db.prepare(`select * from sga`).all();
  }
  getSga(id) {
    return this.db.prepare(`select * from sga where groupId = ?`).get(id);
  }

  getActiveSga() {
    return this.db.prepare(`select * from sga where status != 7 and status != 3`).all();
  }

  insertSga(item) {
    this.db.prepare(`insert into sga values (@groupId, @status, @deposit, @chain1, @chain2, @curve1, @curve2, @gpk1, @gpk2, @startTime, @endTime, @updateTime,@preGroupId,@workStart,@workDuration,@registerDuration)`).run(item);
  }

  updateSga(item) {
    this.db.prepare(`update sga set status = @status, deposit = @deposit, chain1 = @chain1, chain2 = @chain2, curve1 = @curve1, curve2 = @curve2, gpk1 = @gpk1, gpk2 = @gpk2, startTime = @startTime, endTime = @endTime, updateTime = @updateTime where groupId = @groupId`).run(item);
  }
  updateSgaReg(item) {
    this.db.prepare(`update sga set preGroupId = @preGroupId, workStart = @workStart, workDuration = @workDuration, registerDuration = @registerDuration where groupId = @groupId`).run(item);
  }

  close() {
    if (this.db) {
      const db = this.db;
      db.close((err) => {
        if (err) {
          return console.error(err.message);
        }
        console.log('close the database connection.');
      });
      this.db = null;
    }
  }
}

const db = new DB();

module.exports = db;