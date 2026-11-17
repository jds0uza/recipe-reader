/**
 * Local Development Server for Recipe Reader
 * Zero-dependency native Node.js HTTP server.
 * Serves static assets and provides an offline-safe recipe extraction endpoint.
 */

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { extractRecipeFromHtml, parseRecipeFromSchema } from './src/core/recipe-parser.ts';
import { CHOCOLATE_CHIP_COOKIES, TUSCAN_GARLIC_CHICKEN, SAMPLE_JSON_LD_HTML } from './src/fixtures/sample-recipes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url || '/', `http://${req.headers.host}`);
  const pathname = parsedUrl.pathname;

  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: Fetch & Parse Recipe from URL or JSON payload
  if (pathname === '/api/parse-recipe' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const payload = JSON.parse(body || '{}');
        const targetUrl = payload.url?.trim();
        const rawHtml = payload.html?.trim();

        // 1. If raw HTML provided directly
        if (rawHtml) {
          const recipe = extractRecipeFromHtml(rawHtml, targetUrl);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, recipe }));
          return;
        }

        // 2. Sample or mocked URLs
        if (!targetUrl || targetUrl.includes('cookies') || targetUrl.includes('sample-cookies')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, recipe: CHOCOLATE_CHIP_COOKIES }));
          return;
        }

        if (targetUrl.includes('chicken') || targetUrl.includes('tuscan')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, recipe: TUSCAN_GARLIC_CHICKEN }));
          return;
        }

        if (targetUrl.includes('pancake')) {
          const recipe = extractRecipeFromHtml(SAMPLE_JSON_LD_HTML, targetUrl);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, recipe }));
          return;
        }

        // 3. Live URL fetching (using Node's native fetch)
        try {
          const response = await fetch(targetUrl, {
            headers: {
              'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            }
          });

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          const html = await response.text();
          const recipe = extractRecipeFromHtml(html, targetUrl);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true, recipe }));
        } catch (fetchErr) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            success: false,
            error: `Failed to extract recipe from URL: ${fetchErr.message}. You can try one of the built-in sample recipes or paste raw HTML.`
          }));
        }
      } catch (err) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: Sample recipes listing
  if (pathname === '/api/samples' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      samples: [
        { id: 'cookies', name: 'Classic Chocolate Chip Cookies', recipe: CHOCOLATE_CHIP_COOKIES },
        { id: 'chicken', name: 'Creamy Tuscan Garlic Chicken', recipe: TUSCAN_GARLIC_CHICKEN },
        { id: 'pancakes', name: 'Fluffy Blueberry Pancakes', recipe: extractRecipeFromHtml(SAMPLE_JSON_LD_HTML) }
      ]
    }));
    return;
  }

  // Static File Serving
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);

  // If path inside src/ is requested for ES module imports in browser
  if (pathname.startsWith('/src/')) {
    filePath = path.join(__dirname, pathname);
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, () => {
  console.log(`\n👨‍🍳 Recipe Reader Server running at: http://localhost:${PORT}`);
  console.log(`👉 Offline-ready deterministic state machine with SpeechSynthesis & SpeechRecognition\n`);
});
