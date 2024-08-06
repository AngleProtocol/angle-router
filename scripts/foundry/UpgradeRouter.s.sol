// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.17;

import "forge-std/Script.sol";
import "utils/src/CommonUtils.sol";
import { AngleRouterMainnet } from "contracts/implementations/mainnet/AngleRouterMainnet.sol";
import { AngleRouterArbitrum } from "contracts/implementations/arbitrum/AngleRouterArbitrum.sol";
import { AngleRouterOptimism } from "contracts/implementations/optimism/AngleRouterOptimism.sol";
import { AngleRouterAvalanche } from "contracts/implementations/avalanche/AngleRouterAvalanche.sol";
import { AngleRouterBase } from "contracts/implementations/base/AngleRouterBase.sol";
import { AngleRouterCelo } from "contracts/implementations/celo/AngleRouterCelo.sol";
import { AngleRouterGnosis } from "contracts/implementations/gnosis/AngleRouterGnosis.sol";
import { AngleRouterLinea } from "contracts/implementations/linea/AngleRouterLinea.sol";
import { AngleRouterPolygon } from "contracts/implementations/polygon/AngleRouterPolygon.sol";

contract UpgradeRouterScript is Script, CommonUtils {
    function run() public {
        uint256 chainId = vm.envUint("CHAIN_ID");

        address routerImpl;
        if (chainId == CHAIN_ETHEREUM) {
            routerImpl = address(new AngleRouterMainnet());
        } else if (chainId == CHAIN_ARBITRUM) {
            routerImpl = address(new AngleRouterArbitrum());
        } else if (chainId == CHAIN_OPTIMISM) {
            routerImpl = address(new AngleRouterOptimism());
        } else if (chainId == CHAIN_AVALANCHE) {
            routerImpl = address(new AngleRouterAvalanche());
        } else if (chainId == CHAIN_BASE) {
            routerImpl = address(new AngleRouterBase());
        } else if (chainId == CHAIN_CELO) {
            routerImpl = address(new AngleRouterCelo());
        } else if (chainId == CHAIN_GNOSIS) {
            routerImpl = address(new AngleRouterGnosis());
        } else if (chainId == CHAIN_LINEA) {
            routerImpl = address(new AngleRouterLinea());
        } else if (chainId == CHAIN_POLYGON) {
            routerImpl = address(new AngleRouterPolygon());
        }

        console.log("Deployed router implementation at address: %s", routerImpl);
    }
}
