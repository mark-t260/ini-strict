# ini-strict

A validating INI parser and pretty printer for TypeScript. Zero dependencies.

Most INI parsers are lenient to a fault: a stray character, a missing `=`,
or a duplicate key gets silently absorbed into whatever the last-write-wins
behavior happens to be, and you find out something was wrong three layers
away from the config file. This one validates as it parses and, when it
rejects a file, tells you exactly where and why - line, column, a source
excerpt, and a caret pointing at the problem, the way a compiler would.

## Status

Early. The parser and printer both work end to end on the common INI
shape (sections, `key = value`, quoted strings, `;` and `#` comments).
Things it does not do yet are listed in the roadmap below.

## Install

No package is published yet. Copy `src/` into your project, or once this
repo has a tag you can depend on, add it as a normal npm dependency - there
is nothing to install today.

## Usage

```ts
import { parseIni, printIni, IniParseError } from "./src/index"

const source = `
host = localhost
port = 5432

[credentials]
username = "app_user"
password = "correct horse battery staple"
`

const doc = parseIni(source)
// doc.globals -> [{ key: "host", value: "localhost" }, { key: "port", value: "5432" }]
// doc.sections -> [{ name: "credentials", entries: [...] }]

console.log(printIni(doc))
```

Values from `parseIni` are always strings. `getBoolean` and `getNumber` coerce
them, with an optional fallback for a missing key:

```ts
import { getBoolean, getNumber } from "./src/index"

const debug = getBoolean(doc.globals, "debug", false)
const port = getNumber(doc.sections[0]!.entries, "port")
```

A missing key returns the fallback (or `undefined` with no fallback given).
A key that's present but doesn't parse as the requested type throws, since
that's a different problem than the key being absent. `getBoolean` accepts
`true`/`false`, `yes`/`no`, `on`/`off`, and `1`/`0`, case-insensitively.

### Error messages

Given a malformed file:

```ini
[server]
host = 0.0.0.0
port =
timeout = 30
port = 60
```

```ts
try {
  parseIni(source)
} catch (err) {
  if (err instanceof IniParseError) {
    console.error(err.message)
  }
}
```

prints:

```
duplicate key 'port' in section '[server]' at line 5, column 1
5 | port = 60
  | ^
```

(`port =` with an empty value on line 3 is legal - an empty value is not
the same problem as a duplicate key - but if it were the file's only
issue, `IniParseError` would point straight at line 3 instead.)

### Validation rules enforced today

- Every entry line needs a `=` or `:` separating key from value; a bare key
  or bare value is rejected. Whichever character appears first on the line
  is the separator, so `port: 5432` and `port = 5432` both work, but a key
  that itself contains the other separator character (an unquoted URL used
  as a key, say) will misparse - that ambiguity is inherent to supporting
  both separators and applies to every INI dialect that does.
- Section headers need a matching `]` and a non-empty name.
- No duplicate section names.
- No duplicate keys within the same section (or within the top-level scope
  before any section header).
- Quoted values (`"..."` or `'...'`) must be closed on the same line, and
  `\"`, `\\`, `\n`, `\t`, `\r`, `\0` are the only recognized escapes inside
  double quotes.

## Design

`IniDocument` is a plain object - `{ globals, sections }` - with each
section holding an ordered list of `{ key, value }` entries. There's no
hidden mutable parser state exposed to callers: `parseIni` either returns
a fully validated document or throws `IniParseError`.

`printIni` is a canonicalizer, not a round-trip formatter. It does not try
to preserve original comments or spacing, because the document model does
not retain them. It quotes a value only when leaving it bare would change
its meaning (leading/trailing whitespace, an empty string, or a character
that would otherwise be parsed as a comment or quote marker).

## Testing

`src/ini.test.ts` and `src/coerce.test.ts` are plain assertion scripts, not a
framework test suite - there are no dependencies to run them through. `npm
test` compiles and then runs both with `node`; it exits non-zero and lists
which cases failed if anything regresses, and prints nothing on success.

## Roadmap

- Preserve comments and blank-line layout for true round-trip formatting
- Multi-line values via line continuation
- A CLI (`ini-strict check file.ini`) for use in CI

## License

MIT, see LICENSE.
