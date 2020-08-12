const ethers = require("ethers");
const fetch = require("node-fetch");
const Web3 = require('web3');
const stdio = require('stdio');

const { createLogger, format, transports } = require("winston");
const { utils } = require("ethers");
const { throwError } = require("ethers/errors");
const { sleep } = require("zksync/build/utils");
const logger = createLogger({
  level: "debug",
  format: format.simple(),
  transports: [new transports.Console()],
});

const ETH_FAUCET_ADDRESS = "http://faucet.testnet.golem.network:4000/donate";
const GNT_CONTRACT_ADDRESS = "0xd94e3DC39d4Cad1DAd634e7eb585A57A19dC7EFE";
const ZKSYNC_CONTRACT_ADDRESS = "0x7ec7251192cdefe3ea352181ca0e6c2a08a411a5";
const FAUCET_CONTRACT_ADDRESS = "0x59259943616265A03d775145a2eC371732E2B06C";
const RINKEBY_CHAIN_ID = 4;
const FAUCET_MIN_ABI = [
  {
    "constant": false,
    "inputs": [],
    "name": "create",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
];

// The minimum ABI to get ERC20 Token balance
const GNT_MIN_ABI = [
  // balanceOf
  {
    "constant": true,
    "inputs": [{ "name": "_owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "balance", "type": "uint256" }],
    "type": "function"
  },
  // increaseAllowance
  {
    "constant": false,
    "inputs": [
      {
        "name": "spender",
        "type": "address"
      },
      {
        "name": "addedValue",
        "type": "uint256"
      }
    ],
    "name": "increaseAllowance",
    "outputs": [
      {
        "name": "",
        "type": "bool"
      }
    ],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  },
];

const MAX_GNT_BALANCE = ethers.utils.parseEther("1000.0");
const MIN_ETH_BALANCE = Web3.utils.fromWei("100000000000000", 'ether');

let web3 = null;
let gnt_contract = null;
let faucet_contract = null;

const ops = stdio.getopt({
  'provider': { key: 'p', args: 1, required: false, description: "Provider's mnemonic", default: "" },
  'requestor': { key: 'r', args: 1, required: false, description: "Requestor's mnemonic", default: "" },
});

main();

async function main() {
  let syncProvider = false;
  let ethersProvider = false;

  logger.info("Running basic zkSync scenario");
  try {
    logger.info("Initializing web3...");
    web3 = new Web3(new Web3.providers.HttpProvider('http://1.geth.testnet.golem.network:55555'));
    // Creates GNT contracts
    gnt_contract = new web3.eth.Contract(GNT_MIN_ABI, GNT_CONTRACT_ADDRESS);
    faucet_contract = new web3.eth.Contract(FAUCET_MIN_ABI, FAUCET_CONTRACT_ADDRESS);
    logger.info("web3 initialized!");

    logger.info("Loading zksync library...");
    const zksync = await require("zksync");

    // To interact with Sync network users need to know the endpoint of the operator node.
    logger.debug("Connecting to rinkeby zkSync-provider...");
    const syncProvider = await zksync.getDefaultProvider("rinkeby", "HTTP");

    // Most operations require some read-only access to the Ethereum network. 
    // We use ethers library to interact with Ethereum.
    logger.debug("Connecting to rinkeby ethers-provider...");
    ethersProvider = new ethers.getDefaultProvider("rinkeby");

    logger.info("Libraries loaded!");

    // Create 2 wallet, requestor and provider
    const requestorWallet = ops.requestor && ops.requestor !== "" ?
      ethers.Wallet.fromMnemonic(ops.requestor).connect(ethersProvider)
      : ethers.Wallet.createRandom().connect(ethersProvider);
    logger.info("Requestor address: " + requestorWallet.address);
    logger.info("Requestor mnemonic: " + requestorWallet.mnemonic)
    const requestorSyncWallet = await zksync.Wallet.fromEthSigner(requestorWallet, syncProvider);

    const providerWallet = ops.provider && ops.provider !== "" ?
      ethers.Wallet.fromMnemonic(ops.provider).connect(ethersProvider)
      : ethers.Wallet.createRandom().connect(ethersProvider);
    logger.info("Provider address: " + providerWallet.address);
    logger.info("Provider mnemonic: " + providerWallet.mnemonic);
    const providerSyncWallet = await zksync.Wallet.fromEthSigner(providerWallet, syncProvider);

    logger.info("Requesting funds for the Requestor...")
    await request_funds(requestorWallet);
    logger.info("Funds requested!")

    await increaseAllowance(requestorWallet);

    logger.info("Before Requestor's funds: " + await get_gnt_balance(requestorWallet.address) + " GNT");
    logger.info("Before Provider's funds: " + await get_gnt_balance(providerWallet.address) + " GNT");

    logger.info("Depositing Requestor's funds on zkSync...")
    // Deposit assets on requestor
    const deposit = await requestorSyncWallet.depositToSyncFromEthereum({
      depositTo: requestorSyncWallet.address(),
      token: "GNT",
      amount: ethers.utils.parseEther("10.0"),
    });
    logger.info("Done!");

    // Await confirmation from the zkSync operator
    // Completes when a promise is issued to process the tx
    logger.info("Waiting for confirmation from zkSync operator...");
    const depositReceipt = await deposit.awaitReceipt();
    logger.info("Confirmed!");

    logger.info("Requestor's funds deposited on zkSync network");

    logger.info("After deposit requestor funds: " + await get_gnt_balance(requestorWallet.address) + " GNT");
    logger.info("After provider funds: " + await get_gnt_balance(providerWallet.address) + " GNT");


    // Unlock Requestor's account
    logger.info("Unlocking Requestor's account on zkSync...")
    if (! await requestorSyncWallet.isSigningKeySet()) {
      if (await requestorSyncWallet.getAccountId() == undefined) {
        throw new Error("Unknwon account");
      }

      const changeRequestorPubkey = await requestorSyncWallet.setSigningKey();

      // Wait until the tx is committed
      await changeRequestorPubkey.awaitReceipt();
    }
    logger.info("Requestor's account unlocked");

    logger.info("Commited Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("Verified Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT", "verified")) + " GNT");

    logger.info("Commited Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("Verified Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT", "verified")) + " GNT");

    logger.info("Making a simple transfer...");
    const transfer = await requestorSyncWallet.syncTransfer({
      to: providerSyncWallet.address(),
      token: "GNT",
      amount: zksync.utils.closestPackableTransactionAmount(
        ethers.utils.parseEther("6.0")),
    });
    logger.info("Done!");

    logger.info("Waiting for confirmation on zkSync...");
    const transferReceipt = await transfer.awaitReceipt();
    logger.info("Confirmed!");

    logger.info("(After transfer) Commited Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("(After transfer) Verified Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT", "verified")) + " GNT");

    logger.info("(After transfer) Commited Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("(After transfer) Verified Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT", "verified")) + " GNT");

    // Unlock Provider's account
    logger.info("Unlocking Provider's account on zkSync...")
    if (! await providerSyncWallet.isSigningKeySet()) {
      if (await providerSyncWallet.getAccountId() == undefined) {
        throw new Error("Unknwon account");
      }

      const changeProviderPubkey = await providerSyncWallet.setSigningKey();

      // Wait until the tx is committed
      await changeProviderPubkey.awaitReceipt();
    }
    logger.info("Provider's account unlocked");


    // withdraw funds to provider GNT wallet
    logger.info("Withdrawing Provider's funds...");

    const withdraw = await providerSyncWallet.withdrawFromSyncToEthereum({
      ethAddress: providerWallet.address,
      token: "GNT",
      amount: ethers.utils.parseEther("2"),
    });

    logger.info("Done!");

    logger.info("Verifying receipt...");
    const withdrawalReceipt = await withdraw.awaitVerifyReceipt();
    logger.info("Done!");

    logger.info("(After withdrawal) Commited Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("(After withdrawal) Verified Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT", "verified")) + " GNT");

    logger.info("(After withdrawal) Commited Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT")) + " GNT");
    logger.info("(After withdrawal) Verified Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT", "verified")) + " GNT");

    logger.info("Scenario completed, have a nice day!");
  } catch (e) {
    logger.error("Scenario failed with error:", e);
  } finally {
    if (syncProvider) {
      await syncProvider.disconnect();
    }
  }
}

async function get_eth_balance(address) {
  return fromWei(await web3.eth.getBalance(address));
}

async function get_gnt_balance(address) {
  return fromWei(await gnt_contract.methods.balanceOf(address).call());
}

function fromWei(amount) {
  return Web3.utils.fromWei("" + amount, 'ether');
}

async function request_funds(wallet) {
  await request_eth(wallet);
  await request_gnt(wallet);
}

async function request_eth(wallet) {
  let address = wallet.address;
  logger.info("Requesting ETH for: " + address);
  let url = ETH_FAUCET_ADDRESS + "/" + address;

  var i = 0;

  for (; i < 10; i++) {
    const response = await fetch(url);
    const r = await response.text();
    logger.debug("ETH faucet repsonse: " + r);
    if (r.includes("txhash") || r.includes("sufficient funds")) {
      break;
    }
    await sleep(1000);
  }

  logger.info("Waiting for confirmations...");
  await sleep_with_progress_bar(20);

  if (await get_eth_balance(wallet.address) < MIN_ETH_BALANCE) {
    throwError("Cannot request ETH!")
  }

  logger.info("ETH requested!");
}

async function request_gnt(wallet) {
  const gnt_balance = await get_gnt_balance(wallet.address);
  if (gnt_balance < MAX_GNT_BALANCE) {
    logger.info("Requesting GNT for: " + wallet.address);
    const eth_balance = await get_eth_balance(wallet.address);
    if (eth_balance < MIN_ETH_BALANCE) {
      throwError("Insuficient gas for the Faucet!");
    }

    const callData = faucet_contract.methods.create().encodeABI();
    const transactionParameters = {
      to: FAUCET_CONTRACT_ADDRESS,
      value: '0x00',
      data: callData,
      chainId: RINKEBY_CHAIN_ID,
    };
    let faucetTx = await wallet.sendTransaction(transactionParameters);
    logger.info("Waiting for confirmations...");
    let faucetReceipt = await faucetTx.wait();
    logger.info("Done!");
  }
}

async function increaseAllowance(wallet) {
  logger.info("Sending increaseAllowance...");
  const callData = gnt_contract.methods.increaseAllowance(ZKSYNC_CONTRACT_ADDRESS, utils.parseEther("100.0")).encodeABI();
  const transactionParameters = {
    to: GNT_CONTRACT_ADDRESS,
    value: '0x00',
    data: callData,
    chainId: RINKEBY_CHAIN_ID,
  };
  let allowanceTx = await wallet.sendTransaction(transactionParameters);
  logger.info("Waiting for confirmations...");
  let allowanceReceipt = await allowanceTx.wait();
  logger.info("Done!");

}

async function sleep_with_progress_bar(seconds) {
  const pbar = new stdio.ProgressBar(seconds);
  var i = setInterval(() => pbar.tick(), 1000);
  pbar.onFinish(() => {
    clearInterval(i);
  });
  await sleep(seconds * 1000);
}
