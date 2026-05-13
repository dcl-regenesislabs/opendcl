---
name: nft-blockchain
description: NFT display and blockchain interaction in Decentraland. NftShape (framed NFT artwork), wallet checks (getPlayer, isGuest), signedFetch (authenticated requests), smart contract interaction (eth-connect, createEthereumProvider), and RPC calls. Use when the user wants NFTs, blockchain, wallet, smart contracts, Web3, crypto, or token gating. Do NOT use for player avatar data or emotes (see player-avatar).
---

# NFT and Blockchain in Decentraland

## Display NFT Artwork

`NftShape` is supported in `main-entities.ts` — declare the framed NFT directly. The user can drag it around in the visual editor.

```typescript
// main-entities.ts
import type { Scene } from '@dcl/sdk/scene-types'

export const scene = {
  hero_nft: {
    components: {
      Transform: { position: { x: 8, y: 2, z: 8 } },
      NftShape: {
        urn: 'urn:decentraland:ethereum:erc721:0x06012c8cf97bead5deae237070f9587f8e7a266d:558536',
        color: { r: 1, g: 1, b: 1, a: 1 },
        style: 0  // NftFrameType.NFT_CLASSIC — enum values are integers in the literal
      }
    }
  }
} satisfies Scene
```

The `style` field is a numeric enum — the literal cannot reference `NftFrameType.NFT_CLASSIC` directly because the AST walker only accepts JSON-compatible expressions. Use the integer value (table below) and leave a comment.

### NFT URN Format

```
urn:decentraland:ethereum:erc721:<contractAddress>:<tokenId>
```

- Works with any ERC-721 NFT on Ethereum mainnet
- The image is loaded automatically from the NFT's metadata

### Available Frame Styles

| value | enum name | description |
|---|---|---|
| 0  | NFT_CLASSIC          | Simple classic frame |
| 1  | NFT_BAROQUE_ORNAMENT | Ornate baroque |
| 2  | NFT_DIAMOND_ORNAMENT | Diamond pattern |
| 3  | NFT_MINIMAL_WIDE     | Minimal wide border |
| 4  | NFT_MINIMAL_GREY     | Minimal grey border |
| 5  | NFT_BLOCKY           | Pixelated/blocky |
| 6  | NFT_GOLD_EDGES       | Gold edge trim |
| 7  | NFT_GOLD_CARVED      | Carved gold |
| 8  | NFT_GOLD_WIDE        | Wide gold border |
| 9  | NFT_GOLD_ROUNDED     | Rounded gold |
| 10 | NFT_METAL_MEDIUM     | Medium metal |
| 11 | NFT_METAL_WIDE       | Wide metal |
| 12 | NFT_METAL_SLIM       | Slim metal |
| 13 | NFT_METAL_ROUNDED    | Rounded metal |
| 14 | NFT_PINS             | Pinned to wall |
| 15 | NFT_MINIMAL_BLACK    | Minimal black |
| 16 | NFT_MINIMAL_WHITE    | Minimal white |
| 17 | NFT_TAPE             | Taped to wall |
| 18 | NFT_WOOD_SLIM        | Slim wood |
| 19 | NFT_WOOD_WIDE        | Wide wood |
| 20 | NFT_WOOD_TWIGS       | Twig/branch wood |
| 21 | NFT_CANVAS           | Canvas style |
| 22 | NFT_NONE             | No frame |

In `src/index.ts` where enum identifiers are allowed, use `NftFrameType.NFT_CLASSIC` etc. directly.

## Check Player Wallet

```typescript
import { getPlayer } from '@dcl/sdk/src/players'

function checkWallet() {
  const player = getPlayer()
  if (player && !player.isGuest) {
    console.log('Player wallet address:', player.userId)
    // userId is the Ethereum wallet address
  } else {
    console.log('Player is guest (no wallet)')
  }
}
```

Always check `isGuest` before attempting any blockchain interaction — guest players don't have a connected wallet.

## Signed Requests

Send authenticated requests to a backend, signed with the player's wallet:

```typescript
import { signedFetch } from '~system/SignedFetch'

executeTask(async () => {
  try {
    const response = await signedFetch({
      url: 'https://example.com/api/action',
      init: {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'claimReward',
          amount: 100
        })
      }
    })

    if (!response.ok) {
      console.error('HTTP error:', response.status)
      return
    }
    const result = JSON.parse(response.body)
    console.log('Result:', result)
  } catch (error) {
    console.log('Request failed:', error)
  }
})
```

`signedFetch` automatically includes a cryptographic signature proving the player's identity. Your backend can verify this signature to authenticate requests.

## Smart Contract Interaction

Requires the `eth-connect` package:

```bash
npm install eth-connect
```

### Store ABI in a Separate File

```typescript
// contracts/myContract.ts
export default [
  {
    "constant": true,
    "inputs": [{ "name": "_owner", "type": "address" }],
    "name": "balanceOf",
    "outputs": [{ "name": "balance", "type": "uint256" }],
    "type": "function"
  }
  // ... rest of ABI
]
```

### Create Contract Instance

```typescript
import { RequestManager, ContractFactory } from 'eth-connect'
import { createEthereumProvider } from '@dcl/sdk/ethereum-provider'
import { abi } from '../contracts/myContract'

executeTask(async () => {
  try {
    // Create web3 provider
    const provider = createEthereumProvider()
    const requestManager = new RequestManager(provider)

    // Create contract at a specific address
    const factory = new ContractFactory(requestManager, abi)
    const contract = await factory.at('0x2a8fd99c19271f4f04b1b7b9c4f7cf264b626edb') as any

    // Read data (no gas required)
    const balance = await contract.balanceOf('0x123...abc')
    console.log('Balance:', balance)
  } catch (error) {
    console.log('Contract interaction failed:', error)
  }
})
```

### Write Operations (Require Gas)

```typescript
executeTask(async () => {
  try {
    const userData = getPlayer()
    if (userData.isGuest) return

    // Write operation — prompts the player to sign the transaction
    const writeResult = await contract.transfer(
      '0xRecipientAddress',
      100,
      {
        from: userData.userId,
        gas: 100000,
        gasPrice: await requestManager.eth_gasPrice()
      }
    )
    console.log('Transaction hash:', writeResult)
  } catch (error) {
    console.log('Transaction failed:', error)
  }
})
```

### Gas Price and Balance Checking

```typescript
import { RequestManager } from 'eth-connect'
import { createEthereumProvider } from '@dcl/sdk/ethereum-provider'

executeTask(async () => {
  const provider = createEthereumProvider()
  const requestManager = new RequestManager(provider)

  const gasPrice = await requestManager.eth_gasPrice()
  console.log('Current gas price:', gasPrice)

  const balance = await requestManager.eth_getBalance('0x123...abc', 'latest')
  console.log('Account balance:', balance)
})
```

## Testing with Sepolia

For development, use the Sepolia testnet:

1. Set MetaMask to Sepolia network
2. Get test ETH from a Sepolia faucet
3. Deploy your contracts to Sepolia
4. Contract addresses differ between mainnet and testnet — use environment checks

### Custom RPC Calls

Use `sendAsync` for low-level Ethereum RPC calls not covered by eth-connect helpers:

```typescript
import { sendAsync } from '~system/EthereumController'

const result = await sendAsync({ method: 'eth_blockNumber', params: [] })
console.log('Current block:', result.body)
```

### Opening URLs and NFT Dialogs

Use restricted actions to open external links and NFT detail views:

```typescript
import { openExternalUrl, openNftDialog } from '~system/RestrictedActions'

openExternalUrl({ url: 'https://opensea.io/collection/...' })
openNftDialog({ urn: 'urn:decentraland:ethereum:erc721:0x06012c8cf97BEaD5deAe237070F9587f8E7A266d:558536' })
```

## Best Practices

- **Always check `isGuest`** before any blockchain interaction — guest players can't sign transactions
- Use `executeTask(async () => { ... })` for all async blockchain calls
- Store ABI files separately (e.g., `contracts/`) — don't inline large ABIs
- Handle errors gracefully — blockchain operations can fail (rejected by user, insufficient gas, network issues)
- `eth-connect` must be installed as a dependency: `npm install eth-connect`
- Use `signedFetch` for backend authentication instead of raw `fetch` — it proves the player's identity
- Read operations (view/pure functions) don't require gas; write operations prompt the user to sign
- Test on Sepolia before deploying to mainnet
- NFT URNs only work with Ethereum mainnet ERC-721 tokens
