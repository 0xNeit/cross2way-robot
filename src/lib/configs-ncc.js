// standard chain config
module.exports = {
  // 10分钟一个块
  'BTC': {
    'testnet': {
      "rpc": "52.40.34.234:36893",
      "feeUrl": "https://api.blockcypher.com/v1/btc/test3",
      "foundationAddr": "mpSRUeY5RWgxUyEFr7Dn1QCffZMJhPehwx",
      "bip44": 0x80000000,
      // one day 6 x 24 = 144 blocks,  one week 144 x 7 = 1008
      "startBlockNumber": 2098861,
      "safeBlockCount": 1,

      "symbol": "BTC",
      "decimals": 8,

      "chainType": 'BTC',
      // scan every 5 min ?
      "scanInterval": 300,
      "scanStep": 2,

      "rpcUser": "wanglu",
      "rpcPassword": "Wanchain888",
    },
    'mainnet': {
      "rpc": "nodes.wandevs.org:26893",
      "feeUrl": "https://api.blockcypher.com/v1/btc/main",
      "foundationAddr": "bc1q8ak3pfl9r3julum2s9763tvt8rmcxtzqll8s2l",
      "bip44": 0x80000000,
      "startBlockNumber": 2062740,
      "safeBlockCount": 1,

      "symbol": "BTC",
      "decimals": 8,

      "chainType": 'BTC',
      // scan every 5 min ?
      "scanInterval": 300,
      "scanStep": 10,

      "rpcUser": "wanglu",
      "rpcPassword": "Wanchain888",
    }
  },

  // 2.5分钟一个块
  'LTC': {
    // 10s 一个?
    'testnet': {
      "rpc": "44.236.155.20:36894",
      "feeUrl": "https://api.blockcypher.com/v1/ltc/main",
      "foundationAddr": "mmmdNQHsWaCd6DCUS14PBnuUxWHhu7vCuL",
      "bip44": 0x80000002,
      "startBlockNumber": 2055338,
      "safeBlockCount": 3,

      "symbol": "LTC",
      "decimals": 8,

      "chainType": 'LTC',
      // scan every 1 min ?
      "scanInterval": 60,
      "scanStep": 20,

      "rpcUser": "wanglu",
      "rpcPassword": "Wanchain888",

    },
    'mainnet': {
      "rpc": "nodes.wandevs.org:26894",
      "feeUrl": "https://api.blockcypher.com/v1/ltc/main",
      "foundationAddr": "ltc1qnlzurwcz26suh30hxnr5ndrkr2jhnsc6s5zfjh",
      "bip44": 0x80000002,
      "startBlockNumber": 2100295,
      "safeBlockCount": 3,

      "symbol": "LTC",
      "decimals": 8,

      "chainType": 'LTC',
      // scan every 1 min ?
      "scanInterval": 60,
      "scanStep": 20,

      "rpcUser": "wanglu",
      "rpcPassword": "Wanchain888",
    }
  },

  // 3秒一个块
  'XRP': {
    'testnet': {
      "rpc": "wss://nodes-testnet.wandevs.org/xrp",
      "foundationAddr": "rNWwzNesh85cVtVCSh2ipAHQQKDb3Q39o1",
      "bip44": 0x80000090,
      "startBlockNumber": 21809610,
      "safeBlockCount": 5,

      "symbol": "XRP",
      "decimals": 6,

      "chainType": 'XRP',
      // scan every 20 sec ?
      "scanInterval": 20,
      "scanStep": 100,
    },
    'mainnet': {
      "rpc": "wss://nodes.wandevs.org/xrp",
      "foundationAddr": "r9mwbimnzePg4AwmsLb7ogdp1d1s8c69W1",
      "bip44": 0x80000090,
      "startBlockNumber": 65433345,
      "safeBlockCount": 5,

      "symbol": "XRP",
      "decimals": 6,

      "chainType": 'XRP',
      // scan every 20 sec ?
      "scanInterval": 20,
      "scanStep": 100,
    }
  },

  //主网：polkadot，测试网：westend， 6秒一个块
  'DOT': {
    'testnet': {
      "rpc": "wss://nodes-testnet.wandevs.org/polkadot",
      "decimals": 12,
      "foundationAddr": "5DDNUHeiPWFQpjdGQaVUcvGKzLvEDkPKCJJjZTnznb2zNB9x",
      "bip44": 0x80000162,
      "startBlockNumber": 7776687,
      "safeBlockCount": 5,

      "symbol": "WND",
      "decimals": 12,

      "chainType": 'DOT',
      // scan every 30 sec ?
      "scanInterval": 30,
      "scanStep": 100,
    },
    'mainnet': {
      "rpc": "wss://nodes.wandevs.org/polkadot",
      "decimals": 10,
      "foundationAddr": "139BQqPhyUh6QkvvHcdcDvEteXD55SaDeS8pTdeCeHWCSALX",
      "bip44": 0x80000162,
      "startBlockNumber": 6293248,
      "safeBlockCount": 5,

      "symbol": "DOT",
      "decimals": 10,

      "chainType": 'DOT',
      // scan every 30 set ?
      "scanInterval": 60,
      "scanStep": 100,
    }
  }
}