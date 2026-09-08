import { IniParseError } from "./errors"

export interface IniEntry {
  key: string
  value: string
}

export interface IniSection {
  name: string
  entries: IniEntry[]
}

export interface IniDocument {
  /** key/value pairs that appear before the first [section] header */
  globals: IniEntry[]
  sections: IniSection[]
}

/**
 * Parses and validates an INI document. Throws IniParseError on the first
 * problem found, with a line and column pointing at it.
 *
 * Grammar, roughly:
 *   line       := section | entry | comment | blank
 *   section    := "[" name "]"
 *   entry      := key "=" value
 *   value      := bareword | quoted-string
 *   comment    := (";" | "#") anything, either alone on a line or preceded
 *                 by whitespace after real content
 *
 * Duplicate section names and duplicate keys within the same section (or
 * within the global scope) are rejected rather than silently merged, since
 * a validating parser should surface that ambiguity instead of guessing.
 */
export function parseIni(source: string): IniDocument {
  const lines = source.split(/\r\n|\r|\n/)
  const doc: IniDocument = { globals: [], sections: [] }
  const sectionNames = new Set<string>()

  let currentEntries: IniEntry[] = doc.globals
  let currentKeys = new Set<string>()
  let currentSectionName: string | null = null

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1
    const rawLine = lines[i] ?? ""
    const content = stripComment(rawLine)
    const trimmed = content.trim()
    if (trimmed === "") continue

    const leading = content.length - content.trimStart().length

    if (trimmed.startsWith("[")) {
      const closeIndex = content.indexOf("]")
      if (closeIndex === -1) {
        throw new IniParseError("unterminated section header, missing ']'", lineNumber, leading + 1, rawLine)
      }
      const name = content.slice(leading + 1, closeIndex).trim()
      if (name === "") {
        throw new IniParseError("section name cannot be empty", lineNumber, leading + 2, rawLine)
      }
      const trailing = content.slice(closeIndex + 1).trim()
      if (trailing !== "") {
        throw new IniParseError(`unexpected text '${trailing}' after section header`, lineNumber, closeIndex + 2, rawLine)
      }
      if (sectionNames.has(name)) {
        throw new IniParseError(`duplicate section '[${name}]'`, lineNumber, leading + 1, rawLine)
      }
      sectionNames.add(name)
      const section: IniSection = { name, entries: [] }
      doc.sections.push(section)
      currentEntries = section.entries
      currentKeys = new Set()
      currentSectionName = name
      continue
    }

    const eqIndex = content.indexOf("=")
    if (eqIndex === -1) {
      throw new IniParseError("expected '=' to separate key and value", lineNumber, content.length + 1, rawLine)
    }

    const rawKey = content.slice(0, eqIndex)
    const key = rawKey.trim()
    if (key === "") {
      throw new IniParseError("key cannot be empty", lineNumber, leading + 1, rawLine)
    }
    const keyColumn = leading + 1

    if (currentKeys.has(key)) {
      const where = currentSectionName ? `in section '[${currentSectionName}]'` : "in the top level"
      throw new IniParseError(`duplicate key '${key}' ${where}`, lineNumber, keyColumn, rawLine)
    }

    const rawValue = content.slice(eqIndex + 1)
    const value = parseValue(rawValue, lineNumber, eqIndex + 2, rawLine)

    currentKeys.add(key)
    currentEntries.push({ key, value })
  }

  return doc
}

/**
 * Strips a trailing comment while respecting quotes, so a ';' or '#'
 * inside a quoted value is not mistaken for a comment marker. A comment
 * marker only counts at the start of the line or when preceded by
 * whitespace, which keeps an unquoted value like "a#b" intact.
 */
function stripComment(line: string): string {
  let inQuote: string | null = null
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuote) {
      if (ch === "\\" && inQuote === '"') {
        i++
        continue
      }
      if (ch === inQuote) inQuote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      inQuote = ch
      continue
    }
    if ((ch === ";" || ch === "#") && (i === 0 || /\s/.test(line[i - 1] ?? ""))) {
      return line.slice(0, i)
    }
  }
  return line
}

function parseValue(rawValue: string, lineNumber: number, baseColumn: number, rawLine: string): string {
  const leadingSpace = rawValue.length - rawValue.trimStart().length
  const text = rawValue.trim()
  if (text === "") return ""

  const quote = text[0]
  if (quote === '"' || quote === "'") {
    const openColumn = baseColumn + leadingSpace
    let result = ""
    let j = 1
    let closed = false
    while (j < text.length) {
      const ch = text[j]
      if (ch === "\\" && quote === '"') {
        const next = text[j + 1]
        if (next === undefined) {
          throw new IniParseError("unterminated escape sequence in quoted value", lineNumber, openColumn + j, rawLine)
        }
        result += unescape(next, lineNumber, openColumn + j, rawLine)
        j += 2
        continue
      }
      if (ch === quote) {
        closed = true
        j += 1
        break
      }
      result += ch
      j += 1
    }
    if (!closed) {
      throw new IniParseError("unterminated quoted value", lineNumber, openColumn, rawLine)
    }
    const rest = text.slice(j).trim()
    if (rest !== "") {
      throw new IniParseError(`unexpected text '${rest}' after quoted value`, lineNumber, openColumn + j, rawLine)
    }
    return result
  }

  return text
}

function unescape(ch: string, lineNumber: number, column: number, rawLine: string): string {
  switch (ch) {
    case '"':
      return '"'
    case "\\":
      return "\\"
    case "n":
      return "\n"
    case "t":
      return "\t"
    case "r":
      return "\r"
    case "0":
      return "\0"
    default:
      throw new IniParseError(`unknown escape sequence '\\${ch}'`, lineNumber, column, rawLine)
  }
}

/**
 * Renders an IniDocument back to text in a canonical layout: one blank
 * line between sections, "key = value" with single spaces, and values
 * quoted only when necessary (empty, has leading/trailing whitespace, or
 * contains a character that would otherwise change how the line parses).
 * This is not a round-trip formatter — comments and original spacing are
 * not preserved, since the document model does not carry them.
 */
export function printIni(doc: IniDocument): string {
  const lines: string[] = []

  for (const entry of doc.globals) {
    lines.push(formatEntry(entry))
  }

  for (const section of doc.sections) {
    if (lines.length > 0) lines.push("")
    lines.push(`[${section.name}]`)
    for (const entry of section.entries) {
      lines.push(formatEntry(entry))
    }
  }

  return lines.join("\n") + "\n"
}

function formatEntry(entry: IniEntry): string {
  return `${entry.key} = ${formatValue(entry.value)}`
}

function formatValue(value: string): string {
  if (needsQuoting(value)) {
    return `"${escapeValue(value)}"`
  }
  return value
}

function needsQuoting(value: string): boolean {
  if (value === "") return true
  if (value !== value.trim()) return true
  if (/["#;\n\r\t\\]/.test(value)) return true
  if (value.startsWith("'")) return true
  return false
}

function escapeValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
}
