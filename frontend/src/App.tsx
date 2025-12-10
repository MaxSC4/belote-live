import { useEffect, useRef, useState } from "react";
import { config } from "./config";
import type { Card, GameStateWS, Suit } from "./gameTypes";

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

type SuitSymbol = Suit;
const SUIT_SYMBOLS: SuitSymbol[] = ["♠", "♥", "♦", "♣"];
const PHASE_LABELS: Record<string, string> = {
  ChoosingTrumpFirstRound: "Prise · 1ᵉʳ tour",
  ChoosingTrumpSecondRound: "Prise · 2ᵉ tour",
  PlayingTricks: "Pli en cours",
  Finished: "Donne terminée",
};

// message pour choose_trump
type ChooseTrumpPayloadWS =
  | { action: "take"; suit?: SuitSymbol }
  | { action: "pass" };

type ChooseTrumpMessageWS = {
  type: "choose_trump";
  payload: ChooseTrumpPayloadWS;
};

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function sortHandBySuitColor(hand: Card[], trumpSuit: Suit | null): Card[] {
  // Noir: ♣, ♠ / Rouge: ♦, ♥
  const isBlack = (s: Suit) => s === "♣" || s === "♠";
  const allSuits: Suit[] = ["♣", "♦", "♠", "♥"];

  const nonTrumpSuits = trumpSuit
    ? allSuits.filter((s) => s !== trumpSuit)
    : allSuits;

  const blackNonTrumps = nonTrumpSuits.filter(isBlack);
  const redNonTrumps = nonTrumpSuits.filter((s) => !isBlack(s));

  // Alterner noir / rouge / noir / rouge
  const suitOrder: Suit[] = [];
  let bi = 0;
  let ri = 0;
  while (bi < blackNonTrumps.length || ri < redNonTrumps.length) {
    if (bi < blackNonTrumps.length) {
      suitOrder.push(blackNonTrumps[bi++]);
    }
    if (ri < redNonTrumps.length) {
      suitOrder.push(redNonTrumps[ri++]);
    }
  }

  // Atout à la fin (à droite)
  if (trumpSuit) {
    suitOrder.push(trumpSuit);
  }

  const rankOrder: Card["rank"][] = ["7", "8", "9", "J", "Q", "K", "10", "A"];
  const rankValue = (rank: Card["rank"]) => rankOrder.indexOf(rank);

  return [...hand].sort((a, b) => {
    const sa = suitOrder.indexOf(a.suit);
    const sb = suitOrder.indexOf(b.suit);
    if (sa !== sb) return sa - sb;
    return rankValue(a.rank) - rankValue(b.rank);
  });
}

function App() {
  const [view, setView] = useState<View>("lobby");
  const [nickname, setNickname] = useState("");
  const [roomCode, setRoomCode] = useState("");

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

  // Hover + distribution main
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [displayHand, setDisplayHand] = useState<Card[]>([]);
  const prevHandRef = useRef<Card[]>([]);

  // Tri
  const [isSorting, setIsSorting] = useState(false);

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
      setHoveredIndex(null);
      setDisplayHand([]);
      prevHandRef.current = [];
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

  const fullHand: Card[] =
    gameState && mySeat !== null ? gameState.hands[String(mySeat)] || [] : [];

  const showSortButton =
    !!gameState &&
    gameState.phase === "PlayingTricks" &&
    fullHand.length > 0;
  const isMyTurn =
    gameState &&
    mySeat !== null &&
    gameState.currentPlayer === mySeat &&
    gameState.phase === "PlayingTricks";

  const beloteStage = gameState?.belote.stage ?? 0;

  const canAnnounceBelote =
    !!gameState &&
    mySeat !== null &&
    gameState.phase === "PlayingTricks" &&
    !!gameState.trumpSuit &&
    beloteStage < 2 &&
    (beloteStage === 0 || gameState.belote.holder === mySeat);

  const beloteButtonLabel =
    beloteStage === 0 ? "Belote !" : "Rebelote !";

  const handleAnnounceBelote = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!canAnnounceBelote) return;

    wsRef.current.send(
      JSON.stringify({
        type: "announce_belote",
      })
    );
  };

  const handleSortHand = () => {
    if (!gameState || mySeat === null) return;

    setIsSorting(true);
    setDisplayHand((current) =>
      sortHandBySuitColor(current, gameState.trumpSuit ?? null)
    );
    setTimeout(() => setIsSorting(false), 350);
  };

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

  const friendlyPhase =
    gameState && gameState.phase
      ? PHASE_LABELS[gameState.phase] ?? gameState.phase
      : null;
  const trumpSymbol = gameState?.trumpSuit ?? null;

  const currentDealNumber = gameState?.dealNumber ?? 1;

  const matchTeam0 = gameState?.matchScores?.team0 ?? 0;
  const matchTeam1 = gameState?.matchScores?.team1 ?? 0;
  const MAX_MATCH_POINTS = 1001;
  const MIN_BAR_PERCENT = 3;
  const getProgress = (score: number) => {
    if (score <= 0) return MIN_BAR_PERCENT;
    const ratio = (score / MAX_MATCH_POINTS) * 100;
    return Math.min(100, Math.max(MIN_BAR_PERCENT, ratio));
  };
  const team0Progress = getProgress(matchTeam0);
  const team1Progress = getProgress(matchTeam1);
  const trickWinner = gameState?.trick?.winner;

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

  function playerNameForSeat(seat: number): string {
    const player = roomPlayers.find((p) => p.seat === seat);
    const label = `J${seat + 1}`;
    return player?.nickname ? `${player.nickname} (${label})` : label;
  }

  function shortSeatLabel(seat: number): string {
    return `J${seat + 1}`;
  }

  const trumpChooserSeat = gameState?.trumpChooser ?? null;

  function cardPositionForPlayerSeat(seat: number): TablePosition {
    return seatToTablePosition(seat) ?? "top";
  }

  const remainingCardsForSeat = (seat: number | null): number => {
    if (seat === null || !gameState) return 0;
    if (seat === mySeat) return displayHand.length;
    return gameState.hands[String(seat)]?.length ?? 0;
  };

  // ---- Animations : gagnant de pli & fin de donne ----

  useEffect(() => {
    if (trickWinner === undefined) return;

    setShowTrickWinnerBanner(true);
    const timer = setTimeout(() => setShowTrickWinnerBanner(false), 1800);
    return () => clearTimeout(timer);
  }, [trickWinner]);

  useEffect(() => {
    const phase = gameState?.phase;
    const prev = prevPhaseRef.current;

    if (phase === "Finished" && prev && prev !== "Finished") {
      setShowEndOverlay(true);
    }
    prevPhaseRef.current = phase ?? null;
  }, [gameState?.phase]);

  // ---- Animation de distribution de la main ----

  useEffect(() => {
    if (!gameState || mySeat === null) {
      setDisplayHand([]);
      prevHandRef.current = [];
      return;
    }

    const full = gameState.hands[String(mySeat)] || [];
    const prev = prevHandRef.current;

    // Nouvelle donne : on reçoit 5 cartes en phase ChoosingTrumpFirstRound
    const isNewDeal =
      prev.length === 0 &&
      full.length === 5 &&
      gameState.phase === "ChoosingTrumpFirstRound";

    if (isNewDeal) {
      setDisplayHand([]);
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setDisplayHand(full.slice(0, i));
        if (i >= full.length) {
          clearInterval(interval);
        }
      }, 120);
      prevHandRef.current = full;
      return () => clearInterval(interval);
    }

    // Complément à 8 cartes une fois l'atout choisi
    const isCompletingHand =
      prev.length === 5 &&
      full.length === 8 &&
      gameState.phase === "PlayingTricks";

    if (isCompletingHand) {
      setDisplayHand(prev);
      const newCards = full.slice(5);
      let i = 0;
      const interval = setInterval(() => {
        i++;
        setDisplayHand((current) => [...current, newCards[i - 1]]);
        if (i >= newCards.length) {
          clearInterval(interval);
        }
      }, 140);
      prevHandRef.current = full;
      return () => clearInterval(interval);
    }

    // Fallback (connexion en cours de donne, reconnection, etc.)
    if (full.length !== prev.length) {
      setDisplayHand(full);
    }
    prevHandRef.current = full;
  }, [gameState, mySeat]);

  // ---- Choix d'atout (prise / passe) ----

  const isFirstRound = gameState?.phase === "ChoosingTrumpFirstRound";
  const isSecondRound = gameState?.phase === "ChoosingTrumpSecondRound";
  const isBiddingPlayer =
    !!gameState &&
    mySeat !== null &&
    gameState.biddingPlayer === mySeat;

  const sendChooseTrump = (payload: ChooseTrumpPayloadWS) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    const message: ChooseTrumpMessageWS = {
      type: "choose_trump",
      payload,
    };
    wsRef.current.send(JSON.stringify(message));
  };

  const handleTakeFirstRound = () => {
    sendChooseTrump({ action: "take" });
  };

  const handlePass = () => {
    sendChooseTrump({ action: "pass" });
  };

  const handleTakeSecondRound = (suit: SuitSymbol) => {
    sendChooseTrump({ action: "take", suit });
  };

  // ---------- LOBBY ----------

  if (view === "lobby") {
    return (
      <div className="min-h-screen bg-lobby px-6 py-10 font-sans text-slate-100">
        <div className="mx-auto flex min-h-[calc(100vh-5rem)] w-full max-w-4xl flex-col justify-center">
          <div className="rounded-[2.5rem] border border-slate-400/30 bg-slate-950/95 p-12 shadow-[0_35px_70px_-30px_rgba(0,0,0,0.85)]">
            <div className="flex items-center justify-between gap-6">
              <div>
                <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
                  Lobby
                </p>
                <h2 className="mt-2 text-3xl font-semibold text-white">
                  Créez ou rejoignez une table
                </h2>
                <p className="text-sm text-slate-400">
                  Code personnalisé ? Partagez-le aux collègues et lancez la donne.
                </p>
              </div>
              <span className="hidden rounded-3xl border border-emerald-400/20 bg-emerald-500/10 px-4 py-2 text-xs font-medium text-emerald-200 lg:block">
                4 joueurs
              </span>
            </div>

            <button
              type="button"
              onClick={handleCreateRoom}
              className="mt-6 w-full rounded-2xl border border-cyan-300/40 bg-gradient-to-r from-cyan-400/20 via-emerald-300/10 to-sky-400/30 px-5 py-3 text-base font-semibold text-cyan-100 transition hover:border-cyan-200/70 hover:text-cyan-50"
            >
              Générer un code de table aléatoire
            </button>

            <form onSubmit={handleJoin} className="mt-8 flex flex-col gap-6">
              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-300">Pseudo</span>
                <input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="Ex : Nono, Cheblan, Elo, Spider-Man..."
                  className="w-full rounded-2xl border border-slate-500/60 bg-slate-950/75 px-5 py-4 text-base text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-emerald-400"
                />
              </label>

              <label className="flex flex-col gap-2 text-sm">
                <span className="text-slate-300">Code de table</span>
                <input
                  id="roomCode"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  placeholder="Ex : TABLE42"
                  className="w-full rounded-2xl border border-slate-500/60 bg-slate-950/75 px-5 py-4 text-base tracking-[0.25em] text-slate-100 outline-none transition placeholder:text-slate-600 focus:border-cyan-300"
                />
              </label>

              <button
                type="submit"
                className="mt-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-400 px-5 py-4 text-base font-semibold text-white transition hover:from-emerald-400 hover:via-green-500 hover:to-emerald-300"
              >
                Rejoindre la table
              </button>
            </form>
          </div>
        </div>
      </div>
    );
  }

  // ---------- JEU ----------

  const trumpColorClass =
    trumpSymbol === "♥" || trumpSymbol === "♦"
      ? "text-rose-300"
      : "text-slate-100";

  return (
    <div className="flex min-h-screen flex-col overflow-hidden bg-game px-3 pb-3 pt-4 font-sans text-slate-100 lg:h-screen">
      {/* HEADER */}
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-900 pb-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl font-semibold text-white">
              Table {roomCode || "—"}
            </h1>
            <span className="rounded-full border border-slate-600/60 px-3 py-1 text-xs uppercase tracking-wide text-slate-400">
              4 joueurs · belote classique
            </span>
          </div>
          <p className="text-sm text-slate-300">
            Connecté en tant que <strong>{nickname}</strong>
            {mySeat !== null && ` (${shortSeatLabel(mySeat)})`}
          </p>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span
              className={cx(
                "flex items-center gap-1 rounded-full border px-2 py-0.5",
                wsStatus === "connected"
                  ? "border-emerald-400/80 text-emerald-200"
                  : wsStatus === "connecting"
                  ? "border-amber-400/80 text-amber-200"
                  : "border-rose-400/80 text-rose-200"
              )}
            >
              <span className="text-lg">•</span>
              {wsStatus === "connected"
                ? "Connecté"
                : wsStatus === "connecting"
                ? "Connexion en cours"
                : "Déconnecté"}
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleStartGame}
            disabled={wsStatus !== "connected"}
            className={cx(
              "rounded-full px-4 py-2 text-sm font-medium text-white transition",
              wsStatus === "connected"
                ? "bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-500 hover:from-emerald-400 hover:to-emerald-400"
                : "cursor-not-allowed bg-slate-600/70"
            )}
          >
            Lancer la partie
          </button>

          <button
            type="button"
            onClick={() => setView("lobby")}
            className="rounded-full border border-slate-600 bg-transparent px-4 py-2 text-sm text-slate-100 transition hover:border-slate-400"
          >
            Quitter la table
          </button>
        </div>
      </header>

      {/* ZONE PRINCIPALE */}
      <main className="relative mt-2 flex min-h-0 flex-1 gap-4">
        {/* TAPIS */}
        <section className="relative flex h-full w-full flex-1 flex-col rounded-[1.25rem] border border-slate-500/40 bg-felt px-3 pb-3 pt-2 shadow-table">
          {gameState && (
            <div className="absolute left-4 top-4 z-10 flex flex-wrap items-center gap-4 rounded-2xl border border-emerald-300/40 bg-slate-950/85 px-4 py-2 text-xs uppercase tracking-[0.35em] text-slate-200 shadow-[0_18px_35px_-20px_rgba(0,0,0,0.8)]">
              <div className="flex flex-col">
                <span className="text-[0.55rem] text-slate-400">Manche</span>
                <span className="text-lg font-semibold text-white">
                  #{currentDealNumber}
                </span>
              </div>
              <span className="hidden h-10 w-px bg-emerald-200/30 sm:block" />
              <div className="flex items-center gap-3">
                <div className="flex flex-col items-center text-center">
                  <span className="text-[0.55rem] text-slate-400">Atout</span>
                  <span
                    className={cx(
                      "text-2xl font-bold tracking-[0.1em]",
                      trumpColorClass
                    )}
                  >
                    {trumpSymbol ?? "—"}
                  </span>
                </div>
              </div>
              {friendlyPhase && (
                <>
                  <span className="hidden h-10 w-px bg-emerald-200/30 sm:block" />
                  <div className="flex flex-col text-left">
                    <span className="text-[0.55rem] text-slate-400">Statut</span>
                    <span className="text-sm font-semibold text-emerald-200 tracking-normal">
                      {friendlyPhase}
                    </span>
                  </div>
                </>
              )}
            </div>
          )}
          {/* Bannière gagnant du pli */}
          {showTrickWinnerBanner &&
            gameState &&
            gameState.trick &&
            gameState.trick.winner !== undefined && (
              <div className="absolute left-1/2 top-3 flex -translate-x-1/2 items-center gap-2 rounded-full border border-emerald-400/80 bg-gradient-to-r from-emerald-600/90 to-emerald-500/80 px-4 py-1 text-xs font-medium text-emerald-50 shadow-[0_18px_35px_-24px_rgba(0,0,0,1)] animate-trick-winner-banner">
                💥 Pli pour
                <strong className="text-white">
                  {playerNameForSeat(gameState.trick.winner)}
                </strong>
              </div>
            )}

          {/* JOUEURS + PLI AU CENTRE */}
          <div className="grid flex-1 grid-cols-[1fr_auto_1fr] grid-rows-[auto_1fr_auto] items-center justify-items-center gap-1">
            <SeatBanner
              position="top"
              player={playersByPosition.top}
              isCurrent={
                !!(
                  gameState &&
                  playersByPosition.top?.seat === gameState.currentPlayer
                )
              }
              isTrumpChooser={
                playersByPosition.top?.seat !== null &&
                playersByPosition.top?.seat === trumpChooserSeat
              }
              cardsCount={remainingCardsForSeat(
                playersByPosition.top?.seat ?? null
              )}
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
              isTrumpChooser={
                playersByPosition.left?.seat !== null &&
                playersByPosition.left?.seat === trumpChooserSeat
              }
              cardsCount={remainingCardsForSeat(
                playersByPosition.left?.seat ?? null
              )}
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
              isTrumpChooser={
                playersByPosition.right?.seat !== null &&
                playersByPosition.right?.seat === trumpChooserSeat
              }
              cardsCount={remainingCardsForSeat(
                playersByPosition.right?.seat ?? null
              )}
            />

            {/* PLI */}
            <div className="relative col-start-2 row-start-2 aspect-square w-full max-w-[520px] place-self-center">
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
              isTrumpChooser={
                playersByPosition.bottom?.seat !== null &&
                playersByPosition.bottom?.seat === trumpChooserSeat
              }
              cardsCount={remainingCardsForSeat(
                playersByPosition.bottom?.seat ?? null
              )}
            />
          </div>

          {/* OVERLAY DE PRISE / ENCHÈRES */}
          {gameState && (isFirstRound || isSecondRound) && (
            <div className="pointer-events-auto absolute left-1/2 top-1/2 z-10 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-slate-400/70 bg-slate-950/95 px-6 py-6 text-center text-sm shadow-[0_18px_35px_-24px_rgba(0,0,0,1)]">
              <DeckChoiceVisual turnedCard={gameState.turnedCard} />

              {isFirstRound && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-200">
                    {isBiddingPlayer ? (
                      <>
                        Voulez-vous prendre à{" "}
                        <strong>{gameState.proposedTrump}</strong> ?
                      </>
                    ) : (
                      <>
                        En attente de{" "}
                        {shortSeatLabel(gameState.biddingPlayer!)} (1er tour)…
                      </>
                    )}
                  </p>
                  {isBiddingPlayer && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <button
                        type="button"
                        onClick={handleTakeFirstRound}
                        className="rounded-2xl bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-400 px-4 py-3 text-base font-semibold text-white shadow-[0_20px_40px_-18px_rgba(16,185,129,0.8)] transition hover:brightness-110"
                      >
                        PRENDRE
                      </button>
                      <button
                        type="button"
                        onClick={handlePass}
                        className="rounded-2xl border border-slate-500/70 px-4 py-3 text-base font-semibold text-slate-200 transition hover:border-slate-300"
                      >
                        PASSER
                      </button>
                    </div>
                  )}
                </div>
              )}

              {isSecondRound && (
                <div className="space-y-4">
                  <p className="text-sm text-slate-200">
                    {isBiddingPlayer ? (
                      <>Choisissez une couleur d&apos;atout ou passez :</>
                    ) : (
                      <>
                        En attente de{" "}
                        {shortSeatLabel(gameState.biddingPlayer!)} (2ᵉ tour)…
                      </>
                    )}
                  </p>

                  {isBiddingPlayer && (
                    <div className="grid gap-3 sm:grid-cols-2">
                      {SUIT_SYMBOLS.filter(
                        (s) => s !== gameState.proposedTrump
                      ).map((suit) => (
                        <button
                          key={suit}
                          type="button"
                          onClick={() => handleTakeSecondRound(suit)}
                          className={cx(
                            "rounded-2xl border px-4 py-3 text-base font-semibold transition",
                            suit === "♥" || suit === "♦"
                              ? "border-rose-300/60 text-rose-200 hover:border-rose-300"
                              : "border-cyan-300/60 text-cyan-100 hover:border-cyan-200"
                          )}
                        >
                          Atout {suit}
                        </button>
                      ))}
                      <button
                        type="button"
                        onClick={handlePass}
                        className="rounded-2xl border border-slate-500/70 px-4 py-3 text-base font-semibold text-slate-200 transition hover:border-slate-300"
                      >
                        PASSER
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* MAIN EN ÉVENTAIL */}
          <div className="mt-6 flex flex-col px-2 text-slate-100">
            <div className="mx-auto mb-3 flex w-full max-w-lg flex-wrap items-center justify-center gap-2 text-sm">
              {gameState && canAnnounceBelote && (
                <button
                  type="button"
                  onClick={handleAnnounceBelote}
                  className="group flex items-center gap-2 rounded-full border border-amber-300/70 bg-gradient-to-r from-amber-300 via-amber-400 to-orange-300 px-4 py-1.5 font-semibold text-slate-900 shadow-[0_14px_30px_-18px_rgba(251,191,36,0.9)] transition hover:scale-105"
                >
                  <span className="text-base">🎺</span>
                  <span className="text-xs font-bold uppercase tracking-[0.25em]">
                    {beloteButtonLabel}
                  </span>
                </button>
              )}

              {gameState && showSortButton && (
                <button
                  type="button"
                  onClick={handleSortHand}
                  className="group flex items-center gap-2 rounded-full border border-cyan-300/60 bg-slate-950/80 px-4 py-1.5 font-semibold text-cyan-100 shadow-[0_12px_25px_-16px_rgba(16,185,129,0.9)] transition hover:border-cyan-200"
                >
                  <span className="text-base">🪄</span>
                  <span className="text-xs font-bold uppercase tracking-[0.25em]">
                    Trier la main
                  </span>
                </button>
              )}
            </div>

            <div className="mb-2 flex flex-wrap items-center justify-center gap-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-200">
              <span className="text-base tracking-[0.35em]">Votre main</span>
              {isMyTurn && (
                <span className="inline-flex items-center gap-1 rounded-full border border-emerald-300/60 bg-emerald-500/20 px-3 py-1 text-xs font-bold tracking-[0.25em] text-emerald-100 shadow-[0_10px_25px_-15px_rgba(16,185,129,1)] animate-pulse">
                  ▶ A VOUS DE JOUER
                </span>
              )}
              {gameState && gameState.phase === "Finished" && (
                <span className="text-amber-300 normal-case">— donne terminée</span>
              )}
            </div>

            <div className="relative mx-auto h-[9.5rem] w-full max-w-4xl">
              {isSorting && (
                <div className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-emerald-200">
                    <span className="h-px w-8 bg-emerald-200/50" />
                    <span className="animate-pulse">Tri en cours</span>
                    <span className="h-px w-8 bg-emerald-200/50" />
                  </div>
                </div>
              )}
              {displayHand.map((card, index) => {
                const total = displayHand.length;
                const clickable = Boolean(isMyTurn);

                const maxAngle = 18;
                const angleStep = total > 1 ? (maxAngle * 2) / (total - 1) : 0;
                const angle = total > 1 ? -maxAngle + index * angleStep : 0;

                const centerShift = (index - (total - 1) / 2) * 42;
                const offsetY = -Math.abs(angle) * 0.22;

                const baseTransform = `translateX(-50%) translateX(${centerShift}px) translateY(${offsetY}px) rotate(${angle}deg)`;

                const isHovered = clickable && hoveredIndex === index;
                const finalTransform = isHovered
                  ? `${baseTransform} translateY(-10px) scale(1.08)`
                  : baseTransform;

                return (
                  <button
                    key={`${card.rank}-${card.suit}-${index}`}
                    type="button"
                    onClick={() => clickable && handlePlayCard(card)}
                    disabled={!clickable}
                    onMouseEnter={() => clickable && setHoveredIndex(index)}
                    onMouseLeave={() =>
                      setHoveredIndex((prev) => (prev === index ? null : prev))
                    }
                    className="absolute left-1/2 bottom-0 -translate-x-1/2 transform-gpu focus:outline-none"
                    style={{
                      transform: finalTransform,
                      transformOrigin: "50% 100%",
                      cursor: clickable ? "pointer" : "default",
                      filter: isHovered ? "brightness(1.05)" : "none",
                      transition: "transform 0.15s ease-out, filter 0.15s ease-out",
                    }}
                  >
                    <CardSvg card={card} />
                  </button>
                );
              })}
            </div>
          </div>
        </section>

        {/* SIDEBAR */}
        <aside className="w-[260px] max-w-[320px] shrink-0 space-y-3 rounded-xl border border-slate-500/40 bg-slate-950/95 p-3 text-sm shadow-panel">
          <h2 className="text-base font-medium text-white">Joueurs</h2>

          {roomPlayers.length === 0 && !wsError && (
            <p className="text-slate-400">En attente d&apos;autres joueurs...</p>
          )}

          <ul className="flex list-none flex-col gap-2">
            {roomPlayers.map((player) => {
              const isCurrent =
                !!gameState &&
                player.seat !== null &&
                player.seat === gameState.currentPlayer;
              const isYou = player.nickname === nickname;

              return (
                <li
                  key={player.id}
                  className={cx(
                    "flex items-center justify-between gap-2 rounded-lg border px-3 py-2",
                    isCurrent
                      ? "border-emerald-400/60 bg-emerald-500/10"
                      : "border-slate-500/40 bg-slate-900/80"
                  )}
                >
                  <div>
                    <span className="text-slate-100">
                      {player.nickname}
                      {isYou && <span className="text-indigo-200"> (vous)</span>}
                      {player.seat !== null && ` — ${shortSeatLabel(player.seat)}`}
                    </span>
                    {isCurrent && (
                      <span className="ml-2 text-xs text-emerald-300">
                        tour de jeu
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-slate-500">{player.id.slice(-4)}</span>
                </li>
              );
            })}
          </ul>

          {gameState && (
            <div className="space-y-3 rounded-2xl border border-slate-500/40 bg-slate-900/85 px-3 py-4">
              <div className="rounded-xl border border-emerald-400/40 bg-gradient-to-r from-emerald-900/40 to-emerald-700/20 p-3 text-xs uppercase tracking-widest text-emerald-100">
                <p className="mb-2 flex items-center justify-between text-[0.65rem] text-emerald-200">
                  <span>Score de la donne</span>
                  <span className="text-[0.6rem] text-emerald-300/80">
                    manche {currentDealNumber}
                  </span>
                </p>
                <div className="grid grid-cols-2 gap-2 text-base font-semibold text-white">
                  <div className="rounded-lg bg-slate-950/40 px-2 py-2 text-center shadow-inner shadow-black/40">
                    <p className="text-[0.6rem] uppercase tracking-[0.35em] text-emerald-200">
                      {shortSeatLabel(0)}·{shortSeatLabel(2)}
                    </p>
                    <p className="text-2xl">{gameState.scores.team0}</p>
                    <p className="text-[0.6rem] text-emerald-100/70">pts</p>
                  </div>
                  <div className="rounded-lg bg-slate-950/40 px-2 py-2 text-center shadow-inner shadow-black/40">
                    <p className="text-[0.6rem] uppercase tracking-[0.35em] text-emerald-200">
                      {shortSeatLabel(1)}·{shortSeatLabel(3)}
                    </p>
                    <p className="text-2xl">{gameState.scores.team1}</p>
                    <p className="text-[0.6rem] text-emerald-100/70">pts</p>
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-amber-300/40 bg-gradient-to-b from-slate-950/40 to-amber-900/10 p-3">
                <div className="mb-2 flex items-center justify-between text-[0.65rem] uppercase tracking-[0.35em] text-amber-200">
                  <span>Scores cumulés</span>
                  <span>match</span>
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex items-center justify-between text-[0.65rem] text-amber-100/80">
                      <span>
                        {shortSeatLabel(0)} &amp; {shortSeatLabel(2)}
                      </span>
                      <span className="text-base font-semibold text-white">
                        {matchTeam0} pts
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-800/70">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
                        style={{ width: `${team0Progress}%` }}
                      />
                    </div>
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[0.65rem] text-amber-100/80">
                      <span>
                        {shortSeatLabel(1)} &amp; {shortSeatLabel(3)}
                      </span>
                      <span className="text-base font-semibold text-white">
                        {matchTeam1} pts
                      </span>
                    </div>
                    <div className="mt-1 h-2 rounded-full bg-slate-800/70">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
                        style={{ width: `${team1Progress}%` }}
                      />
                    </div>
                  </div>
                </div>
              </div>

              {gameState.belote.stage > 0 && (
                <div className="rounded-xl border border-amber-200/50 bg-amber-500/10 px-3 py-2 text-[0.7rem] text-amber-100">
                  <p className="flex items-center gap-1">
                    <span>🎖</span>
                    <span>
                      {gameState.belote.stage === 1
                        ? "Belote annoncée par "
                        : "Belote & rebelote annoncées par "}
                      {gameState.belote.holder !== null &&
                        shortSeatLabel(gameState.belote.holder)}
                      {gameState.belote.stage === 2 &&
                        ` (+${gameState.belote.points} pts)`}
                    </span>
                  </p>
                </div>
              )}
            </div>
          )}

          {wsError && (
            <div className="rounded-lg border border-rose-400/70 bg-rose-900/50 px-3 py-2 text-xs text-rose-100">
              {wsError}
            </div>
          )}
        </aside>

        {/* OVERLAY SCORE FINAL */}
        {showEndOverlay && gameState && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center"
            onClick={() => setShowEndOverlay(false)}
          >
            <div className="absolute inset-0 bg-slate-950/85 animate-backdrop-fade" />
            <div className="relative max-w-sm rounded-2xl border border-slate-500/70 bg-gradient-to-b from-slate-900 to-slate-950 px-8 py-6 text-center text-sm shadow-[0_25px_60px_-24px_rgba(0,0,0,1)] animate-final-score-pop">
              <h2 className="text-lg font-semibold text-white">🎉 Donne terminée</h2>
              <p className="mt-2 text-slate-200">
                Équipe ({shortSeatLabel(0)} &amp; {shortSeatLabel(2)}) :
                <strong className="ml-1 text-white">{gameState.scores.team0}</strong> pts
              </p>
              <p className="mt-1 text-slate-200">
                Équipe ({shortSeatLabel(1)} &amp; {shortSeatLabel(3)}) :
                <strong className="ml-1 text-white">{gameState.scores.team1}</strong> pts
              </p>
              <button
                type="button"
                onClick={() => setShowEndOverlay(false)}
                className="mt-4 rounded-full border border-slate-500/70 px-5 py-2 text-sm text-slate-100"
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
  cardsCount?: number;
  isTrumpChooser?: boolean;
}) {
  const { position, player, isCurrent, isSelf, cardsCount, isTrumpChooser } =
    props;
  const col = position === "left" ? 1 : position === "right" ? 3 : 2;
  const row = position === "top" ? 1 : position === "bottom" ? 3 : 2;

  if (!player) {
    return (
      <div
        className="text-xs text-slate-200/70"
        style={{ gridColumn: col, gridRow: row }}
      >
        {position === "bottom"
          ? "En attente de vous..."
          : "En attente d'un joueur..."}
      </div>
    );
  }

  const seatLabel = `J${(player.seat ?? 0) + 1}`;
  const label = isSelf
    ? `${player.nickname} (${seatLabel}, vous)`
    : `${player.nickname} (${seatLabel})`;

  return (
    <div
      className={cx(
        "inline-flex flex-col items-center gap-1 rounded-full border px-3 py-2 text-xs text-white transition",
        isCurrent
          ? "border-emerald-400/80 bg-emerald-500/20 shadow-[0_0_0_1px_rgba(16,185,129,0.4)]"
          : "border-slate-900/80 bg-slate-900/70",
        isTrumpChooser && "ring-2 ring-amber-300/70"
      )}
      style={{ gridColumn: col, gridRow: row }}
    >
      <div className="flex items-center gap-2">
        <span
          className={cx(
            "h-1.5 w-1.5 rounded-full",
            isCurrent ? "bg-emerald-400" : "bg-slate-500"
          )}
        />
        <span>{label}</span>
        {isTrumpChooser && (
          <span className="flex items-center gap-1 rounded-full border border-amber-300/70 bg-amber-500/20 px-2 py-0.5 text-[0.55rem] font-semibold uppercase tracking-[0.4em] text-amber-100">
            👑 Preneur
          </span>
        )}
      </div>
      {!isSelf && (cardsCount ?? 0) > 0 && (
        <CardBackFan count={cardsCount ?? 0} />
      )}
    </div>
  );
}

function TrickCardView(props: {
  position: TablePosition;
  card: Card;
  playerLabel: string;
}) {
  const { position, card, playerLabel } = props;

  const animationClass =
    position === "top"
      ? "animate-trick-from-top"
      : position === "bottom"
      ? "animate-trick-from-bottom"
      : position === "left"
      ? "animate-trick-from-left"
      : "animate-trick-from-right";

  const basePositionClass: Record<TablePosition, string> = {
    top: "left-1/2 top-4 -translate-x-1/2",
    bottom: "left-1/2 bottom-4 -translate-x-1/2",
    left: "left-4 top-1/2 -translate-y-1/2",
    right: "right-4 top-1/2 -translate-y-1/2",
  };

  const directionClass =
    position === "top"
      ? "flex-col"
      : position === "bottom"
      ? "flex-col-reverse"
      : position === "left"
      ? "flex-row"
      : "flex-row-reverse";

  const alignmentClass =
    position === "left"
      ? "items-center text-left"
      : position === "right"
      ? "items-center text-right"
      : "items-center text-center";

  return (
    <div
      className={cx(
        "absolute flex gap-2 text-xs text-slate-100 drop-shadow-[0_15px_25px_rgba(0,0,0,0.65)]",
        basePositionClass[position],
        directionClass,
        alignmentClass,
        animationClass
      )}
    >
      <div className="rounded-full border border-emerald-300/40 bg-slate-900/70 px-3 py-0.5 text-[0.6rem] uppercase tracking-[0.4em] text-emerald-200 shadow-inner shadow-black/40">
        {playerLabel}
      </div>
      <div className="relative">
        <CardSvg card={card} variant="trick" />
        <div className="pointer-events-none absolute inset-1 rounded-lg border border-white/10" />
      </div>
    </div>
  );
}

function CardBackFan(props: { count: number }) {
  const { count } = props;
  const cardsToShow = Math.min(7, count);
  const cardsArray = Array.from({ length: cardsToShow });
  const angleSpread = 12;
  const startAngle = -((cardsToShow - 1) / 2) * angleSpread;

  return (
    <div className="relative mt-1 flex flex-col items-center">
      <div className="relative h-16 w-24">
        {cardsArray.map((_, idx) => {
          const angle = startAngle + idx * angleSpread;
          return (
            <div
              key={idx}
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) rotate(${angle}deg) translateY(-6px)`,
                zIndex: idx,
              }}
            >
              <CardBackSvg variant="fan" />
            </div>
          );
        })}
      </div>
      <span className="mt-1 text-[0.6rem] uppercase tracking-[0.4em] text-slate-200">
        {count}
      </span>
    </div>
  );
}

function DeckChoiceVisual(props: { turnedCard: Card | null }) {
  const { turnedCard } = props;
  const stack = Array.from({ length: 4 });

  return (
    <div className="mb-5 flex flex-col items-center gap-3">
      <div className="relative flex items-center justify-center">
        <div className="relative h-28 w-36">
          {stack.map((_, idx) => (
            <div
              key={idx}
              className="absolute left-1/2 top-1/2"
              style={{
                transform: `translate(-50%, -50%) rotate(${idx * 4}deg) translateY(${
                  -idx * 3
                }px)`,
              }}
            >
              <CardBackSvg variant="stack" />
            </div>
          ))}
        </div>
        {turnedCard && (
          <div className="-ml-8 rotate-3">
            <CardSvg card={turnedCard} variant="trick" />
          </div>
        )}
      </div>
      <p className="text-xs uppercase tracking-[0.35em] text-slate-400">
        Carte proposée
      </p>
    </div>
  );
}

type CardSizeVariant = "hand" | "trick" | "mini";

function CardSvg(props: {
  card: Card;
  variant?: CardSizeVariant;
  small?: boolean;
}) {
  const { card, variant, small } = props;
  const isRed = card.suit === "♥" || card.suit === "♦";

  const sizeKey: CardSizeVariant = small ? "mini" : variant ?? "hand";
  const sizeByVariant: Record<CardSizeVariant, { width: number; height: number }> = {
    hand: { width: 88, height: 122 },
    trick: { width: 76, height: 108 },
    mini: { width: 52, height: 72 },
  };
  const { width, height } = sizeByVariant[sizeKey];

  return (
    <svg
      viewBox="0 0 52 72"
      width={width}
      height={height}
      className="block drop-shadow-[0_8px_14px_rgba(0,0,0,0.85)]"
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

function CardBackSvg(props: { variant?: "mini" | "stack" | "fan" }) {
  const { variant = "mini" } = props;
  const sizeMap = {
    mini: { width: 34, height: 50 },
    stack: { width: 52, height: 72 },
    fan: { width: 48, height: 68 },
  } as const;
  const { width, height } = sizeMap[variant];

  return (
    <svg
      viewBox="0 0 52 72"
      width={width}
      height={height}
      className="block drop-shadow-[0_6px_10px_rgba(0,0,0,0.7)]"
    >
      <defs>
        <linearGradient id="card-back" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#1e293b" />
          <stop offset="100%" stopColor="#0f172a" />
        </linearGradient>
        <pattern
          id="card-dots"
          x="0"
          y="0"
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
        >
          <circle cx="1" cy="1" r="1" fill="#1f2937" />
        </pattern>
      </defs>
      <rect
        x={1}
        y={1}
        width={50}
        height={70}
        rx={6}
        ry={6}
        fill="url(#card-back)"
        stroke="#10b981"
        strokeWidth={0.7}
      />
      <rect
        x={4}
        y={4}
        width={44}
        height={64}
        rx={4}
        ry={4}
        fill="url(#card-dots)"
        stroke="#0f172a"
        strokeWidth={0.5}
      />
      <rect
        x={15}
        y={20}
        width={22}
        height={32}
        rx={6}
        fill="rgba(16,185,129,0.25)"
        stroke="rgba(16,185,129,0.6)"
        strokeWidth={0.8}
      />
    </svg>
  );
}

export default App;
