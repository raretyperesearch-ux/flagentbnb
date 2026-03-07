export const metadata = { title: "FLAGENT", description: "Autonomous BSC meme token sniper" };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@400;700&family=IBM+Plex+Mono:ital,wght@0,300;0,400;1,300;1,400&display=swap" rel="stylesheet"/>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"/>
        <meta name="theme-color" content="#050503"/>
        <style>{`*{box-sizing:border-box;margin:0;padding:0}html,body{background:#050503;overscroll-behavior:none;-webkit-font-smoothing:antialiased}`}</style>
      </head>
      <body>{children}</body>
    </html>
  );
}
