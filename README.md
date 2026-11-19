<img src="public/logo-512.png" width="120" alt="Yeti Scout logo" />

# Yeti Scout

Run any Sui token through the sniff test.

Paste a Sui coin type or an X handle. Yeti Scout reads who is really trading the token on Sui and who is really posting about it on X, then tells you if the traction is real or farmed. Every verdict is stored on Walrus and frozen on Sui, so it can't be quietly changed later.

Built for CLAY Hackathon III (Code Like a Yeti) by Lofi the Yeti.

## Who it's for

Anyone on Sui about to buy into a token because their timeline won't stop talking about it, and community strategists who need to know if a project's traction is real before they put their name behind it. Checking that by hand means an hour of opening accounts and pool explorers. Yeti Scout does it in about 30 seconds.

## What it checks

**On Sui**
- **Who's trading it.** Reads the latest transactions in the token's 3 deepest pools straight from Sui (GraphQL). For each one it takes the sender's own change in the token, so a swap routed through an aggregator still counts the real trader. From that: how many wallets trade it, how much comes from the 10 busiest, wallets that bought and sold in the window, and bots that buy and sell the exact same size back and forth (wash trading).
- **The market.** Every pool on every Sui DEX (Cetus, Turbos, Bluefin, Aftermath and more) through DexScreener: market cap, FDV, liquidity, 24h volume against trade count, market cap against liquidity, pool age.
- **Holders.** Holder count and the top 10 wallets' share of supply, from GeckoTerminal.
- **Off-chain volume, shown but never scored.** CoinGecko's all-exchange volume is shown next to the Sui DEX figure, so anyone comparing sites sees where the gap comes from. When exchanges report volume far above the market cap and the onchain volume, the report says so.

**On X**
- Posts tagging the project in the last 7 days, who wrote them (established, regular, new, likely fake), copy-paste text, and whether a few accounts make most of the noise. Every account links to its post.
- If you only paste a coin type, Yeti Scout uses the X account the token lists on DexScreener.

**The verdict** comes from fixed rules, so the same data always gets the same score: **Passed the sniff test**, **Smells a bit off** or **Failed the sniff test**. An AI then writes a short plain-English read on the numbers. It never sets the score.

The rules are fair to size. On deep pools ($500k+ liquidity), bots buying and selling the same size are market makers, so they are shown but not penalised; on thinner tokens the same pattern counts as wash trading. Top-10 concentration only counts against small tokens, because on established ones the biggest wallets are treasuries, staking and exchanges. Tested on LOFI, DEEP, WAL, CETUS, BLUB and HIPPO.

## Live, onchain and shareable

- **Live scan steps.** The scan streams each step to the page as it finishes: pools, swaps, X posts, score.
- **Recently sniffed.** The homepage lists the latest verdicts, read back from the `ReportPublished` events of the Move package on Sui.
- **A page for every report.** `/r/<report id>` loads the frozen `ScoutReport` object from Sui and the full report from Walrus. "Share on X" links there, so every shared scan opens that exact verdict.

## Hold to scan

- Everyone gets 2 free scans, no wallet needed.
- After that, connect a Sui wallet (Phantom, Slush, Suiet...) and sign one message. Nothing is sent and nothing leaves the wallet.
- A wallet holding at least $1 of $LOFI gets 20 scans a day. The balance is checked again on every scan, so LOFI moved out of the wallet stops counting.

The dollar amount, daily scans and free scans are settings (`HOLD_USD`, `HOLDER_DAILY_SCANS`, `FREE_CHECKS`).

## On the record: Move + Walrus

Each finished scan is:
1. stored in full (every signal behind the score) on **Walrus**
2. published on **Sui** by the `yeti_scout::report` Move package as a frozen `ScoutReport` object with the score, verdict and Walrus blob id, plus a `ReportPublished` event

Frozen objects can't be edited or deleted, so anyone can check what Yeti Scout said about a token and when. The package is in [`move/`](move/sources/report.move), with tests.

## Run it

```bash
npm install
cp .env.example .env.local
npm run dev
```

The default is demo mode (sample data). Check that the live data sources respond:

```bash
npm run test:sources            # tests on LOFI
npm run test:sources -- <coin>  # any other coin type
```

## Publish the Move package

No Sui CLI needed: the package is compiled to `move/bytecode.json` and published from Node.

```bash
npm run wallet            # makes a publisher wallet, saves its key to .env.local, prints the address
                          # testnet: get free SUI at https://faucet.sui.io (mainnet: send ~0.5 SUI)
npm run publish:move      # publishes on testnet; `npm run publish:move -- mainnet` for mainnet
```

It prints the four values to copy into Vercel: `PUBLISH_NETWORK`, `SCOUT_PACKAGE_ID`, `SCOUT_OBJECT_ID`, `SCOUT_ADMIN_CAP_ID`. Also copy `PUBLISHER_PRIVATE_KEY` from `.env.local`.

To rebuild the bytecode after changing the Move code: `cd move && sui move test && sui move build --dump-bytecode-as-base64 --no-tree-shaking -e testnet` and save the JSON as `move/bytecode.json`.

Walrus testnet has a free public publisher, used by default. For mainnet, set `WALRUS_PUBLISHER_URL` to a publisher you run or trust.

## Modes

| Mode | Settings | What happens |
|---|---|---|
| Demo | `MOCK=1` (default) | Sample data, open to everyone |
| Test | `MOCK=0`, `SANDBOX=1` | Real Sui and X data on a free test data budget. Open to everyone |
| Live | `MOCK=0`, `SANDBOX=0` | Everything real. Hold to scan after the free scans |

X data and the AI summary come from paid APIs, billed per call to the server's own data budget (`AGENT_PRIVATE_KEY`, `DAILY_SPEND_CAP`). Users never pay for data: the only thing they ever need is LOFI.

Not financial advice. A clean sniff test doesn't make a token safe.
