// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

import "./BaseTest.t.sol";
import "../../contracts/interfaces/ILiquidityGauge.sol";
import "../../contracts/interfaces/IPoolManager.sol";
import "../../contracts/interfaces/IStableMasterFront.sol";
import "../../contracts/mock/MockTokenPermit.sol";
import { MockStableMaster } from "../../contracts/mock/MockStableMaster.sol";
import { MockCoreBorrow } from "../../contracts/mock/MockCoreBorrow.sol";
import { MockSavingsRate } from "../../contracts/mock/MockSavingsRate.sol";
import { AngleRouterMainnet, IERC20, IPoolManager, ILiquidityGauge } from "../../contracts/implementations/mainnet/AngleRouterMainnet.sol";
import { IUniswapV3Router, PermitType, ActionType, PermitType, BaseRouter } from "../../contracts/BaseRouter.sol";

contract AngleRouterMainnetTest is BaseTest {
    uint256 private _ethereum;

    IUniswapV3Router public constant uniswapV3Router = IUniswapV3Router(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    address public constant oneInch = 0x1111111254fb6c44bAC0beD2854e76F90643097d;
    uint64 public constant BASE_PARAMS = 1e9;
    uint256 public constant BASE_TOKENS = 1 ether;

    AngleRouterMainnet public router;
    MockTokenPermit public token;
    MockSavingsRate public savingsRate;
    MockCoreBorrow public core;

    // can be played with to test for different decimal tokens
    uint8 public TOKEN_DECIMAL = 18;

    function setUp() public virtual override {
        super.setUp();

        token = new MockTokenPermit("token", "token", TOKEN_DECIMAL);
        router = new AngleRouterMainnet();
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

    function testMint4626GoodPractice(
        uint256 initShares,
        uint256 shares,
        uint256 maxAmount,
        address to,
        uint256 gainOrLoss
    ) public {
        vm.assume(to != address(0) && to != address(router));
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        shares = bound(shares, 0, balanceUsers);
        uint256 previewMint = savingsRate.previewMint(shares);
        vm.assume(previewMint < balanceUsers);

        PermitType[] memory paramsPermit = new PermitType[](0);
        ActionType[] memory actionType = new ActionType[](2);
        bytes[] memory data = new bytes[](2);

        actionType[0] = ActionType.transfer;
        data[0] = abi.encode(token, router, previewMint);
        actionType[1] = ActionType.mint4626;
        data[1] = abi.encode(token, savingsRate, shares, to, maxAmount);

        vm.startPrank(_alice);
        token.approve(address(router), type(uint256).max);
        // as this is a mock vault, previewMint is exactly what is needed to mint
        if (maxAmount < previewMint) {
            vm.expectRevert(BaseRouter.TooSmallAmountOut.selector);
            router.mixer(paramsPermit, actionType, data);
            return;
        } else {
            router.mixer(paramsPermit, actionType, data);
        }
        vm.stopPrank();

        assertEq(savingsRate.balanceOf(address(router)), 0);
        assertEq(savingsRate.balanceOf(address(_alice)), 0);
        assertEq(savingsRate.balanceOf(address(to)), shares);

        assertEq(token.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - previewMint);
        assertEq(token.balanceOf(address(to)), 0);
    }

    function testMint4626ForgotFunds(
        uint256 initShares,
        uint256 shares,
        uint256 maxAmount,
        uint256 gainOrLoss
    ) public {
        address to = address(router);
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        shares = bound(shares, 0, balanceUsers);
        uint256 previewMint = savingsRate.previewMint(shares);
        vm.assume(previewMint < balanceUsers);

        // this can be done with foundry though
        // https://book.getfoundry.sh/tutorials/testing-eip712?highlight=permit#diving-in
        PermitType[] memory paramsPermit = new PermitType[](0);
        ActionType[] memory actionType = new ActionType[](2);
        bytes[] memory data = new bytes[](2);

        actionType[0] = ActionType.transfer;
        data[0] = abi.encode(token, router, previewMint);
        actionType[1] = ActionType.mint4626;
        data[1] = abi.encode(token, savingsRate, shares, to, maxAmount);

        vm.startPrank(_alice);
        token.approve(address(router), type(uint256).max);
        // as this is a mock vault, previewMint is exactly what is needed to mint
        if (maxAmount < previewMint) {
            vm.expectRevert(BaseRouter.TooSmallAmountOut.selector);
            router.mixer(paramsPermit, actionType, data);
            return;
        } else {
            router.mixer(paramsPermit, actionType, data);
        }
        vm.stopPrank();

        assertEq(savingsRate.balanceOf(address(to)), shares);

        assertEq(token.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - previewMint);
        assertEq(token.balanceOf(address(to)), 0);
    }

    function testDeposit4626GoodPractice(
        uint256 initShares,
        uint256 amount,
        uint256 minSharesOut,
        address to,
        uint256 gainOrLoss
    ) public {
        vm.assume(to != address(0) && to != address(router));

        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        amount = bound(amount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(amount);

        PermitType[] memory paramsPermit = new PermitType[](0);
        ActionType[] memory actionType = new ActionType[](2);
        bytes[] memory data = new bytes[](2);

        actionType[0] = ActionType.transfer;
        data[0] = abi.encode(token, router, amount);
        actionType[1] = ActionType.deposit4626;
        data[1] = abi.encode(token, savingsRate, amount, to, minSharesOut);

        vm.startPrank(_alice);
        token.approve(address(router), type(uint256).max);
        // as this is a mock vault, previewMint is exactly what is needed to mint
        if (previewDeposit < minSharesOut) {
            vm.expectRevert(BaseRouter.TooSmallAmountOut.selector);
            router.mixer(paramsPermit, actionType, data);
            return;
        } else {
            router.mixer(paramsPermit, actionType, data);
        }
        vm.stopPrank();

        assertEq(savingsRate.balanceOf(address(router)), 0);
        assertEq(savingsRate.balanceOf(address(_alice)), 0);
        assertEq(savingsRate.balanceOf(address(to)), previewDeposit);

        assertEq(token.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - amount);
        assertEq(token.balanceOf(address(to)), 0);
    }

    function testDeposit4626ForgotFunds(
        uint256 initShares,
        uint256 amount,
        uint256 minSharesOut,
        uint256 gainOrLoss
    ) public {
        address to = address(router);

        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        amount = bound(amount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(amount);

        PermitType[] memory paramsPermit = new PermitType[](0);
        ActionType[] memory actionType = new ActionType[](2);
        bytes[] memory data = new bytes[](2);

        actionType[0] = ActionType.transfer;
        data[0] = abi.encode(token, router, amount);
        actionType[1] = ActionType.deposit4626;
        data[1] = abi.encode(token, savingsRate, amount, to, minSharesOut);

        vm.startPrank(_alice);
        token.approve(address(router), type(uint256).max);
        // as this is a mock vault, previewMint is exactly what is needed to mint
        if (previewDeposit < minSharesOut) {
            vm.expectRevert(BaseRouter.TooSmallAmountOut.selector);
            router.mixer(paramsPermit, actionType, data);
            return;
        } else {
            router.mixer(paramsPermit, actionType, data);
        }
        vm.stopPrank();

        assertEq(savingsRate.balanceOf(address(to)), previewDeposit);

        assertEq(token.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - amount);
    }

    function testRedeem4626GoodPractice(
        uint256 initShares,
        uint256 aliceAmount,
        uint256 propSharesBurn,
        uint256 minAmount,
        address to,
        uint256 gainOrLoss,
        uint256 gainOrLoss2
    ) public {
        vm.assume(to != address(0) && to != address(router));
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
            ActionType[] memory actionType = new ActionType[](2);
            bytes[] memory data = new bytes[](2);

            actionType[0] = ActionType.transfer;
            data[0] = abi.encode(token, router, aliceAmount);
            actionType[1] = ActionType.deposit4626;
            data[1] = abi.encode(token, savingsRate, aliceAmount, _alice, previewDeposit);

            vm.startPrank(_alice);
            token.approve(address(router), type(uint256).max);
            router.mixer(paramsPermit, actionType, data);
            vm.stopPrank();

            assertEq(savingsRate.balanceOf(address(router)), 0);
            assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit);
            assertEq(savingsRate.balanceOf(address(to)), 0);
            assertEq(token.balanceOf(address(router)), 0);
            assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);
            assertEq(token.balanceOf(address(to)), 0);

            // make the savings rate have a loss / gain
            gainOrLoss2 = bound(gainOrLoss2, 1, 1 ether * 1 ether);
            deal(address(token), address(savingsRate), gainOrLoss2);

            // then redeem
            propSharesBurn = bound(propSharesBurn, 0, BASE_PARAMS);
            sharesToBurn = (propSharesBurn * previewDeposit) / BASE_PARAMS;

            actionType = new ActionType[](1);
            data = new bytes[](1);

            actionType[0] = ActionType.redeem4626;
            data[0] = abi.encode(savingsRate, sharesToBurn, to, minAmount);

            uint256 previewRedeem = savingsRate.previewRedeem(sharesToBurn);
            vm.startPrank(_alice);
            savingsRate.approve(address(router), type(uint256).max);
            // as this is a mock vault, previewRedeem is exactly what should be received
            if (previewRedeem < minAmount) {
                vm.expectRevert(BaseRouter.TooSmallAmountOut.selector);
                router.mixer(paramsPermit, actionType, data);
                return;
            } else {
                router.mixer(paramsPermit, actionType, data);
            }
            vm.stopPrank();
            assertEq(token.balanceOf(address(to)), previewRedeem);
        }

        assertEq(savingsRate.balanceOf(address(router)), 0);
        assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit - sharesToBurn);
        assertEq(savingsRate.balanceOf(address(to)), 0);

        assertEq(token.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);
    }

    function testRedeem4626ForgotFunds(
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
            ActionType[] memory actionType = new ActionType[](2);
            bytes[] memory data = new bytes[](2);

            actionType[0] = ActionType.transfer;
            data[0] = abi.encode(token, router, aliceAmount);
            actionType[1] = ActionType.deposit4626;
            data[1] = abi.encode(token, savingsRate, aliceAmount, _alice, previewDeposit);

            vm.startPrank(_alice);
            token.approve(address(router), type(uint256).max);
            router.mixer(paramsPermit, actionType, data);
            vm.stopPrank();

            assertEq(savingsRate.balanceOf(address(router)), 0);
            assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit);
            assertEq(token.balanceOf(address(router)), 0);
            assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);

            // make the savings rate have a loss / gain
            gainOrLoss2 = bound(gainOrLoss2, 1, 1 ether * 1 ether);
            deal(address(token), address(savingsRate), gainOrLoss2);

            // then redeem
            propSharesBurn = bound(propSharesBurn, 0, BASE_PARAMS);
            uint256 sharesToBurn = (propSharesBurn * previewDeposit) / BASE_PARAMS;

            actionType = new ActionType[](1);
            data = new bytes[](1);

            actionType[0] = ActionType.redeem4626;
            data[0] = abi.encode(savingsRate, sharesToBurn, address(router), minAmount);

            previewRedeem = savingsRate.previewRedeem(sharesToBurn);
            vm.startPrank(_alice);
            savingsRate.approve(address(router), type(uint256).max);
            // as this is a mock vault, previewRedeem is exactly what should be received
            if (previewRedeem < minAmount) {
                vm.expectRevert(BaseRouter.TooSmallAmountOut.selector);
                router.mixer(paramsPermit, actionType, data);
                return;
            } else {
                router.mixer(paramsPermit, actionType, data);
            }
            vm.stopPrank();
            assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit - sharesToBurn);
        }

        assertEq(savingsRate.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(router)), previewRedeem);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);
    }

    function testWithdraw4626GoodPractice(
        uint256 initShares,
        uint256 aliceAmount,
        uint256 withdraw,
        uint256 maxAmountBurn,
        address to,
        uint256 gainOrLoss,
        uint256 gainOrLoss2
    ) public {
        vm.assume(to != address(0) && to != address(router));
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        aliceAmount = bound(aliceAmount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(aliceAmount);
        // otherwise there could be overflows
        vm.assume(previewDeposit < type(uint256).max / BASE_PARAMS);

        {
            // do a first deposit
            PermitType[] memory paramsPermit = new PermitType[](0);
            ActionType[] memory actionType = new ActionType[](2);
            bytes[] memory data = new bytes[](2);

            actionType[0] = ActionType.transfer;
            data[0] = abi.encode(token, router, aliceAmount);
            actionType[1] = ActionType.deposit4626;
            data[1] = abi.encode(token, savingsRate, aliceAmount, _alice, previewDeposit);

            vm.startPrank(_alice);
            token.approve(address(router), type(uint256).max);
            router.mixer(paramsPermit, actionType, data);
            vm.stopPrank();

            assertEq(savingsRate.balanceOf(address(router)), 0);
            assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit);
            assertEq(savingsRate.balanceOf(address(to)), 0);
            assertEq(token.balanceOf(address(router)), 0);
            assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);
            assertEq(token.balanceOf(address(to)), 0);

            // make the savings rate have a loss / gain
            gainOrLoss2 = bound(gainOrLoss2, 1, 1 ether * 1 ether);
            deal(address(token), address(savingsRate), gainOrLoss2);

            uint256 maxWithdraw = savingsRate.maxWithdraw(_alice);

            // then withdraw
            withdraw = bound(withdraw, 0, maxWithdraw);
            // overflow in the `previewWithdraw` function
            vm.assume(savingsRate.totalSupply() > 0);
            if (withdraw > 0) vm.assume(savingsRate.totalSupply() < type(uint256).max / withdraw);

            actionType = new ActionType[](1);
            data = new bytes[](1);

            actionType[0] = ActionType.withdraw4626;
            data[0] = abi.encode(savingsRate, withdraw, to, maxAmountBurn);

            uint256 previewWithdraw = savingsRate.previewWithdraw(withdraw);
            vm.startPrank(_alice);
            savingsRate.approve(address(router), type(uint256).max);
            if (withdraw > savingsRate.maxWithdraw(_alice)) {
                vm.expectRevert(bytes("ERC4626: withdraw more than max"));
                router.mixer(paramsPermit, actionType, data);
                return;
            } else if (previewWithdraw > maxAmountBurn) {
                vm.expectRevert(BaseRouter.TooSmallAmountOut.selector);
                router.mixer(paramsPermit, actionType, data);
                return;
            } else {
                router.mixer(paramsPermit, actionType, data);
            }
            vm.stopPrank();
            assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit - previewWithdraw);
            assertEq(token.balanceOf(address(to)), withdraw);
        }

        assertEq(savingsRate.balanceOf(address(router)), 0);
        assertEq(savingsRate.balanceOf(address(to)), 0);

        assertEq(token.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);
    }

    function testWithdraw4626ForgotFunds(
        uint256 initShares,
        uint256 aliceAmount,
        uint256 withdraw,
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
            ActionType[] memory actionType = new ActionType[](2);
            bytes[] memory data = new bytes[](2);

            actionType[0] = ActionType.transfer;
            data[0] = abi.encode(token, router, aliceAmount);
            actionType[1] = ActionType.deposit4626;
            data[1] = abi.encode(token, savingsRate, aliceAmount, _alice, previewDeposit);

            vm.startPrank(_alice);
            token.approve(address(router), type(uint256).max);
            router.mixer(paramsPermit, actionType, data);
            vm.stopPrank();

            // make the savings rate have a loss / gain
            gainOrLoss2 = bound(gainOrLoss2, 1, 1 ether * 1 ether);
            deal(address(token), address(savingsRate), gainOrLoss2);

            // then withdraw
            uint256 maxWithdraw = savingsRate.maxWithdraw(_alice);
            withdraw = bound(withdraw, 0, maxWithdraw);
            // overflow in the `previewWithdraw` function
            vm.assume(savingsRate.totalSupply() > 0);
            if (withdraw > 0) vm.assume(savingsRate.totalSupply() < type(uint256).max / withdraw);

            actionType = new ActionType[](1);
            data = new bytes[](1);

            actionType[0] = ActionType.withdraw4626;
            data[0] = abi.encode(savingsRate, withdraw, address(router), maxAmountBurn);

            {
                uint256 previewWithdraw = savingsRate.previewWithdraw(withdraw);

                vm.startPrank(_alice);
                savingsRate.approve(address(router), type(uint256).max);
                if (withdraw > savingsRate.maxWithdraw(_alice)) {
                    vm.expectRevert(bytes("ERC4626: withdraw more than max"));
                    router.mixer(paramsPermit, actionType, data);
                    return;
                } else if (previewWithdraw > maxAmountBurn) {
                    vm.expectRevert(BaseRouter.TooSmallAmountOut.selector);
                    router.mixer(paramsPermit, actionType, data);
                    return;
                } else {
                    router.mixer(paramsPermit, actionType, data);
                }
                vm.stopPrank();

                assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit - previewWithdraw);
            }
            assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);
            assertEq(token.balanceOf(address(router)), withdraw);
            assertEq(savingsRate.balanceOf(address(router)), 0);
        }
    }
}
