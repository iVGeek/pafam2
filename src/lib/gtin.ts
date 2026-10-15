export type CodeKind = "GTIN" | "INTERNAL";

export type CodeInfo = {
  /** Digits exactly as supplied after trimming whitespace (leading zeros kept). */
  raw: string;
  /** 1 = numeric only, 2 = contains non-numeric characters. */
  kind: CodeKind;
  /** True when length is 8/12/13/14 and the check digit is valid. */
  isValidGtin: boolean;
  /** Canonical 14-digit GTIN, only when `isValidGtin` is true. */
  gtin14: string | null;
  /** Length of the supplied value. */
  length: number;
  /** Leading zero(s) were dropped compared with the canonical GTIN. */
  hadDroppedLeadingZeros: boolean;
};

const GTIN_LENGTHS = new Set([8, 12, 13, 14]);

/** Keep the value as text; trim surrounding whitespace only. */
export function sanitizeCode(value: unknown): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function isAllDigits(value: string): boolean {
  return value.length > 0 && /^\d+$/.test(value);
}

/** GS1 mod-10 check-digit validation for GTIN-8/12/13/14. */
export function hasValidCheckDigit(code: string): boolean {
  if (!isAllDigits(code) || !GTIN_LENGTHS.has(code.length)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop() as number;
  let sum = 0;
  // From the right, weight the right-most data digit by 3, alternating.
  for (let i = 0; i < digits.length; i++) {
    const weight = i % 2 === 0 ? 3 : 1;
    sum += digits[digits.length - 1 - i] * weight;
  }
  return (10 - (sum % 10)) % 10 === check;
}

export function padToGtin14(code: string): string | null {
  if (!hasValidCheckDigit(code)) return null;
  return code.padStart(14, "0");
}

export function analyzeCode(value: unknown): CodeInfo {
  // Excel often hands us numbers, occasionally with spaces/decimal artefacts.
  let raw = sanitizeCode(value);
  // Defensive: strip a trailing ".0" that some numeric cells carry.
  if (/^\d+\.0+$/.test(raw)) raw = raw.replace(/\.0+$/, "");

  const digitsOnly = isAllDigits(raw);
  const valid = digitsOnly && hasValidCheckDigit(raw);
  const gtin14 = valid ? raw.padStart(14, "0") : null;

  return {
    raw,
    kind: digitsOnly ? "GTIN" : "INTERNAL",
    isValidGtin: valid,
    gtin14,
    length: raw.length,
    hadDroppedLeadingZeros: valid
      ? raw.replace(/^0+/, "") === raw && raw.length < 14
      : false,
  };
}
