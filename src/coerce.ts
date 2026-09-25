import { IniEntry } from "./ini"

/**
 * Type coercion helpers over the string values parseIni produces. These
 * operate on a plain IniEntry[] so they work the same way against
 * doc.globals or any section's entries.
 *
 * Missing keys fall back to the given default, or undefined if none was
 * given. A key that IS present but doesn't parse as the requested type
 * throws rather than silently returning the fallback - a malformed value
 * is a different problem than an absent one, and conflating them would
 * undo the point of validating the file in the first place.
 */

export function findEntry(entries: IniEntry[], key: string): IniEntry | undefined {
  return entries.find((entry) => entry.key === key)
}

export function getString(entries: IniEntry[], key: string): string | undefined
export function getString(entries: IniEntry[], key: string, fallback: string): string
export function getString(entries: IniEntry[], key: string, fallback?: string): string | undefined {
  return findEntry(entries, key)?.value ?? fallback
}

const TRUE_VALUES = new Set(["true", "yes", "on", "1"])
const FALSE_VALUES = new Set(["false", "no", "off", "0"])

export function getBoolean(entries: IniEntry[], key: string): boolean | undefined
export function getBoolean(entries: IniEntry[], key: string, fallback: boolean): boolean
export function getBoolean(entries: IniEntry[], key: string, fallback?: boolean): boolean | undefined {
  const entry = findEntry(entries, key)
  if (!entry) return fallback

  const normalized = entry.value.trim().toLowerCase()
  if (TRUE_VALUES.has(normalized)) return true
  if (FALSE_VALUES.has(normalized)) return false
  throw new Error(
    `key '${key}' has value '${entry.value}', which is not a recognized boolean ` +
      "(expected one of: true/false, yes/no, on/off, 1/0)",
  )
}

export function getNumber(entries: IniEntry[], key: string): number | undefined
export function getNumber(entries: IniEntry[], key: string, fallback: number): number
export function getNumber(entries: IniEntry[], key: string, fallback?: number): number | undefined {
  const entry = findEntry(entries, key)
  if (!entry) return fallback

  const trimmed = entry.value.trim()
  const parsed = Number(trimmed)
  if (trimmed === "" || Number.isNaN(parsed)) {
    throw new Error(`key '${key}' has value '${entry.value}', which is not a valid number`)
  }
  return parsed
}
