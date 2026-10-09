// Decides which counterparty addresses to hide: on-chain programs and exchanges.
//
// Three layers, cheapest first:
//   1. STATIC_HIDDEN  - well-known program ids, no network needed
//   2. getMultipleAccounts - any address whose account is `executable` is a program
//   3. Helius batch-identity - best-effort exchange detection (fails soft)

const HELIUS_RPC = "https://mainnet.helius-rpc.com";
const HELIUS_IDENTITY = "https://api.helius.xyz/v1/wallet/batch-identity";
const CHUNK = 100; // max addresses per request for both endpoints

// Add your own known exchange / protocol addresses here.
const STATIC_HIDDEN = new Set([
  "11111111111111111111111111111111", // System Program
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA", // SPL Token
  "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb", // Token-2022
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL", // Associated Token
  "ComputeBudget111111111111111111111111111111",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4", // Jupiter v6
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8", // Raydium AMM v4
]);

// address -> hidden? Survives across requests on a warm server instance.
const cache = new Map<string, boolean>();

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

async function executableSet(addresses: string[], apiKey: string): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(addresses, CHUNK)) {
    try {
      const res = await fetch(`${HELIUS_RPC}/?api-key=${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "getMultipleAccounts",
          // length 0: we only need the `executable` flag, not the data
          params: [part, { encoding: "base64", dataSlice: { offset: 0, length: 0 } }],
        }),
        cache: "no-store",
      });
      if (!res.ok) continue;
      const json = await res.json();
      (json.result?.value ?? []).forEach((acc: any, i: number) => {
        if (acc?.executable) found.add(part[i]);
      });
    } catch {
      // soft-fail: unknown addresses stay visible
    }
  }
  return found;
}

async function exchangeSet(addresses: string[], apiKey: string): Promise<Set<string>> {
  const found = new Set<string>();
  for (const part of chunk(addresses, CHUNK)) {
    try {
      const res = await fetch(`${HELIUS_IDENTITY}?api-key=${apiKey}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ addresses: part }),
        cache: "no-store",
      });
      if (!res.ok) continue; // e.g. plan without Wallet API access
      const list = await res.json();
      for (const item of Array.isArray(list) ? list : []) {
        const text = [item.type, item.category, ...(item.tags ?? [])].join(" ").toLowerCase();
        if (text.includes("exchange")) found.add(item.address);
      }
    } catch {
      // soft-fail
    }
  }
  return found;
}

export async function findHiddenAddresses(
  addresses: string[],
  apiKey: string
): Promise<Set<string>> {
  const unique = Array.from(new Set(addresses));
  const unknown = unique.filter((a) => !STATIC_HIDDEN.has(a) && !cache.has(a));

  if (unknown.length > 0) {
    const [programs, exchanges] = await Promise.all([
      executableSet(unknown, apiKey),
      exchangeSet(unknown, apiKey),
    ]);
    for (const a of unknown) cache.set(a, programs.has(a) || exchanges.has(a));
  }

  return new Set(unique.filter((a) => STATIC_HIDDEN.has(a) || cache.get(a)));
}
