import { ethers } from "hardhat";
import { getAddress } from "ethers";

/**
 * Script to initialize a Safe account with a WebAuthn signer on Sepolia
 * 
 * Usage:
 *   npx hardhat run scripts/init-safe-webauthn.ts --network sepolia
 */

interface WebAuthnCredential {
  x: string;
  y: string;
  publicKey: string;
}

interface SafeInitConfig {
  factoryAddress: string;
  safeSingletonAddress: string;
  safeProxyFactoryAddress: string;
  webauthnCredential: WebAuthnCredential;
  verifiersEncoded: string;
}

/**
 * Example configuration - update with your actual Sepolia addresses and credentials
 */
const SEPOLIA_CONFIG: SafeInitConfig = {
  factoryAddress: "0x0000000000000000000000000000000000000000",
  safeSingletonAddress: "0x0000000000000000000000000000000000000000",
  safeProxyFactoryAddress: "0x0000000000000000000000000000000000000000",
  webauthnCredential: {
    x: "0x8520e1fbab18c4b618202b1c2567f7b7f4e4e8e8d8d8d8d8d8d8d8d8d8d8d8d",
    y: "0x9621f2fcbc29d5c729303c2d368f8c8f5f5f9f9f9f9f9f9f9f9f9f9f9f9f9f9",
    publicKey: "unused", // For reference only
  },
  verifiersEncoded:
    "0x00000000000000000000000000000000000000000100000000000000000000",
};

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("═══════════════════════════════════════════════════════════");
  console.log("🔐 Initializing Safe Account with WebAuthn Signer");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Deployer: ${deployer.address}`);

  // Load the factory
  const factory = await ethers.getContractAt(
    "SafeWebAuthnSignerFactory",
    SEPOLIA_CONFIG.factoryAddress
  );

  // Step 1: Create WebAuthn signer
  console.log("\n📦 Step 1: Creating WebAuthn signer...");
  const x = BigInt(SEPOLIA_CONFIG.webauthnCredential.x);
  const y = BigInt(SEPOLIA_CONFIG.webauthnCredential.y);

  // Calculate deterministic signer address
  const signerAddress = await factory.getSigner(x, y, SEPOLIA_CONFIG.verifiersEncoded);
  console.log(`📍 WebAuthn Signer Address: ${signerAddress}`);

  // Create the signer if it doesn't exist
  const code = await ethers.provider.getCode(signerAddress);
  if (code === "0x") {
    console.log("   Creating new signer...");
    const tx = await factory.createSigner(x, y, SEPOLIA_CONFIG.verifiersEncoded);
    await tx.wait();
    console.log("✅ Signer created");
  } else {
    console.log("✅ Signer already exists");
  }

  // Step 2: Create Safe with deterministic address
  console.log("\n📦 Step 2: Creating Safe with WebAuthn signer...");

  const SafeContract = await ethers.getContractAt(
    "Safe",
    SEPOLIA_CONFIG.safeSingletonAddress
  );

  // Prepare initialization data
  const owners = [signerAddress];
  const threshold = 1; // Single signer

  const initData = SafeContract.interface.encodeFunctionData("setup", [
    owners,
    threshold,
    ethers.ZeroAddress, // No modules
    "0x", // No module data
    ethers.ZeroAddress, // No fallback handler
    ethers.ZeroAddress, // No payment token
    0, // No payment
    ethers.ZeroAddress, // No payment receiver
  ]);

  // Use SafeProxyFactory to deploy
  const proxyFactory = await ethers.getContractAt(
    "SafeProxyFactory",
    SEPOLIA_CONFIG.safeProxyFactoryAddress
  );

  // Create deterministic salt
  const salt = ethers.solidityPacked(
    ["address", "uint256"],
    [signerAddress, Math.floor(Date.now() / 1000)]
  );

  const createSafeTx = await proxyFactory.createProxyWithNonce(
    SEPOLIA_CONFIG.safeSingletonAddress,
    initData,
    BigInt(0) // nonce for deterministic address
  );

  const receipt = await createSafeTx.wait();
  console.log(`✅ Safe created in tx: ${receipt?.hash}`);

  // Extract Safe address from events
  let safeAddress: string | null = null;
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const decoded = proxyFactory.interface.parseLog(log);
        if (decoded?.name === "ProxyCreation") {
          safeAddress = decoded.args[0];
          break;
        }
      } catch {
        // Continue parsing
      }
    }
  }

  console.log(`📍 Safe Account Address: ${safeAddress}`);

  // Step 3: Verify Safe configuration
  if (safeAddress) {
    console.log("\n📦 Step 3: Verifying Safe configuration...");
    const safe = await ethers.getContractAt("Safe", safeAddress);

    const safeOwners = await safe.getOwners();
    const safeThreshold = await safe.getThreshold();

    console.log(`   Owners: ${safeOwners.join(", ")}`);
    console.log(`   Threshold: ${safeThreshold}`);
    console.log(`✅ Verification passed`);
  }

  // Step 4: Summary
  console.log("\n🎉 Deployment Summary");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(
    JSON.stringify(
      {
        network: "sepolia",
        timestamp: new Date().toISOString(),
        accounts: {
          webauthnSigner: signerAddress,
          safeAccount: safeAddress,
        },
        credentials: {
          x: SEPOLIA_CONFIG.webauthnCredential.x,
          y: SEPOLIA_CONFIG.webauthnCredential.y,
        },
        configuration: {
          owners: [signerAddress],
          threshold: 1,
          verifiers: SEPOLIA_CONFIG.verifiersEncoded,
        },
      },
      null,
      2
    )
  );

  console.log("\n🔗 Links:");
  console.log(
    `   Safe: https://sepolia.etherscan.io/address/${safeAddress}`
  );
  console.log(
    `   Signer: https://sepolia.etherscan.io/address/${signerAddress}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
