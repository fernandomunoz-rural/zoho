// Crawls every #/ route at desktop and phone width (JS errors, overflow, undefined/NaN text);
// with --click also clicks every control on every desktop page. Usage: node tests/smoke.js <url> [--click]
const { chromium } = require('playwright-core');
const file = process.argv[2];
const CLICK = process.argv.includes('--click');

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
  const problems = [];
  for (const vp of [{ name: 'desktop', width: 1440, height: 900 }, { name: 'phone', width: 390, height: 844 }]) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, acceptDownloads: true });
    const page = await ctx.newPage();
    let where = '';
    page.on('pageerror', e => problems.push(`[${vp.name}] JS ERROR at ${where}: ${e.message}`));
    page.on('console', m => { if (m.type() === 'error') problems.push(`[${vp.name}] console.error at ${where}: ${m.text()}`) });
    page.on('dialog', d => d.accept());
    await page.goto(file,{waitUntil:'domcontentloaded'});
    await page.evaluate(() => localStorage.clear());
    await page.goto(file,{waitUntil:'domcontentloaded'});
    // BFS crawl over hash routes
    const seen = new Set(), queue = ['#/home'];
    while (queue.length) {
      const h = queue.shift(); if (seen.has(h)) continue; seen.add(h);
      where = h;
      await page.evaluate(x => { location.hash = x }, h);
      await page.waitForTimeout(60);
      const info = await page.evaluate(() => ({
        links: [...document.querySelectorAll('a[href^="#/"]')].map(a => a.getAttribute('href')),
        overflow: document.documentElement.scrollWidth > window.innerWidth + 1 || (document.querySelector('.main') && document.querySelector('.main').scrollWidth > document.querySelector('.main').clientWidth + 1),
        empty: (document.querySelector('.main')?.innerText || '').trim().length < 20,
        undef: /\bundefined\b|\bNaN\b|\[object Object\]/.test(document.querySelector('.main')?.innerText || ''),
      }));
      if (info.overflow) problems.push(`[${vp.name}] horizontal page overflow at ${h}`);
      if (info.empty) problems.push(`[${vp.name}] near-empty page at ${h}`);
      if (info.undef) {
        const snip = await page.evaluate(() => { const t = document.querySelector('.main').innerText; const m = t.match(/.{0,50}(\bundefined\b|\bNaN\b|\[object Object\]).{0,30}/); return m && m[0] });
        problems.push(`[${vp.name}] shows "undefined/NaN/[object Object]" at ${h}: ${JSON.stringify(snip)}`);
      }
      // only follow one detail record per module to keep runtime sane
      for (const l of info.links) {
        const parts = l.replace(/^#\//, '').split('/');
        const key = parts.length > 1 && !['reports', 'setup'].includes(parts[0]) ? '#/' + parts[0] + '/*' : l;
        if (!seen.has(key)) { if (key !== l) seen.add(key); queue.push(l) }
      }
    }
    console.log(`[${vp.name}] crawled ${seen.size} routes`);
    if (CLICK && vp.name === 'desktop') {
      const routes = [...seen].filter(r => !r.endsWith('/*'));
      let clicks = 0;
      for (const r of routes) {
        await page.evaluate(x => { location.hash = x }, r); await page.waitForTimeout(40);
        const n = await page.evaluate(() => document.querySelectorAll('.main [data-a], .main button').length);
        for (let i = 0; i < Math.min(n, 60); i++) {
          where = `${r} click#${i}`;
          await page.evaluate(x => { if (location.hash !== x) location.hash = x; document.querySelector('.modal-bg, .modal')?.remove?.() }, r);
          await page.waitForTimeout(20);
          const desc = await page.evaluate(i => { const el = [...document.querySelectorAll('.main [data-a], .main button')][i]; if (!el) return null; const d = (el.dataset.a || '') + ' "' + (el.innerText || el.title || '').trim().slice(0, 30) + '"'; if (/reset|delete|undo/i.test(d)) return 'SKIP ' + d; el.click(); return d }, i);
          if (desc) { clicks++; where = `${r} click ${desc}` }
          await page.waitForTimeout(20);
          // try closing any modal
          await page.evaluate(() => { try { closeModal() } catch (e) { } });
        }
      }
      console.log(`[desktop] clicked ${clicks} controls`);
    }
    await ctx.close();
  }
  await browser.close();
  console.log(problems.length ? [...new Set(problems)].join('\n') : 'NO PROBLEMS FOUND');
  process.exitCode = problems.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1 });
