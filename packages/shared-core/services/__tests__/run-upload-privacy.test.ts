/**
 * Guards the one endpoint that is unauthenticated and served with CORS *.
 *
 * If a raw GPS track ever reaches it again, anyone who can reach the API can
 * read it. This test reads server.js as text rather than booting it, because
 * the property worth protecting is about the code itself: the endpoint must not
 * retain or echo a track, and must not be handed one.
 */
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'server.js'), 'utf8');

describe('/api/runs privacy', () => {
  it('never retains the submitted run object', () => {
    expect(source).not.toMatch(/pendingRuns\.set\([^)]*\{[^}]*\brun\b[^}]*\}\)/);
  });

  it('never echoes a submitted track back to any client', () => {
    const pendingRoute = source.slice(source.indexOf("app.get('/api/runs/pending'"));
    expect(pendingRoute).not.toContain('entry.run');
    expect(pendingRoute).not.toMatch(/\brun\.points\b/);
  });

  it('documents that the endpoint must never accept sensitive data', () => {
    const block = source.slice(0, source.indexOf("app.post('/api/runs'"));
    expect(block).toMatch(/does NOT send the GPS track|unauthenticated/i);
  });

  it('does not put Strava tokens in a redirect URL', () => {
    const callback = source.slice(source.indexOf("app.get('/auth/strava/callback'"));
    expect(callback).not.toMatch(/redirect\([^)]*access_token=/);
    expect(callback).not.toMatch(/redirect\([^)]*refresh_token=/);
  });

  it('redeems the Strava handover exactly once', () => {
    const handover = source.slice(
      source.indexOf("app.post('/api/strava/handover'"),
      source.indexOf("app.get('/auth/strava/callback'")
    );
    expect(handover).toContain('stravaTokenHandover.delete');
  });
});
