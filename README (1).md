# Papan Downtime — sumber data `datadt`

Dashboard downtime produksi berbasis HTML/JS statis. Data diambil langsung dari sheet
`datadt` di Google Sheets lewat browser pengguna — tidak perlu backend, cocok untuk
hosting di GitHub Pages.

## ⚠️ Langkah wajib sebelum dipakai

### 1. Isi GID sheet "datadt"

Buka `app.js`, cari bagian `CONFIG` di paling atas:

```js
const CONFIG = {
  SHEET_ID: '1RBYWSWbJSlrtwx3t33y6oMLLbp-PmTbSjEAB9ccipCY',
  DATADT_GID: 'PASTE_GID_DATADT_HERE' // <-- ganti dengan angka gid sheet "datadt"
};
```

Cara mencari gid: buka spreadsheet-nya, klik tab **datadt**, lihat URL di address bar —
akan ada bagian `#gid=1234567890`. Salin angka itu dan ganti `'PASTE_GID_DATADT_HERE'`
(hapus tanda kutipnya, cukup angka, misal `DATADT_GID: 1234567890`). Selama nilai ini
belum diisi, dashboard akan menampilkan pesan peringatan dan tidak mencoba memuat data.

### 2. Atur akses sheet

Karena data diambil langsung dari browser pengguna (tanpa API key), sheet **harus**
dibagikan dengan opsi:

> Share → General access → **Anyone with the link → Viewer**

Kalau tidak, endpoint akan mengembalikan halaman login Google (bukan CSV) dan dashboard
akan menampilkan pesan error di bagian atas halaman.

## Struktur data yang diharapkan

Sheet `datadt` adalah data tunggal (long-format) dengan header persis seperti berikut,
dalam urutan bebas:

| Tanggal  | Shift | Mesin | Kategori | Downtime | Other Note |
|----------|-------|-------|----------|----------|------------|
| 20260805 | 1     | ...   | ...      | 15       | ...        |

- **Tanggal**: angka 8 digit `YYYYMMDD` (contoh `20260805` → 5 Agustus 2026).
- **Downtime**: angka (menit). Sel kosong dianggap `0`.
- **Other Note**: teks bebas, boleh kosong.
- Satu baris = satu kejadian downtime (satu kategori, satu durasi).

## Menjalankan secara lokal

File ini statis (HTML/CSS/JS), tapi `fetch()` butuh server HTTP, bukan `file://`:

```bash
cd downtime-dashboard
python3 -m http.server 8000
# buka http://localhost:8000
```

## Deploy ke GitHub Pages

1. Buat repository baru di GitHub, push isi folder ini (`index.html`, `style.css`, `app.js`)
   ke branch `main`.
2. **Settings → Pages** di repo tersebut.
3. **Build and deployment → Source**: pilih **Deploy from a branch**.
4. Pilih branch `main`, folder `/ (root)`, lalu **Save**.
5. Tunggu 1–2 menit, situs aktif di `https://<username>.github.io/<nama-repo>/`.

## Fitur

- **Filter**: rentang tanggal, shift, mesin, kategori, dan pencarian teks pada catatan.
- **KPI strip**: total downtime, jumlah entri, rata-rata per entri, kategori terbesar.
- **Komposisi Downtime** (elemen signature): segmen pastel proporsional per kategori,
  plus titik status di header (hijau/kuning/merah, berdasarkan rata-rata downtime filter
  aktif dibanding rata-rata keseluruhan data).
- **Insight otomatis**: kategori/mesin/shift dengan downtime tertinggi, tren naik-turun
  antar paruh periode, jumlah entri berdurasi nol, entri dengan durasi tunggal terbesar.
- **4 grafik dinamis** (Chart.js): Pareto kategori (batang + kumulatif %), tren harian,
  downtime per mesin, downtime per shift — semua update otomatis mengikuti filter.
- **Tabel log**: bisa diurutkan per kolom (klik header), kategori ditandai pil warna
  pastel sesuai palet chart, dan bisa diunduh sebagai CSV sesuai filter aktif.

## Tema

Palet pastel (biru, hijau sage, pink, lavender, kuning butter, peach, teal, rose) dengan
latar gradasi lembut, kartu putih beraksen warna lembut, dan tipografi Poppins (judul) +
Inter (isi) + JetBrains Mono (angka/data) agar tetap mudah dibaca tanpa terasa terlalu
mencolok maupun terlalu datar.

## Mengganti sumber / menyesuaikan kolom

Nama kolom yang dicari ada di `app.js`:

```js
const COL = { TANGGAL: 'Tanggal', SHIFT: 'Shift', MESIN: 'Mesin', KATEGORI: 'Kategori', DOWNTIME: 'Downtime', NOTE: 'Other Note' };
```

Jika nama header di sheet berbeda, sesuaikan nilai string di objek ini — tidak perlu ubah
bagian lain kode.
