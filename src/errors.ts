/**
 * Raised for any structural problem found while parsing an INI document.
 * The formatted message includes a source excerpt and a caret pointing at
 * the offending column, in the style of a compiler diagnostic, because a
 * bare "invalid syntax" with no location is useless once a file is more
 * than a screen long.
 */
export class IniParseError extends Error {
  readonly line: number
  readonly column: number
  readonly lineText: string

  constructor(message: string, line: number, column: number, lineText: string) {
    const gutter = String(line)
    const pad = " ".repeat(gutter.length)
    const caretOffset = Math.max(0, column - 1)
    const header = `${message} at line ${line}, column ${column}`
    const sourceLine = `${gutter} | ${lineText}`
    const pointerLine = `${pad} | ${" ".repeat(caretOffset)}^`
    super(`${header}\n${sourceLine}\n${pointerLine}`)
    this.name = "IniParseError"
    this.line = line
    this.column = column
    this.lineText = lineText
    // Restores `instanceof IniParseError` under the ES5 target's Error
    // subclassing quirk.
    Object.setPrototypeOf(this, IniParseError.prototype)
  }
}
