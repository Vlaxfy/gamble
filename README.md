# Will's Casino: real online version

A real server: everyone who opens your URL is instantly connected. No sign-in needed.
Live chat, tips, who's online, a shared roulette wheel, and bets shown live.
All money, games and the house bank run on the SERVER, so players can't edit their balance.

## Run it on your computer (to test)
    node server.js        (needs Node 18+, no npm install needed)
    open http://localhost:3000
Admin: ADMIN_KEY=yourSecret node server.js

## Put it online (pick one)

### Option A: Render.com (easiest)
1. Put this folder in a GitHub repo (or use "Deploy from a public Git repo").
2. Render: New > Web Service > connect the repo.
   - Runtime: Node   - Build command: (leave empty)   - Start command: node server.js
3. Environment variables:
   - ADMIN_KEY = a long secret only you know
   - DATA_FILE = /data/data.json
4. Add a Disk (paid plan): mount path /data, size 1 GB. Without a disk, player data
   resets whenever the server restarts. Free instances also fall asleep when idle.
5. Your URL (https://something.onrender.com) is the link you give people.

### Option B: Railway / Fly.io / any VPS
Same idea: run `node server.js`, set ADMIN_KEY, set PORT if the host asks for one,
and point DATA_FILE at a persistent volume. On a VPS use pm2 or systemd plus Caddy/nginx for HTTPS.

## Admin panel (only you)
Open the site, click the logo 5 times quickly, type your ADMIN_KEY. The key is checked
by the server on every admin action, so nobody else can use it.
Admin can: see the house bank, withdraw it to your own balance, give players money,
post a gold announcement, clear chat.

## How the rules work
- Everyone starts with $1,000, +$10,000 on their first visit each new day (UTC).
- Every dollar players lose goes to the house bank (shown in the admin panel).
- Rakeback: 15% of total losses, claimed from your profile. Broke (under $1): free $100.
- Accounts are anonymous: a token saved in the browser. Clearing browser data = new account.
  (Adding passwords/Google login is the next step if you want real accounts.)

## Limits to know about
- One server process, data in a JSON file: great for hundreds of players, not millions.
- Players are never asked for real money: this is fake-money play only.
