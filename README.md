# Belote Live

> A lively multiplayer Belote table with a cinematic Tailwind UI and a lightweight TypeScript WebSocket backend.

Belote Live lets four friends jump into a digital card table, manage trumps, announce belote/rebelote, and watch every trick play out in real time. The lobby, the felt table, the score panels, and even the trick winner spotlight are all crafted with Tailwind CSS to match the vibe of an elegant card club.

## ▶️ Play It Now

Take a seat instantly at **https://belote-live.vercel.app/**.

## ✨ Features

- Slick Tailwind-driven UI with animated hands, trump banners, player badges, and trick spotlights.
- Real-time gameplay powered by a Node.js WebSocket server and a deterministic Belote engine.
- Smart lobby: generate/join rooms, auto-assign seats, and keep track of who’s connected.
- Animated bidding flow (take/pass, second-round suit picking) with trump visuals.
- Score widgets for the current deal and cumulative match progress up to 1001 points.
- Support for belote/rebelote announcements, end-of-deal overlay, and trick winner callouts.
- Custom SVG assets (card faces, card backs, deck stack, favicon) for a coherent visual identity.

## 🧱 Tech Stack

| Layer        | Technologies                                                                 |
| ------------ | ----------------------------------------------------------------------------- |
| Frontend     | React 19, Vite, TypeScript, Tailwind CSS, ESLint                              |
| Realtime     | Node.js, `ws`, custom Belote engine + validation logic                        |
| Tooling      | TypeScript ESLint, ts-node-dev, Vite dev server, custom SVG components        |

## 📂 Project Structure

```
belote-live/
├─ backend/               # Node/WebSocket server
│  ├─ src/
│  │  ├─ game/            # Belote engine (deal, rules, validation)
│  │  ├─ realtime.ts      # WebSocket event hub
│  │  └─ index.ts         # HTTP server + health/debug endpoints
│  └─ package.json
├─ frontend/              # React + Tailwind client
│  ├─ src/
│  │  ├─ App.tsx          # Main UI (lobby, table, overlays, cards)
│  │  ├─ assets/          # SVGs (cards, favicon)
│  │  └─ config.ts        # WebSocket endpoint config
│  ├─ public/
│  └─ package.json
├─ package.json           # Root helper scripts (dev:frontend, dev:backend)
└─ README.md
```

## ⚙️ Configuration

| Variable            | Scope      | Default              | Description                                   |
| ------------------- | ---------- | -------------------- | --------------------------------------------- |
| `PORT`              | Backend    | `3000`               | HTTP/WebSocket server port                    |
| `VITE_BACKEND_URL`  | Frontend   | `http://localhost:3000` | Overrides backend base URL for the client  |

On boot, the frontend derives `ws://…/ws` automatically from `VITE_BACKEND_URL`.

## 🚀 Getting Started

### Prerequisites

- Node.js ≥ 18
- npm ≥ 9

### 1. Install dependencies

```bash
npm install              # installs root helper deps (optional)
cd backend && npm install
cd ../frontend && npm install
```

### 2. Start the backend

```bash
cd backend
npm run dev              # ts-node-dev, listens on PORT (3000 by default)
```

### 3. Start the frontend

```bash
cd frontend
npm run dev              # Vite dev server (defaults to http://localhost:5173)
```

Update `frontend/.env` with `VITE_BACKEND_URL` if your backend runs elsewhere.

### 4. Production build

```bash
# frontend
cd frontend
npm run build            # emits dist/ with Vite output

# backend
cd backend
npm run build            # compiles to dist/
npm start                # runs Node on the compiled bundle
```

## 🃏 Gameplay Flow

1. **Lobby:** players enter a nickname, share a table code, and take seats automatically.
2. **Deal & Bidding:** five-card distribution, first-round “take/pass”, then optional second-round suit choice.
3. **Play Tricks:** hands fan out with hover interactions, trick cards fly in from each seat, and belote/rebelote buttons appear contextually.
4. **Scoring:** the sidebar shows the current deal plus the cumulative match progress bars.
5. **End of Deal:** a celebratory overlay summarizes both teams before the next dealer is chosen.

## 🧪 Quality

- `frontend`: `npm run lint` (ESLint + TypeScript rules for React/Tailwind components).
- `backend`: TypeScript compilation (`npm run build`) doubles as a type check.

CI is not wired yet; run the commands locally before pushing.

## 🤝 Contributing

1. Fork & clone the repo.
2. Create a feature branch.
3. Make sure `npm run lint` (frontend) and `npm run build` (backend) succeed.
4. Open a pull request describing UI changes with screenshots or GIFs when possible.

Any idea—from new scoring panels to persistent player rankings—is welcome. Open an issue to start a discussion!

---

Made with ♥️ and a lot of belote nostalgia. Shuffle up and deal! 🃏
