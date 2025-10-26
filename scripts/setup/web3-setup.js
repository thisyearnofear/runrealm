#!/usr/bin/env node

/**
 * Web3 Development Environment Setup Script
 * Initializes the RunRealm project for Web3 development
 */

const fs = require('fs');
const path = require('path');

console.log('🚀 Setting up RunRealm Web3 development environment...\n');

// Check if .env exists, create from template if not
const envPath = path.join(__dirname, '..', '.env');
const envExamplePath = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envPath)) {
  console.log('📝 Creating .env file from template...');
  fs.copyFileSync(envExamplePath, envPath);
  console.log('✅ .env file created. Please configure your API keys and settings.\n');
} else {
  console.log('✅ .env file already exists.\n');
}

// Create contracts directory structure
const contractsDirs = [
  'contracts',
  'contracts/interfaces',
  'contracts/libraries',
  'test/contracts',
  'scripts/deploy'
];

contractsDirs.forEach(dir => {
  const dirPath = path.join(__dirname, '..', dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
    console.log(`📁 Created directory: ${dir}`);
  }
});

// Create TypeScript configuration for contracts
const tsConfigContracts = {
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "lib": ["ES2020"],
    "outDir": "./dist",
    "rootDir": "./",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "typeRoots": ["./node_modules/@types", "./types"]
  },
  "include": ["contracts/**/*", "test/contracts/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "dist", "cache", "artifacts"]
};

const tsConfigPath = path.join(__dirname, '..', 'tsconfig.contracts.json');
if (!fs.existsSync(tsConfigPath)) {
  fs.writeFileSync(tsConfigPath, JSON.stringify(tsConfigContracts, null, 2));
  console.log('✅ TypeScript configuration for contracts created.');
}

// Create types directory for custom type definitions
const typesDir = path.join(__dirname, '..', 'types');
if (!fs.existsSync(typesDir)) {
  fs.mkdirSync(typesDir);
  console.log('📁 Created types directory.');
}

// Create basic contract interfaces
const contractInterfaces = `
// Generated contract interfaces will go here
export interface TerritoryNFT {
  mint(to: string, tokenId: string, metadata: string): Promise<void>;
  transferFrom(from: string, to: string, tokenId: string): Promise<void>;
  ownerOf(tokenId: string): Promise<string>;
}

export interface RealmToken {
  transfer(to: string, amount: number): Promise<void>;
  balanceOf(address: string): Promise<number>;
  approve(spender: string, amount: number): Promise<void>;
}

export interface TerritoryManager {
  claimTerritory(geohash: string, metadata: string): Promise<string>;
  challengeTerritory(tokenId: string): Promise<void>;
  resolveChallenge(challengeId: string): Promise<void>;
}
`;

const interfacesPath = path.join(__dirname, '..', 'types', 'contracts.ts');
if (!fs.existsSync(interfacesPath)) {
  fs.writeFileSync(interfacesPath, contractInterfaces.trim());
  console.log('✅ Contract interfaces created.');
}

// Check for required environment variables
console.log('\n🔍 Checking environment configuration...');

const requiredEnvVars = [
  'MAPBOX_ACCESS_TOKEN',
  'GOOGLE_GEMINI_API_KEY'
];

const optionalEnvVars = [
  'PRIVATE_KEY',
  'ZETACHAIN_RPC_URL'
];

let missingRequired = [];
let missingOptional = [];

// Load .env file
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  const envVars = {};
  
  envContent.split('\n').forEach(line => {
    if (line.trim() && !line.startsWith('#') && line.includes('=')) {
      const [key, value] = line.split('=');
      envVars[key.trim()] = value.trim();
    }
  });

  requiredEnvVars.forEach(varName => {
    if (!envVars[varName] || envVars[varName].includes('your_') || envVars[varName] === '') {
      missingRequired.push(varName);
    }
  });

  optionalEnvVars.forEach(varName => {
    if (!envVars[varName] || envVars[varName].includes('your_') || envVars[varName] === '') {
      missingOptional.push(varName);
    }
  });
}

if (missingRequired.length > 0) {
  console.log('❌ Missing required environment variables:');
  missingRequired.forEach(varName => {
    console.log(`   - ${varName}`);
  });
  console.log('\nPlease configure these in your .env file before running the app.');
}

if (missingOptional.length > 0) {
  console.log('⚠️  Optional environment variables not configured:');
  missingOptional.forEach(varName => {
    console.log(`   - ${varName} (needed for Web3 features)`);
  });
}

if (missingRequired.length === 0 && missingOptional.length === 0) {
  console.log('✅ All environment variables configured!');
}

console.log('\n🎉 Web3 development environment setup complete!');
console.log('\nNext steps:');
console.log('1. Configure your .env file with API keys');
console.log('2. Run: npm install');
console.log('3. Run: npm run contracts:compile');
console.log('4. Run: npm run serve');

console.log('\n📚 Documentation:');
console.log('- ROADMAP.md - Development roadmap and timeline');
console.log('- CODEBASE_AUDIT.md - Architecture analysis');
console.log('- ZetaChain Docs: https://www.zetachain.com/docs/');
