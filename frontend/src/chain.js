import { BrowserProvider, Contract, JsonRpcProvider } from 'ethers';

export const CONTRACT_ADDRESS = (process.env.REACT_APP_CONTRACT_ADDRESS || '').trim();
export const EXPECTED_CHAIN_ID = Number(process.env.REACT_APP_CHAIN_ID || 31337);
const RPC_URL = process.env.REACT_APP_RPC_URL || 'http://127.0.0.1:8545';

const ABI = [
  'function admin() view returns (address)',
  'function registerIdentity(string _name, string _email, string _docHash)',
  'function updateProfile(string _name, string _email, string _docHash)',
  'function verifyIdentity(address _user)',
  'function revokeIdentity(address _user)',
  'function removeIdentity(address _user)',
  'function getIdentity(address _user) view returns (string name, string email, string docHash, bool isVerified, address owner, bool exists)',
];

const RDNS_KEY = 'identra.walletRdns';
const announced = new Map();
const discoveryListeners = new Set();
let activeProvider = null;
let discoveryStarted = false;

const KNOWN = [
  { rdns: 'io.metamask', name: 'MetaMask', install: 'https://metamask.io/download/' },
  { rdns: 'app.backpack', name: 'Backpack', install: 'https://backpack.app/download' },
  { rdns: 'me.rainbow', name: 'Rainbow', install: 'https://rainbow.me/download' },
  { rdns: 'com.coinbase.wallet', name: 'Coinbase Wallet', install: 'https://www.coinbase.com/wallet/downloads' },
  { rdns: 'io.rabby', name: 'Rabby Wallet', install: 'https://rabby.io/' },
  { rdns: 'com.brave.wallet', name: 'Brave Wallet', install: 'https://brave.com/wallet/' },
  { rdns: 'app.phantom', name: 'Phantom', install: 'https://phantom.com/download' },
];

export const POPULAR_WALLETS = [
  KNOWN.find((item) => item.rdns === 'me.rainbow'),
  KNOWN.find((item) => item.rdns === 'com.coinbase.wallet'),
  { rdns: 'walletconnect', name: 'WalletConnect', install: 'https://walletconnect.com/' },
];

function knownByRdns(rdns) {
  return KNOWN.find((item) => item.rdns === rdns);
}

function guessInjected(provider) {
  if (!provider) return null;
  if (provider.isBackpack) return knownByRdns('app.backpack');
  if (provider.isRabby) return knownByRdns('io.rabby');
  if (provider.isCoinbaseWallet) return knownByRdns('com.coinbase.wallet');
  if (provider.isRainbow) return knownByRdns('me.rainbow');
  if (provider.isBraveWallet) return knownByRdns('com.brave.wallet');
  if (provider.isPhantom) return knownByRdns('app.phantom');
  if (provider.isMetaMask) return knownByRdns('io.metamask');
  return { rdns: 'injected', name: 'Browser wallet', install: 'https://ethereum.org/wallets/find-wallet/' };
}

function remember(info, provider) {
  if (!info?.rdns || !provider) return;
  const previous = announced.get(info.rdns);
  announced.set(info.rdns, {
    info: {
      ...knownByRdns(info.rdns),
      ...info,
      name: info.name || knownByRdns(info.rdns)?.name || 'Wallet',
    },
    provider,
  });
  if (!previous) discoveryListeners.forEach((listener) => listener(listWallets()));
}

function absorbLegacyProviders() {
  if (typeof window === 'undefined' || !window.ethereum) return;
  const list = Array.isArray(window.ethereum.providers) && window.ethereum.providers.length
    ? window.ethereum.providers
    : [window.ethereum];
  list.forEach((provider) => {
    const guessed = guessInjected(provider);
    if (guessed && !announced.has(guessed.rdns)) remember(guessed, provider);
  });
}

export function startWalletDiscovery() {
  if (typeof window === 'undefined') return;
  if (!discoveryStarted) {
    discoveryStarted = true;
    window.addEventListener('eip6963:announceProvider', (event) => {
      remember(event.detail?.info, event.detail?.provider);
    });
  }
  window.dispatchEvent(new Event('eip6963:requestProvider'));
  absorbLegacyProviders();
  window.setTimeout(absorbLegacyProviders, 60);
}

export function listWallets() {
  startWalletDiscovery();
  const recent = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(RDNS_KEY) : '';
  return [...announced.values()]
    .map(({ info, provider }) => ({
      rdns: info.rdns,
      name: info.name,
      icon: info.icon || '',
      install: info.install || knownByRdns(info.rdns)?.install || '',
      provider,
      installed: true,
      recent: info.rdns === recent,
    }))
    .sort((a, b) => Number(b.recent) - Number(a.recent) || a.name.localeCompare(b.name));
}

export function subscribeWallets(listener) {
  startWalletDiscovery();
  discoveryListeners.add(listener);
  return () => discoveryListeners.delete(listener);
}

export function hasWallet() {
  return listWallets().length > 0 || (typeof window !== 'undefined' && Boolean(window.ethereum));
}

function getEthereum() {
  if (activeProvider) return activeProvider;
  const recent = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(RDNS_KEY) : '';
  if (recent && announced.get(recent)?.provider) {
    activeProvider = announced.get(recent).provider;
    return activeProvider;
  }
  return typeof window !== 'undefined' ? window.ethereum : null;
}

export function watchAccounts(handler) {
  const eth = getEthereum();
  if (!eth?.on) return () => {};
  const onAccounts = (accounts) => handler(accounts || []);
  eth.on('accountsChanged', onAccounts);
  return () => eth.removeListener?.('accountsChanged', onAccounts);
}

export function chainErrorText(error) {
  if (error?.code === 'ACTION_REJECTED' || error?.code === 4001) {
    return 'The wallet request was dismissed.';
  }
  return error?.shortMessage || error?.reason || error?.message || 'The chain request failed.';
}

export async function signAdminMessage(message) {
  const eth = getEthereum();
  if (!eth) throw new Error('No wallet found in this browser');
  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  const signature = await signer.signMessage(message);
  return { signature, address: (await signer.getAddress()).toLowerCase() };
}

export async function connectWallet(eip1193, { rdns } = {}) {
  const eth = eip1193 || getEthereum();
  if (!eth) throw new Error('Choose an installed wallet');
  activeProvider = eth;
  if (rdns && typeof sessionStorage !== 'undefined') sessionStorage.setItem(RDNS_KEY, rdns);

  try {
    await eth.request({
      method: 'wallet_revokePermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch (error) {
    if (error?.code === 4001) throw error;
  }

  try {
    await eth.request({
      method: 'wallet_requestPermissions',
      params: [{ eth_accounts: {} }],
    });
  } catch (error) {
    if (error?.code === 4001 || error?.code === 'ACTION_REJECTED') throw error;
  }

  const provider = new BrowserProvider(eth);
  const accounts = await provider.send('eth_requestAccounts', []);
  const signer = await provider.getSigner();
  const network = await provider.getNetwork();
  return {
    address: accounts[0] || await signer.getAddress(),
    chainId: Number(network.chainId),
  };
}

export async function quietConnect() {
  startWalletDiscovery();
  await new Promise((resolve) => window.setTimeout(resolve, 80));
  const eth = getEthereum();
  if (!eth) return null;
  const accounts = await eth.request({ method: 'eth_accounts' });
  if (!accounts?.length) return null;
  activeProvider = eth;
  const provider = new BrowserProvider(eth);
  const network = await provider.getNetwork();
  return { address: accounts[0], chainId: Number(network.chainId) };
}

async function getConnectedContract() {
  const eth = getEthereum();
  if (!CONTRACT_ADDRESS) {
    throw new Error('Set REACT_APP_CONTRACT_ADDRESS to anchor on-chain');
  }
  if (!eth) {
    throw new Error('Connect a wallet first');
  }

  const hex = `0x${EXPECTED_CHAIN_ID.toString(16)}`;
  const current = await new BrowserProvider(eth).getNetwork();
  if (Number(current.chainId) !== EXPECTED_CHAIN_ID) {
    try {
      await eth.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: hex }],
      });
    } catch (error) {
      if (error?.code === 4902) {
        await eth.request({
          method: 'wallet_addEthereumChain',
          params: [
            {
              chainId: hex,
              chainName: 'Hardhat Local',
              nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
              rpcUrls: [RPC_URL],
            },
          ],
        });
      } else {
        throw error;
      }
    }
  }

  const provider = new BrowserProvider(eth);
  const signer = await provider.getSigner();
  return {
    contract: new Contract(CONTRACT_ADDRESS, ABI, signer),
    address: await signer.getAddress(),
  };
}

export async function anchorIdentity({ name, email, docHash }) {
  const { contract, address } = await getConnectedContract();
  const existing = await contract.getIdentity(address);
  const tx = existing.exists
    ? await contract.updateProfile(name, email, docHash)
    : await contract.registerIdentity(name, email, docHash);
  const receipt = await tx.wait();
  return receipt.hash;
}

async function send(method, user) {
  const { contract } = await getConnectedContract();
  const tx = await contract[method](user);
  const receipt = await tx.wait();
  return receipt.hash;
}

export function verifyOnChain(user) {
  return send('verifyIdentity', user);
}

export function revokeOnChain(user) {
  return send('revokeIdentity', user);
}

export function removeOnChain(user) {
  return send('removeIdentity', user);
}

export async function readOnChain(user) {
  if (!CONTRACT_ADDRESS || !/^0x[a-fA-F0-9]{40}$/.test(user || '')) return null;
  const provider = new JsonRpcProvider(RPC_URL, EXPECTED_CHAIN_ID, { staticNetwork: true });
  const contract = new Contract(CONTRACT_ADDRESS, ABI, provider);
  const id = await contract.getIdentity(user);
  if (!id.exists) return null;
  return {
    name: id.name,
    email: id.email,
    docHash: id.docHash,
    verified: id.isVerified,
    owner: id.owner,
  };
}
