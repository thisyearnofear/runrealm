/**
 * Widget Debug Utility
 * Helps debug widget system issues by logging state and DOM
 */

export class WidgetDebug {
  static logWidgetState(widgetId: string): void {
    console.group(`🔍 Widget Debug: ${widgetId}`);

    const element = document.getElementById(`widget-${widgetId}`);
    if (!element) {
      console.error('❌ Widget element not found');
      console.groupEnd();
      return;
    }

    // Log classes
    console.log('📋 Classes:', Array.from(element.classList));

    // Log computed styles for critical properties
    const computedStyle = window.getComputedStyle(element);
    console.log('🎨 Computed Styles:');
    console.log('  - max-height:', computedStyle.maxHeight);
    console.log('  - overflow:', computedStyle.overflow);
    console.log('  - transition:', computedStyle.transition);

    // Log content element
    const content = element.querySelector('.widget-content');
    if (content) {
      const contentStyle = window.getComputedStyle(content);
      console.log('📝 Content Styles:');
      console.log('  - display:', contentStyle.display);
      console.log('  - opacity:', contentStyle.opacity);
      console.log('  - pointer-events:', contentStyle.pointerEvents);
    }

    // Log header ARIA
    const header = element.querySelector('.widget-header');
    if (header) {
      console.log('♿ ARIA:');
      console.log('  - aria-expanded:', header.getAttribute('aria-expanded'));
      console.log('  - tabindex:', header.getAttribute('tabindex'));
    }

    console.groupEnd();
  }

  static logAllWidgets(): void {
    console.group('🔍 All Widget States');
    const widgets = document.querySelectorAll('.widget');
    widgets.forEach((widget, index) => {
      const id = widget.id.replace('widget-', '');
      console.log(`${index + 1}. ${id}:`, {
        classes: Array.from(widget.classList),
        maxHeight: window.getComputedStyle(widget).maxHeight,
        contentDisplay: window.getComputedStyle(widget.querySelector('.widget-content') || widget)
          .display,
      });
    });
    console.groupEnd();
  }

  static testWidgetToggle(widgetId: string): void {
    console.log(`🧪 Testing widget toggle: ${widgetId}`);

    const element = document.getElementById(`widget-${widgetId}`);
    if (!element) {
      console.error('❌ Widget not found');
      return;
    }

    const header = element.querySelector('.widget-header') as HTMLElement;
    if (!header) {
      console.error('❌ Widget header not found');
      return;
    }

    console.log('⏱️ Before toggle:');
    WidgetDebug.logWidgetState(widgetId);

    // Simulate click
    header.click();

    // Log after a delay to see the result
    setTimeout(() => {
      console.log('⏱️ After toggle:');
      WidgetDebug.logWidgetState(widgetId);
    }, 400);
  }
}

// Make it globally available for console debugging
(window as any).WidgetDebug = WidgetDebug;
