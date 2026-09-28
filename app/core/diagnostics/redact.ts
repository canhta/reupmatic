import type { DiagnosticRecord, DiagnosticValue } from './diagnostic-record.js';

// A credential never reaches a log line; the value goes, the fact that it existed stays.
const SECRET_KEY =
  /(token|cookie|authorization|auth_header|secret|password|passphrase|credential|api_key|apikey|session_id|sessionid|signature)/i;

// Untrusted content is never copied into a side file, however useful it would be.
const CONTENT_KEY =
  /(transcript|subtitle|caption|cue_text|cues|ocr|recognized|payload|response_body|raw_body|file_contents|contents|bytes_content|html|source_text|target_text)/i;

export const REDACTED = '[redacted]';
export const REMOVED = '[removed]';

const MAX_VALUE = 2000;
// A URL's query string carries signatures, tokens and session values; strip it everywhere.
const URL_WITH_QUERY = /\b((?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s"']*?)\?[^\s"']*/gi;
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s"':@]+:[^/\s"'@]+@/gi;
// A credential written inside free text; key-based removal cannot see these.
const SECRET_IN_TEXT =
  /((?:token|cookie|authorization|secret|password|passphrase|credential|api[_-]?key|session[_-]?id|sessionid|signature|sig|ttwid|msToken)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s;,&)\]}"']+)/gi;
const BEARER = /\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

export function stripQueryStrings(value: string): string {
  return value.replace(URL_WITH_QUERY, (_match, base: string) => base);
}

export function scrubSecrets(value: string): string {
  // BEARER first, else SECRET_IN_TEXT eats the scheme word and leaves the token.
  return stripQueryStrings(value)
    .replace(URL_USERINFO, (_match, scheme: string) => `${scheme}${REDACTED}@`)
    .replace(BEARER, (_match, scheme: string) => `${scheme} ${REDACTED}`)
    .replace(SECRET_IN_TEXT, (_match, lead: string) => `${lead}${REDACTED}`);
}

function redactValue(key: string, value: DiagnosticValue): DiagnosticValue {
  if (SECRET_KEY.test(key)) return REDACTED;
  if (CONTENT_KEY.test(key)) return REMOVED;
  if (typeof value !== 'string') return value;
  return scrubSecrets(value).slice(0, MAX_VALUE);
}

export function redact(record: DiagnosticRecord): DiagnosticRecord {
  const redacted: DiagnosticRecord = {
    at: record.at,
    level: record.level,
    source: record.source,
    event: record.event,
  };
  if (record.message !== undefined)
    redacted.message = scrubSecrets(record.message).slice(0, MAX_VALUE);
  if (record.code !== undefined) redacted.code = record.code;
  if (record.correlation !== undefined) redacted.correlation = { ...record.correlation };
  if (record.detail !== undefined) {
    const detail: Record<string, DiagnosticValue> = {};
    for (const [key, value] of Object.entries(record.detail)) detail[key] = redactValue(key, value);
    redacted.detail = detail;
  }
  return redacted;
}
