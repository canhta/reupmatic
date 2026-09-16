// Test-only entrypoint: production launch does not accept a test-data override.
import { app } from 'electron';
import path from 'node:path';
const data = process.env.REUPMATIC_TEST_USER_DATA;
if (!data || !path.isAbsolute(data)) throw new Error('Test user-data path is required');
app.setPath('userData', data);
await import('../../dist-node/electron/main.js');
