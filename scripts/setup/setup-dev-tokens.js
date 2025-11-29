#!/usr/bin/env node

/**
 * 🔒 Development Token Setup Script
 *
 * This script helps developers set up API tokens for local development
 * without exposing them in the codebase.
 *
 * Usage: node setup-dev-tokens.js
 */

const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('🔒 RunRealm Development Token Setup');
console.log('=====================================');
console.log('');
console.log('This script will help you set up API tokens for local development.');
console.log('Tokens will be stored in localStorage and are NOT included in builds.');
console.log('');

function askQuestion(question) {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer);
    });
  });
}

async function setupTokens() {
  try {
    console.log('📍 Mapbox Access Token');
    console.log('Get your token from: https://account.mapbox.com/access-tokens/');
    const mapboxToken = await askQuestion(
      'Enter your Mapbox access token (or press Enter to skip): '
    );

    console.log('');
    console.log('🤖 Google Gemini API Key');
    console.log('Get your key from: https://makersuite.google.com/app/apikey');
    const geminiKey = await askQuestion('Enter your Gemini API key (or press Enter to skip): ');

    console.log('');
    console.log('💾 Setting up localStorage commands...');
    console.log('');

    if (mapboxToken && mapboxToken.trim()) {
      console.log('Run this in your browser console:');
      console.log(`localStorage.setItem('runrealm_dev_mapbox_token', '${mapboxToken.trim()}');`);
      console.log('');
    }

    if (geminiKey && geminiKey.trim()) {
      console.log('Run this in your browser console:');
      console.log(`localStorage.setItem('runrealm_dev_gemini_key', '${geminiKey.trim()}');`);
      console.log('');
    }

    console.log('✅ Setup complete!');
    console.log('');
    console.log('🔒 Security Notes:');
    console.log('- These tokens are stored locally in your browser');
    console.log('- They are NOT included in production builds');
    console.log('- Clear them with: localStorage.clear() if needed');
    console.log('');
  } catch (error) {
    console.error('Error setting up tokens:', error);
  } finally {
    rl.close();
  }
}

setupTokens();
