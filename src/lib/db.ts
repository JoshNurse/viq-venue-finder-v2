import { PrismaClient } from '@prisma/client'
import path from 'path'

if (!process.env.DATABASE_URL) {
  const dbPath = path.resolve(process.cwd(), 'prisma', 'dev.db')
  process.env.DATABASE_URL = `file:${dbPath}`
}

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma = globalForPrisma.prisma ?? new PrismaClient()

globalForPrisma.prisma = prisma
