/**
 * ContentGenerator - Generates content for various UI components
 */
export class ContentGenerator {
  /**
   * Create the main user interface
   */
  createMainInterface(): void {
    // Remove old template UI elements that conflict
    this.cleanupOldUI();

    // Header removed - using widget-only interface for better mobile UX
  }

  /**
   * Clean up old conflicting UI elements
   */
  private cleanupOldUI(): void {
    // Remove old game-ui and controls from template
    const oldGameUI = document.querySelector(".game-ui");
    const oldControls = document.querySelector(".controls");

    if (oldGameUI) oldGameUI.remove();
    if (oldControls) oldControls.remove();
  }

  /**
   * Generate territory content based on territory data
   */
  generateTerritoryContent(data: any): string {
    const {
      point,
      totalDistance,
      difficulty = 50,
      estimatedReward = Math.floor(
        (totalDistance || 0) * 0.01 + Math.random() * 20
      ),
      rarity = "Common",
      landmarks = [],
    } = data || {};

    const difficultyLabel =
      difficulty < 33 ? "Easy" : difficulty < 67 ? "Medium" : "Hard";
    const rarityClass = String(rarity).toLowerCase();
    const valueScore = this.calculateTerritoryValue(estimatedReward, difficulty, rarity);
    const valueColor = valueScore > 70 ? '#00ff88' : valueScore > 40 ? '#ffaa00' : '#ff6b6b';

    const landmarksHtml =
      Array.isArray(landmarks) && landmarks.length
        ? `<ul class="widget-list">${landmarks
          .map(
            (l: string) =>
              `<li class="widget-list-item"><span class="widget-list-icon">📍</span><span class="widget-list-content">${l}</span></li>`
          )
          .join("")}</ul>`
        : '<div class="widget-tip">No notable landmarks</div>';

    return `
      <div class="territory-value-header" style="border-left: 4px solid ${valueColor}; padding-left: 8px; margin-bottom: 12px;">
        <div style="color: ${valueColor}; font-weight: bold; font-size: 1.1em;">⭐ ${valueScore} Value Score</div>
        <div style="font-size: 0.85em; opacity: 0.8;">💎 ${rarity} • ⚡ ${estimatedReward} REALM • 🎯 ${difficultyLabel}</div>
      </div>
      <div class="widget-stat">
        <span class="widget-stat-label">Difficulty</span>
        <span class="widget-stat-value">${difficultyLabel}</span>
      </div>
      <div class="widget-stat">
        <span class="widget-stat-label">Est. Reward</span>
        <span class="widget-stat-value">+${estimatedReward} $REALM</span>
      </div>
      <div class="widget-list-title">Features</div>
      <div class="widget-list-item"><span class="widget-list-icon">🏅</span><span class="widget-list-content"><span class="rarity-badge ${rarityClass}">${rarity}</span></span></div>
      ${landmarksHtml}
      <div class="widget-tip">🗺️ Click on the map to preview territories</div>
    `;
  }

  /**
   * Calculate territory value score
   */
  private calculateTerritoryValue(reward: number, difficulty: number, rarity: string): number {
    const rarityMultiplier = { common: 1, rare: 1.5, epic: 2, legendary: 3 }[rarity.toLowerCase()] || 1;
    return Math.min(Math.round((reward * 0.8 + difficulty * 0.4) * rarityMultiplier), 100);
  }

  /**
   * Generate widget content for various contexts
   */
  generateWidgetContent(widgetType: string, data?: any): string {
    switch (widgetType) {
      case 'territory':
        return this.generateTerritoryContent(data);
      // Add more cases as needed
      default:
        return '';
    }
  }
}