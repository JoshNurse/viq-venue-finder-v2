import { PrismaClient } from '@prisma/client'
import path from 'path'

// Always use absolute path for SQLite — relative paths break in production
const dbPath = path.resolve(process.cwd(), 'prisma', 'dev.db')
process.env.DATABASE_URL = `file:${dbPath}`

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

globalForPrisma.prisma = prisma
