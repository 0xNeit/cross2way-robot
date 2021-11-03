const compiledContract = require('../build/MappingToken.json');

const HDWalletProvider = require('truffle-hdwallet-provider');
const Web3 = require('web3');
const readlineSync = require('readline-sync');
const keythereum = require("keythereum");
// const chainEth = require(`./chain/${process.env.ETH_CHAIN_ENGINE}`);
const gasPrice = process.env.DEPLOY_GASPRICE_ETH

function getSk(addressTip, tip) {
  let sk = null
  while (!sk) {
    const address = readlineSync.question(addressTip).trim().toLowerCase()
    const password = readlineSync.question(tip, {hideEchoBack: true, mask: '*'})
    try {
      const keyObject = keythereum.importFromFile(address.slice(2), process.env.KEYSTORE_PARENT_FOLD);
      sk = keythereum.recover(password, keyObject);
    } catch(e) {
      console.error(`getSk exception ${addressTip}`, e)
    }
  }
  return sk.toString('hex')
}

const privKey = getSk("请输入发送交易的账户0x格式地址: ", "请输入密码: ")

// const privKey = "b6a03207128827eaae0d31d97a7a6243de31f2baf99eabd764e33389ecf436fc"

const provider = new HDWalletProvider(
	privKey,
  process.env.RPC_URL_ETH
);

const web3 = new Web3(provider);

(async () => {
	const accounts = await web3.eth.getAccounts();

  console.log(`Attempting to deploy from account: ${accounts[0]}`);

  // const gasPrice = await web3.eth.getGasPrice()
  console.log(`gasPrice : ${gasPrice}`)

	const deployedContract = await new web3.eth.Contract(compiledContract.abi)
		.deploy({
			data: compiledContract.bytecode,
			arguments: ["wanWASP@ethereum", "wanWASP", 18]
		})
		.send({
			from: accounts[0],
			gas: '2000000',
			gasPrice: gasPrice,
      chainId: parseInt(process.env.CHAIN_ID_ETH)
    });

    console.log(
      `Contract deployed at address: ${deployedContract.options.address}`
    );
  
  let newOwner = ""
  while (newOwner.length != 42) {
    newOwner = readlineSync.question("请输入新owner的地址，以0x开头: ").trim().toLowerCase()
  }

  const tx = await deployedContract.methods.transferOwner(newOwner).send({
			from: accounts[0],
			gas: '400000',
			gasPrice: gasPrice,
      chainId: parseInt(process.env.CHAIN_ID_ETH)
  });
  console.log(`tx ${JSON.stringify(tx, null, 2)}`)

	provider.engine.stop();
})();