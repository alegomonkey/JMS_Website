import { Link } from "react-router-dom";
import { useDocumentTitle } from "../../lib/useDocumentTitle";

export function CribbageHelp(): JSX.Element {
  useDocumentTitle("Counting cribbage — JMS");
  return (
    <div>
      <p>
        <Link to="/cribbage">← Back to start</Link>
      </p>
      <h1>How a cribbage hand counts</h1>
      <p>
        Every hand is 4 cards plus 1 cut card (5 cards total). Score the hand
        by adding up the categories below. Jacks, Queens, and Kings count as{" "}
        <strong>10</strong> for fifteens; aces count as <strong>1</strong>.
      </p>
      <p>
        Hands are drawn from a single shuffled 52-card deck; in longer games
        the deck is reshuffled when it runs out, so the same card may reappear
        in a later hand (but never twice in one hand).
      </p>

      <section>
        <h2>Pairs — 2 points each</h2>
        <p>
          Every unordered pair of cards with the same rank scores 2 points.
          Three of a kind is 6 (three pairs), four of a kind is 12.
        </p>
      </section>

      <section>
        <h2>Fifteens — 2 points each</h2>
        <p>
          Every distinct subset of cards whose values sum to exactly 15 scores
          2 points. Face cards count as 10, ace as 1.
        </p>
      </section>

      <section>
        <h2>Runs — 1 point per card</h2>
        <p>
          Three or more cards in a row by rank scores 1 point per card in the
          run. Duplicate ranks in a run multiply it (A-2-3-3-4 is a run of 4
          counted twice = 8). <strong>Aces do not wrap around</strong> — Q-K-A
          is not a run.
        </p>
      </section>

      <section>
        <h2>Flush</h2>
        <p>
          Four hand cards of the same suit: <strong>4 points</strong>. If the
          cut card also matches: <strong>5 points</strong>. Three matching
          cards do not score.
        </p>
      </section>

      <section>
        <h2>Nobs — 1 point</h2>
        <p>
          A Jack in your hand whose suit matches the cut card scores 1 point.
          In this game you are <strong>not the dealer</strong>, so a Jack as
          the cut card ("his heels") does <strong>not</strong> score.
        </p>
      </section>

      <section>
        <h2>Example</h2>
        <p>
          Hand 5♥ 5♣ 5♦ J♠ with cut 5♠ is the famous "perfect 29": six pairs
          (12), eight ways to make 15 (16), and nobs for the Jack matching the
          cut (1) — total 29.
        </p>
      </section>

      <p>
        <Link to="/cribbage">← Back to start</Link>
      </p>
    </div>
  );
}
