// Collapses flat transfer rows into one entry per counterparty wallet.

import type { TransferRow } from "./classify";

export interface WalletSummary {
  wallet: string;
  txCount: number; // distinct transactions shared with the scanned wallet
  solIn: number;
  solOut: number;
  usdcIn: number;
  usdcOut: number;
  memecoinTransfers: number; // count only: token amounts are not comparable
  // Only filled when a specific token (mint) is searched:
  tokenIn: number; // number of transfers received from this wallet
  tokenOut: number; // number of transfers sent to this wallet
  tokenAmountIn: number;
  tokenAmountOut: number;
  firstSeen: number; // unix seconds
  lastSeen: number; // unix seconds
  lastSignature: string;
}

export function summarizeByWallet(rows: TransferRow[], mint?: string): WalletSummary[] {
  const map = new Map<string, WalletSummary>();
  const sigs = new Map<string, Set<string>>();

  for (const r of rows) {
    let s = map.get(r.counterparty);
    if (!s) {
      s = {
        wallet: r.counterparty,
        txCount: 0,
        solIn: 0,
        solOut: 0,
        usdcIn: 0,
        usdcOut: 0,
        memecoinTransfers: 0,
        tokenIn: 0,
        tokenOut: 0,
        tokenAmountIn: 0,
        tokenAmountOut: 0,
        firstSeen: r.timestamp,
        lastSeen: r.timestamp,
        lastSignature: r.signature,
      };
      map.set(r.counterparty, s);
      sigs.set(r.counterparty, new Set());
    }

    sigs.get(r.counterparty)!.add(r.signature);

    if (mint) {
      if (r.direction === "in") {
        s.tokenIn += 1;
        s.tokenAmountIn += r.amount;
      } else {
        s.tokenOut += 1;
        s.tokenAmountOut += r.amount;
      }
    } else if (r.kind === "sol") r.direction === "in" ? (s.solIn += r.amount) : (s.solOut += r.amount);
    else if (r.kind === "usdc") r.direction === "in" ? (s.usdcIn += r.amount) : (s.usdcOut += r.amount);
    else s.memecoinTransfers += 1;

    if (r.timestamp < s.firstSeen) s.firstSeen = r.timestamp;
    if (r.timestamp > s.lastSeen) {
      s.lastSeen = r.timestamp;
      s.lastSignature = r.signature;
    }
  }

  for (const [wallet, s] of map) s.txCount = sigs.get(wallet)!.size;

  // Most frequent counterparties first, ties broken by most recent.
  // In token mode "frequent" means number of transfers of that token.
  const count = (w: WalletSummary) => (mint ? w.tokenIn + w.tokenOut : w.txCount);
  return Array.from(map.values()).sort(
    (a, b) => count(b) - count(a) || b.lastSeen - a.lastSeen
  );
}
