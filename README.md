# 🫾 Square AFB Report Generator

A small local app that generates Square payment summaries filtered to include **only Minot Air Force Base (AFB)** transactions and exclude regular Minot city sales.
It talks directly to the Square API, aggregates per-day totals, and outputs clean **CSV** and **Excel** reports with **7.5% gross projections**.

Run it locally, open the front-end calendar, select your months or quarters, and click **“Run Report.”**
The backend handles everything — fetching payments, filtering only **AFB-related taxes**, skipping zero-tax days, and saving reports automatically.

---

## 📂 Generated Files

```
afb-summary-2025-09.csv
afb-summary-2025-09.xlsx
```

---

## 📊 Each report includes:

- Date
- Gross Sales
- Net Sales
- Taxes (**AFB only**)
- Tips
- Total Sales
- Gross × 7.5%

Everything that isn’t AFB (like “Minot, North Dakota (58701)”) is filtered out.

---

## ⚙️ To run it

```bash
npm install
cp .env.example .env
node server.js
```

Then open **[http://localhost:3000](http://localhost:3000)** in your browser, select your dates, and hit the 🚀 **Run Report** button.
The backend aggregates results and saves the files in the same folder.

---

## 💻 CLI Usage

```bash
node server.js --env .env --months 2025-07,2025-08,2025-09
node server.js --env .env --range 2025-01-01:2025-03-31
```

---

Everything is written in **plain Node (ESM)** with **Express**, **ExcelJS**, and **fetch**.
**License:** MIT.
Built by a guy who just wanted to separate AFB taxes and ended up writing an analytics engine.
