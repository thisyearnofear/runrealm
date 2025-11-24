# Mobile App Fixes - React Native Compatibility

## Issues Fixed

### 1. Entry Point Error ✅
- **Problem**: `Cannot resolve entry file: The main field defined in your package.json points to an unresolvable or non-existent path`
- **Solution**: Created `index.js` entry point and updated `package.json` main field

### 2. Metro Bundler Configuration ✅
- **Problem**: Metro couldn't resolve monorepo packages (`@runrealm/shared-*`)
- **Solution**: Created `metro.config.js` with proper workspace resolution

### 3. Browser API Dependencies ✅
- **Problem**: Shared services use browser APIs (`window`, `document`, `navigator`) that don't exist in React Native
- **Solution**: 
  - Created `src/polyfills.ts` with minimal browser API polyfills
  - Updated services to load conditionally with error handling
  - Added guards throughout the app to check if services exist before using them

## Files Created/Modified

1. **`index.js`** - Entry point for Expo
2. **`metro.config.js`** - Metro bundler configuration for monorepo
3. **`src/polyfills.ts`** - Browser API polyfills for React Native
4. **`App.tsx`** - Main app component with conditional service loading
5. **`src/MobileApp.tsx`** - Updated to handle missing services gracefully

## Current Status

✅ **Basic app works** - The simplified version runs successfully
🔄 **Services loading** - Services are now loaded conditionally with error handling
⚠️ **Some services may not work** - Services that heavily depend on browser APIs may need additional work

## Testing

1. **Basic App** ✅ - Should show "Basic app is working"
2. **Service Loading** - Check console for service availability
3. **Full App** - If services load, the full MobileApp component should render

## Next Steps

If services fail to load, you may need to:

1. **Create React Native-specific service wrappers** for services that use browser APIs
2. **Add more polyfills** for specific browser APIs used by services
3. **Conditionally disable** services that can't work in React Native
4. **Use mobile-specific implementations** instead of shared services where needed

## Services Status

- ✅ **TerritoryService** - Should work (uses turf, no browser APIs)
- ✅ **GameService** - Should work
- ✅ **AchievementService** - Should work
- ⚠️ **MapService** - May need adaptation (uses Mapbox which has React Native version)
- ⚠️ **Web3Service** - Should work (checks for window.ethereum)
- ⚠️ **ExternalFitnessService** - Should work

## Running the App

```bash
cd packages/mobile-app
npx expo start --clear
```

Check the console output to see which services loaded successfully.

