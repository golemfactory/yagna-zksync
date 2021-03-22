import logging

from flask import Flask
from jsonrpc.backend.flask import api
from retrying import retry
from datetime import datetime

ZKSYNC_ADDRESS = "0x94BA4d5Ebb0e05A50e977FFbF6e1a1Ee3D89299c"
ZKSYNC_MIN_ABI = [
    {
        "constant": False,
        "inputs": [
            {"name": "_token", "type": "address"},
            {"name": "_amount", "type": "uint128"},
            {"name": "_addr","type": "address"}
        ],
        "name": "withdrawERC20",
        "outputs": [],
        "payable": False,
        "stateMutability": "nonpayable",
        "type": "function"
    }
]

GLM_ADDRESS = "0xFDFEF9D10d929cB3905C71400ce6be1990EA0F34"
GLM_MNI_ABI = [
  {
    "constant": True,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "type": "function"
  }
]

app = Flask(__name__)
app.logger.setLevel(logging.INFO)


@retry(wait_fixed=3000, stop_max_attempt_number=10)
def init_web3():
    global ZKSYNC, GLM

    app.logger.info("Initializing web3...")
    from web3.auto import w3
    w3.eth.defaultAccount = w3.eth.accounts[0]
    ZKSYNC = w3.eth.contract(address=ZKSYNC_ADDRESS, abi=ZKSYNC_MIN_ABI)
    GLM = w3.eth.contract(address=GLM_ADDRESS, abi=GLM_MNI_ABI)
    app.logger.info("Web3 initialized.")


dispatcher = api.dispatcher

balances = {}
nonces = {}
transactions = {}


@dispatcher.add_method
def contract_address():
    app.logger.info("contract_address()")
    return {
        "mainContract": ZKSYNC_ADDRESS,
        "govContract": ""
    }


@dispatcher.add_method
def tokens():
    app.logger.info("tokens()")
    return {
        "GNT": {
            "address": GLM_ADDRESS,
            "id": 16,
            "symbol": "GNT",
            "decimals": 18
        },
        "tGLM": {
            "address": GLM_ADDRESS,
            "id": 16,
            "symbol": "tGLM",
            "decimals": 18
        },
        "GLM": {
            "address": GLM_ADDRESS,
            "id": 16,
            "symbol": "GLM",
            "decimals": 18
        }
    }


@dispatcher.add_method
def account_info(address):
    app.logger.info(f"account_info({address})")
    deposited_balance = GLM.caller.balanceOf(ZKSYNC_ADDRESS)
    donated_balance = balances.get(address, 0)
    total_balance = str(deposited_balance + donated_balance)
    current_nonce = nonces.get(address, 0)
    return {
        "address": address,
        "id": 1,
        "committed": {
            "balances": {
                "GNT": total_balance,
                "tGLM": total_balance,
                "GLM": total_balance,
            },
            "nonce": current_nonce,
            "pubKeyHash": "sync:0000000000000000000000000000000000000000"
        },
        "depositing": {
            "balances": {}
        },
        "verified": {
            "balances": {
                "GNT": total_balance,
                "tGLM": total_balance,
                "GLM": total_balance,
            },
            "nonce": current_nonce,
            "pubKeyHash": "sync:0000000000000000000000000000000000000000"
        }
    }


@dispatcher.add_method
def get_tx_fee(tx_type, *args):
    app.logger.info(f"get_tx_fee{(tx_type,) + args}")

    return {
        "feeType": tx_type,
        "gasTxAmount": "0",
        "gasPriceWei": "0",
        "gasFee": "0",
        "zkpFee": "0",
        "totalFee": "0",
    }


@dispatcher.add_method
def tx_submit(params, *args):
    app.logger.info(f"tx_submit{(params,) + args}")

    address = None

    if params["type"] == "Withdraw":
        tx_hash = ZKSYNC.functions.withdrawERC20(GLM_ADDRESS, int(params["amount"]), params["to"]).transact()
        tx_hash = tx_hash.hex()[2:]

    elif params["type"] == "Transfer":
        sender_balance = balances.get(params["from"])
        amount = int(params["amount"])
        if sender_balance is not None:
            balances[params["from"]] = sender_balance - amount
            balances[params["to"]] = balances.get(params["to"], 0) + amount
        address = params["from"]
        # Generate a unique TEST tx_hash
        tx_hash = f'{address[2:]}{int(params["nonce"]):05x}00000000000deadbeef'
        transactions[tx_hash] = {
            'to': params["to"],
            'from': address,
            'amount': params["amount"],
            'created_at': datetime.now().isoformat("T")
        }

    elif params["type"] == "ChangePubKey":
        address = params["account"]
        # Generate a unique TEST tx_hash
        tx_hash = f'{address[2:]}{int(params["nonce"]):05x}00000000000deadbeef'

    if address:
        nonces[address] = nonces.get(address, 0) + 1

    return f"sync-tx:{tx_hash}"


@dispatcher.add_method
def tx_info(tx_hash):
    app.logger.info(f"tx_info({tx_hash})")
    return {
        "executed": True,
        "success": True,
        "block": {
          "blockNumber": 1,
          "committed": True,
          "verified": True
        }
    }


@dispatcher.add_method
def ethop_info(*args):
    app.logger.info(f"ethop_info{args}")
    return {
        "executed": True,
        "success": True,
        "failReason": "",
        "block": {
            "blockNumber": 0,
            "committed": True,
            "verified": True,
        }
    }


app.add_url_rule('/', 'api', api.as_view(), methods=['POST'])


@app.route('/zk/donatex/<address>')
def donate(address):
    app.logger.info(f"donate({address})")
    balances[address] = balances.get(address, 0) + 1000_000_000_000_000_000_000  # 1000 GLM
    return '"0x00000000000000000000000000000000000000000000000000000000deadbeef"'


@app.route('/transactions_all/<tx_hash>')
def transactions_all(tx_hash):
    print(f"transactions_all({tx_hash})")
    return transactions.get(tx_hash, {})


if __name__ == '__main__':
    init_web3()
    app.run('0.0.0.0', 3030)
