const express = require('express');
const path = require('path');
require('dotenv').config();
const app = express();
const port = process.env.PORT || 3000;

console.log('Starting server...');
console.log('MAPBOX_ACCESS_TOKEN:', process.env.MAPBOX_ACCESS_TOKEN ? 'Set' : 'Not set');
console.log('GOOGLE_GEMINI_API_KEY:', process.env.GOOGLE_GEMINI_API_KEY ? 'Set' : 'Not set');

// CORS middleware for production
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  
  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, 'public')));

// API endpoint to provide tokens
app.get('/api/tokens', (req, res) => {
  console.log('Received request for /api/tokens');
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const tokens = {
      mapbox: process.env.MAPBOX_ACCESS_TOKEN || '',
      gemini: process.env.GOOGLE_GEMINI_API_KEY || ''
    };

    // Don't return empty tokens
    const validTokens = {};
    if (tokens.mapbox) validTokens.mapbox = tokens.mapbox;
    if (tokens.gemini) validTokens.gemini = tokens.gemini;

    console.log('Sending tokens:', validTokens);
    res.json(validTokens);
  } catch (error) {
    console.error('Token retrieval error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Serve the main app for any other routes (for client-side routing)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/index.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Handle shutdown gracefully
process.on('SIGINT', () => {
  console.log('Shutting down server...');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});