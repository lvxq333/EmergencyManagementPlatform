// Static frontend and same-origin gateway to the private Java backend.
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const pages = new Set(['home.html', 'index.html', 'login.html', 'register.html', '用户管理控制台.html']);
const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml' };
const port = Number(process.env.PORT || 18080);
const backendPort = Number(process.env.BACKEND_PORT || 18081);
http.createServer(async (req, res) => {
    let pathname;
    try { pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); }
    catch { res.writeHead(400).end(); return; }
    if (pathname.startsWith('/api/')) {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) {
            res.writeHead(403).end(); return;
        }
        const headers = { ...req.headers, host: `127.0.0.1:${backendPort}` };
        delete headers.origin;
        const upstream = http.request({ hostname: '127.0.0.1', port: backendPort, path: req.url, method: req.method, headers }, reply => {
            res.writeHead(reply.statusCode, { ...reply.headers, 'Cache-Control': 'no-store' });
            reply.pipe(res);
        });
        upstream.setTimeout(30000, () => upstream.destroy(new Error('Backend timeout')));
        upstream.on('error', () => {
            if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
            res.end(JSON.stringify({ message: '后端服务暂不可用，请稍后重试' }));
        });
        req.pipe(upstream);
        return;
    }
    const relative = pathname === '/' ? 'login.html' : pathname.slice(1);
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep) || !(pages.has(relative) || relative.startsWith('assets/')) || !['GET', 'HEAD'].includes(req.method)) {
        res.writeHead(404).end(); return;
    }
    try {
        const content = await fs.readFile(file);
        res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(req.method === 'HEAD' ? undefined : content);
    } catch { res.writeHead(404).end(); }
}).listen(port, process.env.BIND_ADDRESS || '0.0.0.0', () => console.log(`Platform gateway listening on ${port}; Java backend ${backendPort}`));
