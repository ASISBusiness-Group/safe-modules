// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.20;

import {SafeWebAuthnSignerFactory} from "../contracts/SafeWebAuthnSignerFactory.sol";
import {ISafe} from "@safe-global/safe-contracts/contracts/Safe.sol";
import {SafeProxyFactory} from "@safe-global/safe-contracts/contracts/proxies/SafeProxyFactory.sol";
import {SafeProxy} from "@safe-global/safe-contracts/contracts/proxies/SafeProxy.sol";
import {P256} from "../contracts/libraries/P256.sol";

/**
 * @title Safe WebAuthn Deployment Script
 * @dev Script to deploy SafeWebAuthnSignerFactory and create Safe accounts with WebAuthn signers
 */
contract DeployWebAuthnSafe {
    SafeWebAuthnSignerFactory public factory;
    SafeProxyFactory public proxyFactory;
    address public safeSingleton;

    /**
     * @notice Deploys the SafeWebAuthnSignerFactory
     * @return factoryAddress The address of the deployed factory
     */
    function deployFactory() external returns (address factoryAddress) {
        factory = new SafeWebAuthnSignerFactory();
        factoryAddress = address(factory);
    }

    /**
     * @notice Calculates the deterministic address of a WebAuthn signer
     * @dev Uses CREATE2 to predict the signer address before deployment
     * @param x The x-coordinate of the P-256 public key
     * @param y The y-coordinate of the P-256 public key
     * @param verifiers The P-256 verifiers to use
     * @return signerAddress The calculated signer address
     */
    function calculateSignerAddress(
        uint256 x,
        uint256 y,
        P256.Verifiers verifiers
    ) external view returns (address signerAddress) {
        return factory.getSigner(x, y, verifiers);
    }

    /**
     * @notice Creates a WebAuthn signer
     * @param x The x-coordinate of the P-256 public key
     * @param y The y-coordinate of the P-256 public key
     * @param verifiers The P-256 verifiers to use
     * @return signerAddress The address of the created signer
     */
    function createWebAuthnSigner(
        uint256 x,
        uint256 y,
        P256.Verifiers verifiers
    ) external returns (address signerAddress) {
        return factory.createSigner(x, y, verifiers);
    }

    /**
     * @notice Creates a Safe account with a WebAuthn signer
     * @dev The signer will be the only owner of the Safe
     * @param x The x-coordinate of the P-256 public key
     * @param y The y-coordinate of the P-256 public key
     * @param verifiers The P-256 verifiers to use
     * @param safeSingletonAddr The address of the Safe singleton implementation
     * @param proxyFactoryAddr The address of the SafeProxyFactory
     * @return safeAddress The address of the created Safe account
     * @return signerAddress The address of the WebAuthn signer
     */
    function createSafeWithWebAuthnSigner(
        uint256 x,
        uint256 y,
        P256.Verifiers verifiers,
        address safeSingletonAddr,
        address proxyFactoryAddr
    ) external returns (address safeAddress, address signerAddress) {
        // Step 1: Create or get the WebAuthn signer
        signerAddress = factory.createSigner(x, y, verifiers);

        // Step 2: Prepare the Safe initialization data
        // The signer is the sole owner with a threshold of 1
        address[] memory owners = new address[](1);
        owners[0] = signerAddress;
        uint256 threshold = 1;

        bytes memory initData = abi.encodeWithSignature(
            "setup(address[],uint256,address,bytes,address,address,uint256,address)",
            owners,
            threshold,
            address(0), // No to module
            bytes(""), // No to module data
            address(0), // No fallback handler
            address(0), // No payment token
            0, // No payment
            address(0) // No payment receiver
        );

        // Step 3: Deploy the Safe proxy
        SafeProxyFactory factory = SafeProxyFactory(proxyFactoryAddr);
        bytes32 salt = keccak256(
            abi.encodePacked(signerAddress, block.timestamp, block.number)
        );

        safeAddress = address(
            factory.createProxyWithNonce(
                safeSingletonAddr,
                initData,
                uint256(uint160(salt))
            )
        );
    }
}
