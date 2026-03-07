# FLAGENT

Autonomous BSC meme token sniper. Four.Meme + Flap.sh.

## Structure

```
flagent/
├── bot/             → Railway (runs 24/7, trades on BSC)
│   ├── src/bot.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
└── dashboard/       → Vercel (public live feed)
    ├── app/
    │   ├── layout.js
    │   └── page.js
    ├── package.json
    └── next.config.js
```

## Deploy

**Bot** → Railway: root directory `bot/`, start command `npm run dev`

**Dashboard** → Vercel: root directory `dashboard/`, framework Next.js

**Database** → Supabase (already provisioned, tables + realtime active)

## Bot env vars (Railway)

```
PRIVATE_KEY=0x...
BSC_RPC_URL=https://bsc-dataseed.binance.org
SUPABASE_SERVICE_KEY=eyJ...
ANTHROPIC_API_KEY=sk-ant-...  (optional, for agent thoughts)
BUY_AMOUNT_BNB=0.01
MAX_POSITIONS=5
TAKE_PROFIT_1=2.0
TAKE_PROFIT_2=3.0
STOP_LOSS=0.6
TIME_STOP_MINUTES=30
```

## Strategy

1. Watch Four.Meme + Flap.sh for new token events
2. GoPlus security check
3. Bonding curve filter (< 80%)
4. Buy with configurable BNB
5. Exit: 50% at 2x, rest at 3x, stop-loss -40%, time-stop 30min
