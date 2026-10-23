import { withTimeout } from '../browser/session.js';

// Dijalankan DI DALAM halaman mesingrok: membaca <li> setup (struktur dari src/routes/index.tsx, terverifikasi dari kode sumber).
export function extractGrokSetups() {
  const num = (s) => parseFloat(String(s).replace(/,/g, ''));
  const items = [];
  for (const li of document.querySelectorAll('li')) {
    const t = li.innerText.replace(/\s+/g, ' ').trim();
    const m = t.match(/^(LONG|SHORT)\s+skor\s+(\d+)\s+(.*?)\s+Entry\s+([\d.,]+)[–-]([\d.,]+)\s+·\s+SL\s+([\d.,]+)(?:\s+·\s+target\s+([\d.,]+))?/i);
    if (m) items.push({ direction: m[1].toUpperCase(), score: +m[2], reason: m[3], entryLow: num(m[4]), entryHigh: num(m[5]), sl: num(m[6]), tp: m[7] ? num(m[7]) : null });
  }
  return { items, meta: { rendered: !!document.querySelector('main') } };
}

export async function scrapeGrok(page, cfg) {
  const t0 = Date.now();
  const diag = { httpStatus: null, errors: [], warnings: [], durationMs: 0, meta: { perPair: {} } };
  const out = (status, items = []) => { diag.durationMs = Date.now() - t0; return { status, items, diagnostics: diag }; };
  try {
    const resp = await page.goto(cfg.url, { waitUntil: 'domcontentloaded', timeout: cfg.gotoTimeoutMs });
    diag.httpStatus = resp?.status?.() ?? null;
    if (diag.httpStatus >= 400) { diag.errors.push(`HTTP_${diag.httpStatus}`); return out('FAILED'); }
  } catch (e) { diag.errors.push(`GOTO_ERROR: ${e.message.slice(0, 160)}`); return out('FAILED'); }

  const all = []; let okPairs = 0;
  for (const pair of cfg.pairs) {
    try {
      await withTimeout(page.locator('select').first().selectOption(pair), 10000, `select-${pair}`);
      await withTimeout(page.getByRole('button', { name: 'Analisis' }).click(), 10000, `click-${pair}`);
      await withTimeout(page.waitForFunction(() => [...document.querySelectorAll('button')].some((b) => b.innerText.trim() === 'Analisis' && !b.disabled), null, { timeout: cfg.scanTimeoutMs }), cfg.scanTimeoutMs + 5000, `wait-${pair}`);
      const err = await page.locator('p.text-short').first().innerText({ timeout: 500 }).catch(() => null);
      if (err) { diag.warnings.push(`${pair}: ${err.slice(0, 100)}`); continue; }
      const r = await withTimeout(page.evaluate(extractGrokSetups), 15000, `extract-${pair}`);
      diag.meta.perPair[pair] = r.items.length; okPairs++;
      all.push(...r.items.map((x) => ({ ...x, symbol: pair.replace('USDT', '/USDT'), interval: '4h', status: 'SETUP', roundedByUi: true })));
    } catch (e) { diag.warnings.push(`${pair}: ${e.message.slice(0, 120)}`); }
  }
  if (okPairs === 0) { diag.errors.push('ALL_PAIRS_FAILED'); return out('FAILED'); }
  diag.meta.confirmedEmpty = all.length === 0 && okPairs === cfg.pairs.length;
  return out(all.length ? 'OK' : diag.meta.confirmedEmpty ? 'OK_NO_SETUPS' : 'ZERO_CARDS_UNCONFIRMED', all);
}
