// standard chain config
module.exports = {
  'bitcoin': {
    'testnet': {
      "nodeUrl": "52.40.34.234:36893",
      "feeUrl": "https://api.blockcypher.com/v1/btc/test3",
      "foundationAddr": "mpSRUeY5RWgxUyEFr7Dn1QCffZMJhPehwx",
      "chainID": "2147483648",
    },
    'mainnet': {
      "nodeUrl": "nodes.wandevs.org:26893",
      "feeUrl": "https://api.blockcypher.com/v1/btc/main",
      "foundationAddr": "bc1q8ak3pfl9r3julum2s9763tvt8rmcxtzqll8s2l",
      "chainID": "2147492648",
    }
  },
  'ltc': {
    'testnet': {
      "nodeUrl": "44.236.155.20:36894",
      "feeUrl": "https://api.blockcypher.com/v1/ltc/main",
      "foundationAddr": "mmmdNQHsWaCd6DCUS14PBnuUxWHhu7vCuL",
      "chainID": "2147483650",
    },
    'mainnet': {
      "nodeUrl": "nodes.wandevs.org:26894",
      "feeUrl": "https://api.blockcypher.com/v1/ltc/main",
      "foundationAddr": "ltc1qnlzurwcz26suh30hxnr5ndrkr2jhnsc6s5zfjh",
      "chainID": "2147483650",
    }
  },
  'xrp': {
    'testnet': {
      "nodeUrl": "wss://nodes-testnet.wandevs.org/xrp",
      "foundationAddr": "rNWwzNesh85cVtVCSh2ipAHQQKDb3Q39o1",
      "chainID": "2147483792",
    },
    'mainnet': {
      "nodeUrl": "wss://nodes.wandevs.org/xrp",
      "foundationAddr": "r9mwbimnzePg4AwmsLb7ogdp1d1s8c69W1",
      "chainID": "2147483792",
    }
  },
  'dot': {
    'testnet': {
      "nodeUrl": "wss://nodes-testnet.wandevs.org/polkadot",
      "decimals": 12,
      "foundationAddr": "5DDNUHeiPWFQpjdGQaVUcvGKzLvEDkPKCJJjZTnznb2zNB9x"
    },
    'mainnet': {
      "nodeUrl": "wss://nodes.wandevs.org/polkadot",
      "decimals": 10,
      "foundationAddr": "139BQqPhyUh6QkvvHcdcDvEteXD55SaDeS8pTdeCeHWCSALX",
    }
  }
}