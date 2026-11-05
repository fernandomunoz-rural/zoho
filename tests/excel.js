// Excel import: a real two-sheet .xlsx is read through the pinned CDN library (SRI must pass),
// and with the CDN blocked the user gets the offline message instead of a crash. Usage: node tests/excel.js <url>
const { chromium } = require('playwright-core');
const fs = require('fs'), os = require('os'), path = require('path');
const url = process.argv[2];
const LIB = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: 'chrome' });
  // Build the test workbook with the same library, in a separate page.
  const gen = await browser.newPage(); await gen.goto('about:blank'); await gen.addScriptTag({ url: LIB });
  const bytes = await gen.evaluate(() => {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['x']]), 'Notes');
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['First Name', 'Last Name', 'Personal Email', 'Phone'], ['Xena', 'Excelton', 'xena.excelton@example.com', '801-555-0199'], ['Yuri', 'Sheetson', 'yuri.s@example.com', '801-555-0198']]), 'Source Contacts');
    return Array.from(new Uint8Array(XLSX.write(wb, { type: 'array', bookType: 'xlsx' })));
  });
  await gen.close();
  const xlsx = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crm-xlsx-')), 'test.xlsx');
  fs.writeFileSync(xlsx, Buffer.from(bytes));

  const fails = [];
  for (const blocked of [false, true]) {
    const ctx = await browser.newContext(); const p = await ctx.newPage(); const errs = [];
    p.on('pageerror', e => errs.push(e.message));
    if (blocked) await ctx.route('**/cdnjs.cloudflare.com/**', r => r.abort());
    await p.goto(url, { waitUntil: 'load' }); await p.evaluate(() => localStorage.clear()); await p.reload();
    await p.evaluate(() => { location.hash = '#/import' }); await p.waitForTimeout(100);
    await p.evaluate(() => document.querySelector('[data-a="importm"][data-m="contacts"]').click()); await p.waitForTimeout(100);
    await p.setInputFiles('#wfile', xlsx); await p.waitForTimeout(3000);
    const st = await p.evaluate(() => ({ sheets: S.wiz.sheets, sheet: S.wiz.sheet, rows: (S.wiz.rows || []).length, toast: document.querySelector('.toast')?.textContent || '' }));
    const pass = blocked ? /internet connection/.test(st.toast) && !errs.length : st.sheet === 'Source Contacts' && st.rows === 2 && !errs.length;
    console.log(`${pass ? 'PASS' : 'FAIL'}  excel import (${blocked ? 'CDN blocked' : 'CDN reachable'})  — ${JSON.stringify(st)}${errs.length ? ' errors: ' + errs.join(' | ') : ''}`);
    if (!pass) fails.push(blocked);
    await ctx.close();
  }
  await browser.close();
  process.exitCode = fails.length ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1 });
