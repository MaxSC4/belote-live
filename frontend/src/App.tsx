import { useState } from "react";

type View = "lobby" | "game";

function App() {
  const [view, setView] = useState<View>("lobby");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");

  // Pour l’instant, on ne fait qu'une navigation locale
  const handleJoin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!nickname || !roomCode) return;
    // Plus tard : on se connectera au backend ici
    setView("game");
  };

  const handleCreateRoom = () => {
    // Plus tard : on demandera un code de room au backend
    const generatedCode = "TABLE42";
    setRoomCode(generatedCode);
  };

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

          <form onSubmit={handleJoin} style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div>
              <label
                htmlFor="nickname"
                style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9rem" }}
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
                style={{ display: "block", marginBottom: "0.25rem", fontSize: "0.9rem" }}
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

          <p style={{ marginTop: "1.25rem", fontSize: "0.8rem", color: "#6b7280" }}>
            Prochaines étapes : connexion en temps réel, affichage des cartes, scores,
            puis mode contrée 🔜
          </p>
        </div>
      </div>
    );
  }

  // Vue "jeu" très basique pour l'instant
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#0b1120",
        color: "#e5e7eb",
        padding: "1rem",
      }}
    >
      <h1>Table {roomCode}</h1>
      <p>Connecté en tant que <strong>{nickname}</strong></p>
      <p>Zone de jeu à venir (main, plis, annonces...)</p>
      <button
        type="button"
        onClick={() => setView("lobby")}
        style={{
          marginTop: "1rem",
          padding: "0.4rem 0.75rem",
          borderRadius: "0.5rem",
          border: "1px solid rgba(148,163,184,0.6)",
          background: "transparent",
          color: "#e5e7eb",
          cursor: "pointer",
        }}
      >
        Retour au lobby
      </button>
    </div>
  );
}

export default App;
