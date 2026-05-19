import { cardLabel } from "../lib/cribbage";
import styles from "./PlayingCard.module.css";

interface Props {
  card: string; // e.g. "hearts_A"
  isCut?: boolean;
}

export function PlayingCard({ card, isCut = false }: Props): JSX.Element {
  const label = cardLabel(card);
  return (
    <figure className={`${styles.card} ${isCut ? styles.cut : ""}`}>
      {isCut && (
        <span className={styles.cutTag} aria-hidden="true">
          Cut
        </span>
      )}
      <img
        src={`/cards/${card}.png`}
        alt={isCut ? `Cut card: ${label}` : label}
        className={styles.image}
        draggable={false}
      />
      <figcaption className={styles.label}>
        {isCut ? <strong>Cut: </strong> : null}
        {label}
      </figcaption>
    </figure>
  );
}
