#!/bin/bash

# RunRealm Production Deployment Script

echo "🚀 Starting RunRealm Production Deployment..."

# Check if we're on the main branch
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "⚠️  Warning: You are not on the main branch. Current branch: $CURRENT_BRANCH"
  read -p "Continue anyway? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled."
    exit 1
  fi
fi

# Run tests
echo "🧪 Running tests..."
npm run typecheck
if [ $? -ne 0 ]; then
  echo "❌ TypeScript check failed. Please fix errors before deploying."
  exit 1
fi

# Build for production
echo "🏗️  Building for production..."
npm run build:prod
if [ $? -ne 0 ]; then
  echo "❌ Build failed. Please fix errors before deploying."
  exit 1
fi

# Check bundle size
BUNDLE_SIZE=$(du -sh public/app.*.js | cut -f1)
echo "📦 Bundle size: $BUNDLE_SIZE"

if [ "$BUNDLE_SIZE" \> "1M" ]; then
  echo "⚠️  Bundle size is larger than 1MB. Consider optimizing."
  read -p "Continue anyway? (y/N): " -n 1 -r
  echo
  if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "❌ Deployment cancelled."
    exit 1
  fi
fi

# Run Lighthouse audit
echo "🔍 Running Lighthouse audit..."
npm run lighthouse
if [ $? -eq 0 ]; then
  echo "✅ Lighthouse audit completed"
else
  echo "⚠️  Lighthouse audit failed. Continuing with deployment..."
fi

# Deploy to Vercel (if vercel CLI is installed)
if command -v vercel &> /dev/null; then
  echo "🌐 Deploying to Vercel..."
  vercel --prod
  if [ $? -eq 0 ]; then
    echo "✅ Deployment successful!"
  else
    echo "❌ Vercel deployment failed."
    exit 1
  fi
else
  echo "ℹ️  Vercel CLI not found. Please install with: npm install -g vercel"
  echo "📁 Build artifacts are in the 'public' directory"
  echo "📋 To deploy manually:"
  echo "   1. Copy the contents of 'public' to your web server"
  echo "   2. Configure your web server to serve index.html for all routes"
  echo "   3. Set up environment variables for production"
fi

echo "🎉 Deployment process completed!"