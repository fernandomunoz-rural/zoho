// End-to-end workflow tests against a fresh browser profile. Usage: node tests/flows.js <url>
const { chromium } = require('playwright-core');
const file = process.argv[2];
const results = []; const errors = [];
const ok = (name, cond, extra = '') => results.push(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  — ' + extra : ''}`);

(async () => {
  const browser = await chromium.launch(process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : { channel: "chrome" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  let step = '';
  page.on('pageerror', e => errors.push(`${step}: ${e.message}`));
  page.on('dialog', d => d.accept());
  const go = async h => { await page.evaluate(x => { location.hash = x }, h); await page.waitForTimeout(80) };
  const click = async (sel, i = 0) => { const n = await page.evaluate(([s, i]) => { const el = document.querySelectorAll(s)[i]; if (!el) return false; el.click(); return true }, [sel, i]); await page.waitForTimeout(80); return n };
  const db = () => page.evaluate(() => JSON.parse(localStorage.getItem('crm-mockup-ensign-v1')));
  const reload = async () => { await page.reload({ waitUntil: 'domcontentloaded' }); await page.waitForTimeout(150) };
  const toastText = () => page.evaluate(() => document.querySelector('.toast')?.textContent || '');
  const setVal = (sel, v) => page.evaluate(([s, v]) => { const el = document.querySelector(s); if (!el) return false; el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return true }, [sel, v]);

  await page.goto(file, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => localStorage.clear()); await reload();
  await page.evaluate(() => { try { save() } catch (e) { } });

  step = 'create contact';
  await go('#/contacts');
  await click('[data-a="new"][data-m="contacts"]');
  const frm = await page.evaluate(() => [...document.querySelectorAll('#frm [name]')].map(e => e.name).slice(0, 40));
  await setVal('#frm [name="first"]', 'Zed'); await setVal('#frm [name="last"]', 'Testperson'); await setVal('#frm [name="pemail"]', 'zed.testperson@example.com');
  await click('[data-a="savef"]');
  let d = await db();
  ok('create contact saves', d && d.contacts.length === 19, `contacts=${d && d.contacts.length}; form fields seen: ${frm.length}`);
  await reload(); d = await db();
  ok('created contact survives reload', d.contacts.some(c => c.last === 'Testperson'));

  step = 'required validation';
  await click('[data-a="new"][data-m="contacts"]');
  await setVal('#frm [name="first"]', 'NoLast');
  await click('[data-a="savef"]');
  ok('missing Last Name is blocked', /Required/.test(await page.evaluate(() => document.querySelector('#ferr')?.innerText || '')) && (await db()).contacts.length === 19);
  await page.evaluate(() => closeModal());

  step = 'duplicate check';
  const existing = d.contacts.find(c => c.pemail);
  await click('[data-a="new"][data-m="contacts"]');
  await setVal('#frm [name="last"]', 'Dupe'); await setVal('#frm [name="pemail"]', existing.pemail); await setVal('#frm [name="phone"]', existing.phone || '');
  await click('[data-a="savef"]');
  ok('duplicate contact is blocked', /Duplicate check/.test(await page.evaluate(() => document.querySelector('#ferr')?.innerText || '')) && (await db()).contacts.length === 19);
  await page.evaluate(() => closeModal());

  step = 'inline edit';
  const cid = existing.id;
  await go('#/contacts/' + cid);
  const hasI = await click('[data-a="iedit"][data-k="title"]');
  await setVal('.edbox input', 'QA Inline Title');
  await click('[data-a="isave"]');
  await reload(); d = await db();
  ok('inline edit persists', hasI && d.contacts.find(c => c.id === cid).title === 'QA Inline Title', `iedit found=${hasI}`);
  ok('title edit syncs current employment', d.emp.filter(e => e.contact === cid && e.current).every(e => e.title === 'QA Inline Title'));

  step = 'notes';
  await go('#/contacts/' + cid);
  const notesBefore = d.notes.length;
  await click('[data-a="dtab"][data-v="notes"]');
  const hasNote = await setVal('#newnote', 'QA note');
  await click('[data-a="addnote"]');
  d = await db(); ok('add note', hasNote && d.notes.length === notesBefore + 1, `note box found=${hasNote}`);

  step = 'tasks';
  const tBefore = d.tasks.length;
  await click('[data-a="newtask"]');
  await setVal('#tfrm [name="subject"]', 'QA task');
  await click('[data-a="savetask"]');
  d = await db(); const nt = d.tasks[d.tasks.length - 1];
  ok('create task', d.tasks.length === tBefore + 1 && nt.subject === 'QA task');
  await go('#/tasks');
  await page.evaluate(id => document.querySelector(`[data-a="donetask"][data-id="${id}"]`)?.click(), nt.id); await page.waitForTimeout(80);
  d = await db(); ok('complete task', d.tasks.find(t => t.id === nt.id).status === 'Completed');

  step = 'staged import + merge';
  await go('#/import');
  await page.evaluate(() => { S.imp = 'staging'; render() });
  let ran = await click('[data-a="runimport"]');
  if (!ran) { // find the tab that holds the staged re-import
    const tabs = await page.evaluate(() => [...document.querySelectorAll('[data-a="imptab"]')].map(e => e.dataset.v));
    for (const t of tabs) { await page.evaluate(v => { S.imp = v; render() }, t); await page.waitForTimeout(50); if (await click('[data-a="runimport"]')) { ran = true; break } }
  }
  d = await db(); ok('run staged re-import', ran && d.staging.ran);
  const logBefore = d.log.length;
  const opened = await click('[data-a="approve"]');
  await setVal('#mreason', 'QA merge');
  await click('[data-a="domerge"]');
  d = await db(); const lid = d.log[d.log.length - 1];
  ok('approve suggested merge', opened && d.log.length === logBefore + 1 && lid.action === 'Merged', `toast="${await toastText()}"`);
  step = 'reverse merge';
  await go('#/log/' + lid.id);
  const rev = await click('[data-a="reverse"]');
  d = await db();
  const key = lid.sources.replace(', ', '+');
  ok('reverse merge returns pair to queue', rev && !d.staging.decisions[key] && d.log.find(l => l.id === lid.id).action === 'Reversed', `reverse button=${rev}`);

  step = 'wizard import';
  const cBefore = d.contacts.length, eduBefore = d.edu.length, accBefore = d.accounts.length;
  const snapBefore = JSON.stringify({ c: d.contacts, emp: d.emp, edu: d.edu, a: d.accounts });
  await click('[data-a="importm"][data-m="contacts"]');
  const samples = await page.evaluate(() => [...document.querySelectorAll('[data-a="sample"]')].map(e => e.dataset.v));
  await click('[data-a="sample"]:not([data-v="case"]):not([data-v="acc"])');
  for (const s of [2, 3, 4]) { await page.evaluate(n => { const b = [...document.querySelectorAll('[data-a="wstep"]')].find(x => x.dataset.v == n); b && b.click() }, s); await page.waitForTimeout(80) }
  const runOk = await click('[data-a="wrun"]');
  d = await db(); const b = d.batches[d.batches.length - 1];
  ok('wizard creates a batch', runOk && !!b, `samples=${samples}; toast="${await toastText()}"`);
  if (b) {
    const statuses = b.rows.reduce((o, r) => (o[r.status] = (o[r.status] || 0) + 1, o), {});
    results.push(`      batch ${b.id} rows: ${JSON.stringify(statuses)}`);
    const ap = await click('[data-a="approveb"]');
    if (ap) { await setVal('#mreason', 'QA batch merge'); await click('[data-a="domerge"]') }
    await click('[data-a="createall"]');
    d = await db(); const b2 = d.batches.find(x => x.id === b.id);
    const st2 = b2.rows.reduce((o, r) => (o[r.status] = (o[r.status] || 0) + 1, o), {});
    ok('batch review merge/create', ap ? b2.rows.some(r => r.status === 'Merged') : true, `after review: ${JSON.stringify(st2)}`);
    step = 'undo batch';
    await page.evaluate(() => { S.imp = 'history'; render() }); await page.waitForTimeout(50);
    const u = await page.evaluate(id => { const el = document.querySelector(`[data-a="undo"][data-v="${id}"]`); if (!el) return false; el.click(); return true }, b.id); await page.waitForTimeout(100);
    d = await db();
    const snapAfter = JSON.stringify({ c: d.contacts, emp: d.emp, edu: d.edu, a: d.accounts });
    ok('undo import restores contacts count', u && d.contacts.length === cBefore && d.edu.length === eduBefore && d.accounts.length === accBefore, `undo button=${u}; contacts ${cBefore}->${d.contacts.length}, edu ${eduBefore}->${d.edu.length}, accounts ${accBefore}->${d.accounts.length}`);
    // compare field values ignoring timeline-ish keys
    const strip = s => JSON.parse(s, (k, v) => (k === 'variants' || k === 'updated' || k === 'lastVerified') ? undefined : v);
    const A = strip(snapBefore), B = strip(snapAfter);
    const diffs = [];
    for (const k of ['c', 'emp', 'edu', 'a']) { const ma = new Map(A[k].map(r => [r.id, JSON.stringify(r)])); for (const r of B[k]) if (ma.get(r.id) !== JSON.stringify(r)) diffs.push(k + ':' + r.id); for (const id of ma.keys()) if (!B[k].some(r => r.id === id)) diffs.push(k + ' missing ' + id) }
    ok('undo import restores data exactly', diffs.length === 0, diffs.slice(0, 8).join(', '));
  }

  step = 'role restrictions';
  await page.evaluate(() => { const s = document.querySelector('.rolesel'); s.value = Object.keys(ROLES).find(k => k !== 'admin'); s.dispatchEvent(new Event('change', { bubbles: true })) });
  await go('#/contacts/' + cid);
  const c0 = (await db()).contacts.length;
  await page.evaluate(id => { const b = document.createElement('button'); b.dataset.a = 'del'; b.dataset.m = 'contacts'; b.dataset.id = id; document.querySelector('.main').appendChild(b); b.click() }, cid); await page.waitForTimeout(80);
  ok('non-admin cannot delete contact', (await db()).contacts.length === c0 && /Restricted/.test(await toastText()));
  await page.evaluate(() => { const s = document.querySelector('.rolesel'); s.value = 'admin'; s.dispatchEvent(new Event('change', { bubbles: true })) });

  step = 'csv export';
  await go('#/contacts');
  const [dlf] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), click('[data-a="export"]')]);
  let csvOk = false; if (dlf) { const p = await dlf.path(); const t = require('fs').readFileSync(p, 'utf8'); csvOk = t.split('\n').length >= 19 && t.startsWith('"Name"') }
  ok('CSV export downloads contacts', csvOk);

  step = 'admin delete account cleanup';
  d = await db(); const acc = d.accounts.find(a => d.contacts.some(c => c.account === a.id));
  await go('#/accounts/' + acc.id);
  await page.evaluate(id => { const b = document.createElement('button'); b.dataset.a = 'del'; b.dataset.m = 'accounts'; b.dataset.id = id; document.querySelector('.main').appendChild(b); b.click() }, acc.id); await page.waitForTimeout(100);
  d = await db();
  const orphanC = d.contacts.filter(c => c.account === acc.id).length, orphanE = d.emp.filter(e => e.account === acc.id).length;
  ok('deleting an account leaves no dangling links', orphanC + orphanE === 0, `contacts still pointing: ${orphanC}, employment rows: ${orphanE}`);
  const linkedC = (await page.evaluate(() => 1)) && d.contacts.find(c => c.account === acc.id);
  if (linkedC) { await go('#/contacts/' + linkedC.id); const txt = await page.evaluate(() => document.querySelector('.main').innerText); ok('contact page after account delete renders sanely', !/undefined|null/.test(txt)) }

  step = 'admin delete contact cascade';
  d = await db(); const vic = d.contacts.find(c => d.edu.some(e => e.contact === c.id) && d.emp.some(e => e.contact === c.id));
  await go('#/contacts/' + vic.id);
  await page.evaluate(id => { const b = document.createElement('button'); b.dataset.a = 'del'; b.dataset.m = 'contacts'; b.dataset.id = id; document.querySelector('.main').appendChild(b); b.click() }, vic.id); await page.waitForTimeout(100);
  d = await db();
  const left = d.edu.filter(e => e.contact === vic.id).length + d.emp.filter(e => e.contact === vic.id).length + d.accounts.filter(a => a.champion === vic.id).length + d.contacts.filter(c => c.reportingTo === vic.id).length + d.tasks.filter(t => t.rid === vic.id).length;
  ok('deleting a contact removes its history and clears links', !d.contacts.some(c => c.id === vic.id) && left === 0 && d.log.length > 0, `left=${left}`);
  for (const h of ['#/home', '#/edu', '#/emp', '#/accounts', '#/log', '#/reports/counts']) await go(h);

  step = 'reset';
  await go('#/setup/data');
  const rs = await click('[data-a="resetall"]');
  d = await db(); ok('reset all restores seed', rs && d.contacts.length === 18 && d.batches.length === 0);

  step = 'old/corrupt storage';
  await page.evaluate(() => { const x = JSON.parse(localStorage.getItem('crm-mockup-ensign-v1')); delete x.batches; delete x.customViews; delete x.favs; delete x.seq; delete x.tasks; delete x.notes; localStorage.setItem('crm-mockup-ensign-v1', JSON.stringify(x)) });
  const e0 = errors.length; await reload();
  for (const h of ['#/home', '#/contacts', '#/contacts/CP-001', '#/import', '#/tasks', '#/reports', '#/setup']) await go(h);
  ok('older saved data (missing keys) loads without errors', errors.length === e0, errors.slice(e0, e0 + 3).join(' | '));
  await page.evaluate(() => localStorage.setItem('crm-mockup-ensign-v1', '{not json'));
  const e1 = errors.length; await reload(); await go('#/home');
  ok('corrupt saved data falls back to seed', errors.length === e1 && await page.evaluate(() => DB.contacts.length === 18));

  await browser.close();
  console.log(results.join('\n'));
  console.log(errors.length ? '\nJS ERRORS:\n' + [...new Set(errors)].join('\n') : '\nNo JS errors.');
  process.exitCode = errors.length || results.some(r => r.startsWith('FAIL')) ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1 });
