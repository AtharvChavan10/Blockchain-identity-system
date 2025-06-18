import axios from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config();

const PINATA_JWT = process.env.PINATA_JWT;
console.log('DEBUG: PINATA_JWT value:', PINATA_JWT);
console.log('DEBUG: PINATA_JWT length:', PINATA_JWT ? PINATA_JWT.length : 0);

export async function uploadToPinata(filePath) {
  try {
    const fullPath = path.resolve(filePath);

    if (!fs.existsSync(fullPath)) {
      console.error('❌ File not found:', fullPath);
      return;
    }

    const data = new FormData();
    data.append('file', fs.createReadStream(fullPath));

    const res = await axios.post('https://api.pinata.cloud/pinning/pinFileToIPFS', data, {
      maxBodyLength: 'Infinity',
      headers: {
        Authorization: `Bearer ${PINATA_JWT}`,
        ...data.getHeaders(),
      },
    });

    console.log('✅ File uploaded to IPFS!');
    console.log('📦 IPFS Hash (CID):', res.data.IpfsHash);
    console.log('🔗 Gateway URL:', `https://gateway.pinata.cloud/ipfs/${res.data.IpfsHash}`);

    return res.data;
  } catch (error) {
    console.error('❌ IPFS upload error:', error.response?.data || error.message);
  }
}

uploadToPinata('./test.txt'); 
