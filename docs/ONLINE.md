# Online play: the public BRAWL ARENA

The title screen's **PLAY ONLINE** button puts you in the public arena: an always-open Brawl match that anyone can join.
The first player to arrive starts a 15 second countdown, then a 3-round Brawl starts on a random map with bots filling it
up to 6 fighters; the more humans, the fewer bots. When the match ends the arena is open again. Nobody hosts it and nobody
can change its rules. If you arrive in the middle of a match you wait in the arena lobby and play the next one.

## Why Vercel alone cannot be the server

Your two Vercel sites (`brawlkai.vercel.app` and `supa-figh.vercel.app`) serve the game, which is a static site. A match is
a program that has to keep running (60 steps a second, one WebSocket per player), and Vercel functions start and stop per
request, so they cannot hold WebSocket connections open. The game server (`server/`, plain Node) therefore needs a host
that keeps a process running; the Vercel sites only need to know its address. Both sites can use the same server.

## 1. Run the server somewhere that stays on

Any Node 20+ host that gives you `wss://` works: Render, Railway, Fly.io, a small VPS. On Render, for example, create a
**Web Service** from this repository with

- Build command: `npm ci`
- Start command: `npm run server`
- Health check path: `/health`

The host sets `PORT` for you and terminates TLS, so players connect with `wss://<your-service>.onrender.com`. Free tiers
put an idle service to sleep: the first player after a quiet period sees "WAKING THE SERVER" for up to half a minute.

Optional environment variables (defaults in brackets):

| variable | meaning |
|---|---|
| `PUBLIC_ARENA` | `0` turns the arena off |
| `ARENA_COUNTDOWN` [15] | seconds from the first player arriving to the match starting |
| `ARENA_FILL` [6] | bots fill every match up to this many fighters |
| `ARENA_MAX` [8] | most humans in the arena at once (a match holds 10 fighters) |
| `ARENA_ROUNDS` [3] | Brawl rounds per match |

Check it: `https://<your-service>/health` answers `ok`.

## 2. Point the Vercel sites at it

In **each** Vercel project (brawlkai and supa-figh): Settings > Environment Variables, add

```
VITE_ONLINE_SERVER = wss://<your-service>.onrender.com
```

for Production (and Preview if you want it there), then redeploy: the address is baked into the build. Without it the
PLAY ONLINE button says that this build has no online server set up.

## Keeping the versions together

The game and the server share the simulation, and the server refuses a game of another protocol version
(`PROTOCOL_VERSION` in `src/net/protocol.ts`: "THE HOST RUNS A DIFFERENT VERSION"). After changing anything in `src/sim`
or `src/net`, redeploy the server and both sites together.

## Trying it locally

```
PORT=8080 ARENA_COUNTDOWN=6 npm run server      # the server, with the arena open
npm run dev                                      # then open http://localhost:5173/?server=ws://localhost:8080
```

Click PLAY ONLINE. `npm run host -- --public` does the same on the LAN next to the hosted rooms. Devices on a LAN can also
keep using HOST GAME / JOIN GAME; the arena shows up in that room list too.

## Before opening it to the world

- There are no accounts: a player is a random id stored in the browser, and a name is whatever the player typed (printable
  ASCII, 12 characters).
- The server limits message rates per connection, but it has no ban list or origin check. If strangers abuse it, put it
  behind the host's own protection (Cloudflare, or an origin allow-list in `server/server.ts`).
- One arena match is one simulation plus 4 to 6 bots: a small instance handles one arena comfortably.
