import brownie
from brownie import Contract
from brownie import config

def test_triggers(gov, vault, strategy, token, amount, strategist, whale):
    # Deposit to the vault and harvest
    amount = token.balanceOf(whale) * 0.1        
    token.approve(vault.address, amount, {"from": whale})
    vault.deposit(amount, {"from": whale})
    vault.updateStrategyDebtRatio(strategy.address, 5_000, {"from": gov})
    strategy.setCrvRouter(0)
    strategy.setOptimal(0)
    strategy.harvest({"from": strategist})
    strategy.harvestTrigger(0)
    strategy.tendTrigger(0)
    
    # withdrawal to return test state to normal
    vault.withdraw({"from": whale})
    assert token.balanceOf(whale) != 0