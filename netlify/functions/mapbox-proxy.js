// Netlify Function to securely proxy Mapbox API calls
// This keeps your MAPBOX_ACCESS_TOKEN secret on the server

exports.handler = async (event, context) => {
  // Only allow GET requests
  if (event.httpMethod !== 'GET') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  const { path, query } = event.queryStringParameters || {};
  
  if (!path) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: 'Missing path parameter' })
    };
  }

  try {
    const mapboxToken = process.env.MAPBOX_ACCESS_TOKEN;
    
    if (!mapboxToken) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Mapbox token not configured' })
      };
    }

    // Construct the Mapbox API URL
    const baseUrl = 'https://api.mapbox.com';
    const url = new URL(`${baseUrl}${path}`);
    
    // Add the access token
    url.searchParams.set('access_token', mapboxToken);
    
    // Add any additional query parameters
    if (query) {
      const queryParams = new URLSearchParams(query);
      for (const [key, value] of queryParams) {
        url.searchParams.set(key, value);
      }
    }

    // Make the request to Mapbox
    const response = await fetch(url.toString());
    const data = await response.text();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS'
      },
      body: data
    };

  } catch (error) {
    console.error('Mapbox proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
