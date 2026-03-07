"use client";

var BSCSCAN = "https://bscscan.com/address/0x6c8C4C62183B61E9dd0095e821B0F857b555b32d";
var GITHUB = "https://github.com/raretyperesearch-ux/flagentbnb";

export default function HowItWorks() {
  return (
    <div style={{ minHeight: "100dvh", background: "#050503", color: "#6b6255", fontFamily: "'IBM Plex Mono',monospace", display: "flex", flexDirection: "column", alignItems: "center" }}>
      <style>{
        "a{color:#c9a84c;text-decoration:none;opacity:0.7}" +
        "a:hover{opacity:1}"
      }</style>

      <div style={{ maxWidth: 480, width: "100%", padding: "48px 20px" }}>

        <a href="/" style={{ fontFamily: "'Cinzel',serif", fontSize: 14, fontWeight: 700, letterSpacing: "0.22em", color: "#c9a84c", opacity: 0.5, display: "block", marginBottom: 40 }}>
          FLAGENT
        </a>

        <h1 style={{ fontFamily: "'Cinzel',serif", fontSize: 18, fontWeight: 700, color: "#c9a84c", opacity: 0.7, marginBottom: 32, letterSpacing: "0.1em" }}>
          HOW IT WORKS
        </h1>

        <div style={{ fontSize: 11, lineHeight: 2.2, color: "#5a5347" }}>

          <p style={{ marginBottom: 24 }}>
            Flagent is an autonomous trading agent on BNB Chain. It watches for new meme token launches on Four.Meme and Flap.sh bonding curves, evaluates them, and trades with its own wallet.
          </p>

          <p style={{ color: "#c9a84c", opacity: 0.6, fontSize: 9, letterSpacing: "0.2em", marginBottom: 12 }}>SCAN</p>
          <p style={{ marginBottom: 24 }}>
            The bot monitors Four.Meme TokenPurchase events and Flap.sh TokenCreated events in real-time directly on-chain. No third-party APIs. When a new token appears, it evaluates immediately.
          </p>

          <p style={{ color: "#c9a84c", opacity: 0.6, fontSize: 9, letterSpacing: "0.2em", marginBottom: 12 }}>FILTER</p>
          <p style={{ marginBottom: 24 }}>
            Every token goes through a GoPlus security scan — honeypots, mintable tokens, and high-tax contracts are rejected. For Four.Meme tokens, the bonding curve progress is checked. If it's past 80%, it's too late.
          </p>

          <p style={{ color: "#c9a84c", opacity: 0.6, fontSize: 9, letterSpacing: "0.2em", marginBottom: 12 }}>TRADE</p>
          <p style={{ marginBottom: 24 }}>
            Buys are executed directly on the protocol smart contracts using viem. Four.Meme uses buyTokenAMAP on the TokenManager2 contract. Flap.sh uses the Portal's buy function. All trades go through the agent's own wallet.
          </p>

          <p style={{ color: "#c9a84c", opacity: 0.6, fontSize: 9, letterSpacing: "0.2em", marginBottom: 12 }}>EXIT</p>
          <p style={{ marginBottom: 24 }}>
            Positions are monitored every 10 seconds using on-chain price reads. The bot sells 50% at 1.5x, the remaining at 2x. Stop-loss triggers at -40%. If nothing happens in 30 minutes, it exits.
          </p>

          <p style={{ color: "#c9a84c", opacity: 0.6, fontSize: 9, letterSpacing: "0.2em", marginBottom: 12 }}>THINK</p>
          <p style={{ marginBottom: 40 }}>
            After every action, the bot generates a short thought using Claude Sonnet 4. These thoughts stream to the dashboard in real-time alongside the trade activity.
          </p>

          <div style={{ borderTop: "1px solid #1a1815", paddingTop: 20, display: "flex", gap: 20, fontSize: 9, letterSpacing: "0.15em" }}>
            <a href="/">DASHBOARD</a>
            <a href={GITHUB} target="_blank" rel="noopener noreferrer">GITHUB</a>
            <a href={BSCSCAN} target="_blank" rel="noopener noreferrer">BSCSCAN</a>
          </div>

        </div>
      </div>
    </div>
  );
}
