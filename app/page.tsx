"use client";

import { useState } from "react";
import type { Kind, TransferRow } from "@/lib/classify";

const FILTERS: { kind: Kind; label: string }[] = [
  { kind: "sol", label: "SOL transfers" },
  { kind: "usdc", label: "USDC / USDT transfers" },
  { kind: "memecoin", label: "Memecoin / other tokens" },
];

const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [selected, setSelected] = useState<Set<Kind>>(new Set(["sol", "usdc", "memecoin"]));
  const [minSol, setMinSol] = useState("0.05");
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  function toggle(kind: Kind) {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(kind) ? next.delete(kind) : next.add(kind);
      return next;
    });
  }

  async function scan(before?: string) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        wallet: wallet.trim(),
        kinds: Array.from(selected).join(","),
      });
      if (minSol.trim()) params.set("minSol", minSol.trim());
      if (before) params.set("before", before);

      const res = await fetch(`/api/scan?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setRows((prev) => (before ? [...prev, ...data.rows] : data.rows));
      setScanned((prev) => (before ? prev + data.scanned : data.scanned));
      setNextBefore(data.nextBefore);
      setSearched(true);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setRows([]);
    setNextBefore(null);
    scan();
  }

  return (
    <main className="container">
      <h1>Solana Wallet Scanner</h1>
      <p className="muted">Paste a wallet, pick what to filter, scan its recent history.</p>

      <form onSubmit={onSubmit} className="card">
        <input
          className="input"
          placeholder="Wallet address"
          value={wallet}
          onChange={(e) => setWallet(e.target.value)}
          spellCheck={false}
        />
        <div className="filters">
          {FILTERS.map((f) => (
            <label key={f.kind} className="check">
              <input
                type="checkbox"
                checked={selected.has(f.kind)}
                onChange={() => toggle(f.kind)}
              />
              {f.label}
            </label>
          ))}
        </div>
        <label className="check">
          Min SOL amount
          <input
            className="input num"
            type="number"
            min="0"
            step="any"
            value={minSol}
            onChange={(e) => setMinSol(e.target.value)}
          />
          <span className="muted">(SOL transfers only)</span>
        </label>
        <button className="btn" disabled={loading || !wallet.trim() || selected.size === 0}>
          {loading && rows.length === 0 ? "Scanning…" : "Scan wallet"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {searched && (
        <section>
          <p className="muted">
            {rows.length} matching transfers from {scanned} transactions scanned
          </p>
          {rows.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Type</th>
                    <th>Dir</th>
                    <th>Amount</th>
                    <th>Token</th>
                    <th>Counterparty</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.signature}-${i}`}>
                      <td>{new Date(r.timestamp * 1000).toLocaleString()}</td>
                      <td>{r.kind}</td>
                      <td className={r.direction === "in" ? "in" : "out"}>
                        {r.direction === "in" ? "IN" : "OUT"}
                      </td>
                      <td>{r.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</td>
                      <td>{r.mint ? short(r.mint) : "SOL"}</td>
                      <td>
                        <a href={`https://solscan.io/account/${r.counterparty}`} target="_blank" rel="noreferrer">
                          {short(r.counterparty)}
                        </a>
                      </td>
                      <td>
                        <a href={`https://solscan.io/tx/${r.signature}`} target="_blank" rel="noreferrer">
                          {short(r.signature)}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {nextBefore && (
            <button className="btn secondary" disabled={loading} onClick={() => scan(nextBefore)}>
              {loading ? "Loading…" : "Load older"}
            </button>
          )}
        </section>
      )}
    </main>
  );
}
