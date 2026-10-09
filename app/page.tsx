"use client";

import { useMemo, useState } from "react";
import type { Kind, TransferRow } from "@/lib/classify";
import { summarizeByWallet } from "@/lib/aggregate";

const FILTERS: { kind: Kind; label: string }[] = [
  { kind: "sol", label: "SOL transfers" },
  { kind: "usdc", label: "USDC / USDT transfers" },
  { kind: "memecoin", label: "Memecoin / other tokens" },
];

const fmt = (n: number) => n.toLocaleString(undefined, { maximumFractionDigits: 4 });
const short = (s: string) => `${s.slice(0, 4)}…${s.slice(-4)}`;

export default function Home() {
  const [wallet, setWallet] = useState("");
  const [selected, setSelected] = useState<Set<Kind>>(new Set(["sol", "usdc", "memecoin"]));
  const [minSol, setMinSol] = useState("0.05");
  const [hideKnown, setHideKnown] = useState(true);
  const [requireValue, setRequireValue] = useState(true);
  const [hidden, setHidden] = useState(0);
  const [minUsdc, setMinUsdc] = useState("");
  const [direction, setDirection] = useState<"both" | "in" | "out">("both");
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);

  // Wallets that only exchanged "other tokens" (often spam airdrops) have 0 SOL and 0 USDC flow.
  const wallets = useMemo(
    () =>
      summarizeByWallet(rows).filter(
        (w) => !requireValue || w.solIn + w.solOut + w.usdcIn + w.usdcOut > 0
      ),
    [rows, requireValue]
  );

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
      if (minUsdc.trim()) params.set("minUsdc", minUsdc.trim());
      params.set("direction", direction);
      params.set("hideKnown", hideKnown ? "1" : "0");
      if (before) params.set("before", before);

      const res = await fetch(`/api/scan?${params}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Request failed");

      setRows((prev) => (before ? [...prev, ...data.rows] : data.rows));
      setScanned((prev) => (before ? prev + data.scanned : data.scanned));
      setHidden((prev) => (before ? prev + data.hiddenWallets : data.hiddenWallets));
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
      <p className="muted">Paste a wallet, pick filters, see the wallets it has interacted with.</p>

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
        <div className="filters">
          <label className="check">
            Direction
            <select
              className="input num"
              value={direction}
              onChange={(e) => setDirection(e.target.value as "both" | "in" | "out")}
            >
              <option value="both">IN + OUT</option>
              <option value="in">IN only (received)</option>
              <option value="out">OUT only (sent)</option>
            </select>
          </label>
          <label className="check">
            Min SOL
            <input
              className="input num"
              type="number"
              min="0"
              step="any"
              value={minSol}
              onChange={(e) => setMinSol(e.target.value)}
            />
          </label>
          <label className="check">
            Min USDC/USDT
            <input
              className="input num"
              type="number"
              min="0"
              step="any"
              value={minUsdc}
              onChange={(e) => setMinUsdc(e.target.value)}
            />
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={hideKnown}
              onChange={(e) => setHideKnown(e.target.checked)}
            />
            Hide exchanges &amp; programs
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={requireValue}
              onChange={(e) => setRequireValue(e.target.checked)}
            />
            Hide wallets with no SOL/USDC movement
          </label>
        </div>
        <button className="btn" disabled={loading || !wallet.trim() || selected.size === 0}>
          {loading && rows.length === 0 ? "Scanning…" : "Scan wallet"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {searched && (
        <section>
          <p className="muted">
            {wallets.length} wallets ({rows.length} matching transfers) from {scanned} transactions
            scanned
            {hideKnown && hidden > 0 && ` · ${hidden} exchange/program wallets hidden`}
          </p>
          {wallets.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Wallet</th>
                    <th>Txs</th>
                    <th>SOL in / out</th>
                    <th>USDC in / out</th>
                    <th>Other tokens</th>
                    <th>Last seen</th>
                  </tr>
                </thead>
                <tbody>
                  {wallets.map((w) => (
                    <tr key={w.wallet}>
                      <td>
                        <a href={`https://solscan.io/account/${w.wallet}`} target="_blank" rel="noreferrer">
                          {short(w.wallet)}
                        </a>
                      </td>
                      <td>{w.txCount}</td>
                      <td>
                        <span className="in">{fmt(w.solIn)}</span> / <span className="out">{fmt(w.solOut)}</span>
                      </td>
                      <td>
                        <span className="in">{fmt(w.usdcIn)}</span> / <span className="out">{fmt(w.usdcOut)}</span>
                      </td>
                      <td>{w.memecoinTransfers || "–"}</td>
                      <td>
                        <a href={`https://solscan.io/tx/${w.lastSignature}`} target="_blank" rel="noreferrer">
                          {new Date(w.lastSeen * 1000).toLocaleString()}
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
