import express from 'express';
import multer from 'multer';
import cors from 'cors';
import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir);
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Upload endpoint
app.post('/api/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const PINATA_JWT = process.env.PINATA_JWT;
    if (!PINATA_JWT) {
      return res.status(500).json({ error: 'Pinata JWT not configured' });
    }

    const filePath = req.file.path;
    const formData = new FormData();
    formData.append('file', fs.createReadStream(filePath));

    const response = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', formData, {
      maxBodyLength: 'Infinity',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
        ...formData.getHeaders(),
      },
    });

    // Clean up uploaded file
    fs.unlinkSync(filePath);

    res.json({
      success: true,
      IpfsHash: response.data.IpfsHash,
      PinSize: response.data.PinSize,
      Timestamp: response.data.Timestamp,
      gatewayUrl: `https://gateway.pinata.cloud/ipfs/${response.data.IpfsHash}`
    });

  } catch (error) {
    console.error('Upload error:', error.response?.data || error.message);
    
    // Clean up file if it exists
    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    res.status(500).json({ 
      error: error.response?.data?.error?.details || 'Upload failed' 
    });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Server is running' });
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'frontend/build')));
  
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/build', 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Upload endpoint: http://localhost:${PORT}/api/upload`);
  console.log(`🏥 Health check: http://localhost:${PORT}/api/health`);
}); 