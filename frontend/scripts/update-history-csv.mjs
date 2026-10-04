#!/usr/bin/env node
/**
 * Actualiza los CSV históricos (YYYY.csv + all_data.csv) con los resultados
 * más recientes publicados por la JPS para Nuevos Tiempos Reventados.
 *
 * La página de la JPS (Next.js) incrusta ~60 días de sorteos como JSON en el
 * payload RSC (`self.__next_f.push(...)`). Se decodifica ese payload y se
 * extraen los objetos de sorteo; no hace falta navegador ni dependencias.
 *
 * Uso (desde frontend/):
 *   node scripts/update-history-csv.mjs              # actualiza los archivos
 *   node scripts/update-history-csv.mjs --dry-run    # solo muestra qué cambiaría
 *   node scripts/update-history-csv.mjs --dir ../otra/carpeta
 *
 * Variables de entorno:
 *   HISTORY_CSV_DIR  carpeta con los CSV (default: ../data/history)
 *   JPS_RESULTS_URL  URL de resultados (default: página oficial de la JPS)
 *
 * Reglas:
 *   - Solo agrega sorteos que no existen (clave fecha|periodo). Las filas
 *     existentes no se tocan; si la JPS reporta un valor distinto se avisa.
 *   - Mantiene el formato actual: encabezado `date,period,n,rev,mr`, CRLF,
 *     periodos MEDIODÍA/TARDE/NOCHE y orden por fecha y periodo.
 *   - Si el año no tiene archivo (p. ej. 2027.csv) lo crea.
 *   - Código de salida 1 si no se pudo obtener/parsear la página.
 */

import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIR = path.resolve(SCRIPT_DIR, "../../data/history");
const DEFAULT_URL = "https://www.jps.go.cr/resultados/nuevos-tiempos-reventados";

const HEADER = "date,period,n,rev,mr";
const EOL = "\r\n";
const PERIOD_BY_HORA = { 1: "MEDIODÍA", 2: "TARDE", 3: "NOCHE" };
const PERIOD_ORDER = { UNICO: 0, "MEDIODÍA": 1, TARDE: 2, NOCHE: 3 };

function parseArgs(argv) {
  const args = { dryRun: false, dir: process.env.HISTORY_CSV_DIR || DEFAULT_DIR };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--dry-run") args.dryRun = true;
    else if (argv[i] === "--dir") args.dir = path.resolve(argv[++i]);
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log("Uso: node scripts/update-history-csv.mjs [--dry-run] [--dir <carpeta>]");
      process.exit(0);
    } else throw new Error(`Argumento desconocido: ${argv[i]}`);
  }
  return args;
}

async function fetchHtml(url, attempts = 3) {
  let lastError;
  for (let i = 1; i <= attempts; i++) {
    try {
      const response = await fetch(url, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          "Accept-Language": "es-CR,es;q=0.9",
        },
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      lastError = error;
      if (i < attempts) await new Promise((r) => setTimeout(r, 2000 * i));
    }
  }
  throw new Error(`No se pudo descargar ${url}: ${lastError?.message}`);
}

/** Extrae los sorteos de Nuevos Tiempos del payload RSC de la página. */
export function parseDraws(html) {
  if (html.includes("Just a moment") && !html.includes("self.__next_f")) {
    throw new Error("La JPS respondió con un challenge de Cloudflare");
  }

  const chunkRe = /self\.__next_f\.push\(\[1,("(?:[^"\\]|\\.)*")\]\)/g;
  let payload = "";
  for (const match of html.matchAll(chunkRe)) {
    payload += JSON.parse(match[1]);
  }

  const draws = new Map();
  for (const match of payload.matchAll(/\{"hora":\d[^{}]*\}/g)) {
    let obj;
    try {
      obj = JSON.parse(match[0]);
    } catch {
      continue;
    }
    const period = PERIOD_BY_HORA[obj.hora];
    if (obj.tipoSorteoCode !== "nuevostiempos" || !period) continue;
    if (!Number.isInteger(obj.numero) || !Number.isInteger(obj.meganNumero)) continue;
    const date = String(obj.fecha).slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;

    draws.set(`${date}|${period}`, {
      date,
      period,
      n: obj.numero,
      rev: obj.in_reventado ? "R" : "-",
      mr: obj.meganNumero,
    });
  }
  return [...draws.values()];
}

function readCsv(file) {
  const lines = existsSync(file)
    ? readFileSync(file, "utf8").replace(/^﻿/, "").split(/\r?\n/).filter(Boolean)
    : [HEADER];
  if (lines[0] !== HEADER) {
    throw new Error(`Encabezado inesperado en ${file}: "${lines[0]}"`);
  }
  const rows = lines.slice(1).map((line) => {
    const [date, period, n, rev, mr] = line.split(",");
    return { key: `${date}|${period}`, date, period, n, rev, mr, line };
  });
  return { exists: existsSync(file), rows };
}

const sortKey = (row) => `${row.date}|${PERIOD_ORDER[row.period] ?? 9}`;
const toLine = (d) => `${d.date},${d.period},${d.n},${d.rev},${d.mr}`;

/** Inserta los sorteos faltantes en el archivo. Devuelve lo agregado y conflictos. */
function mergeInto(file, draws, dryRun) {
  const { exists, rows } = readCsv(file);
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const added = [];
  const conflicts = [];

  for (const draw of draws) {
    const key = `${draw.date}|${draw.period}`;
    const current = byKey.get(key);
    if (!current) {
      added.push(draw);
      continue;
    }
    const same =
      current.n === String(draw.n) && current.rev === draw.rev && current.mr === String(draw.mr);
    if (!same) conflicts.push({ key, csv: current.line, jps: toLine(draw) });
  }

  if (added.length > 0 && !dryRun) {
    const merged = [...rows, ...added.map((d) => ({ ...d, line: toLine(d) }))];
    // Orden estable: las filas existentes (ya ordenadas) conservan su posición relativa.
    merged.sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : sortKey(a) > sortKey(b) ? 1 : 0));
    const content = [HEADER, ...merged.map((r) => r.line)].join(EOL) + EOL;
    const tmp = `${file}.tmp`;
    writeFileSync(tmp, content, "utf8");
    renameSync(tmp, file);
  }

  return { added, conflicts, created: !exists && added.length > 0 };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const url = process.env.JPS_RESULTS_URL || DEFAULT_URL;

  if (!existsSync(args.dir)) throw new Error(`No existe la carpeta ${args.dir}`);

  const html = await fetchHtml(url);
  const draws = parseDraws(html).sort((a, b) => (sortKey(a) < sortKey(b) ? -1 : 1));
  if (draws.length === 0) {
    throw new Error("No se encontraron sorteos en la página (¿cambió el formato del sitio?)");
  }

  const first = draws[0];
  const last = draws[draws.length - 1];
  console.log(
    `[${new Date().toISOString()}] JPS: ${draws.length} sorteos (${first.date} ${first.period} → ${last.date} ${last.period})` +
      (args.dryRun ? "  [dry-run]" : ""),
  );

  const byYear = new Map();
  for (const draw of draws) {
    const year = draw.date.slice(0, 4);
    if (!byYear.has(year)) byYear.set(year, []);
    byYear.get(year).push(draw);
  }

  const targets = [
    ...[...byYear].map(([year, yearDraws]) => [`${year}.csv`, yearDraws]),
    ["all_data.csv", draws],
  ];

  let totalConflicts = 0;
  for (const [name, fileDraws] of targets) {
    const { added, conflicts, created } = mergeInto(path.join(args.dir, name), fileDraws, args.dryRun);
    totalConflicts += conflicts.length;
    const verb = args.dryRun ? "se agregarían" : "agregados";
    console.log(`  ${name}${created ? " (nuevo)" : ""}: ${added.length} ${verb}`);
    for (const d of added) console.log(`    + ${toLine(d)}`);
    for (const c of conflicts) console.warn(`    ! ${c.key} difiere — CSV: ${c.csv} | JPS: ${c.jps}`);
  }

  if (totalConflicts > 0) {
    console.warn(`Atención: ${totalConflicts} filas difieren de la JPS (no se modificaron).`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`[${new Date().toISOString()}] Error: ${error.message}`);
    process.exit(1);
  });
}
