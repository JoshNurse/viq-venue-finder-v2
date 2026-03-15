import { NextResponse } from 'next/server'
import { importCsv } from '@/lib/csv-import'
import { CSV_URL } from '@/lib/constants'

export async function POST() {
  try {
    const importId = await importCsv(CSV_URL)
    return NextResponse.json({ success: true, importId })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error instanceof Error ? error.message : 'Import failed' },
      { status: 500 }
    )
  }
}
