import type { DiagnosticRecord, DiagnosticValue } from './diagnostic-record.js';

/**
 * The one redaction choke point (D-61). It is a pure function so the security behaviour is
 * provable in isolation, and the sink applies it to every record before the write — a producer
 * cannot leak a secret by forgetting a rule, because no producer does the redacting.
 *
 * What stays: absolute file paths and user-visible titles. A failure cannot be debugged without
 * them, and neither is a credential (D-55) or untrusted media content.
 */

/** D-55: a credential never reaches a log line. The value goes, the fact that it existed stays. */
const SECRET_KEY =
  /(token|cookie|authorization|auth_header|secret|password|passphrase|credential|api_key|apikey|session_id|sessionid|signature)/i;

/**
 * Untrusted content: transcript, OCR and subtitle text, raw provider payloads
 * and file contents are never copied into a side file, however useful they would be.
 */
const CONTENT_KEY =
  /(transcript|subtitle|caption|cue_text|cues|ocr|recognized|payload|response_body|raw_body|file_contents|contents|bytes_content|html|source_text|target_text)/i;

export const REDACTED = '[redacted]';
export const REMOVED = '[removed]';

const MAX_VALUE = 2000;
/** A URL's query string carries signatures, tokens and session values — strip it everywhere. */
const URL_WITH_QUERY = /\b((?:[a-z][a-z0-9+.-]*:\/\/|www\.)[^\s"']*?)\?[^\s"']*/gi;
/** `https://user:pass@host` — the credential is in the authority, not the query string. */
const URL_USERINFO = /\b([a-z][a-z0-9+.-]*:\/\/)[^/\s"':@]+:[^/\s"'@]+@/gi;
/**
 * A credential written *inside* free text rather than under a key of its own: a `Set-Cookie`
 * line, an `Authorization: Bearer …` header, a `token=…` fragment. Key-based removal cannot see
 * these, and a message or a tool's stderr tail is exactly where they turn up.
 */
const SECRET_IN_TEXT =
  /((?:token|cookie|authorization|secret|password|passphrase|credential|api[_-]?key|session[_-]?id|sessionid|signature|sig|ttwid|msToken)\s*[=:]\s*)("[^"]*"|'[^']*'|[^\s;,&)\]}"']+)/gi;
const BEARER = /\b(bearer|basic|token)\s+[A-Za-z0-9._~+/=-]{8,}/gi;

export function stripQueryStrings(value: string): string {
  return value.replace(URL_WITH_QUERY, (_match, base: string) => base);
}

/**
 * Scrubs credential-shaped text out of a free-text string. Applied to every string the sink
 * writes — `message` included — because D-55's "never in a log line" cannot depend on a producer
 * having put the secret under a helpfully-named key.
 */
export function scrubSecrets(value: string): string {
  // BEARER runs first: `Authorization: Bearer <token>` otherwise has its scheme word eaten by
  // SECRET_IN_TEXT as the "value", leaving the actual token in the line.
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

/** Applies every rule above to one record, returning a new record safe to write. */
export function redact(record: DiagnosticRecord): DiagnosticRecord {
  const redacted: DiagnosticRecord = {
    at: record.at,
    level: record.level,
    source: record.source,
    event: record.event,
  };
  // `message` is free text from a caught error, a console line or a tool's stderr, so it gets
  // the same scrub every detail value does — it is the one field no key can describe.
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
