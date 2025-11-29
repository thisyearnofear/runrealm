/**
 * Test file for UserDashboard web component
 * This file tests the basic functionality of the UserDashboard web component
 */

// Import the UserDashboard component
import { UserDashboard } from './src/components/user-dashboard.js';

// Test the UserDashboard component
async function testUserDashboardComponent() {
  console.log('Testing UserDashboard web component...');

  try {
    // Get instance
    const dashboardComponent = UserDashboard.getInstance();
    console.log('✓ UserDashboard component instance created');

    // Create a test container
    const testContainer = document.createElement('div');
    testContainer.id = 'test-dashboard-container';
    document.body.appendChild(testContainer);

    // Test initialization
    dashboardComponent.initialize(testContainer);
    console.log('✓ UserDashboard component initialized');

    // Test show/hide functionality
    dashboardComponent.show();
    console.log('✓ UserDashboard component show() called');

    dashboardComponent.hide();
    console.log('✓ UserDashboard component hide() called');

    // Test toggle functionality
    dashboardComponent.toggle();
    console.log('✓ UserDashboard component toggle() called');

    console.log('All web component tests passed!');
  } catch (error) {
    console.error('Web component test failed:', error);
  }
}

// Run the test when the DOM is loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', testUserDashboardComponent);
} else {
  testUserDashboardComponent();
}
