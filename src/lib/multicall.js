const { aggregate, createWatcher } = require('@makerdao/multicall');

const config = {
  rpcUrl: 'https://gwan-ssl.wandevs.org:56891',
  multicallAddress: '0xBa5934Ab3056fcA1Fa458D30FBB3810c3eb5145f',
}

const getWaspPrice = async () => {
  // get pairs
  const calls = [
    {
      // WanSwap Liquidity Pool TokenWSLP
      target: '0x29239a9b93a78decec6e0dd58ddbb854b7ffb0af',
      call: ['getReserves()(uint112,uint112,uint32)'],
      returns: [
        ['wasp_reserve0', val => val / 1e18],
        ['wasp_reserve1', val => val / 1e18],
        ['wasp_time', val => val],
      ]
    },
    {
      target: '0x0a886dc4d584d55e9a1fa7eb0821762296b4ec0e',
      call: ['getReserves()(uint112,uint112,uint32)'],
      returns: [
        ['wan_reserve0', val => val / 1e6],
        ['wan_reserve1', val => val / 1e18],
        ['wan_time', val => val],
      ]
    }
  ]
  let ret = await aggregate(calls, config);
  let waspR0 = ret.results.transformed.wasp_reserve0;
  let waspR1 = ret.results.transformed.wasp_reserve1;
  let wanR0 = ret.results.transformed.wan_reserve0;
  let wanR1 = ret.results.transformed.wan_reserve1;
  const waspPrice = waspR1/waspR0 * (wanR0/wanR1);
  return waspPrice;
}

// if new block get price,
const getWanPrice = async () => {
  // get pairs
  const calls = [
    // wanUSDT WWAN     1,515,720
    {
      target: "0x0a886dc4d584d55e9a1fa7eb0821762296b4ec0e",
      call: ['getReserves()(uint112,uint112,uint32)'],
      returns: [
        ['usdt_wan_r0', val => val / 1e6],
        ['usdt_wan_r1', val => val / 1e18],
        ['usdt_wan_time', val => val],
      ]
    },
  ]
  let ret = await aggregate(calls, config);
  let usdt_wan_r0 = ret.results.transformed.usdt_wan_r0;
  let usdt_wan_r1 = ret.results.transformed.usdt_wan_r1;
  const wanPrice = usdt_wan_r0/usdt_wan_r1;
  console.log(wanPrice)
  return wanPrice;
}

const getReserves = async () => {
  // get pairs
  const calls = [
    // wanUSDT WWAN     1,515,720
    {
      target: "0x0a886dc4d584d55e9a1fa7eb0821762296b4ec0e",
      call: ['getReserves()(uint112,uint112,uint32)'],
      returns: [
        ['usdt_wan_r0', val => val / 1e6],
        ['usdt_wan_r1', val => val / 1e18],
        ['usdt_wan_time', val => val],
      ]
    },
  ]
  let ret = await aggregate(calls, config);
  let usdt_wan_r0 = ret.results.transformed.usdt_wan_r0;
  let usdt_wan_r1 = ret.results.transformed.usdt_wan_r1;
  return {
    usdt : ret.results.transformed.usdt_wan_r0,
    wan : ret.results.transformed.usdt_wan_r1
  }
}


// binance supported pairs 
// wan/usdt  => wanUSDT / WWAN  || wanUSDT / wasp / wwan (不考虑?)
// wan/eth   => wwan / wanEth
// usdc/usdt => wanUsdt / wanUsdc
// wan/btc   => wanBtc / wwan
// xrp/usdt  => wanUSDT / wwan / wanXrp

const watcher = createWatcher(
  [
    // wanUSDT WWAN     1,515,720
    {
      target: "0x0a886dc4d584d55e9a1fa7eb0821762296b4ec0e",
      call: ['getReserves()(uint112,uint112,uint32)'],
      returns: [
        ['usdt_wan_r0', val => val / 1e6],
        ['usdt_wan_r1', val => val / 1e18],
        ['usdt_wan_time', val => val],
      ]
    },
    // // wwan wanEth       180,2631
    // {
    //   target: "0xb1b5dada5795f174f1f62ede70edb4365fb07fb1",
    //   call: ['getReserves()(uint112,uint112,uint32)'],
    //   returns: [
    //     ['wan_eth_r0', val => val / 1e18],
    //     ['wan_eth_r1', val => val / 1e18],
    //     ['wan_eth_time', val => val],
    //   ]
    // },
    // // wasp wwan        5,179,576
    // {
    //   target: "0x29239a9b93a78decec6e0dd58ddbb854b7ffb0af",
    //   call: ['getReserves()(uint112,uint112,uint32)'],
    //   returns: [
    //     ['wasp_wan_r0', val => val / 1e18],
    //     ['wasp_wan_r1', val => val / 1e18],
    //     ['wasp_wan_time', val => val],
    //   ]
    // },
    // // wanUSDT wasp       340,332
    // {
    //   target: "0x76227986f3331c8798616205b3f1c4a2d06fd1bc",
    //   call: ['getReserves()(uint112,uint112,uint32)'],
    //   returns: [
    //     ['usdt_wasp_r0', val => val / 1e6],
    //     ['usdt_wasp_r1', val => val / 1e18],
    //     ['usdt_wasp_time', val => val],
    //   ]
    // },
    // // wanUsdt wanUsdc  5,517,917
    // {
    //   target: "0x22d41262d4587ab2ac32d67cfeef7449d566920d",
    //   call: ['getReserves()(uint112,uint112,uint32)'],
    //   returns: [
    //     ['usdt_usdc_r0', val => val / 1e6],
    //     ['usdt_usdc_r1', val => val / 1e6],
    //     ['usdt_usdc_time', val => val],
    //   ]
    // },
    // // wanBtc WWan      1,278,193
    // {
    //   target: "0x56290cdbd88d5516877cbc1c892aa7a77f3b0301",
    //   call: ['getReserves()(uint112,uint112,uint32)'],
    //   returns: [
    //     ['btc_wan_r0', val => val / 1e8],
    //     ['btc_wan_r1', val => val / 1e18],
    //     ['btc_wan_time', val => val],
    //   ]
    // },
    // // wwan wanXrp      2,852,369
    // {
    //   target: "0x2a272a37c999a36dc10100f8a4b7c3937c174a0d",
    //   call: ['getReserves()(uint112,uint112,uint32)'],
    //   returns: [
    //     ['wan_xrp_r0', val => val / 1e18],
    //     ['wan_xrp_r1', val => val / 1e6],
    //     ['wan_xrp_time', val => val],
    //   ]
    // },
    // // zoo wasp         2,194,172
    // {
    //   target: "0xa0cf1f16994ecd6d4613024b3ebb61b9f9c06f06",
    //   call: ['getReserves()(uint112,uint112,uint32)'],
    //   returns: [
    //     ['zoo_wasp_r0', val => val / 1e18],
    //     ['zoo_wasp_r1', val => val / 1e18],
    //     ['zoo_wasp_time', val => val],
    //   ]
    // },
  ],
  config
)

// // Subscribe to state updates
// watcher.subscribe(update => {
//   console.log(`Update: ${update.type} = ${update.value}`);
// });

// // Subscribe to batched state updates
// watcher.batch().subscribe(updates => {
//   // Handle batched updates here
//   // Updates are returned as { type, value } objects, e.g:
//   // { type: 'BALANCE_OF_MKR_WHALE', value: 70000 }
//   console.log(`updates ${JSON.stringify(updates, null, 2)}`)
// });
  
// // Subscribe to new block number updates
// watcher.onNewBlock(blockNumber => {
//   console.log('New block:', blockNumber);
// });

// // Start the watcher polling
// watcher.start();

module.exports = {
  getWaspPrice,
  getWanPrice,
  getReserves,
  createWatcher,
}