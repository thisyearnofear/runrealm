// Netlify Function to securely proxy Google Gemini API calls
// This keeps your GOOGLE_GEMINI_API_KEY secret on the server

exports.handler = async (event, context) => {
  // Allow GET and POST requests
  if (!['GET', 'POST', 'OPTIONS'].includes(event.httpMethod)) {
    return {
      statusCode: 405,
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
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: ''
    };
  }

  try {
    const geminiApiKey = process.env.GOOGLE_GEMINI_API_KEY;
    
    if (!geminiApiKey) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: 'Gemini API key not configured' })
      };
    }

    // Extract the API path from query parameters or default
    const { path = '/v1beta/models/gemini-pro:generateContent' } = event.queryStringParameters || {};
    
    // Construct the Gemini API URL
    const baseUrl = 'https://generativelanguage.googleapis.com';
    const url = `${baseUrl}${path}?key=${geminiApiKey}`;

    const requestOptions = {
      method: event.httpMethod,
      headers: {
        'Content-Type': 'application/json',
      }
    };

    // Add body for POST requests
    if (event.httpMethod === 'POST' && event.body) {
      requestOptions.body = event.body;
    }

    // Make the request to Gemini API
    const response = await fetch(url, requestOptions);
    const data = await response.text();

    return {
      statusCode: response.status,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
      },
      body: data
    };

  } catch (error) {
    console.error('Gemini proxy error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};
