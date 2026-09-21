import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { net, protocol, session } from 'electron';
import { registeredMediaResponse } from '../../core/media/media-response.js';

export function registerSchemes(): void {
  protocol.registerSchemesAsPrivileged(
    ['app', 'media'].map((scheme) => ({
      scheme,
      privileges: {
        standard: true,
        secure: true,
        supportFetchAPI: true,
        corsEnabled: true,
        stream: true,
      },
    })),
  );
}

const csp =
  "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: media:; media-src media: blob:; connect-src 'self' media:; worker-src 'self' blob:; font-src 'self' data:; object-src 'none'; base-uri 'none'; frame-src 'none'";

export function installProtocols(
  uiDirectory: string,
  resolveMedia: (id: string) => string | undefined,
): void {
  protocol.handle('app', async (request) => {
    try {
      const url = new URL(request.url);
      if (url.hostname !== 'ui') return new Response('Not found', { status: 404 });
      const pathname = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
      const resolved = path.resolve(uiDirectory, `.${pathname}`);
      if (!resolved.startsWith(uiDirectory + path.sep))
        return new Response('Denied', { status: 403 });
      const response = await net.fetch(pathToFileURL(resolved).toString());
      const headers = new Headers(response.headers);
      headers.set('Content-Security-Policy', csp);
      headers.set('Cross-Origin-Opener-Policy', 'same-origin');
      headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
      return new Response(response.body, { status: response.status, headers });
    } catch {
      return new Response('Not found', { status: 404 });
    }
  });
  protocol.handle('media', async (request) => {
    const url = new URL(request.url);
    const filename = url.hostname === 'local' ? resolveMedia(url.pathname.slice(1)) : undefined;
    return filename
      ? registeredMediaResponse(request, filename)
      : new Response('Not found', { status: 404 });
  });
  session.defaultSession.setPermissionRequestHandler((_webContents, _permission, callback) =>
    callback(false),
  );
}
