// From Sam's Gen Lender

    function harvestTrigger(uint256 callCost) public view override returns (bool) {
        uint256 wantCallCost = _callCostToWant(callCost);

        return super.harvestTrigger(wantCallCost);
    }

    function ethToWant(uint256 _amount) internal view returns (uint256) {
        address[] memory path = new address[](2);
        path = new address[](2);
        path[0] = weth;
        path[1] = address(want);

        uint256[] memory amounts = IUni(uniswapRouter).getAmountsOut(_amount, path);

        return amounts[amounts.length - 1];
    }

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

    function tendTrigger(uint256 callCost) public view override returns (bool) {
        // make sure to call tendtrigger with same callcost as harvestTrigger
        if (harvestTrigger(callCost)) {
            return false;
        }

        //now let's check if there is better apr somewhere else.
        //If there is and profit potential is worth changing then lets do it
        (uint256 lowest, uint256 lowestApr, , uint256 potential) = estimateAdjustPosition();

        //if protential > lowestApr it means we are changing horses
        if (potential > lowestApr) {
            uint256 nav = lenders[lowest].nav();

            //To calculate our potential profit increase we work out how much extra
            //we would make in a typical harvest interlude. That is maxReportingDelay
            //then we see if the extra profit is worth more than the gas cost * profitFactor

            //safe math not needed here
            //apr is scaled by 1e18 so we downscale here
            uint256 profitIncrease = (nav.mul(potential) - nav.mul(lowestApr)).div(1e18).mul(maxReportDelay).div(SECONDSPERYEAR);

            uint256 wantCallCost = _callCostToWant(callCost);

            return (wantCallCost.mul(profitFactor) < profitIncrease);
        }
    }
