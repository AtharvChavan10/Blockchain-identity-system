import dotenv from 'dotenv';
dotenv.config();

console.log('Loaded PINATA_JWT:', process.env.PINATA_JWT);
console.log('Length:', process.env.PINATA_JWT ? process.env.PINATA_JWT.length : 0); 