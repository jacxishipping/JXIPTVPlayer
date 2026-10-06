import { PrismaClient } from '@prisma/client'
import { resolveDatabaseUrl } from './db-path.js'

const resolvedDatabaseUrl = resolveDatabaseUrl(process.env.DATABASE_URL)
if (process.env.DATABASE_URL !== resolvedDatabaseUrl) {
  process.env.DATABASE_URL = resolvedDatabaseUrl
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: ['query'],
    datasourceUrl: resolvedDatabaseUrl,
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = db