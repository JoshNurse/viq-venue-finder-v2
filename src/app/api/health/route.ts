import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  const cwd = process.cwd();
  const dbPath = path.resolve(cwd, "prisma", "dev.db");
  const dbExists = fs.existsSync(dbPath);

  let venueCount: number | null = null;
  let dbError: string | null = null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    venueCount = await prisma.venue.count();
    clearTimeout(timeout);
  } catch (e: unknown) {
    dbError = e instanceof Error ? e.message : String(e);
  }

  return NextResponse.json({
    status: dbError ? "error" : "ok",
    cwd,
    dbPath,
    dbExists,
    venueCount,
    dbError,
    env: {
      DATABASE_URL: process.env.DATABASE_URL ? "(set)" : "(unset)",
      NODE_ENV: process.env.NODE_ENV,
    },
  });
}
