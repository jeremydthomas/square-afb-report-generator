// Node 18+ (ESM). Multi-month / range Square summary (AFB-only taxes)
// Usage examples:
//   node index.js --env .env --dates 2025-08-13,2025-08-22
//   node index.js --env .env --range 2025-01-01:2025-03-31
//   node index.js --env .env --months 2025-01,2025-02,2025-03
// Optional: --sandbox  --locations L1,L2  --tz-offset -05:00  --outfile afb-summary

import fs from "node:fs";
import process from "node:process";
import ExcelJS from "exceljs";

// ---------------- CLI + ENV ----------------
const args = parseArgs(process.argv.slice(2));
if (args.env && fs.existsSync(args.env)) {
	for (const ln of fs.readFileSync(args.env, "utf8").split(/\r?\n/)) {
		const m = ln.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
		if (m) process.env[m[1]] = stripQuotes(m[2]);
	}
}

const ACCESS_TOKEN = process.env.SQUARE_ACCESS_TOKEN;
if (!ACCESS_TOKEN) {
	console.error(
		"❌ Missing SQUARE_ACCESS_TOKEN (put it in .env or export it)."
	);
	process.exit(1);
}

const BASE = args.sandbox
	? "https://connect.squareupsandbox.com"
	: "https://connect.squareup.com";
const TZ_OFFSET = args["tz-offset"] || "-05:00";

// Determine date set
const DATES = await loadDates(args.dates, args.range, args.months);
if (!DATES.length) {
	console.error("❌ No dates provided (use --dates, --range, or --months).");
	process.exit(1);
}
const LOCATIONS = await resolveLocations(args.locations);

// Auto label (for filenames and worksheet tab)
const PERIOD_LABEL = inferPeriodLabel(DATES, args);
const OUTBASE = args.outfile || `afb-summary-${PERIOD_LABEL}`;

// ---------------- Aggregation ----------------
const sums = new Map(); // date -> { gross, net, tax, tip, total }
const add = (d, key, cents) => {
	if (!sums.has(d)) sums.set(d, { gross: 0, net: 0, tax: 0, tip: 0, total: 0 });
	sums.get(d)[key] += cents || 0;
};

for (const date of DATES) {
	const { begin, end } = dayBounds(date, TZ_OFFSET);
	const payments = [];
	for (const loc of LOCATIONS.length ? LOCATIONS : [undefined]) {
		payments.push(...(await listPayments(begin, end, loc)));
	}
	const orderIds = [
		...new Set(payments.map((p) => p.order_id).filter(Boolean)),
	];

	const { afbTaxByOrder, afbOnlyOrderIds } =
		await batchRetrieveOrderAFB(orderIds);

	for (const p of payments) {
		if (!afbOnlyOrderIds.has(p.order_id)) continue; // only AFB-only orders

		const total = money(p.total_money);
		const tip = money(p.tip_money);
		const tax = afbTaxByOrder.get(p.order_id) || 0;
		const net = total - tax - tip;

		add(date, "total", total);
		add(date, "tax", tax);
		add(date, "tip", tip);
		add(date, "net", net);
		add(date, "gross", net);
	}
}

// 🧹 Remove days with no AFB-only payments (no totals or tax)
let skippedCount = 0;
for (const [date, s] of sums.entries()) {
	if (s.total === 0 && s.tax === 0 && s.net === 0 && s.tip === 0) {
		sums.delete(date);
		skippedCount++;
	}
}
if (skippedCount > 0)
	console.log(`🧹 Skipped ${skippedCount} day(s) with no AFB-only sales`);
else console.log("✅ All remaining days had AFB-only activity");

// 🔄 Sort remaining dates
const orderedDates = [...sums.keys()].sort();

// ---------------- CSV output ----------------
const headers = [
	"date",
	"gross_sales",
	"net_sales",
	"taxes",
	"tips",
	"total_sales",
	"gross_sales_x7_5pct",
];
const csv = [headers.join(",")];
let grand = { gross: 0, net: 0, tax: 0, tip: 0, total: 0 };

for (const d of orderedDates) {
	const s = sums.get(d);
	if (!s) continue;

	const gross = s.gross / 100;
	const net = s.net / 100;
	const tax = s.tax / 100;
	const tip = s.tip / 100;
	const tot = s.total / 100;
	const g75 = +(gross * 0.075).toFixed(2);

	csv.push(
		[
			d,
			fix2(gross),
			fix2(net),
			fix2(tax),
			fix2(tip),
			fix2(tot),
			fix2(g75),
		].join(",")
	);

	grand.gross += gross;
	grand.net += net;
	grand.tax += tax;
	grand.tip += tip;
	grand.total += tot;
}

const grandG75 = +(grand.gross * 0.075).toFixed(2);
csv.push(
	[
		"***TOTAL***",
		fix2(grand.gross),
		fix2(grand.net),
		fix2(grand.tax),
		fix2(grand.tip),
		fix2(grand.total),
		fix2(grandG75),
	].join(",")
);

fs.writeFileSync(`${OUTBASE}.csv`, csv.join("\n") + "\n", "utf8");
console.log(`✅ Wrote ${OUTBASE}.csv`);

// ---------------- XLSX output ----------------
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet(`AFB ${PERIOD_LABEL}`);

ws.addRow(headers);
ws.getRow(1).font = { bold: true };

for (const d of orderedDates) {
	const s = sums.get(d);
	if (!s) continue;

	const gross = s.gross / 100;
	const net = s.net / 100;
	const tax = s.tax / 100;
	const tip = s.tip / 100;
	const tot = s.total / 100;

	const r = ws.addRow([d, gross, net, tax, tip, tot, null]);
	r.getCell(7).value = { formula: `B${r.number}*0.075` };
}

// Totals row
const firstDataRow = 2;
const lastDataRow = ws.rowCount + 1;
const totals = ws.addRow([
	"TOTAL",
	{ formula: `SUM(B${firstDataRow}:B${lastDataRow - 1})` },
	{ formula: `SUM(C${firstDataRow}:C${lastDataRow - 1})` },
	{ formula: `SUM(D${firstDataRow}:D${lastDataRow - 1})` },
	{ formula: `SUM(E${firstDataRow}:E${lastDataRow - 1})` },
	{ formula: `SUM(F${firstDataRow}:F${lastDataRow - 1})` },
	{ formula: `B${lastDataRow}*0.075` },
]);
totals.font = { bold: true };
totals.fill = {
	type: "pattern",
	pattern: "solid",
	fgColor: { argb: "FFD9E1F2" }, // light blue highlight
};

const moneyCols = [2, 3, 4, 5, 6, 7];
for (let r = 2; r <= ws.rowCount; r++) {
	for (const c of moneyCols) ws.getRow(r).getCell(c).numFmt = "$#,##0.00";
}

ws.columns.forEach((col) => {
	let max = 10;
	col.eachCell({ includeEmpty: true }, (cell) => {
		const v =
			cell.value == null
				? ""
				: typeof cell.value === "object" && "formula" in cell.value
					? cell.value.formula
					: String(cell.value);
		max = Math.max(max, v.length + 2);
	});
	col.width = Math.min(max, 28);
});

await wb.xlsx.writeFile(`${OUTBASE}.xlsx`);
console.log(`✅ Wrote ${OUTBASE}.xlsx`);

// ---------------- helpers ----------------
function parseArgs(argv) {
	const o = {};
	for (let i = 0; i < argv.length; i++) {
		const a = argv[i];
		if (a.startsWith("--")) {
			const k = a.slice(2);
			if (k === "sandbox") o[k] = true;
			else if (i + 1 < argv.length && !argv[i + 1].startsWith("--"))
				o[k] = argv[++i];
			else o[k] = true;
		}
	}
	return o;
}
function stripQuotes(s) {
	const m = s.match(/^["'](.*)["']$/);
	return m ? m[1] : s;
}
async function loadDates(arg, rangeArg, monthsArg) {
	if (rangeArg) {
		const [start, end] = rangeArg.split(":").map((s) => s.trim());
		const dates = [];
		let current = new Date(start);
		const endDate = new Date(end);
		while (current <= endDate) {
			dates.push(current.toISOString().slice(0, 10));
			current.setDate(current.getDate() + 1);
		}
		return dates;
	}
	if (monthsArg) {
		const months = monthsArg.split(",").map((m) => m.trim());
		const dates = [];
		for (const month of months) {
			const [year, mo] = month.split("-").map(Number);
			const start = new Date(year, mo - 1, 1);
			const end = new Date(year, mo, 0);
			for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
				dates.push(d.toISOString().slice(0, 10));
			}
		}
		return dates;
	}
	if (!arg) return [];
	if (arg.startsWith("@"))
		return fs
			.readFileSync(arg.slice(1), "utf8")
			.split(/\r?\n/)
			.map((s) => s.trim())
			.filter(Boolean);
	return arg
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}
async function resolveLocations(csv) {
	if (!csv || csv.toLowerCase() === "all") return [];
	return csv
		.split(",")
		.map((s) => s.trim())
		.filter(Boolean);
}
function dayBounds(d, tz) {
	return { begin: `${d}T00:00:00${tz}`, end: `${d}T23:59:59${tz}` };
}
async function listPayments(begin_time, end_time, location_id) {
	const base = new URL(`${BASE}/v2/payments`);
	base.searchParams.set("begin_time", begin_time);
	base.searchParams.set("end_time", end_time);
	base.searchParams.set("sort_order", "ASC");
	base.searchParams.set("limit", "100");
	if (location_id) base.searchParams.set("location_id", location_id);

	let cursor = null,
		out = [];
	do {
		const url = new URL(base.toString());
		if (cursor) url.searchParams.set("cursor", cursor);
		const res = await fetch(url, {
			headers: {
				Authorization: `Bearer ${ACCESS_TOKEN}`,
				Accept: "application/json",
			},
		});
		if (!res.ok)
			throw new Error(`Payments error ${res.status}: ${await res.text()}`);
		const body = await res.json();
		if (Array.isArray(body.payments)) out.push(...body.payments);
		cursor = body.cursor || null;
	} while (cursor);
	return out;
}

// ✅ AFB-only orders (skip city Minot)
async function batchRetrieveOrderAFB(orderIds) {
	const afbTaxByOrder = new Map();
	const afbOnlyOrderIds = new Set();

	for (let i = 0; i < orderIds.length; i += 50) {
		const chunk = orderIds.slice(i, i + 50);
		const res = await fetch(`${BASE}/v2/orders/batch-retrieve`, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${ACCESS_TOKEN}`,
				"Content-Type": "application/json",
				Accept: "application/json",
			},
			body: JSON.stringify({ order_ids: chunk }),
		});
		if (!res.ok)
			throw new Error(`Orders error ${res.status}: ${await res.text()}`);

		const body = await res.json();

		for (const order of body.orders || []) {
			let afbTaxTotal = 0;
			let hasAFB = false;
			let hasCity = false;

			const allTaxes = [];
			if (Array.isArray(order.taxes)) allTaxes.push(...order.taxes);
			if (Array.isArray(order.line_items)) {
				for (const li of order.line_items) {
					if (Array.isArray(li.taxes)) allTaxes.push(...li.taxes);
				}
			}

			for (const t of allTaxes) {
				const name = (t.name || "").toLowerCase().trim();
				if (name.includes("minot air force base")) {
					hasAFB = true;
					afbTaxTotal += money(t.applied_money);
				} else if (name.includes("minot, north dakota")) {
					hasCity = true;
				}
			}

			if (hasAFB && !hasCity) {
				afbOnlyOrderIds.add(order.id);
				afbTaxByOrder.set(order.id, afbTaxTotal);
			}
		}
	}

	return { afbTaxByOrder, afbOnlyOrderIds };
}

function inferPeriodLabel(dates, args) {
	const first = dates[0];
	const last = dates[dates.length - 1];
	if (args.months) {
		const list = args.months.split(",");
		if (list.length === 12) return "FullYear";
		if (list.length === 3)
			return "Q" + Math.ceil(Number(list[0].split("-")[1]) / 3);
		return list.join("_");
	}
	if (args.range) {
		const [start, end] = args.range.split(":");
		return `${start}_to_${end}`;
	}
	if (args.dates && args.dates.includes(",")) return `${first}_to_${last}`;
	return first;
}
function money(m) {
	return m && typeof m.amount === "number" ? m.amount : 0;
}
function fix2(n) {
	return Number(n).toFixed(2);
}
