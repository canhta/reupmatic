// Test-only entrypoint: production launch does not accept a test-data override.

import path from 'node:path';
import { app } from 'electron';
import { blockDouyinFetch, blockDouyinSessions } from './helpers/douyin-block.mjs';

const data = process.env.REUPMATIC_TEST_USER_DATA;
if (!data || !path.isAbsolute(data)) throw new Error('Test user-data path is required');
app.setPath('userData', data);
// The diagnostic log lives under the OS log directory, which on macOS is not derived from
// userData — point it inside the test's own directory so an e2e run stays isolated and its
// records can be read back.
app.setPath('logs', path.join(data, 'logs'));
// No test run reaches real Douyin: main's own HTTP calls and every window's requests are refused.
globalThis.fetch = blockDouyinFetch(globalThis.fetch);
blockDouyinSessions(app);
await import('../../dist-node/electron/main.js');
