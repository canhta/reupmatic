import assert from 'node:assert/strict';
import test from 'node:test';
import { parseDouyinCookies } from '../../dist-core/sources/douyin-cookie-import.js';

/** A realistic paste: identity cookies mixed in with the anonymous ones a page always sets. */
const HEADER = 'ttwid=1%7Cabc; sessionid=deadbeefcafe; odin_tt=zzz; sid_guard=guarded%7C123';

test('a header-form paste yields its cookies', () => {
  const outcome = parseDouyinCookies(HEADER);
  assert.equal(outcome.ok, true);
  assert.deepEqual(outcome.cookies.map((cookie) => cookie.name).sort(), [
    'odin_tt',
    'sessionid',
    'sid_guard',
    'ttwid',
  ]);
  assert.equal(outcome.cookies.find((cookie) => cookie.name === 'sessionid').value, 'deadbeefcafe');
});

test('a devtools JSON export is accepted too', () => {
  const outcome = parseDouyinCookies(
    JSON.stringify([
      { name: 'sid_tt', value: 'abc', domain: '.douyin.com' },
      { name: 'ttwid', value: 'def' },
    ]),
  );
  assert.equal(outcome.ok, true);
  assert.equal(outcome.cookies.length, 2);
});

test('a paste with no signed-in identity is rejected, naming what was looked for', () => {
  // Anonymous cookies alone would make the app report "connected" from an empty session, and
  // every later request would then fail confusingly instead of at the point of the mistake.
  const outcome = parseDouyinCookies('ttwid=1%7Cabc; odin_tt=zzz; msToken=xyz');
  assert.equal(outcome.ok, false);
  assert.equal(outcome.reason, 'missing_identity');
  assert.deepEqual([...outcome.expected].sort(), ['sessionid', 'sid_guard', 'sid_tt']);
});

test('empty, whitespace and unparseable input are unreadable rather than silently empty', () => {
  for (const input of ['', '   ', 'not cookies at all', '{}', '[]', '=novalue', 'noequals']) {
    const outcome = parseDouyinCookies(input);
    assert.equal(outcome.ok, false, JSON.stringify(input));
    assert.equal(outcome.reason, 'unreadable', JSON.stringify(input));
  }
});

test('control characters and delimiters in a value are refused, not sanitised through', () => {
  const NUL = String.fromCharCode(0);
  // Neither malformed pair survives, so nothing parsed at all -- `unreadable`, not a paste that
  // merely lacked identity. The two need different messages, so they are different outcomes.
  const dropped = parseDouyinCookies(`sessionid=bad${NUL}value; sid_tt=also bad`);
  assert.equal(dropped.ok, false);
  assert.equal(dropped.reason, 'unreadable');

  // A malformed identity cookie beside a well-formed anonymous one is the other case: it parses,
  // but what survives carries no identity.
  const anonymous = parseDouyinCookies(`sessionid=bad${NUL}value; ttwid=fine`);
  assert.equal(anonymous.ok, false);
  assert.equal(anonymous.reason, 'missing_identity');
});

test('a repeated name resolves to its last occurrence, as a browser would', () => {
  const outcome = parseDouyinCookies('sessionid=first; sessionid=second');
  assert.equal(outcome.ok, true);
  assert.equal(outcome.cookies.length, 1);
  assert.equal(outcome.cookies[0].value, 'second');
});

test('a failure never carries the pasted text back to the caller', () => {
  const secret = 'sessionid=SUPERSECRETVALUE';
  const outcome = parseDouyinCookies(`${secret}${String.fromCharCode(0)}`);
  assert.equal(outcome.ok, false);
  assert.ok(!JSON.stringify(outcome).includes('SUPERSECRETVALUE'), 'failure leaked the paste');
});
