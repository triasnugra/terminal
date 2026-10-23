import { toWib } from './util/time.js';
import { summarize, groupBy, periodStats, markClusters, compareAll } from './statistics/stats.js';

const view = (s, cl) => ({
  id: s.setupId, engine: s.engine, analysisWib: s.analysisTimeWib, analysisUtc: s.analysisTimeUtc, ticker: s.ticker,
  direction: s.direction, entry: s.entryPrice, entryRange: s.entryRange, tp: s.takeProfit, sl: s.stopLoss, rr: s.riskReward,
  reason: s.entryReason, timeframe: s.timeframe, originalStatus: s.originalStatus,
  result: s.evaluation?.result ?? 'PENDING', resultUtc: s.evaluation?.resultTimeUtc ?? null, resultWib: toWib(s.evaluation?.resultTimeUtc),
  resultTimeSource: s.evaluation?.resultTimeSource ?? null, r: s.evaluation?.rMultiple ?? null, notes: s.evaluation?.notes ?? [],
  reasonCode: s.evaluation?.reasonCode ?? null, warnings: s.warnings ?? [], isPrimary: cl?.isPrimary ?? true,
  analysisTimeSource: s.analysisTimeSource, sourceResult: s.sourceResult ?? null, priceDataError: s.evaluation?.priceDataError ?? null,
});
const ev = (s) => s.evaluation || {};
const isRes = (s) => ['TP', 'SL'].includes(ev(s).result);

/** Kurva R kumulatif per mesin (urut waktu hasil) untuk grafik ekuitas. */
const curve = (list) => { let c = 0; return list.filter(isRes).sort((a, b) => Date.parse(ev(a).resultTimeUtc) - Date.parse(ev(b).resultTimeUtc))
  .map((s) => [ev(s).resultTimeUtc, +(c += ev(s).rMultiple).toFixed(3)]); };

function health(id, runs, setups) {
  const rs = runs.map((r) => r.engines?.[id]).filter(Boolean);
  const last = rs.at(-1) ?? null;
  const okSet = new Set(['OK', 'OK_NO_SETUPS']);
  let streak = 0; for (let i = rs.length - 1; i >= 0 && !okSet.has(rs[i].status); i--) streak++;
  const lastOkRun = [...runs].reverse().find((r) => okSet.has(r.engines?.[id]?.status));
  const newest = setups.map((s) => s.analysisTimeUtc).sort().at(-1) ?? null;
  return { status: last?.status ?? 'NO_RUN', emptyKind: last?.emptyKind ?? null, errors: last?.errors ?? [], warnings: last?.warnings ?? [],
    cards: last?.cards ?? 0, failureStreak: streak, lastOkUtc: lastOkRun?.runAtUtc ?? null, runs: rs.length,
    uptime: rs.length ? rs.filter((r) => okSet.has(r.status)).length / rs.length : null, newestSetupUtc: newest, forward: last?.forward ?? null };
}

/** Konsensus per simbol: setup terbaru tiap mesin dalam jendela 48 jam. */
function consensus(setups, nowIso, hours = 48) {
  const cut = Date.parse(nowIso) - hours * 3600e3, by = new Map();
  for (const s of setups) if (s.symbol && s.direction && Date.parse(s.analysisTimeUtc) >= cut) {
    const m = by.get(s.symbol) || by.set(s.symbol, new Map()).get(s.symbol);
    const p = m.get(s.engine); if (!p || p.analysisTimeUtc < s.analysisTimeUtc) m.set(s.engine, s);
  }
  return [...by].map(([symbol, m]) => { const v = [...m.values()], L = v.filter((x) => x.direction === 'LONG').length, S = v.length - L;
    return { symbol, engines: v.length, long: L, short: S, agreement: v.length > 1 ? Math.max(L, S) / v.length : null, conflict: L > 0 && S > 0,
      detail: v.map((x) => ({ engine: x.engine, direction: x.direction, entry: x.entryPrice, result: ev(x).result ?? 'PENDING' })) }; })
    .filter((c) => c.engines > 1).sort((a, b) => b.engines - a.engines);
}

export function buildDashboard({ setups, diagnostics, cfg, nowIso, engineMeta = [], trackingStarted = {} }) {
  const ids = [...new Set([...engineMeta.map((e) => e.id), ...setups.map((s) => s.engine)])];
  const meta = Object.fromEntries(ids.map((id) => [id, engineMeta.find((e) => e.id === id) ?? { id, label: id }]));
  const clusters = markClusters(setups, cfg.cluster);
  const rows = setups.map((s) => view(s, clusters.get(s.setupId))).sort((a, b) => (a.analysisUtc < b.analysisUtc ? 1 : -1));
  const of = (e, scope, from) => setups.filter((s) => s.engine === e && (scope === 'all' || clusters.get(s.setupId).isPrimary)
    && (!from || s.analysisTimeUtc >= from) && s.analysisTimeSource !== 'unknown_before_tracking');

  // Jendela setara: mulai saat mesin termuda (yang punya data) mulai menerbitkan. Tanpa ini mesin berumur panjang tidak adil dibanding yang baru.
  const firsts = ids.map((e) => setups.filter((s) => s.engine === e && s.analysisTimeSource !== 'unknown_before_tracking').map((s) => s.analysisTimeUtc).sort()[0]).filter(Boolean);
  const commonFrom = firsts.length ? firsts.sort().at(-1) : null;

  const scopes = { independent: ['independent', null], all: ['all', null], common: ['independent', commonFrom] };
  const engines = {}, comparison = {};
  const copts = { minSample: cfg.minSamplePerEngine, iterations: cfg.bootstrapIterations };
  for (const [name, [sc, from]] of Object.entries(scopes)) {
    engines[name] = {}; const lists = {};
    for (const e of ids) {
      const l = of(e, sc, from); lists[e] = l;
      engines[name][e] = { summary: summarize(l), byTicker: groupBy(l, (s) => s.ticker), byDirection: groupBy(l, (s) => s.direction),
        byReason: groupBy(l, (s) => s.entryReason), daily: periodStats(l, 'daily'), weekly: periodStats(l, 'weekly'), monthly: periodStats(l, 'monthly'), curve: curve(l) };
    }
    comparison[name] = compareAll(lists, copts);
  }
  const runs = diagnostics.runs;
  const eng = Object.fromEntries(ids.map((e) => [e, { ...meta[e], trackingStartedUtc: trackingStarted[e] ?? null, health: health(e, runs, setups.filter((s) => s.engine === e)) }]));
  const q = {
    invalid: rows.filter((r) => r.result === 'INVALID'), ambiguous: rows.filter((r) => r.result === 'AMBIGUOUS'),
    unverified: rows.filter((r) => r.priceDataError), withWarnings: rows.filter((r) => r.warnings.length), nearDuplicates: rows.filter((r) => !r.isPrimary),
    sourceDisagreements: rows.filter((r) => ['TP', 'SL'].includes(r.sourceResult) && ['TP', 'SL'].includes(r.result) && r.sourceResult !== r.result),
    unknownAnalysisTime: rows.filter((r) => r.analysisTimeSource === 'unknown_before_tracking'),
  };
  return { generatedAtUtc: nowIso, generatedAtWib: toWib(nowIso), counts: { setups: rows.length, engines: ids.length }, commonFromUtc: commonFrom,
    engineIds: ids, engineInfo: eng, engines, comparison, consensus: consensus(setups, nowIso), setups: rows, quality: q,
    diagnostics: { lastRun: runs.at(-1) ?? null, runs: runs.slice(-50) },
    methodology: { source: 'Binance Spot klines', note: 'Hasil teoretis berbasis candle (bukan trading nyata): tanpa fee/slippage, fill saat harga menyentuh level. Semua mesin dievaluasi dengan aturan yang sama.' } };
}
