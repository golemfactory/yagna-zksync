const ethers = require("ethers");
const http = require('http');
const Web3 = require('web3');

const { createLogger, format, transports } = require("winston");
const { utils } = require("ethers");
const logger = createLogger({
  level: "debug",
  format: format.simple(),
  transports: [new transports.Console()],
});

const MNEMONIT_REQEUSTOR = "advice group neither noodle leader artwork toward similar ribbon under key program";
const MNEMONIT_PROVIDER = "aim body ceiling coral usual brother payment coyote manual helmet quick witness";

const ETH_FAUCET_ADDRESS = "http://faucet.testnet.golem.network:4000/donate";
const GNT_CONTRACT_ADDRESS = "0xd94e3DC39d4Cad1DAd634e7eb585A57A19dC7EFE";
const ZKSYNC_CONTRACT_ADDRESS = "0x407a44c1a4c6b31faad06908f8e05f3709ade260";
const FAUCET_CONTRACT_ADDRESS = "0x59259943616265A03d775145a2eC371732E2B06C";

const RINKEBY_CHAIN_ID = 4;

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

const REQUESTOR_PRIV_KEY = '0x6fdf35e865b2472def9f8ddf692143b80b13895de695989396b215d3f60e303a';

let web3 = null;
let gnt_contract = null;

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
    // const requestorWallet = ethers.Wallet.fromMnemonic(MNEMONIT_REQEUSTOR).connect(ethersProvider);
    const requestorWallet = new ethers.Wallet(REQUESTOR_PRIV_KEY, ethersProvider);
    logger.debug("Requestor address: " + requestorWallet.address);
    const requestorSyncWallet = await zksync.Wallet.fromEthSigner(requestorWallet, syncProvider);

    const providerWallet = ethers.Wallet.fromMnemonic(MNEMONIT_PROVIDER).connect(ethersProvider);
    logger.debug("Provider address: " + providerWallet.address);
    const providerSyncWallet = await zksync.Wallet.fromEthSigner(providerWallet, syncProvider);

    logger.info("Sending increaseAllowance...");
    const callData = gnt_contract.methods.increaseAllowance(ZKSYNC_CONTRACT_ADDRESS, utils.parseEther("100.0")).encodeABI();
    const transactionParameters = {
      to: GNT_CONTRACT_ADDRESS,
      value: '0x00',
      data: callData,
      chainId: RINKEBY_CHAIN_ID,
    };
    let allowanceTx = await requestorWallet.sendTransaction(transactionParameters);
    logger.info("Waiting for confirmation...");
    let allowanceReceipt = await allowanceTx.wait();
    logger.info("Done!");


    // // // OPTIONAL: Request faucet on requestor
    // // // 1. check balance ( ETH-ETH, ETH-GNT, ZK-ETH, ZK-GNT)
    // // // 2. only faucet if total ETH or GNT is too low
    // // logger.info("Enough funds available for this scenario");

    logger.info("Requesting funds for the Requestor...")
    await request_funds(requestorWallet);
    logger.info("Funds requested!")

    logger.info("Before Requestor's funds: " + await get_gnt_balance(requestorWallet.address) + " GNT");
    logger.info("Before Provider's funds: " + await get_gnt_balance(providerWallet.address) + " GNT");


    // logger.info("Depositing Requestor's funds on zkSync...")
    // // Deposit assets on requestor
    // const deposit = await requestorSyncWallet.depositToSyncFromEthereum({
    //   depositTo: requestorSyncWallet.address(),
    //   token: "GNT",
    //   amount: ethers.utils.parseEther("1.0"),
    // });
    // logger.info("Done!");

    // // Await confirmation from the zkSync operator
    // // Completes when a promise is issued to process the tx
    // logger.info("Waiting for confirmation from zkSync operator...");
    // const depositReceipt = await deposit.awaitReceipt();
    // logger.info("Confirmed: " + depositReceipt);

    // logger.info("Requestor's funds deposited on zkSync network");

    // logger.info("After deposit requestor funds: " + await get_gnt_balance(requestorWallet.address) + " GNT");
    // logger.info("After provider funds: " + await get_gnt_balance(providerWallet.address) + " GNT");


    // // Unlock Requestor's account
    // logger.info("Unlocking Requestor's account on zkSync...")
    // if (! await requestorSyncWallet.isSigningKeySet()) {
    //   if (await requestorSyncWallet.getAccountId() == undefined) {
    //     throw new Error("Unknwon account");
    //   }

    //   const changeRequestorPubkey = await requestorSyncWallet.setSigningKey();

    //   // Wait until the tx is committed
    //   await changeRequestorPubkey.awaitReceipt();
    // }
    // logger.info("Requestor's account unlocked");

    // logger.info("Commited Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT")) + " GNT");
    // logger.info("Verified Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("GNT", "verified")) + " GNT");

    // logger.info("Commited Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT")));
    // logger.info("Verified Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("GNT", "verified")));

    // logger.info("Making a simple transfer...");
    // const transfer = await requestorSyncWallet.syncTransfer({
    //   to: providerSyncWallet.address(),
    //   token: "ETH",
    //   amount: zksync.utils.closestPackableTransactionAmount(
    //     ethers.utils.parseEther("0.001")),
    // });
    // logger.info("Done!");

    // logger.info("Waiting for confirmation on zkSync...");
    // const transferReceipt = await transfer.awaitReceipt();
    // logger.info("Confirmed!");

    // logger.info("(After transfer) Commited Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("ETH")));
    // logger.info("(After transfer) Verified Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("ETH", "verified")));

    // logger.info("(After transfer) Commited Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("ETH")));
    // logger.info("(After transfer) Verified Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("ETH", "verified")));

    // // Unlock Provider's account
    // logger.info("Unlocking Provider's account on zkSync...")
    // if (! await providerSyncWallet.isSigningKeySet()) {
    //   if (await providerSyncWallet.getAccountId() == undefined) {
    //     throw new Error("Unknwon account");
    //   }

    //   const changeProviderPubkey = await providerSyncWallet.setSigningKey();

    //   // Wait until the tx is committed
    //   await changeProviderPubkey.awaitReceipt();
    // }
    // logger.info("Provider's account unlocked");


    // // withdraw funds to provider ETH wallet
    // logger.info("Withdrawing Provider's funds...");

    // const withdraw = await providerSyncWallet.withdrawFromSyncToEthereum({
    //   ethAddress: providerWallet.address,
    //   token: "ETH",
    //   amount: ethers.utils.parseEther("0.001"),
    // });

    // logger.info("Done!");

    // logger.info("Verifying receipt...");
    // const withdrawalReceipt = await withdraw.awaitVerifyReceipt();
    // logger.info("Done: " + withdrawalReceipt);

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
  // await request_gnt(address);
}

async function request_eth(wallet) {
  let address = wallet.address;
  logger.debug("Requesting ETH for: " + address);
  let url = ETH_FAUCET_ADDRESS + "/" + address;

  http.get(url, (res) => {
    // logger.debug("ETH requested...");
  });
}

async function request_gnt(wallet) {
  logger.debug("Requesting GNT for: " + wallet.address);
}