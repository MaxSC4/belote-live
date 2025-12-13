import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import anime from "animejs/lib/anime.es.js";
import type { Session } from "@supabase/supabase-js";
import { config } from "./config";
import type { Card, GameStateWS, Suit } from "./gameTypes";
import { supabase } from "./lib/supabaseClient";
import AuthScreen from "./components/auth/AuthScreen";
import AvatarCircle from "./components/common/AvatarCircle";
import FullScreenLoader from "./components/common/FullScreenLoader";
import DeckChoiceVisual from "./components/game/DeckChoiceVisual";
import ReactionBubble from "./components/game/ReactionBubble";
import SeatBanner from "./components/game/SeatBanner";
import TrickCardView from "./components/game/TrickCardView";
import TrickWinnerSpotlight from "./components/game/TrickWinnerSpotlight";
import { Crown, Shuffle, Smile } from "lucide-react";
import CardSvg from "./components/game/cards/CardSvg";
import ProfileModal from "./components/profile/ProfileModal";
import ProfileSetupScreen from "./components/profile/ProfileSetupScreen";
import { CARD_OVERLAY_SVG } from "./constants/ui";
import type { RoomPlayer, UserProfile } from "./types/players";
import type { TablePosition } from "./types/table";
import { TABLE_POSITIONS } from "./types/table";
import { cx } from "./utils/cx";
import { sortHandBySuitColor } from "./utils/cards";

type View = "lobby" | "game";

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

type SuitSymbol = Suit;
const SUIT_SYMBOLS: SuitSymbol[] = ["♠", "♥", "♦", "♣"];
const PHASE_LABELS: Record<string, string> = {
  ChoosingTrumpFirstRound: "Prise · 1ᵉʳ tour",
  ChoosingTrumpSecondRound: "Prise · 2ᵉ tour",
  PlayingTricks: "Pli en cours",
  Finished: "Donne terminée",
};

const REACTION_EMOJIS = ["😄", "😡", "😢", "😎", "🤔", "🎉"] as const;

interface HallOfFameEntry {
  name: string;
  winrate: number;
  games: number;
  avatarUrl: string | null;
}

const PLACEHOLDER_HALL_OF_FAME: HallOfFameEntry[] = [
  {
    name: "Lucie “Belotista”",
    winrate: 82,
    games: 310,
    avatarUrl: null,
  },
  {
    name: "Jules “Atout Roi”",
    winrate: 78,
    games: 420,
    avatarUrl: null,
  },
  {
    name: "Maya “Cut Master”",
    winrate: 75,
    games: 365,
    avatarUrl: null,
  },
  {
    name: "Noé “Capot”",
    winrate: 71,
    games: 290,
    avatarUrl: null,
  },
];

const DEFAULT_GUEST_AVATAR =
  "data:image/svg+xml;base64,PHN2ZyB2aWV3Qm94PSIwIDAgMTI4IDEyOCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwIiB5MT0iMCIgeDI9IjEiIHkyPSIxIj48c3RvcCBzdG9wLWNvbG9yPSIjMzhiZGY4Ii8+PHN0b3Agb2Zmc2V0PSIxIiBzdG9wLWNvbG9yPSIjMTBiOTgxIi8+PC9saW5lYXJHcmFkaWVudD48L2RlZnM+PGNpcmNsZSBjeD0iNjQiIGN5PSI2NCIgcj0iNjAiIGZpbGw9InVybCgjZykiLz48cGF0aCBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9Ii44NSIgZD0iTTY0IDM0Yy0xMy4yIDAtMjQgMTAuOC0yNCAyNHMxMC44IDI0IDI0IDI0IDI0LTEwLjggMjQtMjQtMTAuOC0yNC0yNC0yNHptMCA1NmMtMTkgMC0zNS4zIDEwLjktNDMuOCAyNS43IDEyIDcuOCAyNy4zIDEyLjMgNDMuOCAxMi4zczMxLjgtNC41IDQzLjgtMTIuM0M5OS4zIDEwMC45IDgzIDkwIDY0IDkweiIvPjwvc3ZnPg==";

// message pour choose_trump
type ChooseTrumpPayloadWS =
  | { action: "take"; suit?: SuitSymbol }
  | { action: "pass" };

type ChooseTrumpMessageWS = {
  type: "choose_trump";
  payload: ChooseTrumpPayloadWS;
};

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
  const dealTimeoutsRef = useRef<number[]>([]);
  const incomingCardsRef = useRef(0);
  const team0BarRef = useRef<HTMLDivElement>(null);
  const team1BarRef = useRef<HTMLDivElement>(null);
  const team0ScoreRef = useRef<HTMLSpanElement>(null);
  const team1ScoreRef = useRef<HTMLSpanElement>(null);
  const dealScore0Ref = useRef<HTMLParagraphElement>(null);
  const dealScore1Ref = useRef<HTMLParagraphElement>(null);
  const playerHandRef = useRef<HTMLDivElement>(null);
  const turnBadgeRef = useRef<HTMLSpanElement>(null);

  const cancelDealAnimation = useCallback(() => {
    dealTimeoutsRef.current.forEach((timeoutId) => {
      clearTimeout(timeoutId);
    });
    dealTimeoutsRef.current = [];
    incomingCardsRef.current = 0;
  }, []);

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
  const [profileForm, setProfileForm] = useState({ username: "" });
  const [profileSaving, setProfileSaving] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const isGuestProfile = profile?.isGuest ?? false;
  const profileId = profile?.id ?? null;
  const profileWinsValue = profile?.wins ?? 0;
  const profileGamesValue = profile?.games ?? 0;
  const profileUsername = profile?.username ?? "";
  const profileAvatarUrl = profile?.avatar_url ?? null;
  const hasProfile = Boolean(profile);
  const [hallOfFame, setHallOfFame] = useState<HallOfFameEntry[]>(PLACEHOLDER_HALL_OF_FAME);

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
    if (!profile || !roomCode) return;
    const hasAccessToken = Boolean(session?.access_token);
    const isGuestProfile = Boolean(profile.isGuest);
    if (!hasAccessToken && !isGuestProfile) return;
    setNickname(profile.username);
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

    if (!hasProfile) {
      setWsError("Profil manquant.");
      return;
    }

    const accessToken = session?.access_token ?? null;

    if (!accessToken && !isGuestProfile) {
      setWsError("Session Supabase manquante.");
      return;
    }

    setWsStatus("connecting");
    setWsError(null);

    const ws = new WebSocket(config.wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setWsStatus("connected");
      const joinPayload: {
        roomCode: string;
        nickname: string;
        accessToken?: string;
        guest?: { id: string; username: string; avatarUrl?: string | null };
      } = {
        roomCode,
        nickname,
      };
      if (accessToken) {
        joinPayload.accessToken = accessToken;
      }
      if (isGuestProfile && profileId) {
        joinPayload.guest = {
          id: profileId,
          username: profileUsername,
          avatarUrl: profileAvatarUrl ?? DEFAULT_GUEST_AVATAR,
        };
      }
      ws.send(
        JSON.stringify({
          type: "join_room",
          payload: joinPayload,
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
  }, [
    view,
    roomCode,
    nickname,
    session?.access_token,
    profileId,
    profileUsername,
    profileAvatarUrl,
    isGuestProfile,
    hasProfile,
  ]);

  const handleStartGame = () => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "start_game" }));
  };

  const handleSignOut = async () => {
    if (profile?.isGuest) {
      setProfile(null);
      setProfileForm({ username: "" });
      setNickname("");
      setRoomCode("");
      setView("lobby");
      setShowProfileModal(false);
      return;
    }
    if (!supabase) return;
    await supabase.auth.signOut();
    setRoomCode("");
    setView("lobby");
  };

  const handleProfileFieldChange = (field: "username", value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleContinueAsGuest = () => {
    const guestId = `guest-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2, 6)}`;
    const guestName = `Invité-${Math.floor(Math.random() * 9000 + 1000)}`;
    const guestProfile: UserProfile = {
      id: guestId,
      username: guestName,
      avatar_url: DEFAULT_GUEST_AVATAR,
      wins: 0,
      games: 0,
      isGuest: true,
    };
    setProfile(guestProfile);
    setProfileForm({
      username: guestName,
    });
    setNickname(guestName);
    setView("lobby");
    setAuthError(null);
  };

  const handleSaveProfile = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const username = profileForm.username.trim();
    if (!username) return;
    if (profile?.isGuest) {
      setProfile((prev) =>
        prev
          ? {
              ...prev,
              username,
            }
          : prev
      );
      setNickname(username);
      setShowProfileModal(false);
      setAuthError(null);
      return;
    }
    if (!supabase || !session) return;
    setProfileSaving(true);
    const { error } = await supabase
      .from("profiles")
      .upsert({
        id: session.user.id,
        username,
        avatar_url: profile?.avatar_url ?? null,
      });
    setProfileSaving(false);
    if (error) {
      setAuthError(error.message);
      return;
    }
    const updated: UserProfile = {
      id: session.user.id,
      username,
      avatar_url: profile?.avatar_url ?? null,
      wins: profile?.wins ?? 0,
      games: profile?.games ?? 0,
      isGuest: false,
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
    if (profile?.isGuest) {
      setAuthError("Les invités ne peuvent pas changer d'avatar.");
      return;
    }
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
    if (!gameState || mySeat === null || isSorting) return;

    setIsSorting(true);
    setDisplayHand((current) =>
      sortHandBySuitColor(current, gameState.trumpSuit ?? null)
    );
    setTimeout(() => setIsSorting(false), 450);
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
  const currentDealScore0 = gameState?.scores.team0 ?? 0;
  const currentDealScore1 = gameState?.scores.team1 ?? 0;
  const previousMatchTeam0 = useRef(matchTeam0);
  const previousMatchTeam1 = useRef(matchTeam1);
  const previousDealScore0 = useRef(currentDealScore0);
  const previousDealScore1 = useRef(currentDealScore1);
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

  useEffect(() => {
    if (!playerHandRef.current) return;
    const cards = playerHandRef.current.querySelectorAll(".player-hand-card");
    if (!cards.length) return;
    anime.remove(cards);
    if (isSorting) {
      anime.remove(cards);
      anime({
        targets: cards,
        delay: anime.stagger(30),
        duration: 360,
        easing: "easeOutCubic",
        translateY: [
          { value: -8 },
          { value: 0 },
        ],
        scale: [
          { value: 1.03 },
          { value: 1 },
        ],
      });
      return;
    }

    if (incomingCardsRef.current > 0) {
      const newestCard = cards[cards.length - 1];
      if (newestCard) {
        anime.remove(newestCard);
        anime({
          targets: newestCard,
          translateY: [-18, 0],
          easing: "easeOutQuad",
          duration: 360,
        });
      }
      incomingCardsRef.current = Math.max(0, incomingCardsRef.current - 1);
    }
  }, [displayHand, isSorting]);

  useEffect(() => {
    if (!turnBadgeRef.current) return;
    const badge = turnBadgeRef.current;
    anime.remove(badge);
    if (!isMyTurn) return;
    const animation = anime({
      targets: badge,
      scale: [0.99, 1.02],
      boxShadow: [
        "0px 0px 4px rgba(16,185,129,0.12)",
        "0px 0px 10px rgba(16,185,129,0.22)",
      ],
      easing: "easeInOutSine",
      duration: 1500,
      direction: "alternate",
      loop: true,
    });
    return () => {
      animation.pause();
    };
  }, [isMyTurn]);

  useEffect(() => {
    if (!team0BarRef.current) return;
    anime.remove(team0BarRef.current);
    anime({
      targets: team0BarRef.current,
      width: `${team0Progress}%`,
      duration: 700,
      easing: "easeOutCubic",
    });
  }, [team0Progress]);

  useEffect(() => {
    if (!team1BarRef.current) return;
    anime.remove(team1BarRef.current);
    anime({
      targets: team1BarRef.current,
      width: `${team1Progress}%`,
      duration: 700,
      easing: "easeOutCubic",
    });
  }, [team1Progress]);

  useEffect(() => {
    if (!team0ScoreRef.current) return;
    const start = previousMatchTeam0.current ?? 0;
    previousMatchTeam0.current = matchTeam0;
    anime.remove(team0ScoreRef.current);
    anime({
      targets: team0ScoreRef.current,
      innerHTML: [start, matchTeam0],
      round: 1,
      duration: 520,
      easing: "easeOutExpo",
    });
  }, [matchTeam0]);

  useEffect(() => {
    if (!team1ScoreRef.current) return;
    const start = previousMatchTeam1.current ?? 0;
    previousMatchTeam1.current = matchTeam1;
    anime.remove(team1ScoreRef.current);
    anime({
      targets: team1ScoreRef.current,
      innerHTML: [start, matchTeam1],
      round: 1,
      duration: 520,
      easing: "easeOutExpo",
    });
  }, [matchTeam1]);

  useEffect(() => {
    if (!dealScore0Ref.current) return;
    const start = previousDealScore0.current ?? 0;
    previousDealScore0.current = currentDealScore0;
    anime.remove(dealScore0Ref.current);
    anime({
      targets: dealScore0Ref.current,
      innerHTML: [start, currentDealScore0],
      round: 1,
      duration: 420,
      easing: "easeOutQuad",
    });
  }, [currentDealScore0]);

  useEffect(() => {
    if (!dealScore1Ref.current) return;
    const start = previousDealScore1.current ?? 0;
    previousDealScore1.current = currentDealScore1;
    anime.remove(dealScore1Ref.current);
    anime({
      targets: dealScore1Ref.current,
      innerHTML: [start, currentDealScore1],
      round: 1,
      duration: 420,
      easing: "easeOutQuad",
    });
  }, [currentDealScore1]);

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
                <p ref={dealScore0Ref} className="text-2xl">
                  {currentDealScore0}
                </p>
                <p className="text-[0.6rem] text-emerald-100/70">pts</p>
              </div>
              <div className="rounded-lg bg-slate-950/40 px-2 py-2 text-center shadow-inner shadow-black/40">
                <p className="text-[0.6rem] uppercase tracking-[0.35em] text-emerald-200">
                  {shortSeatLabel(1)}·{shortSeatLabel(3)}
                </p>
                <p ref={dealScore1Ref} className="text-2xl">
                  {currentDealScore1}
                </p>
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
                    <span ref={team0ScoreRef}>{matchTeam0}</span> pts
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-800/70">
                  <div
                    ref={team0BarRef}
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
                    style={{ width: 0 }}
                  />
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[0.65rem] text-amber-100/80">
                  <span>
                    {shortSeatLabel(1)} &amp; {shortSeatLabel(3)}
                  </span>
                  <span className="text-base font-semibold text-white">
                    <span ref={team1ScoreRef}>{matchTeam1}</span> pts
                  </span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-slate-800/70">
                  <div
                    ref={team1BarRef}
                    className="h-full rounded-full bg-gradient-to-r from-amber-300 to-amber-500"
                    style={{ width: 0 }}
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
    cancelDealAnimation();

    if (!gameState || mySeat === null) {
      setDisplayHand([]);
      prevHandRef.current = [];
      return;
    }

    const full = gameState.hands[String(mySeat)] || [];
    const prev = prevHandRef.current;

    const isNewDeal =
      prev.length === 0 &&
      full.length === 5 &&
      gameState.phase === "ChoosingTrumpFirstRound";

    const isCompletingHand =
      prev.length === 5 &&
      full.length === 8 &&
      gameState.phase === "PlayingTricks";

    const scheduleCards = (cards: Card[], reset = false) => {
      if (!cards.length) return;
      if (reset) {
        setDisplayHand([]);
      }
      incomingCardsRef.current += cards.length;
      cards.forEach((card, idx) => {
        const timeoutId = window.setTimeout(() => {
          setDisplayHand((current) => [...current, card]);
        }, idx * 220);
        dealTimeoutsRef.current.push(timeoutId);
      });
    };

    if (isNewDeal) {
      scheduleCards(full, true);
    } else if (isCompletingHand) {
      const newCards = full.slice(prev.length);
      scheduleCards(newCards);
    } else if (full.length !== prev.length) {
      setDisplayHand(full);
    }

    prevHandRef.current = full;
    return () => {
      cancelDealAnimation();
    };
  }, [gameState, mySeat, cancelDealAnimation]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!supabaseClient) return;

    if (!session) {
      if (!isGuestProfile) {
        setProfile(null);
        setProfileForm({ username: "" });
        setNickname("");
      }
      setProfileLoading(false);
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
            isGuest: false,
          };
          setProfile(normalized);
          setProfileForm({
            username: normalized.username,
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
  }, [session, isGuestProfile]);

  useEffect(() => {
    if (!profileId || isGuestProfile) return;
    const selfPlayer = roomPlayers.find(
      (player) => player.userId && player.userId === profileId && player.stats
    );
    if (selfPlayer?.stats) {
      const { wins, games } = selfPlayer.stats;
      if (wins !== profileWinsValue || games !== profileGamesValue) {
        setProfile((prev) => (prev ? { ...prev, wins, games } : prev));
      }
    }
  }, [roomPlayers, profileId, profileWinsValue, profileGamesValue, isGuestProfile]);

  useEffect(() => {
    const supabaseClient = supabase;
    if (!supabaseClient || view !== "lobby") return;
    let active = true;
    const fetchHallOfFame = async () => {
      const { data, error } = await supabaseClient
        .from("profiles")
        .select("id, username, wins, games, avatar_url")
        .order("wins", { ascending: false })
        .limit(4);
      if (!active) return;
      if (error || !data) {
        return;
      }
      const mapped = data
        .map((player) => {
          const wins = player.wins ?? 0;
          const games = player.games ?? 0;
          const winrate = games > 0 ? Math.round((wins / games) * 100) : 0;
          return {
            name: player.username ?? `Joueur-${player.id.slice(0, 4)}`,
            winrate,
            games,
            avatarUrl: player.avatar_url ?? null,
          };
        })
        .filter((entry) => entry.games > 0 || entry.winrate > 0);
      if (mapped.length > 0) {
        setHallOfFame(mapped);
      }
    };
    fetchHallOfFame();
    return () => {
      active = false;
    };
  }, [view]);

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

  if (!session && !profile?.isGuest) {
    return (
      <AuthScreen
        mode={authMode}
        onToggleMode={setAuthMode}
        error={authError}
        onError={setAuthError}
        onContinueAsGuest={handleContinueAsGuest}
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

  const canEditProfile = Boolean(profile && !profile.isGuest);
  const editableProfile = canEditProfile ? profile : null;

  const profileQuickAccess =
    editableProfile &&
    (
      <button
        type="button"
        onClick={() => setShowProfileModal(true)}
        className="fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full border border-cyan-300/50 bg-slate-950/80 px-4 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-100 shadow-[0_25px_50px_-12px_rgba(15,23,42,0.9)] backdrop-blur-sm transition hover:border-cyan-200 hover:text-cyan-50"
      >
        <AvatarCircle avatarUrl={editableProfile.avatar_url} fallback={editableProfile.username} size="sm" />
        Profil
      </button>
    );

  const profileModal =
    editableProfile &&
    showProfileModal && (
      <ProfileModal
        values={profileForm}
        onChange={handleProfileFieldChange}
        onClose={() => setShowProfileModal(false)}
        onSubmit={handleSaveProfile}
        saving={profileSaving}
        onUploadAvatar={handleAvatarUpload}
        uploadingAvatar={avatarUploading}
        avatarUrl={editableProfile.avatar_url}
      />
    );

  if (view === "lobby") {
    return (
      <>
        <div className="relative min-h-screen overflow-hidden bg-gradient-to-br from-slate-950 via-[#021324] to-slate-950 px-6 py-12 font-sans text-slate-100">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-[radial-gradient(circle_at_top,_rgba(94,234,212,0.25),_transparent_60%)]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-[radial-gradient(circle_at_bottom,_rgba(14,165,233,0.2),_transparent_60%)]" />
          <div
            className="pointer-events-none absolute left-10 top-20 hidden rotate-[-15deg] opacity-50 lg:block"
            style={{ filter: "drop-shadow(0 25px 40px rgba(14,165,233,0.25))" }}
          >
            <img src={CARD_OVERLAY_SVG} alt="" className="h-36 w-auto" />
          </div>
          <div
            className="pointer-events-none absolute bottom-14 right-12 hidden rotate-[10deg] opacity-60 lg:block"
            style={{ filter: "drop-shadow(0 35px 45px rgba(16,185,129,0.3))" }}
          >
            <img src={CARD_OVERLAY_SVG} alt="" className="h-32 w-auto" />
          </div>
          <div className="relative mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-6xl flex-col justify-center">
            <div className="mb-8 text-center">
              <p className="text-xs uppercase tracking-[0.6em] text-emerald-200/70">Belote Live</p>
              <h2 className="mt-2 text-4xl font-semibold text-white">Choisissez votre table ou brillez au Hall of Fame</h2>
              <p className="mt-3 text-sm text-slate-300">
                Créez une salle privée, entrez un code partagé ou admirez les légendes de Belote Live.
              </p>
            </div>
            <div className="grid gap-8 lg:grid-cols-[1.1fr_0.9fr]">
              <div className="rounded-[2.5rem] border border-slate-800/70 bg-slate-950/85 p-10 shadow-[0_35px_80px_-45px_rgba(0,0,0,1)] backdrop-blur">
                <div className="flex flex-wrap items-center justify-between gap-6">
                  <div>
                    <p className="text-xs uppercase tracking-[0.5em] text-cyan-200/70">Table privée</p>
                    <h3 className="mt-2 text-3xl font-semibold text-white">Créez ou rejoignez une partie</h3>
                    <p className="text-sm text-slate-400">
                      Choisissez un code unique, partagez-le et lancez la donne avec votre crew.
                    </p>
                  </div>
                  <span className="rounded-3xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.5em] text-emerald-200">
                    4 joueurs
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCreateRoom}
                  className="mt-8 flex w-full items-center justify-between rounded-2xl border border-cyan-300/50 bg-gradient-to-r from-cyan-500/25 via-emerald-400/20 to-sky-500/30 px-5 py-4 text-base font-semibold text-cyan-100 transition hover:border-cyan-200 hover:shadow-[0_25px_45px_-25px_rgba(6,182,212,0.8)]"
                >
                  <span>Générer un code aléatoire</span>
                  <span className="text-lg">🔁</span>
                </button>

                <form onSubmit={handleJoin} className="mt-10 flex flex-col gap-6">
                  <div className="flex items-center gap-4 rounded-2xl border border-slate-700 bg-slate-900/70 px-5 py-4 shadow-inner shadow-black/20">
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

                  <label className="flex flex-col gap-2 text-sm text-slate-200">
                    Code de table
                    <input
                      id="roomCode"
                      value={roomCode}
                      onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                      placeholder="Ex : TABLE42"
                      className="w-full rounded-2xl border border-slate-700 bg-slate-900/70 px-5 py-4 text-base tracking-[0.25em] text-white outline-none transition placeholder:text-slate-500 focus:border-cyan-300 focus:ring-1 focus:ring-cyan-300/40"
                    />
                  </label>

                  <button
                    type="submit"
                    className="mt-2 rounded-2xl bg-gradient-to-r from-emerald-400 via-green-400 to-emerald-300 px-5 py-4 text-base font-semibold uppercase tracking-[0.35em] text-slate-900 transition hover:brightness-110"
                  >
                    Rejoindre la table
                  </button>
                </form>
              </div>

              <div className="rounded-[2.5rem] border border-emerald-400/20 bg-gradient-to-br from-emerald-400/10 via-transparent to-cyan-400/5 p-8 shadow-[0_35px_70px_-45px_rgba(16,185,129,0.6)] backdrop-blur">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.6em] text-emerald-200/70">Hall of Fame</p>
                    <h3 className="mt-2 text-2xl font-semibold text-white">Les légendes du moment</h3>
                    <p className="text-sm text-emerald-50/80">
                      Winrate et parties gagnées.
                    </p>
                  </div>
                  <span className="text-3xl">🏆</span>
                </div>
                <div className="mt-6 space-y-4">
                  {hallOfFame.map((player, index) => (
                    <div
                      key={`${player.name}-${index}`}
                      className="group flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white shadow-[0_20px_45px_-35px_rgba(8,145,178,1)] transition hover:border-white/30"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-400/20 text-lg font-semibold text-emerald-200">
                          #{index + 1}
                        </div>
                        <AvatarCircle avatarUrl={player.avatarUrl} fallback={player.name} size="sm" />
                        <div>
                          <p className="text-base font-semibold">{player.name}</p>
                          <p className="text-xs text-emerald-100/80">
                            {player.winrate}% WR · {player.games} parties
                          </p>
                        </div>
                      </div>
                      <span className="text-xs uppercase tracking-[0.45em] text-emerald-200">
                        Star
                      </span>
                    </div>
                  ))}
                </div>
                <p className="mt-6 text-center text-xs uppercase tracking-[0.4em] text-emerald-50/70">
                  Pas mal, non ?
                </p>
              </div>
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
    <div className="relative flex min-h-screen flex-col overflow-hidden bg-game px-3 pb-3 pt-4 font-sans text-slate-100 lg:h-screen">
      <div
        className="pointer-events-none absolute left-6 top-6 hidden rotate-[-10deg] opacity-60 xl:block"
        style={{ filter: "drop-shadow(0 30px 50px rgba(6,182,212,0.3))" }}
      >
        <img src={CARD_OVERLAY_SVG} alt="" className="h-32 w-auto" />
      </div>
      <div
        className="pointer-events-none absolute bottom-4 right-10 hidden rotate-[8deg] opacity-60 xl:block"
        style={{ filter: "drop-shadow(0 35px 55px rgba(16,185,129,0.35))" }}
      >
        <img src={CARD_OVERLAY_SVG} alt="" className="h-30 w-auto" />
      </div>
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
            {canEditProfile ? (
              <button
                type="button"
                onClick={() => setShowProfileModal(true)}
                className="rounded-full border border-slate-600/60 px-3 py-1 text-xs text-slate-200 transition hover:border-slate-300"
              >
                Profil
              </button>
            ) : (
              <span className="rounded-full border border-cyan-400/40 px-3 py-1 text-[0.6rem] uppercase tracking-[0.35em] text-cyan-200">
                Invité
              </span>
            )}
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
          {gameState && (
            <div className="pointer-events-auto absolute bottom-4 left-4 z-30">
              <div className="flex flex-col gap-2 rounded-3xl border border-slate-600/40 bg-slate-950/85 px-4 py-3 shadow-[0_25px_60px_-35px_rgba(0,0,0,0.9)] backdrop-blur-sm">
                <p className="text-center text-[0.55rem] uppercase tracking-[0.35em] text-slate-500">
                  Actions
                </p>
                <div className="flex items-center gap-3">
                  {canAnnounceBelote && (
                    <div className="group relative">
                      <button
                        type="button"
                        onClick={handleAnnounceBelote}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-amber-200/60 bg-slate-900/70 text-amber-200 shadow-[0_12px_25px_-18px_rgba(245,158,11,0.7)] transition hover:bg-amber-400/10"
                        aria-label={beloteButtonLabel}
                      >
                        <Crown className="h-5 w-5" />
                      </button>
                      <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 rounded-xl bg-slate-900/90 px-2 py-1 text-[0.6rem] text-amber-100 opacity-0 transition duration-200 delay-200 group-hover:translate-y-0 group-hover:opacity-100">
                        Belote · Rebelote
                      </span>
                    </div>
                  )}
                  {showSortButton && (
                    <div className="group relative">
                      <button
                        type="button"
                        onClick={handleSortHand}
                        className="flex h-12 w-12 items-center justify-center rounded-2xl border border-cyan-200/60 bg-slate-900/80 text-cyan-200 shadow-[0_12px_25px_-18px_rgba(14,165,233,0.6)] transition hover:bg-cyan-400/10"
                        aria-label="Trier la main"
                      >
                        <Shuffle className="h-5 w-5" />
                      </button>
                      <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 rounded-xl bg-slate-900/90 px-2 py-1 text-[0.6rem] text-cyan-100 opacity-0 transition duration-200 delay-200 group-hover:translate-y-0 group-hover:opacity-100">
                        Ordonner
                      </span>
                    </div>
                  )}
                  <div className="group relative">
                    <button
                      type="button"
                      onClick={() => setShowReactionPicker((prev) => !prev)}
                      className={cx(
                        "flex h-12 w-12 items-center justify-center rounded-2xl border text-lg shadow-[0_12px_25px_-18px_rgba(139,92,246,0.6)] transition",
                        showReactionPicker
                          ? "border-violet-300 bg-violet-500/30 text-violet-50"
                          : "border-violet-300/70 bg-slate-900/70 text-violet-100 hover:bg-violet-400/10"
                      )}
                      aria-label="Réactions"
                    >
                      <Smile className="h-5 w-5" />
                    </button>
                    <span className="pointer-events-none absolute left-1/2 top-full mt-2 -translate-x-1/2 rounded-xl bg-slate-900/90 px-2 py-1 text-[0.6rem] text-violet-100 opacity-0 transition duration-200 delay-200 group-hover:translate-y-0 group-hover:opacity-100">
                      Réactions
                    </span>
                    {showReactionPicker && (
                      <div className="absolute bottom-full left-0 z-30 mb-3 w-48 rounded-3xl border border-violet-300/50 bg-slate-950/95 p-3 text-left shadow-[0_25px_60px_-30px_rgba(139,92,246,0.7)]">
                        <div className="grid grid-cols-3 gap-2">
                          {REACTION_EMOJIS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleSendReaction(emoji)}
                              className="flex aspect-square items-center justify-center rounded-2xl border border-slate-600/60 bg-slate-900/70 text-xl transition hover:border-violet-300"
                              aria-label={`Emoji ${emoji}`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
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
                    order={tc.order}
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
            <div className="mb-2 flex flex-wrap items-center justify-center gap-3 text-center text-sm font-semibold uppercase tracking-wide text-slate-200">
              <span className="text-base tracking-[0.35em]">Votre main</span>
              {isMyTurn && (
                <span
                  ref={turnBadgeRef}
                  className="inline-flex items-center gap-1 rounded-full border border-emerald-300/60 bg-emerald-500/20 px-3 py-1 text-xs font-bold tracking-[0.25em] text-emerald-100 shadow-[0_10px_25px_-15px_rgba(16,185,129,1)]"
                >
                  ▶ A VOUS DE JOUER
                </span>
              )}
              {gameState && gameState.phase === "Finished" && (
                <span className="text-amber-300 normal-case">— donne terminée</span>
              )}
            </div>

            <div ref={playerHandRef} className="relative mx-auto h-[9.5rem] w-full max-w-4xl">
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
                  ? `${baseTransform} translateY(-8px)`
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
                    className="player-hand-card absolute left-1/2 bottom-0 transform-gpu focus:outline-none"
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

export default App;
