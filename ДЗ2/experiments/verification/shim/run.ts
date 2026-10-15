import { registry } from './vitest';
const files = process.argv.slice(2);
let pass = 0, fail = 0;
for (const f of files) {
  const before = registry.length;
  await import(f);
  for (const t of registry.slice(before)) {
    try { await t.fn(); pass++; }
    catch (e) { fail++; console.log(`✖ ${f.split('/src/')[1]} :: ${t.name}\n    ${(e as Error).message.split('\n').slice(0, 4).join('\n    ')}`); }
  }
}
console.log(`\nтестов: ${pass + fail}, прошло: ${pass}, упало: ${fail}`);
process.exitCode = fail ? 1 : 0;
