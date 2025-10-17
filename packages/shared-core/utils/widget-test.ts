/**
 * Widget Test Utilities
 * Simple utilities to test widget functionality
 */

export class WidgetTest {
  static testWidgetVisibility(): boolean {
    const widgetSystem = document.getElementById('widget-system');
    if (!widgetSystem) {
      console.error('❌ Widget system container not found');
      return false;
    }

    const zones = widgetSystem.querySelectorAll('.widget-zone');
    if (zones.length !== 4) {
      console.error(`❌ Expected 4 widget zones, found ${zones.length}`);
      return false;
    }

    const widgets = widgetSystem.querySelectorAll('.widget');
    console.log(`✅ Widget system found with ${widgets.length} widgets`);
    
    widgets.forEach((widget, index) => {
      const rect = widget.getBoundingClientRect();
      const isVisible = rect.width > 0 && rect.height > 0;
      const id = widget.id;
      console.log(`Widget ${index + 1} (${id}): ${isVisible ? '✅ Visible' : '❌ Hidden'} - ${rect.width}x${rect.height}`);
    });

    return widgets.length > 0;
  }

  static testLocationSearch(): void {
    console.log('🧪 Testing location search...');
    
    // Simulate location change event
    const mockLocation = {
      lat: -1.2921,
      lng: 36.8219,
      address: 'Nairobi, Kenya',
      source: 'search',
      timestamp: Date.now()
    };

    // Check if event bus is available
    const app = (window as any).runRealmApp;
    if (app && app.eventBus) {
      console.log('📡 Emitting location:changed event...');
      app.eventBus.emit('location:changed', mockLocation);
    } else {
      console.error('❌ Event bus not available for testing');
    }
  }

  static runAllTests(): void {
    console.log('🧪 Running widget system tests...');
    
    setTimeout(() => {
      this.testWidgetVisibility();
    }, 1000);

    setTimeout(() => {
      this.testLocationSearch();
    }, 2000);
  }
}

// Expose globally in development
if (process.env.NODE_ENV === 'development') {
  (window as any).WidgetTest = WidgetTest;
  console.log('🧪 Widget test utilities available: WidgetTest.runAllTests()');
}
