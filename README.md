# Benchmark 9 Mesin Analisis Crypto

Merekam setiap setup dari **9 mesin**, mengevaluasinya dengan aturan yang sama terhadap candle Binance
(TP / SL / dll.), lalu membandingkan performa. Hasil bersifat **teoretis berbasis candle**, bukan trading nyata.
Status tiap selector dan asumsi ada di `docs/VERIFIED.md`.

## Sembilan mesin dan cara pengambilan datanya
| ID | Mesin | URL | Tipe | Status |
|---|---|---|---|---|
| `gemini` | M1 Gemini | gemini-mesin.vercel.app | journal | siap |
| `chatgpt` | M2 ChatGPT | chatgpt-mesin-three.vercel.app | journal | siap (jurnal masih kosong per 2026-10-20) |
| `mesindeepseek` | M3 DeepSeek (Python) | triasnugra.github.io/mesindeepseek | static-html | siap; level dibulatkan 4 desimal oleh sumber |
| `deepseek` | M4 DeepSeek | deepseek-mesin.vercel.app | journal | siap |
| `grokberyl` | M5 Grok Beryl | grok-mesin-beryl.vercel.app | browser-unverified | **belum ada pembaca** (lihat bawah) |
| `grok` | M6 Grok | mesingrok.vercel.app | grok-desk | pembaca dari kode sumber; belum diuji di situs hidup |
| `crypto` | M7 Crypto | triasnugra.github.io/crypto | crypto-dom | terverifikasi |
| `tn` | M8 TN | triasnugra.github.io/tn | journal | terverifikasi |
| `tnv2` | M9 TN v2 | tnv2.vercel.app | journal | siap (zip tidak memuat folder `data/`; jurnal diasumsikan dibuat workflow-nya) |

- **journal**: `data/journal.json` publik, tanpa browser, waktu analisis dari sumber (paling andal).
- **static-html**: halaman statis dari `main.py`; waktu analisis = `first_seen`.
- **grok-desk**: Playwright memilih tiap pair lalu membaca daftar setup; waktu = `first_seen`.
- **browser-unverified**: Grok Beryl memindai di browser dan menyimpan paper-trade di `localStorage` pengunjung, jadi tidak ada riwayat publik.
  Selector belum diverifikasi, sehingga sistem melapor `NEEDS_SELECTOR_VERIFICATION` dan tidak menebak. Jalankan **Discover**, lalu tulis extractor.

## Setup (cukup lewat web GitHub)
1. Unggah isi proyek ke repo (termasuk `.github/`).
2. **Settings → Pages → Source: GitHub Actions.** **Settings → Actions → General → Workflow permissions: Read and write.**
3. **Actions → "Collect, evaluate, deploy" → Run workflow.** Jalan terjadwal ±30 menit (best-effort).
4. Dashboard: `https://<user>.github.io/<repo>/`.
5. (Opsional) `node scripts/seed.mjs gemini=journal.json ...` mengisi riwayat awal dari jurnal yang sudah diunduh. Aman diulang.

Tidak perlu GitHub Secrets (data publik).

## Alur
`collect` (sumber → item mentah → `TO_RECORD[engine]` → `buildRecord` → upsert idempoten) →
`evaluate` (candle Binance → status) → `build` (statistik → `site/data/dashboard.json`).
`npm test` dijalankan di workflow sebelum koleksi; kegagalan test menghentikan run.

## Aturan utama
- **Status final:** `TP`, `SL`, `CANCELLED`, `EXPIRED`, `INVALID`, `AMBIGUOUS`. `PENDING` untuk yang masih aktif.
- **Hasil sumber disimpan terpisah** (`sourceResult`). Dashboard menampilkan ketidaksesuaian TP/SL antara
  sumber dan evaluasi kita di Data Quality.
- **Waktu analisis:**
  - `source`: dari sumber (Mesin 2).
  - `first_seen`: waktu scan pertama kali melihat setup (Mesin 1, setelah pelacakan dimulai).
  - `unknown_before_tracking`: setup yang sudah ada saat pelacakan dimulai (Mesin 1). Tidak dievaluasi.
- **Setup baru dari sumber yang sama tidak menimpa histori.** ID Mesin 2 berasal dari hash `h` jurnal;
  ID Mesin 1 berasal dari level kartu (stabil antar-scan).
- **TP tercapai sebelum entry tersentuh** → `EXPIRED`, bukan menang.
- **TP dan SL dalam candle yang sama** → diselesaikan dengan candle 1m; jika tetap ambigu → `AMBIGUOUS`.
- **Perbandingan**: matriks selisih expectancy berpasangan (bootstrap). Hanya mesin dengan ≥30 setup selesai ikut diuji; ambang signifikansi
  dikoreksi Bonferroni (9 mesin = 36 pasangan). Peringkat tak diberi nomor bila sampel kurang.
- **Tiga cakupan sampel**: *Independen* (default), *Semua*, dan *Setara* (hanya sejak semua mesin berdata aktif, agar mesin lama dan baru adil).
- Sampel independen: satu setup per klaster near-duplicate (engine + simbol + arah, ≤24 jam, entry ±1%).

## Asumsi & keterbatasan
- Fill limit dianggap terjadi saat harga menyentuh level. Tanpa fee, funding, dan slippage.
- R = |TP−fill| / |fill−SL| untuk TP; −1 untuk SL. Hanya TP pertama yang dievaluasi.
- TTL entry 72 jam dan batas hold 30 hari (config/settings.json). Journal Mesin 2 memakai `due` 7 hari;
  aturan yang sama diterapkan ke kedua mesin, jadi perbedaan status kedaluwarsa dicatat, bukan disamakan diam-diam.
- Setup berurutan dari satu mesin berkorelasi; CI bersifat indikatif.

## Troubleshooting
| Gejala | Penyebab / tindakan |
|---|---|
| `FETCH_FAILED` Mesin 1 | Lihat Diagnostics (HTTP/timeout/JS error). Run ulang. |
| `ZERO_CARDS_UNCONFIRMED` Mesin 1 | Struktur halaman mungkin berubah. Jalankan Discover dan bandingkan dengan `docs/VERIFIED.md`. |
| `SUMMARY_COUNT_MISMATCH` | Jumlah kartu tidak sama dengan ringkasan halaman. Periksa `rendered.html` terbaru. |
| `JOURNAL_HTTP_*` Mesin 2 | journal.json tidak bisa diambil; run berikutnya akan mencoba lagi. |
| `TIME_MISMATCH` | Field `t` tidak sama dengan `waktu` pada entri jurnal. Dicatat sebagai peringatan. |
| `priceDataError` (HTTP 451/403) | Binance memblokir runner. Ubah `binanceBaseUrls` di settings. |
| Push gagal | Concurrency dan retry sudah ada. Pastikan izin *Read and write*. |

## Menjalankan lokal
`npm ci && npm test`. Koleksi nyata membutuhkan `npx playwright install chromium`.
