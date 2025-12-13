import type { Card, Suit } from "../gameTypes";

export function sortHandBySuitColor(hand: Card[], trumpSuit: Suit | null): Card[] {
  const isBlack = (s: Suit) => s === "♣" || s === "♠";
  const allSuits: Suit[] = ["♣", "♦", "♠", "♥"];

  const nonTrumpSuits = trumpSuit
    ? allSuits.filter((s) => s !== trumpSuit)
    : allSuits;

  const blackNonTrumps = nonTrumpSuits.filter(isBlack);
  const redNonTrumps = nonTrumpSuits.filter((s) => !isBlack(s));

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
