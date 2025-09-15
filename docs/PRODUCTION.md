# Production Deployment

## Quick Deploy

```bash
# 1. Build optimized bundle
npm run build:prod

# 2. Set environment variables
export MAPBOX_ACCESS_TOKEN=your_token
export GOOGLE_GEMINI_API_KEY=your_key
export STRAVA_CLIENT_ID=your_client_id
export STRAVA_CLIENT_SECRET=your_secret

# 3. Start server
npm run server
```

## Performance Targets

- **Bundle Size**: <400KB gzipped
- **Load Time**: <3s on 3G
- **Lighthouse Score**: 90+
- **Battery Impact**: Minimal (2s update intervals)

## External Integrations

### Strava Setup
1. Create app at https://developers.strava.com/
2. Set redirect URI: `https://yourdomain.com/auth/strava`
3. Add client credentials to environment

### Production Checklist
- [ ] API keys secured via environment variables
- [ ] Bundle analyzed and optimized
- [ ] Lighthouse performance audit passed
- [ ] Cross-chain contracts deployed
- [ ] External fitness integrations tested

## Monitoring

```bash
# Performance analysis
npm run optimize

# Bundle size check
npm run build:analyze
```
