// Turns Helius "enhanced transaction" objects into flat transfer rows
// that involve the scanned wallet, labelled as sol / usdc / memecoin.

export type Kind = "sol" | "usdc" | "memecoin";
export type Direction = "in" | "out";

export interface TransferRow {
  signature: string;
  timestamp: number; // unix seconds
  kind: Kind;
  direction: Direction;
  amount: number; // human units (SOL, USDC, or token amount)
  mint?: string; // only for token transfers
  counterparty: string; // the other wallet
}

const WSOL = "So11111111111111111111111111111111111111112";
const USDC = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";
const USDT = "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB";

// Anything that is NOT SOL / stablecoin is treated as "memecoin" in the MVP.
// Later: replace with a token-metadata lookup (Jupiter / DexScreener).
const STABLES = new Set([USDC, USDT]);

const LAMPORTS_PER_SOL = 1_000_000_000;

export function classifyTransaction(tx: any, wallet: string): TransferRow[] {
  const rows: TransferRow[] = [];
  const base = { signature: tx.signature as string, timestamp: tx.timestamp as number };

  for (const t of tx.nativeTransfers ?? []) {
    const isIn = t.toUserAccount === wallet;
    const isOut = t.fromUserAccount === wallet;
    if (!isIn && !isOut) continue;
    if (isIn && isOut) continue; // self-transfer, skip
    rows.push({
      ...base,
      kind: "sol",
      direction: isIn ? "in" : "out",
      amount: t.amount / LAMPORTS_PER_SOL,
      counterparty: isIn ? t.fromUserAccount : t.toUserAccount,
    });
  }

  for (const t of tx.tokenTransfers ?? []) {
    const isIn = t.toUserAccount === wallet;
    const isOut = t.fromUserAccount === wallet;
    if (!isIn && !isOut) continue;
    if (isIn && isOut) continue;

    let kind: Kind;
    if (t.mint === WSOL) kind = "sol";
    else if (STABLES.has(t.mint)) kind = "usdc";
    else kind = "memecoin";

    rows.push({
      ...base,
      kind,
      direction: isIn ? "in" : "out",
      amount: t.tokenAmount,
      mint: t.mint,
      counterparty: isIn ? t.fromUserAccount : t.toUserAccount,
    });
  }

  return rows;
}
