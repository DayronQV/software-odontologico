/** Resume backend/coverage/coverage-summary.json por módulo (para el informe de cobertura). */
const path = require('path');
const j = require(path.join(__dirname, '..', 'backend', 'coverage', 'coverage-summary.json'));
const agg = {};
for (const [file, v] of Object.entries(j)) {
  if (file === 'total') continue;
  const match = file.split(path.sep).join('/').match(/\/src\/([^/]+)\//);
  const key = match ? match[1] : '(raíz)';
  agg[key] ??= { statements: [0, 0], lines: [0, 0], functions: [0, 0], branches: [0, 0] };
  for (const metric of Object.keys(agg[key])) {
    agg[key][metric][0] += v[metric].covered;
    agg[key][metric][1] += v[metric].total;
  }
}
const pct = (x) => (x[1] ? ((100 * x[0]) / x[1]).toFixed(1) : '-');
console.log('| Módulo | Sentencias | Líneas | Funciones | Ramas |\n|---|---|---|---|---|');
for (const key of Object.keys(agg).sort()) {
  const a = agg[key];
  console.log(`| ${key} | ${pct(a.statements)} % | ${pct(a.lines)} % | ${pct(a.functions)} % | ${pct(a.branches)} % |`);
}
const t = j.total;
console.log(`| **TOTAL** | **${t.statements.pct} %** | **${t.lines.pct} %** | **${t.functions.pct} %** | **${t.branches.pct} %** |`);
