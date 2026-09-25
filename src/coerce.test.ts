import { parseIni } from "./ini"
import { findEntry, getBoolean, getNumber, getString } from "./coerce"

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

function assertThrows(fn: () => void, messageSubstring: string, message: string): void {
  try {
    fn()
  } catch (err) {
    const text = err instanceof Error ? err.message : String(err)
    if (!text.includes(messageSubstring)) {
      throw new Error(`${message}: expected error to include '${messageSubstring}', got '${text}'`)
    }
    return
  }
  throw new Error(`${message}: expected an error to be thrown`)
}

const doc = parseIni(
  [
    "debug = true",
    "retries = 3",
    "name = worker-1",
    "enabled = nope",
    "count = abc",
    "",
    "[server]",
    "verbose = OFF",
    "port = 8080",
  ].join("\n"),
)

test("getString returns the raw value, or the fallback when missing", () => {
  assertEqual(getString(doc.globals, "name"), "worker-1", "present key")
  assertEqual(getString(doc.globals, "missing"), undefined, "missing key, no fallback")
  assertEqual(getString(doc.globals, "missing", "default"), "default", "missing key with fallback")
})

test("getBoolean recognizes true/false, yes/no, on/off, 1/0", () => {
  assertEqual(getBoolean(doc.globals, "debug"), true, "true")
  assertEqual(getBoolean(doc.sections[0]?.entries ?? [], "verbose"), false, "OFF, case-insensitive")
  assertEqual(getBoolean(doc.globals, "missing"), undefined, "missing key, no fallback")
  assertEqual(getBoolean(doc.globals, "missing", true), true, "missing key with fallback")
})

test("getBoolean throws on a value that isn't a recognized boolean", () => {
  assertThrows(() => getBoolean(doc.globals, "enabled"), "not a recognized boolean", "unrecognized boolean")
})

test("getNumber parses a numeric value", () => {
  assertEqual(getNumber(doc.globals, "retries"), 3, "integer value")
  assertEqual(getNumber(doc.sections[0]?.entries ?? [], "port"), 8080, "section entry")
  assertEqual(getNumber(doc.globals, "missing"), undefined, "missing key, no fallback")
  assertEqual(getNumber(doc.globals, "missing", 10), 10, "missing key with fallback")
})

test("getNumber throws on a value that isn't numeric", () => {
  assertThrows(() => getNumber(doc.globals, "count"), "not a valid number", "non-numeric value")
})

test("findEntry returns the matching entry or undefined", () => {
  assertEqual(findEntry(doc.globals, "name"), { key: "name", value: "worker-1" }, "present key")
  assertEqual(findEntry(doc.globals, "missing"), undefined, "missing key")
})

const failed = results.filter((r) => r.error !== null)
if (failed.length > 0) {
  throw new Error(
    `${failed.length}/${results.length} coerce tests failed:\n` + failed.map((f) => `  ${f.name}: ${f.error}`).join("\n"),
  )
}
