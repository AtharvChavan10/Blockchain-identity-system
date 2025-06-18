# 🔗 Blockchain Identity System

A modern, secure identity management system built with React, Node.js, and IPFS. Upload and store identity documents securely on the decentralized web.

## ✨ Features

- **🔐 Secure Storage**: Documents stored on IPFS (InterPlanetary File System)
- **🌐 Decentralized**: No single point of failure
- **🔗 Immutable**: Once uploaded, documents cannot be altered
- **⚡ Fast Access**: Access documents from anywhere in the world
- **🎨 Modern UI**: Beautiful, responsive React frontend
- **📱 Mobile Friendly**: Works on all devices

## 🚀 Quick Start

### Prerequisites

- Node.js (v16 or higher)
- npm or yarn
- Pinata account (for IPFS storage)

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd blockchain-identity-system
npm install
```

### 2. Set up Pinata

1. Go to [Pinata Cloud](https://app.pinata.cloud/)
2. Create an account and get your API key
3. Create a new API key with `pinFileToIPFS` permission
4. Copy the JWT token

### 3. Configure Environment

Create a `.env` file in the root directory:

```env
PINATA_JWT=your_pinata_jwt_token_here
PORT=3001
```

### 4. Install Frontend Dependencies

```bash
npm run install-frontend
```

### 5. Start the Application

#### Development Mode (with hot reload):
```bash
# Terminal 1 - Start backend server
npm run dev

# Terminal 2 - Start frontend
npm run frontend
```

#### Production Mode:
```bash
# Build frontend
npm run build

# Start server
npm start
```

### 6. Access the Application

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001
- Health Check: http://localhost:3001/api/health

## 📁 Project Structure

```
blockchain-identity-system/
├── frontend/                 # React frontend
│   ├── public/
│   │   ├── App.js           # Main React component
│   │   ├── App.css          # Component styles
│   │   ├── index.js         # React entry point
│   │   └── index.css        # Global styles
│   └── package.json
├── contracts/               # Smart contracts
├── ipfs/                   # IPFS utilities
├── server.js               # Express backend server
├── package.json            # Main package.json
└── .env                    # Environment variables
```

## 🔧 API Endpoints

### POST /api/upload
Upload a file to IPFS

**Request:**
- Content-Type: `multipart/form-data`
- Body: File in form data with key `file`

**Response:**
```json
{
  "success": true,
  "IpfsHash": "QmUEjUGqzcYCJMCxsh5hu3uwCLnzopeQxQudq5DNnMPYtH",
  "PinSize": 1234,
  "Timestamp": "2023-01-01T00:00:00.000Z",
  "gatewayUrl": "https://gateway.pinata.cloud/ipfs/QmUEjUGqzcYCJMCxsh5hu3uwCLnzopeQxQudq5DNnMPYtH"
}
```

### GET /api/health
Health check endpoint

**Response:**
```json
{
  "status": "OK",
  "message": "Server is running"
}
```

## 🛠️ Development

### Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with nodemon
- `npm run frontend` - Start React development server
- `npm run build` - Build React app for production
- `npm run install-frontend` - Install frontend dependencies

### Adding New Features

1. **Frontend**: Add components in `frontend/src/`
2. **Backend**: Add routes in `server.js`
3. **Smart Contracts**: Add contracts in `contracts/`

## 🔒 Security

- Files are temporarily stored on the server during upload
- Files are automatically deleted after successful IPFS upload
- File size limit: 10MB
- CORS enabled for development
- Environment variables for sensitive data

## 🌐 Deployment

### Heroku
1. Set environment variables in Heroku dashboard
2. Deploy using Heroku CLI or GitHub integration

### Vercel/Netlify
1. Build the frontend: `npm run build`
2. Deploy the `frontend/build` folder
3. Deploy backend separately

### Docker
```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
EXPOSE 3001
CMD ["npm", "start"]
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

If you encounter any issues:

1. Check the console for error messages
2. Verify your Pinata JWT token is valid
3. Ensure all dependencies are installed
4. Check that ports 3000 and 3001 are available

## 🔮 Future Enhancements

- [ ] Smart contract integration for identity verification
- [ ] Multi-file upload support
- [ ] File encryption before upload
- [ ] User authentication system
- [ ] Document sharing capabilities
- [ ] Blockchain-based identity verification
"# Blockchain-identity-system" 
