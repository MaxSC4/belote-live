import { Card, DealState, PlayerId, Rank, Suit } from "./types";

// 32 cartes : 4 couleurs * 8 valeurs
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
    Rank.Ten,
    Rank.Jack,
    Rank.Queen,
    Rank.King,
    Rank.Ace,
];

export function createDeck(): Card[] {
    const deck: Card[] = [];
    for (const suit of ALL_SUITS) {
        for (const rank of ALL_RANKS) {
        deck.push({ suit, rank });
        }
    }
    return deck;
}

// Mélange Fisher-Yates
export function shuffleDeck(deck: Card[]): Card[] {
    const copy = deck.slice();
    for (let i = copy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
}

/**
 * Distribue les cartes pour une donne de belote :
 * - 4 joueurs (0,1,2,3)
 * - 8 cartes chacun
 * On ne gère pas encore la règle "3 + 2 + 3" / "5 + 3" etc., juste la répartition.
 */
export function dealCards(dealer: PlayerId): DealState {
    const deck = shuffleDeck(createDeck());

    const hands: DealState["hands"] = {
        0: [],
        1: [],
        2: [],
        3: [],
    };

    // Indice du joueur qui reçoit la première carte après le donneur
    let currentPlayer: PlayerId = ((dealer + 1) % 4) as PlayerId;

    // On distribue 8 cartes à chaque joueur (32 cartes)
    deck.forEach((card, index) => {
        const targetPlayer = ((dealer + 1 + index) % 4) as PlayerId;
        hands[targetPlayer].push(card);
    });

    // Vérification simple
    for (const pid of [0, 1, 2, 3] as PlayerId[]) {
        if (hands[pid].length !== 8) {
        throw new Error(`Le joueur ${pid} n'a pas 8 cartes (il en a ${hands[pid].length})`);
        }
    }

    return {
        hands,
        dealer,
        trumpSuit: undefined, // sera décidé dans une phase suivante
    };
}
