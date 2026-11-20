#!/usr/bin/env node
/**
 * Agrega claves al diccionario. Uso:
 *   node scripts/add-i18n.mjs claves.json
 * Formato: { "clave.ejemplo": { "es": "...", "pt": "..." } }
 */
import { readFileSync, writeFileSync } from "node:fs";

const file = "src/lib/i18n/dictionary.ts";
const input = JSON.parse(readFileSync(process.argv[2], "utf8"));
let source = readFileSync(file, "utf8");

const esAnchor = "} as const;\n\nexport type TranslationKey";
const ptAnchor = "};\n\nexport const dictionaries";

const esLines = [];
const ptLines = [];
for (const [key, value] of Object.entries(input)) {
  if (source.includes(`\n  "${key}":`)) {
    console.log(`ya existe, se omite: ${key}`);
    continue;
  }
  const esc = (text) => text.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  esLines.push(`  "${key}": "${esc(value.es)}",`);
  ptLines.push(`  "${key}": "${esc(value.pt)}",`);
}

if (esLines.length === 0) {
  console.log("sin cambios");
  process.exit(0);
}

source = source.replace(esAnchor, `\n${esLines.join("\n")}\n${esAnchor}`);
source = source.replace(ptAnchor, `\n${ptLines.join("\n")}\n${ptAnchor}`);
writeFileSync(file, source);
console.log(`agregadas ${esLines.length} claves`);
