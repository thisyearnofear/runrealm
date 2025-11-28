#!/bin/bash

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if EXPO_APPLE_TEAM_ID is set
if [ -z "$EXPO_APPLE_TEAM_ID" ]; then
  echo "❌ Error: EXPO_APPLE_TEAM_ID environment variable is not set"
  echo ""
  echo "Please set it in your .env file or environment:"
  echo "  EXPO_APPLE_TEAM_ID=YOUR_TEAM_ID_HERE"
  echo ""
  echo "Or create a .env file in packages/mobile-app/ with this value."
  echo "See .env.example for a template."
  exit 1
fi

# Build iOS app with Team ID from environment
echo "🚀 Building iOS app for production..."
echo "   Team ID: $EXPO_APPLE_TEAM_ID"
echo ""

EXPO_APPLE_TEAM_ID="$EXPO_APPLE_TEAM_ID" eas build --profile production --platform ios

