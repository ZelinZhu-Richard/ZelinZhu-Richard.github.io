import http from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, realpath } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.pdf': 'application/pdf',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.hdr': 'application/octet-stream',
};

export async function createStaticServer(directory) {
  const root = await realpath(resolve(directory));
  return http.createServer(async (req, res) => {
    const fail = (status, text, headers = {}) => {
      res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', ...headers });
      res.end(req.method === 'HEAD' ? undefined : text);
    };
    if (!['GET', 'HEAD'].includes(req.method)) return fail(405, 'Method not allowed', { Allow: 'GET, HEAD' });
    let pathname;
    try { pathname = decodeURIComponent((req.url || '/').split('?')[0]); }
    catch { return fail(400, 'Invalid URL'); }
    if (pathname.includes('\0') || pathname.includes('\\')) return fail(400, 'Invalid path');
    let filename = resolve(root, '.' + pathname);
    if (filename !== root && !filename.startsWith(root + sep)) return fail(403, 'Forbidden');
    try {
      let info;
      try {
        info = await stat(filename);
        if (info.isDirectory()) {
          if (!pathname.endsWith('/')) {
            res.writeHead(301, { Location: pathname + '/' + (req.url.includes('?') ? '?' + req.url.split('?').slice(1).join('?') : '') });
            return res.end();
          }
          filename = resolve(filename, 'index.html');
        }
      } catch {
        return fail(404, 'Not found');
      }
      filename = await realpath(filename);
      if (!filename.startsWith(root + sep)) return fail(403, 'Forbidden');
      info = await stat(filename);
      if (!info.isFile()) return fail(404, 'Not found');

      const etag = `"${info.size.toString(16)}-${Math.floor(info.mtimeMs).toString(16)}"`;
      const headers = {
        'Content-Type': mimeTypes[extname(filename)] || 'application/octet-stream',
        'Content-Length': info.size,
        // This is an editable local snapshot: revalidate even fingerprinted assets
        // so local compatibility fixes are visible immediately after a reload.
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
        ETag: etag,
      };
      if (req.headers['if-none-match'] === etag && !req.headers.range) {
        res.writeHead(304, headers);
        return res.end();
      }

      let start = 0, end = info.size - 1, status = 200;
      if (req.headers.range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
        if (!match || (!match[1] && !match[2])) return fail(416, 'Invalid range', { 'Content-Range': `bytes */${info.size}` });
        if (!match[1]) start = Math.max(0, info.size - Number(match[2]));
        else {
          start = Number(match[1]);
          if (match[2]) end = Math.min(end, Number(match[2]));
        }
        if (start > end || start >= info.size || !Number.isSafeInteger(start) || !Number.isSafeInteger(end)) {
          return fail(416, 'Unsatisfiable range', { 'Content-Range': `bytes */${info.size}` });
        }
        status = 206;
        headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
        headers['Content-Length'] = end - start + 1;
      }
      res.writeHead(status, headers);
      if (req.method === 'HEAD' || !info.size) return res.end();
      const stream = createReadStream(filename, { start, end });
      stream.on('error', () => res.destroy());
      res.on('close', () => stream.destroy());
      stream.pipe(res);
    } catch (error) {
      if (!res.headersSent) fail(error.code === 'ENOENT' ? 404 : 500, 'File unavailable');
      else res.destroy();
    }
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const option = (name, fallback) => args.includes(name) ? args[args.indexOf(name) + 1] || fallback : fallback;
  const port = Number(option('--port', process.env.PORT || 5173));
  const host = option('--host', process.env.HOST || '127.0.0.1');
  const server = await createStaticServer(args[0] || 'public');
  server.on('error', error => { console.error(error.message); process.exitCode = 1; });
  server.listen(port, host, () => console.log(`Richard Zhu → http://${host}:${server.address().port}\nServing ${resolve(args[0] || 'public')}`));
}
