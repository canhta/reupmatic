import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  IMPLEMENTED_ARCHITECTURES,
  MODEL_TASKS,
  parseCatalogue,
  parseCatalogueModel,
  readCatalogue,
} from '../../dist-core/speech/model-catalogue.js';

const hash = 'a'.repeat(64);

function entry(overrides = {}) {
  return {
    id: 'offered-model',
    task: 'recognition',
    engine: 'faster-whisper',
    purpose: { en: 'A purpose', vi: 'Một mục đích' },
    licence: 'MIT',
    source_host: 'huggingface.co',
    languages: ['en'],
    files: [{ name: 'model.bin', path: 'org/repo/resolve/main/model.bin', sha256: hash, size: 10 }],
    download_size: 10,
    on_disk_size: 10,
    ...overrides,
  };
}

test('the shipped catalogue is valid data offering real implemented architectures', async () => {
  const filename = new URL('../../app/core/speech/catalogue.json', import.meta.url);
  const catalogue = await readCatalogue([filename.pathname]);
  assert.ok(catalogue.models.length >= 2, 'a few models must be offered');
  assert.deepEqual(catalogue.refused, []);
  for (const model of catalogue.models) {
    assert.ok(IMPLEMENTED_ARCHITECTURES.has(model.engine), `${model.engine} must be implemented`);
    assert.ok(MODEL_TASKS.includes(model.task), `${model.id} must declare a known task`);
    assert.equal(
      model.download_size,
      model.files.reduce((sum, file) => sum + file.size, 0),
      `${model.id} declares its true download size`,
    );
    assert.ok(model.on_disk_size >= model.download_size);
    assert.ok(model.licence.length > 0 && model.source_host.length > 0);
  }
});

test('the shipped catalogue offers both text-to-speech engines before any bytes move', async () => {
  const filename = new URL('../../app/core/speech/catalogue.json', import.meta.url);
  const { models } = await readCatalogue([filename.pathname]);
  const byId = new Map(models.map((model) => [model.id, model]));
  const turbo = byId.get('vieneu-v3-turbo-onnx');
  const nano = byId.get('vieneu-v3-nano-onnx');
  for (const [model, count] of [
    [turbo, 9],
    [nano, 6],
  ]) {
    assert.ok(model, 'both synthesis engines are offered');
    assert.equal(model.task, 'synthesis');
    assert.equal(model.engine, model.id);
    assert.equal(model.source_host, 'huggingface.co');
    assert.equal(model.licence, 'Apache-2.0');
    assert.ok(model.purpose.en.length > 0 && model.purpose.vi.length > 0);
    assert.notEqual(model.purpose.vi, model.purpose.en);
    assert.equal(model.files.length, count);
    assert.equal(
      model.download_size,
      model.files.reduce((sum, file) => sum + file.size, 0),
    );
    assert.ok(model.on_disk_size >= model.download_size);
  }
  assert.deepEqual(turbo.languages, ['en', 'vi']);
  assert.deepEqual(nano.languages, ['vi']);
  assert.equal(turbo.download_size, 500970159);
  assert.equal(nano.download_size, 281756486);
  assert.ok(turbo.files.some((file) => file.name.startsWith('onnx/')));
  assert.ok(turbo.files.some((file) => file.name.startsWith('codec/')));
  assert.ok(turbo.files.every((file) => file.path.includes('/resolve/main/')));
});

test('the shipped catalogue offers the Turbo clone add-on as its own explicit install', async () => {
  const filename = new URL('../../app/core/speech/catalogue.json', import.meta.url);
  const { models } = await readCatalogue([filename.pathname]);
  const clone = models.find((model) => model.id === 'vieneu-v3-turbo-clone');
  assert.ok(clone, 'the clone add-on must be offered');
  assert.equal(clone.engine, 'vieneu-v3-turbo-clone-onnx');
  assert.equal(clone.task, 'synthesis');
  assert.deepEqual(clone.languages, ['en', 'vi']);
  assert.equal(clone.files.length, 4);
  assert.ok(clone.files.some((file) => file.name === 'speaker_encoder.onnx'));
  assert.ok(clone.files.some((file) => file.name === 'denoiser.onnx'));
  assert.ok(clone.files.some((file) => file.name === 'codec/moss_audio_tokenizer_encode.onnx'));
  assert.ok(clone.files.some((file) => file.name === 'codec/moss_audio_tokenizer_encode.data'));
  assert.equal(
    clone.download_size,
    clone.files.reduce((sum, file) => sum + file.size, 0),
  );
});

test('an entry naming an architecture the app does not implement is refused at configuration time', () => {
  assert.throws(
    () => parseCatalogueModel(entry({ engine: 'not-an-architecture' })),
    /MODEL_ARCHITECTURE_UNIMPLEMENTED/,
  );
  const parsed = parseCatalogue({
    models: [entry({ id: 'unknown', engine: 'not-an-architecture' }), entry({ id: 'known' })],
  });
  assert.deepEqual(
    parsed.models.map((model) => model.id),
    ['known'],
  );
  assert.deepEqual(parsed.refused, [{ id: 'unknown', code: 'MODEL_ARCHITECTURE_UNIMPLEMENTED' }]);
});

test('an entry says which task its model serves, and the task gates the architecture', () => {
  const synthesis = entry({
    id: 'vieneu-turbo',
    task: 'synthesis',
    engine: 'vieneu-v3-turbo-onnx',
  });
  assert.equal(parseCatalogueModel(synthesis).task, 'synthesis');
  assert.ok(IMPLEMENTED_ARCHITECTURES.has('vieneu-v3-turbo-onnx'));
  for (const engine of ['vieneu-v3-turbo-onnx', 'vieneu-v3-nano-onnx']) {
    assert.equal(parseCatalogueModel(entry({ task: 'synthesis', engine })).engine, engine);
    assert.ok(IMPLEMENTED_ARCHITECTURES.has(engine));
  }

  assert.throws(
    () => parseCatalogueModel({ ...synthesis, engine: 'faster-whisper' }),
    /MODEL_ARCHITECTURE_UNIMPLEMENTED/,
  );
  assert.throws(
    () => parseCatalogueModel({ ...synthesis, engine: 'some-unshipped-tts' }),
    /MODEL_ARCHITECTURE_UNIMPLEMENTED/,
  );
  assert.throws(
    () => parseCatalogueModel({ ...synthesis, task: 'summarisation' }),
    /MODEL_CATALOGUE_INVALID/,
  );
});

test('a bundle-relative file name may keep the engine its own subfolders', () => {
  const model = parseCatalogueModel(
    entry({
      id: 'nested-engine',
      task: 'synthesis',
      engine: 'vieneu-v3-turbo-onnx',
      files: [
        {
          name: 'onnx/graph.onnx',
          path: 'org/repo/resolve/main/onnx/graph.onnx',
          sha256: hash,
          size: 10,
        },
        {
          name: 'codec/decoder.onnx',
          path: 'org/repo/resolve/main/codec/decoder.onnx',
          sha256: hash,
          size: 5,
        },
        { name: 'voices.json', path: 'org/repo/resolve/main/voices.json', sha256: hash, size: 5 },
      ],
      download_size: 20,
      on_disk_size: 20,
    }),
  );
  assert.deepEqual(
    model.files.map((file) => file.name),
    ['onnx/graph.onnx', 'codec/decoder.onnx', 'voices.json'],
  );
});

test('malformed entries are refused with a plain reason and never offered', () => {
  const cases = [
    { sha256: 'not-a-hash' },
    { path: '/etc/passwd' },
    { path: 'org/../secret' },
    { path: 'https://evil.example/x' },
    { size: 0 },
    { name: '/etc/passwd' },
    { name: 'a/../b' },
    { name: 'onnx/./weights.bin' },
    { name: 'onnx\\\\weights.bin' },
  ];
  for (const patch of cases) {
    const parsed = parseCatalogue({
      models: [entry({ files: [{ ...entry().files[0], ...patch }] })],
    });
    assert.equal(parsed.models.length, 0, JSON.stringify(patch));
    assert.equal(parsed.refused[0].code, 'MODEL_CATALOGUE_INVALID', JSON.stringify(patch));
  }
  assert.equal(parseCatalogue({ models: [entry({ download_size: 11 })] }).models.length, 0);
  assert.equal(parseCatalogue({ models: [entry({ on_disk_size: 9 })] }).models.length, 0);
  assert.throws(() => parseCatalogueModel({ ...entry(), extra: true }), /MODEL_CATALOGUE_INVALID/);
});

test('the shipped catalogue offers a translation pair and the LaMa inpainting model', async () => {
  const filename = new URL('../../app/core/speech/catalogue.json', import.meta.url);
  const { models } = await readCatalogue([filename.pathname]);
  const byId = new Map(models.map((model) => [model.id, model]));

  const enVi = byId.get('opus-mt-en-vi-ct2');
  const viEn = byId.get('opus-mt-vi-en-ct2');
  const zhEn = byId.get('opus-mt-zh-en-ct2');
  const zhVi = byId.get('opus-mt-zh-vi-ct2');
  for (const model of [enVi, viEn, zhEn, zhVi]) {
    assert.ok(model, 'every shipped translation direction is offered');
    assert.equal(model.task, 'translation');
    assert.equal(model.engine, 'ctranslate2-sentencepiece');
    assert.equal(model.licence, 'Apache-2.0');
    assert.ok(model.purpose.en.length > 0 && model.purpose.vi.length > 0);
    assert.notEqual(model.purpose.vi, model.purpose.en);
    assert.ok(model.files.some((file) => file.name === 'model.bin'));
    assert.ok(model.files.some((file) => file.name === 'source.spm'));
    assert.ok(model.files.some((file) => file.name === 'target.spm'));
    assert.ok(model.files.some((file) => file.name === 'shared_vocabulary.json'));
  }
  assert.deepEqual([enVi.source_language, enVi.target_language], ['en', 'vi']);
  assert.deepEqual([viEn.source_language, viEn.target_language], ['vi', 'en']);
  assert.deepEqual([zhEn.source_language, zhEn.target_language], ['zh', 'en']);
  assert.deepEqual([zhVi.source_language, zhVi.target_language], ['zh', 'vi']);

  const lama = byId.get('lama-onnx-fp32');
  assert.ok(lama, 'the inpainting model is offered');
  assert.equal(lama.task, 'vision');
  assert.equal(lama.engine, 'rapidocr-lama');
  assert.equal(lama.licence, 'Apache-2.0');
  assert.deepEqual(lama.inpainting, { model: 'lama_fp32.onnx' });
  assert.equal(lama.ocr, undefined);

  const ocr = byId.get('rapidocr-ppocrv5-mobile');
  assert.ok(ocr, 'the OCR packs are offered');
  assert.equal(ocr.task, 'vision');
  assert.equal(ocr.engine, 'rapidocr-lama');
  assert.equal(ocr.licence, 'Apache-2.0');
  assert.deepEqual(Object.keys(ocr.ocr).sort(), ['en', 'vi', 'zh']);
  for (const pack of Object.values(ocr.ocr)) {
    assert.equal(pack.det_version, 'PP-OCRv5');
    assert.equal(pack.rec_version, 'PP-OCRv5');
    assert.equal(pack.rec_height, 48);
    const names = new Set(ocr.files.map((file) => file.name));
    assert.ok(names.has(pack.det) && names.has(pack.rec) && names.has(pack.keys));
  }
  assert.equal(ocr.ocr.vi.rec, 'latin_PP-OCRv5_rec_mobile.onnx');
  assert.equal(ocr.ocr.zh.rec, 'ch_PP-OCRv5_rec_mobile.onnx');
});

test('a user catalogue overrides a shipped entry by id without a code change', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'catalogue-'));
  try {
    const shipped = path.join(directory, 'shipped.json');
    const user = path.join(directory, 'user.json');
    await writeFile(
      shipped,
      JSON.stringify({ models: [entry({ purpose: { en: 'Old', vi: 'Cũ' } })] }),
    );
    await writeFile(
      user,
      JSON.stringify({
        models: [entry({ purpose: { en: 'Mine', vi: 'Của tôi' } }), entry({ id: 'added' })],
      }),
    );
    const merged = await readCatalogue([shipped, user]);
    assert.deepEqual(
      merged.models.map((model) => [model.id, model.purpose]),
      [
        ['offered-model', { en: 'Mine', vi: 'Của tôi' }],
        ['added', { en: 'A purpose', vi: 'Một mục đích' }],
      ],
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('a missing optional catalogue file is simply absent; a malformed one fails loudly', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'catalogue-'));
  try {
    const present = path.join(directory, 'present.json');
    await writeFile(present, JSON.stringify({ models: [entry()] }));
    const merged = await readCatalogue([path.join(directory, 'absent.json'), present]);
    assert.equal(merged.models.length, 1);

    const broken = path.join(directory, 'broken.json');
    await writeFile(broken, '{ not json');
    await assert.rejects(() => readCatalogue([broken]), /MODEL_CATALOGUE_INVALID/);
    const wrongShape = path.join(directory, 'wrong.json');
    await writeFile(wrongShape, JSON.stringify({ models: [], bogus: true }));
    await assert.rejects(() => readCatalogue([wrongShape]), /MODEL_CATALOGUE_INVALID/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('every offered model describes itself in each UI locale the app ships', async () => {
  const { UI_LOCALES } = await import('../../dist-core/ui-locale.js');
  const filename = new URL('../../app/core/speech/catalogue.json', import.meta.url);
  const catalogue = await readCatalogue([filename.pathname]);
  for (const model of catalogue.models) {
    for (const locale of UI_LOCALES) {
      const text = model.purpose[locale];
      assert.ok(
        typeof text === 'string' && text.length > 0,
        `${model.id} must say what it is for in ${locale}`,
      );
    }
    assert.notEqual(
      model.purpose.vi,
      model.purpose.en,
      `${model.id}'s Vietnamese purpose is the English one`,
    );
  }
});

test('a model that cannot describe itself in every UI locale is refused, never half-translated', () => {
  assert.throws(
    () => parseCatalogueModel(entry({ purpose: { en: 'Only English' } })),
    /MODEL_CATALOGUE_INVALID/,
  );
  assert.throws(
    () => parseCatalogueModel(entry({ purpose: { en: 'Only English', vi: '' } })),
    /MODEL_CATALOGUE_INVALID/,
  );
  assert.throws(
    () => parseCatalogueModel(entry({ purpose: 'A purpose' })),
    /MODEL_CATALOGUE_INVALID/,
  );
  assert.throws(
    () => parseCatalogueModel(entry({ purpose: { en: 'A', vi: 'B', fr: 'C' } })),
    /MODEL_CATALOGUE_INVALID/,
  );
  const model = parseCatalogueModel(
    entry({ purpose: { en: 'Fast drafts', vi: 'Bản nháp nhanh' } }),
  );
  assert.deepEqual(model.purpose, { en: 'Fast drafts', vi: 'Bản nháp nhanh' });
});

function sized(files) {
  const total = files.reduce((sum, file) => sum + file.size, 0);
  return { files, download_size: total, on_disk_size: total };
}

function file(name, size) {
  return { name, path: `org/repo/resolve/main/${name}`, sha256: hash, size };
}

function translationEntry(overrides = {}) {
  return {
    id: 'opus-en-vi',
    task: 'translation',
    engine: 'ctranslate2-sentencepiece',
    purpose: { en: 'Translate English into Vietnamese', vi: 'Dịch tiếng Anh sang tiếng Việt' },
    licence: 'Apache-2.0',
    source_host: 'huggingface.co',
    source_language: 'en',
    target_language: 'vi',
    ...sized([
      file('model.bin', 10),
      file('config.json', 2),
      file('source.spm', 2),
      file('target.spm', 2),
      file('shared_vocabulary.json', 4),
    ]),
    ...overrides,
  };
}

function visionEntry(overrides = {}) {
  return {
    id: 'rapidocr-lama',
    task: 'vision',
    engine: 'rapidocr-lama',
    purpose: { en: 'Read and remove on-screen text', vi: 'Đọc và xoá chữ trên hình' },
    licence: 'Apache-2.0',
    source_host: 'huggingface.co',
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
    ...sized([
      file('vi/det.onnx', 3),
      file('vi/rec.onnx', 3),
      file('vi/keys.txt', 2),
      file('lama_fp32.onnx', 2),
    ]),
    ...overrides,
  };
}

test('a translation entry declares one direction and the adapter\u2019s required files', () => {
  const model = parseCatalogueModel(translationEntry());
  assert.equal(model.task, 'translation');
  assert.equal(model.engine, 'ctranslate2-sentencepiece');
  assert.equal(model.source_language, 'en');
  assert.equal(model.target_language, 'vi');
  const pair = parseCatalogueModel(
    translationEntry(
      sized([
        file('model.bin', 10),
        file('config.json', 2),
        file('source.spm', 2),
        file('target.spm', 2),
        file('source_vocabulary.json', 2),
        file('target_vocabulary.json', 2),
      ]),
    ),
  );
  assert.equal(pair.target_language, 'vi');
});

test('a translation entry that cannot install is refused at configuration time', () => {
  const missing = translationEntry().files.filter((item) => item.name !== 'model.bin');
  assert.throws(
    () => parseCatalogueModel(translationEntry(sized(missing))),
    /MODEL_CATALOGUE_INVALID/,
  );
  assert.throws(
    () => parseCatalogueModel(translationEntry({ target_language: 'en' })),
    /MODEL_CATALOGUE_INVALID/,
  );
  const both = [
    ...translationEntry().files,
    file('source_vocabulary.json', 2),
    file('target_vocabulary.json', 2),
  ];
  assert.throws(
    () => parseCatalogueModel(translationEntry(sized(both))),
    /MODEL_CATALOGUE_INVALID/,
  );
  const extra = [...translationEntry().files, file('notes.txt', 1)];
  assert.throws(
    () => parseCatalogueModel(translationEntry(sized(extra))),
    /MODEL_CATALOGUE_INVALID/,
  );
  assert.throws(
    () => parseCatalogueModel(translationEntry({ engine: 'faster-whisper' })),
    /MODEL_ARCHITECTURE_UNIMPLEMENTED/,
  );
});

test('a vision entry declares OCR packs and/or an inpainting model, each pointing at a file', () => {
  const both = parseCatalogueModel(visionEntry());
  assert.equal(both.task, 'vision');
  assert.equal(both.ocr.vi.det, 'vi/det.onnx');
  assert.equal(both.ocr.vi.rec_height, 48);
  assert.equal(both.inpainting.model, 'lama_fp32.onnx');

  const ocrOnly = visionEntry();
  delete ocrOnly.inpainting;
  Object.assign(ocrOnly, sized(ocrOnly.files.filter((item) => item.name !== 'lama_fp32.onnx')));
  const parsedOcr = parseCatalogueModel(ocrOnly);
  assert.equal(parsedOcr.inpainting, undefined);
  assert.ok(parsedOcr.ocr.vi);

  const inpaintingOnly = visionEntry();
  delete inpaintingOnly.ocr;
  Object.assign(
    inpaintingOnly,
    sized(inpaintingOnly.files.filter((item) => !item.name.startsWith('vi/'))),
  );
  const parsedInpaint = parseCatalogueModel(inpaintingOnly);
  assert.equal(parsedInpaint.ocr, undefined);
  assert.equal(parsedInpaint.inpainting.model, 'lama_fp32.onnx');
});

test('a vision entry that cannot install is refused at configuration time', () => {
  const neither = visionEntry();
  delete neither.ocr;
  delete neither.inpainting;
  assert.throws(() => parseCatalogueModel(neither), /MODEL_CATALOGUE_INVALID/);
  assert.throws(
    () =>
      parseCatalogueModel(
        visionEntry({
          ocr: {
            vi: {
              det: 'vi/missing.onnx',
              rec: 'vi/rec.onnx',
              keys: 'vi/keys.txt',
              det_version: 'PP-OCRv4',
              rec_version: 'PP-OCRv4',
              rec_height: 48,
            },
          },
        }),
      ),
    /MODEL_CATALOGUE_INVALID/,
  );
  assert.throws(
    () =>
      parseCatalogueModel(
        visionEntry({ ocr: { vi: { ...visionEntry().ocr.vi, det_version: 'PP-OCRv9' } } }),
      ),
    /MODEL_CATALOGUE_INVALID/,
  );
  assert.throws(
    () =>
      parseCatalogueModel(
        visionEntry({ ocr: { vi: { ...visionEntry().ocr.vi, rec_height: 64 } } }),
      ),
    /MODEL_CATALOGUE_INVALID/,
  );
  const extra = [...visionEntry().files, file('readme.txt', 1)];
  assert.throws(() => parseCatalogueModel(visionEntry(sized(extra))), /MODEL_CATALOGUE_INVALID/);
  assert.throws(
    () => parseCatalogueModel(visionEntry({ engine: 'ctranslate2-sentencepiece' })),
    /MODEL_ARCHITECTURE_UNIMPLEMENTED/,
  );
});
