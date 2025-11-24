# Troubleshooting iOS Simulator Issues

## If the simulator shows a blank screen:

### 1. Check Metro Bundler
Make sure Metro bundler is running. You should see:
```
Metro waiting on exp://...
```

### 2. Check for Errors
Look at:
- Terminal output (Metro bundler logs)
- iOS Simulator console (Device > Console in Simulator menu)
- React Native Debugger (if enabled)

### 3. Common Issues

#### Port Already in Use
```bash
# Kill process on port 8081
lsof -ti:8081 | xargs kill -9

# Or use a different port
PORT=8082 npm run ios
```

#### Clear Cache
```bash
# Clear Metro bundler cache
npx expo start --clear

# Clear watchman
watchman watch-del-all

# Clear node modules and reinstall
rm -rf node_modules
npm install
```

#### Reset Simulator
```bash
# In iOS Simulator menu
Device > Erase All Content and Settings
```

### 4. Check App Entry Point
Make sure `index.js` exists and properly registers the app:
```javascript
import { registerRootComponent } from "expo";
import App from "./App";
registerRootComponent(App);
```

### 5. Check for Import Errors
The app might be failing silently on import. Check:
- Console for "Failed to load" messages
- Make sure all imports are valid
- Check if polyfills are loading correctly

### 6. Enable Remote Debugging
1. Open iOS Simulator
2. Press `Cmd + D` (or Device > Shake)
3. Select "Debug"
4. Check Chrome DevTools console

### 7. Check React Native Logs
```bash
# View React Native logs
npx react-native log-ios
```

### 8. Verify Expo Setup
```bash
# Check Expo installation
npx expo-doctor

# Check if app.json is valid
cat app.json
```

## Quick Fixes

### Restart Everything
```bash
# 1. Kill all node processes
killall node

# 2. Clear cache
npx expo start --clear

# 3. Restart simulator
# In Simulator: Device > Restart

# 4. Run again
npm run ios
```

### Use Expo Go App
Instead of building, try using Expo Go:
1. Install Expo Go on your iPhone
2. Run `npm start` (not `npm run ios`)
3. Scan QR code with Expo Go app

### Check Xcode
If using Xcode:
```bash
# Open in Xcode
open ios/*.xcworkspace

# Check for build errors in Xcode
```

## Still Not Working?

1. Check the exact error message in terminal
2. Check iOS Simulator console (Device > Console)
3. Try running on a physical device instead
4. Check if other Expo apps work (to isolate the issue)

