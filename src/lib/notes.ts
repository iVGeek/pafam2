// Note extraction (§15). Rule-based, deterministic extraction of claims from
// captured meeting notes. Every claim keeps the exact source excerpt so staff
// can trace it back; anything that cannot be resolved stays unresolved.

import { prisma } from "./prisma";

export type Candidate = {
  kind:
    | "PRODUCT_MENTION"
    | "QUANTITY"
    | "TARGET_PRICE"
    | "DEADLINE"
    | "CHANNEL_RESTRICTION"
    | "OBJECTION"
    | "COMPETITOR_QUOTE"
    | "FOLLOW_UP";
  productText?: string | null;
  productId?: string | null;
  quantity?: number | null;
  quantityUnit?: string | null;
  targetPrice?: number | null;
  currency?: string | null;
  neededBy?: Date | null;
  dueDate?: Date | null;
  detail?: string | null;
  excerpt: string;
  confidence: number;
};

type ProductLite = { id: string; internalSku: string; brand: string | null; fragranceName: string | null };

function numberFrom(raw: string): number {
  return Number(raw.replace(/,/g, ""));
}

function tryParseDate(token: string, now: Date): Date | null {
  const cleaned = token.trim();
  if (!cleaned) return null;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(cleaned) ? cleaned : null;
  if (iso) {
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const mdy = cleaned.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (mdy) {
    const month = Number(mdy[1]);
    const day = Number(mdy[2]);
    const yearPart = mdy[3];
    let year = yearPart ? Number(yearPart) : now.getUTCFullYear();
    if (year < 100) year += 2000;
    const d = new Date(Date.UTC(year, month - 1, day));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const named = cleaned.match(/^([A-Za-z]{3,})\s+(\d{1,2})(?:,?\s*(\d{4}))?$/);
  if (named) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const idx = months.indexOf(named[1].slice(0, 3).toLowerCase());
    if (idx >= 0) {
      const year = named[3] ? Number(named[3]) : now.getUTCFullYear();
      return new Date(Date.UTC(year, idx, Number(named[2])));
    }
  }
  const parsed = new Date(cleaned);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function extractCandidates(text: string, products: ProductLite[], now = new Date()): Candidate[] {
  const out: Candidate[] = [];
  const lines = text
    .split(/\r?\n|(?<=[.!?])\s+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const brandIndex = new Map<string, ProductLite[]>();
  for (const p of products) {
    if (!p.brand) continue;
    const key = p.brand.toLowerCase();
    const list = brandIndex.get(key) ?? [];
    list.push(p);
    brandIndex.set(key, list);
  }

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Product mention: internal SKU (strong) or brand (+ fragrance) match.
    let matched: ProductLite | null = null;
    for (const p of products) {
      if (p.internalSku.length >= 4 && lower.includes(p.internalSku.toLowerCase())) {
        matched = p;
        break;
      }
    }
    if (!matched) {
      for (const [brand, list] of brandIndex) {
        if (!lower.includes(brand)) continue;
        const withFragrance = list.find((p) => p.fragranceName && lower.includes(p.fragranceName.toLowerCase()));
        matched = withFragrance ?? list[0];
        break;
      }
    }
    if (matched) {
      const strong = lower.includes(matched.internalSku.toLowerCase());
      out.push({
        kind: "PRODUCT_MENTION",
        productText: matched.fragranceName ?? matched.brand ?? matched.internalSku,
        productId: matched.id,
        excerpt: line,
        confidence: strong ? 95 : 70,
      });
    }

    // Quantity.
    const qMatch = lower.match(/(\d[\d,]*)\s*(units?|bottles?|pieces?|pcs|boxes?|cases?|dozens?)\b/);
    if (qMatch) {
      out.push({
        kind: "QUANTITY",
        quantity: numberFrom(qMatch[1]),
        quantityUnit: qMatch[2],
        excerpt: line,
        confidence: 85,
        productId: matched?.id ?? null,
      });
    }

    // Target price.
    const priceMatch =
      line.match(/[$€£]\s?(\d[\d,]*(?:\.\d+)?)/) ?? line.match(/(\d[\d,]*(?:\.\d+)?)\s*(usd|dollars?|eur|gbp)/i);
    if (priceMatch) {
      const currency = /€/.test(priceMatch[0]) || /eur/i.test(priceMatch[0])
        ? "EUR"
        : /£/.test(priceMatch[0]) || /gbp/i.test(priceMatch[0])
          ? "GBP"
          : "USD";
      out.push({
        kind: "TARGET_PRICE",
        targetPrice: numberFrom(priceMatch[1]),
        currency,
        excerpt: line,
        confidence: 80,
        productId: matched?.id ?? null,
      });
    }

    // Deadline.
    const dl = lower.match(
      /\b(?:by|before|needed by|needs? by|for|deliver(?:y)? by|deliver(?:y)? on)\s+(\d{4}-\d{2}-\d{2}|[a-z]{3,}\s+\d{1,2}(?:,?\s*\d{4})?|\d{1,2}[/-]\d{1,2}(?:[/-]\d{2,4})?)/,
    );
    if (dl) {
      const parsed = tryParseDate(dl[1], now);
      if (parsed) {
        out.push({ kind: "DEADLINE", neededBy: parsed, excerpt: line, confidence: 75, productId: matched?.id ?? null });
      }
    }

    // Channel restriction.
    if (/\b(online only|not for|exclude[ds]?|exclusive|no (?:amazon|ebay)|not (?:amazon|ebay)|off-?limit)\b/.test(lower)) {
      out.push({ kind: "CHANNEL_RESTRICTION", detail: line, excerpt: line, confidence: 70 });
    }

    // Objection.
    if (/\b(too (?:expensive|pricey)|price too high|not interested|cheaper elsewhere|too much)\b/.test(lower)) {
      out.push({ kind: "OBJECTION", detail: line, excerpt: line, confidence: 65 });
    }

    // Competitor quote.
    if (/\b(competitor|they (?:quoted|offer)|another supplier|cheaper at|quoted (?:us|me)?)\b/.test(lower)) {
      out.push({ kind: "COMPETITOR_QUOTE", detail: line, excerpt: line, confidence: 65 });
    }

    // Follow-up.
    if (/\b(follow up|follow-up|check (?:back|with)|send|call|email|reconfirm|confirm|get back)\b/.test(lower)) {
      out.push({ kind: "FOLLOW_UP", detail: line, dueDate: null, excerpt: line, confidence: 60 });
    }
  }

  return out;
}

/** Persist extraction candidates for a note, skipping ones already present. */
export async function extractNote(noteId: string): Promise<number> {
  const note = await prisma.note.findUnique({ where: { id: noteId } });
  if (!note) throw new Error("Note not found.");

  const products = await prisma.product.findMany({
    select: { id: true, internalSku: true, brand: true, fragranceName: true },
  });
  const candidates = extractCandidates(note.rawText, products, note.meetingDate ?? new Date());

  const existing = await prisma.noteExtraction.findMany({ where: { noteId }, select: { kind: true, excerpt: true } });
  const seen = new Set(existing.map((e) => `${e.kind}|${e.excerpt}`));

  let created = 0;
  for (const c of candidates) {
    const sig = `${c.kind}|${c.excerpt}`;
    if (seen.has(sig)) continue;
    seen.add(sig);
    await prisma.noteExtraction.create({
      data: {
        noteId,
        kind: c.kind,
        status: "PENDING",
        productText: c.productText ?? null,
        productId: c.productId ?? null,
        quantity: c.quantity ?? null,
        quantityUnit: c.quantityUnit ?? null,
        targetPrice: c.targetPrice ?? null,
        currency: c.currency ?? null,
        neededBy: c.neededBy ?? null,
        dueDate: c.dueDate ?? null,
        detail: c.detail ?? null,
        excerpt: c.excerpt,
        confidence: c.confidence,
      },
    });
    created++;
  }
  return created;
}
