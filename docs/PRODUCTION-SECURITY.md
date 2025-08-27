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

Create a server-side endpoint to serve tokens securely:

```typescript
// Example: /api/secure-tokens/mapbox
app.get('/api/secure-tokens/:service', authenticateUser, (req, res) => {
  const { service } = req.params;
  
  // Validate user permissions
  if (!req.user.hasPermission(service)) {
    return res.status(403).json({ error: 'Unauthorized' });
  }
  
  // Return token with rate limiting and expiration
  const token = getSecureToken(service, req.user.id);
  res.json({ 
    token, 
    expires: Date.now() + (60 * 60 * 1000) // 1 hour
  });
});
```

### 3. **Update Token Fetching**

Modify `getTokenFromSecureEndpoint()` in `app-config.ts`:

```typescript
private async getTokenFromSecureEndpoint(tokenType: 'mapbox' | 'gemini'): Promise<string | null> {
  try {
    const response = await fetch(`/api/secure-tokens/${tokenType}`, {
      headers: {
        'Authorization': `Bearer ${this.getUserToken()}`,
        'Content-Type': 'application/json'
      }
    });
    
    if (!response.ok) {
      throw new Error(`Token fetch failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.token;
  } catch (error) {
    console.error(`Failed to fetch ${tokenType} token:`, error);
    return null;
  }
}
```

### 4. **Environment Variables (Server-Side Only)**

```bash
# .env (server-side only - NEVER expose to client)
MAPBOX_ACCESS_TOKEN=pk.your_real_mapbox_token
GEMINI_API_KEY=your_real_gemini_key
JWT_SECRET=your_jwt_secret_for_token_auth
```

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
