// Parser sinyal generik untuk mesin tanpa waktu analisis (HTML statis, Grok desk).
// Item mentah: { symbol, direction, entryLow, entryHigh, sl, tp, setup, reason, status, interval }.
const num = (x) => { const v = typeof x === 'number' ? x : parseFloat(String(x ?? '').replace(/,/g, '')); return Number.isFinite(v) ? v : null; };

export function parseSignalCard(it, engine) {
  const lo = num(it.entryLow), hi = num(it.entryHigh ?? it.entryLow);
  const range = lo != null && hi != null && lo !== hi ? [lo, hi] : null;
  const entry = lo != null && hi != null ? (lo + hi) / 2 : null;
  const sl = num(it.sl), tp = num(it.tp);
  const warnings = [];
  if (tp == null) warnings.push('NO_TARGET: sumber tidak memberi target; tidak bisa dievaluasi.');
  // Level yang dibulatkan UI (mis. 4 digit signifikan) membuat evaluasi kurang presisi.
  if (it.roundedByUi) warnings.push('LEVELS_ROUNDED_BY_UI: harga dibulatkan oleh tampilan sumber.');
  return {
    engine, ticker: it.symbol, direction: it.direction, entryType: 'limit',
    entryPrice: entry, entryRange: range, takeProfit: [tp], stopLoss: sl,
    entryReason: it.reason || it.setup || null, timeframe: it.interval ?? null,
    originalStatus: it.status ?? null,
    // waktu analisis tidak ada di sumber -> buildRecord memakai first_seen / unknown_before_tracking
    idKey: [engine, it.symbol, it.direction, entry, sl].join('|'),
    rawData: it, warnings,
  };
}

/** Mesin Python (mesindeepseek): kartu dari docs/index.html hasil main.py. Hanya status "SIGNAL FOUND" yang berisi sinyal. */
export function extractStaticSignals(html) {
  const chunks = String(html).split(/<h2\b/i).slice(1);
  const items = []; let cards = 0;
  const strip = (s) => s.replace(/<[^>]+>/g, '').trim();
  for (const ch of chunks) {
    const sym = strip(ch.slice(ch.indexOf('>') + 1, ch.indexOf('</h2>')));
    if (!/^[A-Z0-9]{2,15}\/[A-Z]{3,5}$/.test(sym)) continue;
    cards++;
    const re = /font-bold mb-2">\s*(LONG|SHORT)\s*-\s*([^<]*)<\/p>[\s\S]*?Entry<\/span>\s*<strong>([\d.]+)<\/strong>[\s\S]*?Stop Loss<\/span>\s*<strong>([\d.]+)<\/strong>[\s\S]*?Target[^<]*<\/span>\s*<strong>([\d.]+)<\/strong>/g;
    for (const m of ch.matchAll(re)) {
      items.push({ symbol: sym, direction: m[1], setup: m[2].trim(), entryLow: m[3], entryHigh: m[3], sl: m[4], tp: m[5], status: 'SIGNAL FOUND', interval: '4h', roundedByUi: true });
    }
  }
  return { items, cards };
}
