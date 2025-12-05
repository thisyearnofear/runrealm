# Mobile App Unit Tests

This document describes the unit tests created for the mobile app's new components and services.

## Test Setup

- **Testing Framework**: Jest with React Native Testing Library
- **Configuration**: `jest.config.js` and `jest.setup.js`
- **Test Location**: All tests are in `src/**/__tests__/` directories

## Test Files Created

### Services Tests

#### `src/services/__tests__/MobilePreferenceService.test.ts`
Tests for the mobile preference service that adapts shared PreferenceService to use AsyncStorage.

**Coverage:**
- ✅ `getUseMetric()` - Retrieves metric/imperial preference
- ✅ `saveUseMetric()` - Saves metric/imperial preference
- ✅ `getEnableNotifications()` - Retrieves notification preference
- ✅ `saveEnableNotifications()` - Saves notification preference
- ✅ `getBackgroundTracking()` - Retrieves background tracking preference
- ✅ `saveBackgroundTracking()` - Saves background tracking preference
- ✅ Default value handling when no preference is stored

#### `src/services/__tests__/MobileRunTrackingService.test.ts`
Tests for the mobile run tracking service that wraps the shared RunTrackingService.

**Coverage:**
- ✅ `saveRunToHistory()` - Saves completed runs to AsyncStorage
- ✅ `getRunHistory()` - Retrieves run history from AsyncStorage
- ✅ Delegation to RunTrackingService methods (startRun, pauseRun, resumeRun, stopRun, getCurrentRun, getCurrentStats)
- ✅ Error handling for storage operations

### Component Tests

#### `src/components/__tests__/ChallengeCard.test.tsx`
Tests for the challenge card component that displays and manages challenges.

**Coverage:**
- ✅ Renders challenge information (title, description, reward)
- ✅ Displays progress correctly (distance, percentage)
- ✅ Shows claim button when challenge is completed
- ✅ Shows claimed badge when challenge is claimed
- ✅ Calls `claimChallengeReward` when claim button is pressed
- ✅ Shows success/error alerts appropriately
- ✅ Formats time remaining correctly
- ✅ Formats distance values correctly

#### `src/components/__tests__/AICoachingWidget.test.tsx`
Tests for the AI coaching widget that provides real-time coaching during runs.

**Coverage:**
- ✅ Does not render when visible is false
- ✅ Shows loading state initially
- ✅ Displays coaching data when loaded (motivation, tips, warnings, pace recommendation)
- ✅ Initializes AI service if not initialized
- ✅ Handles errors gracefully
- ✅ Calls onDismiss when dismiss button is pressed

#### `src/components/__tests__/RouteSuggestionCard.test.tsx`
Tests for the route suggestion card that provides AI-powered route suggestions.

**Coverage:**
- ✅ Does not render when location is null
- ✅ Shows loading state initially
- ✅ Displays route information when loaded (distance, difficulty, description, landmarks)
- ✅ Calls `onRouteSelected` when use route button is pressed
- ✅ Handles errors gracefully
- ✅ Refreshes route when refresh button is pressed
- ✅ Initializes AI service if not initialized

#### `src/components/__tests__/GhostManagement.test.tsx`
Tests for the ghost management component that manages ghost runners.

**Coverage:**
- ✅ Does not render when visible is false
- ✅ Renders ghost list when visible
- ✅ Displays realm balance
- ✅ Shows empty state when no ghosts
- ✅ Shows ghost details when ghost is selected
- ✅ Deploys ghost to territory
- ✅ Upgrades ghost
- ✅ Shows cooldown status
- ✅ Handles deployment errors

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm test -- --watch

# Run tests with coverage
npm test -- --coverage

# Run a specific test file
npm test -- ChallengeCard.test.tsx
```

## Test Structure

Each test file follows this structure:

1. **Imports**: React, testing utilities, and the component/service being tested
2. **Mocks**: Mock dependencies (services, React Native modules)
3. **Describe blocks**: Group related tests
4. **BeforeEach**: Setup that runs before each test
5. **Test cases**: Individual test scenarios with descriptive names

## Mocking Strategy

- **React Native modules**: Mocked in `jest.setup.js`
- **Services**: Mocked at the test file level using `jest.mock()`
- **AsyncStorage**: Mocked to return promises
- **Alert**: Mocked to capture calls without showing UI

## Best Practices

1. **Isolation**: Each test is independent and doesn't rely on other tests
2. **Clear naming**: Test names describe what is being tested
3. **Arrange-Act-Assert**: Tests follow the AAA pattern
4. **Mock external dependencies**: All external services and modules are mocked
5. **Error handling**: Tests verify error handling paths
6. **Edge cases**: Tests cover edge cases like null values, empty arrays, etc.

## Coverage Goals

- **Services**: 100% coverage of public methods
- **Components**: Coverage of main user flows and error paths
- **Critical paths**: All critical user flows are tested

## Future Improvements

- Add integration tests for screen components
- Add E2E tests using Detox or similar
- Add snapshot tests for UI components
- Add performance tests for heavy operations
- Add accessibility tests

