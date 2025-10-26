#!/usr/bin/env node

/**
 * 🔒 Secure API Key Setup Script
 * 
 * This script helps you set up API keys securely without exposing them
 * in the client-side bundle. It creates the appsettings.secrets.ts file
 * which is git-ignored and only used during development.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupSecureKeys() {
  console.log('🔒 RunRealm Secure API Key Setup');
  console.log('=====================================\n');
  
  console.log('This script will help you set up API keys securely.');
  console.log('Your keys will be stored in src/appsettings.secrets.ts');
  console.log('which is git-ignored and never committed to version control.\n');
  
  const secretsPath = path.join(__dirname, '..', 'src', 'appsettings.secrets.ts');
  
  // Check if secrets file already exists
  if (fs.existsSync(secretsPath)) {
    const overwrite = await question('⚠️  Secrets file already exists. Overwrite? (y/N): ');
    if (overwrite.toLowerCase() !== 'y') {
      console.log('Setup cancelled.');
      rl.close();
      return;
    }
  }
  
  console.log('\n📍 Mapbox Access Token');
  console.log('Get one at: https://account.mapbox.com/access-tokens/');
  const mapboxToken = await question('Enter your Mapbox access token: ');
  
  console.log('\n🤖 Google Gemini API Key (optional)');
  console.log('Get one at: https://aistudio.google.com/app/apikey');
  const geminiKey = await question('Enter your Google Gemini API key (or press Enter to skip): ');
  
  // Create the secrets file
  const secretsContent = `/*
 * 🔒 RunRealm API Secrets
 * 
 * ⚠️ WARNING: This file contains sensitive API keys!
 * - Never commit this file to version control
 * - Never share these keys publicly
 * - Regenerate keys if they are ever exposed
 * 
 * This file is automatically git-ignored.
 */

// Mapbox Access Token (required for map functionality)
// Get one at https://account.mapbox.com/access-tokens/
export const MAPBOX_ACCESS_TOKEN = '${mapboxToken}';

// Google Generative AI API Key (for AI features)
// Get one at https://aistudio.google.com/app/apikey
export const GOOGLE_GEMINI_API_KEY = '${geminiKey || 'your_google_gemini_api_key_here'}';

// Additional secure configuration can be added here
// export const OTHER_SECRET_KEY = 'your_secret_here';
`;

  fs.writeFileSync(secretsPath, secretsContent);
  
  console.log('\n✅ Secure API keys saved successfully!');
  console.log(`📁 File created: ${secretsPath}`);
  console.log('\n🔒 Security Notes:');
  console.log('- This file is git-ignored and will not be committed');
  console.log('- Your API keys are NOT exposed in the client-side bundle');
  console.log('- For production, use environment variables on your hosting platform');
  
  console.log('\n🚀 Next steps:');
  console.log('1. Run: npm run serve (for development)');
  console.log('2. Run: npm run build (to test production build)');
  console.log('3. For production deployment, set environment variables on your hosting platform');
  
  rl.close();
}

setupSecureKeys().catch(console.error);
