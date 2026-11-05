// Runs every check against the site served over HTTP (as it will be when deployed).
// Usage: npm test   (needs Google Chrome installed, or CHROME_PATH pointing at a Chromium binary)
const http = require('http'), fs = require('fs'), path = require('path');
const { spawn } = require('child_process');
const root = path.join(__dirname, '..');

// 1. Syntax check of the inline app script.
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const scripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
let failed = false;
scripts.forEach((s, i) => { try { new Function(s); console.log(`PASS  script ${i} parses`) } catch (e) { failed = true; console.log(`FAIL  script ${i}: ${e.message}`) } });

// 2. Serve the folder and run the browser suites.
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  const f = path.join(root, path.normalize(p));
  if (!f.startsWith(root)) { res.writeHead(403); return res.end() }
  fs.readFile(f, (e, b) => { if (e) { res.writeHead(404); return res.end('Not found') } res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream' }); res.end(b) });
});
server.listen(0, '127.0.0.1', () => {
  const url = `http://127.0.0.1:${server.address().port}/`;
  // Children run async so this process can keep serving while they test.
  const run = (file, ...args) => new Promise(resolve => {
    console.log(`\n== ${file} ${args.join(' ')}`);
    const c = spawn(process.execPath, [path.join(__dirname, file), url, ...args], { stdio: 'inherit' });
    c.on('exit', code => { if (code !== 0) failed = true; resolve() });
  });
  (async () => {
    await run('smoke.js', '--click');
    await run('flows.js');
    await run('excel.js');
    server.close();
    console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
    process.exitCode = failed ? 1 : 0;
  })();
});
