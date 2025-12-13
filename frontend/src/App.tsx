import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { config } from "./config";
import type { Card, GameStateWS, Suit } from "./gameTypes";
import { supabase } from "./lib/supabaseClient";

type View = "lobby" | "game";

interface PlayerStatsPayload {
  wins: number;
  games: number;
  winrate: number;
}

interface RoomPlayer {
  id: string;
  nickname: string;
  seat: number | null;
  userId?: string | null;
  avatarUrl?: string | null;
  stats?: PlayerStatsPayload;
}

interface UserProfile {
  id: string;
  username: string;
  avatar_url: string | null;
  wins: number;
  games: number;
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

const REACTION_EMOJIS = ["😄", "😡", "😢", "😎", "🤔", "🎉"] as const;

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
  const [isMobile, setIsMobile] = useState(false);
  const [isLandscape, setIsLandscape] = useState(true);
  const [showMobilePanel, setShowMobilePanel] = useState(false);
  const [showReactionPicker, setShowReactionPicker] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profileForm, setProfileForm] = useState({ username: "", avatarUrl: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const supabaseReady = Boolean(supabase);

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false);
      return;
    }
    let mounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ---- LOBBY ----

  const handleJoin = (event: React.FormEvent) => {
    event.preventDefault();
    if (!session?.access_token || !roomCode) return;
    setNickname(profile?.username ?? nickname);
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
      setShowReactionPicker(false);
      setShowMobilePanel(false);
      return;
    }

    if (!session?.access_token) {
      setWsError("Session Supabase manquante.");
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
          payload: { roomCode, nickname, accessToken: session.access_token },
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
  }, [view, roomCode, nickname, session?.access_token]);

  const handleStartGame = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "start_game" }));
  };

  const handleSignOut = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
    setRoomCode("");
    setView("lobby");
  };

  const handleProfileFieldChange = (field: "username" | "avatarUrl", value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async (event?: React.FormEvent) => {
    event?.preventDefault();
    if (!supabase || !session) return;
    const username = profileForm.username.trim();
    if (!username) return;
    setProfileSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: session.user.id,
        username,
        avatar_url: profileForm.avatarUrl.trim() || null,
      });
    setProfileSaving(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    const updated: UserProfile = {
      id: session.user.id,
      username,
      avatar_url: profileForm.avatarUrl.trim() || null,
      wins: profile?.wins ?? 0,
      games: profile?.games ?? 0,
    };
    setProfile(updated);
    setNickname(updated.username);
    setShowProfileModal(false);
    setAuthError(null);
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: "sync_profile",
          payload: { accessToken: session.access_token },
        })
      );
    }
  };

  const handleAvatarUpload = async (file: File) => {
    if (!supabase || !session) return;
    setAvatarUploading(true);
    setAuthError(null);
    try {
      const fileExt = (file.name.split(".").pop() || "png").toLowerCase();
      const response = await fetch(`${config.backendUrl}/avatar/upload-url`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          accessToken: session.access_token,
          fileExt,
        }),
      });
      const payload = await response
        .json()
        .catch(() => ({ error: "Réponse invalide du serveur." }));

      if (!response.ok || !payload?.uploadUrl || !payload?.publicUrl) {
        throw new Error(payload?.error ?? "Impossible de préparer l'upload.");
      }

      const uploadResponse = await fetch(payload.uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": file.type || "application/octet-stream",
        },
        body: file,
      });

      if (!uploadResponse.ok) {
        throw new Error("Le téléversement a échoué.");
      }

      const publicUrl: string = payload.publicUrl;
      setProfileForm((prev) => ({ ...prev, avatarUrl: publicUrl }));
      const { error: updateError } = await supabase
        .from("profiles")
        .update({ avatar_url: publicUrl })
        .eq("id", session.user.id);
      if (updateError) {
        throw updateError;
      }
      setProfile((prev) => (prev ? { ...prev, avatar_url: publicUrl } : prev));
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(
          JSON.stringify({
            type: "sync_profile",
            payload: { accessToken: session.access_token },
          })
        );
      }
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Impossible d'uploader l'avatar.";
      setAuthError(message);
    } finally {
      setAvatarUploading(false);
    }
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

  const handleSendReaction = (emoji: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    if (!gameState) return;
    wsRef.current.send(
      JSON.stringify({
        type: "player_reaction",
        payload: { emoji },
      })
    );
    setShowReactionPicker(false);
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
  const trickWinnerName =
    trickWinner !== undefined && trickWinner !== null
      ? playerNameForSeat(trickWinner)
      : null;

  const seatToTablePosition = useCallback(
    (seat: number | null): TablePosition | null => {
      if (seat === null) return null;
      if (mySeat === null) return TABLE_POSITIONS[seat] ?? null;
      const relativeIndex = (seat - mySeat + 4) % 4;
      return TABLE_POSITIONS[relativeIndex] ?? null;
    },
    [mySeat]
  );

  const activeReactionsBySeat = useMemo(() => {
    const map: Record<number, string> = {};
    if (!gameState?.playerReactions) return map;
    Object.entries(gameState.playerReactions).forEach(([seatKey, reaction]) => {
      const seatNumber = Number(seatKey);
      if (Number.isNaN(seatNumber)) return;
      map[seatNumber] = reaction.emoji;
    });
    return map;
  }, [gameState?.playerReactions]);

  const reactionForSeat = (seat: number | null | undefined) => {
    if (seat === null || seat === undefined) return undefined;
    const emoji = activeReactionsBySeat[seat];
    return emoji ? { emoji } : undefined;
  };

  const playersByPosition: Partial<Record<TablePosition, RoomPlayer>> = {};
  roomPlayers.forEach((player) => {
    if (player.seat === null) return;
    const pos = seatToTablePosition(player.seat);
    if (!pos) return;
    playersByPosition[pos] = player;
  });

  const reactionsByPosition: Partial<Record<TablePosition, string>> = {};
  TABLE_POSITIONS.forEach((position) => {
    const seat = playersByPosition[position]?.seat ?? null;
    const reaction = reactionForSeat(seat);
    if (reaction) {
      reactionsByPosition[position] = reaction.emoji;
    }
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

  const remainingCardsForSeat = (seat: number | null): number => {
    if (seat === null || !gameState) return 0;
    if (seat === mySeat) return displayHand.length;
    return gameState.hands[String(seat)]?.length ?? 0;
  };

  const trickCardPlacements = useMemo(() => {
    if (!gameState?.trick) return [];
    return gameState.trick.cards.map((tc, order) => ({
      ...tc,
      position: seatToTablePosition(tc.player) ?? "top",
      order,
    }));
  }, [gameState?.trick, seatToTablePosition]);

  const sidebarContent = (
    <div className="space-y-3">
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
          const reaction = reactionForSeat(player.seat);

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
              <div className="flex flex-1 items-center gap-3">
                <AvatarCircle avatarUrl={player.avatarUrl} fallback={player.nickname} />
                <div>
                  <div className="flex flex-wrap items-center gap-2 text-slate-100">
                    <span>
                      {player.nickname}
                      {isYou && <span className="text-indigo-200"> (vous)</span>}
                      {player.seat !== null && ` — ${shortSeatLabel(player.seat)}`}
                    </span>
                    {reaction && (
                      <span className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-emerald-400/40 bg-emerald-500/10 text-base leading-none text-emerald-100">
                        {reaction.emoji}
                      </span>
                    )}
                  </div>
                  {player.stats && (
                    <p className="text-[0.6rem] uppercase tracking-[0.35em] text-slate-500">
                      {Math.round(player.stats.winrate * 100)}% WR · {player.stats.wins}W
                    </p>
                  )}
                  {isCurrent && (
                    <span className="text-xs text-emerald-300">tour de jeu</span>
                  )}
                </div>
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
    </div>
  );

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

  // ---- Responsive viewport ----

  useEffect(() => {
    const updateViewport = () => {
      if (typeof window === "undefined") return;
      const { innerWidth: width, innerHeight: height } = window;
      setIsMobile(width < 1024);
      setIsLandscape(width >= height);
    };

    updateViewport();
    window.addEventListener("resize", updateViewport);
    window.addEventListener("orientationchange", updateViewport);
    return () => {
      window.removeEventListener("resize", updateViewport);
      window.removeEventListener("orientationchange", updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!isMobile) {
      setShowMobilePanel(false);
    }
  }, [isMobile]);

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

  useEffect(() => {
    const supabaseClient = supabase;
    if (!supabaseClient || !session) {
      setProfile(null);
      setProfileForm({ username: "", avatarUrl: "" });
      if (!session) {
        setNickname("");
      }
      return;
    }

    let active = true;
    setProfileLoading(true);

    const fetchProfile = async () => {
      try {
        const { data, error } = await supabaseClient
          .from("profiles")
          .select("id, username, avatar_url, wins, games")
          .eq("id", session.user.id)
          .maybeSingle();

        if (!active) return;

        if (error) {
          setProfile(null);
          setAuthError(error.message);
          return;
        }

        if (data) {
          const normalized: UserProfile = {
            id: data.id,
            username: data.username ?? session.user.email ?? "Player",
            avatar_url: data.avatar_url ?? null,
            wins: data.wins ?? 0,
            games: data.games ?? 0,
          };
          setProfile(normalized);
          setProfileForm({
            username: normalized.username,
            avatarUrl: normalized.avatar_url ?? "",
          });
          setNickname(normalized.username);
          setAuthError(null);
        }
      } finally {
        if (active) {
          setProfileLoading(false);
        }
      }
    };

    fetchProfile();

    return () => {
      active = false;
    };
  }, [session]);

  useEffect(() => {
    if (!profile) return;
    const selfPlayer = roomPlayers.find(
      (player) => player.userId && player.userId === profile.id && player.stats
    );
    if (selfPlayer?.stats) {
      const { wins, games } = selfPlayer.stats;
      if (wins !== profile.wins || games !== profile.games) {
        setProfile((prev) =>
          prev ? { ...prev, wins, games } : prev
        );
      }
    }
  }, [roomPlayers, profile]);

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

  if (!supabaseReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-center text-slate-100">
        <div>
          <p className="text-lg font-semibold">Supabase n&apos;est pas configuré.</p>
          <p className="mt-2 text-sm text-slate-400">
            Renseignez <code className="font-mono">VITE_SUPABASE_URL</code> et <code className="font-mono">VITE_SUPABASE_ANON_KEY</code>.
          </p>
        </div>
      </div>
    );
  }

  if (authLoading || profileLoading) {
    return <FullScreenLoader message="Connexion en cours..." />;
  }

  if (!session) {
    return (
      <AuthScreen
        mode={authMode}
        onToggleMode={setAuthMode}
        error={authError}
        onError={setAuthError}
      />
    );
  }

  if (!profile) {
    return (
      <ProfileSetupScreen
        values={profileForm}
        onChange={handleProfileFieldChange}
        onSubmit={handleSaveProfile}
        saving={profileSaving}
        error={authError}
        onUploadAvatar={handleAvatarUpload}
        uploadingAvatar={avatarUploading}
      />
    );
  }

  const profileWinrate =
    profile.games > 0 ? Math.round((profile.wins / profile.games) * 100) : 0;

  const profileQuickAccess =
    profile &&
    (
      <button
        type="button"
        onClick={() => setShowProfileModal(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-cyan-300/50 bg-slate-950/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-100 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.9)] backdrop-blur-sm transition hover:border-cyan-200 hover:text-cyan-50"
      >
        <AvatarCircle avatarUrl={profile.avatar_url} fallback={profile.username} size="sm" />
        Profil
      </button>
    );

  const profileModal =
    profile &&
    showProfileModal && (
      <ProfileModal
        values={profileForm}
        onChange={handleProfileFieldChange}
        onClose={() => setShowProfileModal(false)}
        onSubmit={handleSaveProfile}
        saving={profileSaving}
        onUploadAvatar={handleAvatarUpload}
        uploadingAvatar={avatarUploading}
      />
    );

  if (view === "lobby") {
    return (
      <>
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
                <div className="flex items-center gap-4 rounded-2xl border border-slate-500/60 bg-slate-950/75 px-5 py-4">
                  <AvatarCircle avatarUrl={profile.avatar_url} fallback={profile.username} />
                  <div className="flex-1">
                    <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
                      Connecté en tant que
                    </p>
                    <p className="text-lg font-semibold text-white">{profile.username}</p>
                    <p className="text-xs text-slate-400">
                      {profileWinrate}% WR · {profile.wins} victoires
                    </p>
                  </div>
                </div>

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
        {profileQuickAccess}
        {profileModal}
      </>
    );
  }

  // ---------- JEU ----------

  const trumpColorClass =
    trumpSymbol === "♥" || trumpSymbol === "♦"
      ? "text-rose-300"
      : "text-slate-100";

  return (
    <>
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
            Connecté en tant que <strong>{profile.username}</strong>
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

        <div className="flex flex-col items-end gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-900/60 px-4 py-2">
            <AvatarCircle avatarUrl={profile.avatar_url} fallback={profile.username} />
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{profile.username}</p>
              <p className="text-xs text-slate-400">
                {profileWinrate}% WR · {profile.wins} victoires
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowProfileModal(true)}
              className="rounded-full border border-slate-600/60 px-3 py-1 text-xs text-slate-200 transition hover:border-slate-300"
            >
              Profil
            </button>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
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

            <button
              type="button"
              onClick={handleSignOut}
              className="rounded-full border border-rose-500/60 bg-rose-500/10 px-4 py-2 text-sm text-rose-100 transition hover:border-rose-300"
            >
              Déconnexion
            </button>
          </div>
        </div>
      </header>

      {/* ZONE PRINCIPALE */}
      <main className="relative mt-2 flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
        {/* TAPIS */}
        <section className="relative flex h-full w-full flex-1 flex-col rounded-[1.25rem] border border-slate-500/40 bg-felt px-3 pb-16 pt-2 shadow-table lg:pb-3">
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
          {showTrickWinnerBanner && trickWinnerName && (
            <TrickWinnerSpotlight winnerName={trickWinnerName} />
          )}

          {isMobile && !isLandscape && (
            <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 rounded-[1.25rem] border border-emerald-400/30 bg-slate-950/95 text-center shadow-[0_45px_90px_-40px_rgba(0,0,0,0.95)]">
              <p className="text-lg font-semibold text-white">
                Tournez votre téléphone
              </p>
              <p className="text-sm text-slate-300">
                L&apos;expérience est pensée pour le mode paysage.
              </p>
            </div>
          )}

          {/* JOUEURS + PLI AU CENTRE */}
          <div className="relative flex-1">
            <div className="grid h-full grid-cols-[1fr_auto_1fr] grid-rows-[auto_1fr_auto] items-center justify-items-center gap-1">
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
              avatarUrl={playersByPosition.top?.avatarUrl}
              stats={playersByPosition.top?.stats}
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
              avatarUrl={playersByPosition.left?.avatarUrl}
              stats={playersByPosition.left?.stats}
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
              avatarUrl={playersByPosition.right?.avatarUrl}
              stats={playersByPosition.right?.stats}
            />

              {/* PLI */}
              <div className="relative col-start-2 row-start-2 aspect-square w-full max-w-[520px] place-self-center">
                {trickCardPlacements.map((tc) => (
                  <TrickCardView
                    key={`${tc.player}-${tc.order}`}
                    position={tc.position}
                    card={tc.card}
                    playerLabel={shortSeatLabel(tc.player)}
                  />
                ))}
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
              avatarUrl={playersByPosition.bottom?.avatarUrl ?? profile.avatar_url}
              stats={playersByPosition.bottom?.stats ?? {
                wins: profile.wins,
                games: profile.games,
                winrate: profile.games > 0 ? profile.wins / profile.games : 0,
              }}
            />
            </div>
            <div className="pointer-events-none absolute inset-0 z-20">
              {TABLE_POSITIONS.map((position) => {
                const emoji = reactionsByPosition[position];
                if (!emoji) return null;
                return (
                  <ReactionBubble
                    key={`reaction-${position}`}
                    position={position}
                    emoji={emoji}
                  />
                );
              })}
            </div>
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

          {gameState && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setShowReactionPicker((prev) => !prev)}
                className={cx(
                  "flex h-11 w-11 items-center justify-center rounded-full border text-2xl transition shadow-[0_12px_25px_-16px_rgba(168,85,247,0.9)]",
                  showReactionPicker
                    ? "border-violet-300 bg-violet-500/30 text-violet-50"
                    : "border-violet-300/60 bg-slate-950/80 text-violet-100 hover:border-violet-200"
                )}
                aria-label="Réactions"
              >
                😊
              </button>

              {showReactionPicker && (
                <div className="absolute left-1/2 top-full z-20 mt-3 w-[220px] -translate-x-1/2 rounded-3xl border border-violet-300/50 bg-slate-950/95 p-4 text-left shadow-[0_25px_60px_-30px_rgba(139,92,246,0.7)]">
                  <div className="grid grid-cols-3 gap-3">
                    {REACTION_EMOJIS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleSendReaction(emoji)}
                        className="flex aspect-square items-center justify-center rounded-2xl border border-slate-600/60 bg-slate-900/70 text-2xl transition hover:border-violet-300"
                        aria-label={`Emoji ${emoji}`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
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
        <aside className="hidden max-w-[320px] shrink-0 rounded-xl border border-slate-500/40 bg-slate-950/95 p-3 text-sm shadow-panel lg:block lg:w-[260px]">
          {sidebarContent}
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
        {isMobile && (
          <button
            type="button"
            onClick={() => setShowMobilePanel(true)}
            className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full border border-emerald-300/60 bg-slate-950/90 px-4 py-2 text-[0.6rem] font-semibold uppercase tracking-[0.4em] text-emerald-100 shadow-[0_25px_55px_-30px_rgba(16,185,129,1)] backdrop-blur"
          >
            <span>👥</span>
            <span>Scores</span>
          </button>
        )}

        {isMobile && showMobilePanel && (
          <div className="fixed inset-0 z-40">
            <div
              className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm"
              onClick={() => setShowMobilePanel(false)}
            />
            <div className="relative mt-auto max-h-[80vh] rounded-t-3xl border border-slate-500/60 bg-slate-950/95 p-5 text-sm shadow-[0_-25px_60px_-30px_rgba(0,0,0,0.9)]">
              <div className="mb-4 flex items-center justify-between">
                <p className="text-sm font-semibold uppercase tracking-[0.3em] text-slate-200">
                  Joueurs &amp; scores
                </p>
                <button
                  type="button"
                  onClick={() => setShowMobilePanel(false)}
                  className="rounded-full border border-slate-600/70 px-3 py-1 text-xs text-slate-300"
                >
                  Fermer
                </button>
              </div>
              <div className="max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                {sidebarContent}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
    {profileQuickAccess}
    {profileModal}
    </>
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
  avatarUrl?: string | null;
  stats?: PlayerStatsPayload;
}) {
  const {
    position,
    player,
    isCurrent,
    isSelf,
    cardsCount,
    isTrumpChooser,
    avatarUrl,
    stats,
  } = props;
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

  const displayAvatar = avatarUrl ?? player?.avatarUrl ?? null;
  const statLine =
    stats && stats.games > 0
      ? `${Math.round(stats.winrate * 100)}% WR · ${stats.wins}W`
      : stats
      ? `${stats.wins}W`
      : null;

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
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-3">
          <AvatarCircle avatarUrl={displayAvatar} fallback={player?.nickname ?? "?"} size="sm" />
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
        {statLine && (
          <p className="text-[0.55rem] uppercase tracking-[0.4em] text-emerald-100/80">
            {statLine}
          </p>
        )}
        {!isSelf && (cardsCount ?? 0) > 0 && (
          <CardBackFan count={cardsCount ?? 0} />
        )}
      </div>
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

  const positionClass: Record<TablePosition, string> = {
    top: "-translate-x-1/2 -translate-y-[125%]",
    bottom: "-translate-x-1/2 translate-y-[35%]",
    left: "-translate-x-[165%] -translate-y-1/2",
    right: "translate-x-[65%] -translate-y-1/2",
  };

  const directionClass: Record<TablePosition, string> = {
    top: "flex-col",
    bottom: "flex-col-reverse",
    left: "flex-row",
    right: "flex-row-reverse",
  };

  const alignmentClass =
    position === "left"
      ? "items-center text-left"
      : position === "right"
      ? "items-center text-right"
      : "items-center text-center";

  const zIndex =
    position === "bottom" ? 40 : position === "top" ? 35 : position === "left" ? 38 : 38;

  return (
    <div
      className={cx("absolute left-1/2 top-1/2", positionClass[position])}
      style={{ zIndex }}
    >
      <div
        className={cx(
          "flex gap-2 text-xs text-slate-100 drop-shadow-[0_20px_28px_rgba(0,0,0,0.55)]",
          directionClass[position],
          alignmentClass,
          animationClass
        )}
      >
        <div className="rounded-full border border-emerald-300/50 bg-slate-900/80 px-3 py-1 text-[0.58rem] uppercase tracking-[0.45em] text-emerald-100 shadow-inner shadow-black/50">
          {playerLabel}
        </div>
        <div className="relative">
          <CardSvg card={card} variant="trick" />
          <div className="pointer-events-none absolute inset-1 rounded-xl border border-white/10 shadow-inner shadow-emerald-200/10" />
        </div>
      </div>
    </div>
  );
}

function TrickWinnerSpotlight(props: { winnerName: string }) {
  const { winnerName } = props;
  return (
    <div className="pointer-events-none absolute inset-0 z-50 flex items-center justify-center">
      <div className="relative flex flex-col items-center gap-4 rounded-[2.5rem] border border-emerald-300/70 bg-gradient-to-b from-emerald-900/95 via-slate-950/95 to-slate-950/95 px-10 py-8 text-center text-white shadow-[0_45px_95px_-40px_rgba(0,0,0,0.95)] animate-trick-spotlight">
        <div className="pointer-events-none absolute inset-0 -z-10 rounded-[2.9rem] bg-emerald-400/15 blur-3xl" />
        <div className="flex items-center gap-3 text-4xl leading-none text-emerald-200">
          <span>🏆</span>
          <span className="text-3xl font-black tracking-[0.2em] text-emerald-100">
            PLI GAGNÉ
          </span>
        </div>
        <p className="text-xs uppercase tracking-[0.65em] text-emerald-200">
          Bravo à
        </p>
        <p className="text-3xl font-black tracking-wide text-white drop-shadow">
          {winnerName}
        </p>
      </div>
    </div>
  );
}

function ReactionBubble(props: { position: TablePosition; emoji: string }) {
  const { position, emoji } = props;
  const positionClass: Record<TablePosition, string> = {
    top: "left-1/2 top-2 -translate-x-1/2 -translate-y-full",
    bottom: "left-1/2 bottom-2 -translate-x-1/2 translate-y-full",
    left: "left-[6%] top-1/2 -translate-x-full -translate-y-1/2",
    right: "right-[6%] top-1/2 translate-x-full -translate-y-1/2",
  };

  return (
    <div
      className={cx(
        "pointer-events-none absolute z-30 flex items-center justify-center text-3xl text-white drop-shadow-[0_10px_35px_rgba(0,0,0,0.45)]",
        positionClass[position]
      )}
    >
      <span className="rounded-full border border-emerald-300/70 bg-slate-950/85 px-4 py-2 shadow-[0_18px_35px_-20px_rgba(16,185,129,0.8)] animate-reaction-pop">
        {emoji}
      </span>
    </div>
  );
}

function AvatarCircle(props: {
  avatarUrl?: string | null;
  fallback?: string;
  size?: "sm" | "md";
}) {
  const { avatarUrl, fallback, size = "md" } = props;
  const dimension =
    size === "sm" ? "h-7 w-7 text-xs" : "h-10 w-10 text-sm";
  const letter =
    fallback?.trim().charAt(0).toUpperCase() ?? "👤";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={fallback ?? "Avatar"}
        className={cx(
          "rounded-full object-cover ring-1 ring-slate-700/70",
          dimension
        )}
      />
    );
  }

  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-full border border-slate-600/60 bg-slate-800/60 text-slate-200",
        dimension
      )}
    >
      {letter}
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
    <div className="relative mt-1 flex flex-col items-center gap-1">
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
      <span className="text-[0.65rem] uppercase tracking-[0.4em] text-slate-200">
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

function ProfileModal(props: {
  values: { username: string; avatarUrl: string };
  onChange: (field: "username" | "avatarUrl", value: string) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  saving: boolean;
  onUploadAvatar: (file: File) => void;
  uploadingAvatar: boolean;
}) {
  const { values, onChange, onClose, onSubmit, saving, onUploadAvatar, uploadingAvatar } = props;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onUploadAvatar(file);
    }
    event.target.value = "";
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-3xl border border-slate-600/60 bg-slate-950/95 p-6 text-sm shadow-[0_25px_60px_-30px_rgba(0,0,0,1)]">
        <h2 className="text-lg font-semibold text-white">Votre profil</h2>
        <p className="text-xs text-slate-400">
          Mettez à jour votre pseudo et l&apos;URL de votre avatar.
        </p>
        <form onSubmit={onSubmit} className="mt-4 space-y-4">
          <div className="flex items-center gap-4 rounded-2xl border border-slate-600/60 bg-slate-900/60 px-4 py-3">
            <AvatarCircle avatarUrl={values.avatarUrl} fallback={values.username} />
            <div className="flex-1 text-xs text-slate-300">
              <p className="uppercase tracking-[0.35em]">Avatar</p>
              <label className="mt-1 inline-flex cursor-pointer items-center gap-2 rounded-full border border-slate-600/70 px-3 py-1 text-[0.6rem] uppercase tracking-[0.35em] text-slate-200 transition hover:border-slate-400">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                  disabled={uploadingAvatar}
                />
                {uploadingAvatar ? "Upload en cours..." : "Uploader une image"}
              </label>
            </div>
          </div>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-slate-400">
            Pseudo
            <input
              value={values.username}
              onChange={(e) => onChange("username", e.target.value)}
              className="mt-1 rounded-2xl border border-slate-600/60 bg-slate-900/80 px-4 py-2 text-base text-white outline-none transition focus:border-emerald-400"
              required
            />
          </label>
          <label className="flex flex-col gap-1 text-xs uppercase tracking-[0.35em] text-slate-400">
            Avatar (URL)
            <input
              value={values.avatarUrl}
              onChange={(e) => onChange("avatarUrl", e.target.value)}
              className="mt-1 rounded-2xl border border-slate-600/60 bg-slate-900/80 px-4 py-2 text-base text-white outline-none transition focus:border-cyan-400"
              placeholder="https://..."
            />
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-slate-600 px-4 py-2 text-xs uppercase tracking-[0.35em] text-slate-200"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-2 text-xs font-semibold uppercase tracking-[0.35em] text-white disabled:opacity-50"
            >
              {saving ? "Sauvegarde..." : "Sauvegarder"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ProfileSetupScreen(props: {
  values: { username: string; avatarUrl: string };
  onChange: (field: "username" | "avatarUrl", value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
  saving: boolean;
  error: string | null;
  onUploadAvatar: (file: File) => void;
  uploadingAvatar: boolean;
}) {
  const { values, onChange, onSubmit, saving, error, onUploadAvatar, uploadingAvatar } = props;

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      onUploadAvatar(file);
    }
    event.target.value = "";
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 text-slate-100">
      <div className="w-full max-w-md rounded-[2rem] border border-slate-700 bg-slate-900/80 p-8 shadow-[0_30px_60px_-35px_rgba(0,0,0,1)]">
        <h1 className="text-2xl font-semibold text-white">Complétez votre profil</h1>
        <p className="mt-2 text-sm text-slate-400">
          Choisissez un pseudo public et un avatar (URL).
        </p>
        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/60 bg-rose-500/10 px-4 py-2 text-xs text-rose-100">
            {error}
          </p>
        )}
        <form onSubmit={onSubmit} className="mt-6 space-y-4">
          <div className="flex items-center gap-4 rounded-2xl border border-slate-600 bg-slate-950/60 px-4 py-3">
            <AvatarCircle avatarUrl={values.avatarUrl} fallback={values.username} />
            <label className="flex-1 text-xs uppercase tracking-[0.35em] text-slate-400">
              Avatar
              <input
                type="file"
                accept="image/*"
                className="mt-2 text-[0.7rem] text-slate-300"
                onChange={handleFileSelect}
                disabled={uploadingAvatar}
              />
            </label>
          </div>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            Pseudo
            <input
              value={values.username}
              onChange={(e) => onChange("username", e.target.value)}
              className="rounded-2xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400"
              required
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            Avatar (URL)
            <input
              value={values.avatarUrl}
              onChange={(e) => onChange("avatarUrl", e.target.value)}
              className="rounded-2xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400"
            />
          </label>
          <button
            type="submit"
            disabled={saving}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 to-emerald-400 px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-white disabled:opacity-50"
          >
            {saving ? "Sauvegarde..." : "Enregistrer"}
          </button>
        </form>
      </div>
    </div>
  );
}

function AuthScreen(props: {
  mode: "signin" | "signup";
  onToggleMode: (mode: "signin" | "signup") => void;
  error: string | null;
  onError: (value: string | null) => void;
}) {
  const { mode, onToggleMode, error, onError } = props;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [avatarUrl, setAvatarUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!supabase) return;
    setLoading(true);
    onError(null);
    setInfo(null);

    if (mode === "signin") {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (signInError) {
        onError(signInError.message);
      }
    } else {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username },
        },
      });
      if (signUpError) {
        onError(signUpError.message);
      } else {
        if (data.user) {
          await supabase.from("profiles").upsert({
            id: data.user.id,
            username: username || email,
            avatar_url: avatarUrl.trim() || null,
            wins: 0,
            games: 0,
          });
        }
        setInfo("Vérifiez vos emails pour confirmer votre compte.");
      }
    }

    setLoading(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 px-6 py-12 font-sans text-slate-100">
      <div className="w-full max-w-lg rounded-[2.5rem] border border-slate-700 bg-slate-900/80 p-10 shadow-[0_35px_70px_-35px_rgba(0,0,0,1)]">
        <div className="flex justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.35em] text-slate-500">
              Belote Live
            </p>
            <h1 className="mt-2 text-3xl font-semibold text-white">
              {mode === "signin" ? "Connexion" : "Créer un compte"}
            </h1>
          </div>
          <button
            type="button"
            onClick={() => onToggleMode(mode === "signin" ? "signup" : "signin")}
            className="text-xs uppercase tracking-[0.35em] text-emerald-300"
          >
            {mode === "signin" ? "Nouveau ? S'inscrire" : "Déjà inscrit ? Se connecter"}
          </button>
        </div>
        {error && (
          <p className="mt-4 rounded-xl border border-rose-400/60 bg-rose-900/40 px-4 py-2 text-xs text-rose-100">
            {error}
          </p>
        )}
        {info && (
          <p className="mt-4 rounded-xl border border-amber-300/60 bg-amber-900/30 px-4 py-2 text-xs text-amber-200">
            {info}
          </p>
        )}
        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-2xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-slate-200">
            Mot de passe
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="rounded-2xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-cyan-400"
            />
          </label>
          {mode === "signup" && (
            <>
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                Pseudo
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  className="rounded-2xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400"
                  placeholder="BeloteMaster"
                />
              </label>
              <label className="flex flex-col gap-2 text-sm text-slate-200">
                Avatar (URL)
                <input
                  value={avatarUrl}
                  onChange={(e) => setAvatarUrl(e.target.value)}
                  className="rounded-2xl border border-slate-600 bg-slate-950/60 px-4 py-3 text-base text-white outline-none transition focus:border-emerald-400"
                  placeholder="https://..."
                />
              </label>
            </>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-gradient-to-r from-emerald-500 via-green-500 to-emerald-400 px-4 py-3 text-sm font-semibold uppercase tracking-[0.35em] text-white disabled:opacity-50"
          >
            {loading ? "Patientez..." : mode === "signin" ? "Se connecter" : "Créer un compte"}
          </button>
        </form>
      </div>
    </div>
  );
}

function FullScreenLoader(props: { message: string }) {
  const { message } = props;
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-200">
      <div className="flex flex-col items-center gap-3 rounded-3xl border border-slate-700 bg-slate-900/80 px-8 py-6 text-sm shadow-[0_25px_50px_-28px_rgba(0,0,0,1)]">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-emerald-400 border-t-transparent" />
        <p>{message}</p>
      </div>
    </div>
  );
}

export default App;
