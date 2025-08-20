# RunRealm Project Cleanup Guide

This document explains the cleanup process for the RunRealm project and how to maintain a clean development environment.

## 🧹 Cleaned Files

The following temporary and build-generated files have been removed and are now properly gitignored:

### Removed Temporary Files
- `access_token` - JSON token file that shouldn't be committed
- `cross-env` - Empty file created by npm script execution
- `npm` - Empty file created by npm script execution  
- `runrealm@2.0.0` - Empty file created by npm script execution
- `stats.json` - Large webpack bundle analysis file (5MB+)
- `nohup.out` - Background process output log

### Build Artifacts (Auto-Generated)
These files are now cleaned on each build and ignored by git:
- `public/*.js` - Webpack-generated JavaScript bundles
- `public/*.js.map` - Source maps for debugging
- `public/*.js.LICENSE.txt` - License information files
- `public/*.css` - Compiled CSS files
- `public/*.css.map` - CSS source maps
- Generated `public/index.html` (template preserved)

## 🔧 Cleanup Tools

### Automatic Cleanup Script
Use the built-in cleanup script to remove all temporary files:

```bash
npm run clean
```

This script will:
- ✅ Remove all build artifacts
- ✅ Remove temporary files
- ✅ Preserve the HTML template
- ✅ Show detailed output of what was cleaned
- ✅ Provide next steps for rebuilding

### Legacy Cleanup (Basic)
For simple build artifact cleanup:

```bash
npm run clean:legacy
```

### Manual Cleanup
If you need to manually clean specific files:

```bash
# Remove all JavaScript build files
rm -f public/*.js public/*.js.map public/*.js.LICENSE.txt

# Remove temporary files
rm -f access_token cross-env npm runrealm@* stats.json nohup.out

# Clean webpack cache
rm -rf node_modules/.cache
```

## 📁 .gitignore Patterns

The updated `.gitignore` file now properly handles:

### Build Outputs
```gitignore
/public/*.js
/public/*.js.map  
/public/*.js.LICENSE.txt
/public/*.css
/public/*.css.map
/public/index.html  # Generated version only
/dist/
/build/
```

### Temporary Files
```gitignore
stats.json
nohup.out
access_token*
*.tmp
*.temp
.tmp/
tmp/
temp/
```

### NPM Script Artifacts
```gitignore
cross-env
npm
runrealm@*
package-lock.json.bak
```

### Development Tools
```gitignore
.aider*
.qodo/
.zencoder/
.vscode/settings.json
```

### System Files
```gitignore
.DS_Store*
.AppleDouble
.LSOverride
Desktop.ini
$RECYCLE.BIN/
Thumbs.db
```

## 🔄 Development Workflow

### Clean Development Cycle
```bash
# 1. Clean previous build
npm run clean

# 2. Start fresh development
npm run dev

# 3. Or build for production
npm run build:prod
```

### Before Committing
Always run cleanup before committing to ensure no temporary files are included:

```bash
npm run clean
git add .
git commit -m "Your commit message"
```

## 📋 File Status Reference

### ✅ Safe to Commit
- Source code in `src/`
- Configuration files (`package.json`, `tsconfig.json`, etc.)
- Documentation (`README.md`, `docs/`)
- HTML template (`public/index.html` - clean version)
- Smart contracts (`contracts/`)

### ❌ Should NOT be Committed
- Build outputs (`public/*.js`, `dist/`, `build/`)
- Temporary files (`stats.json`, `nohup.out`, `access_token`)
- Generated files (`public/index.html` with webpack script tags)
- Cache directories (`node_modules/.cache`, `.tmp/`)
- System files (`.DS_Store`, `Thumbs.db`)
- Environment files with secrets (`.env`)

### ⚠️ Special Cases
- `public/index.html` - Template version is committed, generated version is ignored
- `.env.example` - Committed as template, `.env` is ignored
- `package-lock.json` - Committed but excluded from cleanup
- `deployments/*.json` - Smart contract deployments (ignored)

## 🚀 Automation

The cleanup process is now automated:

1. **Pre-build**: Webpack cleans output directory automatically
2. **Manual cleanup**: `npm run clean` script available
3. **Git ignore**: Comprehensive patterns prevent accidental commits
4. **CI/CD**: Netlify builds work correctly with clean state

## 🔧 Troubleshooting

### Build Fails After Cleanup
```bash
# Reinstall dependencies
npm install

# Rebuild from clean state
npm run build:prod
```

### Git Shows Unexpected Files
```bash
# Check what's being tracked
git status --ignored

# Update gitignore and remove from git
git rm --cached filename
git commit -m "Remove tracked file from git"
```

### Large Repository Size
```bash
# Check repository size
du -sh .git

# Clean git history of large files (if needed)
git filter-branch --force --index-filter \
  'git rm --cached --ignore-unmatch stats.json' \
  --prune-empty --tag-name-filter cat -- --all
```

This cleanup ensures RunRealm maintains a clean, professional codebase that's easy to work with and deploy! 🎉
