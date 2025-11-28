module.exports = {
  preset: "react-native",
  transformIgnorePatterns: [
    "node_modules/(?!(expo|@expo|expo-location|expo-modules-core|@react-native|react-native|@react-navigation|react-navigation|@unimodules|unimodules|expo-asset|expo-constants|expo-device|expo-notifications|expo-status-bar|expo-task-manager|@react-native-community|react-native-gesture-handler|react-native-maps|react-native-reanimated|react-native-safe-area-context|react-native-screens|react-native-vector-icons|react-native-worklets)/)",
  ],
  moduleNameMapper: {
    "^@runrealm/shared-core/(.*)$": "<rootDir>/../shared-core/$1",
    "^@runrealm/shared-types/(.*)$": "<rootDir>/../shared-types/$1",
    "^@runrealm/shared-utils/(.*)$": "<rootDir>/../shared-utils/$1",
    "^@runrealm/shared-blockchain/(.*)$": "<rootDir>/../shared-blockchain/$1",
  },
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  testEnvironment: "node",
};

