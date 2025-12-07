#!/usr/bin/env node

/**
 * Mapbox Token Validation Script
 * Tests if your Mapbox token is valid and has the required scopes
 */

const https = require('node:https');
require('dotenv').config();

const MAPBOX_TOKEN = process.env.MAPBOX_ACCESS_TOKEN;

if (!MAPBOX_TOKEN) {
  console.log('❌ No MAPBOX_ACCESS_TOKEN found in .env file');
  process.exit(1);
}

console.log('🔍 Validating Mapbox Token...');
console.log(`Token: ${MAPBOX_TOKEN.substring(0, 20)}...`);

// Test 1: Basic token validation
function testTokenValidity() {
  return new Promise((resolve, reject) => {
    const url = `https://api.mapbox.com/tokens/v2?access_token=${MAPBOX_TOKEN}`;

    https
      .get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            try {
              const tokenInfo = JSON.parse(data);
              console.log('✅ Token is valid');
              console.log(`   Token ID: ${tokenInfo.id}`);
              console.log(`   Usage: ${tokenInfo.usage}`);
              console.log(`   Scopes: ${tokenInfo.scopes.join(', ')}`);

              // Check for required scopes
              const requiredScopes = ['styles:read', 'fonts:read', 'sprites:read'];
              const hasAllScopes = requiredScopes.every((scope) =>
                tokenInfo.scopes.includes(scope)
              );

              if (hasAllScopes) {
                console.log('✅ Token has all required scopes');
              } else {
                console.log('⚠️  Token missing some required scopes');
                console.log(`   Required: ${requiredScopes.join(', ')}`);
              }

              resolve(tokenInfo);
            } catch (_error) {
              reject(new Error('Failed to parse token response'));
            }
          } else {
            reject(new Error(`Token validation failed: ${res.statusCode} - ${data}`));
          }
        });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

// Test 2: Style loading (what your app actually does)
function testStyleLoading() {
  return new Promise((resolve, reject) => {
    const url = `https://api.mapbox.com/styles/v1/mapbox/streets-v11?access_token=${MAPBOX_TOKEN}`;

    https
      .get(url, (res) => {
        let data = '';

        res.on('data', (chunk) => {
          data += chunk;
        });

        res.on('end', () => {
          if (res.statusCode === 200) {
            console.log('✅ Style loading test passed');
            resolve();
          } else {
            console.log(`❌ Style loading failed: ${res.statusCode}`);
            console.log(`   Response: ${data}`);
            reject(new Error(`Style loading failed: ${res.statusCode}`));
          }
        });
      })
      .on('error', (error) => {
        reject(error);
      });
  });
}

async function validateToken() {
  try {
    // Test basic token validity
    await testTokenValidity();

    // Test style loading
    await testStyleLoading();

    console.log('\n🎉 All tests passed! Your Mapbox token should work.');
  } catch (error) {
    console.log('\n❌ Token validation failed:');
    console.log(`   Error: ${error.message}`);
    console.log('\n🔧 Troubleshooting steps:');
    console.log('   1. Go to https://account.mapbox.com/access-tokens/');
    console.log('   2. Check if your token is still active');
    console.log('   3. Ensure it has these scopes: styles:read, fonts:read, sprites:read');
    console.log('   4. Check if there are any URL restrictions');
    console.log('   5. Create a new token if needed');
  }
}

validateToken();
