/**
 * Tests for PreferenceService per-territory visibility.
 *
 * Protocol-vision axiom 3: privacy by default, disclosure by choice.
 * A missing record must read as `shielded` — absence is a
 * privacy-preserving answer, not missing data.
 *
 * @jest-environment jsdom
 */
import { PreferenceService } from '../preference-service';

describe('PreferenceService territory visibility', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults to shielded when no record exists', () => {
    const prefs = new PreferenceService();
    expect(prefs.getTerritoryVisibility('abc123')).toBe('shielded');
  });

  it('round-trips a public disclosure', () => {
    const prefs = new PreferenceService();
    prefs.saveTerritoryVisibility('abc123', 'public');
    expect(prefs.getTerritoryVisibility('abc123')).toBe('public');
  });

  it('tracks visibility per territory independently', () => {
    const prefs = new PreferenceService();
    prefs.saveTerritoryVisibility('a', 'public');
    prefs.saveTerritoryVisibility('b', 'shielded');
    expect(prefs.getTerritoryVisibility('a')).toBe('public');
    expect(prefs.getTerritoryVisibility('b')).toBe('shielded');
    expect(prefs.getTerritoryVisibility('c')).toBe('shielded');
  });

  it('can re-shield a previously public territory', () => {
    const prefs = new PreferenceService();
    prefs.saveTerritoryVisibility('a', 'public');
    prefs.saveTerritoryVisibility('a', 'shielded');
    expect(prefs.getTerritoryVisibility('a')).toBe('shielded');
  });

  it('falls back to shielded when stored JSON is corrupt', () => {
    localStorage.setItem('runmap-territory_visibility', '{not json');
    const prefs = new PreferenceService();
    expect(prefs.getTerritoryVisibility('a')).toBe('shielded');
  });

  it('persists across service instances (same localStorage)', () => {
    new PreferenceService().saveTerritoryVisibility('a', 'public');
    expect(new PreferenceService().getTerritoryVisibility('a')).toBe('public');
  });
});
