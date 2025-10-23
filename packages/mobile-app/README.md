# RunRealm Mobile App

Transform your runs into NFT territories on the go! 🏃‍♂️🗺️

---

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm start

# Run on iOS
npm run ios

# Run on Android
npm run android
```

**First time?** See [QUICKSTART.md](./QUICKSTART.md) for detailed setup.

---

## 📱 Features

- ✅ **GPS Run Tracking** - Accurate location tracking with real-time stats
- ✅ **Interactive Map** - Visualize your runs and nearby territories
- ✅ **Territory Claiming** - Convert completed runs into NFT territories
- ✅ **Achievements** - Unlock rewards as you explore
- ✅ **Onboarding** - Smooth introduction for new users
- 🚧 **Web3 Wallet** - Connect wallet to claim territories (coming soon)
- 🚧 **Strava Integration** - Import runs from Strava (coming soon)

---

## 🏗️ Architecture

### Core Principles

This app follows our **Core Principles**:
- **ENHANCEMENT FIRST** - Reuses existing shared-core services
- **DRY** - Zero duplicate business logic
- **CLEAN** - Clear separation of concerns
- **MODULAR** - Composable, testable components
- **PERFORMANT** - Optimized rendering and caching
- **ORGANIZED** - Predictable file structure

### Structure

```
packages/mobile-app/
├── src/
│   ├── components/          # UI components
│   │   ├── TerritoryMapView.tsx      # Map visualization
│   │   ├── GPSTrackingComponent.tsx  # Run tracking UI
│   │   └── MobileOnboarding.tsx      # Onboarding flow
│   ├── services/            # Platform adapters
│   │   ├── MobileMapAdapter.ts       # Map service adapter
│   │   └── MobileRunTrackingService.ts
│   └── MobileApp.tsx        # Main app component
├── assets/                  # App icons and images
├── app.json                 # Expo configuration
├── eas.json                 # Build configuration
└── package.json             # Dependencies
```

### Data Flow

```
User Action
    ↓
UI Component (presentation)
    ↓
Platform Adapter (data transformation)
    ↓
Shared Service (business logic)
    ↓
State Update
    ↓
UI Re-render
```

---

## 🔧 Development

### Prerequisites

- Node.js 16+
- Expo CLI (`npm install -g expo-cli eas-cli`)
- iOS Simulator (Xcode) or Android Emulator
- Expo account (free)

### Setup

```bash
# Install dependencies
npm install

# Login to Expo
eas login

# Configure EAS
eas build:configure
```

### Running

```bash
# Start dev server
npm start

# Options:
# - Press 'i' for iOS simulator
# - Press 'a' for Android emulator
# - Scan QR code with Expo Go app
```

### Building

```bash
# Development build (for testing)
eas build --profile development --platform ios

# Production build (for App Store)
eas build --profile production --platform ios
```

---

## 🧪 Testing

### Manual Testing

```bash
# Start app
npm start

# Test checklist:
# - [ ] GPS tracking starts/stops
# - [ ] Map displays user location
# - [ ] Run trail appears on map
# - [ ] Territory claiming works
# - [ ] Achievements unlock
```

### Unit Tests (Coming Soon)

```bash
npm test
```

---

## 📦 Dependencies

### Core
- `expo` - Development platform
- `react-native` - Mobile framework
- `react-native-maps` - Map visualization

### Shared Packages
- `@runrealm/shared-core` - Business logic
- `@runrealm/shared-types` - Type definitions
- `@runrealm/shared-utils` - Utilities
- `@runrealm/shared-blockchain` - Web3 services

### Location
- `expo-location` - GPS tracking
- `expo-constants` - App constants
- `expo-device` - Device info

---

## 🚢 Deployment

### TestFlight (Beta)

```bash
# Build for TestFlight
eas build --profile production --platform ios

# Submit to TestFlight
eas submit --platform ios
```

### App Store

1. Create app in App Store Connect
2. Upload screenshots and metadata
3. Submit for review
4. Wait for approval (1-3 days)
5. Release! 🎉

See [MOBILE_NEXT_STEPS.md](../../docs/MOBILE_NEXT_STEPS.md) for detailed guide.

---

## 📚 Documentation

- **[QUICKSTART.md](./QUICKSTART.md)** - Get started in 30 minutes
- **[MOBILE_IMPLEMENTATION_GUIDE.md](../../docs/MOBILE_IMPLEMENTATION_GUIDE.md)** - Architecture details
- **[MOBILE_PRODUCTION_READINESS.md](../../docs/MOBILE_PRODUCTION_READINESS.md)** - Production checklist
- **[MOBILE_ENHANCEMENT_SUMMARY.md](../../docs/MOBILE_ENHANCEMENT_SUMMARY.md)** - What we built

---

## 🐛 Troubleshooting

### Map not showing
**Solution:** Check location permissions in simulator/device settings

### Build fails
**Solution:** Clear cache and rebuild
```bash
eas build --profile development --platform ios --clear-cache
```

### GPS not working
**Solution:** Ensure location permissions are granted in app.json

### App crashes on launch
**Solution:** Check logs
```bash
eas build:list
eas build:view [BUILD_ID]
```

---

## 🤝 Contributing

1. Follow Core Principles (see above)
2. Write tests for new features
3. Update documentation
4. Submit PR with clear description

---

## 📄 License

See [LICENSE](../../LICENSE) in root directory.

---

## 🔗 Links

- **Web App**: [packages/web-app](../web-app)
- **Shared Core**: [packages/shared-core](../shared-core)
- **Documentation**: [docs/](../../docs)
- **Main README**: [../../README.md](../../README.md)

---

## 💬 Support

- **Issues**: [GitHub Issues](https://github.com/thisyearnofear/runrealm/issues)
- **Discussions**: [GitHub Discussions](https://github.com/thisyearnofear/runrealm/discussions)
- **Expo Help**: [Expo Discord](https://chat.expo.dev/)

---

**Built with ❤️ following Core Principles**

**Ready to run? `npm start` and let's go! 🚀**
