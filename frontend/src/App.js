import React, { useState, useRef } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please select a file first');
      return;
    }

    setUploading(true);
    setError(null);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });

      setUploadResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const clearResults = () => {
    setFile(null);
    setUploadResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="App">
      <div className="container">
        <div className="header">
          <h1>🔗 Blockchain Identity System</h1>
          <p>Secure Identity Management with IPFS & Blockchain</p>
        </div>

        <div className="grid">
          <div className="card">
            <h2>📁 Upload Identity Document</h2>
            <p>Upload your identity documents to IPFS for secure storage</p>
            
            <div 
              className={`file-upload ${dragActive ? 'dragover' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
            >
              {file ? (
                <div>
                  <p>✅ File selected: {file.name}</p>
                  <p>Size: {(file.size / 1024).toFixed(2)} KB</p>
                </div>
              ) : (
                <div>
                  <p>📁 Drag and drop a file here</p>
                  <p>or click to browse</p>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              onChange={handleFileSelect}
              style={{ display: 'none' }}
            />

            <div style={{ textAlign: 'center' }}>
              <button 
                className="btn" 
                onClick={handleUpload}
                disabled={!file || uploading}
              >
                {uploading ? (
                  <>
                    <span className="loading"></span>
                    Uploading...
                  </>
                ) : (
                  '🚀 Upload to IPFS'
                )}
              </button>
              
              <button 
                className="btn" 
                onClick={clearResults}
                disabled={uploading}
                style={{ background: '#6c757d' }}
              >
                🗑️ Clear
              </button>
            </div>
          </div>

          <div className="card">
            <h2>📊 Upload Results</h2>
            
            {error && (
              <div className="status error">
                ❌ {error}
              </div>
            )}

            {uploadResult && (
              <div className="status success">
                ✅ File uploaded successfully!
              </div>
            )}

            {uploadResult && (
              <div className="result-box">
                <h4>📦 IPFS Hash (CID):</h4>
                <p>{uploadResult.IpfsHash}</p>
                
                <h4>🔗 Gateway URL:</h4>
                <a 
                  href={`https://gateway.pinata.cloud/ipfs/${uploadResult.IpfsHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View on IPFS Gateway
                </a>
                
                <h4>📄 File Details:</h4>
                <p>Name: {file?.name}</p>
                <p>Size: {(file?.size / 1024).toFixed(2)} KB</p>
                <p>Type: {file?.type}</p>
              </div>
            )}

            {!uploadResult && !error && (
              <div className="status info">
                📋 No upload results yet. Upload a file to see results here.
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h2>🛡️ Features</h2>
          <div className="grid">
            <div>
              <h3>🔐 Secure Storage</h3>
              <p>Your documents are stored on IPFS, a decentralized and secure network</p>
            </div>
            <div>
              <h3>🌐 Decentralized</h3>
              <p>No single point of failure - your data is distributed across the network</p>
            </div>
            <div>
              <h3>🔗 Immutable</h3>
              <p>Once uploaded, your documents cannot be altered or deleted</p>
            </div>
            <div>
              <h3>⚡ Fast Access</h3>
              <p>Access your documents instantly from anywhere in the world</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default App; 