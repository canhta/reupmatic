// Test-only: no test run may reach real Douyin (owner rule). The e2e launcher wraps
// the main process's `fetch` and every Electron session with this, so a Douyin request inside a
// test fails at once, like an offline network, instead of sending real traffic.

/** Douyin's own hosts plus the ByteDance app-API and CDN hosts its media and API calls use. */
const DOUYIN_HOSTS = [
  'douyin.com',
  'iesdouyin.com',
  'douyinvod.com',
  'douyinpic.com',
  'douyinstatic.com',
  'snssdk.com',
  'amemv.com',
  'zjcdn.com',
  'bytedance.com',
  'byteimg.com',
  'pstatp.com',
];

export function isDouyinHost(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return DOUYIN_HOSTS.some((base) => host === base || host.endsWith(`.${base}`));
}

function urlOf(input) {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input?.url ?? '';
}

export function blockDouyinFetch(fetch) {
  return (input, init) =>
    isDouyinHost(urlOf(input))
      ? Promise.reject(new TypeError('fetch failed: Douyin is blocked in tests'))
      : fetch(input, init);
}

/** Cancels every Douyin request from any Electron session, including partitions made later. */
export function blockDouyinSessions(app) {
  const block = (session) =>
    session.webRequest.onBeforeRequest((details, callback) =>
      callback({ cancel: isDouyinHost(details.url) }),
    );
  app.on('session-created', block);
}
