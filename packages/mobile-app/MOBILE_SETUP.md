# RunRealm Mobile App Setup

## Quick Start

The mobile app entry point issue has been fixed. Here's how to run it:

### 1. Install Dependencies

```bash
cd packages/mobile-app
npm install
```

### 2. Install Missing Dependencies

The app uses `@react-native-async-storage/async-storage` which has been added to package.json. Run:

```bash
npm install
```

### 3. Create Assets (Optional)

The app.json references some assets. For now, you can:

**Option A: Create placeholder assets**

```bash
# Create simple placeholder images (or use your own)
# You'll need: icon.png, splash.png, adaptive-icon.png, favicon.png
```

**Option B: Update app.json to remove asset requirements temporarily**

### 4. Start the App

```bash
# From packages/mobile-app directory
npm start

# Or use Expo CLI
npx expo start

# For iOS
npm run ios

# For Android
npm run android

# For Web
npm run web
```

## What Was Fixed

1. ✅ Created `index.js` entry point file
2. ✅ Updated `package.json` main field to point to `index.js`
3. ✅ Added `@react-native-async-storage/async-storage` dependency
4. ✅ Created assets directory

## Common Issues

### "Cannot resolve entry file"

- ✅ Fixed by creating `index.js` and updating `package.json`

### "Module not found: @react-native-async-storage/async-storage"

- Run `npm install` in the mobile-app directory

### "Assets not found"

- Create placeholder images or update `app.json` to make assets optional

### Metro bundler errors

- Clear cache: `npx expo start -c`
- Reset: `rm -rf node_modules && npm install`

## Next Steps

1. Install dependencies: `npm install`
2. Create or update assets as needed
3. Run: `npm start` or `npx expo start`
4. Scan QR code with Expo Go app (iOS/Android) or press `w` for web

## Development Tips

- Use Expo Go app on your phone for quick testing
- Press `r` in terminal to reload
- Press `m` to toggle menu
- Check Expo docs: https://docs.expo.dev/
