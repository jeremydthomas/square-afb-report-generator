import express from "express";
import { spawn } from "node:child_process";

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
