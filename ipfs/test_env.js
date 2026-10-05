import dotenv from 'dotenv';

dotenv.config();

const token = process.env.PINATA_JWT || '';
console.log(token ? `PINATA_JWT is set (${token.length} characters)` : 'PINATA_JWT is not set');
