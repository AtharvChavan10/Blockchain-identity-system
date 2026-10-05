import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  anchorTx,
  errorText,
  adminNonce,
  claimAdmin,
  getAdmin,
  getHealth,
  getIdentity,
  listIdentities,
  removeIdentity,
  revokeIdentity,
  saveIdentity,
  uploadFile,
  verifyIdentity,
} from './api';
import {
  CONTRACT_ADDRESS,
  anchorIdentity,
  chainErrorText,
  quietConnect,
  signAdminMessage,
  watchAccounts,
  readOnChain,
  removeOnChain,
  revokeOnChain,
  verifyOnChain,
} from './chain';
import WalletModal from './WalletModal';
import './App.css';

const VIEWS = ['home', 'create', 'lookup', 'console'];
const ACCEPT = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];
const LOCAL_KEY = 'identra.localId';
const PHASES = {
  upload: 'Uploading',
  ledger: 'Writing ledger',
  chain: 'Anchoring',
};

const STEPS = [
  ['01', 'Capture', 'Add a name, an email, and the document that proves them.'],
  ['02', 'Pin', 'The file is hashed and stored on IPFS, or in the local vault until Pinata is configured.'],
  ['03', 'Seal', 'The hash is written to the ledger and, with a wallet, to the identity contract.'],
  ['04', 'Verify', 'An admin confirms the record. A new document clears that check.'],
];

const EXAMPLE = {
  name: 'Atharv',
  email: 'atharv@identra.dev',
};

const FEATURES = [
  ['Hash, not a copy', 'The pass keeps a fingerprint of the document, so the proof stays stable.'],
  ['One lookup', 'Anyone with the address can open the pass and follow the file.'],
  ['Fresh checks', 'Replacing the document returns the pass to unverified.'],
  ['Wallet ready', 'MetaMask can anchor the same record on your local chain.'],
];

function viewFromHash() {
  const name = window.location.hash.replace(/^#\/?/, '');
  return VIEWS.includes(name) ? name : 'home';
}

function short(value, head = 6, tail = 4) {
  if (!value) return '—';
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function when(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function createLocalId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return `local_${[...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')}`;
}

function Pass({ name, email, id, docHash, verified, fileName, gatewayUrl, storage, txHash, tilt }) {
  const [copied, setCopied] = useState(false);
  const cardRef = useRef(null);
  const frame = useRef(0);
  const current = useRef({ x: 0, y: 0 });
  const target = useRef({ x: 0, y: 0 });

  function settle() {
    const node = cardRef.current;
    if (!node) return;
    current.current.x += (target.current.x - current.current.x) * 0.14;
    current.current.y += (target.current.y - current.current.y) * 0.14;
    node.style.transform = `rotateX(${current.current.y.toFixed(2)}deg) rotateY(${current.current.x.toFixed(2)}deg)`;
    const moving = Math.abs(target.current.x - current.current.x) > 0.05 || Math.abs(target.current.y - current.current.y) > 0.05;
    frame.current = moving ? requestAnimationFrame(settle) : 0;
  }

  function onMove(event) {
    if (!tilt || window.matchMedia('(prefers-reduced-motion: reduce), (pointer: coarse)').matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const px = (event.clientX - rect.left) / rect.width;
    const py = (event.clientY - rect.top) / rect.height;
    event.currentTarget.style.setProperty('--px', `${(px * 100).toFixed(1)}%`);
    event.currentTarget.style.setProperty('--py', `${(py * 100).toFixed(1)}%`);
    target.current = { x: (px - 0.5) * 10, y: (0.5 - py) * 8 };
    if (!frame.current) frame.current = requestAnimationFrame(settle);
  }

  function onLeave(event) {
    target.current = { x: 0, y: 0 };
    event.currentTarget.style.setProperty('--px', '50%');
    event.currentTarget.style.setProperty('--py', '0%');
    if (!frame.current) frame.current = requestAnimationFrame(settle);
  }

  return (
    <article className={tilt ? 'pass interactive' : 'pass'} ref={cardRef} onMouseMove={onMove} onMouseLeave={onLeave}>
      <div className="pass-shine" aria-hidden="true" />
      <div className="pass-top">
        <span className="pass-brand">Identra</span>
        <span className={verified ? 'pill ok' : 'pill wait'}>{verified ? 'Verified' : 'Unverified'}</span>
      </div>
      <h3 className="pass-name">{name || EXAMPLE.name}</h3>
      <p className="pass-email">{email || EXAMPLE.email}</p>
      {gatewayUrl && (
        <div className="download-box">
          <a className="doc-link" href={gatewayUrl} rel="noreferrer">Download document</a>
          <button
            className="btn ghost small"
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(gatewayUrl);
              setCopied(true);
              setTimeout(() => setCopied(false), 1600);
            }}
          >
            {copied ? 'Copied' : 'Copy link'}
          </button>
          <p className="mono">{gatewayUrl}</p>
        </div>
      )}
      <div className="pass-foot">
        <span className="mono">{short(id, 8, 4)}</span>
        <span className="mono">{storage === 'ipfs' ? 'IPFS' : 'Vault'} · {short(docHash, 6, 4)}</span>
      </div>
      {txHash && <p className="mono">Tx {short(txHash, 8, 6)}</p>}
    </article>
  );
}

function Home({ mine, go }) {
  return (
    <>
      <section className="hero">
        <div>
          <p className="kicker">Decentralized identity</p>
          <h1 className="display">Identity that <em>cannot be forged.</em></h1>
          <p className="lede">
            Seal a document to a ledger, pin the file to IPFS, and let anyone verify the pass from a single address.
          </p>
          <div className="hero-actions">
            <button className="btn primary" type="button" onClick={() => go('create')}>Create a pass</button>
            <button className="btn ghost" type="button" onClick={() => go('lookup')}>Look someone up</button>
          </div>
          <div className="chips">
            <button className="chip" type="button" onClick={() => go('create')}>IPFS</button>
            <button className="chip" type="button" onClick={() => go('create')}>SHA-256</button>
            <button className="chip" type="button" onClick={() => go('create')}>Wallet anchor</button>
            <button className="chip" type="button" onClick={() => go('console')}>Admin verify</button>
          </div>
        </div>
        <div className="hero-visual">
          <Pass
            tilt
            name={mine?.name || EXAMPLE.name}
            email={mine?.email || EXAMPLE.email}
            id={mine?.id || '0xA41C91eE02b8c4D17a09'}
            docHash={mine?.docHash || 'bafybeigdyrzt5sfp7k'}
            verified={mine ? mine.verified : true}
            fileName={mine?.fileName || 'passport.pdf'}
            gatewayUrl={mine?.gatewayUrl}
            storage={mine?.storage || 'ipfs'}
            txHash={mine?.txHash}
          />
          <p className="hint">{mine ? 'On your ledger' : 'Example pass'}</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>How a pass is made</h2>
        </div>
        <div className="steps">
          {STEPS.map(([number, title, copy]) => (
            <button className="step" type="button" key={number} onClick={() => go('create')}>
              <span className="step-no">{number}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </button>
          ))}
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <h2>Built to feel finished</h2>
        </div>
        <div className="feature-grid">
          {FEATURES.map(([title, copy]) => (
            <article className="feature" key={title}>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="band">
        <div>
          <h2>Your records, ready to check.</h2>
          <p className="muted">Create a pass in this browser, then verify it from the console.</p>
        </div>
        <button className="btn primary" type="button" onClick={() => go('create')}>Start sealing</button>
      </section>
    </>
  );
}

function CreatePanel({ activeId, mine, health, wallet, keyMode, toast, refresh, go, ensureLocal, onChooseWallet }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState('');
  const [touched, setTouched] = useState(false);
  const [phase, setPhase] = useState('');
  const [progress, setProgress] = useState(0);
  const [receipt, setReceipt] = useState(null);
  const [hot, setHot] = useState(false);
  const dragDepth = useRef(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!mine || touched) return;
    setName(mine.name || '');
    setEmail(mine.email || '');
  }, [mine, touched]);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) {
      setPreview('');
      return undefined;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function chooseFile(next) {
    if (!next) return;
    if (!ACCEPT.includes(next.type)) {
      toast('bad', 'Use a PNG, JPEG, WEBP, or PDF');
      return;
    }
    if (next.size > 10 * 1024 * 1024) {
      toast('bad', 'File exceeds the 10MB limit');
      return;
    }
    setTouched(true);
    setFile(next);
  }

  const steps = [
    file ? 'upload' : null,
    'ledger',
    CONTRACT_ADDRESS && wallet && activeId.startsWith('0x') ? 'chain' : null,
  ].filter(Boolean);

  async function onSubmit(event) {
    event.preventDefault();
    if (!activeId) {
      toast('bad', keyMode === 'wallet'
        ? 'Connect a wallet. The wallet key needs a wallet.'
        : 'Choose Local key. You do not need a wallet.');
      return;
    }
    if (name.trim().length < 2) {
      toast('bad', 'Name must be between 2 and 80 characters');
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast('bad', 'Enter a valid email');
      return;
    }
    if (!file && !mine?.docHash) {
      toast('bad', 'Add a document to seal this identity');
      return;
    }

    let chainNote = '';
    try {
      let uploaded = null;
      if (file) {
        setPhase('upload');
        setProgress(6);
        uploaded = await uploadFile(file, setProgress);
      }

      setPhase('ledger');
      const saved = await saveIdentity({
        id: activeId,
        name: name.trim(),
        email: email.trim(),
        docHash: uploaded?.docHash || mine.docHash,
        gatewayUrl: uploaded?.gatewayUrl || mine?.gatewayUrl || '',
        fileName: uploaded?.fileName || mine?.fileName || '',
        fileType: uploaded?.fileType || mine?.fileType || '',
        storage: uploaded?.storage || mine?.storage || 'local',
      });

      let txHash = saved.txHash || '';
      if (CONTRACT_ADDRESS && wallet && activeId.startsWith('0x')) {
        setPhase('chain');
        try {
          txHash = await anchorIdentity({
            name: saved.name,
            email: saved.email,
            docHash: saved.docHash,
          });
          await anchorTx(saved.id, txHash);
        } catch (error) {
          chainNote = chainErrorText(error);
        }
      }

      await refresh().catch(() => {});
      setReceipt({ ...saved, txHash });
      setPhase('');
      setProgress(0);
      setFile(null);
      toast('ok', txHash && !chainNote ? 'Identity sealed and anchored on-chain' : 'Identity sealed on the ledger');
      if (chainNote) toast('bad', `Saved on the ledger. ${chainNote}`);
    } catch (error) {
      setPhase('');
      setProgress(0);
      toast('bad', errorText(error, 'Could not seal identity'));
    }
  }

  function another() {
    setReceipt(null);
    setFile(null);
    setName('');
    setEmail('');
    setTouched(true);
    setPhase('');
    setProgress(0);
  }

  if (receipt) {
    return (
      <section className="receipt">
        <div className="check" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="32" height="32">
            <path d="M5 12.5 9.2 17 19 7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="kicker">Sealed</p>
        <h2>The pass is on the ledger.</h2>
        <Pass {...receipt} tilt />
        <div className="hero-actions">
          <button className="btn primary" type="button" onClick={() => go('lookup')}>Look it up</button>
          <button className="btn ghost" type="button" onClick={another}>Create another</button>
        </div>
      </section>
    );
  }

  return (
    <>
      <header className="page-intro">
        <p className="kicker">Create</p>
        <h1>{mine ? 'Update this pass' : 'Seal a new pass'}</h1>
        <p className="lede">The card on the right follows what you type. A new document clears verification.</p>
      </header>
      <section className="split">
        <form className="panel" onSubmit={onSubmit}>
          <div className="id-chooser">
            <button className={keyMode === 'local' ? 'btn ghost choice on' : 'btn ghost choice'} type="button" onClick={ensureLocal}>
              Local key
            </button>
            <button className={keyMode === 'wallet' ? 'btn ghost choice on' : 'btn ghost choice'} type="button" onClick={onChooseWallet}>
              {keyMode === 'wallet' && wallet ? 'Switch wallet' : 'Wallet'}
            </button>
            <div className="key-help">
              <p className={keyMode === 'local' ? 'on' : ''}>
                <strong>Local key.</strong> You do not need a wallet. This browser keeps the pass.
              </p>
              <p className={keyMode === 'wallet' ? 'on' : ''}>
                <strong>Wallet.</strong> You need to connect a wallet. The pass uses that wallet address.
              </p>
            </div>
            <p className="key-line">{activeId || (keyMode === 'wallet' ? 'Connect a wallet to use this pass' : 'Click Local key to create one')}</p>
          </div>

          <label className="field">
            <span>Full name</span>
            <input value={name} maxLength={80} onChange={(event) => { setTouched(true); setName(event.target.value); }} placeholder={EXAMPLE.name} />
          </label>
          <label className="field">
            <span>Email</span>
            <input type="email" value={email} onChange={(event) => { setTouched(true); setEmail(event.target.value); }} placeholder={EXAMPLE.email} />
          </label>

          <div
            className={hot ? 'drop hot' : 'drop'}
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              dragDepth.current += 1;
              setHot(true);
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragLeave={(event) => {
              event.preventDefault();
              dragDepth.current -= 1;
              if (dragDepth.current <= 0) {
                dragDepth.current = 0;
                setHot(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              dragDepth.current = 0;
              setHot(false);
              chooseFile(event.dataTransfer.files?.[0]);
            }}
          >
            {preview && <img className="preview-img" src={preview} alt="" />}
            <div className="file-meta">
              <strong>{file ? file.name : mine?.fileName || 'Drop a document here'}</strong>
              <p>{file ? formatSize(file.size) : 'PNG, JPEG, WEBP, or PDF · 10MB max'}</p>
            </div>
          </div>
          <input
            ref={inputRef}
            hidden
            type="file"
            accept={ACCEPT.join(',')}
            onChange={(event) => {
              chooseFile(event.target.files?.[0]);
              event.target.value = '';
            }}
          />

          {phase === 'upload' && (
            <div className="meter" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
              <span style={{ width: `${progress}%` }} />
            </div>
          )}

          {phase && (
            <div className="phases" aria-live="polite">
              {steps.map((step) => {
                const order = steps.indexOf(step);
                const current = steps.indexOf(phase);
                const state = order < current ? 'done' : order === current ? 'on' : '';
                return <span className={`phase ${state}`} key={step}>{PHASES[step]}</span>;
              })}
            </div>
          )}

          <div className="hero-actions">
            <button className="btn primary" type="submit" disabled={Boolean(phase)}>
              {phase ? <><span className="spinner" /> {PHASES[phase]}</> : mine ? 'Update pass' : 'Seal identity'}
            </button>
            {file && (
              <button className="btn ghost" type="button" onClick={() => setFile(null)} disabled={Boolean(phase)}>
                Remove file
              </button>
            )}
          </div>
          <p className="hint">
            Storage is {health?.storage === 'ipfs' ? 'IPFS through Pinata' : 'the local vault'}.
            {keyMode === 'wallet'
              ? ' This wallet key needs a connected wallet, and that wallet anchors the hash on-chain.'
              : ' This local key does not need a wallet.'}
          </p>
        </form>

        <div className="preview-col">
          <Pass
            tilt
            name={name}
            email={email}
            id={activeId}
            docHash={file ? 'Pending hash' : mine?.docHash}
            verified={file ? false : Boolean(mine?.verified)}
            fileName={file?.name || mine?.fileName}
            storage={health?.storage}
          />
          <p className="hint">Live preview</p>
        </div>
      </section>
    </>
  );
}

function LookupPanel({ identities, loading, toast }) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [missing, setMissing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [chain, setChain] = useState(null);

  useEffect(() => {
    setSelected((current) => {
      if (!current) return current;
      return identities.find((item) => item.id === current.id) || null;
    });
  }, [identities]);

  useEffect(() => {
    if (!selected || !CONTRACT_ADDRESS) {
      setChain(null);
      return undefined;
    }
    let cancel = false;
    let settled = false;
    setChain({ state: 'loading' });
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        setChain({ state: 'offline' });
      }
    }, 2800);
    readOnChain(selected.id)
      .then((data) => {
        if (cancel || settled) return;
        settled = true;
        clearTimeout(timer);
        setChain(data ? { state: 'found', data } : { state: 'absent' });
      })
      .catch(() => {
        if (cancel || settled) return;
        settled = true;
        clearTimeout(timer);
        setChain({ state: 'offline' });
      });
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return identities;
    return identities.filter((item) =>
      item.name.toLowerCase().includes(q) ||
      item.email.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q) ||
      (item.docHash || '').toLowerCase().includes(q)
    );
  }, [identities, query]);

  async function onSubmit(event) {
    event.preventDefault();
    const q = query.trim();
    setMissing(false);
    if (!q) {
      setSelected(null);
      return;
    }
    const local = identities.find((item) => item.id === q.toLowerCase() || item.name.toLowerCase() === q.toLowerCase());
    if (local) {
      setSelected(local);
      return;
    }
    if (/^0x[a-fA-F0-9]{40}$/.test(q) || /^local_[a-f0-9]{16}$/.test(q)) {
      setSearching(true);
      try {
        setSelected(await getIdentity(q));
      } catch (error) {
        if (error?.response?.status === 404) {
          setSelected(null);
          setMissing(true);
        } else {
          toast('bad', errorText(error, 'Lookup failed'));
        }
      } finally {
        setSearching(false);
      }
      return;
    }
    setSelected(null);
    setMissing(filtered.length === 0);
  }

  const chainCopy = {
    loading: 'Checking the chain…',
    found: chain?.data?.verified ? 'On-chain copy is verified.' : 'On-chain copy is waiting for verification.',
    absent: 'This address has no contract record yet.',
    offline: 'The chain node is not reachable from here.',
  };

  return (
    <>
      <header className="page-intro">
        <p className="kicker">Lookup</p>
        <h1>Find a pass.</h1>
        <p className="lede">Search by name, email, address, or document hash.</p>
      </header>
      <form className="search-form" onSubmit={onSubmit}>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or 0x address" aria-label="Search identities" />
        <button className="btn primary" type="submit" disabled={searching}>
          {searching ? 'Searching' : 'Look up'}
        </button>
      </form>

      {selected && (
        <div className="result-stack">
          <Pass {...selected} tilt />
          {CONTRACT_ADDRESS && <p className="chain-note">{chainCopy[chain?.state] || ''}</p>}
        </div>
      )}
      {missing && <p className="empty">No pass matched that search.</p>}

      {loading ? (
        <p className="empty pulse">Loading the ledger…</p>
      ) : filtered.length === 0 ? (
        <p className="empty">{identities.length === 0 ? 'The ledger is empty. Seal a pass to see it here.' : 'Nothing on the ledger matches that filter.'}</p>
      ) : (
        <div className="directory">
          {filtered.map((item) => (
            <button className={selected?.id === item.id ? 'person on' : 'person'} type="button" key={item.id} onClick={() => { setSelected(item); setMissing(false); }}>
              <div className="person-top">
                <h3>{item.name}</h3>
                <span className={item.verified ? 'pill ok' : 'pill wait'}>{item.verified ? 'Verified' : 'Unverified'}</span>
              </div>
              <p className="mono">{item.id}</p>
              <p>{when(item.updatedAt)}</p>
            </button>
          ))}
        </div>
      )}
    </>
  );
}

function ConsolePanel({ identities, loading, wallet, adminAddress, toast, refresh, onConnect, prove }) {
  const [filter, setFilter] = useState('all');
  const [busyId, setBusyId] = useState('');
  const [pendingRemove, setPendingRemove] = useState('');
  const [claiming, setClaiming] = useState(false);
  const connected = wallet?.address?.toLowerCase() || '';
  const isAdmin = Boolean(adminAddress) && connected === adminAddress;

  const shown = identities.filter((item) => {
    if (filter === 'pending') return !item.verified;
    if (filter === 'verified') return item.verified;
    return true;
  });

  async function becomeAdmin() {
    setClaiming(true);
    try {
      await prove('claim', '-');
      await refresh();
      toast('ok', 'This wallet is the admin. Another wallet cannot take that role.');
    } catch (error) {
      toast('bad', errorText(error, chainErrorText(error)));
    } finally {
      setClaiming(false);
    }
  }

  async function run(id, action) {
    if (!isAdmin) {
      toast('bad', 'Connect the admin wallet to verify');
      return;
    }
    setBusyId(id);
    try {
      const proof = await prove(action, id);
      if (action === 'verify') await verifyIdentity(id, proof);
      if (action === 'revoke') await revokeIdentity(id, proof);
      if (action === 'remove') await removeIdentity(id, proof);
      await refresh();
      const labels = { verify: 'Identity verified', revoke: 'Verification revoked', remove: 'Identity removed' };
      toast('ok', labels[action]);
      setPendingRemove('');

      if (CONTRACT_ADDRESS && id.startsWith('0x') && action !== 'remove') {
        try {
          if (action === 'verify') await verifyOnChain(id);
          if (action === 'revoke') await revokeOnChain(id);
          toast('ok', 'Chain record updated');
        } catch (error) {
          const message = chainErrorText(error);
          if (!/Not admin/i.test(message) && !/Not registered/i.test(message)) {
            toast('bad', `Ledger updated. ${message}`);
          }
        }
      }
      if (CONTRACT_ADDRESS && id.startsWith('0x') && action === 'remove') {
        try {
          await removeOnChain(id);
        } catch (error) {
          const message = chainErrorText(error);
          if (!/Not admin/i.test(message) && !/Not registered/i.test(message)) {
            toast('bad', `Removed from the ledger. ${message}`);
          }
        }
      }
    } catch (error) {
      toast('bad', error.shortMessage || errorText(error, 'Could not update that identity'));
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <header className="page-intro">
        <p className="kicker">Console</p>
        <h1>Verify the queue.</h1>
        <p className="lede">
          {adminAddress
            ? <>Admin wallet <span className="mono">{short(adminAddress, 8, 6)}</span>. Any wallet can connect. Only this one can verify.</>
            : 'Connect any wallet. The first one you make admin is the only one that can verify.'}
        </p>
      </header>
      <div className="admin-bar">
        {!wallet && (
          <button className="btn primary" type="button" onClick={onConnect}>Connect wallet</button>
        )}
        {wallet && !adminAddress && (
          <button className="btn primary" type="button" disabled={claiming} onClick={becomeAdmin}>
            {claiming ? 'Waiting for signature' : 'Make this wallet the admin'}
          </button>
        )}
        {wallet && (
          <button className="btn ghost" type="button" onClick={onConnect}>Switch wallet</button>
        )}
        {wallet && adminAddress && !isAdmin && (
          <p className="hint">Connected wallet {short(connected, 8, 6)} can use the app. Verify stays with the admin wallet.</p>
        )}
        {isAdmin && <span className="pill ok">Admin wallet connected</span>}
        <button className="btn ghost" type="button" onClick={() => refresh().catch(() => toast('bad', 'Ledger API is offline'))}>Refresh</button>
      </div>
      <div className="filters">
        {[
          ['all', `All ${identities.length}`],
          ['pending', `Pending ${identities.filter((item) => !item.verified).length}`],
          ['verified', `Verified ${identities.filter((item) => item.verified).length}`],
        ].map(([id, label]) => (
          <button key={id} className={filter === id ? 'btn ghost small choice on' : 'btn ghost small'} type="button" onClick={() => setFilter(id)}>
            {label}
          </button>
        ))}
      </div>
      {loading ? (
        <p className="empty pulse">Loading the ledger…</p>
      ) : shown.length === 0 ? (
        <p className="empty">No identities in this view yet.</p>
      ) : (
        <div className="queue">
          {shown.map((item) => (
            <article className="queue-card" key={item.id}>
              <div className="queue-top">
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.email}</p>
                  <p className="mono">{item.id}</p>
                </div>
                <span className={item.verified ? 'pill ok' : 'pill wait'}>{item.verified ? 'Verified' : 'Unverified'}</span>
              </div>
              <p className="mono">{short(item.docHash, 10, 6)} · {item.storage === 'ipfs' ? 'IPFS' : 'Local vault'} · {when(item.updatedAt)}</p>
              <div className="row-actions">
                {item.gatewayUrl && (
                  <>
                    <a className="btn ghost small" href={item.gatewayUrl} rel="noreferrer">Download</a>
                    <button
                      className="btn ghost small"
                      type="button"
                      onClick={async () => {
                        await navigator.clipboard.writeText(item.gatewayUrl);
                        toast('ok', 'Download link copied. Paste it in any browser tab.');
                      }}
                    >
                      Copy link
                    </button>
                  </>
                )}
                {isAdmin && !item.verified && (
                  <button className="btn primary small" type="button" disabled={busyId === item.id} onClick={() => run(item.id, 'verify')}>
                    Verify
                  </button>
                )}
                {isAdmin && item.verified && (
                  <button className="btn ghost small" type="button" disabled={busyId === item.id} onClick={() => run(item.id, 'revoke')}>
                    Revoke
                  </button>
                )}
                {isAdmin && (pendingRemove === item.id ? (
                  <button className="btn danger small" type="button" disabled={busyId === item.id} onClick={() => run(item.id, 'remove')}>
                    Confirm remove
                  </button>
                ) : (
                  <button className="btn danger small" type="button" onClick={() => setPendingRemove(item.id)}>
                    Remove
                  </button>
                ))}
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

function App() {
  const [view, setView] = useState(viewFromHash);
  const [menuOpen, setMenuOpen] = useState(false);
  const [health, setHealth] = useState(null);
  const [offline, setOffline] = useState(false);
  const [loading, setLoading] = useState(true);
  const [identities, setIdentities] = useState([]);
  const [wallet, setWallet] = useState(null);
  const [keyMode, setKeyMode] = useState(() => (localStorage.getItem('identra.keyMode') === 'wallet' ? 'wallet' : 'local'));
  const [pickerOpen, setPickerOpen] = useState(false);
  const [adminAddress, setAdminAddress] = useState('');
  const [localId, setLocalId] = useState(() => localStorage.getItem(LOCAL_KEY) || '');
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((kind, text) => {
    const id = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    setToasts((current) => [...current.slice(-3), { id, kind, text }]);
    setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4200);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [nextHealth, nextIdentities, admin] = await Promise.all([getHealth(), listIdentities(), getAdmin()]);
      setHealth(nextHealth);
      setIdentities(nextIdentities);
      setAdminAddress((admin.address || '').toLowerCase());
      setOffline(false);
      setLoading(false);
    } catch (error) {
      setOffline(true);
      setLoading(false);
      throw error;
    }
  }, []);

  useEffect(() => {
    refresh().catch(() => {
      setOffline(true);
      setLoading(false);
    });
  }, [refresh]);

  useEffect(() => {
    const onHash = () => setView(viewFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [view]);

  useEffect(() => {
    let cancelled = false;
    let stop = () => {};
    quietConnect().then((session) => {
      if (cancelled) return;
      if (session) setWallet(session);
      stop = watchAccounts((accounts) => {
        if (!accounts?.length) {
          setWallet(null);
          return;
        }
        setWallet((current) => ({ address: accounts[0], chainId: current?.chainId }));
      });
    }).catch(() => {});
    return () => {
      cancelled = true;
      stop();
    };
  }, [wallet?.address]);

  const activeId = keyMode === 'wallet' ? (wallet?.address?.toLowerCase() || '') : localId;
  const mine = identities.find((item) => item.id === activeId) || null;

  function go(next) {
    const hash = next === 'home' ? '#/' : `#/${next}`;
    if (window.location.hash !== hash) window.location.hash = hash;
    else setView(next);
    setMenuOpen(false);
  }

  function ensureLocal() {
    const next = localId || createLocalId();
    localStorage.setItem(LOCAL_KEY, next);
    localStorage.setItem('identra.keyMode', 'local');
    setLocalId(next);
    setKeyMode('local');
    pushToast('ok', 'Local key selected. You do not need a wallet.');
  }

  function onConnect() {
    setPickerOpen(true);
  }

  function onChooseWallet() {
    if (wallet && keyMode !== 'wallet') {
      localStorage.setItem('identra.keyMode', 'wallet');
      setKeyMode('wallet');
      pushToast('ok', 'Wallet selected. This pass uses your connected wallet.');
      return;
    }
    setPickerOpen(true);
  }

  function onWalletConnected(session) {
    const switched = wallet?.address && wallet.address.toLowerCase() !== session.address.toLowerCase();
    setWallet(session);
    localStorage.setItem('identra.keyMode', 'wallet');
    setKeyMode('wallet');
    setPickerOpen(false);
    pushToast('ok', switched ? 'Switched to the other wallet' : 'Wallet connected. This pass uses that wallet.');
  }

  async function proveAdmin(action, id) {
    if (!wallet?.address) throw new Error('Connect the admin wallet');
    const address = wallet.address.toLowerCase();
    if (action !== 'claim' && adminAddress && address !== adminAddress) {
      throw new Error('This wallet is not the admin');
    }
    const issued = await adminNonce({ action, id, address });
    const signed = await signAdminMessage(issued.message);
    if (signed.address !== address) throw new Error('MetaMask signed with a different wallet');
    const proof = { address, signature: signed.signature, nonce: issued.nonce };
    if (action === 'claim') {
      const saved = await claimAdmin(proof);
      setAdminAddress(saved.address);
    }
    return proof;
  }

  return (
    <div
      className="app"
      onMouseMove={(event) => {
        if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        event.currentTarget.style.setProperty('--mx', `${event.clientX}px`);
        event.currentTarget.style.setProperty('--my', `${event.clientY}px`);
      }}
    >
      <div className="spotlight" aria-hidden="true" />
      <div className="aurora" aria-hidden="true">
        <span className="orb orb-a" />
        <span className="orb orb-b" />
        <span className="orb orb-c" />
      </div>
      <div className="noise" aria-hidden="true" />

      <header className="nav">
        <div className="wrap nav-inner">
          <button className="brand" type="button" onClick={() => go('home')}>
            <span className="mark" aria-hidden="true" />
            Identra
          </button>
          <nav className={menuOpen ? 'nav-links open' : 'nav-links'}>
            {[
              ['home', 'Overview'],
              ['create', 'Create'],
              ['lookup', 'Lookup'],
              ['console', 'Console'],
            ].map(([id, label]) => (
              <button key={id} className={view === id ? 'nav-link active' : 'nav-link'} type="button" onClick={() => go(id)}>
                {label}
              </button>
            ))}
          </nav>
          <div className="nav-actions">
            {wallet ? (
              <button className="btn ghost small wallet-pill" type="button" onClick={onConnect} title="Choose another wallet">
                <span className="status-dot ok" />
                {short(wallet.address)}
              </button>
            ) : (
              <button className="btn primary small" type="button" onClick={onConnect}>Connect wallet</button>
            )}
            <button
              className={menuOpen ? 'nav-toggle open' : 'nav-toggle'}
              type="button"
              aria-label="Menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </header>

      {offline && (
        <div className="banner" role="alert">
          The ledger API is offline. Start it with <span className="mono">npm run dev</span>.
        </div>
      )}

      <main className="wrap stage">
        <div className={view === 'home' ? 'view-panel active' : 'view-panel'}>
          <Home mine={mine} go={go} />
        </div>
        <div className={view === 'create' ? 'view-panel active' : 'view-panel'}>
          <CreatePanel
            activeId={activeId}
            mine={mine}
            health={health}
            wallet={wallet}
            keyMode={keyMode}
            toast={pushToast}
            refresh={refresh}
            go={go}
            ensureLocal={ensureLocal}
            onChooseWallet={onChooseWallet}
          />
        </div>
        <div className={view === 'lookup' ? 'view-panel active' : 'view-panel'}>
          <LookupPanel identities={identities} loading={loading} toast={pushToast} />
        </div>
        <div className={view === 'console' ? 'view-panel active' : 'view-panel'}>
          <ConsolePanel
            identities={identities}
            loading={loading}
            wallet={wallet}
            adminAddress={adminAddress}
            toast={pushToast}
            refresh={refresh}
            onConnect={onConnect}
            prove={proveAdmin}
          />
        </div>
      </main>

      <footer className="footer">
        <div className="wrap footer-inner">
          <span className="footer-status">
            <span className={offline ? 'status-dot bad' : health ? 'status-dot ok' : 'status-dot'} />
            {offline ? 'Ledger offline' : health ? `Ledger online · ${health.storage === 'ipfs' ? 'IPFS' : 'local vault'} · ${health.identities} passes` : 'Checking ledger'}
          </span>
          <span>Identra · {new Date().getFullYear()}</span>
        </div>
      </footer>

      <WalletModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onConnected={onWalletConnected}
        onError={(error) => pushToast('bad', chainErrorText(error))}
      />

      <div className="toasts" aria-live="polite">
        {toasts.map((item) => (
          <div className={item.kind === 'ok' ? 'toast ok' : 'toast bad'} key={item.id} role="status">{item.text}</div>
        ))}
      </div>
    </div>
  );
}

export default App;
