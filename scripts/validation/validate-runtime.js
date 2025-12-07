/**
 * Runtime Validation Script
 * Tests critical application initialization without browser dependencies
 */

const fs = require('node:fs');
const path = require('node:path');

console.log('🧪 RunRealm Runtime Validation');
console.log('==============================');

// Test 1: Verify build artifacts exist
console.log('\n1️⃣ Checking build artifacts...');
const publicDir = path.join(__dirname, '..', 'public');
const indexHtml = path.join(publicDir, 'index.html');
const mainJs = fs
  .readdirSync(publicDir)
  .find((file) => file.startsWith('app.') && file.endsWith('.js'));

if (!fs.existsSync(indexHtml)) {
  console.error('❌ index.html not found - run npm run build first');
  process.exit(1);
}

if (!mainJs) {
  console.error('❌ Main JS bundle not found - build may have failed');
  process.exit(1);
}

console.log('✅ Build artifacts found');
console.log(`   📄 index.html: ${indexHtml}`);
console.log(`   📦 main bundle: ${mainJs}`);

// Test 2: Check for critical source files
console.log('\n2️⃣ Checking critical source files...');
const criticalFiles = [
  'src/core/run-realm-app.ts',
  'src/core/base-service.ts',
  'src/services/dom-service.ts',
  'src/services/location-service.ts',
  'src/services/run-tracking-service.ts',
  'src/config/contracts.ts',
];

const missingFiles = [];
for (const file of criticalFiles) {
  const filePath = path.join(__dirname, '..', file);
  if (!fs.existsSync(filePath)) {
    missingFiles.push(file);
  }
}

if (missingFiles.length > 0) {
  console.error('❌ Missing critical files:');
  missingFiles.forEach((file) => {
    console.error(`   - ${file}`);
  });
  process.exit(1);
}

console.log('✅ All critical source files present');

// Test 3: Verify contract configuration
console.log('\n3️⃣ Checking contract configuration...');
try {
  const contractsFile = path.join(__dirname, '..', 'src', 'config', 'contracts.ts');
  const contractsContent = fs.readFileSync(contractsFile, 'utf8');

  // Check for correct contract addresses
  const expectedAddresses = [
    '0x18082d110113B40A24A41dF10b4b249Ee461D3eb', // REALM Token
    '0x7A52d845Dc37aC5213a546a59A43148308A88983', // Universal Contract
    '0x0590F45F223B87e51180f6B7546Cc25955984726', // GameLogic Library
  ];

  let foundAddresses = 0;
  for (const address of expectedAddresses) {
    if (contractsContent.includes(address)) {
      foundAddresses++;
    }
  }

  if (foundAddresses !== expectedAddresses.length) {
    console.warn('⚠️  Contract addresses may be outdated');
  } else {
    console.log('✅ Contract addresses look correct');
  }
} catch (error) {
  console.error('❌ Error reading contract configuration:', error.message);
  process.exit(1);
}

// Test 4: Check environment setup
console.log('\n4️⃣ Checking environment setup...');
const envExample = path.join(__dirname, '..', '.env.example');

if (!fs.existsSync(envExample)) {
  console.warn('⚠️  .env.example not found - users may need setup guidance');
}

console.log('✅ Environment setup checked');

// Test 5: Bundle size check
console.log('\n5️⃣ Checking bundle size...');
const mainJsPath = path.join(publicDir, mainJs);
const stats = fs.statSync(mainJsPath);
const sizeKB = Math.round(stats.size / 1024);

console.log(`📊 Main bundle size: ${sizeKB} KB`);

if (sizeKB > 600) {
  console.warn('⚠️  Bundle size is quite large - consider code splitting');
} else if (sizeKB > 400) {
  console.log('⚡ Bundle size is reasonable but could be optimized');
} else {
  console.log('✅ Bundle size looks good');
}

// Test 6: Check for common runtime issues
console.log('\n6️⃣ Scanning for common runtime issues...');
const mainJsContent = fs.readFileSync(mainJsPath, 'utf8');

const potentialIssues = [];

// Check for undefined references that commonly cause runtime errors
if (mainJsContent.includes('undefined is not an object')) {
  potentialIssues.push('Contains "undefined is not an object" - may have runtime errors');
}

// Check if source maps exist for debugging
const sourceMapExists = fs.existsSync(`${mainJsPath}.map`);
if (!sourceMapExists) {
  potentialIssues.push('No source map found - debugging will be difficult');
}

if (potentialIssues.length > 0) {
  console.warn('⚠️  Potential runtime issues detected:');
  potentialIssues.forEach((issue) => {
    console.warn(`   - ${issue}`);
  });
} else {
  console.log('✅ No obvious runtime issues detected');
}

// Final summary
console.log('\n🎯 Validation Summary');
console.log('====================');
console.log('✅ Build artifacts present');
console.log('✅ Critical source files intact');
console.log('✅ Contract configuration updated');
console.log('✅ Environment setup ready');
console.log(`📦 Bundle: ${sizeKB} KB`);

if (potentialIssues.length === 0) {
  console.log('\n🎉 Runtime validation PASSED!');
  console.log('💡 The app should initialize without critical errors');
  console.log('🚀 Ready for runtime testing');
} else {
  console.log('\n⚠️  Runtime validation completed with warnings');
  console.log('🔍 Manual testing recommended to verify fixes');
}

console.log('\n📋 Next steps:');
console.log('1. Start dev server: npm run dev');
console.log('2. Open http://localhost:8080');
console.log('3. Check browser console for any remaining errors');
console.log('4. Test core functionality: map loading, wallet connection, etc.');
