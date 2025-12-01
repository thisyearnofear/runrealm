#!/usr/bin/env node

/**
 * 🔒 Secure API Key Setup Script
 *
 * This script helps you set up API keys securely using environment variables.
 * API keys should be set via environment variables or runtime configuration.
 */

const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupSecureKeys() {
  console.log('🔒 RunRealm Environment Variables Setup');
  console.log('=====================================\n');

  console.log('This script helps you set up environment variables for API keys securely.');
  console.log('For production, set these as environment variables on your hosting platform.\n');

  const envPath = path.join(__dirname, '..', '.env');

  // Check if .env file already exists
  if (fs.existsSync(envPath)) {
    const overwrite = await question('⚠️  .env file already exists. Overwrite? (y/N): ');
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

  // Create the .env file
  const envContent = `# RunRealm Environment Variables
# Copy this file to .env and add your actual values

# Mapbox Access Token (required for map functionality)
MAPBOX_ACCESS_TOKEN=${mapboxToken}

# Google Gemini API Key (for AI features)
GOOGLE_GEMINI_API_KEY=${geminiKey || ''}

# Additional environment variables can be added here
# OTHER_SECRET_KEY=your_secret_here
`;

  fs.writeFileSync(envPath, envContent);

  console.log('\n✅ Environment variables file created successfully!');
  console.log(`📁 File created: ${envPath}`);
  console.log('\n🔒 Security Notes:');
  console.log('- This file is git-ignored and will not be committed');
  console.log('- For production, use environment variables on your hosting platform');
  console.log('- API keys are no longer hardcoded in source files');

  console.log('\n🚀 Next steps:');
  console.log('1. Run: npm run serve (for development)');
  console.log('2. Run: npm run build (to test production build)');
  console.log('3. For production deployment, set environment variables on your hosting platform');

  rl.close();
}

setupSecureKeys().catch(console.error);
