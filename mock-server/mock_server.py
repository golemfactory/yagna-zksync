from werkzeug.wrappers import Request, Response
from werkzeug.serving import run_simple

from jsonrpc import JSONRPCResponseManager, dispatcher

from web3.auto import w3

w3.eth.defaultAccount = w3.eth.accounts[0]

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
ZKSYNC = w3.eth.contract(address=ZKSYNC_ADDRESS, abi=ZKSYNC_MIN_ABI)

NGNT_ADDRESS = "0xFDFEF9D10d929cB3905C71400ce6be1990EA0F34"
NGNT_MNI_ABI = [
  {
    "constant": True,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "type": "function"
  }
]
NGNT = w3.eth.contract(address=NGNT_ADDRESS, abi=NGNT_MNI_ABI)


@dispatcher.add_method
def contract_address():
    print("contract_address()")
    return {
        "mainContract": ZKSYNC_ADDRESS,
        "govContract": ""
    }


@dispatcher.add_method
def tokens():
    print("tokens()")
    return {
        "GNT": {
            "address": NGNT_ADDRESS,
            "id": 16,
            "symbol": "GNT",
            "decimals": 18
        }
    }


@dispatcher.add_method
def account_info(address):
    print(f"account_info({address})")
    ngnt_balance = str(NGNT.caller.balanceOf(ZKSYNC_ADDRESS))
    return {
        "address": address,
        "id": 1,
        "committed": {
            "balances": {
                "GNT": ngnt_balance,
            },
            "nonce": 0,
        },
        "depositing": {
            "balances": {}
        },
        "verified": {
            "balances": {
                "GNT": ngnt_balance,
            },
            "nonce": 0,
        }
    }


@dispatcher.add_method
def get_tx_fee(tx_type, *args):
    print(f"transaction_fee{(tx_type,) + args}")
    return {
        "feeType": tx_type,
        "gasTxAmount": "0",
        "gasPriceWei": "0",
        "gasFee": "0",
        "zkpFee": "0",
        "totalFee": "0",
    }


@dispatcher.add_method
def tx_submit(params, signature):
    print(f"submit_tx({params}, {signature})")
    if params["type"] == "Withdraw":
        tx_hash = ZKSYNC.functions.withdrawERC20(NGNT_ADDRESS, int(params["amount"]), params["to"]).transact()
        return tx_hash.hex()
    return "0x00000000000000000000000000000000000000000000000000000000deadbeef"


@dispatcher.add_method
def tx_info(tx_hash):
    print(f"tx_info({tx_hash})")
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
    print(f"ethop_info{args}")
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


@Request.application
def application(request: Request):
    response = JSONRPCResponseManager.handle(request.data, dispatcher)
    return Response(response.json, mimetype='application/json')


if __name__ == '__main__':
    run_simple('localhost', 3030, application)
