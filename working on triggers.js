Things I want:

Tend and harvest triggers; CRV needs to be > x

Need CRV price oracle in there for triggers to convert to base asset


so would I put as a condition in the tendTrigger or harvestTrigger 

if claimableTokens > crvWanted 
true

 and just add the claimable_tokens function to the interface?

harvest calls

		if IGaugefi(gauge).claimable_tokens > 5000

	uint256 public crvMinimum = 12500 // minimum amount of CRV needed for tend or harvest to trigger

	uint256 private tendProfitFactor = 
	uint256 private harvestProfitFactor = 


	// this allows us to manually ask keepers to harvest/tend if necessary
	uint256 public signalTend = 0
	uint256 public signalHarvest = 0
        
    // this controls the number of tends before we harvest
	uint256 private view harvestCounter = 0 
	uint256 private view tendsPerHarvest = 3

	// this allows us to manually ask keepers to harvest/tend if necessary
    function manualHarvest() external (uint256 _harvest) onlyAuthorized {
        if (_harvest = 1) {
        	signalHarvest = 1
        }
        else {
        	signalHarvest = 0
        }

    function manualTend() external (uint256 _tend) onlyAuthorized {
        if (_tend = 1) {
        	signalTend = 1
        }
        else {
        	signalTend = 0
        }
        
    function setTendProfitFactor() external (uint256 _tendProfitFactor) onlyAuthorized {
    	tendProfitFactor = _tendProfitFactor
        }

    function setHarvestProfitFactor() external (uint256 _harvestProfitFactor) onlyAuthorized {
    	harvestProfitFactor = _harvestProfitFactor
        }
        
    function setCrvMin() external (uint256 _crvMinimum) onlyAuthorized {
    	crvMinimum = _crvMinimum
        }

	
	// look at the average price when swapping 100 crv for dai
	function crvPrice() private view returns (uint256) {
        address[] memory path = new address[](3);
        path[0] = crv;
        path[1] = weth;
        path[2] = dai;
        
        uint256 hundredCrv = 100e18
        uint256 _crvPrice = IUniswapV2Router02(crvRouter).getAmountsOut(hundredCrv, path)[2];
        return _crvPrice;
    }    

    function tendTrigger(uint256 callCost) external view override returns (bool) {     
        if (harvestCounter >= tendsPerHarvest) {
        	return false;
        }
        
        
        
        if (IGaugefi(gauge).claimable_tokens > 5000) { //need to update this to make it correct
            // do stuff here when we have enough CRV
            
            uint256 profit = profit();

        	if (profit > 0) {
            	callCost = convertEthToWant(callCost);
        	}

        // Otherwise, only trigger if it "makes sense" economically (gas cost
        // is <N% of value moved)
        uint256 credit = vault.creditAvailable();
        return (profitFactor.mul(callCost) < credit.add(profit));
        }
        
        }



##### Final stuff above here



// double-check all of my use of internal/external/public/private functions

#######
// Notes: Slippage actually isn't too bad for large orders; sETH vault regularly sells ~25k CRV, and doesn't get sandwiched
// Maybe pulling gas price from Chainlink fastgas oracle is good so that keeper's cant trigger if gas is too high (maybe easier than a specific profit factor)
// perhaps add in both. have a switch that either uses profit factor or gas prices+total CRV
#######


uint256 public crvMaximum = 70000
uint256 public fastGasMax = 250000000000 // this is gas with nine zeroes on the end
Chainlink fast gas oracle = 0x169E633A2D1E6c10dD91238Ba11c4A708dfEF37C


//     function fastGas() public view returns (uint256) {
//     	_fastgas = chainlinkFastGas.latestAnswer();
//     	return _fastgas; 
//         }
// 
//     function setMaxGas() public external (uint256 _maxGas) onlyAuthorized {
//     	fastGasMax = _maxGas;
//         }

#################################
			



    function _callCostToWant(uint256 callCost) internal view returns (uint256) {
        uint256 wantCallCost;

        //three situations
        //1 currency is eth so no change.
        //2 we use uniswap swap price
        //3 we use external oracle
        if (address(want) == weth) {
            wantCallCost = callCost;
        } else if (wantToEthOracle == address(0)) {
            wantCallCost = ethToWant(callCost);
        } else {
            wantCallCost = IWantToEth(wantToEthOracle).ethToWant(callCost);
        }

        return wantCallCost;
    }    



################################
// These three are all from Steffenix's strategy

    function harvestTrigger(uint256 callCost)
        public
        view
        override
        returns (bool)
    {
        StrategyParams memory params = vault.strategies(address(this));

        // Should not trigger if Strategy is not activated
        if (params.activation == 0) return false;

        // Should not trigger if we haven't waited long enough since previous harvest
        if (block.timestamp.sub(params.lastReport) < minReportDelay)
            return false;

        // Should trigger if hasn't been called in a while
        if (block.timestamp.sub(params.lastReport) >= maxReportDelay)
            return true;

        // If some amount is owed, pay it back
        // NOTE: Since debt is based on deposits, it makes sense to guard against large
        //       changes to the value from triggering a harvest directly through user
        //       behavior. This should ensure reasonable resistance to manipulation
        //       from user-initiated withdrawals as the outstanding debt fluctuates.
        uint256 outstanding = vault.debtOutstanding();
        if (outstanding > debtThreshold) return true;

        // Check for profits and losses
        uint256 total = estimatedTotalAssets();
        // Trigger if we have a loss to report
        if (total.add(debtThreshold) < params.totalDebt) return true;

        uint256 profit = profit();

        if (profit > 0) {
            callCost = convertEthToWant(callCost);
        }
        
        need to use get_virtual_price in here as well to convert to want
        

        // Otherwise, only trigger if it "makes sense" economically (gas cost
        // is <N% of value moved)
        uint256 credit = vault.creditAvailable();
        return (profitFactor.mul(callCost) < credit.add(profit));
    }
    
    
    function profit() public view returns (uint256 _profit) {
        uint256 total = estimatedTotalAssets();

        StrategyParams memory params = vault.strategies(address(this));
        if (total > params.totalDebt) {
            _profit = total.sub(params.totalDebt); // We've earned a profit!
        }
    }    
    
    function convertEthToWant(uint256 amount) public view returns (uint256) {
        address[] memory path = new address[](3);
        path[0] = weth;
        path[1] = usdt;
        path[2] = ust;

        uint256 ustAmount =
            IUniswapV2Router02(unirouter).getAmountsOut(amount, path)[2];

        if (ustAmount == 0) {
            return uint256(-1);
        }

        (, uint256 ustReserve, ) = IUniswapV2Pair(address(want)).getReserves();

        uint256 ustLeft =
            ustAmount - calculateSwapInAmount(ustReserve, ustAmount);
        // we estimate the amount of want
        uint256 totalSupply = IUniswapV2Pair(address(want)).totalSupply();
        return (ustLeft * totalSupply) / ustReserve;
    }


    // this stuff below I pulled from things I had already added to my strat
    // keepers know how much their harvest call will cost; and the strategy needs at least x times more profit from that call
    // for this, they will call how much CRV they will get, 
    
################################

    
    function tendTrigger(uint256 callCost) public view override returns (bool) {
        // make sure to call tendtrigger with same callcost as harvestTrigger
        if (harvestTrigger(callCost)) {
            return false;
        }
        }
        
################################
        
    function tend() external override onlyKeepers {
        // Check the gauge for CRV, then harvest gauge CRV and sell for preferred asset, but don't deposit
        uint256 gaugeTokens = proxy.balanceOf(gauge);
        if (gaugeTokens > 0) {
            proxy.harvest(gauge);
            uint256 crvBalance = crv.balanceOf(address(this));
            uint256 _keepCRV = crvBalance.mul(keepCRV).div(FEE_DENOMINATOR);
            IERC20(address(crv)).safeTransfer(voter, _keepCRV);
            uint256 crvRemainder = crvBalance.sub(_keepCRV);

            _sell(crvRemainder);
        }
    }
    
 ################################
   
    function ethToCrv(uint256 _amount) internal view returns (uint256) {
        address[] memory path = new address[](2);
        path[0] = weth;
        path[1] = address(want);

        uint256[] memory amounts = IUni(uniswapRouter).getAmountsOut(_amount, path);

        return amounts[amounts.length - 1];
    }
    
    function ethToDai(uint256 _amount) 

    function _callCostToWant(uint256 callCost) internal view returns (uint256) {
        uint256 wantCallCost;

        //three situations
        //1 currency is eth so no change.
        //2 we use uniswap swap price
        //3 we use external oracle
        if (address(want) == weth) {
            wantCallCost = callCost;
        } else if (wantToEthOracle == address(0)) {
            wantCallCost = ethToWant(callCost);
        } else {
            wantCallCost = IWantToEth(wantToEthOracle).ethToWant(callCost);
        }

        return wantCallCost;
    }    
    
    
    
    
    