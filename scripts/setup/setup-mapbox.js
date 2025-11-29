#!/usr/bin/env node

/**
 * Setup script for Mapbox configuration
 * Helps users configure their Mapbox access token
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function setupMapbox() {
  console.log('🗺️  RunRealm Mapbox Setup');
  console.log('========================\n');

  console.log('To use RunRealm, you need a Mapbox access token.');
  console.log('1. Go to https://account.mapbox.com/access-tokens/');
  console.log('2. Sign up or log in to your Mapbox account');
  console.log('3. Create a new access token or copy an existing one');
  console.log('4. The token should start with "pk."\n');

  const token = await question('Enter your Mapbox access token: ');

  if (!token || !token.startsWith('pk.')) {
    console.log('❌ Invalid token. Mapbox tokens should start with "pk."');
    process.exit(1);
  }

  // Update .env file
  const envPath = path.join(__dirname, '..', '.env');
  let envContent = '';

  if (fs.existsSync(envPath)) {
    envContent = fs.readFileSync(envPath, 'utf8');
    // Replace existing token
    envContent = envContent.replace(/MAPBOX_ACCESS_TOKEN=.*/, `MAPBOX_ACCESS_TOKEN=${token}`);
  } else {
    // Create new .env file
    envContent = `MAPBOX_ACCESS_TOKEN=${token}\n`;
  }

  fs.writeFileSync(envPath, envContent);

  console.log('✅ Mapbox token saved to .env file');
  console.log('🚀 You can now run: npm run serve');

  rl.close();
}

setupMapbox().catch(console.error);
