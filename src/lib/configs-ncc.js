// standard chain config
module.exports = {
  // 10分钟一个块
  'BTC': {
    'testnet': {
      "rpc": "52.40.34.234:36893",
      "feeUrl": "https://api.blockcypher.com/v1/btc/test3",
      "foundationAddr": "mpSRUeY5RWgxUyEFr7Dn1QCffZMJhPehwx",
      "bip44": 0x80000000,
      // "startBlockNumber": 696992,
      // one day 6 x 24 = 144 blocks,  one week 144 x 7 = 1008
      "startBlockNumber": 693992,
      "safeBlockCount": 1,
      "decimals": 8,
      "coinType": 'BTC',
      "rpcUser": "wanglu",
      "rpcPassword": "Wanchain888",
    },
    'mainnet': {
      "rpc": "nodes.wandevs.org:26893",
      "feeUrl": "https://api.blockcypher.com/v1/btc/main",
      "foundationAddr": "bc1q8ak3pfl9r3julum2s9763tvt8rmcxtzqll8s2l",
      "bip44": 0x80000000,
      // "startBlockNumber": 2065740,
      "startBlockNumber": 2062740,
      "safeBlockNumber": 1,
      "decimals": 8,
      "coinType": 'BTC',
      "rpcUser": "wanglu",
      "rpcPassword": "Wanchain888",
    }
  },
  // 2.5分钟一个块
  'LTC': {
    'testnet': {
      "rpc": "44.236.155.20:36894",
      "feeUrl": "https://api.blockcypher.com/v1/ltc/main",
      "foundationAddr": "mmmdNQHsWaCd6DCUS14PBnuUxWHhu7vCuL",
      "bip44": 0x80000002,
      // "startBlockNumber": 1998882,
      "startBlockNumber": 1988882,
      "safeBlockNumber": 1,
    },
    'mainnet': {
      "rpc": "nodes.wandevs.org:26894",
      "feeUrl": "https://api.blockcypher.com/v1/ltc/main",
      "foundationAddr": "ltc1qnlzurwcz26suh30hxnr5ndrkr2jhnsc6s5zfjh",
      "bip44": 0x80000002,
      // "startBlockNumber": 2109295,
      "startBlockNumber": 2100295,
      "safeBlockNumber": 1,
    }
  },
  // 3秒一个块
  'XRP': {
    'testnet': {
      "rpc": "wss://nodes-testnet.wandevs.org/xrp",
      "foundationAddr": "rNWwzNesh85cVtVCSh2ipAHQQKDb3Q39o1",
      "bip44": 0x80000090,
      // "startBlockNumber": 20340261,
      "startBlockNumber": 20300261,
      "safeBlockNumber": 1,
    },
    'mainnet': {
      "rpc": "wss://nodes.wandevs.org/xrp",
      "foundationAddr": "r9mwbimnzePg4AwmsLb7ogdp1d1s8c69W1",
      "bip44": 0x80000090,
      // "startBlockNumber": 65833345,
      "startBlockNumber": 65433345,
    }
  },
  //主网：polkadot，测试网：westend， 6秒一个块
  'DOT': {
    'testnet': {
      "rpc": "wss://nodes-testnet.wandevs.org/polkadot",
      "decimals": 12,
      "foundationAddr": "5DDNUHeiPWFQpjdGQaVUcvGKzLvEDkPKCJJjZTnznb2zNB9x",
      "bip44": 0x80000162,
      // "startBlockNumber": 7034365,
      "startBlockNumber": 6834365,
      "symbol": "WND",
    },
    'mainnet': {
      "rpc": "wss://nodes.wandevs.org/polkadot",
      "decimals": 10,
      "foundationAddr": "139BQqPhyUh6QkvvHcdcDvEteXD55SaDeS8pTdeCeHWCSALX",
      "bip44": 0x80000162,
      // "startBlockNumber": 6493248,
      "startBlockNumber": 6293248,
    }
  }
}