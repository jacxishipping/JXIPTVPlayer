import test from 'node:test';
import assert from 'node:assert/strict';

import { resolveDatabaseUrl } from '../src/lib/db-path.js';

test('resolves Prisma SQLite URLs relative to the project schema location', () => {
  const result = resolveDatabaseUrl('file:../db/custom.db', '/workspaces/JXIPTVPlayer');
  assert.equal(result, 'file:/workspaces/JXIPTVPlayer/db/custom.db');
});

test('preserves absolute SQLite file paths', () => {
  const result = resolveDatabaseUrl('file:/tmp/custom.db', '/workspaces/JXIPTVPlayer');
  assert.equal(result, 'file:/tmp/custom.db');
});
