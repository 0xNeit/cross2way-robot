const { getChain, getChains } = require("../src/lib/web3_chains")
const { web3 } = require('../src/lib/utils')

const chainWan = getChain('wanchain', 'testnet');
const sgaWan = chainWan.loadContract('StoremanGroupDelegate')

const eventsTopic = [
  // event StoremanGroupUnregisterEvent(bytes32 indexed groupId);
  web3.utils.keccak256('StoremanGroupUnregisterEvent(bytes32)').toString('hex'),

  // event StoremanGroupDismissedEvent(bytes32 indexed groupId, uint dismissTime);
  web3.utils.keccak256('StoremanGroupDismissedEvent(bytes32,uint256)').toString('hex'),

  // event StoremanGroupSetGpkEvent(bytes32 indexed groupId);
  web3.utils.keccak256('StoremanGroupSetGpkEvent(bytes32)').toString('hex'),

  // event incentiveEvent(bytes32 indexed groupId, address indexed wkAddr, bool indexed finished, uint256 from, uint256 end)
  web3.utils.keccak256('incentiveEvent(bytes32,address,bool,uint256,uint256)').toString('hex'),
]

console.log(eventsTopic)

const testLogByTopic = async () => {
  console.log('testLogByTopic begin')
  const result = await chainWan.getPastLogs({
    address: sgaWan.address,
    from: 14932824,
    to: 15042824,
    // topics: eventsTopic[3],
  })
  // {
  //   address: "0xaA5A0f7F99FA841F410aafD97E8C435c75c22821",
  //   topics: [
  //     "0x87307a7786524b1cbccc920b1eedb7a7e1ee2f85a065e35043c9c8b5ced7e755",
  //     "0x000000000000000000000000000000000000000000000000006465765f303330",
  //     "0x0000000000000000000000003664bd95e0e0178e720e2190df899ad12c5416e7",
  //     "0x0000000000000000000000000000000000000000000000000000000000000001",
  //   ],
  //   data: "0x000000000000000000000000000000000000000000000000000000000000499c000000000000000000000000000000000000000000000000000000000000499c",
  //   blockNumber: 14936735,
  //   transactionHash: "0x5f2341c448582f67355a781d792f2411db877917ca663ff35b6c22c231a761c1",
  //   transactionIndex: 0,
  //   blockHash: "0xb613be65bcd7d59895e897028c8e63c8c9e2c7deb29ac92e8de7dba0a223e402",
  //   logIndex: 0,
  //   removed: false,
  //   id: "log_d97b1df3",
  // }
  
  result.forEach(r => {
    const eventTopic = r.topics[0]
    if (eventTopic !== eventsTopic[3]) {
      console.log(`new event: ${eventTopic}`)
    }
  })
  console.log('testLogByTopic end')
}

const testGetAllEvents = async () => {
  console.log('testGetAllEvents begin')
  const result = await chainWan.getPastEvents(
    sgaWan.address, 14932824, 15042824, sgaWan.contract, 'allEvents',
  )
  // {
  //   "address": "0xaA5A0f7F99FA841F410aafD97E8C435c75c22821",
  //   "blockNumber": 15040059,
  //   "transactionHash": "0xb38dcb9d2d585fab42b138b82814b33dec5befe6ffcfe342f99f6c7b9fbd73a1",
  //   "transactionIndex": 7,
  //   "blockHash": "0x36aeebb1d0b16b6537b2876e83afb877b1b11645ba44c4b366ce826ed3057744",
  //   "logIndex": 7,
  //   "removed": false,
  //   "id": "log_3072bbe0",
  //   "returnValues": {
  //     "0": "0x000000000000000000000000000000000000000000746573746e65745f303237",
  //     "1": "0xEE008a99D0EA77d1AEA56F6E850676e2708d5E3B",
  //     "2": true,
  //     "3": "18850",
  //     "4": "18850",
  //     "groupId": "0x000000000000000000000000000000000000000000746573746e65745f303237",
  //     "wkAddr": "0xEE008a99D0EA77d1AEA56F6E850676e2708d5E3B",
  //     "finished": true,
  //     "from": "18850",
  //     "end": "18850"
  //   },
  //   "event": "incentiveEvent",
  //   "signature": "0x87307a7786524b1cbccc920b1eedb7a7e1ee2f85a065e35043c9c8b5ced7e755",
  //   "raw": {
  //     "data": "0x00000000000000000000000000000000000000000000000000000000000049a200000000000000000000000000000000000000000000000000000000000049a2",
  //     "topics": [
  //       "0x87307a7786524b1cbccc920b1eedb7a7e1ee2f85a065e35043c9c8b5ced7e755",
  //       "0x000000000000000000000000000000000000000000746573746e65745f303237",
  //       "0x000000000000000000000000ee008a99d0ea77d1aea56f6e850676e2708d5e3b",
  //       "0x0000000000000000000000000000000000000000000000000000000000000001"
  //     ]
  //   }
  // }
  
  result.forEach(r => {
    const eventTopic = r.raw.topics[0]
    if (eventTopic !== eventsTopic[3]) {
      console.log(`new event: ${eventTopic}`)
    }
  });
  console.log('testGetAllEvents end')
}
setTimeout(async () => {
  await testGetAllEvents()
}, 0)