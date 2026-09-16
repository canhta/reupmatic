import { open } from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';

type ByteRange = { start: number; end: number } | 'unsatisfiable' | null;

// A small HTTP adapter for registered files. This is not a media decoder.
export function singleByteRange(value: string | null, size: number): ByteRange {
  if (!value) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());
  if (!match || (!match[1] && !match[2])) return null; // Ignore unsupported/multi ranges.
  if (size === 0) return 'unsatisfiable';
  const sizeBig = BigInt(size);
  if (!match[1]) {
    const suffix = BigInt(match[2]);
    if (suffix === 0n) return 'unsatisfiable';
    return { start: suffix >= sizeBig ? 0 : size - Number(suffix), end: size - 1 };
  }
  const start = BigInt(match[1]);
  const end = match[2] ? BigInt(match[2]) : sizeBig - 1n;
  if (start >= sizeBig || end < start) return 'unsatisfiable';
  return { start: Number(start), end: Number(end >= sizeBig ? sizeBig - 1n : end) };
}

/** The caller must resolve pathname from its trusted asset registry, never a URL path. */
export async function registeredMediaResponse(request: Request, pathname: string): Promise<Response> {
  const headers = new Headers({
    'Accept-Ranges': 'bytes',
    'Access-Control-Allow-Origin': 'app://ui',
    'Cross-Origin-Resource-Policy': 'cross-origin',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'no-store',
  });
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    headers.set('Allow', 'GET, HEAD');
    return new Response(null, { status: 405, headers });
  }
  const file = await open(pathname, 'r').catch(() => null);
  if (!file) return new Response(null, { status: 404, headers });
  try {
    const info = await file.stat();
    if (!info.isFile() || !Number.isSafeInteger(info.size)) {
      await file.close();
      return new Response(null, { status: 404, headers });
    }
    const types: Record<string, string> = {
      '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.webm': 'video/webm',
      '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.aac': 'audio/aac',
      '.flac': 'audio/flac', '.ogg': 'audio/ogg', '.opus': 'audio/ogg',
      '.mkv': 'video/x-matroska', '.avi': 'video/x-msvideo',
    };
    headers.set('Content-Type', types[path.extname(pathname).toLowerCase()] ?? 'application/octet-stream');
    // No entity validator is emitted yet: If-Range must fall back to a full representation.
    const range = request.method === 'GET' && !request.headers.has('if-range')
      ? singleByteRange(request.headers.get('range'), info.size) : null;
    if (range === 'unsatisfiable') {
      headers.set('Content-Range', `bytes */${info.size}`);
      await file.close();
      return new Response(null, { status: 416, headers });
    }
    const start = range?.start ?? 0;
    const end = range?.end ?? info.size - 1;
    headers.set('Content-Length', String(info.size ? end - start + 1 : 0));
    if (range) headers.set('Content-Range', `bytes ${start}-${end}/${info.size}`);
    if (request.method === 'HEAD' || info.size === 0) {
      await file.close();
      return new Response(null, { status: range ? 206 : 200, headers });
    }
    const stream = file.createReadStream({ start, end, autoClose: true });
    return new Response(Readable.toWeb(stream) as ReadableStream<Uint8Array>, {
      status: range ? 206 : 200, headers,
    });
  } catch (error) {
    await file.close().catch(() => undefined);
    throw error;
  }
}
