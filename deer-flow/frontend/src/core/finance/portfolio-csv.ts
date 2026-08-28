import type { PortfolioSetupPositionInput } from "./types";

const REQUIRED_HEADERS = [
  "market",
  "symbol",
  "quantity",
  "averagecost",
  "currency",
] as const;

export interface PortfolioCsvResult {
  positions: PortfolioSetupPositionInput[];
  errors: string[];
}

export function parsePortfolioCsv(source: string): PortfolioCsvResult {
  const rows = parseCsvRows(source.replace(/^\uFEFF/, ""));
  if (rows.length === 0) {
    return { positions: [], errors: ["CSV is empty"] };
  }
  const headers = rows[0]!.map(normalizeHeader);
  const missing = REQUIRED_HEADERS.filter(
    (header) => !headers.includes(header),
  );
  if (missing.length > 0) {
    return {
      positions: [],
      errors: [`Missing columns: ${missing.join(", ")}`],
    };
  }

  const index = (header: string) => headers.indexOf(header);
  const positions: PortfolioSetupPositionInput[] = [];
  const errors: string[] = [];
  rows.slice(1).forEach((row, offset) => {
    const line = offset + 2;
    if (row.every((value) => value.trim() === "")) return;
    const market = read(row, index("market")).toUpperCase();
    const symbol = read(row, index("symbol")).toUpperCase();
    const name = read(row, index("name"));
    const quantity = read(row, index("quantity"));
    const averageCost = read(row, index("averagecost"));
    const currency = read(row, index("currency")).toUpperCase();

    if (!market || !symbol || !currency) {
      errors.push(`Line ${line}: market, symbol and currency are required`);
      return;
    }
    if (!isNonNegativeNumber(quantity) || !isNonNegativeNumber(averageCost)) {
      errors.push(
        `Line ${line}: quantity and averageCost must be non-negative`,
      );
      return;
    }
    positions.push({ market, symbol, name, quantity, averageCost, currency });
  });

  const keys = new Set<string>();
  for (const position of positions) {
    const key = `${position.market}:${position.symbol}`;
    if (keys.has(key)) errors.push(`Duplicate position: ${key}`);
    keys.add(key);
  }
  return { positions: errors.length > 0 ? [] : positions, errors };
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s_-]/g, "");
}

function read(row: string[], column: number) {
  return column >= 0 ? (row[column] ?? "").trim() : "";
}

function isNonNegativeNumber(value: string) {
  if (value.trim() === "") return false;
  const amount = Number(value);
  return Number.isFinite(amount) && amount >= 0;
}

function parseCsvRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        value += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        value += character;
      }
      continue;
    }
    if (character === '"') {
      quoted = true;
    } else if (character === ",") {
      row.push(value);
      value = "";
    } else if (character === "\n") {
      row.push(value.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      value = "";
    } else {
      value += character;
    }
  }
  if (value !== "" || row.length > 0) {
    row.push(value.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows;
}
