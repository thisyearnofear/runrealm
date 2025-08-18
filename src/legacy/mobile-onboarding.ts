// Mobile-First Onboarding Experience
export class MobileOnboarding {
  private currentStep = 0;
  private totalSteps = 5;
  private isMobile: boolean;

  constructor() {
    this.isMobile = window.innerWidth <= 768;
    this.init();
  }

  private init(): void {
    // Check if user has seen onboarding
    const hasSeenOnboarding = localStorage.getItem('runmap_onboarding_complete');
    
    if (!hasSeenOnboarding) {
      setTimeout(() => {
        this.startOnboarding();
      }, 1500); // Give time for app to load
    } else {
      // Show quick tip for returning users
      this.showQuickTip();
    }
  }

  private startOnboarding(): void {
    this.createOnboardingOverlay();
    this.showStep(0);
  }

  private createOnboardingOverlay(): void {
    const overlay = document.createElement('div');
    overlay.id = 'onboarding-overlay';
    overlay.className = 'onboarding-overlay';
    
    overlay.innerHTML = `
      <div class="onboarding-content">
        <div class="onboarding-header">
          <div class="progress-bar">
            <div class="progress-fill" id="progress-fill"></div>
          </div>
          <button class="skip-btn" id="skip-onboarding">Skip</button>
        </div>
        <div class="onboarding-step" id="onboarding-step">
          <!-- Step content will be inserted here -->
        </div>
        <div class="onboarding-footer">
          <button class="btn-secondary" id="prev-step" style="display: none;">Previous</button>
          <div class="step-indicators" id="step-indicators">
            <!-- Dots will be inserted here -->
          </div>
          <button class="btn-primary" id="next-step">Next</button>
        </div>
      </div>
    `;

    // Add styles
    const style = document.createElement('style');
    style.textContent = `
      .onboarding-overlay {
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0, 0, 0, 0.9);
        z-index: 10000;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 20px;
        animation: fadeIn 0.5s ease-out;
      }

      .onboarding-content {
        background: white;
        border-radius: 20px;
        width: 100%;
        max-width: 400px;
        max-height: 90vh;
        overflow: hidden;
        display: flex;
        flex-direction: column;
        animation: slideUp 0.5s ease-out;
      }

      .onboarding-header {
        padding: 20px 20px 0;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }

      .progress-bar {
        flex: 1;
        height: 4px;
        background: #e0e0e0;
        border-radius: 2px;
        margin-right: 16px;
        overflow: hidden;
      }

      .progress-fill {
        height: 100%;
        background: var(--primary-green);
        border-radius: 2px;
        transition: width 0.3s ease;
        width: 0%;
      }

      .skip-btn {
        background: none;
        border: none;
        color: #666;
        font-size: 14px;
        cursor: pointer;
        padding: 8px;
      }

      .onboarding-step {
        padding: 20px;
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        min-height: 300px;
        justify-content: center;
      }

      .step-icon {
        font-size: 64px;
        margin-bottom: 20px;
        animation: bounce 2s infinite;
      }

      .step-title {
        font-size: 24px;
        font-weight: 600;
        color: var(--primary-green);
        margin-bottom: 12px;
      }

      .step-description {
        font-size: 16px;
        color: #666;
        line-height: 1.5;
        margin-bottom: 20px;
      }

      .step-demo {
        background: #f8f8f8;
        border-radius: 12px;
        padding: 16px;
        margin: 16px 0;
        width: 100%;
      }

      .demo-gesture {
        display: flex;
        align-items: center;
        gap: 12px;
        padding: 8px 0;
        font-size: 14px;
      }

      .gesture-icon {
        font-size: 20px;
        width: 32px;
        text-align: center;
      }

      .onboarding-footer {
        padding: 20px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        border-top: 1px solid #f0f0f0;
      }

      .step-indicators {
        display: flex;
        gap: 8px;
      }

      .step-dot {
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: #ddd;
        transition: background 0.3s ease;
      }

      .step-dot.active {
        background: var(--primary-green);
      }

      .btn-primary, .btn-secondary {
        padding: 12px 24px;
        border: none;
        border-radius: 8px;
        font-weight: 500;
        cursor: pointer;
        transition: all 0.2s ease;
        min-width: 80px;
      }

      .btn-primary {
        background: var(--primary-green);
        color: white;
      }

      .btn-primary:hover {
        background: var(--primary-green-hover);
      }

      .btn-secondary {
        background: #f5f5f5;
        color: #666;
      }

      .btn-secondary:hover {
        background: #e0e0e0;
      }

      @keyframes fadeIn {
        from { opacity: 0; }
        to { opacity: 1; }
      }

      @keyframes slideUp {
        from {
          opacity: 0;
          transform: translateY(50px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      @keyframes bounce {
        0%, 20%, 50%, 80%, 100% {
          transform: translateY(0);
        }
        40% {
          transform: translateY(-10px);
        }
        60% {
          transform: translateY(-5px);
        }
      }

      /* Mobile-specific adjustments */
      @media (max-width: 480px) {
        .onboarding-content {
          margin: 10px;
          max-height: 95vh;
        }

        .step-icon {
          font-size: 48px;
        }

        .step-title {
          font-size: 20px;
        }

        .step-description {
          font-size: 14px;
        }
      }
    `;
    document.head.appendChild(style);

    document.body.appendChild(overlay);

    // Add event listeners
    this.setupOnboardingEvents();
  }

  private setupOnboardingEvents(): void {
    document.getElementById('next-step')?.addEventListener('click', () => {
      this.nextStep();
    });

    document.getElementById('prev-step')?.addEventListener('click', () => {
      this.prevStep();
    });

    document.getElementById('skip-onboarding')?.addEventListener('click', () => {
      this.completeOnboarding();
    });
  }

  private showStep(step: number): void {
    this.currentStep = step;
    this.updateProgress();
    this.updateStepIndicators();
    this.updateButtons();

    const stepContent = this.getStepContent(step);
    const stepElement = document.getElementById('onboarding-step');
    
    if (stepElement) {
      stepElement.innerHTML = stepContent;
    }

    // Add step-specific interactions
    this.addStepInteractions(step);
  }

  private getStepContent(step: number): string {
    const steps = [
      {
        icon: '🏃‍♀️',
        title: 'Welcome to RunMap!',
        description: 'Plan your perfect running route with just a few taps. Let\'s get you started!',
        demo: ''
      },
      {
        icon: '📍',
        title: 'Tap to Add Points',
        description: this.isMobile ? 
          'Tap anywhere on the map to add waypoints to your route.' :
          'Click anywhere on the map to add waypoints to your route.',
        demo: `
          <div class="step-demo">
            <div class="demo-gesture">
              <span class="gesture-icon">👆</span>
              <span>Single tap to add a point</span>
            </div>
            ${this.isMobile ? `
            <div class="demo-gesture">
              <span class="gesture-icon">👆👆</span>
              <span>Long press for more options</span>
            </div>
            ` : ''}
          </div>
        `
      },
      {
        icon: '📏',
        title: 'Track Your Distance',
        description: 'See your total distance in real-time. Tap the distance to switch between miles and kilometers.',
        demo: `
          <div class="step-demo">
            <div class="demo-gesture">
              <span class="gesture-icon">📊</span>
              <span>Distance updates automatically</span>
            </div>
            <div class="demo-gesture">
              <span class="gesture-icon">🔄</span>
              <span>Tap to toggle units</span>
            </div>
          </div>
        `
      },
      {
        icon: this.isMobile ? '📱' : '⚙️',
        title: this.isMobile ? 'Mobile Gestures' : 'Settings & Controls',
        description: this.isMobile ? 
          'Use intuitive gestures to navigate and control the app.' :
          'Access settings, save routes, and customize your experience.',
        demo: this.isMobile ? `
          <div class="step-demo">
            <div class="demo-gesture">
              <span class="gesture-icon">👈</span>
              <span>Swipe right to open settings</span>
            </div>
            <div class="demo-gesture">
              <span class="gesture-icon">👆</span>
              <span>Swipe up to toggle units</span>
            </div>
            <div class="demo-gesture">
              <span class="gesture-icon">👇</span>
              <span>Swipe down for quick help</span>
            </div>
          </div>
        ` : `
          <div class="step-demo">
            <div class="demo-gesture">
              <span class="gesture-icon">⚙️</span>
              <span>Menu for settings</span>
            </div>
            <div class="demo-gesture">
              <span class="gesture-icon">💾</span>
              <span>Save and load routes</span>
            </div>
          </div>
        `
      },
      {
        icon: '🎉',
        title: 'You\'re Ready!',
        description: 'Start planning your route and enjoy your run. Remember, you can always access help from the settings menu.',
        demo: `
          <div class="step-demo">
            <div class="demo-gesture">
              <span class="gesture-icon">🏃‍♀️</span>
              <span>Happy running!</span>
            </div>
          </div>
        `
      }
    ];

    const stepData = steps[step];
    return `
      <div class="step-icon">${stepData.icon}</div>
      <div class="step-title">${stepData.title}</div>
      <div class="step-description">${stepData.description}</div>
      ${stepData.demo}
    `;
  }

  private addStepInteractions(step: number): void {
    // Add step-specific interactive elements
    switch (step) {
      case 1:
        // Highlight map area
        this.highlightMapArea();
        break;
      case 2:
        // Highlight distance display
        this.highlightElement('#run-length-container');
        break;
      case 3:
        // Highlight controls
        if (this.isMobile) {
          this.highlightElement('.fab-container');
        } else {
          this.highlightElement('#menu-container');
        }
        break;
    }
  }

  private highlightMapArea(): void {
    const mapContainer = document.getElementById('mapbox-container');
    if (mapContainer) {
      mapContainer.style.boxShadow = 'inset 0 0 0 4px rgba(0, 189, 0, 0.5)';
      mapContainer.style.transition = 'box-shadow 0.3s ease';
      
      setTimeout(() => {
        mapContainer.style.boxShadow = '';
      }, 3000);
    }
  }

  private highlightElement(selector: string): void {
    const element = document.querySelector(selector) as HTMLElement;
    if (element) {
      element.style.boxShadow = '0 0 0 4px rgba(0, 189, 0, 0.5)';
      element.style.borderRadius = '12px';
      element.style.transition = 'all 0.3s ease';
      
      setTimeout(() => {
        element.style.boxShadow = '';
        element.style.borderRadius = '';
      }, 3000);
    }
  }

  private updateProgress(): void {
    const progressFill = document.getElementById('progress-fill');
    if (progressFill) {
      const progress = ((this.currentStep + 1) / this.totalSteps) * 100;
      progressFill.style.width = `${progress}%`;
    }
  }

  private updateStepIndicators(): void {
    const indicatorsContainer = document.getElementById('step-indicators');
    if (indicatorsContainer) {
      indicatorsContainer.innerHTML = '';
      
      for (let i = 0; i < this.totalSteps; i++) {
        const dot = document.createElement('div');
        dot.className = `step-dot ${i === this.currentStep ? 'active' : ''}`;
        indicatorsContainer.appendChild(dot);
      }
    }
  }

  private updateButtons(): void {
    const prevBtn = document.getElementById('prev-step') as HTMLButtonElement;
    const nextBtn = document.getElementById('next-step') as HTMLButtonElement;
    
    if (prevBtn) {
      prevBtn.style.display = this.currentStep > 0 ? 'block' : 'none';
    }
    
    if (nextBtn) {
      nextBtn.textContent = this.currentStep === this.totalSteps - 1 ? 'Get Started!' : 'Next';
    }
  }

  private nextStep(): void {
    if (this.currentStep < this.totalSteps - 1) {
      this.showStep(this.currentStep + 1);
    } else {
      this.completeOnboarding();
    }
  }

  private prevStep(): void {
    if (this.currentStep > 0) {
      this.showStep(this.currentStep - 1);
    }
  }

  private completeOnboarding(): void {
    localStorage.setItem('runmap_onboarding_complete', 'true');
    
    const overlay = document.getElementById('onboarding-overlay');
    if (overlay) {
      overlay.style.animation = 'fadeOut 0.3s ease-out';
      setTimeout(() => {
        overlay.remove();
      }, 300);
    }

    // Show completion message
    setTimeout(() => {
      (window as any).enhancedToast?.success('Welcome to RunMap! Start planning your route.', 4000);
    }, 500);
  }

  private showQuickTip(): void {
    // Show a quick tip for returning users
    const tips = [
      "💡 Tip: Long press on the map for quick actions!",
      "🎯 Pro tip: Swipe right to access settings quickly",
      "⚡ Quick tip: Tap the distance to toggle units",
      "🗺️ Tip: Try different map styles in settings"
    ];

    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    
    setTimeout(() => {
      (window as any).enhancedToast?.info(randomTip, 5000);
    }, 2000);
  }
}

// Add fadeOut animation
const fadeOutStyle = document.createElement('style');
fadeOutStyle.textContent = `
  @keyframes fadeOut {
    from { opacity: 1; }
    to { opacity: 0; }
  }
`;
document.head.appendChild(fadeOutStyle);