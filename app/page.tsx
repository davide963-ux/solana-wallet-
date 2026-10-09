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
  const [mint, setMint] = useState("");
  const [minUsdc, setMinUsdc] = useState("");
  const [direction, setDirection] = useState<"both" | "in" | "out">("both");
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [nextBefore, setNextBefore] = useState<string | null>(null);
  const [scanned, setScanned] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searched, setSearched] = useState(false);
  // The mint the current results were scanned with (not the live input value).
  const [searchedMint, setSearchedMint] = useState("");

  // Wallets that only exchanged "other tokens" (often spam airdrops) have 0 SOL and 0 USDC flow.
  // Token mode: the rows are already limited to the searched mint, so the SOL/USDC
  // value filter does not apply.
  const tokenMode = searched && !!searchedMint;
  const wallets = useMemo(
    () =>
      summarizeByWallet(rows, searchedMint || undefined).filter(
        (w) => tokenMode || !requireValue || w.solIn + w.solOut + w.usdcIn + w.usdcOut > 0
      ),
    [rows, requireValue, searchedMint, tokenMode]
  );
  const totalTokenTransfers = wallets.reduce((n, w) => n + w.tokenIn + w.tokenOut, 0);

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
      const m = before ? searchedMint : mint.trim();
      if (m) params.set("mint", m);
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
      if (!before) setSearchedMint(mint.trim());
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
        <input
          className="input"
          placeholder="Token CA (optional) — count transfers of this token only"
          value={mint}
          onChange={(e) => setMint(e.target.value)}
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
        <button className="btn" disabled={loading || !wallet.trim() || (selected.size === 0 && !mint.trim())}>
          {loading && rows.length === 0 ? "Scanning…" : "Scan wallet"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {searched && (
        <section>
          <p className="muted">
            {tokenMode
              ? `${totalTokenTransfers} transfers of ${short(searchedMint)} across ${wallets.length} wallets`
              : `${wallets.length} wallets (${rows.length} matching transfers)`}{" "}
            from {scanned} transactions scanned
            {hideKnown && hidden > 0 && ` · ${hidden} exchange/program wallets hidden`}
          </p>
          {wallets.length > 0 && (
            <div className="tablewrap">
              <table>
                <thead>
                  <tr>
                    <th>Wallet</th>
                    {tokenMode ? (
                      <>
                        <th>Transfers</th>
                        <th>Received (count / amount)</th>
                        <th>Sent (count / amount)</th>
                      </>
                    ) : (
                      <>
                        <th>Txs</th>
                        <th>SOL in / out</th>
                        <th>USDC in / out</th>
                        <th>Other tokens</th>
                      </>
                    )}
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
                      {tokenMode ? (
                        <>
                          <td>{w.tokenIn + w.tokenOut}</td>
                          <td>
                            <span className="in">{w.tokenIn}</span> / {fmt(w.tokenAmountIn)}
                          </td>
                          <td>
                            <span className="out">{w.tokenOut}</span> / {fmt(w.tokenAmountOut)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{w.txCount}</td>
                          <td>
                            <span className="in">{fmt(w.solIn)}</span> / <span className="out">{fmt(w.solOut)}</span>
                          </td>
                          <td>
                            <span className="in">{fmt(w.usdcIn)}</span> / <span className="out">{fmt(w.usdcOut)}</span>
                          </td>
                          <td>{w.memecoinTransfers || "–"}</td>
                        </>
                      )}
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
