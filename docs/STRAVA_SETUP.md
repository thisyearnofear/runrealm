# 🏃‍♂️ Strava Integration Setup Guide

## Overview

RunRealm now supports secure Strava integration, allowing users to import their running activities and claim them as NFT territories. This guide walks you through setting up the Strava API integration.

## Prerequisites

- A Strava account
- Access to Strava API settings
- RunRealm development environment set up

## Step 1: Create a Strava Application

1. Go to [https://www.strava.com/settings/api](https://www.strava.com/settings/api)
2. Click "Create App" or "New App"
3. Fill in the application details:
   - **Application Name**: RunRealm (or your preferred name)
   - **Category**: Training
   - **Club**: Leave blank unless you have a specific club
   - **Website**: Your website URL (e.g., https://runrealm.com)
   - **Authorization Callback Domain**:
     - For development: `localhost`
     - For production: Your actual domain (e.g., `runrealm.com`)

## Step 2: Configure Environment Variables

### For Development (Local .env file)

Create a `.env` file in your project root:

```bash
# Strava API Configuration
STRAVA_CLIENT_ID=your_actual_client_id_here
STRAVA_CLIENT_SECRET=your_actual_client_secret_here
STRAVA_REDIRECT_URI=http://localhost:3000/auth/strava/callback

# Strava Webhook Configuration (New!)
STRAVA_VERIFY_TOKEN=your_secure_verify_token_here
STRAVA_WEBHOOK_CALLBACK_URL=http://localhost:3000/api/strava/webhook

# Other required variables
MAPBOX_ACCESS_TOKEN=your_mapbox_token
GOOGLE_GEMINI_API_KEY=your_gemini_key
```

### For Production (Environment Variables)

Set these environment variables in your production environment:

- `STRAVA_CLIENT_ID`: Your Strava app's Client ID
- `STRAVA_CLIENT_SECRET`: Your Strava app's Client Secret (server-side only!)
- `STRAVA_REDIRECT_URI`: Your production callback URL
- `STRAVA_VERIFY_TOKEN`: Secure token for webhook validation (choose a random string)
- `STRAVA_WEBHOOK_CALLBACK_URL`: Your production webhook URL (e.g., https://yourdomain.com/api/strava/webhook)

## Step 3: Security Implementation

The Strava integration follows RunRealm's security-first approach:

### ✅ What's Secure:

- **Client Secret**: Never exposed to client-side code
- **Token Exchange**: Handled server-side via Express.js endpoints
- **OAuth Flow**: Uses standard OAuth 2.0 with secure callback handling
- **Token Storage**: Access tokens stored securely with automatic refresh

### 🔒 Client-Side vs Server-Side:

- **Client-Side**: Only receives Client ID and redirect URI
- **Server-Side**: Handles Client Secret and token exchange
- **Automatic Refresh**: Tokens are refreshed automatically when expired

## Step 4: Test the Integration

### Manual Testing Steps:

1. **Start the development server**:

   ```bash
   npm run server
   ```

2. **Open the app**: Navigate to `http://localhost:3000`

3. **Access fitness integration**: Look for the fitness/Strava integration UI

4. **Test OAuth flow**:

   - Click "Connect" on the Strava card
   - Should open Strava authorization page
   - Authorize the app
   - Should redirect back and show "Connected" status

5. **Test activity import**:
   - Connected accounts should show recent running activities
   - Each activity should display distance, duration, and claim option

### Testing Checklist:

- [ ] OAuth flow opens in new window
- [ ] Successful authentication redirects properly
- [ ] Connection status updates to "Connected"
- [ ] Recent activities load and display
- [ ] Activity claiming works (if territory service is active)
- [ ] Error handling works for failed connections

## Step 5: Production Deployment

### Update Strava App Settings:

1. Go back to [https://www.strava.com/settings/api](https://www.strava.com/settings/api)
2. Update "Authorization Callback Domain" to your production domain
3. Update the redirect URI in your environment variables

### Environment Variables:

Ensure all production environment variables are set:

```bash
STRAVA_CLIENT_ID=your_production_client_id
STRAVA_CLIENT_SECRET=your_production_client_secret
STRAVA_REDIRECT_URI=https://yourdomain.com/auth/strava/callback
```

## API Endpoints Added

The integration adds these new endpoints to your server:

- `GET /auth/strava/callback` - Handles OAuth callback
- `POST /api/strava/refresh` - Refreshes expired tokens
- `GET /api/tokens` - Now includes Strava configuration
- `GET /api/strava/webhook` - Webhook validation endpoint (NEW!)
- `POST /api/strava/webhook` - Webhook event receiver (NEW!)

## Common Issues & Troubleshooting

### Issue: "Authorization Callback Domain" Error

**Solution**: Ensure the domain in Strava settings matches your current environment:

- Development: Use `localhost`
- Production: Use your actual domain without `https://`

### Issue: "Invalid Client" Error

**Solution**: Check that STRAVA_CLIENT_ID is correct and matches your Strava app

### Issue: Token Refresh Fails

**Solution**: Verify STRAVA_CLIENT_SECRET is set correctly in server environment

### Issue: Activities Not Loading

**Solution**: Check browser console for API errors and verify token is valid

## Strava API Rate Limits

Strava has the following rate limits:

- **15-minute limit**: 200 requests
- **Daily limit**: 2,000 requests

**✅ Rate Limiting Protection**: The integration now includes client-side rate limiting using a token bucket algorithm:
- Conservative limit of 180 requests per 15 minutes (leaves buffer)
- Automatic queuing of requests when limits are approached
- Graceful backoff on 429 rate limit errors
- Debug information available via `getRateLimiterStatus()`

## Real-Time Updates with Webhooks

**✅ Webhook Integration**: The app now supports Strava webhooks for real-time updates:

### What Webhooks Provide:
- **Real-time activity updates**: New runs appear immediately
- **Privacy change notifications**: Respect when users make activities private
- **Deauthorization events**: Clean up when users disconnect
- **Activity modifications**: Track title changes, deletions, etc.

### Webhook Setup:
1. **Automatic Subscription**: Server creates webhook subscription on startup
2. **Validation Endpoint**: `GET /api/strava/webhook` handles Strava's validation
3. **Event Processing**: `POST /api/strava/webhook` receives real-time events
4. **Secure Verification**: Uses `STRAVA_VERIFY_TOKEN` for security

### Webhook Events Handled:
- `activity.create` - New activities added
- `activity.update` - Activity details changed
- `activity.delete` - Activities removed
- `athlete.update` - User deauthorization

## Next Steps

With Strava integration set up, users can:

1. Connect their Strava account securely
2. Import running activities
3. Claim eligible runs as NFT territories
4. View their fitness data in the RunRealm dashboard

## Security Best Practices

1. **Never commit secrets**: Client secrets should never be in version control
2. **Use HTTPS in production**: All OAuth flows should use secure connections
3. **Validate redirects**: Only allow authorized redirect URIs
4. **Monitor usage**: Keep track of API usage to avoid rate limits

## Support

If you encounter issues:

1. Check the console for error messages
2. Verify all environment variables are set correctly
3. Ensure Strava app settings match your configuration
4. Test the OAuth flow step by step

For additional help, refer to the [Strava API documentation](https://developers.strava.com/docs/getting-started/).
