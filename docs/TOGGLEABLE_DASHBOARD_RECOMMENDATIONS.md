# Toggleable Dashboard Implementation Recommendations

## 1. Current Toggle Patterns in the Codebase

### CSS-Based Visibility Control
The codebase consistently uses CSS classes for visibility control:
- `.hidden` class to hide elements
- `.visible` class to show elements
- Direct style manipulation for smooth transitions (opacity, visibility, pointer-events)

### Centralized Services
- **VisibilityService**: Centralized management of UI component visibility with event emission
- **WidgetStateService**: Persistent state management for widgets including visibility
- **PreferenceService**: User preference storage using localStorage

### Existing Territory Dashboard
The `TerritoryDashboard` component already implements:
```javascript
show() {
    this.container.classList.remove('hidden');
    this.isVisible = true;
}

hide() {
    this.container.classList.add('hidden');
    this.isVisible = false;
}

toggle() {
    if (this.isVisible) {
        this.hide();
    } else {
        this.show();
    }
}
```

## 2. Technical Requirements for Toggleable Dashboard

### Core Implementation Requirements

1. **CSS Class Management**: Use existing `.hidden` class pattern for consistency
2. **State Persistence**: Integrate with `WidgetStateService` to persist dashboard state
3. **User Preferences**: Store user preference for dashboard visibility using `PreferenceService`
4. **Event Integration**: Emit visibility change events through `EventBus`
5. **Mobile Optimization**: Apply mobile-specific styling via `MobileWidgetService`

### Integration Points with Existing UI Components

1. **Widget System Integration**:
   ```javascript
   // Register dashboard as a widget
   this.widgetStateService.setWidgetState('user-dashboard', {
       position: 'top-right',
       minimized: false,
       visible: true,
       priority: 10
   });
   ```

2. **Visibility Service Integration**:
   ```javascript
   // Sync with centralized visibility management
   this.visibilityService.onVisibilityChange('user-dashboard', (visible) => {
       this.updateDashboardVisibility(visible);
   });
   ```

3. **Main UI Integration**:
   ```javascript
   // Add toggle button to main UI
   <button id="dashboard-toggle" class="widget-button">
       📊 Dashboard
   </button>
   
   // Event handler
   this.domService.delegate(document.body, '#dashboard-toggle', 'click', () => {
       this.toggleDashboard();
   });
   ```

## 3. Mobile-Specific Considerations

### Touch Optimization
- Minimum touch target size of 44px for all interactive elements
- Simplified content presentation in compact mode
- Orientation-aware layout adjustments

### Performance Considerations
- Efficient DOM updates using CSS classes rather than direct style manipulation
- Lazy loading of dashboard content when first shown
- Memory management with proper cleanup on hide

### Content Adaptation
- Consolidation of related information in compact displays
- Hiding of secondary information in compact mode
- Text abbreviation for mobile (e.g., "Settings" → "Settings")

## 4. Implementation Recommendations

### Dashboard Component Structure
```javascript
export class UserDashboard extends BaseService {
    constructor() {
        super();
        this.isVisible = false;
        this.widgetStateService = null;
        this.visibilityService = null;
        this.preferenceService = new PreferenceService();
    }
    
    async initialize(parentElement) {
        this.createContainer(parentElement);
        this.setupEventListeners();
        this.loadPersistedState();
        this.render();
    }
    
    toggle() {
        const newState = !this.isVisible;
        this.setVisibility(newState);
        // Persist state
        this.widgetStateService.setWidgetState('user-dashboard', { visible: newState });
        // Save user preference
        this.preferenceService.saveBooleanPreference('dashboard-visible', newState);
    }
    
    setVisibility(visible) {
        if (visible) {
            this.container.classList.remove('hidden');
            this.isVisible = true;
        } else {
            this.container.classList.add('hidden');
            this.isVisible = false;
        }
        // Notify visibility service
        this.visibilityService.setVisibility('user-dashboard', visible);
        // Emit event
        this.safeEmit('dashboard:visibilityChanged', { visible });
    }
}
```

### CSS Recommendations
```css
.user-dashboard {
    position: fixed;
    top: 10px;
    right: 10px;
    width: 320px;
    max-height: 80vh;
    overflow-y: auto;
    z-index: 1000;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 12px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
    transition: all 0.3s ease;
}

.user-dashboard.hidden {
    opacity: 0;
    visibility: hidden;
    pointer-events: none;
    transform: translateX(20px);
}

/* Mobile-specific styles */
@media (max-width: 768px) {
    .user-dashboard {
        width: calc(100vw - 20px);
        max-height: 70vh;
        top: 5px;
        right: 5px;
    }
    
    .user-dashboard.compact {
        max-height: 50vh;
    }
}
```

### Integration with Main UI
1. Add dashboard toggle to existing widget controls
2. Implement keyboard shortcut (e.g., `D` key) for quick toggle
3. Add dashboard state to user preferences
4. Ensure proper cleanup when dashboard is destroyed

### Performance Optimization
1. Lazy render dashboard content only when first shown
2. Debounce frequent state updates
3. Use CSS transitions for smooth show/hide animations
4. Implement proper cleanup to prevent memory leaks

## 5. Additional Features

### User Preferences
- Remember user's last dashboard visibility state
- Allow users to choose default visibility on app start
- Save dashboard position and size preferences

### Accessibility
- Proper ARIA attributes for screen readers
- Keyboard navigation support
- Focus management when dashboard is shown/hidden

### Analytics
- Track dashboard usage patterns
- Monitor toggle frequency
- Measure user engagement with dashboard content