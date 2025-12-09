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

function App() {
  const [view, setView] = useState<View>("lobby");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");

  const [hand, setHand] = useState<Card[]>([]);
  const [isLoadingHand, setIsLoadingHand] = useState(false);
  const [handError, setHandError] = useState<string | null>(null);

  const [wsStatus, setWsStatus] = useState<"disconnected" | "connecting" | "connected">("disconnected");
  const [roomPlayers, setRoomPlayers] = useState<RoomPlayer[]>([]);
  const [wsError, setWsError] = useState<string | null>(null);

  const [gameState, setGameState] = useState<GameStateWS | null>(null);

  const wsRef = useRef<WebSocket | null>(null);

  const handleJoin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!nickname || !roomCode) return;
    setView("game");
  };

  const handleCreateRoom = () => {
    const generatedCode = "TABLE42"; // plus tard : backend
    setRoomCode(generatedCode);
  };

  // Fetch HTTP debug pour une donne (fallback)
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

  // WebSocket : connexion + join_room + réception des updates
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

      const message = {
        type: "join_room",
        payload: {
          roomCode,
          nickname,
        },
      };
      ws.send(JSON.stringify(message));
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
    const message = {
      type: "start_game",
    };
    wsRef.current.send(JSON.stringify(message));
  };

  // Déterminer mon siège (approximation : via nickname)
  const mySeat =
    roomPlayers.find((p) => p.nickname === nickname)?.seat ?? null;

  // Main affichée :
  const effectiveHand: Card[] =
    gameState && mySeat !== null
      ? gameState.hands[String(mySeat)] || []
      : hand;

  const isMyTurn =
    gameState && mySeat !== null && gameState.currentPlayer === mySeat;

  const handlePlayCard = (card: Card) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!gameState || mySeat === null) return;
    if (!isMyTurn) return;

    const message = {
      type: "play_card",
      payload: {
        card,
      },
    };
    wsRef.current.send(JSON.stringify(message));
  };

  const currentPhase = gameState?.phase ?? "—";

  // ---------- VUE LOBBY ----------

  if (view === "lobby") {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#0f172a",
          color: "#e5e7eb",
          fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: 480,
            padding: "2rem",
            borderRadius: "1.5rem",
            background: "rgba(15,23,42,0.9)",
            boxShadow: "0 25px 50px -12px rgba(0,0,0,0.75)",
            border: "1px solid rgba(148,163,184,0.3)",
          }}
        >
          <h1 style={{ fontSize: "1.8rem", marginBottom: "0.5rem" }}>
            belote-live
          </h1>
          <p style={{ marginBottom: "1.5rem", color: "#9ca3af" }}>
            Jouez à la belote en ligne entre collègues. 4 joueurs, une table,
            des atouts 🎴
          </p>

          <button
            type="button"
            onClick={handleCreateRoom}
            style={{
              marginBottom: "1rem",
              padding: "0.5rem 0.75rem",
              borderRadius: "9999px",
              border: "1px solid rgba(94,234,212,0.3)",
              background: "rgba(15,23,42,0.5)",
              color: "#5eead4",
              fontSize: "0.85rem",
              cursor: "pointer",
            }}
          >
            Générer un code de table
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
                placeholder="Ex : Claire, Toto, JJ..."
                style={{
                  width: "100%",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "0.75rem",
                  border: "1px solid rgba(148,163,184,0.6)",
                  background: "rgba(15,23,42,0.6)",
                  color: "#e5e7eb",
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
                  background: "rgba(15,23,42,0.6)",
                  color: "#e5e7eb",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
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
                background: "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "#f9fafb",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Rejoindre la table
            </button>
          </form>

          <p
            style={{
              marginTop: "1.25rem",
              fontSize: "0.8rem",
              color: "#6b7280",
            }}
          >
            Prochaines étapes : atout, plis, scores… puis belote contrée 🔜
          </p>
        </div>
      </div>
    );
  }

  // ---------- VUE JEU ----------

  const trumpSymbol = gameState?.trumpSuit ?? "—";

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b1120",
        color: "#e5e7eb",
        padding: "1rem",
        fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "1rem",
        }}
      >
        <div>
          <h1 style={{ margin: 0 }}>Table {roomCode}</h1>
          <p style={{ margin: 0, fontSize: "0.9rem", color: "#9ca3af" }}>
            Connecté en tant que <strong>{nickname}</strong>
            {mySeat !== null && ` (siège ${mySeat})`}
          </p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6b7280" }}>
            WebSocket :{" "}
            {wsStatus === "connected"
              ? "connecté ✅"
              : wsStatus === "connecting"
              ? "connexion en cours..."
              : "déconnecté ❌"}
          </p>
          {gameState && (
            <p style={{ margin: 0, fontSize: "0.8rem", color: "#9ca3af" }}>
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
              </strong>
            </p>
          )}
        </div>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button
            type="button"
            onClick={handleStartGame}
            disabled={wsStatus !== "connected"}
            style={{
              padding: "0.4rem 0.75rem",
              borderRadius: "0.5rem",
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
              padding: "0.4rem 0.75rem",
              borderRadius: "0.5rem",
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

      <main
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 2fr) minmax(0, 1fr)",
          gap: "1rem",
        }}
      >
        <section
          style={{
            padding: "1rem",
            borderRadius: "0.75rem",
            border: "1px solid rgba(148,163,184,0.3)",
            background: "rgba(15,23,42,0.9)",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "1rem", marginBottom: "0.5rem" }}>
            Votre main
          </h2>

          {isLoadingHand && <p>Distribution des cartes en cours...</p>}
          {handError && (
            <p style={{ color: "#f97373", fontSize: "0.9rem" }}>{handError}</p>
          )}

          {!isLoadingHand && !handError && (
            <>
              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                  marginTop: "0.5rem",
                }}
              >
                {effectiveHand.map((card, index) => {
                  const clickable = Boolean(isMyTurn);
                  return (
                    <button
                      key={`${card.rank}-${card.suit}-${index}`}
                      type="button"
                      onClick={() => clickable && handlePlayCard(card)}
                      disabled={!clickable}
                      style={{
                        width: "3rem",
                        height: "4.2rem",
                        borderRadius: "0.5rem",
                        border: "1px solid rgba(148,163,184,0.6)",
                        background: clickable ? "#0b1120" : "#111827",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "1rem",
                        boxShadow: "0 10px 15px -3px rgba(0,0,0,0.6)",
                        cursor: clickable ? "pointer" : "default",
                      }}
                    >
                      <span>{card.rank}</span>
                      <span
                        style={{
                          fontSize: "1.2rem",
                          color:
                            card.suit === "♥" || card.suit === "♦"
                              ? "#f97373"
                              : "#e5e7eb",
                        }}
                      >
                        {card.suit}
                      </span>
                    </button>
                  );
                })}
              </div>

              <p
                style={{
                  marginTop: "0.75rem",
                  fontSize: "0.8rem",
                  color: "#9ca3af",
                }}
              >
                Phase : <strong>{currentPhase}</strong>{" "}
                {gameState &&
                  mySeat !== null &&
                  gameState.currentPlayer === mySeat &&
                  gameState.phase === "PlayingTricks" && (
                    <span style={{ color: "#4ade80" }}>
                      — c&apos;est à vous de jouer
                    </span>
                  )}
                {gameState && gameState.phase === "Finished" && (
                  <span style={{ color: "#facc15", marginLeft: "0.5rem" }}>
                    — partie terminée
                  </span>
                )}
              </p>

              {gameState && (
                <p
                  style={{
                    marginTop: "0.25rem",
                    fontSize: "0.8rem",
                    color: "#9ca3af",
                  }}
                >
                  Scores : équipe (0 & 2){" "}
                  <strong>{gameState.scores.team0}</strong> pts — équipe (1 & 3){" "}
                  <strong>{gameState.scores.team1}</strong> pts
                </p>
              )}
            </>
          )}

          {gameState && gameState.trick && (
            <div
              style={{
                marginTop: "1rem",
                paddingTop: "0.75rem",
                borderTop: "1px solid rgba(55,65,81,0.8)",
                fontSize: "0.85rem",
                color: "#9ca3af",
              }}
            >
              <h3
                style={{
                  marginTop: 0,
                  marginBottom: "0.5rem",
                  fontSize: "0.9rem",
                }}
              >
                Pli en cours
              </h3>
              <div
                style={{
                  display: "flex",
                  gap: "0.75rem",
                  flexWrap: "wrap",
                }}
              >
                {gameState.trick.cards.map((tc, idx) => (
                  <div
                    key={`${tc.player}-${idx}`}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "0.5rem",
                      border: "1px solid rgba(148,163,184,0.3)",
                      background: "#020617",
                    }}
                  >
                    <div
                      style={{
                        fontSize: "0.75rem",
                        marginBottom: "0.25rem",
                        color: "#9ca3af",
                      }}
                    >
                      J{tc.player}
                    </div>
                    <div
                      style={{
                        width: "2.5rem",
                        height: "3.6rem",
                        borderRadius: "0.5rem",
                        border: "1px solid rgba(148,163,184,0.6)",
                        background: "#0b1120",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "0.9rem",
                      }}
                    >
                      <span>{tc.card.rank}</span>
                      <span
                        style={{
                          fontSize: "1.1rem",
                          color:
                            tc.card.suit === "♥" || tc.card.suit === "♦"
                              ? "#f97373"
                              : "#e5e7eb",
                        }}
                      >
                        {tc.card.suit}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {gameState.trick.winner !== undefined && (
                <p style={{ marginTop: "0.5rem" }}>
                  Pli remporté par le joueur{" "}
                  <strong>J{gameState.trick.winner}</strong>.
                </p>
              )}
            </div>
          )}
        </section>

        <section
          style={{
            padding: "1rem",
            borderRadius: "0.75rem",
            border: "1px solid rgba(148,163,184,0.3)",
            background: "rgba(15,23,42,0.9)",
            fontSize: "0.9rem",
          }}
        >
          <h2 style={{ marginTop: 0, fontSize: "1rem", marginBottom: "0.5rem" }}>
            Joueurs à la table
          </h2>

          {wsError && (
            <p style={{ color: "#f97373", fontSize: "0.9rem" }}>{wsError}</p>
          )}

          {roomPlayers.length === 0 && !wsError && (
            <p style={{ color: "#9ca3af" }}>
              En attente d&apos;autres joueurs...
            </p>
          )}

          <ul style={{ listStyle: "none", paddingLeft: 0, margin: 0 }}>
            {roomPlayers.map((player) => (
              <li
                key={player.id}
                style={{
                  padding: "0.4rem 0.5rem",
                  borderRadius: "0.5rem",
                  border: "1px solid rgba(148,163,184,0.3)",
                  marginBottom: "0.4rem",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <span>
                  {player.nickname}
                  {player.seat !== null && ` (Siège ${player.seat})`}
                </span>
                <span
                  style={{
                    fontSize: "0.75rem",
                    color: "#6b7280",
                  }}
                >
                  {player.id.slice(-4)}
                </span>
              </li>
            ))}
          </ul>

          <p
            style={{
              marginTop: "0.75rem",
              fontSize: "0.8rem",
              color: "#6b7280",
            }}
          >
            Ouvre la même table dans plusieurs onglets/navigateurs, lance la
            partie et joue tous les plis : à la fin, la partie passe en
            “terminée” et les scores des deux équipes s&apos;affichent.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
