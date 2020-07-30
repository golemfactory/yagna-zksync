const ethers = require("ethers");
const http = require('http');
const Web3 = require('web3');

const { createLogger, format, transports } = require("winston");
const logger = createLogger({
  level: "debug",
  format: format.simple(),
  transports: [new transports.Console()],
});

const MNEMONIC_REQUESTOR = "media option diary all curtain blue flame life crisp photo edit admit";
const MNEMONIC_PROVIDER = "monitor often whip flock cement fiber battle veteran crush lake fringe update";

const ETH_FAUCET_ADDRESS = "http://faucet.testnet.golem.network:4000/donate";
const GNT_CONTRACT_ADDRESS = "0xd94e3DC39d4Cad1DAd634e7eb585A57A19dC7EFE";
// const NGNT_FAUCET_CONTRACT_ADDRESS = "0x59259943616265A03d775145a2eC371732E2B06C";

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
  // decimals
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{ "name": "", "type": "uint8" }],
    "type": "function"
  }
];

const ZKSYNC_CONTRACT_ADDRESS = "0x7ec7251192cDefe3ea352181Ca0E6c2A08A411a5";

// getBalanceToWithdraw and withdrawETH not supported in the JS client
const ZKSYNC_MIN_ABI = [
  {
    "constant": true,
    "inputs": [
      {
        "internalType": "address",
        "name": "_address",
        "type": "address"
      },
      {
        "internalType": "uint16",
        "name": "_tokenId",
        "type": "uint16"
      }
    ],
    "name": "getBalanceToWithdraw",
    "outputs": [
      {
        "internalType": "uint128",
        "name": "",
        "type": "uint128"
      }
    ],
    "payable": false,
    "stateMutability": "view",
    "type": "function"
  },
  {
    "constant": false,
    "inputs": [
      {
        "internalType": "uint128",
        "name": "_amount",
        "type": "uint128"
      }
    ],
    "name": "withdrawETH",
    "outputs": [],
    "payable": false,
    "stateMutability": "nonpayable",
    "type": "function"
  }
]

let web3 = null;
let gnt_contract = null;
let faucet_contract = null;
let zksync_contract = null;

main();

async function main() {
  let syncProvider = false;
  let ethersProvider = false;

  const exodus = process.argv.includes('exodus');
  logger.info("Running " + (exodus ? "exodus" : "basic") + " zkSync scenario");
  try {
    logger.info("Initializing web3...");
    web3 = new Web3(new Web3.providers.HttpProvider('http://1.geth.testnet.golem.network:55555'));
    gnt_contract = new web3.eth.Contract(GNT_MIN_ABI, GNT_CONTRACT_ADDRESS);
    zksync_contract = new web3.eth.Contract(ZKSYNC_MIN_ABI, ZKSYNC_CONTRACT_ADDRESS);
    logger.info("web3 initialized!");

    logger.info("Loading zksync library...");
    const zksync = await require("zksync");

    // To interact with Sync network users need to know the endpoint of the operator node.
    logger.debug("Connecting to rinkeby zkSync-provider...");
    const syncProvider = await zksync.Provider.newHttpProvider(
        "https://rinkeby-api.zksync.io/jsrpc"
    );

    // Most operations require some read-only access to the Ethereum network.
    // We use ethers library to interact with Ethereum.
    logger.debug("Connecting to rinkeby ethers-provider...");
    ethersProvider = new ethers.getDefaultProvider("rinkeby");

    logger.info("Libraries loaded!");

    // Create 2 wallet, requestor and provider
    const requestorWallet = ethers.Wallet.fromMnemonic(MNEMONIC_REQUESTOR).connect(ethersProvider);
    logger.debug("Requestor address: " + requestorWallet.address);
    const requestorSyncWallet = await zksync.Wallet.fromEthSigner(requestorWallet, syncProvider);

    const providerWallet = ethers.Wallet.fromMnemonic(MNEMONIC_PROVIDER).connect(ethersProvider);
    logger.debug("Provider address: " + providerWallet.address);
    const providerSyncWallet = await zksync.Wallet.fromEthSigner(providerWallet, syncProvider);

    // // OPTIONAL: Request faucet on requestor
    // // 1. check balance ( ETH-ETH, ETH-GNT, ZK-ETH, ZK-GNT)
    // // 2. only faucet if total ETH or GNT is too low
    // logger.info("Enough funds available for this scenario");

    await wait_for_eth(requestorWallet);
    await wait_for_eth(providerWallet);

    logger.info("Before Requestor's funds: " + await get_eth_balance(requestorWallet.address));
    logger.info("Before Provider's funds: " + await get_eth_balance(providerWallet.address));


    logger.info("Depositing Requestor's funds on zkSync...")
    // Deposit assets on requestor
    const deposit = await requestorSyncWallet.depositToSyncFromEthereum({
      depositTo: requestorSyncWallet.address(),
      token: "ETH",
      amount: ethers.utils.parseEther("0.002"),
    });
    logger.info("Done!");

    // Await confirmation from the zkSync operator
    // Completes when a promise is issued to process the tx
    logger.info("Waiting for confirmation from zkSync operator...");
    const depositReceipt = await deposit.awaitReceipt();
    logger.info("Confirmed: " + depositReceipt);

    logger.info("Requestor's funds deposited on zkSync network");

    logger.info("After deposit requestor funds: " + await get_eth_balance(requestorWallet.address));
    logger.info("After provider funds: " + await get_eth_balance(providerWallet.address));

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


    logger.info("Commited Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("ETH")));
    logger.info("Verified Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("ETH", "verified")));

    logger.info("Commited Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("ETH")));
    logger.info("Verified Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("ETH", "verified")));

    logger.info("Making a simple transfer...");
    const transfer = await requestorSyncWallet.syncTransfer({
      to: providerSyncWallet.address(),
      token: "ETH",
      amount: zksync.utils.closestPackableTransactionAmount(
        ethers.utils.parseEther("0.001")),
    });
    logger.info("Done!");

    logger.info("Waiting for confirmation on zkSync...");
    const transferReceipt = await transfer.awaitReceipt();
    logger.info("Confirmed!");

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

    logger.info("(After transfer) Commited Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("ETH")));
    logger.info("(After transfer) Verified Requestor's funds on zkSync: " + fromWei(await requestorSyncWallet.getBalance("ETH", "verified")));

    logger.info("(After transfer) Commited Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("ETH")));
    logger.info("(After transfer) Verified Provider's funds on zkSync: " + fromWei(await providerSyncWallet.getBalance("ETH", "verified")));


    if (exodus) {
      logger.info("Starting emergency withdrawal...");
      const emergencyWithdraw = await providerSyncWallet.emergencyWithdraw({
        token: "ETH",
      });
      logger.info("Done.");

      logger.info("Verifying receipt...");
      await emergencyWithdraw.awaitVerifyReceipt();
      logger.info("Done.");

      const balanceToWithdraw = await zksync_contract.methods.getBalanceToWithdraw(providerWallet.address, 0).call();
      logger.info("Balance to withdraw: " + balanceToWithdraw);

      const withdrawalCallData = zksync_contract.methods.withdrawETH(balanceToWithdraw).encodeABI();
      logger.info("Withdrawing to Ethereum chain...");
      const withdrawalTx = await providerWallet.sendTransaction({
        to: ZKSYNC_CONTRACT_ADDRESS,
        chainId: 4,
        data: withdrawalCallData
      });
      logger.info("Done.");

      logger.info("Verifying receipt...");
      await withdrawalTx.wait();
      logger.info("Done.");

    } else {
      const totalBalance = await providerSyncWallet.getBalance("ETH");
      logger.info("Total balance to withdraw: " + totalBalance);

      const withdrawFee = (await syncProvider.getTransactionFee("Withdraw", providerWallet.address, "ETH")).totalFee;
      logger.info("Withdraw fee: " + withdrawFee);

      const withdrawAmount = totalBalance - withdrawFee;
      logger.info("Withdraw amount: " + withdrawAmount);

      logger.info("Withdrawing Provider's funds...");
      const withdraw = await providerSyncWallet.withdrawFromSyncToEthereum({
        ethAddress: providerWallet.address,
        token: "ETH",
        amount: withdrawAmount,
      });
      logger.info("Done!");

      logger.info("Verifying receipt...");
      const withdrawalReceipt = await withdraw.awaitVerifyReceipt();
      logger.info("Done: " + withdrawalReceipt);
    }


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

function fromWei(amount) {
  return Web3.utils.fromWei("" + amount, 'ether');
}

async function wait_for_eth(wallet) {
  var balance = await get_eth_balance(wallet.address);
  if (balance < 0.005) {
    await request_eth(wallet);
    while (balance < 0.005) {
      await new Promise(r => setTimeout(r, 3000)); // sleep 3 sec
      balance = await get_eth_balance(wallet.address);
    }
  }
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