import express from 'express';
import multer from 'multer';
import cors from 'cors';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { verifyMessage } from 'ethers';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3001;
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'application/pdf']);
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp', '.pdf']);

const uploadDir = path.join(__dirname, 'uploads');
const dataDir = path.join(__dirname, 'data');
const dbPath = path.join(dataDir, 'identities.json');
const adminPath = path.join(dataDir, 'admin.json');

fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(dataDir, { recursive: true });

if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, JSON.stringify({ identities: {} }, null, 2));
}

let writeChain = Promise.resolve();

function withDb(mutator) {
  const run = writeChain.then(async () => {
    const db = JSON.parse(await fs.promises.readFile(dbPath, 'utf8'));
    const result = await mutator(db);
    await fs.promises.writeFile(dbPath, JSON.stringify(db, null, 2));
    return result;
  });
  writeChain = run.then(
    () => {},
    () => {}
  );
  return run;
}

function readDb() {
  return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
}

function normalizeId(id) {
  if (typeof id !== 'string') return null;
  const value = id.trim();
  if (/^0x[a-fA-F0-9]{40}$/.test(value)) return value.toLowerCase();
  if (/^local_[a-f0-9]{16}$/.test(value)) return value;
  return null;
}

function publicIdentity(record) {
  return {
    id: record.id,
    name: record.name,
    email: record.email,
    docHash: record.docHash,
    gatewayUrl: record.gatewayUrl,
    fileName: record.fileName,
    fileType: record.fileType,
    storage: record.storage,
    verified: Boolean(record.verified),
    txHash: record.txHash || '',
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
  };
}

const adminNonces = new Map();

function readAdmin() {
  if (!fs.existsSync(adminPath)) return '';
  try {
    const parsed = JSON.parse(fs.readFileSync(adminPath, 'utf8'));
    return typeof parsed.address === 'string' ? parsed.address.toLowerCase() : '';
  } catch {
    return '';
  }
}

function writeAdmin(address) {
  fs.writeFileSync(adminPath, JSON.stringify({ address }, null, 2));
}

function issueNonce(action, id, address) {
  const normalized = String(address || '').trim().toLowerCase();
  if (!/^0x[a-f0-9]{40}$/.test(normalized)) {
    const error = new Error('Connect a wallet first');
    error.status = 400;
    throw error;
  }
  const nonce = crypto.randomBytes(16).toString('hex');
  const message = `Identra admin\n${action}\n${id}\n${normalized}\n${nonce}`;
  adminNonces.set(nonce, {
    message,
    address: normalized,
    action,
    id,
    expires: Date.now() + 5 * 60 * 1000,
  });
  return { nonce, message };
}

function consumeProof(body, action, id) {
  const address = String(body.address || '').trim().toLowerCase();
  const nonce = String(body.nonce || '');
  const pending = adminNonces.get(nonce);
  if (!pending || pending.expires < Date.now() || pending.action !== action || pending.id !== id || pending.address !== address) {
    const error = new Error('Admin signature expired. Sign again from the admin wallet.');
    error.status = 401;
    throw error;
  }
  adminNonces.delete(nonce);

  let recovered = '';
  try {
    recovered = verifyMessage(pending.message, String(body.signature || '')).toLowerCase();
  } catch {
    const error = new Error('Wallet signature was rejected');
    error.status = 401;
    throw error;
  }
  if (recovered !== address) {
    const error = new Error('Wallet signature was rejected');
    error.status = 401;
    throw error;
  }

  const admin = readAdmin();
  if (action === 'claim') {
    if (admin && admin !== recovered) {
      const error = new Error('Another wallet cannot become the admin');
      error.status = 403;
      throw error;
    }
    return recovered;
  }
  if (!admin || admin !== recovered) {
    const error = new Error('This wallet is not the admin');
    error.status = 403;
    throw error;
  }
  return recovered;
}

const app = express();
app.disable('x-powered-by');
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/files', express.static(uploadDir, {
  fallthrough: false,
  setHeaders(res, filePath) {
    const name = path.basename(filePath).replace(/[^a-zA-Z0-9._-]/g, '');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
  },
}));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_TYPES.has(file.mimetype)) {
      cb(new Error('Use a PNG, JPEG, WEBP, or PDF'));
      return;
    }
    cb(null, true);
  },
});

function uploadSingle(req, res, next) {
  upload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File exceeds the 10MB limit' });
    }
    return res.status(400).json({ error: err.message || 'Upload rejected' });
  });
}

app.get('/api/admin', (req, res) => {
  res.json({ address: readAdmin() });
});

app.post('/api/admin/nonce', (req, res) => {
  try {
    const action = String(req.body.action || '');
    if (!['claim', 'verify', 'revoke', 'remove'].includes(action)) {
      return res.status(400).json({ error: 'Unknown admin action' });
    }
    const id = action === 'claim' ? '-' : normalizeId(String(req.body.id || ''));
    if (action !== 'claim' && !id) return res.status(400).json({ error: 'Invalid identity id' });
    res.json(issueNonce(action, action === 'claim' ? '-' : id, req.body.address));
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.post('/api/admin/claim', (req, res) => {
  try {
    const address = consumeProof(req.body, 'claim', '-');
    writeAdmin(address);
    res.json({ address });
  } catch (error) {
    res.status(error.status || 400).json({ error: error.message });
  }
});

app.get('/api/health', (req, res) => {
  const db = readDb();
  res.json({
    status: 'ok',
    storage: process.env.PINATA_JWT ? 'ipfs' : 'local',
    pinata: Boolean(process.env.PINATA_JWT),
    identities: Object.keys(db.identities).length,
  });
});

app.get('/api/identities', (req, res) => {
  const db = readDb();
  const identities = Object.values(db.identities)
    .map(publicIdentity)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
  res.json({ identities });
});

app.get('/api/identities/:id', (req, res) => {
  const id = normalizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid identity id' });
  const record = readDb().identities[id];
  if (!record) return res.status(404).json({ error: 'Identity not found' });
  res.json(publicIdentity(record));
});

app.post('/api/identities', async (req, res) => {
  try {
    const id = normalizeId(req.body.id);
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const docHash = String(req.body.docHash || '').trim();
    const gatewayUrl = String(req.body.gatewayUrl || '').trim();
    const fileName = String(req.body.fileName || '').trim();
    const fileType = String(req.body.fileType || '').trim();
    const storage = req.body.storage === 'ipfs' ? 'ipfs' : 'local';
    const txHash = String(req.body.txHash || '').trim();

    if (!id) return res.status(400).json({ error: 'A wallet address or local key is required' });
    if (name.length < 2 || name.length > 80) {
      return res.status(400).json({ error: 'Name must be between 2 and 80 characters' });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ error: 'Enter a valid email' });
    }
    if (!docHash) return res.status(400).json({ error: 'Upload a document before sealing' });

    const saved = await withDb((db) => {
      const existing = db.identities[id];
      const now = new Date().toISOString();
      const docChanged = !existing || existing.docHash !== docHash;
      const record = {
        id,
        name,
        email,
        docHash,
        gatewayUrl: gatewayUrl || existing?.gatewayUrl || '',
        fileName: fileName || existing?.fileName || '',
        fileType: fileType || existing?.fileType || '',
        storage,
        verified: docChanged ? false : Boolean(existing?.verified),
        txHash: txHash || (docChanged ? '' : existing?.txHash || ''),
        createdAt: existing?.createdAt || now,
        updatedAt: now,
      };
      db.identities[id] = record;
      return publicIdentity(record);
    });

    res.status(201).json(saved);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Could not save identity' });
  }
});

app.post('/api/identities/:id/anchor', async (req, res) => {
  const id = normalizeId(req.params.id);
  const txHash = String(req.body.txHash || '').trim();
  if (!id) return res.status(400).json({ error: 'Invalid identity id' });
  if (!/^0x[a-fA-F0-9]{64}$/.test(txHash)) {
    return res.status(400).json({ error: 'Invalid transaction hash' });
  }

  try {
    const saved = await withDb((db) => {
      const existing = db.identities[id];
      if (!existing) {
        const error = new Error('Identity not found');
        error.status = 404;
        throw error;
      }
      existing.txHash = txHash;
      existing.updatedAt = new Date().toISOString();
      return publicIdentity(existing);
    });
    res.json(saved);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Could not save transaction' });
  }
});

app.post('/api/identities/:id/verify', async (req, res) => {
  await setVerified(req, res, true);
});

app.post('/api/identities/:id/revoke', async (req, res) => {
  await setVerified(req, res, false);
});

async function setVerified(req, res, verified) {
  const id = normalizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid identity id' });

  try {
    consumeProof(req.body, verified ? 'verify' : 'revoke', id);
    const saved = await withDb((db) => {
      const existing = db.identities[id];
      if (!existing) {
        const error = new Error('Identity not found');
        error.status = 404;
        throw error;
      }
      existing.verified = verified;
      existing.updatedAt = new Date().toISOString();
      return publicIdentity(existing);
    });
    res.json(saved);
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Update failed' });
  }
}

app.delete('/api/identities/:id', async (req, res) => {
  const id = normalizeId(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid identity id' });

  try {
    consumeProof(req.body, 'remove', id);
    const removed = await withDb((db) => {
      if (!db.identities[id]) {
        const error = new Error('Identity not found');
        error.status = 404;
        throw error;
      }
      delete db.identities[id];
      return true;
    });
    res.json({ success: removed });
  } catch (error) {
    res.status(error.status || 500).json({ error: error.message || 'Remove failed' });
  }
});

app.post('/api/upload', uploadSingle, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    const sha256 = crypto.createHash('sha256').update(req.file.buffer).digest('hex');
    const originalName = path.basename(req.file.originalname || 'document');

    if (process.env.PINATA_JWT) {
      const form = new FormData();
      form.append('file', req.file.buffer, {
        filename: originalName,
        contentType: req.file.mimetype,
      });

      const pinataRes = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', form, {
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        headers: {
          Authorization: `Bearer ${process.env.PINATA_JWT}`,
          ...form.getHeaders(),
        },
      });

      const cid = pinataRes.data.IpfsHash;
      return res.json({
        success: true,
        IpfsHash: cid,
        docHash: cid,
        PinSize: pinataRes.data.PinSize,
        Timestamp: pinataRes.data.Timestamp,
        gatewayUrl: `https://gateway.pinata.cloud/ipfs/${cid}`,
        fileName: originalName,
        fileType: req.file.mimetype,
        storage: 'ipfs',
        sha256,
      });
    }

    const ext = path.extname(originalName).toLowerCase();
    const safeExt = ALLOWED_EXT.has(ext) ? ext : '';
    const filename = `${sha256}${safeExt}`;
    await fs.promises.writeFile(path.join(uploadDir, filename), req.file.buffer);

    return res.json({
      success: true,
      IpfsHash: sha256,
      docHash: sha256,
      gatewayUrl: `${req.protocol}://${req.get('host')}/files/${filename}`,
      fileName: originalName,
      fileType: req.file.mimetype,
      storage: 'local',
      sha256,
      Timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Upload error:', error.response?.data || error.message);
    const detail = error.response?.data?.error?.details || error.response?.data?.error || error.message;
    res.status(502).json({ error: typeof detail === 'string' ? detail : 'Upload failed' });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ error: 'Not found' });
});

if (process.env.NODE_ENV === 'production') {
  const buildPath = path.join(__dirname, 'frontend', 'build');
  app.use(express.static(buildPath));
  app.get('*', (req, res) => {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
}

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  const status = error.status || error.statusCode || 500;
  res.status(status).json({ error: status === 404 ? 'Not found' : 'Server error' });
});

const server = app.listen(PORT, () => {
  const mode = process.env.PINATA_JWT ? 'IPFS via Pinata' : 'local vault';
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Document storage: ${mode}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`Port ${PORT} is already in use.`);
  } else {
    console.error(error);
  }
  process.exit(1);
});
