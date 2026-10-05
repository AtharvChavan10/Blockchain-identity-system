import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import dotenv from 'dotenv';

dotenv.config();

export async function uploadToPinata(filePath) {
  const token = process.env.PINATA_JWT;
  if (!token) {
    throw new Error('PINATA_JWT is not set');
  }

  const fullPath = path.resolve(filePath);
  if (!fs.existsSync(fullPath)) {
    throw new Error(`File not found: ${fullPath}`);
  }

  const data = new FormData();
  data.append('file', fs.createReadStream(fullPath));

  const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', data, {
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
    headers: {
      Authorization: `Bearer ${token}`,
      ...data.getHeaders(),
    },
  });

  console.log('Uploaded to IPFS');
  console.log('CID:', res.data.IpfsHash);
  console.log('Gateway:', `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`);
  return res.data;
}

const isDirectRun = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isDirectRun) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node ipfs/upload.js <file>');
    process.exit(1);
  }
  uploadToPinata(target).catch((error) => {
    console.error(error.response?.data || error.message);
    process.exit(1);
  });
}
