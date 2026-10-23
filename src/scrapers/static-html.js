import { extractStaticSignals } from '../parsers/signals.js';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function scrapeStaticHtml(cfg, fetchImpl = globalThis.fetch) {
  const t0 = Date.now();
  const diag = { httpStatus: null, errors: [], warnings: [], durationMs: 0, source: cfg.url, meta: null };
  const out = (status, items = []) => { diag.durationMs = Date.now() - t0; return { status, items, diagnostics: diag }; };
  let html = null, lastErr;
  for (let i = 0; i < (cfg.retries ?? 3) && html == null; i++) {
    try {
      const res = await fetchImpl(`${cfg.url}${cfg.url.includes('?') ? '&' : '?'}_=${Date.now()}`, { signal: AbortSignal.timeout(cfg.fetchTimeoutMs ?? 30000), headers: { 'cache-control': 'no-cache' } });
      diag.httpStatus = res.status;
      if (!res.ok) lastErr = new Error(`HTTP_${res.status}`); else html = await res.text();
    } catch (e) { lastErr = e; }
    if (html == null) await sleep(1000 * 2 ** i);
  }
  if (html == null) { diag.errors.push(`HTML_FETCH_ERROR: ${String(lastErr?.message).slice(0, 160)}`); return out('FAILED'); }
  const { items, cards } = extractStaticSignals(html);
  diag.meta = { cards, confirmedEmpty: cards > 0 && items.length === 0 };
  if (cards === 0) { diag.errors.push('NO_COIN_CARDS: struktur halaman berubah atau laporan kosong'); return out('ZERO_CARDS_UNCONFIRMED'); }
  return out(items.length ? 'OK' : 'OK_NO_SETUPS', items);
}
