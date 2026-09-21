import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { installOfferedModel } from '../../dist-core/speech/model-installer.js';

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

function buildModel(files, overrides = {}) {
  const download_size = files.reduce((sum, file) => sum + file.size, 0);
  return {
    id: 'test-model',
    task: 'recognition',
    engine: 'faster-whisper',
    purpose: { en: 'A purpose', vi: 'Một mục đích' },
    licence: 'MIT',
    source_host: '127.0.0.1',
    languages: ['en'],
    download_size,
    on_disk_size: download_size,
    files,
    ...overrides,
  };
}

function file(name, body) {
  return { name, path: name, sha256: sha256(body), size: body.length };
}

function startServer(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

function stop(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function partials(root) {
  return (await readdir(root)).filter((name) => name.startsWith('.partial-'));
}

test('a successful install downloads, hash-checks and writes the normal manifest', async () => {
  const a = Buffer.from('first file body'),
    b = Buffer.from('second file body');
  const server = await startServer((request, response) => {
    const body = { '/a.bin': a, '/b.bin': b }[request.url];
    if (!body) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.end(body);
  });
  const root = await mkdtemp(path.join(tmpdir(), 'install-'));
  try {
    await mkdir(path.join(root, '.partial-stale'));
    await writeFile(path.join(root, '.partial-stale', 'leftover.bin'), 'x');
    const phases = [];
    const result = await installOfferedModel({
      model: buildModel([file('a.bin', a), file('b.bin', b)]),
      bundleRoot: root,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      onProgress: (progress) => phases.push(progress.phase),
    });
    assert.equal(result.engine, 'faster-whisper');
    assert.equal(result.directory, path.join(root, 'test-model'));
    assert.deepEqual((await readdir(result.directory)).sort(), ['a.bin', 'b.bin']);
    assert.deepEqual(await readFile(path.join(result.directory, 'a.bin')), a);
    const manifest = JSON.parse(await readFile(result.manifest_path, 'utf8'));
    assert.deepEqual(manifest, {
      engine: 'faster-whisper',
      directory: result.directory,
      languages: ['en'],
      files: { 'a.bin': sha256(a), 'b.bin': sha256(b) },
    });
    assert.ok(phases.includes('downloading'));
    assert.ok(phases.includes('installing'));
    assert.deepEqual(await partials(root), []);
    assert.equal(
      (await readdir(root)).some((name) => name.startsWith('.partial-')),
      false,
    );
  } finally {
    await stop(server);
    await rm(root, { recursive: true, force: true });
  }
});

test('a bundle that keeps its files in subfolders installs them in the same layout', async () => {
  const a = Buffer.from('graph body');
  const server = await startServer((request, response) => {
    const body = { '/org/repo/resolve/main/onnx/graph.onnx': a }[request.url];
    if (!body) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.end(body);
  });
  const root = await mkdtemp(path.join(tmpdir(), 'install-'));
  try {
    const result = await installOfferedModel({
      model: buildModel(
        [
          {
            name: 'onnx/graph.onnx',
            path: 'org/repo/resolve/main/onnx/graph.onnx',
            sha256: sha256(a),
            size: a.length,
          },
        ],
        { task: 'synthesis', engine: 'vieneu-v3-turbo-onnx' },
      ),
      bundleRoot: root,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
    });
    assert.deepEqual(await readFile(path.join(result.directory, 'onnx', 'graph.onnx')), a);
    const manifest = JSON.parse(await readFile(result.manifest_path, 'utf8'));
    assert.deepEqual(manifest.files, { 'onnx/graph.onnx': sha256(a) });
  } finally {
    await stop(server);
    await rm(root, { recursive: true, force: true });
  }
});

test('a multi-repo entry with nested paths installs every file in the same layout', async () => {
  const graph = Buffer.from('turbo graph body');
  const codec = Buffer.from('codec body');
  const server = await startServer((request, response) => {
    const body = {
      '/org/turbo/resolve/main/onnx/graph.onnx': graph,
      '/other/codec/resolve/main/codec/decoder.onnx': codec,
    }[request.url];
    if (!body) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.end(body);
  });
  const root = await mkdtemp(path.join(tmpdir(), 'install-'));
  try {
    const result = await installOfferedModel({
      model: buildModel(
        [
          {
            name: 'onnx/graph.onnx',
            path: 'org/turbo/resolve/main/onnx/graph.onnx',
            sha256: sha256(graph),
            size: graph.length,
          },
          {
            name: 'codec/decoder.onnx',
            path: 'other/codec/resolve/main/codec/decoder.onnx',
            sha256: sha256(codec),
            size: codec.length,
          },
        ],
        { task: 'synthesis', engine: 'vieneu-v3-turbo-onnx' },
      ),
      bundleRoot: root,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
    });
    assert.deepEqual(await readFile(path.join(result.directory, 'onnx', 'graph.onnx')), graph);
    assert.deepEqual(await readFile(path.join(result.directory, 'codec', 'decoder.onnx')), codec);
    const manifest = JSON.parse(await readFile(result.manifest_path, 'utf8'));
    assert.deepEqual(manifest.files, {
      'onnx/graph.onnx': sha256(graph),
      'codec/decoder.onnx': sha256(codec),
    });
  } finally {
    await stop(server);
    await rm(root, { recursive: true, force: true });
  }
});

test('a hash mismatch fails the install and removes what it fetched', async () => {
  const expected = Buffer.from('expected body');
  const server = await startServer((_request, response) => response.end('tampered body'));
  const root = await mkdtemp(path.join(tmpdir(), 'install-'));
  try {
    await assert.rejects(
      installOfferedModel({
        model: buildModel([file('a.bin', expected)]),
        bundleRoot: root,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
      }),
      /MODEL_HASH_MISMATCH/,
    );
    const entries = await readdir(root);
    assert.deepEqual(entries, [], `leftovers: ${entries.join(', ')}`);
  } finally {
    await stop(server);
    await rm(root, { recursive: true, force: true });
  }
});

test('cancelling a download removes every partial file', async () => {
  const server = await startServer((_request, response) => {
    response.writeHead(200);
    const timer = setInterval(() => response.write(Buffer.alloc(64)), 10);
    response.on('close', () => clearInterval(timer));
  });
  const root = await mkdtemp(path.join(tmpdir(), 'install-'));
  try {
    const controller = new AbortController();
    const pending = installOfferedModel({
      model: buildModel([
        { name: 'a.bin', path: 'a.bin', sha256: sha256(Buffer.alloc(1)), size: 4096 },
      ]),
      bundleRoot: root,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });
    await assert.rejects(pending, /CANCELLED/);
    const entries = await readdir(root);
    assert.deepEqual(entries, [], `leftovers: ${entries.join(', ')}`);
  } finally {
    await stop(server);
    await rm(root, { recursive: true, force: true });
  }
});

test('an interrupted download removes what it fetched and leaves no half-bundle', async () => {
  const full = Buffer.alloc(4096, 7);
  const server = await startServer((_request, response) => {
    response.writeHead(200, { 'content-length': String(full.length) });
    response.write(full.subarray(0, 32));
    setImmediate(() => response.destroy());
  });
  const root = await mkdtemp(path.join(tmpdir(), 'install-'));
  try {
    await assert.rejects(
      installOfferedModel({
        model: buildModel([file('a.bin', full)]),
        bundleRoot: root,
        baseUrl: `http://127.0.0.1:${server.address().port}`,
      }),
    );
    const entries = await readdir(root);
    assert.deepEqual(entries, [], `leftovers: ${entries.join(', ')}`);
  } finally {
    await stop(server);
    await rm(root, { recursive: true, force: true });
  }
});

test('insufficient disk space is checked against download plus on-disk size before any byte moves', async () => {
  const root = await mkdtemp(path.join(tmpdir(), 'install-'));
  try {
    let fetched = 0;
    await assert.rejects(
      installOfferedModel({
        model: buildModel([file('a.bin', Buffer.alloc(1000))]),
        bundleRoot: root,
        download: async () => {
          fetched += 1;
          return { ok: true, status: 200, body: null };
        },
        freeSpace: async () => 999,
      }),
      /SPEECH_DISK_LOW/,
    );
    assert.equal(fetched, 0);
    assert.deepEqual(await readdir(root), []);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('a translation entry writes the CT2/SentencePiece manifest its adapter reads', async () => {
  const bodies = {
    '/model.bin': Buffer.from('translation weights'),
    '/config.json': Buffer.from('{"model":1}'),
    '/source.spm': Buffer.from('source spm'),
    '/target.spm': Buffer.from('target spm'),
    '/shared_vocabulary.json': Buffer.from('{}'),
  };
  const server = await startServer((request, response) => {
    const body = bodies[request.url];
    if (!body) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.end(body);
  });
  const root = await mkdtemp(path.join(tmpdir(), 'install-'));
  try {
    const files = Object.entries(bodies).map(([name, body]) => file(name.slice(1), body));
    const result = await installOfferedModel({
      model: buildModel(files, {
        task: 'translation',
        engine: 'ctranslate2-sentencepiece',
        source_language: 'en',
        target_language: 'vi',
      }),
      bundleRoot: root,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
    });
    const manifest = JSON.parse(await readFile(result.manifest_path, 'utf8'));
    // The worker's `TranslationRegistry` requires exactly these keys — no `version`, no languages.
    assert.deepEqual(manifest, {
      engine: 'ctranslate2-sentencepiece',
      directory: result.directory,
      source_language: 'en',
      target_language: 'vi',
      files: Object.fromEntries(
        Object.entries(bodies).map(([name, body]) => [name.slice(1), sha256(body)]),
      ),
    });
  } finally {
    await stop(server);
    await rm(root, { recursive: true, force: true });
  }
});

test('a vision entry writes the nested OCR/inpainting manifest its adapter reads', async () => {
  const bodies = {
    '/vi/det.onnx': Buffer.from('det'),
    '/vi/rec.onnx': Buffer.from('rec'),
    '/vi/keys.txt': Buffer.from('keys'),
    '/lama_fp32.onnx': Buffer.from('lama'),
  };
  const server = await startServer((request, response) => {
    const body = bodies[request.url];
    if (!body) {
      response.statusCode = 404;
      response.end();
      return;
    }
    response.end(body);
  });
  const root = await mkdtemp(path.join(tmpdir(), 'install-'));
  try {
    const files = Object.entries(bodies).map(([name, body]) => file(name.slice(1), body));
    const result = await installOfferedModel({
      model: buildModel(files, {
        task: 'vision',
        engine: 'rapidocr-lama',
        ocr: {
          vi: {
            det: 'vi/det.onnx',
            rec: 'vi/rec.onnx',
            keys: 'vi/keys.txt',
            det_version: 'PP-OCRv4',
            rec_version: 'PP-OCRv4',
            rec_height: 48,
          },
        },
        inpainting: { model: 'lama_fp32.onnx' },
      }),
      bundleRoot: root,
      baseUrl: `http://127.0.0.1:${server.address().port}`,
    });
    const manifest = JSON.parse(await readFile(result.manifest_path, 'utf8'));
    const artifact = (name) => ({
      path: path.join(result.directory, name),
      sha256: sha256(bodies[`/${name}`]),
    });
    assert.deepEqual(manifest, {
      ocr: {
        vi: {
          det: artifact('vi/det.onnx'),
          rec: artifact('vi/rec.onnx'),
          keys: artifact('vi/keys.txt'),
          det_version: 'PP-OCRv4',
          rec_version: 'PP-OCRv4',
          rec_height: 48,
        },
      },
      inpainting: { model: artifact('lama_fp32.onnx') },
    });
  } finally {
    await stop(server);
    await rm(root, { recursive: true, force: true });
  }
});
