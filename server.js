const express = require("express");
const path = require("path");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;

// Import webhook service (will be loaded after app setup)
let StravaWebhookService;

console.log("Starting server...");
console.log(
  "MAPBOX_ACCESS_TOKEN:",
  process.env.MAPBOX_ACCESS_TOKEN ? "Set" : "Not set"
);
console.log(
  "GOOGLE_GEMINI_API_KEY:",
  process.env.GOOGLE_GEMINI_API_KEY ? "Set" : "Not set"
);
console.log(
  "STRAVA_CLIENT_ID:",
  process.env.STRAVA_CLIENT_ID ? "Set" : "Not set"
);
console.log(
  "STRAVA_CLIENT_SECRET:",
  process.env.STRAVA_CLIENT_SECRET ? "Set" : "Not set"
);
console.log(
  "STRAVA_VERIFY_TOKEN:",
  process.env.STRAVA_VERIFY_TOKEN ? "Set" : "Using default"
);

// Enable JSON parsing for POST requests
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Requested-With"
  );

  // Handle preflight requests
  if (req.method === "OPTIONS") {
    res.sendStatus(200);
  } else {
    next();
  }
});

// Serve static files from the public directory
app.use(express.static(path.join(__dirname, "public")));

// API endpoint to provide tokens
app.get("/api/tokens", (req, res) => {
  console.log("Received request for /api/tokens from:", req.ip || req.connection.remoteAddress);
  console.log("Request headers:", req.headers);
  console.log("Environment variables status:", {
    MAPBOX_ACCESS_TOKEN: process.env.MAPBOX_ACCESS_TOKEN ? "SET" : "NOT SET",
    GOOGLE_GEMINI_API_KEY: process.env.GOOGLE_GEMINI_API_KEY ? "SET" : "NOT SET",
    STRAVA_CLIENT_ID: process.env.STRAVA_CLIENT_ID ? "SET" : "NOT SET"
  });

  // Only allow GET requests
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const tokens = {
      mapbox: process.env.MAPBOX_ACCESS_TOKEN || "",
      gemini: process.env.GOOGLE_GEMINI_API_KEY || "",
      strava: {
        clientId: process.env.STRAVA_CLIENT_ID || "",
        redirectUri:
          process.env.STRAVA_REDIRECT_URI ||
          "https://runrealm.netlify.app/auth/strava/callback", // Updated for production
      },
    };

    // Don't return empty tokens
    const validTokens = {};
    if (tokens.mapbox) validTokens.mapbox = tokens.mapbox;
    if (tokens.gemini) validTokens.gemini = tokens.gemini;
    if (tokens.strava.clientId) validTokens.strava = tokens.strava;

    console.log("Sending tokens:", Object.keys(validTokens));
    res.json(validTokens);
  } catch (error) {
    console.error("Token retrieval error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Strava OAuth callback handler
app.get("/auth/strava/callback", async (req, res) => {
  console.log("Received Strava OAuth callback");

  const { code, error } = req.query;

  if (error) {
    console.error("Strava OAuth error:", error);
    return res.redirect("/?strava_error=" + encodeURIComponent(error));
  }

  if (!code) {
    console.error("No authorization code received");
    return res.redirect("/?strava_error=no_code");
  }

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        code: code,
        grant_type: "authorization_code",
      }),
    });

    const tokenData = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Strava token exchange failed:", tokenData);
      return res.redirect("/?strava_error=token_exchange_failed");
    }

    console.log("Strava token exchange successful");

    // Redirect back to app with success and temporary access token
    // In production, you'd want to store this securely and use a session
    const redirectUrl = `/?strava_success=true&access_token=${tokenData.access_token}&refresh_token=${tokenData.refresh_token}&expires_at=${tokenData.expires_at}`;
    res.redirect(redirectUrl);
  } catch (error) {
    console.error("Strava OAuth callback error:", error);
    res.redirect("/?strava_error=server_error");
  }
});

// Strava token refresh endpoint
app.post("/api/strava/refresh", async (req, res) => {
  console.log("Received Strava token refresh request");

  const { refresh_token } = req.body;

  if (!refresh_token) {
    return res.status(400).json({ error: "Refresh token required" });
  }

  try {
    const response = await fetch("https://www.strava.com/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        client_id: process.env.STRAVA_CLIENT_ID,
        client_secret: process.env.STRAVA_CLIENT_SECRET,
        refresh_token: refresh_token,
        grant_type: "refresh_token",
      }),
    });

    const tokenData = await response.json();

    if (!response.ok) {
      console.error("Strava token refresh failed:", tokenData);
      return res
        .status(400)
        .json({ error: "Token refresh failed", details: tokenData });
    }

    console.log("Strava token refresh successful");
    res.json(tokenData);
  } catch (error) {
    console.error("Strava token refresh error:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Strava Webhook endpoints
app.get("/api/strava/webhook", (req, res) => {
  console.log("Received Strava webhook validation request");
  
  const { 'hub.mode': mode, 'hub.verify_token': token, 'hub.challenge': challenge } = req.query;
  const verifyToken = process.env.STRAVA_VERIFY_TOKEN || 'runrealm_webhook_verify';
  
  if (mode === 'subscribe' && token === verifyToken) {
    console.log('Strava webhook: Validation successful');
    return res.json({ 'hub.challenge': challenge });
  }
  
  console.warn('Strava webhook: Validation failed', { mode, token });
  return res.status(403).json({ error: 'Validation failed' });
});

app.post("/api/strava/webhook", (req, res) => {
  console.log("Received Strava webhook event");
  
  // Acknowledge immediately (required by Strava)
  res.status(200).end();
  
  try {
    const event = req.body;
    console.log('Strava webhook event:', {
      type: event.object_type,
      aspect: event.aspect_type,
      id: event.object_id,
      owner: event.owner_id
    });

    // Handle different event types
    switch (event.aspect_type) {
      case 'create':
        console.log(`New ${event.object_type} created: ${event.object_id}`);
        break;
      case 'update':
        console.log(`${event.object_type} updated: ${event.object_id}`, event.updates);
        // Handle privacy changes
        if (event.updates?.private !== undefined) {
          console.log(`Activity ${event.object_id} privacy changed to: ${event.updates.private}`);
        }
        break;
      case 'delete':
        console.log(`${event.object_type} deleted: ${event.object_id}`);
        break;
      default:
        console.log('Unhandled webhook event type:', event.aspect_type);
    }
    
    // Handle athlete deauthorization
    if (event.object_type === 'athlete' && event.updates?.authorized === 'false') {
      console.log(`Athlete ${event.owner_id} deauthorized the app`);
      // TODO: Clean up stored tokens for this athlete
    }
    
  } catch (error) {
    console.error('Error processing Strava webhook event:', error);
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(port, async () => {
  console.log(`Server running at http://localhost:${port}`);
  
  // Initialize Strava webhook subscription
  if (process.env.STRAVA_CLIENT_ID && process.env.STRAVA_CLIENT_SECRET) {
    try {
      await initializeStravaWebhook();
    } catch (error) {
      console.error('⚠️  Failed to initialize Strava webhook:', error.message);
    }
  } else {
    console.log('Strava webhook: Skipping initialization (missing credentials)');
  }
});

// Initialize Strava webhook subscription
async function initializeStravaWebhook() {
  const clientId = process.env.STRAVA_CLIENT_ID;
  const clientSecret = process.env.STRAVA_CLIENT_SECRET;
  const verifyToken = process.env.STRAVA_VERIFY_TOKEN || 'runrealm_webhook_verify';
  const callbackUrl = process.env.STRAVA_WEBHOOK_CALLBACK_URL || `http://localhost:${port}/api/strava/webhook`;
  
  try {
    // Check for existing subscription
    const listResponse = await fetch(
      `https://www.strava.com/api/v3/push_subscriptions?client_id=${clientId}&client_secret=${clientSecret}`
    );
    
    if (listResponse.ok) {
      const subscriptions = await listResponse.json();
      if (Array.isArray(subscriptions) && subscriptions.length > 0) {
        console.log(`Strava webhook: Found existing subscription id=${subscriptions[0].id}`);
        return;
      }
    }

    // Create new subscription
    const formData = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      callback_url: callbackUrl,
      verify_token: verifyToken
    });

    const createResponse = await fetch('https://www.strava.com/api/v3/push_subscriptions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData
    });

    if (createResponse.ok) {
      const subscription = await createResponse.json();
      console.log(`✅ Strava webhook: Created subscription id=${subscription.id}`);
    } else {
      const errorText = await createResponse.text();
      throw new Error(`HTTP ${createResponse.status}: ${errorText}`);
    }
    
  } catch (error) {
    throw new Error(`Webhook initialization failed: ${error.message}`);
  }
}

// Handle shutdown gracefully
process.on("SIGINT", () => {
  console.log("Shutting down server...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
