# Yeti Scout

Run any Sui token through the sniff test.

Paste a Sui coin type or an X handle. Yeti Scout reads who is really trading the token on Sui and who is really posting about it on X, then tells you if the traction is real or farmed. Every verdict is stored on Walrus and frozen on Sui, so it can't be quietly changed later.

Built for CLAY Hackathon III (Code Like a Yeti) by Lofi the Yeti.

## Who it's for

Anyone on Sui about to buy into a token because their timeline won't stop talking about it, and community strategists who need to know if a project's traction is real before they put their name behind it. Checking that by hand means an hour of opening accounts and pool explorers. Yeti Scout does it in about 30 seconds.

## What it checks

**On Sui**
- **Who's trading it.** Reads the latest ~200 transactions in the token's main pool straight from Sui (GraphQL). For each one it takes the sender's own change in the token, so a swap routed through an aggregator still counts the real trader. From that: how many wallets trade it, how much of the trading comes from the 10 busiest, wallets that both bought and sold in the window (a common wash pattern), and wallets that keep swapping the exact same size (scripted volume).
- **The market.** Every pool on every Sui DEX (Cetus, Turbos, Bluefin, Aftermath and more) through DexScreener: liquidity, 24h volume vs trade count, market cap vs liquidity, pool age.
- **Holders.** Holder count and the top 10 wallets' share of supply, from GeckoTerminal.

**On X**
- Posts tagging the project in the last 7 days, who wrote them (established, regular, new, likely fake), copy-paste text, and whether a few accounts make most of the noise. Every account links to its post.
- If you only paste a coin type, Yeti Scout uses the X account the token lists on DexScreener.

**The verdict** comes from fixed rules, so the same token gets the same score: **Passed the sniff test**, **Smells a bit off** or **Failed the sniff test**. An AI then writes a short plain-English read on the numbers. It never sets the score.

## Hold to scan

- Everyone gets 2 free scans, no wallet needed.
- After that, connect a Sui wallet (Phantom, Slush, Suiet...) and sign one message. Nothing is sent and nothing leaves the wallet.
- A wallet holding at least $3 of $LOFI gets 20 scans a day. The balance is checked again on every scan, so LOFI moved out of the wallet stops counting.

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
| Test | `MOCK=0`, `SANDBOX=1` | Real Sui and X data, X paid with free test USDC. Open to everyone |
| Live | `MOCK=0`, `SANDBOX=0` | Everything real. Hold to scan after the free scans |

X data and the AI summary are bought per call through [buy](https://usebuy.ai) by the agent's own wallet, the same setup as [traction-check](https://github.com/Truthgeng/traction-check), which won Celo's Agents on Open Rails hackathon.

Not financial advice. A clean sniff test doesn't make a token safe.
