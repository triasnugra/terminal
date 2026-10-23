// Registri 9 mesin. Satu-satunya tempat yang tahu cara mengambil & memetakan tiap mesin.
import { buildRecord } from './normalize.js';
import { parseCryptoCard } from './parsers/crypto.js';
import { parseJournalEntry } from './parsers/tn.js';
import { parseSignalCard } from './parsers/signals.js';

export const toRecordFor = (type, engine) => ({
  journal: (item, ctx) => buildRecord(parseJournalEntry(item, engine), ctx),
  'crypto-dom': (item, ctx) => buildRecord(parseCryptoCard(item), ctx),
  'static-html': (item, ctx) => buildRecord(parseSignalCard(item, engine), ctx),
  'grok-desk': (item, ctx) => buildRecord(parseSignalCard(item, engine), ctx),
}[type]);

export const needsBrowser = (cfg) => ['crypto-dom', 'grok-desk', 'browser-unverified'].includes(cfg.type);

export function engineList(sources) {
  return Object.entries(sources.engines).map(([id, c]) => ({ id, label: c.label, type: c.type, family: c.family, url: c.url }));
}

/** Pilih scraper per tipe. ctx = BrowserContext (hanya untuk tipe browser). */
export async function scrapeByType(id, cfg, ctx) {
  switch (cfg.type) {
    case 'journal': return (await import('./scrapers/tn.js')).scrapeTn(cfg);
    case 'static-html': return (await import('./scrapers/static-html.js')).scrapeStaticHtml(cfg);
    case 'crypto-dom': case 'grok-desk': case 'browser-unverified': {
      const page = await ctx.newPage();
      try {
        if (cfg.type === 'crypto-dom') return await (await import('./scrapers/crypto.js')).scrape(page, cfg);
        if (cfg.type === 'grok-desk') return await (await import('./scrapers/grok.js')).scrapeGrok(page, cfg);
        const { runScrape } = await import('./scrapers/base.js');
        return await runScrape(page, cfg, null); // tidak menebak selector -> NEEDS_SELECTOR_VERIFICATION
      } finally { await page.close(); }
    }
    default: throw new Error(`UNKNOWN_ENGINE_TYPE:${cfg.type}`);
  }
}
