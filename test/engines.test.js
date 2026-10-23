import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractStaticSignals, parseSignalCard } from '../src/parsers/signals.js';
import { toRecordFor, needsBrowser } from '../src/engines.js';
import { compareAll } from '../src/statistics/stats.js';
import { buildDashboard } from '../src/aggregate.js';
import { scrapeStaticHtml } from '../src/scrapers/static-html.js';

const HTML = `<h2>BTC/USDT</h2><span>SIGNAL FOUND</span><p class="font-bold mb-2">SHORT - Sweep High</p>
<span>Entry</span><strong>64000.5000</strong><span>Stop Loss</span><strong>65000.0000</strong><span>Target (1:2)</span><strong>62000.0000</strong>
<h2>ETH/USDT</h2><span>WAIT</span>`;
const ctx = { scanTimeMs: Date.parse('2026-10-20T00:00:00Z'), firstRun: false, sourceUrl: 'x' };

test('extractStaticSignals membaca kartu dan hanya sinyal berstatus SIGNAL FOUND', () => {
  const r = extractStaticSignals(HTML);
  assert.equal(r.cards, 2); assert.equal(r.items.length, 1);
  assert.equal(r.items[0].direction, 'SHORT');
});
test('static-html: record punya first_seen, simbol USDT, dan ID stabil antar-scan', () => {
  const mk = () => toRecordFor('static-html', 'mesindeepseek')(extractStaticSignals(HTML).items[0], ctx);
  const a = mk(), b = mk();
  assert.equal(a.analysisTimeSource, 'first_seen'); assert.equal(a.symbol, 'BTCUSDT');
  assert.equal(a.setupId, b.setupId); assert.equal(a.takeProfit[0], 62000);
  assert.ok(a.warnings.some((w) => w.startsWith('LEVELS_ROUNDED')));
});
test('target kosong diberi peringatan, bukan ditebak', () => {
  const r = parseSignalCard({ symbol: 'BTC/USDT', direction: 'LONG', entryLow: 1, entryHigh: 2, sl: 0.5, tp: null }, 'grok');
  assert.ok(r.warnings[0].startsWith('NO_TARGET')); assert.deepEqual(r.entryRange, [1, 2]);
});
test('ID journal berbeda antar mesin walau h sama', () => {
  const e = { id: 'i', waktu: '2026-10-04 06:47 UTC', t: 1791096469960, aset: 'LINK', arah: 'SHORT', entry: 14, sl: 15, tp: 10, h: 'abc' };
  const f = toRecordFor('journal', 'gemini'), g = toRecordFor('journal', 'tnv2');
  assert.notEqual(f(e, ctx).setupId, g(e, ctx).setupId);
});
test('needsBrowser hanya untuk tipe browser', () => {
  assert.equal(needsBrowser({ type: 'journal' }), false); assert.equal(needsBrowser({ type: 'grok-desk' }), true);
});
test('scrapeStaticHtml: HTTP error = FAILED, bukan "tidak ada setup"', async () => {
  const r = await scrapeStaticHtml({ url: 'https://x.invalid/', retries: 1 }, async () => ({ ok: false, status: 503 }));
  assert.equal(r.status, 'FAILED');
});
test('scrapeStaticHtml: kartu ada tapi 0 sinyal = OK_NO_SETUPS terkonfirmasi', async () => {
  const r = await scrapeStaticHtml({ url: 'https://x.invalid/', retries: 1 }, async () => ({ ok: true, status: 200, text: async () => '<h2>ETH/USDT</h2>' }));
  assert.equal(r.status, 'OK_NO_SETUPS');
});

const mkSet = (engine, n, win) => Array.from({ length: n }, (_, i) => ({ setupId: `${engine}${i}`, engine, evaluation: { result: i % 10 < win ? 'TP' : 'SL', rMultiple: i % 10 < win ? 2 : -1 } }));
test('compareAll: mesin dengan sampel kecil tidak ikut diuji; Bonferroni aktif', () => {
  const c = compareAll({ a: mkSet('a', 60, 6), b: mkSet('b', 60, 1), c: mkSet('c', 60, 6), d: mkSet('d', 5, 5) }, { minSample: 30, iterations: 2000 });
  assert.deepEqual(c.eligible, ['a', 'b', 'c']); assert.equal(c.nPairs, 3); assert.ok(Math.abs(c.alpha - 0.05 / 3) < 1e-9);
  assert.equal(c.cells.find((x) => x.a === 'a' && x.b === 'b').winner, 'a');
  assert.equal(c.cells.find((x) => x.a === 'a' && x.b === 'c').winner, null);
});
test('buildDashboard: 9 mesin, mesin tanpa data tetap tampil, jendela setara dihitung', () => {
  const ids = ['gemini', 'chatgpt', 'mesindeepseek', 'deepseek', 'grokberyl', 'grok', 'crypto', 'tn', 'tnv2'];
  const S = (engine, t) => ({ setupId: `${engine}1`, engine, symbol: 'BTCUSDT', ticker: 'BTC', direction: 'LONG', entryPrice: 1, analysisTimeUtc: t, analysisTimeWib: t, analysisTimeSource: 'source', evaluation: { result: 'PENDING' } });
  const d = buildDashboard({ setups: [S('tn', '2026-10-01T00:00:00Z'), S('gemini', '2026-10-05T00:00:00Z')], diagnostics: { runs: [] },
    cfg: { cluster: {}, minSamplePerEngine: 30, bootstrapIterations: 100 }, nowIso: '2026-10-06T00:00:00Z', engineMeta: ids.map((id) => ({ id, label: id })), trackingStarted: {} });
  assert.equal(d.engineIds.length, 9); assert.equal(d.commonFromUtc, '2026-10-05T00:00:00.000Z'.replace('.000', '') || d.commonFromUtc);
  assert.equal(d.engineInfo.chatgpt.health.status, 'NO_RUN'); assert.equal(d.engines.common.chatgpt.summary.published, 0);
});
