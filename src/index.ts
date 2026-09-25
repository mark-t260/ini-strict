export { parseIni, printIni } from "./ini"
export type { IniDocument, IniSection, IniEntry } from "./ini"
export { IniParseError } from "./errors"
export { findEntry, getString, getBoolean, getNumber } from "./coerce"
