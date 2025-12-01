module.exports = ({ config }) => {
  const mapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

  return {
    ...config,
    name: config?.name ?? 'RunRealm Mobile',
    slug: config?.slug ?? 'runrealm-mobile',
    ios: {
      ...(config?.ios || {}),
      supportsTablet: true,
      infoPlist: {
        ...(config?.ios?.infoPlist || {}),
        NSLocationWhenInUseUsageDescription:
          'Allow RunRealm to access your location during runs to track territories and provide navigation.',
        NSLocationAlwaysAndWhenInUseUsageDescription:
          'Allow RunRealm to access your location in the background to track runs and territory progress.',
        UIBackgroundModes: ['location'],
      },
      config: {
        ...(config?.ios?.config || {}),
        googleMapsApiKey: mapsApiKey,
      },
    },
    android: {
      ...(config?.android || {}),
      permissions: [
        ...(config?.android?.permissions || []),
        'ACCESS_FINE_LOCATION',
        'ACCESS_COARSE_LOCATION',
        'ACCESS_BACKGROUND_LOCATION',
      ],
      config: {
        ...(config?.android?.config || {}),
        googleMaps: {
          ...(config?.android?.config?.googleMaps || {}),
          apiKey: mapsApiKey,
        },
      },
    },
    extra: {
      ...(config?.extra || {}),
    },
  };
};
