import { Card, Hand, PlayerId, Rank, Suit } from "./types";

// ---------- Phases de jeu ----------

export enum GamePhase {
    WaitingForPlayers = "WaitingForPlayers",

    // Phase d'atout
    ChoosingTrumpFirstRound = "ChoosingTrumpFirstRound",
    ChoosingTrumpSecondRound = "ChoosingTrumpSecondRound",

    // Après choix d'atout + 2e distribution
    PlayingTricks = "PlayingTricks",

    Finished = "Finished",
}

// ---------- Pli ----------

export interface TrickCard {
    player: PlayerId;
    card: Card;
}

export interface Trick {
    cards: TrickCard[];
    leader: PlayerId;
    winner?: PlayerId;
}

// ---------- État global de la donne ----------

export interface GameState {
    phase: GamePhase;
    dealer: PlayerId;
    currentPlayer: PlayerId;

    // Distribution / atout
    deck: Card[];                  // cartes restantes dans le paquet
    hands: Record<PlayerId, Hand>;
    turnedCard: Card | null;       // carte retournée au milieu
    proposedTrump: Suit | null;    // couleur de la retournée
    trumpSuit?: Suit;              // atout choisi
    trumpChooser?: PlayerId;       // preneur
    biddingPlayer: PlayerId | null;   // joueur qui parle
    passesInCurrentRound: number;     // 0..4

    // Pli en cours
    trick: Trick | null;

    // Scores de la donne
    scores: {
        team0: number; // joueurs 0 & 2
        team1: number; // joueurs 1 & 3
    };
}

// ---------- Création du paquet / helpers généraux ----------

const ALL_PLAYERS: PlayerId[] = [0, 1, 2, 3];

const ALL_SUITS: Suit[] = [
    Suit.Clubs,
    Suit.Diamonds,
    Suit.Hearts,
    Suit.Spades,
];

const ALL_RANKS: Rank[] = [
    Rank.Seven,
    Rank.Eight,
    Rank.Nine,
    Rank.Jack,
    Rank.Queen,
    Rank.King,
    Rank.Ten,
    Rank.Ace,
];

function createDeck32(): Card[] {
    const deck: Card[] = [];
    for (const suit of ALL_SUITS) {
        for (const rank of ALL_RANKS) {
            deck.push({ suit, rank });
        }
    }
    return deck;
}

function shuffle<T>(array: T[]): T[] {
    const a = [...array];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// ---------- Démarrage d'une nouvelle donne ----------

/**
 * Crée un nouvel état de partie (une donne) :
 * - distribue 5 cartes à chaque joueur
 * - retourne une carte qui propose un atout
 * - phase = ChoosingTrumpFirstRound
 * - le joueur après le donneur commence à parler
 */
export function startNewGame(dealer: PlayerId): GameState {
    const deck = shuffle(createDeck32());

    const hands: Record<PlayerId, Hand> = {
        0: [],
        1: [],
        2: [],
        3: [],
    } as Record<PlayerId, Hand>;

    // 1er passage : 5 cartes par joueur (on ne s'embête pas à faire 3+2)
    for (const pid of ALL_PLAYERS) {
        hands[pid] = deck.splice(0, 5);
    }

    const turnedCard = deck.shift() || null;
    const proposedTrump = turnedCard ? turnedCard.suit : null;

    const firstToSpeak: PlayerId = ((dealer + 1) % 4) as PlayerId;

    return {
        phase: GamePhase.ChoosingTrumpFirstRound,
        dealer,
        currentPlayer: firstToSpeak,
        deck,
        hands,
        turnedCard,
        proposedTrump,
        trumpSuit: undefined,
        trumpChooser: undefined,
        biddingPlayer: firstToSpeak,
        passesInCurrentRound: 0,
        trick: null,
        scores: {
            team0: 0,
            team1: 0,
        },
    };
}

// ---------- Choix de l'atout (prise / passe) ----------

export type ChooseTrumpPayload =
    | { action: "take"; suit?: Suit } // 1er tour: suit ignoré; 2e tour: suit = couleur choisie (≠ proposedTrump)
    | { action: "pass" };

/**
 * Gère un choix d'atout (prendre/passer) pour un joueur.
 * Retourne un NOUVEL état (fonction pure).
 */
export function chooseTrump(
    state: GameState,
    player: PlayerId,
    payload: ChooseTrumpPayload
): GameState {
    if (
        state.phase !== GamePhase.ChoosingTrumpFirstRound &&
        state.phase !== GamePhase.ChoosingTrumpSecondRound
    ) {
        return state;
    }

    if (state.biddingPlayer !== player) {
        // Ce n'est pas à ce joueur de parler
        return state;
    }

    // --- CAS "PRENDRE" ---
    if (payload.action === "take") {
        let trumpSuit: Suit | undefined;

        if (state.phase === GamePhase.ChoosingTrumpFirstRound) {
            // 1er tour : atout = suit de la retournée
            trumpSuit = state.proposedTrump ?? undefined;
        } else {
            // 2e tour : le joueur choisit une couleur ≠ proposedTrump
            if (!payload.suit) return state;
            if (payload.suit === state.proposedTrump) return state;
            trumpSuit = payload.suit;
        }

        if (!trumpSuit) return state;

        // Le joueur prend -> on complète les mains et on passe en phase PlayingTricks
        let nextState: GameState = {
            ...state,
            trumpSuit,
            trumpChooser: player,
            biddingPlayer: null,
            passesInCurrentRound: 0,
        };

        nextState = dealSecondPass(nextState);

        return {
            ...nextState,
            phase: GamePhase.PlayingTricks,
            currentPlayer: player, // le preneur commence
            turnedCard: null,
            proposedTrump: null,
        };
    }

    // --- CAS "PASSER" ---
    const passes = state.passesInCurrentRound + 1;

    // 1er tour : si 4 passes -> 2e tour
    if (state.phase === GamePhase.ChoosingTrumpFirstRound) {
        if (passes >= 4) {
            return {
                ...state,
                phase: GamePhase.ChoosingTrumpSecondRound,
                biddingPlayer: ((state.dealer + 1) % 4) as PlayerId,
                passesInCurrentRound: 0,
            };
        }
    } else {
        // 2e tour : si 4 passes -> on redistribue une nouvelle donne
        if (passes >= 4) {
            // même donneur pour simplifier
            return startNewGame(state.dealer);
        }
    }

    const nextBiddingPlayer = ((player + 1) % 4) as PlayerId;
    return {
        ...state,
        biddingPlayer: nextBiddingPlayer,
        passesInCurrentRound: passes,
    };
}

/**
 * Complète les mains à 8 cartes après la prise.
 * On donne la retournée au preneur puis on complète tout le monde à 8.
 */
function dealSecondPass(state: GameState): GameState {
    const deck = [...state.deck];
    const hands: Record<PlayerId, Hand> = {
        0: [...state.hands[0]],
        1: [...state.hands[1]],
        2: [...state.hands[2]],
        3: [...state.hands[3]],
    } as Record<PlayerId, Hand>;

    // Donner la retournée au preneur (option simple)
    if (state.turnedCard && state.trumpChooser !== undefined) {
        hands[state.trumpChooser].push(state.turnedCard);
    }

    // Compléter toutes les mains à 8 cartes
    for (const pid of ALL_PLAYERS) {
        while (hands[pid].length < 8 && deck.length > 0) {
            hands[pid].push(deck.shift()!);
        }
    }

    return {
        ...state,
        deck,
        hands,
        turnedCard: null,
    };
}

// ---------- Helpers pour déterminer le gagnant d'un pli ----------

// Ordre de force des cartes (du plus faible au plus fort) pour la prise de pli
// Non-atout : 7 < 8 < 9 < J < Q < K < 10 < A
// Atout    : 7 < 8 < Q < K < 10 < A < 9 < J

const NON_TRUMP_ORDER: Rank[] = [
    Rank.Seven,
    Rank.Eight,
    Rank.Nine,
    Rank.Jack,
    Rank.Queen,
    Rank.King,
    Rank.Ten,
    Rank.Ace,
];

const TRUMP_ORDER: Rank[] = [
    Rank.Seven,
    Rank.Eight,
    Rank.Queen,
    Rank.King,
    Rank.Ten,
    Rank.Ace,
    Rank.Nine,
    Rank.Jack,
];

// Valeurs de points (sans belote/rebelote pour l'instant)
const NON_TRUMP_POINTS: Record<Rank, number> = {
    [Rank.Seven]: 0,
    [Rank.Eight]: 0,
    [Rank.Nine]: 0,
    [Rank.Jack]: 2,
    [Rank.Queen]: 3,
    [Rank.King]: 4,
    [Rank.Ten]: 10,
    [Rank.Ace]: 11,
};

const TRUMP_POINTS: Record<Rank, number> = {
    [Rank.Seven]: 0,
    [Rank.Eight]: 0,
    [Rank.Nine]: 14,
    [Rank.Jack]: 20,
    [Rank.Queen]: 3,
    [Rank.King]: 4,
    [Rank.Ten]: 10,
    [Rank.Ace]: 11,
};

function rankStrength(rank: Rank, trump: boolean): number {
    const order = trump ? TRUMP_ORDER : NON_TRUMP_ORDER;
    return order.indexOf(rank);
}

function isTrump(card: Card, trumpSuit?: Suit): boolean {
    return trumpSuit !== undefined && card.suit === trumpSuit;
}

function cardPoints(card: Card, trumpSuit?: Suit): number {
    const trump = isTrump(card, trumpSuit);
    return trump ? TRUMP_POINTS[card.rank] : NON_TRUMP_POINTS[card.rank];
}

function trickPoints(trick: Trick, trumpSuit?: Suit): number {
    return trick.cards.reduce(
        (sum, tc) => sum + cardPoints(tc.card, trumpSuit),
        0
    );
}

/**
 * Détermine le gagnant d'un pli selon :
 * - d'abord la présence d'atout
 * - sinon, la couleur demandée au début du pli
 * - en respectant l'ordre de force
 */
function computeTrickWinner(trick: Trick, trumpSuit?: Suit): PlayerId {
    if (trick.cards.length === 0) {
        throw new Error("Impossible de déterminer un gagnant sur un pli vide");
    }

    const leadSuit = trick.cards[0].card.suit;

    let winning = trick.cards[0];

    for (let i = 1; i < trick.cards.length; i++) {
        const challenger = trick.cards[i];

        const winningIsTrump = isTrump(winning.card, trumpSuit);
        const challengerIsTrump = isTrump(challenger.card, trumpSuit);

        if (winningIsTrump && !challengerIsTrump) {
            continue; // gagnant actuel reste
        }

        if (!winningIsTrump && challengerIsTrump) {
            winning = challenger;
            continue;
        }

        // Si aucun ou tous deux sont atout, on regarde la couleur demandée
        const winningFollowsLead = winning.card.suit === leadSuit;
        const challengerFollowsLead = challenger.card.suit === leadSuit;

        if (!winningFollowsLead && challengerFollowsLead) {
            winning = challenger;
            continue;
        }

        if (winningFollowsLead && !challengerFollowsLead) {
            continue;
        }

        // Les deux sont dans la même catégorie (tous les deux atout ou tous les deux couleur demandée)
        // -> compare la force
        const sameTrumpFlag = isTrump(winning.card, trumpSuit); // == challengerIsTrump
        const winningStrength = rankStrength(winning.card.rank, sameTrumpFlag);
        const challengerStrength = rankStrength(
            challenger.card.rank,
            sameTrumpFlag
        );

        if (challengerStrength > winningStrength) {
            winning = challenger;
        }
    }

    return winning.player;
}

/**
 * Valide si un joueur a le droit de jouer cette carte dans l'état actuel.
 * Retourne:
 *  - null si le coup est légal
 *  - un message d'erreur sinon
 *
 * Règles de belote implémentées :
 *  - on doit fournir à la couleur si possible
 *  - si on ne peut pas fournir :
 *      - on doit couper à l'atout si l'adversaire est maître et qu'on a de l'atout
 *      - si un atout est déjà posé par un adversaire, on doit surcouper si possible
 *      - si le partenaire est maître (avec ou sans atout), on peut se défausser
 */
export function validatePlay(
    state: GameState,
    player: PlayerId,
    card: Card
): string | null {
    if (state.phase !== GamePhase.PlayingTricks) {
        return "On ne peut jouer une carte que pendant la phase des plis.";
    }

    const hand = state.hands[player];
    if (!hand) {
        return "Main introuvable pour ce joueur.";
    }

    const inHand = hand.some(
        (c) => c.suit === card.suit && c.rank === card.rank
    );
    if (!inHand) {
        return "Cette carte n'est pas dans votre main.";
    }

    // S'il n'y a pas encore de pli ou qu'on redémarre un pli, aucune contrainte
    if (
        !state.trick ||
        state.trick.cards.length === 0 ||
        state.trick.cards.length === 4
    ) {
        return null;
    }

    const trick = state.trick;
    const trumpSuit = state.trumpSuit;

    // Pas d'atout défini (sécurité / debug) -> on applique uniquement "fournir à la couleur"
    const leadSuit = trick.cards[0].card.suit;
    const hasLeadSuit = hand.some((c) => c.suit === leadSuit);

    if (!trumpSuit) {
        if (hasLeadSuit && card.suit !== leadSuit) {
            return "Vous devez fournir à la couleur.";
        }
        return null;
    }

    const hasTrump = hand.some((c) => c.suit === trumpSuit);

    const isTeam0 = (p: PlayerId) => p === 0 || p === 2;
    const sameTeam = (a: PlayerId, b: PlayerId) =>
        (isTeam0(a) && isTeam0(b)) || (!isTeam0(a) && !isTeam0(b));

    // --- 1) Le joueur fournit la couleur demandée ---
    if (card.suit === leadSuit) {
        // Cas simple : couleur demandée ≠ atout
        if (leadSuit !== trumpSuit) {
            return null;
        }

        // Cas particulier : la couleur demandée est l'atout -> vérifier la surcoupe
        const trumpCardsInTrick = trick.cards.filter(
            (tc) => tc.card.suit === trumpSuit
        );

        if (trumpCardsInTrick.length === 0) {
            // Premier atout joué dans le pli -> pas d'obligation de surcouper
            return null;
        }

        // Atouts déjà présents dans le pli -> on peut être obligé de surcouper
        const highestTrumpInTrick = trumpCardsInTrick.reduce((best, tc) =>
            rankStrength(tc.card.rank, true) >
            rankStrength(best.card.rank, true)
                ? tc
                : best
        );

        const currentWinner = computeTrickWinner(trick, trumpSuit);
        const winnerIsPartner = sameTeam(currentWinner, player);

        if (winnerIsPartner) {
            // On n'est pas obligé de surcouper le partenaire
            return null;
        }

        const highestStrength = rankStrength(
            highestTrumpInTrick.card.rank,
            true
        );
        const canOvertrump = hand.some(
            (c) =>
                c.suit === trumpSuit &&
                rankStrength(c.rank, true) > highestStrength
        );
        const myStrength = rankStrength(card.rank, true);

        if (canOvertrump && myStrength <= highestStrength) {
            return "Vous devez surcouper à l'atout si possible.";
        }

        return null;
    }

    // --- 2) Le joueur NE fournit PAS la couleur demandée ---
    if (hasLeadSuit) {
        // Il possède de la couleur demandée mais ne la joue pas -> interdit
        return "Vous devez fournir à la couleur.";
    }

    // À partir d'ici, le joueur ne possède pas la couleur demandée
    // -> on regarde l'atout
    if (!hasTrump) {
        // Pas d'atout -> défausse libre
        return null;
    }

    // Il possède de l'atout
    const trumpCardsInTrick = trick.cards.filter(
        (tc) => tc.card.suit === trumpSuit
    );
    const anyTrumpInTrick = trumpCardsInTrick.length > 0;

    const currentWinner = computeTrickWinner(trick, trumpSuit);
    const winnerIsPartner = sameTeam(currentWinner, player);

    // --- 2.a) Aucun atout encore joué dans le pli ---
    if (!anyTrumpInTrick) {
        if (winnerIsPartner) {
            // Partenaire maître (sans atout) -> on peut se défausser
            // Le joueur est autorisé à défausser OU couper volontairement
            return null;
        } else {
            // Adversaire maître -> on doit couper
            if (card.suit !== trumpSuit) {
                return "Vous devez couper à l'atout.";
            }
            return null;
        }
    }

    // --- 2.b) Au moins un atout déjà joué ---
    const highestTrumpInTrick = trumpCardsInTrick.reduce((best, tc) =>
        rankStrength(tc.card.rank, true) > rankStrength(best.card.rank, true)
            ? tc
            : best
    );
    const highestStrength = rankStrength(
        highestTrumpInTrick.card.rank,
        true
    );
    const highestIsPartner = sameTeam(highestTrumpInTrick.player, player);

    if (highestIsPartner) {
        // Le partenaire a déjà coupé et reste maître -> pas obligé de surcouper
        // Le joueur peut se défausser même s'il a de l'atout
        return null;
    }

    // Atout maître chez l'adversaire
    const canOvertrump = hand.some(
        (c) =>
            c.suit === trumpSuit &&
            rankStrength(c.rank, true) > highestStrength
    );

    if (canOvertrump) {
        // On doit surcouper
        if (card.suit !== trumpSuit) {
            return "Vous devez surcouper à l'atout.";
        }
        const myStrength = rankStrength(card.rank, true);
        if (myStrength <= highestStrength) {
            return "Vous devez surcouper à l'atout avec un atout plus fort.";
        }
        return null;
    }

    // On ne peut pas surcouper mais on a de l'atout :
    // -> on doit quand même mettre de l'atout plutôt que défausser
    if (card.suit !== trumpSuit) {
        return "Vous devez couper à l'atout si vous ne pouvez pas fournir.";
    }

    return null;
}


/**
 * Joue une carte pour un joueur donné.
 * Supposé : validatePlay a été appelée avant.
 */
export function playCard(state: GameState, player: PlayerId, card: Card): void {
    if (state.phase !== GamePhase.PlayingTricks) {
        throw new Error(
            "On ne peut jouer une carte que pendant la phase des plis."
        );
    }

    const hand = state.hands[player];
    const index = hand.findIndex(
        (c) => c.suit === card.suit && c.rank === card.rank
    );

    if (index === -1) {
        throw new Error("Cette carte n'est pas dans la main du joueur.");
    }

    // Retirer la carte de la main
    const [playedCard] = hand.splice(index, 1);

    // Si le pli précédent est terminé (4 cartes), on démarre un nouveau pli
    if (!state.trick || state.trick.cards.length === 4) {
        state.trick = {
            cards: [],
            leader: player,
            winner: undefined,
        };
    }

    state.trick.cards.push({
        player,
        card: playedCard,
    });

    const cardsInTrick = state.trick.cards.length;

    if (cardsInTrick < 4) {
        // On passe au joueur suivant
        state.currentPlayer = ((player + 1) % 4) as PlayerId;
        return;
    }

    // Pli complet -> déterminer le gagnant
    const winner = computeTrickWinner(state.trick, state.trumpSuit);
    state.trick.winner = winner;
    state.currentPlayer = winner as PlayerId;

    // Attribution des points du pli
    const points = trickPoints(state.trick, state.trumpSuit);
    const winnerTeam = winner === 0 || winner === 2 ? "team0" : "team1";
    state.scores[winnerTeam] += points;

    // Vérifier si toutes les cartes sont jouées (fin de donne)
    const allHandsEmpty = ALL_PLAYERS.every(
        (pid) => state.hands[pid].length === 0
    );

    if (allHandsEmpty) {
        // Bonus du dernier pli : 10 points
        state.scores[winnerTeam] += 10;
        state.phase = GamePhase.Finished;
    }
}