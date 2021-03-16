import brownie
from brownie import Contract
from brownie import config


def test_convert_crv(token, vault, strategy, strategist, whale, gaugeIB, strategyProxy, chain, voter, rando, dai):
    # Deposit to the vault and harvest
    amount = 100 * (10 ** 18)
    token.transfer(rando, amount, {"from": whale})
    startingRando = token.balanceOf(rando)
    token.approve(vault.address, amount, {"from": rando})
    vault.deposit(amount, {"from": rando})
    assert token.balanceOf(vault) == amount

    # harvest, store asset amount
    strategy.harvest({"from": strategist})
    starting_assets = vault.totalAssets()


    # simulate a month of earnings
    chain.sleep(2592000)
    chain.mine(1)

    # harvest after a month, store new asset amount
    tx = strategy.convertCrv({"from": strategist})
    # tx.call_trace(True)
    dai_holdings = dai.balanceOf(strategy)
    assert dai_holdings > 0

    strategy.harvest({"from": strategist})
    new_assets_dai = vault.totalAssets()
    assert new_assets_dai > starting_assets