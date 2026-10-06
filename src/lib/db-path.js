import fs from 'node:fs';
import path from 'node:path';

export function resolveDatabaseUrl(rawUrl = process.env.DATABASE_URL, cwd = process.cwd()) {
  if (!rawUrl) {
    return `file:${path.resolve(cwd, 'db/custom.db')}`;
  }

  if (!rawUrl.startsWith('file:')) {
    return rawUrl;
  }

  const sqlitePath = rawUrl.slice('file:'.length);

  if (!sqlitePath || path.isAbsolute(sqlitePath)) {
    return `file:${path.resolve(cwd, sqlitePath || 'db/custom.db')}`;
  }

  const candidates = [
    path.resolve(cwd, sqlitePath),
    path.resolve(cwd, 'prisma', sqlitePath),
    path.resolve(cwd, 'db/custom.db'),
    path.resolve(cwd, 'custom.db'),
  ];

  const preferred =
    candidates.find((candidate) => fs.existsSync(candidate)) ||
    candidates.find((candidate) => fs.existsSync(path.dirname(candidate))) ||
    path.resolve(cwd, 'db/custom.db');

  fs.mkdirSync(path.dirname(preferred), { recursive: true });

  return `file:${preferred}`;
}
