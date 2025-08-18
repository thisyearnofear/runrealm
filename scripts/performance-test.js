// Performance testing script
const fs = require('fs');
const path = require('path');

function checkBundleSize() {
  const publicDir = path.join(__dirname, '../public');
  const files = fs.readdirSync(publicDir);
  
  let totalSize = 0;
  let jsSize = 0;
  
  files.forEach(file => {
    if (file.endsWith('.js') && !file.includes('.map')) {
      const filePath = path.join(publicDir, file);
      const stats = fs.statSync(filePath);
      const sizeKB = Math.round(stats.size / 1024);
      
      console.log(`📦 ${file}: ${sizeKB}KB`);
      
      totalSize += stats.size;
      jsSize += stats.size;
    }
  });
  
  const totalKB = Math.round(totalSize / 1024);
  const jsKB = Math.round(jsSize / 1024);
  
  console.log(`\n📊 Bundle Analysis:`);
  console.log(`Total JS Size: ${jsKB}KB`);
  console.log(`Total Bundle Size: ${totalKB}KB`);
  
  // Performance budgets
  const budgets = {
    totalJS: 500, // 500KB
    totalBundle: 1000 // 1MB
  };
  
  const violations = [];
  
  if (jsKB > budgets.totalJS) {
    violations.push(`JS bundle (${jsKB}KB) exceeds budget (${budgets.totalJS}KB)`);
  }
  
  if (totalKB > budgets.totalBundle) {
    violations.push(`Total bundle (${totalKB}KB) exceeds budget (${budgets.totalBundle}KB)`);
  }
  
  if (violations.length > 0) {
    console.log(`\n❌ Performance Budget Violations:`);
    violations.forEach(violation => console.log(`  • ${violation}`));
    process.exit(1);
  } else {
    console.log(`\n✅ All performance budgets met!`);
  }
}

function main() {
  console.log('🔍 Running Performance Tests...\n');
  
  try {
    checkBundleSize();
    console.log('\n🎉 Performance tests passed!');
  } catch (error) {
    console.error('❌ Performance tests failed:', error.message);
    process.exit(1);
  }
}

main();