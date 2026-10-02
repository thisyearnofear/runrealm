/**
 * @jest-environment jsdom
 */
import { DEVICE_DATA_KEYS, deviceDataBytes, eraseDeviceData, listDeviceData } from '../device-data';

describe('device data', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('reports nothing when the app holds nothing', () => {
    expect(listDeviceData()).toEqual([]);
    expect(deviceDataBytes()).toBe(0);
  });

  it('lists only keys the app owns, with a description for each', () => {
    localStorage.setItem('runrealm-run-history-v1', '[]');
    localStorage.setItem('someone-elses-key', 'keep me');
    const found = listDeviceData();

    expect(found.map((e) => e.key)).toEqual(['runrealm-run-history-v1']);
    expect(found[0].description).not.toBe('');
    expect(found[0].bytes).toBe(2);
  });

  it('never lists a key outside its own manifest', () => {
    localStorage.setItem('unrelated-third-party', 'x');
    expect(listDeviceData().some((e) => e.key === 'unrelated-third-party')).toBe(false);
  });

  it('erases app data and reports what went', () => {
    localStorage.setItem('runrealm-run-history-v1', '[]');
    localStorage.setItem('user-analytics', '[{"a":1}]');

    const removed = eraseDeviceData();
    expect(removed.sort()).toEqual(['runrealm-run-history-v1', 'user-analytics']);
    expect(listDeviceData()).toEqual([]);
  });

  it('leaves everything it does not own untouched', () => {
    localStorage.setItem('unrelated-third-party', 'keep me');
    localStorage.setItem('runrealm-run-history-v1', '[]');

    eraseDeviceData();

    expect(localStorage.getItem('unrelated-third-party')).toBe('keep me');
  });

  it('does not empty storage wholesale — a shared origin is not ours to clear', () => {
    // If this ever regresses to localStorage.clear(), a user with another app
    // on the same origin loses that app's state without being asked.
    localStorage.setItem('someone-elses-key', 'keep me');
    localStorage.setItem('another-app', 'keep me too');

    eraseDeviceData();

    expect(localStorage.getItem('someone-elses-key')).toBe('keep me');
    expect(localStorage.getItem('another-app')).toBe('keep me too');
  });

  it('reports a key already gone as not removed', () => {
    expect(eraseDeviceData()).toEqual([]);
  });

  it('covers the keys that actually hold personal data', () => {
    // If a new store is added that holds routes or identity, it belongs here.
    for (const key of ['runrealm-run-history-v1', 'user-analytics', 'runrealm_wallet_address']) {
      expect(DEVICE_DATA_KEYS).toContain(key);
    }
  });
});
