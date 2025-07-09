const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;
const STATIC_DIR = path.join(__dirname, 'docs');

const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.mjs': 'application/javascript',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.json': 'application/json',
    '.txt': 'text/plain',
};

const server = http.createServer((req, res) => {
    let reqPath = decodeURIComponent(req.url.split('?')[0]);
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(STATIC_DIR, path.normalize(reqPath));

    // Prevent path traversal.
    if (!filePath.startsWith(STATIC_DIR)) {
        res.writeHead(403);
        res.end('Forbidden.');
        return;
    }

    fs.stat(filePath, (err, stats) => {
        if (err || !stats.isFile()) {
            res.writeHead(404);
            res.end('Not found.');
            return;
        }
        const ext = path.extname(filePath).toLowerCase();
        const mime = mimeTypes[ext] || 'application/octet-stream';
        res.writeHead(200, {
            'Content-Type': mime,
            'Cache-Control': 'max-age=604800'
        });
        fs.createReadStream(filePath).pipe(res);
    });
});

server.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}/`);
});
