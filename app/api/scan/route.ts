import { NextRequest, NextResponse } from "next/server";
import { classifyTransaction, Kind, TransferRow } from "@/lib/classify";

export const dynamic = "force-dynamic";

const HELIUS_BASE = "https://api.helius.xyz/v0/addresses";
const PAGE_SIZE = 100; // Helius max per request
const MAX_PAGES = 5; // up to 500 txs scanned per API call
const ADDRESS_RE = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/; // base58, 32-44 chars
const VALID_KINDS: Kind[] = ["sol", "usdc", "memecoin"];

export async function GET(req: NextRequest) {
  const apiKey = process.env.HELIUS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Server is missing HELIUS_API_KEY" },
      { status: 500 }
    );
  }

  const { searchParams } = new URL(req.url);
  const wallet = (searchParams.get("wallet") ?? "").trim();
  const before = searchParams.get("before") ?? undefined;
  const kinds = (searchParams.get("kinds") ?? "")
    .split(",")
    .filter((k): k is Kind => VALID_KINDS.includes(k as Kind));

  if (!ADDRESS_RE.test(wallet)) {
    return NextResponse.json({ error: "Invalid Solana address" }, { status: 400 });
  }
  if (kinds.length === 0) {
    return NextResponse.json({ error: "Select at least one filter" }, { status: 400 });
  }

  const wanted = new Set<Kind>(kinds);
  const rows: TransferRow[] = [];
  let cursor = before;
  let scanned = 0;
  let exhausted = false;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(`${HELIUS_BASE}/${wallet}/transactions`);
    url.searchParams.set("api-key", apiKey);
    url.searchParams.set("limit", String(PAGE_SIZE));
    if (cursor) url.searchParams.set("before", cursor);

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { error: `Helius error ${res.status}`, detail: text.slice(0, 200) },
        { status: 502 }
      );
    }

    const txs: any[] = await res.json();
    if (txs.length === 0) {
      exhausted = true;
      break;
    }

    scanned += txs.length;
    for (const tx of txs) {
      for (const row of classifyTransaction(tx, wallet)) {
        if (wanted.has(row.kind)) rows.push(row);
      }
    }

    cursor = txs[txs.length - 1].signature;
    if (txs.length < PAGE_SIZE) {
      exhausted = true;
      break;
    }
  }

  return NextResponse.json({
    rows,
    scanned,
    // pass this back as ?before= to load older history
    nextBefore: exhausted ? null : cursor,
  });
}
