// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.6.12;
pragma experimental ABIEncoderV2;

import {BaseStrategy} from "@yearnvaults/contracts/BaseStrategy.sol";
import {SafeERC20, SafeMath, IERC20, Address} from "@openzeppelin/contracts/token/ERC20/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/math/Math.sol";

import "./interfaces/curve.sol";
import "./interfaces/yearn.sol";
import {IUniswapV2Router02} from "./interfaces/uniswap.sol";


contract StrategyCurveIBVoterProxy is BaseStrategy {
    using SafeERC20 for IERC20;
    using Address for address;
    using SafeMath for uint256;

    address private uniswapRouter = 0x7a250d5630B4cF539739dF2C5dAcb4c659F2488D;
    address private sushiswapRouter = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F;
    address public crvRouter = 0xd9e1cE17f2641f24aE83637ab66a2cca9C378B9F; // default to sushiswap

    address public constant crvIBgauge = address(0xF5194c3325202F456c95c1Cf0cA36f8475C1949F); // Curve Iron Bank Gauge contract, v2 is tokenized, held by curveProxy
    address public constant voter = address(0xF147b8125d2ef93FB6965Db97D6746952a133934); // Yearn's veCRV voter

    address[] public crvPath;
    address[] internal crvPathDai;
    address[] internal crvPathUsdc;
    address[] internal crvPathUsdt;
    uint256 public optimal;
    
    uint256 public keepCRV = 1000;
    uint256 public constant FEE_DENOMINATOR = 10000;
    bool public checkLiqGauge = true;

    ICurveFi public crvIBpool = ICurveFi(address(0x2dded6Da1BF5DBdF597C45fcFaa3194e53EcfeAF)); // Curve Iron Bank Pool
    ICurveStrategyProxy public curveProxy = ICurveStrategyProxy(address(0x9a165622a744C20E3B2CB443AeD98110a33a231b)); // Yearn's Updated v3 StrategyProxy
    
    IERC20 public constant weth = IERC20(address(0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2)); // 1e18
    
    ICrvV3 public crv = ICrvV3(address(0xD533a949740bb3306d119CC777fa900bA034cd52)); // 1e18
    IERC20 public dai = IERC20(address(0x6B175474E89094C44Da98b954EedeAC495271d0F)); // 1e18
    IERC20 public usdc = IERC20(address(0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48)); // 1e6
    IERC20 public usdt = IERC20(address(0xdAC17F958D2ee523a2206206994597C13D831ec7)); // 1e6

    constructor(address _vault) public BaseStrategy(_vault) {
        // You can set these parameters on deployment to whatever you want
        // maxReportDelay = 6300;
        // profitFactor = 100;
        // debtThreshold = 0;

        // want = crvIB, Curve's Iron Bank pool (ycDai+ycUsdc+ycUsdt)
        want.safeApprove(address(curveProxy), uint256(- 1));
        dai.safeApprove(address(crvIBpool), uint256(- 1));
        crv.approve(crvRouter, uint256(- 1));
        crv.approve(voter, uint256(- 1));

        // using all unwrapped tokens since there is a risk of insufficient funds for wrapped if swapping directly (sushiswap)
        crvPathDai = new address[](3);
        crvPathDai[0] = address(crv);
        crvPathDai[1] = address(weth);
        crvPathDai[2] = address(dai);

        crvPathUsdc = new address[](3);
        crvPathUsdc[0] = address(crv);
        crvPathUsdc[1] = address(weth);
        crvPathUsdc[2] = address(usdc);

        crvPathUsdt = new address[](3);
        crvPathUsdt[0] = address(crv);
        crvPathUsdt[1] = address(weth);
        crvPathUsdt[2] = address(usdt);

        crvPath = crvPathDai;
        optimal = 0;
    }

    function name() external override view returns (string memory) {
        // Add your own name here, suggestion e.g. "StrategyCreamYFI"
        return "StrategyCurveIBVoterProxy";
    }
    
    // total assets held by strategy
    function estimatedTotalAssets() public override view returns (uint256) {
        return curveProxy.balanceOf(crvIBgauge).add(want.balanceOf(address(this)));
    }

    function prepareReturn(uint256 _debtOutstanding) internal override
    returns (
        uint256 _profit,
        uint256 _loss,
        uint256 _debtPayment
    ){
        // TODO: Do stuff here to free up any returns back into `want`
        // NOTE: Return `_profit` which is value generated by all positions, priced in `want`
        // NOTE: Should try to free up at least `_debtOutstanding` of underlying position

        uint256 gaugeTokens = curveProxy.balanceOf(crvIBgauge);
        if(gaugeTokens > 0){
            curveProxy.harvest(crvIBgauge);

            uint256 crvBalance = crv.balanceOf(address(this));
            uint256 _keepCRV = crvBalance.mul(keepCRV).div(FEE_DENOMINATOR);
            IERC20(address(crv)).safeTransfer(voter, _keepCRV);
            curveProxy.lock();
            uint256 crvRemainder = crvBalance.sub(_keepCRV);
            
            _sell(crvRemainder);

			if (optimal == 0) {
 				uint256 daiBalance = dai.balanceOf(address(this));
  				crvIBpool.add_liquidity([daiBalance, 0, 0], 0, true);
			}
			
			if (optimal == 1) {
 				uint256 usdcBalance = usdc.balanceOf(address(this));
  				crvIBpool.add_liquidity([0, usdcBalance, 0], 0, true);
			}
			
			if (optimal == 2) {
 				uint256 usdtBalance = usdt.balanceOf(address(this));
  				crvIBpool.add_liquidity([0, 0, usdtBalance], 0, true);
			}
			
            _profit = want.balanceOf(address(this));
        }

        if (_debtOutstanding > 0) {
            uint256 stakedBal = curveProxy.balanceOf(crvIBgauge);
            curveProxy.withdraw(crvIBgauge, address(want), Math.min(stakedBal, _debtOutstanding));

            _debtPayment = Math.min(_debtOutstanding, want.balanceOf(address(this)));
        }
        return (_profit, _loss, _debtPayment);
    }

    function adjustPosition(uint256 _debtOutstanding) internal override {

        //when migrated to we will sometimes have liquidity gauge balance. 
        //this should be withdrawn and added to proxy
        if(checkLiqGauge){
            uint256 liqGaugeBal = IGauge(crvIBgauge).balanceOf(address(this));

            if(liqGaugeBal > 0){
                IGauge(crvIBgauge).withdraw(liqGaugeBal);
            }

        }

        uint256 _toInvest = want.balanceOf(address(this));
        want.safeTransfer(address(curveProxy), _toInvest);
        curveProxy.deposit(crvIBgauge, address(want));

    }


    function liquidatePosition(uint256 _amountNeeded) internal override returns (uint256 _liquidatedAmount, uint256 _loss){
        uint256 wantBal = want.balanceOf(address(this));
        uint256 stakedBal = curveProxy.balanceOf(crvIBgauge);

        if (_amountNeeded > wantBal) {
            curveProxy.withdraw(crvIBgauge, address(want), Math.min(stakedBal, _amountNeeded - wantBal));
        }

        _liquidatedAmount = Math.min(_amountNeeded, want.balanceOf(address(this)));
        return (_liquidatedAmount, _loss);
    }

    function _sell(uint256 _amount) internal {
        IUniswapV2Router02(crvRouter).swapExactTokensForTokens(_amount, uint256(0), crvPath, address(this), now.add(1800));
    }

    function prepareMigration(address _newStrategy) internal override {
        uint256 gaugeTokens = curveProxy.balanceOf(crvIBgauge);
        if (gaugeTokens > 0) {
            curveProxy.withdraw(crvIBgauge, address(want), gaugeTokens);
        }
    }

    function protectedTokens() internal view override returns (address[] memory) {
        address[] memory protected = new address[](1);
        protected[0] = crvIBgauge;

        return protected;
    }
    
	// setter functions
	    
    function setProxy(address _proxy) external onlyGovernance {
        curveProxy = ICurveStrategyProxy(_proxy);
    }

    function updateCheckLiqGauge(bool _checkLiqGauge) public onlyAuthorized {
        checkLiqGauge = _checkLiqGauge;
    }

    function setKeepCRV(uint256 _keepCRV) external onlyGovernance {
        keepCRV = _keepCRV;
    }

    function setCrvRouter(bool isSushiswap) external onlyAuthorized {
        if (isSushiswap) {
            crvRouter = sushiswapRouter;
        } else {
            crvRouter = uniswapRouter;
        }
        
        crv.approve(crvRouter, uint256(- 1));
    }

    function setVoter(address _voter) external onlyGovernance {
        voter = _voter;
    }

    function setOptimal(uint256 _optimal) external onlyAuthorized {
        if(_optimal == 0){
        	crvPath = crvPathDai;
        	optimal = 0;
        	dai.safeApprove(address(crvIBpool), uint256(- 1));
        } else if (_optimal == 1) {
        	crvPath = crvPathUsdc;
        	optimal = 1;
        	usdc.safeApprove(address(crvIBpool), uint256(- 1));
        } else if (_optimal == 2) {
        	crvPath = crvPathUsdt;
        	optimal = 2;
        	usdt.safeApprove(address(crvIBpool), uint256(- 1));
        } else {
        require(false, "incorrect token");
        }	
        
    }

}   
