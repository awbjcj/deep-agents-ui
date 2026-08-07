import { ESLint } from "eslint";

const eslint = new ESLint();
const results = await eslint.lintFiles(["src"]);
const formatter = await eslint.loadFormatter("stylish");
const output = formatter.format(results);
console.log(output || "ESLint: clean");
const errors = results.reduce((n, r) => n + r.errorCount, 0);
process.exit(errors > 0 ? 1 : 0);
