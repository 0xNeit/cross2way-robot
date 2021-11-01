const assert = require("assert");
const db = require('../src/lib/sqlite_db');
const fs = require('fs');
const path = require('path');
const filePath = path.resolve(__dirname, "../db/robot_test.db");
if (fs.existsSync(filePath)) {
  fs.unlinkSync(filePath);
}
db.init(filePath);

before(function () {
  this.timeout(16000);
  console.log("init db test");
});

after(function () {
  db.close();
  console.log("end db test");
});

describe("sqlite3 test", function () {
  const chainType = 'WAN_test';
  this.timeout(16000);

  it('insert scan', function() {
    db.insertScan({chainType: chainType, blockNumber: 333});
    const a = db.getScan(chainType);
    assert.equal(a.blockNumber, 333)
    assert.equal(a.chainType, chainType)
    const b = db.getAllScan();
    console.log(JSON.stringify(b));
  })

  it('update scan', function() {
    db.updateScan({chainType: chainType, blockNumber: 111});
    const b = db.getScan(chainType);
    assert.equal(b.blockNumber, 111);
  })

  it('tx batch update', function() {
    const tx = db.db.transaction(function() {
      db.updateScan({chainType: chainType, blockNumber: 111});
      let s1 = db.getScan(chainType);
      assert.equal(s1.blockNumber, 111);
      db.updateScan({chainType: chainType, blockNumber: 222});
      let s2 = db.getScan(chainType);
      assert.equal(s2.blockNumber, 222);
      db.updateScan({chainType: chainType, blockNumber: 333});
      let s3 = db.getScan(chainType);
      assert.equal(s3.blockNumber, 333);
    });
    tx();
  })

  it('sga', function() {
    const sga_config = {
      groupId: "0x1111",
      status: 1,
      deposit: "12345566778889",
      chain1: 3,
      chain2: 4,
      curve1: 5,
      curve2: 6,
      gpk1: "0x2222",
      gpk2: "0xaaaa",
      startTime: 7,
      endTime: 8,
      updateTime: 9
    };

    db.insertSga(sga_config);
    let config = db.getSga("0x1111");
    assert.deepEqual(config, sga_config);
    // assert.equal(config.groupId, "0x1111");
    // assert.equal(config.status, 1);
    // assert.equal(config.deposit, "12345566778889");
    const configs = db.getAllSga();
    console.log(JSON.stringify(configs));

    const sga_config_new = {
      groupId: "0x1111",
      status: 11,
      deposit: "112345566778889",
      chain1: 31,
      chain2: 41,
      curve1: 51,
      curve2: 61,
      gpk1: "0x12222",
      gpk2: "0x1aaaa",
      startTime: 71,
      endTime: 81,
      updateTime: 91
    }
    db.insertSgaForce(sga_config_new);
    // db.updateSga(sga_config_new);
    config = db.getSga("0x1111");
    assert.deepEqual(config, sga_config_new);

    const sga_config2 = {
      groupId: "0x1112",
      status: 7,
      deposit: "12345566778889",
      chain1: 3,
      chain2: 4,
      curve1: 5,
      curve2: 6,
      gpk1: "0x2222",
      gpk2: "0xaaaa",
      startTime: 7,
      endTime: 8,
      updateTime: 9
    };
    db.insertSga(sga_config2);
    const all = db.getAllSga();
    const actives = db.getActiveSga();

    assert.equal(all.length, actives.length + 1)

    // const sga_config_new2 = {
    //   groupId: "0x1111",
    // }
    // db.insertSgaForce(sga_config_new2);
    // config = db.getSga("0x1111");
    // assert.deepEqual(config, sga_config_new2);
  });
});

discribe("debt", function() {
  
})
