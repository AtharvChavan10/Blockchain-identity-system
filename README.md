# Identra

Identra is a blockchain identity system. A person seals a pass with a name, an email, and a document. The app stores a fingerprint of that document, keeps a link to the file, and lets one admin wallet mark the pass as verified.

The pass can live in two places:

- The ledger on this machine (`data/identities.json`), which the website reads.
- The `IdentityManagement` contract on a local Ethereum chain, when the pass belongs to a wallet.

## How identity works

Identra does not scan a face or read the text inside a document. Identity here means a record that ties three things together:

1. An identity key
2. A document fingerprint
3. An admin decision

### The identity key

There are two keys. The instructions on the Create page stay visible so the choice is clear.

| Key | What it is | Wallet required |
| --- | --- | --- |
| Local key | A browser id such as `local_1de94585e5a7d492`, saved in this browser only | No |
| Wallet | The connected address, such as `0xf39F…2266` | Yes |

Click **Local key** to keep using the browser id. That choice stays selected even if a wallet is still connected in the top bar. Click **Wallet** to make the pass id the wallet address. A local key cannot be written to the contract, cannot sign, and cannot become admin.

### The document

Upload a PNG, JPEG, WEBP, or PDF up to 10MB. The server hashes the file.

- With no Pinata key, the file stays in the local vault (`uploads/`). The link looks like `http://localhost:3001/files/<hash>.png`. Paste it in a browser on this same computer, while the API is running, and the file downloads.
- With `PINATA_JWT` set, the file is pinned to IPFS. The link looks like `https://gateway.pinata.cloud/ipfs/<cid>`. Paste that in any browser, on any device, and the file opens or downloads.

The pass stores the hash and the link. **Copy link** on the card is the URL to send. The hash lets someone check that the file was not swapped. A new document changes the hash and clears verification.

### The admin

On Console, connect your wallet and choose **Make this wallet the admin**. MetaMask asks for a signature. The first wallet that signs is locked in as admin. Another wallet can still connect, create a pass, and look one up. Verify, revoke, and remove stay with the admin wallet.

### The chain

`IdentityManagement` stores name, email, and document hash under the wallet address that sent the transaction. The contract admin is the address that deployed it. On a local Hardhat node that is account 0:

`0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266`

Only that address can verify or remove a pass on-chain. The owner of a pass, or the contract admin, can revoke it. Changing the document hash clears on-chain verification.

The website admin and the contract admin are separate locks. Use the Hardhat account above for both when you want one wallet to verify in the console and on the contract.

## Start here

You need Node.js 18 or newer, npm, and a browser wallet (MetaMask, Backpack, or another injected wallet).

```bash
git clone https://github.com/AtharvChavan10/Blockchain-identity-system.git
cd Blockchain-identity-system
npm install
npm run install-frontend
```

Copy the environment examples and leave the secrets empty until you need them:

```bash
copy .env.example .env
copy frontend\.env.example frontend\.env
```

On macOS or Linux, use `cp` instead of `copy`.

### 1. API

```bash
npm run dev
```

The ledger API listens on http://localhost:3001. Health check: http://localhost:3001/api/health.

### 2. Website

In a second terminal:

```bash
npm run frontend
```

Open http://localhost:3000. If that port is already taken, stop the other app or start this one with another port:

```bash
cd frontend
set PORT=3002 && npm start
```

### 3. Local chain, when you want an on-chain pass

In a third terminal:

```bash
npm run chain
npm run deploy
```

`npm run deploy` prints the contract address. Put it in `frontend/.env`:

```env
REACT_APP_CONTRACT_ADDRESS=0xYourDeployedAddress
REACT_APP_CHAIN_ID=31337
REACT_APP_RPC_URL=http://127.0.0.1:8545
```

Restart the website after changing `frontend/.env`. In MetaMask, add the Hardhat network:

- Network name: Hardhat Local
- RPC: `http://127.0.0.1:8545`
- Chain ID: `31337`
- Currency: ETH

Import Hardhat account 0 if that wallet should be the contract admin. The local test private key is the well-known Hardhat development key and must only be used on this local chain.

### 4. Use the site

1. Open **Create**.
2. Choose **Local key** (no wallet) or **Wallet** (connect one from the wallet list).
3. Enter a name and email. The sample on the card is Atharv, `atharv@identra.dev`.
4. Drop in a document and seal the pass.
5. Open **Lookup** and search by the local key, the wallet address, or the document hash.
6. Open **Console** with your wallet and choose **Make this wallet the admin**, then verify the queue.

**Connect wallet** opens a list of wallets installed in the browser. Pick one. That wallet then asks which account to use.

## What each part does

| Path | Role |
| --- | --- |
| `frontend/src/App.js` | Pages: Overview, Create, Lookup, Console. Local key and wallet choice. |
| `frontend/src/WalletModal.js` | Popup that lists installed wallets and popular ones you can install. |
| `frontend/src/api.js` | Calls the ledger API. |
| `frontend/src/chain.js` | Finds wallets, connects the one you pick, and talks to the contract. |
| `server.js` | Upload, ledger, file download, and admin signatures. |
| `data/identities.json` | Ledger. Created at runtime. Not committed. |
| `data/admin.json` | Admin wallet address. Created when someone claims admin. Not committed. |
| `uploads/` | Local document vault. Not committed. |
| `contracts/IdentityManagement.sol` | On-chain name, email, document hash, and verification. |
| `scripts/deploy.js` | Deploys the contract to the local chain. |
| `test/IdentityManagement.js` | Contract tests. |
| `ipfs/upload.js` | Optional helper for a direct Pinata upload. |
| `.env` | `PORT` and `PINATA_JWT`. Not committed. |
| `frontend/.env` | Contract address, chain id, and RPC URL. Not committed. |

## API

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/health` | Server status, storage mode, pass count |
| POST | `/api/upload` | Hash a document and store it in the vault or on IPFS |
| GET | `/api/identities` | List passes |
| GET | `/api/identities/:id` | Read one pass |
| POST | `/api/identities` | Create or update a pass |
| POST | `/api/identities/:id/anchor` | Save the on-chain transaction hash |
| GET | `/api/admin` | Admin address, if one has been claimed |
| POST | `/api/admin/nonce` | One-time message for the admin wallet to sign |
| POST | `/api/admin/claim` | Lock the signing wallet in as admin |
| POST | `/api/identities/:id/verify` | Mark a pass verified. Admin signature required |
| POST | `/api/identities/:id/revoke` | Clear verification. Admin signature required |
| DELETE | `/api/identities/:id` | Remove a pass. Admin signature required |
| GET | `/files/<hash><ext>` | Download a file from the local vault |

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | API with reload |
| `npm start` | API once |
| `npm run frontend` | React app |
| `npm run build` | Production build of the website |
| `npm test` | Contract tests |
| `npm run chain` | Local Hardhat node on port 8545 |
| `npm run deploy` | Deploy `IdentityManagement` to localhost |

## Notices

- A local-vault link works only on the computer running the API. Add a Pinata JWT when the file must open from any browser.
- The first wallet to claim admin is the only website admin. A second wallet can connect. It cannot verify, revoke, or remove.
- On-chain verify succeeds only for the contract deployer.
- `.env`, `frontend/.env`, `data/`, and `uploads/` stay off GitHub. Put a real Pinata JWT only in `.env`.
- The local Hardhat private key is public by design. Do not send funds to it, and do not reuse it on a public network.
