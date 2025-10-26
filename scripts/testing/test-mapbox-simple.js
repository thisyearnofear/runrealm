#!/usr/bin/env node

/**
 * Simple Mapbox Token Test
 */

const https = require('https');
require('dotenv').config();

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

console.log('Testing Mapbox token...');
console.log(`Token: ${MAPBOX_TOKEN}`);

// Test the exact same request your app makes
const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v11?access_token=${MAPBOX_TOKEN}`;

console.log(`\nTesting URL: ${url}`);

https.get(url, (res) => {
  console.log(`\nStatus Code: ${res.statusCode}`);
  console.log(`Status Message: ${res.statusMessage}`);
  console.log('Headers:', res.headers);
  
  let data = '';
  res.on('data', (chunk) => {
    data += chunk;
  });
  
  res.on('end', () => {
    console.log('\nResponse Body:');
    console.log(data.substring(0, 500) + (data.length > 500 ? '...' : ''));
    
    if (res.statusCode === 401) {
      console.log('\n❌ 401 Unauthorized - Token is invalid or expired');
      console.log('Solutions:');
      console.log('1. Check if token exists at https://account.mapbox.com/access-tokens/');
      console.log('2. Create a new token if this one was deleted');
      console.log('3. Ensure token has "Public" scope');
    } else if (res.statusCode === 200) {
      console.log('\n✅ Token works! The issue might be elsewhere.');
    }
  });
}).on('error', (error) => {
  console.error('Request error:', error);
});
