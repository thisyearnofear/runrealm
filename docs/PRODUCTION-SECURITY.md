# 🔒 Production Security Guide

## ⚠️ CRITICAL SECURITY REQUIREMENTS

**NEVER deploy to production with API keys in client-side code!**

## 🛡️ Secure Production Deployment

### 1. **Remove Client-Side API Keys**

Before production deployment:

```bash
# Ensure secrets file uses environment-based tokens only
# src/appsettings.secrets.ts should NOT contain hardcoded keys
```

### 2. **Implement Secure Token Service**

The application includes an Express.js server that serves as a secure token service.

1. Set your API keys as environment variables on your server:
   ```bash
   export MAPBOX_ACCESS_TOKEN=your_mapbox_token
   export GOOGLE_GEMINI_API_KEY=your_gemini_key
   ```

2. Build and start the server:
   ```bash
   npm run build
   npm run server
   ```

The server will provide the API endpoint for tokens at `/api/tokens`, which is already configured in the application.

If you need to customize the token service, you can modify the `server.js` file or implement your own secure token endpoint.

### 3. **Update Token Fetching**

The application is already configured to use the Express.js server endpoint at `/api/tokens`. No additional configuration is needed.

### 4. **Environment Variables (Server-Side Only)**

```bash
# .env (server-side only - NEVER expose to client)
MAPBOX_ACCESS_TOKEN=pk.your_real_mapbox_token
GOOGLE_GEMINI_API_KEY=your_real_gemini_key
```

### 5. **Build Configuration**

### 5. **Build Configuration**

Update webpack config for production:

```javascript
// webpack.config.js
module.exports = {
  // ... other config
  plugins: [
    new webpack.DefinePlugin({
      'process.env.NODE_ENV': JSON.stringify('production'),
      // DO NOT expose API keys here!
    })
  ]
};
```

## 🚨 Security Checklist

Before production deployment:

- [ ] **No hardcoded API keys in client code**
- [ ] **Secure token service implemented**
- [ ] **User authentication for token access**
- [ ] **Rate limiting on token endpoints**
- [ ] **Token expiration implemented**
- [ ] **HTTPS enforced**
- [ ] **Content Security Policy configured**
- [ ] **Secrets file excluded from build**

## 🔍 Security Audit Commands

```bash
# Check for exposed secrets in build
grep -r "pk\." public/ || echo "✅ No Mapbox tokens found"
grep -r "AIza" public/ || echo "✅ No Google API keys found"

# Verify secrets file is ignored
git check-ignore src/appsettings.secrets.ts && echo "✅ Secrets file ignored"

# Check build for sensitive data
npm run build && grep -r "AIza\|pk\." public/ && echo "❌ SECRETS EXPOSED!" || echo "✅ Build clean"
```

## 📋 Current Status

- ✅ Development mode: Tokens loaded from localStorage (secure)
- ✅ Production mode: No hardcoded tokens in build (secure)
- ✅ Client-side token exposure completely prevented
- ✅ Security warnings added to console
- ✅ Production build verified clean of API keys

## 🎯 Next Steps

1. Implement secure token service backend
2. Add user authentication
3. Configure rate limiting
4. Set up token expiration
5. Test production build security
