# Webpack Configuration Guide

## Overview

RunRealm uses Webpack 5 as its build tool and bundler. This document explains the configuration, common issues, and optimization strategies.

## Why Webpack?

Webpack is the right choice for RunRealm because:

1. **Complex Dependencies**: The app uses large libraries (ethers.js, mapbox-gl, @turf/turf)
2. **Environment Variables**: Need to inject environment variables at build time
3. **Code Splitting**: Large bundles need to be split for better performance
4. **TypeScript Support**: Native TypeScript compilation with ts-loader
5. **Development Server**: Hot reloading for efficient development

## Configuration Structure

### Entry Point
- **Entry**: `src/index.ts` - Main application entry point
- **Template**: `src/template.html` - HTML template (auto-generated index.html)

### Code Splitting Strategy

The webpack configuration splits code into several chunks:

1. **Runtime** (`runtime.js`) - Webpack runtime and module loading logic
2. **Google AI** (`google-ai.js`) - Google Generative AI library
3. **Mapbox** (`mapbox.js`) - Mapbox GL JS and related utilities
4. **Ethers** (`ethers.js`) - Ethereum interaction libraries
5. **Turf** (`turf.js`) - Geospatial analysis utilities
6. **Vendors** (`vendors-*.js`) - Other large dependencies
7. **App** (`app.js`) - Application code

### Environment Variables

Environment variables are injected at build time using `webpack.DefinePlugin`:

```javascript
// Available in your code as __ENV__
const config = {
  mapboxToken: __ENV__.MAPBOX_ACCESS_TOKEN,
  // ... other variables
};
```

## Common Issues and Solutions

### 1. "Cannot read properties of undefined (reading 'env')"

**Cause**: `__ENV__` global is not properly injected
**Solution**: Ensure webpack.DefinePlugin is configured correctly

### 2. 404 Errors for JavaScript Files

**Cause**: Mismatched filenames between generated files and HTML
**Solution**: Use HtmlWebpackPlugin to auto-generate HTML with correct filenames

### 3. Large Bundle Sizes

**Current Status**: 
- Total bundle size: ~6.9MB (development)
- Largest chunk: vendors (~3.35MB)

**Optimization Strategies**:
- Code splitting is already implemented
- Consider lazy loading for non-critical features
- Use dynamic imports for large features

### 4. Mapbox Token Issues

**Symptoms**: 401 errors from Mapbox API
**Solution**: 
```bash
npm run setup:mapbox
```

## Development vs Production

### Development Mode
- Source maps: `eval-source-map` (fast rebuilds)
- No minification
- Hot module replacement enabled
- Larger bundle sizes acceptable

### Production Mode
- Source maps: `source-map` (separate files)
- Minification enabled
- Optimized chunks
- Performance warnings for large bundles

## Performance Optimization

### Current Bundle Analysis
```
Runtime: 43.4 KiB
Google AI: 153 KiB
Mapbox: 135 KiB
Ethers: 2.42 MiB
Turf: 224 KiB
Vendors: 3.35 MiB
App: 619 KiB
```

### Recommendations
1. **Lazy Loading**: Load Web3 features only when needed
2. **Tree Shaking**: Ensure unused code is eliminated
3. **Dynamic Imports**: Use `import()` for large features
4. **CDN**: Consider loading large libraries from CDN

## Troubleshooting

### Clean Build
```bash
# Remove old build artifacts
rm -rf public/*.js public/*.js.map

# Rebuild
npm run build
```

### Development Server Issues
```bash
# Kill existing processes
pkill -f webpack-dev-server

# Restart
npm run serve
```

### Environment Variable Issues
1. Check `.env` file exists and has correct values
2. Verify `dotenv` is loading variables
3. Check webpack DefinePlugin configuration

## Scripts

- `npm run serve` - Start development server
- `npm run build` - Production build
- `npm run build:analyze` - Build with bundle analyzer
- `npm run setup:mapbox` - Configure Mapbox token

## File Structure

```
├── webpack.config.js          # Main webpack configuration
├── src/
│   ├── template.html         # HTML template
│   ├── index.ts             # Entry point
│   └── ...
├── public/                   # Build output directory
├── types/
│   └── env.d.ts             # Environment variable types
└── .env                     # Environment variables
```
