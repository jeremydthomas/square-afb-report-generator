// // Simple local server with no dependencies
// import { createServer } from "http";
// import { spawn } from "child_process";
// import { readFile } from "fs/promises";
// import url from "url";

// const PORT = 3000;

// const html = await readFile("./index.html", "utf8");

// createServer(async (req, res) => {
// 	if (req.method === "GET") {
// 		res.writeHead(200, { "Content-Type": "text/html" });
// 		res.end(html);
// 	} else if (req.method === "POST" && req.url === "/run") {
// 		let body = "";
// 		req.on("data", (chunk) => (body += chunk));
// 		req.on("end", () => {
// 			const { dates } = JSON.parse(body || "{}");
// 			if (!Array.isArray(dates) || !dates.length) {
// 				res.writeHead(400);
// 				return res.end("No dates provided");
// 			}

// 			console.log(`▶ Running report for: ${dates.join(", ")}`);
// 			const child = spawn(
// 				"node",
// 				["index.js", "--env", ".env", "--dates", dates.join(",")],
// 				{
// 					stdio: "inherit",
// 				}
// 			);

// 			res.writeHead(200);
// 			res.end("Report started");
// 		});
// 	} else {
// 		res.writeHead(404);
// 		res.end("Not found");
// 	}
// }).listen(PORT, () => {
// 	console.log(`✅ Open http://localhost:${PORT}`);
// });

import express from "express";
import { spawn } from "node:child_process";
import path from "node:path";
import fs from "node:fs";

const app = express();
app.use(express.json());
app.use(express.static(".")); // serves index.html

app.post("/run", (req, res) => {
	const { dates, range, months } = req.body;

	// build dynamic args
	const args = ["index.js", "--env", ".env"];
	if (dates?.length) args.push("--dates", dates.join(","));
	if (range) args.push("--range", range);
	if (months?.length) args.push("--months", months.join(","));

	const proc = spawn("node", args, { stdio: "inherit" });

	proc.on("close", (code) => {
		if (code === 0) {
			res.json({ ok: true, msg: "Report completed." });
		} else {
			res.status(500).json({ ok: false, msg: `Exited with code ${code}` });
		}
	});
});

app.listen(3000, () => console.log("Server running on http://localhost:3000"));
