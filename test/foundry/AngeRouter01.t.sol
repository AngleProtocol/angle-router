// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.12;

import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

import "./BaseTest.t.sol";
import "../../contracts/interfaces/ILiquidityGauge.sol";
import "../../contracts/interfaces/IPoolManager.sol";
import "../../contracts/interfaces/IStableMasterFront.sol";
import "../../contracts/mock/MockTokenPermit.sol";
import { MockStableMaster } from "../../contracts/mock/MockStableMaster.sol";
import { MockSavingsRate } from "../../contracts/mock/MockSavingsRate.sol";
import { IUniswapV3Router, PermitType, ActionType, PermitType, TransferType, ParamsSwapType, AngleRouter } from "../../contracts/AngleRouter01.sol";

contract AngleRouter01Test is BaseTest {
    uint256 private _ethereum;

    IUniswapV3Router public constant uniswapV3Router = IUniswapV3Router(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    address public constant oneInch = 0x1111111254fb6c44bAC0beD2854e76F90643097d;
    uint64 public constant BASE_PARAMS = 1e9;
    uint256 public constant BASE_TOKENS = 1 ether;

    ProxyAdmin public proxyAdminRouter = ProxyAdmin(0x1D941EF0D3Bba4ad67DBfBCeE5262F4CEE53A32b);
    AngleRouter public newImplementationRouter;
    AngleRouter public routerProxy = AngleRouter(payable(address(0xBB755240596530be0c1DE5DFD77ec6398471561d)));
    MockStableMaster public stableMaster;
    MockTokenPermit public token;
    MockSavingsRate public savingsRate;

    // can be played with to test for different decimal tokens
    uint8 public TOKEN_DECIMAL = 18;

    function setUp() public virtual override {
        _ethereum = vm.createFork(vm.envString("ETH_NODE_URI_ETH_FOUNDRY"));
        vm.selectFork(_ethereum);

        super.setUp();

        token = new MockTokenPermit("token", "token", TOKEN_DECIMAL);
        stableMaster = new MockStableMaster(address(token));
        newImplementationRouter = new AngleRouter();
        vm.prank(_GOVERNOR);
        proxyAdminRouter.upgrade(
            TransparentUpgradeableProxy(payable(address(routerProxy))),
            address(newImplementationRouter)
        );
        savingsRate = new MockSavingsRate(IERC20Metadata(address(token)));
    }

    function _randomizeSavingsRate(uint256 initShares, uint256 gainOrLoss) internal {
        // deposits some tokens
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_bob), balanceUsers);

        initShares = bound(initShares, 0, balanceUsers);
        vm.startPrank(_bob);
        token.approve(address(savingsRate), initShares);
        savingsRate.deposit(initShares, _bob);
        vm.stopPrank();

        // make a loss/profit on the savingsRate
        gainOrLoss = bound(gainOrLoss, 1, 1 ether * 1 ether);
        deal(address(token), address(savingsRate), gainOrLoss);
    }

    function testMintSavingsRateGoodPractice(
        uint256 initShares,
        uint256 shares,
        uint256 maxAmount,
        address to,
        uint256 gainOrLoss
    ) public {
        vm.assume(to != address(0) && to != address(routerProxy));
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        shares = bound(shares, 0, balanceUsers);
        uint256 previewMint = savingsRate.previewMint(shares);
        vm.assume(previewMint < balanceUsers);

        // this can be done with foundry though
        // https://book.getfoundry.sh/tutorials/testing-eip712?highlight=permit#diving-in
        PermitType[] memory paramsPermit = new PermitType[](0);
        TransferType[] memory transfers = new TransferType[](1);
        ParamsSwapType[] memory swaps = new ParamsSwapType[](0);
        ActionType[] memory actionType = new ActionType[](1);
        bytes[] memory data = new bytes[](1);

        transfers[0] = TransferType({
            inToken: IERC20(address(token)),
            receiver: address(routerProxy),
            amountIn: previewMint
        });
        actionType[0] = ActionType.mintSavingsRate;
        data[0] = abi.encode(token, savingsRate, shares, to, maxAmount);

        vm.startPrank(_alice);
        token.approve(address(routerProxy), type(uint256).max);
        // as this is a mock vault, previewMint is exactly what is needed to mint
        if (maxAmount < previewMint) {
            vm.expectRevert(bytes("ERC20: insufficient allowance"));
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
            return;
        } else {
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
        }
        vm.stopPrank();

        assertEq(savingsRate.balanceOf(address(routerProxy)), 0);
        assertEq(savingsRate.balanceOf(address(_alice)), 0);
        assertEq(savingsRate.balanceOf(address(to)), shares);

        assertEq(token.balanceOf(address(routerProxy)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - previewMint);
        assertEq(token.balanceOf(address(to)), 0);
    }

    function testMintSavingsRateForgotFunds(
        uint256 initShares,
        uint256 shares,
        uint256 maxAmount,
        uint256 gainOrLoss
    ) public {
        address to = address(routerProxy);
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        shares = bound(shares, 0, balanceUsers);
        uint256 previewMint = savingsRate.previewMint(shares);
        vm.assume(previewMint < balanceUsers);

        // this can be done with foundry though
        // https://book.getfoundry.sh/tutorials/testing-eip712?highlight=permit#diving-in
        PermitType[] memory paramsPermit = new PermitType[](0);
        TransferType[] memory transfers = new TransferType[](1);
        ParamsSwapType[] memory swaps = new ParamsSwapType[](0);
        ActionType[] memory actionType = new ActionType[](1);
        bytes[] memory data = new bytes[](1);

        transfers[0] = TransferType({
            inToken: IERC20(address(token)),
            receiver: address(routerProxy),
            amountIn: previewMint
        });
        actionType[0] = ActionType.mintSavingsRate;
        data[0] = abi.encode(token, savingsRate, shares, to, maxAmount);

        vm.startPrank(_alice);
        token.approve(address(routerProxy), type(uint256).max);
        // as this is a mock vault, previewMint is exactly what is needed to mint
        if (maxAmount < previewMint) {
            vm.expectRevert(bytes("ERC20: insufficient allowance"));
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
            return;
        } else {
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
        }
        vm.stopPrank();

        assertEq(savingsRate.balanceOf(address(routerProxy)), 0);
        assertEq(savingsRate.balanceOf(address(_alice)), shares);

        assertEq(token.balanceOf(address(routerProxy)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - previewMint);
    }

    function testDepositSavingsRateGoodPractice(
        uint256 initShares,
        uint256 amount,
        uint256 minSharesOut,
        address to,
        uint256 gainOrLoss
    ) public {
        vm.assume(to != address(0) && to != address(routerProxy));

        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        amount = bound(amount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(amount);

        PermitType[] memory paramsPermit = new PermitType[](0);
        TransferType[] memory transfers = new TransferType[](1);
        ParamsSwapType[] memory swaps = new ParamsSwapType[](0);
        ActionType[] memory actionType = new ActionType[](1);
        bytes[] memory data = new bytes[](1);

        transfers[0] = TransferType({
            inToken: IERC20(address(token)),
            receiver: address(routerProxy),
            amountIn: amount
        });
        actionType[0] = ActionType.depositSavingsRate;
        data[0] = abi.encode(token, savingsRate, BASE_PARAMS, to, minSharesOut);

        vm.startPrank(_alice);
        token.approve(address(routerProxy), type(uint256).max);
        // as this is a mock vault, previewMint is exactly what is needed to mint
        if (previewDeposit < minSharesOut) {
            vm.expectRevert(AngleRouter.TooSmallAmountOut.selector);
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
            return;
        } else {
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
        }
        vm.stopPrank();

        assertEq(savingsRate.balanceOf(address(routerProxy)), 0);
        assertEq(savingsRate.balanceOf(address(_alice)), 0);
        assertEq(savingsRate.balanceOf(address(to)), previewDeposit);

        assertEq(token.balanceOf(address(routerProxy)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - amount);
        assertEq(token.balanceOf(address(to)), 0);
    }

    function testDepositSavingsRateForgotFunds(
        uint256 initShares,
        uint256 amount,
        uint256 minSharesOut,
        uint256 gainOrLoss
    ) public {
        address to = address(routerProxy);

        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        amount = bound(amount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(amount);

        PermitType[] memory paramsPermit = new PermitType[](0);
        TransferType[] memory transfers = new TransferType[](1);
        ParamsSwapType[] memory swaps = new ParamsSwapType[](0);
        ActionType[] memory actionType = new ActionType[](1);
        bytes[] memory data = new bytes[](1);

        transfers[0] = TransferType({
            inToken: IERC20(address(token)),
            receiver: address(routerProxy),
            amountIn: amount
        });
        actionType[0] = ActionType.depositSavingsRate;
        data[0] = abi.encode(token, savingsRate, BASE_PARAMS, to, minSharesOut);

        vm.startPrank(_alice);
        token.approve(address(routerProxy), type(uint256).max);
        // as this is a mock vault, previewMint is exactly what is needed to mint
        if (previewDeposit < minSharesOut) {
            vm.expectRevert(AngleRouter.TooSmallAmountOut.selector);
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
            return;
        } else {
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
        }
        vm.stopPrank();

        assertEq(savingsRate.balanceOf(address(routerProxy)), 0);
        assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit);

        assertEq(token.balanceOf(address(routerProxy)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - amount);
    }

    function testRedeemSavingsRateGoodPractice(
        uint256 initShares,
        uint256 aliceAmount,
        uint256 propSharesBurn,
        uint256 minAmount,
        address to,
        uint256 gainOrLoss,
        uint256 gainOrLoss2
    ) public {
        vm.assume(to != address(0) && to != address(routerProxy));
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        aliceAmount = bound(aliceAmount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(aliceAmount);
        // otherwise there could be overflows
        vm.assume(previewDeposit < type(uint256).max / BASE_PARAMS);

        uint256 sharesToBurn;
        {
            // do a first deposit
            PermitType[] memory paramsPermit = new PermitType[](0);
            TransferType[] memory transfers = new TransferType[](1);
            ParamsSwapType[] memory swaps = new ParamsSwapType[](0);
            ActionType[] memory actionType = new ActionType[](1);
            bytes[] memory data = new bytes[](1);

            transfers[0] = TransferType({
                inToken: IERC20(address(token)),
                receiver: address(routerProxy),
                amountIn: aliceAmount
            });
            actionType[0] = ActionType.depositSavingsRate;
            data[0] = abi.encode(token, savingsRate, BASE_PARAMS, _alice, previewDeposit);

            vm.startPrank(_alice);
            token.approve(address(routerProxy), type(uint256).max);
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
            vm.stopPrank();

            assertEq(savingsRate.balanceOf(address(routerProxy)), 0);
            assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit);
            assertEq(savingsRate.balanceOf(address(to)), 0);
            assertEq(token.balanceOf(address(routerProxy)), 0);
            assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);
            assertEq(token.balanceOf(address(to)), 0);

            // make the savings rate have a loss / gain
            gainOrLoss2 = bound(gainOrLoss2, 1, 1 ether * 1 ether);
            deal(address(token), address(savingsRate), gainOrLoss2);

            // then redeem
            propSharesBurn = bound(propSharesBurn, 0, BASE_PARAMS);
            sharesToBurn = (propSharesBurn * previewDeposit) / BASE_PARAMS;

            transfers = new TransferType[](0);
            actionType = new ActionType[](1);
            data = new bytes[](1);

            actionType[0] = ActionType.redeemSavingsRate;
            data[0] = abi.encode(IERC20(address(token)), savingsRate, sharesToBurn, to, minAmount);

            uint256 previewRedeem = savingsRate.previewRedeem(sharesToBurn);
            vm.startPrank(_alice);
            savingsRate.approve(address(routerProxy), type(uint256).max);
            // as this is a mock vault, previewRedeem is exactly what should be received
            if (previewRedeem < minAmount) {
                vm.expectRevert(AngleRouter.TooSmallAmountOut.selector);
                routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
                return;
            } else {
                routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
            }
            vm.stopPrank();

            assertEq(token.balanceOf(address(to)), previewRedeem);
        }

        assertEq(savingsRate.balanceOf(address(routerProxy)), 0);
        assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit - sharesToBurn);
        assertEq(savingsRate.balanceOf(address(to)), 0);

        assertEq(token.balanceOf(address(routerProxy)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);
    }

    function testRedeemSavingsRateForgotFunds(
        uint256 initShares,
        uint256 aliceAmount,
        uint256 propSharesBurn,
        uint256 minAmount,
        uint256 gainOrLoss,
        uint256 gainOrLoss2
    ) public {
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        aliceAmount = bound(aliceAmount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(aliceAmount);
        // otherwise there could be overflows
        vm.assume(previewDeposit < type(uint256).max / BASE_PARAMS);

        uint256 previewRedeem;
        {
            // do a first deposit
            PermitType[] memory paramsPermit = new PermitType[](0);
            TransferType[] memory transfers = new TransferType[](1);
            ParamsSwapType[] memory swaps = new ParamsSwapType[](0);
            ActionType[] memory actionType = new ActionType[](1);
            bytes[] memory data = new bytes[](1);

            transfers[0] = TransferType({
                inToken: IERC20(address(token)),
                receiver: address(routerProxy),
                amountIn: aliceAmount
            });
            actionType[0] = ActionType.depositSavingsRate;
            data[0] = abi.encode(token, savingsRate, BASE_PARAMS, _alice, previewDeposit);

            vm.startPrank(_alice);
            token.approve(address(routerProxy), type(uint256).max);
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
            vm.stopPrank();

            assertEq(savingsRate.balanceOf(address(routerProxy)), 0);
            assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit);
            assertEq(token.balanceOf(address(routerProxy)), 0);
            assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);

            // make the savings rate have a loss / gain
            gainOrLoss2 = bound(gainOrLoss2, 1, 1 ether * 1 ether);
            deal(address(token), address(savingsRate), gainOrLoss2);

            // then redeem
            propSharesBurn = bound(propSharesBurn, 0, BASE_PARAMS);
            uint256 sharesToBurn = (propSharesBurn * previewDeposit) / BASE_PARAMS;

            transfers = new TransferType[](0);
            actionType = new ActionType[](1);
            data = new bytes[](1);

            actionType[0] = ActionType.redeemSavingsRate;
            data[0] = abi.encode(IERC20(address(token)), savingsRate, sharesToBurn, address(routerProxy), minAmount);

            previewRedeem = savingsRate.previewRedeem(sharesToBurn);
            vm.startPrank(_alice);
            savingsRate.approve(address(routerProxy), type(uint256).max);
            // as this is a mock vault, previewRedeem is exactly what should be received
            if (previewRedeem < minAmount) {
                vm.expectRevert(AngleRouter.TooSmallAmountOut.selector);
                routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
                return;
            } else {
                routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
            }
            vm.stopPrank();
            assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit - sharesToBurn);
        }

        assertEq(savingsRate.balanceOf(address(routerProxy)), 0);
        assertEq(token.balanceOf(address(routerProxy)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount + previewRedeem);
    }

    function testWithdrawSavingsRateGoodPractice(
        uint256 initShares,
        uint256 aliceAmount,
        uint256 propWithdraw,
        uint256 maxAmountBurn,
        address to,
        uint256 gainOrLoss,
        uint256 gainOrLoss2
    ) public {
        vm.assume(to != address(0) && to != address(routerProxy));
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        aliceAmount = bound(aliceAmount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(aliceAmount);
        {
            // otherwise there could be overflows
            vm.assume(previewDeposit < type(uint256).max / BASE_PARAMS);

            // do a first deposit
            PermitType[] memory paramsPermit = new PermitType[](0);
            TransferType[] memory transfers = new TransferType[](1);
            ParamsSwapType[] memory swaps = new ParamsSwapType[](0);
            ActionType[] memory actionType = new ActionType[](1);
            bytes[] memory data = new bytes[](1);

            transfers[0] = TransferType({
                inToken: IERC20(address(token)),
                receiver: address(routerProxy),
                amountIn: aliceAmount
            });
            actionType[0] = ActionType.depositSavingsRate;
            data[0] = abi.encode(token, savingsRate, BASE_PARAMS, _alice, previewDeposit);

            vm.startPrank(_alice);
            token.approve(address(routerProxy), type(uint256).max);
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
            vm.stopPrank();

            // make the savings rate have a loss / gain
            gainOrLoss2 = bound(gainOrLoss2, 1, 1 ether * 1 ether);
            deal(address(token), address(savingsRate), gainOrLoss2);

            // then withdraw
            propWithdraw = bound(propWithdraw, 0, BASE_PARAMS);
            uint256 withdraw = (propWithdraw * aliceAmount) / BASE_PARAMS;
            // overflow in the `previewWithdraw` function
            vm.assume(savingsRate.totalSupply() > 0);
            if (withdraw > 0) vm.assume(savingsRate.totalSupply() < type(uint256).max / withdraw);

            transfers = new TransferType[](0);
            actionType[0] = ActionType.withdrawSavingsRate;
            data[0] = abi.encode(IERC20(address(token)), savingsRate, withdraw, to, maxAmountBurn);

            uint256 previewWithdraw = savingsRate.previewWithdraw(withdraw);

            vm.startPrank(_alice);
            savingsRate.approve(address(routerProxy), type(uint256).max);
            if (withdraw > savingsRate.maxWithdraw(_alice)) {
                vm.expectRevert(bytes("ERC4626: withdraw more than max"));
                routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
                return;
            } else if (previewWithdraw > maxAmountBurn) {
                vm.expectRevert(AngleRouter.TooSmallAmountOut.selector);
                routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
                return;
            } else {
                routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
            }
            vm.stopPrank();

            assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit - previewWithdraw);
            assertEq(token.balanceOf(address(to)), withdraw);
        }

        assertEq(savingsRate.balanceOf(address(routerProxy)), 0);
        assertEq(savingsRate.balanceOf(address(to)), 0);

        assertEq(token.balanceOf(address(routerProxy)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);
    }

    function testWithdrawSavingsRateForgotFunds(
        uint256 initShares,
        uint256 aliceAmount,
        uint256 propWithdraw,
        uint256 maxAmountBurn,
        uint256 gainOrLoss,
        uint256 gainOrLoss2
    ) public {
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        aliceAmount = bound(aliceAmount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(aliceAmount);
        {
            // otherwise there could be overflows
            vm.assume(previewDeposit < type(uint256).max / BASE_PARAMS);

            // do a first deposit
            PermitType[] memory paramsPermit = new PermitType[](0);
            TransferType[] memory transfers = new TransferType[](1);
            ParamsSwapType[] memory swaps = new ParamsSwapType[](0);
            ActionType[] memory actionType = new ActionType[](1);
            bytes[] memory data = new bytes[](1);

            transfers[0] = TransferType({
                inToken: IERC20(address(token)),
                receiver: address(routerProxy),
                amountIn: aliceAmount
            });
            actionType[0] = ActionType.depositSavingsRate;
            data[0] = abi.encode(token, savingsRate, BASE_PARAMS, _alice, previewDeposit);

            vm.startPrank(_alice);
            token.approve(address(routerProxy), type(uint256).max);
            routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
            vm.stopPrank();

            // make the savings rate have a loss / gain
            gainOrLoss2 = bound(gainOrLoss2, 1, 1 ether * 1 ether);
            deal(address(token), address(savingsRate), gainOrLoss2);

            // then withdraw
            propWithdraw = bound(propWithdraw, 0, BASE_PARAMS);
            uint256 withdraw = (propWithdraw * aliceAmount) / BASE_PARAMS;
            // overflow in the `previewWithdraw` function
            vm.assume(savingsRate.totalSupply() > 0);
            if (withdraw > 0) vm.assume(savingsRate.totalSupply() < type(uint256).max / withdraw);

            transfers = new TransferType[](0);
            actionType[0] = ActionType.withdrawSavingsRate;
            data[0] = abi.encode(IERC20(address(token)), savingsRate, withdraw, address(routerProxy), maxAmountBurn);

            {
                uint256 previewWithdraw = savingsRate.previewWithdraw(withdraw);

                vm.startPrank(_alice);
                savingsRate.approve(address(routerProxy), type(uint256).max);
                if (withdraw > savingsRate.maxWithdraw(_alice)) {
                    vm.expectRevert(bytes("ERC4626: withdraw more than max"));
                    routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
                    return;
                } else if (previewWithdraw > maxAmountBurn) {
                    vm.expectRevert(AngleRouter.TooSmallAmountOut.selector);
                    routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
                    return;
                } else {
                    routerProxy.mixer(paramsPermit, transfers, swaps, actionType, data);
                }
                vm.stopPrank();

                assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit - previewWithdraw);
            }
            assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount + withdraw);
        }

        assertEq(savingsRate.balanceOf(address(routerProxy)), 0);
        assertEq(token.balanceOf(address(routerProxy)), 0);
    }
}
