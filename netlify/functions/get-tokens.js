// Netlify Function to securely provide API tokens at runtime
// This allows the client to get tokens without them being in the bundle

exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const tokens = {
      mapbox: process.env.MAPBOX_ACCESS_TOKEN || '',
      gemini: process.env.GOOGLE_GEMINI_API_KEY || ''
    };

    // Don't return empty tokens
    const validTokens = {};
    if (tokens.mapbox) validTokens.mapbox = tokens.mapbox;
    if (tokens.gemini) validTokens.gemini = tokens.gemini;

    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        // Cache for 5 minutes to reduce function calls
        'Cache-Control': 'public, max-age=300'
      },
      body: JSON.stringify(validTokens)
    };

  } catch (error) {
    console.error('Token retrieval error:', error);
    return {
      statusCode: 500,
      headers: {
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
