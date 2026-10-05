import React, { useEffect, useState } from 'react';
import { connectWallet, listWallets, POPULAR_WALLETS, subscribeWallets } from './chain';

function Mark({ wallet }) {
  if (wallet.icon) {
    return <img className="wallet-mark" src={wallet.icon} alt="" />;
  }
  return (
    <span className={`wallet-mark letter rdns-${wallet.rdns.replace(/\W/g, '-')}`}>
      {(wallet.name || '?').slice(0, 1)}
    </span>
  );
}

export default function WalletModal({ open, onClose, onConnected, onError }) {
  const [installed, setInstalled] = useState([]);
  const [busy, setBusy] = useState('');

  useEffect(() => {
    if (!open) return undefined;
    const apply = (wallets) => setInstalled(wallets);
    apply(listWallets());
    return subscribeWallets(apply);
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  const installedRdns = new Set(installed.map((wallet) => wallet.rdns));
  const popular = POPULAR_WALLETS.filter((wallet) => !installedRdns.has(wallet.rdns));

  async function pick(wallet) {
    if (!wallet.provider) {
      window.open(wallet.install, '_blank', 'noopener,noreferrer');
      return;
    }
    setBusy(wallet.rdns);
    try {
      const session = await connectWallet(wallet.provider, { rdns: wallet.rdns });
      onConnected(session, wallet.name);
    } catch (error) {
      onError(error);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="wallet-overlay" onClick={() => { if (!busy) onClose(); }}>
      <div
        className="wallet-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="wallet-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <button className="wallet-close" type="button" aria-label="Close" onClick={onClose} disabled={Boolean(busy)}>
          ×
        </button>
        <div className="wallet-col list">
          <h2 id="wallet-dialog-title">Connect a Wallet</h2>
          <p className="wallet-label">Installed</p>
          {installed.length === 0 && (
            <p className="wallet-empty">No wallet extension was found in this browser.</p>
          )}
          {installed.map((wallet) => (
            <button key={wallet.rdns} className="wallet-row" type="button" disabled={Boolean(busy)} onClick={() => pick(wallet)}>
              <Mark wallet={wallet} />
              <span>
                <strong>{wallet.name}</strong>
                {wallet.recent && <em>Recent</em>}
              </span>
              {busy === wallet.rdns && <i className="spinner" />}
            </button>
          ))}
          <p className="wallet-label">Popular</p>
          {popular.map((wallet) => (
            <button key={wallet.rdns} className="wallet-row" type="button" onClick={() => pick(wallet)}>
              <Mark wallet={wallet} />
              <span><strong>{wallet.name}</strong></span>
            </button>
          ))}
        </div>
        <div className="wallet-col about">
          <h2>What is a Wallet?</h2>
          <div className="wallet-blurb">
            <span className="wallet-glyph" aria-hidden="true">⌂</span>
            <div>
              <strong>A home for your digital assets</strong>
              <p>Wallets hold the keys to send, receive, and sign. Each account is a different identity.</p>
            </div>
          </div>
          <div className="wallet-blurb">
            <span className="wallet-glyph" aria-hidden="true">⌘</span>
            <div>
              <strong>A new way to log in</strong>
              <p>Pick MetaMask, Backpack, or another installed wallet. The next popup lets you choose the account.</p>
            </div>
          </div>
          <a className="btn primary wallet-get" href="https://ethereum.org/wallets/find-wallet/" target="_blank" rel="noreferrer">
            Get a Wallet
          </a>
          <a className="wallet-learn" href="https://ethereum.org/wallets/" target="_blank" rel="noreferrer">Learn More</a>
        </div>
      </div>
    </div>
  );
}
