import { useEffect, useRef, useState } from "react";
import { config } from "./config";
import type { Card, DealResponse } from "./gameTypes";

type View = "lobby" | "game";

interface RoomPlayer {
  id: string;
  nickname: string;
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

  // Récupérer une donne au passage en vue "game"
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

  // Gestion WebSocket : connexion / join_room / updates
  useEffect(() => {
    if (view !== "game") {
      // On ferme la connexion si on quitte la table
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.close();
      }
      wsRef.current = null;
      setWsStatus("disconnected");
      setRoomPlayers([]);
      setWsError(null);
      return;
    }

    setWsStatus("connecting");
    setWsError(null);

    const ws = new WebSocket(config.wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");

      // On envoie join_room dès l'ouverture
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
        const data = JSON.parse(event.data) as RoomUpdateMessage | ErrorMessage;

        if (data.type === "room_update") {
          if (data.payload.roomCode === roomCode) {
            setRoomPlayers(data.payload.players);
          }
        } else if (data.type === "error") {
          setWsError(data.payload.message);
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
            Prochaines étapes : connexion en temps réel, affichage des cartes, scores,
            puis mode contrée 🔜
          </p>
        </div>
      </div>
    );
  }

  // ---------- VUE JEU ----------

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
          </p>
          <p style={{ margin: 0, fontSize: "0.8rem", color: "#6b7280" }}>
            WebSocket :{" "}
            {wsStatus === "connected"
              ? "connecté ✅"
              : wsStatus === "connecting"
              ? "connexion en cours..."
              : "déconnecté ❌"}
          </p>
        </div>
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
          }}
        >
          Quitter la table
        </button>
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
            <div
              style={{
                display: "flex",
                flexWrap: "wrap",
                gap: "0.5rem",
                marginTop: "0.5rem",
              }}
            >
              {hand.map((card, index) => (
                <div
                  key={`${card.rank}-${card.suit}-${index}`}
                  style={{
                    width: "3rem",
                    height: "4.2rem",
                    borderRadius: "0.5rem",
                    border: "1px solid rgba(148,163,184,0.6)",
                    background: "#0b1120",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "1rem",
                    boxShadow: "0 10px 15px -3px rgba(0,0,0,0.6)",
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
                </div>
              ))}
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
                <span>{player.nickname}</span>
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
            Ouvre la même URL dans un autre onglet / navigateur, entre le même
            code de table et un autre pseudo : tu verras la liste des joueurs
            se synchroniser en direct.
          </p>
        </section>
      </main>
    </div>
  );
}

export default App;
