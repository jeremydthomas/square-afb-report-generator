#!/usr/bin/env node
import readline from "node:readline";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function parseDate(input) {
	// Try to handle formats like "Sep 9 2025", "9/9/25", "September 9 2025"
	const date = new Date(input);
	if (isNaN(date.getTime())) return null;
	const y = date.getFullYear();
	const m = String(date.getMonth() + 1).padStart(2, "0");
	const d = String(date.getDate()).padStart(2, "0");
	return `${y}-${m}-${d}`;
}

rl.question(
	"Enter dates (comma or space separated, e.g. Sep 9 2025, Sep 23 2025): ",
	async (answer) => {
		rl.close();
		const inputs = answer.split(/[,\s]+/).filter(Boolean);

		// Join chunks like ["Sep","9","2025","Sep","23","2025"] into complete date groups
		const grouped = [];
		let buffer = [];
		for (const token of inputs) {
			buffer.push(token);
			if (/\d{4}$/.test(token)) {
				// ends with a 4-digit year
				grouped.push(buffer.join(" "));
				buffer = [];
			}
		}
		if (buffer.length) grouped.push(buffer.join(" ")); // fallback for any remaining tokens

		const parsedDates = grouped.map(parseDate).filter(Boolean).join(",");

		if (!parsedDates) {
			console.log("❌ No valid dates entered. Exiting.");
			process.exit(1);
		}

		const args = ["index.js", "--env", ".env", "--dates", parsedDates];
		console.log(`\n🚀 Running: node ${args.join(" ")}\n`);

		const child = spawn("node", args, {
			cwd: __dirname,
			stdio: "inherit",
		});

		child.on("exit", (code) => {
			console.log(`\n✅ Finished with exit code ${code}\n`);
		});
	}
);
