// Seed satu kali dari journal.json yang sudah diunduh (opsional). Idempoten: id = engine|h, sama dengan collector.
// Pemakaian: node scripts/seed.mjs gemini=/path/journal.json deepseek=/path/journal.json ...
import fs from 'node:fs';
import { buildRecord } from '../src/normalize.js';
import { parseJournalEntry } from '../src/parsers/tn.js';
import * as store from '../src/storage/store.js';
import { toIso } from '../src/util/time.js';
const now = Date.now(), cfg = JSON.parse(fs.readFileSync(new URL('../config/settings.json', import.meta.url), 'utf8'));
let setups = store.loadSetups(); const meta = store.loadMeta();
for (const arg of process.argv.slice(2)) {
  const [engine, file] = arg.split('=');
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  const recs = j.map((e) => buildRecord(parseJournalEntry(e, engine), { scanTimeMs: now, firstRun: false, sourceUrl: null }));
  const up = store.upsertSetups(setups, recs, toIso(now), cfg.cancelPatterns); setups = up.setups;
  meta.trackingStartedUtc[engine] ??= toIso(now);
  console.log(engine, 'ditambah', up.added, 'dari', j.length);
}
store.saveSetups(setups); store.saveMeta(meta);
