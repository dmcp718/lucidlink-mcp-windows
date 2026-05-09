// Static server for the LucidLink audit trail dashboard. Serves index.html
// from /public on PORT and opens it in the default browser. Stop with Ctrl+C
// or `kill <pid>`.
const express = require("express");
const path = require("path");
const { exec } = require("child_process");

const PORT = process.env.PORT || {{PORT}};
const app = express();
app.use(express.static(path.join(__dirname, "public")));
app.get("/", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));

app.listen(PORT, () => {
  const url = `http://localhost:${PORT}`;
  console.log(`LucidLink Audit Trail dashboard ready at ${url}`);
  const opener = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open";
  exec(`${opener} ${url}`, () => {});
});
