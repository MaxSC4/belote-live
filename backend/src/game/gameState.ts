import { Card, DealState, Hand, PlayerId, Rank, Suit } from "./types";
import { dealCards } from "./beloteEngine";

export enum GamePhase {
    WaitingForPlayers = "WaitingForPlayers",
    ChoosingTrump = "ChoosingTrump",
    PlayingTricks = "PlayingTricks",
    Finished = "Finished",
}

export interface TrickCard {
    player: PlayerId;
    card: Card;
}

export interface Trick {
    cards: TrickCard[];
    leader: PlayerId;
    winner?: PlayerId;
}

export interface GameState {
    phase: GamePhase;
    dealer: PlayerId;
    currentPlayer: PlayerId;
    trumpSuit?: Suit;
    hands: Record<PlayerId, Hand>;
    trick: Trick | null;
    scores: {
        team0: number; // joueurs 0 & 2
        team1: number; // joueurs 1 & 3
    };
}

/**
 * Crée un nouvel état de partie (une donne) :
 * - distribue les cartes
 * - choisit un atout aléatoire
 * - phase = PlayingTricks (on fera la phase d'atout plus tard)
 * - joueur suivant le donneur commence
 */
export function startNewGame(dealer: PlayerId): GameState {
    const deal: DealState = dealCards(dealer);
    const firstPlayer: PlayerId = ((dealer + 1) % 4) as PlayerId;

    const allSuits: Suit[] = [
        Suit.Clubs,
        Suit.Diamonds,
        Suit.Hearts,
        Suit.Spades,
    ];
    const trumpSuit = allSuits[Math.floor(Math.random() * allSuits.length)];

    return {
        phase: GamePhase.PlayingTricks,
        dealer: deal.dealer,
        currentPlayer: firstPlayer,
        trumpSuit,
        hands: deal.hands,
        trick: null,
        scores: {
        team0: 0,
        team1: 0,
        },
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
        const challengerStrength = rankStrength(challenger.card.rank, sameTrumpFlag);

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
    if (!state.trick || state.trick.cards.length === 0 || state.trick.cards.length === 4) {
        return null;
    }

    // Couleur demandée = couleur de la première carte du pli
    const leadSuit = state.trick.cards[0].card.suit;
    const hasLeadSuit = hand.some((c) => c.suit === leadSuit);

    if (hasLeadSuit && card.suit !== leadSuit) {
        return "Vous devez fournir à la couleur.";
    }

    // Plus tard : ajouter les règles sur l'atout, couper, surcouper, etc.
    return null;
}

/**
 * Joue une carte pour un joueur donné.
 * Supposé : validatePlay a été appelée avant.
 */
export function playCard(state: GameState, player: PlayerId, card: Card): void {
    if (state.phase !== GamePhase.PlayingTricks) {
        throw new Error("On ne peut jouer une carte que pendant la phase des plis.");
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
    const ALL_PLAYERS: PlayerId[] = [0, 1, 2, 3];

    const allHandsEmpty = ALL_PLAYERS.every(
        (pid) => state.hands[pid].length === 0
    );

    if (allHandsEmpty) {
        // Bonus du dernier pli : 10 points
        state.scores[winnerTeam] += 10;
        state.phase = GamePhase.Finished;
    }
}
