import { ethers } from "hardhat";
import { getAddress } from "ethers";

/**
 * Hardhat deployment script for SafeWebAuthnSignerFactory on Sepolia testnet
 * 
 * Usage:
 *   npx hardhat run scripts/deploy-factory.ts --network sepolia
 * 
 * Environment variables required:
 *   SEPOLIA_RPC_URL - RPC URL for Sepolia testnet
 *   PRIVATE_KEY - Private key of deployer account
 */

interface P256VerifiersConfig {
  precompile: string;
  fallback: string;
}

// Sepolia testnet configuration
const SEPOLIA_CONFIG = {
  chainId: 11155111,
  safe: {
    // Safe singleton address on Sepolia (from safe-global)
    singleton: "0x0000000000000000000000000000000000000000", // Update with actual Sepolia Safe address
  },
  verifiers: {
    // P256 precompile address (will be enabled on Sepolia post-Dencun)
    precompile: "0x0000000000000000000000000000000000000100",
    // Fallback P256 verifier implementation (deploy your own or use existing)
    fallback: "0x0000000000000000000000000000000000000000", // Update with deployed fallback
  },
};

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("🚀 Deploying SafeWebAuthnSignerFactory on Sepolia");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Deployer: ${deployer.address}`);
  console.log(`Network: Sepolia (${SEPOLIA_CONFIG.chainId})`);

  // Step 1: Deploy SafeWebAuthnSignerFactory
  console.log("\n📦 Step 1: Deploying SafeWebAuthnSignerFactory...");
  const factory = await ethers.getContractFactory("SafeWebAuthnSignerFactory");
  const factoryContract = await factory.deploy();
  await factoryContract.waitForDeployment();
  const factoryAddress = await factoryContract.getAddress();

  console.log(`✅ Factory deployed at: ${factoryAddress}`);
  console.log(`   Singleton address: ${await factoryContract.SINGLETON()}`);

  // Step 2: Package P256 verifiers into a single uint176 type
  console.log("\n📦 Step 2: Configuring P256 Verifiers...");
  const precompileAddr = getAddress(SEPOLIA_CONFIG.verifiers.precompile);
  const fallbackAddr = getAddress(SEPOLIA_CONFIG.verifiers.fallback);

  // Encode as: uint160(fallback) | uint16(precompile)
  // This matches the P256.Verifiers type encoding
  const precompileUint16 = BigInt("0x0100");
  const fallbackUint160 = BigInt(fallbackAddr.replace("0x", ""), 16);
  const verifiersEncoded = (precompileUint16 << BigInt(160)) | fallbackUint160;

  console.log(`Precompile: ${precompileAddr}`);
  console.log(`Fallback: ${fallbackAddr}`);
  console.log(`Encoded verifiers: 0x${verifiersEncoded.toString(16).padStart(44, "0")}`);

  // Step 3: Create a test signer address using deterministic P256 coordinates
  console.log("\n📦 Step 3: Creating test WebAuthn signer (deterministic CREATE2)...");

  // Example P256 public key coordinates (replace with actual user passkey)
  // These are dummy values - in production, get from WebAuthn credential
  const testX = BigInt(
    "0x8520e1fbab18c4b618202b1c2567f7b7f4e4e8e8d8d8d8d8d8d8d8d8d8d8d8d"
  );
  const testY = BigInt(
    "0x9621f2fcbc29d5c729303c2d368f8c8f5f5f9f9f9f9f9f9f9f9f9f9f9f9f9f9"
  );

  // Calculate deterministic address before deployment
  const predictedSignerAddress = await factoryContract.getSigner(
    testX,
    testY,
    verifiersEncoded
  );
  console.log(`📍 Predicted signer address (CREATE2): ${predictedSignerAddress}`);

  // Actually create the signer
  const createTx = await factoryContract.createSigner(testX, testY, verifiersEncoded);
  const createReceipt = await createTx.wait();

  // Verify it matches the prediction
  const actualSignerAddress = await factoryContract.getSigner(
    testX,
    testY,
    verifiersEncoded
  );
  console.log(`✅ Signer created at: ${actualSignerAddress}`);
  console.log(`✅ Matches prediction: ${actualSignerAddress === predictedSignerAddress}`);

  // Step 4: Save deployment configuration
  console.log("\n📋 Deployment Summary");
  console.log("═══════════════════════════════════════════════════════════");

  const deploymentConfig = {
    network: "sepolia",
    chainId: SEPOLIA_CONFIG.chainId,
    deployedAt: new Date().toISOString(),
    contracts: {
      factory: {
        address: factoryAddress,
        deploymentTx: (await factoryContract.deploymentTransaction())?.hash,
      },
      singleton: {
        address: await factoryContract.SINGLETON(),
      },
    },
    verifiers: {
      precompile: precompileAddr,
      fallback: fallbackAddr,
      encoded: `0x${verifiersEncoded.toString(16).padStart(44, "0")}`,
    },
    testSigner: {
      x: testX.toString(),
      y: testY.toString(),
      address: actualSignerAddress,
    },
    deployer: deployer.address,
  };

  console.log(JSON.stringify(deploymentConfig, null, 2));

  // Step 5: Save to file for future reference
  const fs = await import("fs");
  const path = await import("path");

  const outputDir = path.join(process.cwd(), "deployments", "sepolia");
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  const outputFile = path.join(outputDir, `factory-${Date.now()}.json`);
  fs.writeFileSync(outputFile, JSON.stringify(deploymentConfig, null, 2));
  console.log(`\n💾 Deployment config saved to: ${outputFile}`);

  // Step 6: Verify on block explorer
  console.log("\n🔗 Next steps:");
  console.log(
    `1. Verify on Sepolia Etherscan: https://sepolia.etherscan.io/address/${factoryAddress}`
  );
  console.log(`2. Test signature verification with: factory.isValidSignatureForSigner(...)`);
  console.log(`3. Use the deterministic signer address to initialize Safe accounts`);

  return deploymentConfig;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
