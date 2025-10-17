// Development-only script to set API keys in localStorage
// This file should only be included in development builds

// Only run in development environment
if (process.env.NODE_ENV === 'development') {
  // Set Mapbox access token in localStorage
  if (!localStorage.getItem('runrealm_mapbox_access_token')) {
    localStorage.setItem('runrealm_mapbox_access_token', 'pk.eyJ1IjoicGFwYWphbXMiLCJhIjoiY21land3ZW9lMGpqdjJsczhhc3dtNXVlZyJ9.1gOQMw-mN5B0JDC51f1YeA');
  }

  // Set Google Gemini API key in localStorage
  if (!localStorage.getItem('runrealm_google_gemini_api_key')) {
    localStorage.setItem('runrealm_google_gemini_api_key', 'AIzaSyAyWHEosF-YpX6hdp1gPsQT-SFl8wXSetA');
  }

  console.log('🔒 Development keys set in localStorage');
}