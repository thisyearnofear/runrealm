# RunRealm Deployment Guide

## Live Deployment

**Status**: ✅ Live on ZetaChain Athens Testnet

### Deployed Contracts
- **REALM Token**: `0x18082d110113B40A24A41dF10b4b249Ee461D3eb`
- **Universal Contract**: `0x7A52d845Dc37aC5213a546a59A43148308A88983`
- **GameLogic Library**: `0x0590F45F223B87e51180f6B7546Cc25955984726`
- **Explorer**: https://zetachain-athens-3.blockscout.com

### Network Configuration
```javascript
ZetaChain Athens Testnet:
- Chain ID: 7001
- RPC: https://zetachain-athens-evm.blockpi.network/v1/rpc/public
- Currency: ZETA
- Block Explorer: https://zetachain-athens-3.blockscout.com
```

## Production Deployment Options

### Option 1: Express.js Server (Recommended)
**Best for**: Full control, custom domain, SSL management

```bash
# Build application
npm run build

# Set environment variables
export MAPBOX_ACCESS_TOKEN=your_token
export GOOGLE_GEMINI_API_KEY=your_key
export NODE_ENV=production
export PORT=3000

# Start server
npm run server
```

**Features**:
- Serves static files
- Secure API token endpoint (`/api/tokens`)
- HTTPS support with SSL certificates
- Custom domain configuration

### Option 2: Static Hosting + Serverless
**Best for**: Scalability, CDN distribution, cost efficiency

**Platforms**: Vercel, Netlify, AWS S3 + CloudFront

```bash
# Build for static hosting
npm run build

# Deploy dist/ folder to your platform
# Configure serverless function for /api/tokens endpoint
```

### Option 3: Docker Container
**Best for**: Consistent environments, container orchestration

```dockerfile
FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "run", "server"]
```

```bash
docker build -t runrealm .
docker run -p 3000:3000 --env-file .env runrealm
```

## Server Setup

### Minimum Requirements
- **CPU**: 1 vCPU
- **RAM**: 512MB
- **Storage**: 1GB
- **Bandwidth**: 10GB/month
- **OS**: Ubuntu 20.04+ or similar

### Recommended Setup
```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 16+
curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Clone and setup project
git clone https://github.com/thisyearnofear/runrealm.git
cd runrealm
npm install
npm run build

# Create ecosystem file for PM2
cat > ecosystem.config.js << EOF
module.exports = {
  apps: [{
    name: 'runrealm',
    script: 'server.js',
    env: {
      NODE_ENV: 'production',
      PORT: 3000,
      MAPBOX_ACCESS_TOKEN: 'your_token',
      GOOGLE_GEMINI_API_KEY: 'your_key'
    }
  }]
}
EOF

# Start with PM2
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### SSL Certificate (Let's Encrypt)
```bash
# Install Certbot
sudo apt install certbot

# Get certificate (replace your-domain.com)
sudo certbot certonly --standalone -d your-domain.com

# Configure nginx reverse proxy
sudo apt install nginx

cat > /etc/nginx/sites-available/runrealm << EOF
server {
    listen 80;
    server_name your-domain.com;
    return 301 https://\$server_name\$request_uri;
}

server {
    listen 443 ssl;
    server_name your-domain.com;
    
    ssl_certificate /etc/letsencrypt/live/your-domain.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/your-domain.com/privkey.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
    }
}
EOF

sudo ln -s /etc/nginx/sites-available/runrealm /etc/nginx/sites-enabled/
sudo nginx -t && sudo systemctl reload nginx
```

## Environment Configuration

### Production Environment Variables
```bash
# Required
NODE_ENV=production
MAPBOX_ACCESS_TOKEN=pk.eyJ1...
GOOGLE_GEMINI_API_KEY=AIza...

# Optional
PORT=3000
HOST=0.0.0.0
LOG_LEVEL=info

# Security (if using custom auth)
JWT_SECRET=your-secret-key
CORS_ORIGIN=https://your-domain.com
```

### Security Checklist
- [ ] API keys stored as environment variables
- [ ] HTTPS enabled with valid SSL certificate
- [ ] CORS configured for your domain
- [ ] Rate limiting enabled for API endpoints
- [ ] Security headers configured
- [ ] Regular security updates scheduled

## Monitoring & Maintenance

### Health Checks
```bash
# Application health
curl https://your-domain.com/api/health

# Contract connectivity
curl https://your-domain.com/api/contracts/status

# Performance metrics
curl https://your-domain.com/api/metrics
```

### Log Management
```bash
# PM2 logs
pm2 logs runrealm

# Nginx logs
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log

# Application logs
tail -f logs/app.log
```

### Backup Strategy
```bash
# Automated backup script
#!/bin/bash
DATE=$(date +%Y%m%d_%H%M%S)
tar -czf backup_$DATE.tar.gz \
  /path/to/runrealm \
  /etc/nginx/sites-available/runrealm \
  /etc/letsencrypt/live/your-domain.com

# Upload to cloud storage (AWS S3, etc.)
aws s3 cp backup_$DATE.tar.gz s3://your-backup-bucket/
```

### Performance Monitoring
- **Uptime**: Use services like UptimeRobot or Pingdom
- **Performance**: Monitor Core Web Vitals
- **Errors**: Set up error tracking (Sentry, LogRocket)
- **Analytics**: Track user engagement and feature usage

## Scaling Considerations

### Load Balancing
```nginx
upstream runrealm_backend {
    server 127.0.0.1:3000;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
    location / {
        proxy_pass http://runrealm_backend;
    }
}
```

### CDN Configuration
- **Static Assets**: Serve from CDN (CloudFlare, AWS CloudFront)
- **API Responses**: Cache non-sensitive endpoints
- **Geographic Distribution**: Deploy to multiple regions

### Database Scaling (Future)
```javascript
// When moving beyond localStorage
const dbConfig = {
  primary: 'postgresql://user:pass@primary-db:5432/runrealm',
  replica: 'postgresql://user:pass@replica-db:5432/runrealm',
  redis: 'redis://cache-server:6379'
};
```

## Troubleshooting

### Common Issues

**502 Bad Gateway**
- Check if Node.js process is running: `pm2 status`
- Verify port configuration matches nginx proxy
- Check firewall settings: `sudo ufw status`

**SSL Certificate Issues**
- Renew certificate: `sudo certbot renew`
- Check certificate validity: `openssl x509 -in cert.pem -text -noout`
- Verify nginx configuration: `sudo nginx -t`

**High Memory Usage**
- Monitor with: `pm2 monit`
- Restart application: `pm2 restart runrealm`
- Check for memory leaks in logs

**Slow Performance**
- Enable gzip compression in nginx
- Optimize bundle size: `npm run analyze`
- Check database query performance
- Monitor network latency to blockchain RPC

### Emergency Procedures

**Rollback Deployment**
```bash
# Keep previous version
cp -r runrealm runrealm_backup_$(date +%Y%m%d)

# Quick rollback
pm2 stop runrealm
cd runrealm_backup_YYYYMMDD
pm2 start ecosystem.config.js
```

**Database Recovery**
```bash
# Restore from backup
tar -xzf backup_YYYYMMDD_HHMMSS.tar.gz
# Follow restoration procedures for your database
```

## Cost Optimization

### Resource Usage
- **Bandwidth**: ~1GB per 1000 active users/month
- **Storage**: <100MB for application files
- **Compute**: 1 vCPU handles ~100 concurrent users
- **API Costs**: Gemini AI ~$0.01 per route generation

### Hosting Costs (Monthly)
- **VPS (DigitalOcean/Linode)**: $5-20
- **Serverless (Vercel/Netlify)**: $0-20
- **AWS/GCP**: $10-50 (depending on usage)
- **Domain + SSL**: $10-15/year
