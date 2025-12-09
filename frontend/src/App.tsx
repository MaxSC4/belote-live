import { useEffect, useRef, useState } from "react";
import { config } from "./config";
import type { Card, DealResponse, GameStateWS } from "./gameTypes";

type View = "lobby" | "game";

interface RoomPlayer {
  id: string;
  nickname: string;
  seat: number | null;
}

type RoomUpdateMessage = {
  type: "room_update";
  payload: {
    roomCode: string;
    players: RoomPlayer[];
  };
};

type ErrorMessage = {
  type: "error";
  payload: {
    message: string;
  };
};

type GameStateMessage = {
  type: "game_state";
  payload: {
    state: GameStateWS;
  };
};

type TablePosition = "bottom" | "top" | "left" | "right";

const TABLE_POSITIONS: TablePosition[] = ["bottom", "left", "top", "right"];

// Styles globaux pour les animations
const GLOBAL_STYLES = `
@keyframes trick-from-top {
  from { transform: translateY(-12px) scale(0.9); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes trick-from-bottom {
  from { transform: translateY(12px) scale(0.9); opacity: 0; }
  to   { transform: translateY(0) scale(1); opacity: 1; }
}
@keyframes trick-from-left {
  from { transform: translateX(-12px) scale(0.9); opacity: 0; }
  to   { transform: translateX(0) scale(1); opacity: 1; }
}
@keyframes trick-from-right {
  from { transform: translateX(12px) scale(0.9); opacity: 0; }
  to   { transform: translateX(0) scale(1); opacity: 1; }
}
@keyframes trick-winner-banner {
  0%   { transform: translateY(-10px) scale(0.95); opacity: 0; }
  20%  { transform: translateY(0) scale(1); opacity: 1; }
  80%  { transform: translateY(0) scale(1); opacity: 1; }
  100% { transform: translateY(-8px) scale(0.95); opacity: 0; }
}
@keyframes final-score-pop {
  0%   { transform: scale(0.8); opacity: 0; }
  60%  { transform: scale(1.05); opacity: 1; }
  100% { transform: scale(1); opacity: 1; }
}
@keyframes backdrop-fade {
  from { opacity: 0; }
  to   { opacity: 0.75; }
}
`;

function App() {
  const [view, setView] = useState<View>("lobby");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");

  const [hand, setHand] = useState<Card[]>([]);
  const [isLoadingHand, setIsLoadingHand] = useState(false);
  const [handError, setHandError] = useState<string | null>(null);

  const [wsStatus, setWsStatus] = useState<
    "disconnected" | "connecting" | "connected"
  >("disconnected");
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
  const [wsError, setWsError] = useState<string | null>(null);

  const [gameState, setGameState] = useState<GameStateWS | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  // Animations : bannière gagnant de pli + overlay fin de donne
  const [showTrickWinnerBanner, setShowTrickWinnerBanner] = useState(false);
  const [showEndOverlay, setShowEndOverlay] = useState(false);
  const prevPhaseRef = useRef<string | null>(null);

  // Injecter les keyframes une fois
  useEffect(() => {
    const styleEl = document.createElement("style");
    styleEl.innerHTML = GLOBAL_STYLES;
    document.head.appendChild(styleEl);
    return () => {
      document.head.removeChild(styleEl);
    };
  }, []);

  // ---- LOBBY ----

  const handleJoin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!nickname || !roomCode) return;
    setView("game");
  };

  const handleCreateRoom = () => {
    const randomCode = `TABLE${Math.floor(Math.random() * 90 + 10)}`;
    setRoomCode(randomCode);
  };

  // ---- HTTP DEBUG DEAL (fallback) ----

  useEffect(() => {
    if (view !== "game") return;

    const fetchDeal = async () => {
      setIsLoadingHand(true);
      setHandError(null);

      try {
        const response = await fetch(`${config.backendUrl}/debug/deal`);
        if (!response.ok) {
          throw new Error(`Erreur HTTP ${response.status}`);
        }

        const data: DealResponse = await response.json();
        const myHand = data.hands["0"] || [];
        setHand(myHand);
      } catch (error) {
        console.error(error);
        setHandError("Impossible de récupérer la donne depuis le serveur.");
      } finally {
        setIsLoadingHand(false);
      }
    };

    fetchDeal();
  }, [view]);

  // ---- WEBSOCKET ----

  useEffect(() => {
    if (view !== "game") {
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
      setWsStatus("disconnected");
      setRoomPlayers([]);
      setWsError(null);
      setGameState(null);
      return;
    }

    setWsStatus("connecting");
    setWsError(null);

    const ws = new WebSocket(config.wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      ws.send(
        JSON.stringify({
          type: "join_room",
          payload: { roomCode, nickname },
        })
      );
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as
          | RoomUpdateMessage
          | ErrorMessage
          | GameStateMessage;

        if (data.type === "room_update") {
          if (data.payload.roomCode === roomCode) {
            setRoomPlayers(data.payload.players);
          }
        } else if (data.type === "error") {
          setWsError(data.payload.message);
        } else if (data.type === "game_state") {
          setGameState(data.payload.state);
        }
      } catch (error) {
        console.error("Message WS invalide", error);
      }
    };

    ws.onerror = () => {
      setWsStatus("disconnected");
      setWsError("Erreur de connexion WebSocket.");
    };

    ws.onclose = () => {
      setWsStatus("disconnected");
    };

    return () => {
      ws.close();
    };
  }, [view, roomCode, nickname]);

  const handleStartGame = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "start_game" }));
  };

  // ---- INFOS JOUEURS / TABLE ----

  const mySeat =
    roomPlayers.find((p) => p.nickname === nickname)?.seat ?? null;

  const effectiveHand: Card[] =
    gameState && mySeat !== null
      ? gameState.hands[String(mySeat)] || []
      : hand;

  const isMyTurn =
    gameState &&
    mySeat !== null &&
    gameState.currentPlayer === mySeat &&
    gameState.phase === "PlayingTricks";

  const handlePlayCard = (card: Card) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!gameState || mySeat === null || !isMyTurn) return;

    wsRef.current.send(
      JSON.stringify({
        type: "play_card",
        payload: { card },
      })
    );
  };

  const currentPhase = gameState?.phase ?? "—";
  const trumpSymbol = gameState?.trumpSuit ?? "—";

  // Mappage 0–3 vers positions de table, en gardant "moi" en bas
  function seatToTablePosition(seat: number | null): TablePosition | null {
    if (seat === null) return null;
    if (mySeat === null) return TABLE_POSITIONS[seat] ?? null;
    const relativeIndex = (seat - mySeat + 4) % 4;
    return TABLE_POSITIONS[relativeIndex] ?? null;
  }

  const playersByPosition: Partial<Record<TablePosition, RoomPlayer>> = {};
  roomPlayers.forEach((player) => {
    if (player.seat === null) return;
    const pos = seatToTablePosition(player.seat);
    if (!pos) return;
    playersByPosition[pos] = player;
  });

  // Pour l'affichage : J1–J4
  function playerNameForSeat(seat: number): string {
    const player = roomPlayers.find((p) => p.seat === seat);
    const label = `J${seat + 1}`;
    return player?.nickname ? `${player.nickname} (${label})` : label;
  }

  function shortSeatLabel(seat: number): string {
    return `J${seat + 1}`;
  }

  function cardPositionForPlayerSeat(seat: number): TablePosition {
    return seatToTablePosition(seat) ?? "top";
  }

  // ---- Animations : gagnant de pli & fin de donne ----

  // Bannière "Pli pour ..."
  useEffect(() => {
    if (!gameState || !gameState.trick) return;
    if (gameState.trick.winner === undefined) return;

    setShowTrickWinnerBanner(true);
    const timer = setTimeout(() => setShowTrickWinnerBanner(false), 1800);
    return () => clearTimeout(timer);
  }, [gameState?.trick?.winner]);

  // Overlay de score final quand on passe à Finished
  useEffect(() => {
    const phase = gameState?.phase;
    const prev = prevPhaseRef.current;

    if (phase === "Finished" && prev && prev !== "Finished") {
      setShowEndOverlay(true);
    }
    prevPhaseRef.current = phase ?? null;
  }, [gameState?.phase]);

  // ---------- LOBBY ----------

  if (view === "lobby") {
    return (
      <div
        style={{
          height: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "radial-gradient(circle at top, #1d283a 0, #020617 55%, #000 100%)",
          color: "#e5e7eb",
          fontFamily:
            "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 480,
            padding: "2rem",
            borderRadius: "1.5rem",
            background: "rgba(15,23,42,0.92)",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.75)",
            border: "1px solid rgba(148,163,184,0.3)",
          }}
        >
          <h1 style={{ fontSize: "1.9rem", marginBottom: "0.25rem" }}>
            belote-live
          </h1>
          <p style={{ margin: 0, color: "#9ca3af", fontSize: "0.9rem" }}>
            Belote en ligne entre collègues, temps réel, 4 joueurs.
          </p>

          <div
            style={{
              marginTop: "1.5rem",
              marginBottom: "1.25rem",
              padding: "0.5rem 0.75rem",
              borderRadius: "0.75rem",
              background:
                "linear-gradient(120deg, rgba(15,23,42,0.9), rgba(22,101,52,0.3))",
              border: "1px solid rgba(34,197,94,0.35)",
              fontSize: "0.8rem",
              color: "#bbf7d0",
            }}
          >
            <span style={{ marginRight: "0.4rem" }}>🃏</span>
            Créez un code de table, partagez-le à 3 collègues et lancez la
            partie.
          </div>

          <button
            type="button"
            onClick={handleCreateRoom}
            style={{
              marginBottom: "1rem",
              padding: "0.5rem 0.75rem",
              borderRadius: "9999px",
              border: "1px solid rgba(94,234,212,0.3)",
              background:
                "linear-gradient(120deg, rgba(45,212,191,0.18), rgba(56,189,248,0.08))",
              color: "#5eead4",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Générer un code de table aléatoire
          </button>

          <form
            onSubmit={handleJoin}
            style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}
          >
            <div>
              <label
                htmlFor="nickname"
                style={{
                  display: "block",
                  marginBottom: "0.25rem",
                  fontSize: "0.9rem",
                }}
              >
                Pseudo
              </label>
              <input
                id="nickname"
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="Ex : Max, Claire..."
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.75rem",
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "rgba(15,23,42,0.9)",
                  color: "#e5e7eb",
                  outline: "none",
                }}
              />
            </div>

            <div>
              <label
                htmlFor="roomCode"
                style={{
                  display: "block",
                  marginBottom: "0.25rem",
                  fontSize: "0.9rem",
                }}
              >
                Code de table
              </label>
              <input
                id="roomCode"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                placeholder="Ex : TABLE42"
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.75rem",
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "rgba(15,23,42,0.9)",
                  color: "#e5e7eb",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  outline: "none",
                }}
              />
            </div>

            <button
              type="submit"
              style={{
                marginTop: "0.75rem",
                padding: "0.6rem 0.75rem",
                borderRadius: "0.75rem",
                border: "none",
                background:
                  "linear-gradient(135deg, #22c55e, #16a34a, #22c55e)",
                color: "#f9fafb",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Rejoindre la table
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ---------- JEU ----------

  return (
    <div
      style={{
        height: "100vh",
        background:
          "radial-gradient(circle at top, #1f2937 0, #020617 50%, #000 100%)",
        color: "#e5e7eb",
        padding: "0.75rem",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }}
    >
      {/* HEADER */}
      <header
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          paddingBottom: "0.6rem",
          borderBottom: "1px solid rgba(15,23,42,0.9)",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h1 style={{ margin: 0, fontSize: "1.4rem" }}>Table {roomCode}</h1>
            <span
              style={{
                padding: "0.1rem 0.5rem",
                borderRadius: "9999px",
                border: "1px solid rgba(148,163,184,0.5)",
                fontSize: "0.7rem",
                color: "#9ca3af",
              }}
            >
              4 joueurs · belote classique
            </span>
          </div>
          <p style={{ margin: "0.25rem 0 0", fontSize: "0.9rem" }}>
            Connecté en tant que <strong>{nickname}</strong>
            {mySeat !== null && ` (${shortSeatLabel(mySeat)})`}
          </p>
          <p
            style={{
              margin: "0.1rem 0 0",
              fontSize: "0.8rem",
              color: "#6b7280",
            }}
          >
            WebSocket :{" "}
            {wsStatus === "connected"
              ? "connecté ✅"
              : wsStatus === "connecting"
              ? "connexion en cours..."
              : "déconnecté ❌"}
          </p>
          {gameState && (
            <p
              style={{
                margin: "0.1rem 0 0",
                fontSize: "0.8rem",
                color: "#9ca3af",
              }}
            >
              Atout :{" "}
              <strong
                style={{
                  color:
                    trumpSymbol === "♥" || trumpSymbol === "♦"
                      ? "#f97373"
                      : "#e5e7eb",
                }}
              >
                {trumpSymbol}
              </strong>{" "}
              • Phase : <strong>{currentPhase}</strong>
            </p>
          )}
        </div>

        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleStartGame}
            disabled={wsStatus !== "connected"}
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "9999px",
              border: "none",
              background:
                wsStatus === "connected"
                  ? "linear-gradient(135deg, #22c55e, #16a34a)"
                  : "rgba(55,65,81,0.8)",
              color: "#f9fafb",
              cursor: wsStatus === "connected" ? "pointer" : "not-allowed",
              fontSize: "0.85rem",
            }}
          >
            Lancer la partie
          </button>

          <button
            type="button"
            onClick={() => setView("lobby")}
            style={{
              padding: "0.4rem 0.9rem",
              borderRadius: "9999px",
              border: "1px solid rgba(148,163,184,0.6)",
              background: "transparent",
              color: "#e5e7eb",
              cursor: "pointer",
              fontSize: "0.85rem",
            }}
          >
            Quitter la table
          </button>
        </div>
      </header>

      {/* ZONE PRINCIPALE */}
      <main
        style={{
          flex: 1,
          marginTop: "0.4rem",
          position: "relative",
          minHeight: 0,
        }}
      >
        {/* TAPIS */}
        <section
          style={{
            position: "absolute",
            inset: 0,
            borderRadius: "1.25rem",
            border: "1px solid rgba(148,163,184,0.35)",
            background:
              "radial-gradient(circle at 20% 0, #047857 0, #065f46 40%, #052e16 80%)",
            boxShadow: "0 25px 60px -24px rgba(0,0,0,0.95)",
            display: "flex",
            flexDirection: "column",
            padding: "0.5rem 0.75rem 0.6rem",
          }}
        >
          {/* Bannière gagnant du pli */}
          {showTrickWinnerBanner &&
            gameState &&
            gameState.trick &&
            gameState.trick.winner !== undefined && (
              <div
                style={{
                  position: "absolute",
                  top: "0.7rem",
                  left: "50%",
                  transform: "translateX(-50%)",
                  padding: "0.35rem 0.8rem",
                  borderRadius: "9999px",
                  background:
                    "linear-gradient(120deg, rgba(22,163,74,0.9), rgba(21,128,61,0.8))",
                  border: "1px solid rgba(34,197,94,0.9)",
                  fontSize: "0.8rem",
                  boxShadow: "0 18px 35px -24px rgba(0,0,0,1)",
                  animation: "trick-winner-banner 1.8s ease-out",
                }}
              >
                💥 Pli pour{" "}
                <strong>
                  {playerNameForSeat(gameState.trick.winner)}
                </strong>
              </div>
            )}

          {/* JOUEURS + PLI AU CENTRE */}
          <div
            style={{
              flex: 1,
              display: "grid",
              gridTemplateColumns: "1fr auto 1fr",
              gridTemplateRows: "auto 1fr auto",
              alignItems: "center",
              justifyItems: "center",
              gap: "0.25rem",
              minHeight: 0,
            }}
          >
            <SeatBanner
              position="top"
              player={playersByPosition.top}
              isCurrent={
                !!(
                  gameState &&
                  playersByPosition.top?.seat === gameState.currentPlayer
                )
              }
            />
            <SeatBanner
              position="left"
              player={playersByPosition.left}
              isCurrent={
                !!(
                  gameState &&
                  playersByPosition.left?.seat === gameState.currentPlayer
                )
              }
            />
            <SeatBanner
              position="right"
              player={playersByPosition.right}
              isCurrent={
                !!(
                  gameState &&
                  playersByPosition.right?.seat === gameState.currentPlayer
                )
              }
            />

            {/* PLI */}
            <div
              style={{
                gridColumn: 2,
                gridRow: 2,
                width: "100%",
                maxWidth: 380,
                minHeight: 150,
                borderRadius: "0.85rem",
                border: "1px solid rgba(15,23,42,0.9)",
                background:
                  "radial-gradient(circle at 50% 0, rgba(15,23,42,0.96), rgba(15,23,42,0.8))",
                boxShadow: "0 18px 35px -24px rgba(0,0,0,1)",
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gridTemplateRows: "1fr 1fr",
                padding: "0.5rem",
              }}
            >
              {gameState &&
                gameState.trick &&
                gameState.trick.cards.map((tc, idx) => {
                  const pos = cardPositionForPlayerSeat(tc.player);
                  return (
                    <TrickCardView
                      key={`${tc.player}-${idx}`}
                      position={pos}
                      card={tc.card}
                      playerLabel={shortSeatLabel(tc.player)}
                    />
                  );
                })}
            </div>

            <SeatBanner
              position="bottom"
              player={playersByPosition.bottom}
              isCurrent={
                !!(
                  gameState &&
                  playersByPosition.bottom?.seat === gameState.currentPlayer
                )
              }
              isSelf={true}
            />
          </div>

          {/* MAIN EN ÉVENTAIL */}
          <div
            style={{
              marginTop: "0.15rem",
              paddingTop: "0.4rem",
              borderTop: "1px solid rgba(15,23,42,0.85)",
              flexShrink: 0,
            }}
          >
            <p
              style={{
                margin: "0 0 0.3rem 0.4rem",
                fontSize: "0.8rem",
                color: "#e5e7eb",
              }}
            >
              Votre main{" "}
              {isMyTurn && (
                <span style={{ color: "#bbf7d0" }}>
                  — c&apos;est à vous de jouer
                </span>
              )}
              {gameState && gameState.phase === "Finished" && (
                <span style={{ color: "#facc15", marginLeft: "0.4rem" }}>
                  — donne terminée
                </span>
              )}
            </p>

            {isLoadingHand && <p>Distribution des cartes en cours...</p>}
            {handError && (
              <p style={{ color: "#fee2e2", fontSize: "0.9rem" }}>
                {handError}
              </p>
            )}

            {!isLoadingHand && !handError && (
              <div
                style={{
                  position: "relative",
                  height: "5.4rem",
                  maxWidth: "100%",
                  margin: "0 auto",
                }}
              >
                {effectiveHand.map((card, index) => {
                  const total = effectiveHand.length;
                  const clickable = Boolean(isMyTurn);

                  const maxAngle = 18;
                  const angleStep =
                    total > 1 ? (maxAngle * 2) / (total - 1) : 0;
                  const angle =
                    total > 1 ? -maxAngle + index * angleStep : 0;

                  const centerShift = (index - (total - 1) / 2) * 30;
                  const offsetY = -Math.abs(angle) * 0.18;

                  const transform = `translateX(-50%) translateX(${centerShift}px) translateY(${offsetY}px) rotate(${angle}deg)`;

                  return (
                    <button
                      key={`${card.rank}-${card.suit}-${index}`}
                      type="button"
                      onClick={() => clickable && handlePlayCard(card)}
                      disabled={!clickable}
                      style={{
                        position: "absolute",
                        left: "50%",
                        bottom: 0,
                        transform,
                        transformOrigin: "50% 100%",
                        border: "none",
                        padding: 0,
                        margin: 0,
                        background: "transparent",
                        cursor: clickable ? "pointer" : "default",
                      }}
                    >
                      <CardSvg card={card} />
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* SIDEBAR */}
        <aside
          style={{
            position: "absolute",
            right: "0.5rem",
            top: "0.5rem",
            width: 260,
            maxWidth: "45vw",
            borderRadius: "0.9rem",
            border: "1px solid rgba(148,163,184,0.45)",
            background: "rgba(15,23,42,0.97)",
            boxShadow: "0 24px 50px -24px rgba(0,0,0,0.95)",
            padding: "0.6rem 0.65rem",
            fontSize: "0.9rem",
          }}
        >
          <h2
            style={{
              margin: 0,
              marginBottom: "0.25rem",
              fontSize: "0.95rem",
            }}
          >
            Joueurs
          </h2>

          {roomPlayers.length === 0 && !wsError && (
            <p style={{ color: "#9ca3af" }}>
              En attente d&apos;autres joueurs...
            </p>
          )}

          <ul
            style={{
              listStyle: "none",
              paddingLeft: 0,
              margin: 0,
              display: "flex",
              flexDirection: "column",
              gap: "0.25rem",
            }}
          >
            {roomPlayers.map((player) => {
              const isCurrent =
                !!gameState &&
                player.seat !== null &&
                player.seat === gameState.currentPlayer;
              const isYou = player.nickname === nickname;

              return (
                <li
                  key={player.id}
                  style={{
                    padding: "0.35rem 0.45rem",
                    borderRadius: "0.6rem",
                    border: isCurrent
                      ? "1px solid rgba(34,197,94,0.8)"
                      : "1px solid rgba(148,163,184,0.4)",
                    background: isCurrent
                      ? "linear-gradient(120deg, rgba(22,163,74,0.32), rgba(21,128,61,0.08))"
                      : "rgba(15,23,42,0.98)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    gap: "0.5rem",
                  }}
                >
                  <div>
                    <span>
                      {player.nickname}
                      {isYou && (
                        <span style={{ color: "#a5b4fc" }}> (vous)</span>
                      )}
                      {player.seat !== null &&
                        ` — ${shortSeatLabel(player.seat)}`}
                    </span>
                    {isCurrent && (
                      <span
                        style={{
                          marginLeft: "0.3rem",
                          fontSize: "0.75rem",
                          color: "#4ade80",
                        }}
                      >
                        tour de jeu
                      </span>
                    )}
                  </div>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      color: "#6b7280",
                    }}
                  >
                    {player.id.slice(-4)}
                  </span>
                </li>
              );
            })}
          </ul>

          {gameState && (
            <div
              style={{
                marginTop: "0.4rem",
                padding: "0.4rem 0.5rem 0.35rem",
                borderRadius: "0.6rem",
                border: "1px solid rgba(148,163,184,0.45)",
                background: "rgba(15,23,42,0.98)",
              }}
            >
              <h3
                style={{
                  margin: 0,
                  marginBottom: "0.2rem",
                  fontSize: "0.9rem",
                }}
              >
                Scores
              </h3>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.82rem",
                  color: "#e5e7eb",
                }}
              >
                Équipe ({shortSeatLabel(0)} &amp; {shortSeatLabel(2)}) :{" "}
                <strong>{gameState.scores.team0}</strong> pts
              </p>
              <p
                style={{
                  margin: "0.1rem 0 0",
                  fontSize: "0.82rem",
                  color: "#e5e7eb",
                }}
              >
                Équipe ({shortSeatLabel(1)} &amp; {shortSeatLabel(3)}) :{" "}
                <strong>{gameState.scores.team1}</strong> pts
              </p>
            </div>
          )}

          {wsError && (
            <div
              style={{
                marginTop: "0.3rem",
                padding: "0.45rem 0.5rem",
                borderRadius: "0.6rem",
                border: "1px solid rgba(248,113,113,0.7)",
                background: "rgba(127,29,29,0.5)",
                color: "#fee2e2",
                fontSize: "0.8rem",
              }}
            >
              {wsError}
            </div>
          )}
        </aside>

        {/* OVERLAY SCORE FINAL */}
        {showEndOverlay && gameState && (
          <div
            style={{
              position: "absolute",
              inset: 0,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 50,
            }}
            onClick={() => setShowEndOverlay(false)}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                background: "rgba(15,23,42,0.85)",
                animation: "backdrop-fade 0.25s ease-out",
              }}
            />
            <div
              style={{
                position: "relative",
                padding: "1.4rem 2rem",
                borderRadius: "1.2rem",
                background:
                  "radial-gradient(circle at top, #0f172a 0, #020617 60%)",
                border: "1px solid rgba(148,163,184,0.7)",
                boxShadow: "0 25px 60px -24px rgba(0,0,0,1)",
                maxWidth: "90%",
                textAlign: "center",
                animation: "final-score-pop 0.3s ease-out",
              }}
            >
              <h2
                style={{
                  margin: 0,
                  marginBottom: "0.4rem",
                  fontSize: "1.1rem",
                }}
              >
                🎉 Donne terminée
              </h2>
              <p
                style={{
                  margin: 0,
                  fontSize: "0.9rem",
                  color: "#e5e7eb",
                }}
              >
                Équipe ({shortSeatLabel(0)} &amp; {shortSeatLabel(2)}) :{" "}
                <strong>{gameState.scores.team0}</strong> pts
              </p>
              <p
                style={{
                  margin: "0.1rem 0 0.6rem",
                  fontSize: "0.9rem",
                  color: "#e5e7eb",
                }}
              >
                Équipe ({shortSeatLabel(1)} &amp; {shortSeatLabel(3)}) :{" "}
                <strong>{gameState.scores.team1}</strong> pts
              </p>
              <button
                type="button"
                onClick={() => setShowEndOverlay(false)}
                style={{
                  marginTop: "0.3rem",
                  padding: "0.35rem 0.9rem",
                  borderRadius: "9999px",
                  border: "1px solid rgba(148,163,184,0.7)",
                  background: "rgba(15,23,42,0.95)",
                  color: "#e5e7eb",
                  fontSize: "0.8rem",
                  cursor: "pointer",
                }}
              >
                OK
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// ---------- COMPOSANTS VISUELS ----------

function SeatBanner(props: {
  position: TablePosition;
  player?: RoomPlayer;
  isCurrent: boolean;
  isSelf?: boolean;
}) {
  const { position, player, isCurrent, isSelf } = props;
  const col = position === "left" ? 1 : position === "right" ? 3 : 2;
  const row = position === "top" ? 1 : position === "bottom" ? 3 : 2;

  if (!player) {
    return (
      <div
        style={{
          gridColumn: col,
          gridRow: row,
          padding: "0.1rem 0.5rem",
          opacity: 0.5,
          fontSize: "0.75rem",
          color: "#d1d5db",
        }}
      >
        {position === "bottom"
          ? "En attente de vous..."
          : "En attente d&apos;un joueur..."}
      </div>
    );
  }

  const seatLabel = `J${(player.seat ?? 0) + 1}`;
  const label = isSelf
    ? `${player.nickname} (${seatLabel}, vous)`
    : `${player.nickname} (${seatLabel})`;

  return (
    <div
      style={{
        gridColumn: col,
        gridRow: row,
        padding: "0.25rem 0.6rem",
        borderRadius: "9999px",
        border: isCurrent
          ? "1px solid rgba(74,222,128,0.9)"
          : "1px solid rgba(15,23,42,0.85)",
        background: isCurrent
          ? "linear-gradient(120deg, rgba(22,163,74,0.6), rgba(21,128,61,0.35))"
          : "rgba(15,23,42,0.9)",
        color: "#e5e7eb",
        fontSize: "0.8rem",
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        boxShadow: isCurrent
          ? "0 0 0 1px rgba(22,163,74,0.4)"
          : "0 0 0 0 rgba(0,0,0,0)",
      }}
    >
      <span
        style={{
          width: 6,
          height: 6,
          borderRadius: "9999px",
          background: isCurrent ? "#4ade80" : "#6b7280",
        }}
      />
      <span>{label}</span>
    </div>
  );
}

function TrickCardView(props: {
  position: TablePosition;
  card: Card;
  playerLabel: string;
}) {
  const { position, card, playerLabel } = props;

  let justifySelf: "start" | "center" | "end" = "center";
  let alignSelf: "start" | "center" | "end" = "center";

  if (position === "top") alignSelf = "start";
  else if (position === "bottom") alignSelf = "end";
  else if (position === "left") justifySelf = "start";
  else if (position === "right") justifySelf = "end";

  const animationName =
    position === "top"
      ? "trick-from-top"
      : position === "bottom"
      ? "trick-from-bottom"
      : position === "left"
      ? "trick-from-left"
      : "trick-from-right";

  return (
    <div
      style={{
        display: "flex",
        flexDirection: position === "top" ? "column" : "column-reverse",
        alignItems:
          position === "left"
            ? "flex-start"
            : position === "right"
            ? "flex-end"
            : "center",
        justifySelf,
        alignSelf,
        gap: "0.2rem",
        animation: `${animationName} 0.22s ease-out`,
      }}
    >
      <div
        style={{
          width: 40,
          height: 56,
        }}
      >
        <CardSvg card={card} small />
      </div>
      <span
        style={{
          fontSize: "0.7rem",
          color: "#e5e7eb",
          opacity: 0.9,
        }}
      >
        {playerLabel}
      </span>
    </div>
  );
}

function CardSvg(props: { card: Card; small?: boolean }) {
  const { card, small } = props;
  const isRed = card.suit === "♥" || card.suit === "♦";
  const width = small ? 40 : 52;
  const height = small ? 56 : 72;

  return (
    <svg
      viewBox="0 0 52 72"
      width={width}
      height={height}
      style={{ display: "block", filter: "drop-shadow(0 6px 10px rgba(0,0,0,0.75))" }}
    >
      <defs>
        <linearGradient id="card-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f9fafb" />
          <stop offset="100%" stopColor="#e5e7eb" />
        </linearGradient>
      </defs>

      <rect
        x={1}
        y={1}
        width={50}
        height={70}
        rx={6}
        ry={6}
        fill="url(#card-bg)"
        stroke="#d1d5db"
        strokeWidth={1}
      />
      <rect
        x={4}
        y={4}
        width={44}
        height={64}
        rx={4}
        ry={4}
        fill="#f9fafb"
        stroke="#e5e7eb"
        strokeWidth={0.5}
      />

      <text
        x={8}
        y={16}
        fontSize={10}
        fontWeight="bold"
        fill={isRed ? "#b91c1c" : "#0f172a"}
      >
        {card.rank}
      </text>
      <text
        x={8}
        y={28}
        fontSize={11}
        fill={isRed ? "#b91c1c" : "#0f172a"}
      >
        {card.suit}
      </text>

      <g transform="rotate(180 26 36)">
        <text
          x={8}
          y={16}
          fontSize={10}
          fontWeight="bold"
          fill={isRed ? "#b91c1c" : "#0f172a"}
        >
          {card.rank}
        </text>
        <text
          x={8}
          y={28}
          fontSize={11}
          fill={isRed ? "#b91c1c" : "#0f172a"}
        >
          {card.suit}
        </text>
      </g>

      <text
        x={26}
        y={39}
        textAnchor="middle"
        fontSize={20}
        fill={isRed ? "#b91c1c" : "#0f172a"}
      >
        {card.suit}
      </text>
    </svg>
  );
}

export default App;
