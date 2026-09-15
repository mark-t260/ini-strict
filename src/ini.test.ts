import { parseIni, printIni, IniDocument } from "./ini"
import { IniParseError } from "./errors"

/**
 * No test runner is wired up yet (zero dependencies means no jest/vitest,
 * and there's no @types/node here to type-check against node:test). This
 * is a plain assertion script: it throws at the end if anything failed,
 * so `node dist/ini.test.js` exits non-zero on a regression and silently
 * exits 0 when everything passes.
 */

interface TestResult {
  name: string
  error: string | null
}

const results: TestResult[] = []

function test(name: string, fn: () => void): void {
  try {
    fn()
    results.push({ name, error: null })
  } catch (err) {
    results.push({ name, error: err instanceof Error ? err.message : String(err) })
  }
}

function assertEqual<T>(actual: T, expected: T, message: string): void {
  const a = JSON.stringify(actual)
  const b = JSON.stringify(expected)
  if (a !== b) {
    throw new Error(`${message}: expected ${b}, got ${a}`)
  }
}

function assertThrows(fn: () => void, check: (err: unknown) => void, message: string): void {
  try {
    fn()
  } catch (err) {
    check(err)
    return
  }
  throw new Error(`${message}: expected an error to be thrown`)
}

function assertIniError(err: unknown, line: number, column: number, messageSubstring: string): void {
  if (!(err instanceof IniParseError)) {
    throw new Error(`expected an IniParseError, got ${err instanceof Error ? err.constructor.name : String(err)}`)
  }
  if (err.line !== line || err.column !== column) {
    throw new Error(`expected error at line ${line}, column ${column}, got line ${err.line}, column ${err.column}`)
  }
  if (!err.message.includes(messageSubstring)) {
    throw new Error(`expected error message to include '${messageSubstring}', got '${err.message}'`)
  }
}

test("parses globals and sections in order", () => {
  const source = ["host = localhost", "port = 5432", "", "[credentials]", 'username = "app_user"', "password = secret"].join(
    "\n",
  )
  const doc = parseIni(source)
  assertEqual<IniDocument>(
    doc,
    {
      globals: [
        { key: "host", value: "localhost" },
        { key: "port", value: "5432" },
      ],
      sections: [
        {
          name: "credentials",
          entries: [
            { key: "username", value: "app_user" },
            { key: "password", value: "secret" },
          ],
        },
      ],
    },
    "parsed document",
  )
})

test("comments are stripped except inside quotes or mid-word", () => {
  const source = [
    "; leading comment",
    'key = "value ; not a comment" # trailing comment',
    "# another comment",
    "other = bare#nospace",
  ].join("\n")
  const doc = parseIni(source)
  assertEqual<IniDocument>(
    doc,
    {
      globals: [
        { key: "key", value: "value ; not a comment" },
        { key: "other", value: "bare#nospace" },
      ],
      sections: [],
    },
    "parsed document",
  )
})

test("rejects a line with no separator", () => {
  assertThrows(
    () => parseIni("justakey"),
    (err) => assertIniError(err, 1, 9, "expected '=' or ':' to separate key and value"),
    "missing separator",
  )
})

test("accepts ':' as an alternate key/value separator", () => {
  const doc = parseIni("host: localhost\n[db]\nport: 5432")
  assertEqual<IniDocument>(
    doc,
    {
      globals: [{ key: "host", value: "localhost" }],
      sections: [{ name: "db", entries: [{ key: "port", value: "5432" }] }],
    },
    "parsed document",
  )
})

test("uses whichever of '=' or ':' comes first as the separator", () => {
  const doc = parseIni("url = http://example.com")
  assertEqual<IniDocument>(doc, { globals: [{ key: "url", value: "http://example.com" }], sections: [] }, "parsed document")
})

test("rejects an empty key", () => {
  assertThrows(
    () => parseIni(" = value"),
    (err) => assertIniError(err, 1, 2, "key cannot be empty"),
    "empty key",
  )
})

test("rejects an unterminated section header", () => {
  assertThrows(
    () => parseIni("[section"),
    (err) => assertIniError(err, 1, 1, "unterminated section header"),
    "unterminated section header",
  )
})

test("rejects an empty section name", () => {
  assertThrows(
    () => parseIni("[]"),
    (err) => assertIniError(err, 1, 2, "section name cannot be empty"),
    "empty section name",
  )
})

test("rejects trailing text after a section header", () => {
  assertThrows(
    () => parseIni("[a] extra"),
    (err) => assertIniError(err, 1, 4, "unexpected text 'extra' after section header"),
    "trailing text after section header",
  )
})

test("rejects a duplicate top-level key", () => {
  assertThrows(
    () => parseIni("a = 1\na = 2"),
    (err) => assertIniError(err, 2, 1, "duplicate key 'a' in the top level"),
    "duplicate top-level key",
  )
})

test("rejects a duplicate key within a section", () => {
  assertThrows(
    () => parseIni("[db]\nhost = a\nhost = b"),
    (err) => assertIniError(err, 3, 1, "duplicate key 'host' in section '[db]'"),
    "duplicate key in section",
  )
})

test("rejects a duplicate section", () => {
  assertThrows(
    () => parseIni("[x]\na = 1\n[x]"),
    (err) => assertIniError(err, 3, 1, "duplicate section '[x]'"),
    "duplicate section",
  )
})

test("rejects an unterminated quoted value", () => {
  assertThrows(
    () => parseIni('key = "abc'),
    (err) => assertIniError(err, 1, 7, "unterminated quoted value"),
    "unterminated quoted value",
  )
})

test("rejects trailing text after a quoted value", () => {
  assertThrows(
    () => parseIni('key = "abc" extra'),
    (err) => assertIniError(err, 1, 12, "unexpected text 'extra' after quoted value"),
    "trailing text after quoted value",
  )
})

test("rejects an unknown escape sequence", () => {
  assertThrows(
    () => parseIni('key = "a\\qb"'),
    (err) => assertIniError(err, 1, 9, "unknown escape sequence '\\q'"),
    "unknown escape sequence",
  )
})

test("rejects an unterminated escape sequence", () => {
  assertThrows(
    () => parseIni('key = "ab\\'),
    (err) => assertIniError(err, 1, 10, "unterminated escape sequence in quoted value"),
    "unterminated escape sequence",
  )
})

test("formats a compiler-style error message with source excerpt and caret", () => {
  const source = ["[server]", "host = 0.0.0.0", "port =", "timeout = 30", "port = 60"].join("\n")
  assertThrows(
    () => parseIni(source),
    (err) => {
      if (!(err instanceof IniParseError)) throw new Error("expected an IniParseError")
      assertEqual(
        err.message,
        "duplicate key 'port' in section '[server]' at line 5, column 1\n5 | port = 60\n  | ^",
        "formatted message",
      )
    },
    "formatted error message",
  )
})

test("printIni lays out globals, a blank line, then each section", () => {
  const doc: IniDocument = {
    globals: [{ key: "a", value: "1" }],
    sections: [{ name: "s", entries: [{ key: "b", value: "2" }] }],
  }
  assertEqual(printIni(doc), "a = 1\n\n[s]\nb = 2\n", "printed document")
})

test("printIni quotes only values that would otherwise change meaning", () => {
  const doc: IniDocument = {
    globals: [
      { key: "empty", value: "" },
      { key: "spaced", value: " x " },
      { key: "hash", value: "a#b" },
      { key: "tick", value: "'lead" },
      { key: "plain", value: "plain" },
    ],
    sections: [],
  }
  assertEqual(
    printIni(doc),
    ['empty = ""', 'spaced = " x "', 'hash = "a#b"', 'tick = "\'lead"', "plain = plain", ""].join("\n"),
    "printed document",
  )
})

test("printIni output parses back to an equal document", () => {
  const doc: IniDocument = {
    globals: [
      { key: "a", value: "plain" },
      { key: "b", value: "" },
      { key: "c", value: " spaced " },
      { key: "d", value: 'has"quote' },
      { key: "e", value: "line1\nline2" },
    ],
    sections: [{ name: "sec", entries: [{ key: "f", value: "tab\there" }] }],
  }
  const roundTripped = parseIni(printIni(doc))
  assertEqual(roundTripped, doc, "round-tripped document")
})

const failed = results.filter((r) => r.error !== null)
if (failed.length > 0) {
  throw new Error(
    `${failed.length}/${results.length} ini tests failed:\n` + failed.map((f) => `  ${f.name}: ${f.error}`).join("\n"),
  )
}
