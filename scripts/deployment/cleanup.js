#!/usr/bin/env node

/**
 * Cleanup script for RunRealm project
 * Removes temporary files, build artifacts, and other generated content
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🧹 Cleaning up RunRealm project...');

// Directories and files to clean
const cleanupPaths = [
  // Build outputs
  'public/*.js',
  'public/*.js.map',
  'public/*.js.LICENSE.txt',
  'public/*.css',
  'public/*.css.map',
  'dist',
  'build',

  // Temporary files
  'stats.json',
  'nohup.out',
  'access_token*',
  'cross-env',
  'npm',
  'runrealm@*',

  // Cache directories
  '.tmp',
  'tmp',
  'temp',

  // Test artifacts
  '.nyc_output',
  'coverage',

  // Smart contract artifacts (optional - comment if needed)
  // 'artifacts',
  // 'cache',
];

// Keep the template but remove generated index.html
const keepTemplate = true;

function removeGlob(pattern) {
  try {
    if (process.platform === 'win32') {
      execSync(`for %i in (${pattern}) do del "%i" 2>nul`, { stdio: 'ignore' });
    } else {
      execSync(`rm -rf ${pattern} 2>/dev/null || true`, { stdio: 'ignore' });
    }
  } catch (error) {
    // Ignore errors - files might not exist
  }
}

function removeDirectory(dirPath) {
  try {
    if (fs.existsSync(dirPath)) {
      fs.rmSync(dirPath, { recursive: true, force: true });
      console.log(`✅ Removed directory: ${dirPath}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not remove ${dirPath}: ${error.message}`);
  }
}

function removeFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      console.log(`✅ Removed file: ${filePath}`);
    }
  } catch (error) {
    console.log(`⚠️  Could not remove ${filePath}: ${error.message}`);
  }
}

// Clean up paths
cleanupPaths.forEach((pattern) => {
  if (pattern.includes('*')) {
    removeGlob(pattern);
    console.log(`✅ Cleaned pattern: ${pattern}`);
  } else if (fs.existsSync(pattern)) {
    const stat = fs.statSync(pattern);
    if (stat.isDirectory()) {
      removeDirectory(pattern);
    } else {
      removeFile(pattern);
    }
  }
});

// Special handling for public/index.html
if (keepTemplate) {
  const publicIndexPath = 'public/index.html';
  const templatePath = path.join(__dirname, '../public/index.html');

  try {
    if (fs.existsSync(publicIndexPath)) {
      const content = fs.readFileSync(publicIndexPath, 'utf8');
      // Only remove if it looks like a webpack-generated file (has script tags)
      if (content.includes('<script defer="defer" src="') || content.includes('.js">')) {
        fs.unlinkSync(publicIndexPath);
        console.log('✅ Removed generated index.html (keeping template)');

        // Recreate the template
        const templateContent = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>RunRealm - Cross-Chain Running GameFi</title>
    <meta name="description" content="Transform your runs into valuable NFT territories. Claim, trade, and defend real-world running territories on ZetaChain.">
    
    <!-- Mapbox GL CSS -->
    <link href="https://api.mapbox.com/mapbox-gl-js/v2.4.1/mapbox-gl.css" rel="stylesheet" />
    
    <style>
        body, html {
            margin: 0;
            padding: 0;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            height: 100%;
            background: #1a1a1a;
            color: white;
        }
        
        #mapbox-container {
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 1;
        }
        
        .loading {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            z-index: 1000;
            text-align: center;
            background: rgba(0, 0, 0, 0.8);
            padding: 20px;
            border-radius: 10px;
        }
        
        .loading-spinner {
            border: 4px solid #f3f3f3;
            border-top: 4px solid #00ff00;
            border-radius: 50%;
            width: 40px;
            height: 40px;
            animation: spin 2s linear infinite;
            margin: 0 auto 10px;
        }
        
        @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
        }
        
        .game-ui {
            position: fixed;
            top: 20px;
            left: 20px;
            z-index: 100;
            background: rgba(0, 0, 0, 0.7);
            padding: 15px;
            border-radius: 10px;
            min-width: 200px;
        }
        
        .run-length {
            font-size: 24px;
            font-weight: bold;
            color: #00ff00;
        }
        
        .run-units {
            font-size: 12px;
            color: #ccc;
        }
        
        .controls {
            position: fixed;
            bottom: 20px;
            right: 20px;
            z-index: 100;
        }
        
        .control-btn {
            display: block;
            margin: 10px 0;
            padding: 12px 20px;
            background: #00ff00;
            color: #000;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-weight: bold;
        }
    </style>
</head>
<body>
    <div id="loading" class="loading">
        <div class="loading-spinner"></div>
        <div>Loading RunRealm...</div>
    </div>
    
    <div id="mapbox-container"></div>
    
    <div class="game-ui">
        <div id="run-length" class="run-length">0.00</div>
        <div id="run-units" class="run-units">km</div>
    </div>
    
    <div class="controls">
        <button id="remove-last" class="control-btn" style="display: none;">Remove Last Point</button>
        <button id="clear-run" class="control-btn" style="display: none;">Clear Run</button>
        <button id="save-run" class="control-btn" style="display: none;">Save Run</button>
    </div>

    <div id="territory-dashboard-root"></div>
</body>
</html>`;

        fs.writeFileSync(publicIndexPath, templateContent);
        console.log('✅ Recreated clean HTML template');
      }
    }
  } catch (error) {
    console.log(`⚠️  Could not handle public/index.html: ${error.message}`);
  }
}

console.log('🎉 Cleanup completed!');
console.log('\nTo rebuild the project, run:');
console.log('  npm run build:prod');
console.log('\nTo start development, run:');
console.log('  npm run dev');
