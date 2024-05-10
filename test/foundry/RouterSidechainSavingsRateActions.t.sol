// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import { ERC4626 } from "@openzeppelin/contracts/token/ERC20/extensions/ERC4626.sol";

import "./BaseTest.t.sol";
import "../../contracts/mock/MockTokenPermit.sol";
import { MockSavingsRate } from "../../contracts/mock/MockSavingsRate.sol";
import { MockRouterSidechain, IUniswapV3Router, PermitType, ActionType, PermitType, BaseAngleRouterSidechain, BaseRouter } from "../../contracts/mock/MockRouterSidechain.sol";

contract RouterSidechainSavingsRateActionsTest is BaseTest {
    IUniswapV3Router public constant uniswapV3Router = IUniswapV3Router(0xE592427A0AEce92De3Edee1F18E0157C05861564);
    address public constant oneInch = 0x1111111254fb6c44bAC0beD2854e76F90643097d;
    uint64 public constant BASE_PARAMS = 1e9;
    uint256 public constant BASE_TOKENS = 1 ether;

    MockRouterSidechain public implementationRouter;
    MockRouterSidechain public router;
    MockTokenPermit public token;
    MockSavingsRate public savingsRate;

    // can be played with to test for different decimal tokens
    uint8 public TOKEN_DECIMAL = 18;

    function setUp() public virtual override {
        super.setUp();
        token = new MockTokenPermit("token", "token", TOKEN_DECIMAL);
        implementationRouter = new MockRouterSidechain();
        router = MockRouterSidechain(
            payable(
                address(
                    deployUpgradeable(
                        address(implementationRouter),
                        abi.encodeWithSelector(
                            implementationRouter.initializeRouter.selector,
                            coreBorrow,
                            uniswapV3Router,
                            oneInch
                        )
                    )
                )
            )
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

    function testMint4626(
        uint256 initShares,
        uint256 shares,
        uint256 maxAmount,
        address to,
        uint256 gainOrLoss
    ) public {
        vm.assume(to != address(0) && to != address(savingsRate) && to != address(router));
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        shares = bound(shares, 0, balanceUsers);
        uint256 previewMint = savingsRate.previewMint(shares);
        vm.assume(previewMint < balanceUsers);

        // this can be done with foundry though
        // https://book.getfoundry.sh/tutorials/testing-eip712?highlight=permit#diving-in
        PermitType[] memory paramsPermit = new PermitType[](0);
        ActionType[] memory actionType = new ActionType[](3);
        bytes[] memory data = new bytes[](3);

        actionType[0] = ActionType.transfer;
        actionType[1] = ActionType.mint4626;
        actionType[2] = ActionType.sweep;

        data[0] = abi.encode(address(token), address(router), previewMint);
        data[1] = abi.encode(token, savingsRate, shares, to, maxAmount);
        data[2] = abi.encode(address(token), 0, to);

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

    function testDeposit4626(
        uint256 initShares,
        uint256 amount,
        uint256 minSharesOut,
        address to,
        uint256 gainOrLoss
    ) public {
        vm.assume(to != address(0) && to != address(savingsRate) && to != address(router));
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        amount = bound(amount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(amount);

        // this can be done with foundry though
        // https://book.getfoundry.sh/tutorials/testing-eip712?highlight=permit#diving-in
        PermitType[] memory paramsPermit = new PermitType[](0);
        ActionType[] memory actionType = new ActionType[](2);
        bytes[] memory data = new bytes[](2);

        actionType[0] = ActionType.transfer;
        actionType[1] = ActionType.deposit4626;

        data[0] = abi.encode(address(token), address(router), amount);
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

    function testRedeem4626(
        uint256 initShares,
        uint256 aliceAmount,
        uint256 propSharesBurn,
        uint256 minAmount,
        address to,
        uint256 gainOrLoss,
        uint256 gainOrLoss2
    ) public {
        vm.assume(to != address(0) && to != address(savingsRate) && to != address(router));
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        aliceAmount = bound(aliceAmount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(aliceAmount);
        // otherwise there could be overflows
        vm.assume(previewDeposit < type(uint256).max / BASE_PARAMS);

        // do a first deposit
        PermitType[] memory paramsPermit = new PermitType[](0);
        ActionType[] memory actionType = new ActionType[](2);
        bytes[] memory data = new bytes[](2);

        actionType[0] = ActionType.transfer;
        actionType[1] = ActionType.deposit4626;

        data[0] = abi.encode(address(token), address(router), aliceAmount);
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
        uint256 sharesToBurn = (propSharesBurn * previewDeposit) / BASE_PARAMS;
        uint256 previewRedeem = savingsRate.previewRedeem(sharesToBurn);

        actionType = new ActionType[](1);
        data = new bytes[](1);
        actionType[0] = ActionType.redeem4626;
        data[0] = abi.encode(savingsRate, sharesToBurn, to, minAmount);

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

        assertEq(savingsRate.balanceOf(address(router)), 0);
        assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit - sharesToBurn);
        assertEq(savingsRate.balanceOf(address(to)), 0);

        assertEq(token.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);
        assertEq(token.balanceOf(address(to)), previewRedeem);
    }

    function testWithdraw4626(
        uint256 initShares,
        uint256 aliceAmount,
        uint256 propWithdraw,
        uint256 maxAmountBurn,
        address to,
        uint256 gainOrLoss,
        uint256 gainOrLoss2
    ) public {
        vm.assume(to != address(0) && to != address(savingsRate) && to != address(router));
        uint256 balanceUsers = BASE_TOKENS * 1 ether;
        deal(address(token), address(_alice), balanceUsers);

        _randomizeSavingsRate(gainOrLoss, initShares);

        aliceAmount = bound(aliceAmount, 0, balanceUsers);
        uint256 previewDeposit = savingsRate.previewDeposit(aliceAmount);

        // do a first deposit
        PermitType[] memory paramsPermit = new PermitType[](0);
        ActionType[] memory actionType = new ActionType[](2);
        bytes[] memory data = new bytes[](2);

        actionType[0] = ActionType.transfer;
        actionType[1] = ActionType.deposit4626;

        data[0] = abi.encode(address(token), address(router), aliceAmount);
        data[1] = abi.encode(token, savingsRate, aliceAmount, _alice, previewDeposit);

        vm.startPrank(_alice);
        token.approve(address(router), type(uint256).max);
        router.mixer(paramsPermit, actionType, data);
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

        uint256 previewWithdraw = savingsRate.previewWithdraw(withdraw);

        actionType = new ActionType[](1);
        data = new bytes[](1);
        actionType[0] = ActionType.withdraw4626;
        data[0] = abi.encode(savingsRate, withdraw, to, maxAmountBurn);

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

        assertEq(savingsRate.balanceOf(address(router)), 0);
        assertEq(savingsRate.balanceOf(address(_alice)), previewDeposit - previewWithdraw);
        assertEq(savingsRate.balanceOf(address(to)), 0);

        assertEq(token.balanceOf(address(router)), 0);
        assertEq(token.balanceOf(address(_alice)), balanceUsers - aliceAmount);
        assertEq(token.balanceOf(address(to)), withdraw);
    }
}
