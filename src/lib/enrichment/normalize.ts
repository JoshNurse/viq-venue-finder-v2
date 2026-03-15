const STRIP_SUFFIXES = [
  /\b(PTY|PROPRIETARY)\s*(LTD|LIMITED)\b/gi,
  /\bINC(ORPORATED)?\b/gi,
  /\bLTD\b/gi,
  /\bLIMITED\b/gi,
  /\bCO-OPERATIVE\b/gi,
  /\bCO-OP\b/gi,
  /\bASSOCIATION\b/gi,
  /\bSOCIETY\b/gi,
]

const STRIP_PREFIXES = [/^THE\s+/i]

export function normalizeVenueName(name: string): string {
  let n = name.trim()
  for (const re of STRIP_SUFFIXES) n = n.replace(re, '')
  for (const re of STRIP_PREFIXES) n = n.replace(re, '')
  return n.replace(/\s{2,}/g, ' ').trim()
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
