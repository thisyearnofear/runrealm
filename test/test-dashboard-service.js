/**
 * Test file for UserDashboardService
 * This file tests the basic functionality of the UserDashboardService
 */

import { UserDashboardService } from './packages/shared-core/services/user-dashboard-service';

// Test the UserDashboardService
async function testUserDashboardService() {
  console.log('Testing UserDashboardService...');
  
  try {
    // Get instance
    const dashboardService = UserDashboardService.getInstance();
    console.log('✓ UserDashboardService instance created');
    
    // Test initialization
    await dashboardService.initialize();
    console.log('✓ UserDashboardService initialized');
    
    // Test getting state
    const state = dashboardService.getState();
    console.log('✓ Dashboard state retrieved:', state);
    
    // Test getting data
    const data = dashboardService.getData();
    console.log('✓ Dashboard data retrieved:', data);
    
    // Test show/hide functionality
    dashboardService.show();
    console.log('✓ Dashboard show() called');
    
    const visibleState = dashboardService.getState();
    console.log('✓ Dashboard state after show():', visibleState);
    
    dashboardService.hide();
    console.log('✓ Dashboard hide() called');
    
    const hiddenState = dashboardService.getState();
    console.log('✓ Dashboard state after hide():', hiddenState);
    
    // Test toggle functionality
    dashboardService.toggle();
    console.log('✓ Dashboard toggle() called');
    
    const toggledState = dashboardService.getState();
    console.log('✓ Dashboard state after toggle():', toggledState);
    
    console.log('All tests passed!');
  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testUserDashboardService();