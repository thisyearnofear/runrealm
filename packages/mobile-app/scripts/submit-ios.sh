#!/bin/bash

# Load environment variables from .env file if it exists
if [ -f .env ]; then
  export $(cat .env | grep -v '^#' | xargs)
fi

# Check if required environment variables are set
if [ -z "$APPLE_ID" ] || [ -z "$ASC_APP_ID" ] || [ -z "$APPLE_TEAM_ID" ]; then
  echo "❌ Error: Missing required environment variables"
  echo ""
  echo "Please set the following in your .env file or environment:"
  echo "  APPLE_ID=your-apple-id@example.com"
  echo "  ASC_APP_ID=1234567890"
  echo "  APPLE_TEAM_ID=ABCD123456"
  echo ""
  echo "Or create a .env file in packages/mobile-app/ with these values."
  exit 1
fi

# Submit to TestFlight using environment variables
echo "🚀 Submitting to TestFlight..."
echo "   Apple ID: $APPLE_ID"
echo "   App ID: $ASC_APP_ID"
echo "   Team ID: $APPLE_TEAM_ID"
echo ""

eas submit --platform ios --latest \
  --apple-id "$APPLE_ID" \
  --asc-app-id "$ASC_APP_ID" \
  --apple-team-id "$APPLE_TEAM_ID"


