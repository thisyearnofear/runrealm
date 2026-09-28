/**
 * The ledger store seam.
 *
 * Phase 3 exists because persistence was welded to `fs`. These tests cover
 * the three things that seam has to get right, and one of them is the
 * failure path: a store that throws once must keep working afterwards,
 * because a wedged queue turns a single disk error into a permanently
 * memory-only oracle — a failure nobody would ever notice.
 *
 * Run: node --test server/__tests__/
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createFileStore, createMemoryStore, createQueuedStore } = require('../ledger-store');

function tempPath(suffix = 'ledger.json') {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rr-store-')), suffix);
}

describe('createMemoryStore', () => {
  test('starts empty and round-trips', async () => {
    const store = createMemoryStore();
    assert.deepEqual(await store.load(), []);
    await store.save([{ id: 'a' }]);
    assert.deepEqual(await store.load(), [{ id: 'a' }]);
  });

  test('hands out copies, so a caller mutating a row cannot edit the store', async () => {
    const store = createMemoryStore([{ id: 'a', label: 'before' }]);
    const rows = await store.load();
    rows[0].label = 'after';
    assert.equal((await store.load())[0].label, 'before');
  });

  test('seeds from an initial list', async () => {
    const store = createMemoryStore([{ id: 'seeded' }]);
    assert.deepEqual(
      (await store.load()).map((r) => r.id),
      ['seeded']
    );
  });
});

describe('createFileStore', () => {
  test('returns empty for a file that does not exist yet', async () => {
    // ENOENT is the normal first run, not an error to shout about.
    assert.deepEqual(await createFileStore(tempPath()).load(), []);
  });

  test('creates missing parent directories on save', async () => {
    const filePath = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), 'rr-store-')),
      'nested',
      'deeper',
      'ledger.json'
    );
    const store = createFileStore(filePath);
    await store.save([{ id: 'a' }]);
    assert.deepEqual(JSON.parse(fs.readFileSync(filePath, 'utf8')).entries, [{ id: 'a' }]);
  });

  test('accepts both the wrapped and bare array shapes', async () => {
    const filePath = tempPath();
    fs.writeFileSync(filePath, JSON.stringify([{ id: 'bare' }]));
    assert.equal((await createFileStore(filePath).load())[0].id, 'bare');

    fs.writeFileSync(filePath, JSON.stringify({ version: 1, entries: [{ id: 'wrapped' }] }));
    assert.equal((await createFileStore(filePath).load())[0].id, 'wrapped');
  });

  test('returns empty for unparseable or unrecognized content', async () => {
    const filePath = tempPath();
    fs.writeFileSync(filePath, '{ not json');
    assert.deepEqual(await createFileStore(filePath).load(), []);

    fs.writeFileSync(filePath, JSON.stringify({ version: 1, entries: 'nope' }));
    assert.deepEqual(await createFileStore(filePath).load(), []);
  });

  test('leaves no temp file behind', async () => {
    // The write is temp-file + rename. A surviving `.tmp` is the signal
    // that a write was interrupted, and a pile of them means it keeps
    // happening.
    const filePath = tempPath();
    await createFileStore(filePath).save([{ id: 'a' }]);
    assert.equal(fs.existsSync(`${filePath}.tmp`), false);
  });

  test('rejects when the path is unwritable, rather than swallowing', async () => {
    // The queue needs to see the failure to record it; a store that
    // silently succeeded would make the ledger look persisted when it is not.
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rr-store-dir-'));
    await assert.rejects(() => createFileStore(directory).save([{ id: 'a' }]));
  });
});

describe('createQueuedStore', () => {
  test('rejects an inner store that is not a store', () => {
    assert.throws(() => createQueuedStore({}), /load\(\) and save/);
    assert.throws(() => createQueuedStore(null), /load\(\) and save/);
  });

  test('passes writes through', async () => {
    const inner = createMemoryStore();
    const store = createQueuedStore(inner);
    await store.save([{ id: 'a' }]);
    assert.deepEqual(
      (await store.load()).map((r) => r.id),
      ['a']
    );
  });

  test('collapses a burst to the newest ledger, not every intermediate one', async () => {
    // A whole-ledger store rewrites everything; 50 signatures in a tick
    // should cost one write, not 50.
    const inner = createMemoryStore();
    const store = createQueuedStore(inner);
    for (let i = 0; i < 50; i++) {
      void store.save([...Array.from({ length: i + 1 }, (_, n) => ({ id: `e${n}` }))]);
    }
    await store.flush();
    assert.equal((await inner.load()).length, 50);
  });

  test('keeps draining after a failure', async () => {
    // The whole reason this wrapper exists. One rejected write must not
    // leave `draining` stuck true, which would silently stop persisting
    // every entry after the first disk error.
    let fail = true;
    const inner = {
      load: async () => [],
      save: async () => {
        if (fail) throw new Error('disk on fire');
      },
    };
    const store = createQueuedStore(inner);

    await store.save([{ id: 'lost' }]);
    assert.equal(store._state().failures, 1);
    assert.equal(store._state().draining, false);

    fail = false;
    await store.save([{ id: 'kept' }]);
    await store.flush();
    assert.equal(store._state().draining, false);
    assert.equal(store._state().failures, 1, 'the earlier failure is still counted');
  });

  test('a rejected save does not reject the caller', async () => {
    // The ledger calls `store.save` fire-and-forget; an unhandled rejection
    // here would take the process down mid-signature.
    const store = createQueuedStore({
      load: async () => [],
      save: async () => {
        throw new Error('nope');
      },
    });
    await store.save([{ id: 'a' }]);
    assert.equal(store._state().failures, 1);
  });

  test('flush resolves when nothing is queued', async () => {
    await createQueuedStore(createMemoryStore()).flush();
  });
});
