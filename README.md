# Solana Wallet Scanner (MVP)

Paste a wallet, choose filters (SOL / USDC+USDT / memecoins), see matching transfers.

## Run

```bash
cp .env.example .env.local   # then put your Helius API key in it
npm install
npm run dev                  # http://localhost:3000
```

Get a free key at https://helius.dev

## Structure

- `app/page.tsx`        form + results table (client component)
- `app/api/scan/route.ts` validates input, pages through Helius, applies filters
- `lib/classify.ts`     maps parsed transactions to sol / usdc / memecoin rows

## Notes

- "Memecoin" = any SPL token that is not wrapped SOL, USDC or USDT (MVP heuristic).
- Each API call scans up to 500 transactions; "Load older" continues via the `before` cursor.
