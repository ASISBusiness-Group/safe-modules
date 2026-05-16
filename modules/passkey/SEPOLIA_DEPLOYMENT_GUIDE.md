# SafeWebAuthnSignerFactory Deployment Guide for Sepolia Testnet

This guide covers deploying the `SafeWebAuthnSignerFactory` and initializing Safe accounts with WebAuthn (passkey) signers on Sepolia testnet.

## 📋 Architecture Overview

```
User Device (WebAuthn/Passkey)
        ↓
    [P256 Signature]
        ↓
SafeWebAuthnSignerFactory (CREATE2 deterministic signer)
        ↓
SafeWebAuthnSignerSingleton (signature verification)
        ↓
Safe Smart Account (Multi-sig compatible)
```

## Prerequisites

- Node.js 18+ with npm/yarn
- Hardhat or Foundry installed
- Sepolia testnet ETH in your wallet (from [faucet](https://www.sepoliaethereum.org/))
- Private key of deployer account
- RPC URL for Sepolia (e.g., from Alchemy, Infura, or Ankr)

## Environment Setup

### 1. Create `.env` file

```bash
# Network RPC URLs
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_API_KEY

# Deployment account
PRIVATE_KEY=0x...your_private_key_here...

# (Optional) Etherscan API for verification
ETHERSCAN_API_KEY=YOUR_ETHERSCAN_API_KEY
```

### 2. Install Dependencies (Hardhat)

```bash
npm install --save-dev hardhat ethers @safe-global/safe-contracts
```

Or with Foundry:

```bash
forge install
```

## Deployment Steps

### Step 1: Deploy SafeWebAuthnSignerFactory

```bash
# Using Hardhat
npx hardhat run scripts/deploy-factory.ts --network sepolia

# Using Foundry
forge script scripts/DeployWebAuthnSafe.sol --rpc-url $SEPOLIA_RPC_URL --broadcast --private-key $PRIVATE_KEY
```

This will:
- ✅ Deploy `SafeWebAuthnSignerFactory` contract
- ✅ Create embedded `SafeWebAuthnSignerSingleton` 
- ✅ Calculate deterministic signer addresses using CREATE2
- ✅ Save deployment config to `deployments/sepolia/factory-*.json`

### Step 2: Configure P256 Verifiers

The factory uses P256 ECDSA verification for WebAuthn signatures. You need to configure two components:

**Option A: Sepolia Precompile (Recommended for future)**
- Sepolia will support EIP-7212 P256 precompile post-upgrade
- Address: `0x0000000000000000000000000000000000000100`

**Option B: Fallback Solidity Implementation (Current)**
- Deploy a P256 verifier Solidity contract
- Use it as fallback for immediate testnet use
- Reference: [OpenZeppelin P256Verifier](https://github.com/OpenZeppelin/openzeppelin-contracts/blob/master/contracts/utils/cryptography/P256.sol)

Update the verifiers in `deploy-factory.ts`:

```typescript
const SEPOLIA_CONFIG = {
  verifiers: {
    precompile: "0x0000000000000000000000000000000000000100",
    fallback: "0x...<your_deployed_fallback>", // Deploy this separately
  },
};
```

### Step 3: Create a Safe Account with WebAuthn Signer

```bash
# Update SEPOLIA_CONFIG in the script with your factory address
npx hardhat run scripts/init-safe-webauthn.ts --network sepolia
```

This will:
- ✅ Create a WebAuthn signer (if not exists)
- ✅ Deploy a Safe proxy with the signer as owner
- ✅ Verify the Safe configuration (owner, threshold)
- ✅ Provide Etherscan links

## Key Concepts

### CREATE2 Deterministic Addresses

The factory uses CREATE2 to generate predictable signer addresses **before deployment**:

```solidity
// You can calculate the address without deploying
address signerAddress = factory.getSigner(x, y, verifiers);

// Then deploy to that exact address
factory.createSigner(x, y, verifiers);
```

**Benefits:**
- ✅ Predict signer address from passkey coordinates
- ✅ Initialize Safe with pre-computed signer address
- ✅ No chicken-and-egg deployment problem

### P256 Signature Verification

The factory verifies signatures via the singleton:

```solidity
// Verify signature without deploying signer proxy
bytes4 magicValue = factory.isValidSignatureForSigner(
    message,           // bytes32
    signature,          // bytes (raw WebAuthn signature)
    x, y,              // public key coordinates
    verifiers          // P256.Verifiers config
);

// Returns ERC-1271 magic value (0x1626ba7e) if valid
```

## Sepolia Contract Addresses

Update these in deployment scripts:

```typescript
// Safe Protocol Contracts
const SAFE_SINGLETON = "0x...";  // Safe implementation
const PROXY_FACTORY = "0x...";   // SafeProxyFactory
const SAFE_L2_SINGLETON = "0x..."; // For L2 (if applicable)

// P256 Verification
const P256_PRECOMPILE = "0x0000000000000000000000000000000000000100";
const P256_FALLBACK = "0x...";   // Deploy your implementation
```

Find these addresses at:
- Safe Deployment Tracker: https://github.com/safe-global/safe-deployments
- Sepolia Data: https://github.com/safe-global/safe-deployments/tree/main/src/assets/chains/11155111

## Gas Optimization Notes

The factory uses several optimizations:

1. **Immutable Singleton**: Reduces storage reads
2. **Deterministic CREATE2**: Allows address prediction
3. **Memory-safe Assembly**: Enables better Solidity optimizer
4. **Batch Encoding**: Appends public key data to calldata (no storage reads)

## Testing the Deployment

### Test Signer Creation

```javascript
// Using Hardhat ethers
const factory = await ethers.getContractAt(
  "SafeWebAuthnSignerFactory",
  factoryAddress
);

// Example P256 public key (from a real passkey)
const x = 0x8520e1fbab18c4b618202b1c2567f7b7f4e4e8e8d8d8d8d8d8d8d8d8d8d8d8d;
const y = 0x9621f2fcbc29d5c729303c2d368f8c8f5f5f9f9f9f9f9f9f9f9f9f9f9f9f9f9;

// Get deterministic address
const signerAddr = await factory.getSigner(x, y, verifiers);
console.log("Predicted signer:", signerAddr);

// Create it
const tx = await factory.createSigner(x, y, verifiers);
await tx.wait();
console.log("Signer created at:", signerAddr);
```

### Verify Safe Ownership

```javascript
const safe = await ethers.getContractAt("Safe", safeAddress);

const owners = await safe.getOwners();
const threshold = await safe.getThreshold();

console.log("Owners:", owners);
console.log("Threshold:", threshold);
// Should show the WebAuthn signer as owner with threshold 1
```

## Troubleshooting

### Issue: "CREATE2 salt already used"
- **Cause**: Signer already deployed at that address
- **Fix**: Use a different salt or check if signer exists with `_hasNoCode(address)`

### Issue: "P256 precompile not found"
- **Cause**: Sepolia hasn't enabled EIP-7212 yet
- **Fix**: Use fallback verifier implementation instead

### Issue: "Safe initialization failed"
- **Cause**: Owner address is zero or threshold is invalid
- **Fix**: Verify the signer was created before Safe initialization

### Issue: "Signature verification fails"
- **Cause**: Verifiers address is incorrect or signature format wrong
- **Fix**: Ensure signature includes WebAuthn attestation data

## Next Steps

1. **Deploy P256 Fallback Verifier** (if not using precompile)
2. **Set up Safe UI** to interact with WebAuthn signers
3. **Create WebAuthn Transaction Flow**:
   - User approves transaction with passkey
   - App generates P256 signature
   - Submit to factory's `isValidSignatureForSigner()`
   - Execute via Safe if signature valid
4. **Production Mainnet Deployment** (same process, different RPC)

## Security Considerations

⚠️ **Never store private keys in code or version control**

✅ **Recommended practices:**
- Use hardware wallet for deployment
- Verify contract source on Etherscan
- Test on Sepolia before mainnet
- Review WebAuthn signature generation

## Resources

- [Safe Contracts Docs](https://docs.safe.global/)
- [EIP-7212 P256 Precompile](https://eips.ethereum.org/EIPS/eip-7212)
- [WebAuthn Spec](https://www.w3.org/TR/webauthn-2/)
- [Sepolia Faucet](https://www.sepoliaethereum.org/)

---

**Questions?** Check the test files in `modules/passkey/test/` or open an issue.
