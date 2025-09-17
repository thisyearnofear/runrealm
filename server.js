const express = require("express");
const path = require("path");
require("dotenv").config();
const app = express();
const port = process.env.PORT || 3000;

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
  console.log("Received request for /api/tokens");

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
          "http://localhost:3000/auth/strava/callback",
      },
    };

    // Don't return empty tokens
    const validTokens = {};
    if (tokens.mapbox) validTokens.mapbox = tokens.mapbox;
    if (tokens.gemini) validTokens.gemini = tokens.gemini;
    if (tokens.strava.clientId) validTokens.strava = tokens.strava;

    console.log("Sending tokens:", validTokens);
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
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

const server = app.listen(port, () => {
  console.log(`Server running at http://localhost:${port}`);
});

// Handle shutdown gracefully
process.on("SIGINT", () => {
  console.log("Shutting down server...");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
