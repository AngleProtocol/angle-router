// SPDX-License-Identifier: GPL-3.0

pragma solidity ^0.8.17;

import "../implementations/mainnet/AngleRouterMainnet.sol";

contract MockAngleRouterMainnet is AngleRouterMainnet {
    address public veAngle;

    function setAngleAndVeANGLE(address _veAngle) external {
        veAngle = _veAngle;
    }

    function _getVeANGLE() internal view override returns (IVeANGLE) {
        return IVeANGLE(veAngle);
    }

    function addStableMaster(IERC20 stablecoin, IStableMasterFront stableMaster) external {
        mapStableMasters[stablecoin] = stableMaster;
    }

    function addPairs(
        IERC20[] calldata stablecoins,
        IPoolManager[] calldata poolManagers,
        ILiquidityGauge[] calldata liquidityGauges,
        bool[] calldata justLiquidityGauges
    ) external {
        for (uint256 i; i < stablecoins.length; ++i) {
            IStableMasterFront stableMaster = mapStableMasters[stablecoins[i]];
            _addPair(stableMaster, poolManagers[i], liquidityGauges[i], justLiquidityGauges[i]);
        }
    }

    function _addPair(
        IStableMasterFront stableMaster,
        IPoolManager poolManager,
        ILiquidityGauge liquidityGauge,
        bool justLiquidityGauge
    ) internal {
        // Fetching the associated `sanToken` and `perpetualManager` from the contract
        (
            IERC20 collateral,
            ISanToken sanToken,
            IPerpetualManagerFrontWithClaim perpetualManager,
            ,
            ,
            ,
            ,
            ,

        ) = stableMaster.collateralMap(poolManager);
        // Reverting if the poolManager is not a valid `poolManager`
        if (address(collateral) == address(0)) revert InvalidParams();
        Pairs storage _pairs = mapPoolManagers[stableMaster][collateral];
        if (justLiquidityGauge) {
            // Cannot specify a liquidity gauge if the associated poolManager does not exist
            if (address(_pairs.poolManager) == address(0)) revert ZeroAddress();
            ILiquidityGauge gauge = _pairs.gauge;
            if (address(gauge) != address(0)) {
                _changeAllowance(IERC20(address(sanToken)), address(gauge), 0);
            }
        } else {
            // Checking if the pair has not already been initialized: if yes we need to make the function revert
            // otherwise we could end up with still approved `PoolManager` and `PerpetualManager` contracts
            if (address(_pairs.poolManager) != address(0)) revert InvalidParams();
            _pairs.poolManager = poolManager;
            _pairs.perpetualManager = IPerpetualManagerFrontWithClaim(address(perpetualManager));
            _pairs.sanToken = sanToken;
            _changeAllowance(collateral, address(stableMaster), type(uint256).max);
            _changeAllowance(collateral, address(perpetualManager), type(uint256).max);
        }
        _pairs.gauge = liquidityGauge;
        if (address(liquidityGauge) != address(0)) {
            if (address(sanToken) != liquidityGauge.staking_token()) revert InvalidParams();
            _changeAllowance(IERC20(address(sanToken)), address(liquidityGauge), type(uint256).max);
        }
    }
}

contract MockAngleRouterMainnet2 is AngleRouterMainnet {
    function getVeANGLE() external view returns (IVeANGLE) {
        return _getVeANGLE();
    }
}
