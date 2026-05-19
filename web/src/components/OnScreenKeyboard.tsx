import styles from "./OnScreenKeyboard.module.css";

interface Props {
  value: string;
  onChange: (next: string) => void;
  onSubmit: () => void;
  maxLen?: number;
  disabled?: boolean;
}

const DIGITS = ["1", "2", "3", "4", "5", "6", "7", "8", "9"];

export function OnScreenKeyboard({ value, onChange, onSubmit, maxLen = 3, disabled }: Props): JSX.Element {
  function push(d: string): void {
    if (value.length >= maxLen) return;
    const next = (value === "0" ? "" : value) + d;
    onChange(next);
  }
  function back(): void {
    onChange(value.slice(0, -1));
  }

  return (
    <div className={styles.pad} role="group" aria-label="On-screen number keyboard">
      {DIGITS.map((k) => (
        <button
          key={k}
          type="button"
          className={styles.key}
          onClick={() => push(k)}
          disabled={disabled}
          aria-label={`Number ${k}`}
        >
          {k}
        </button>
      ))}
      <button
        type="button"
        className={`${styles.key} ${styles.back}`}
        onClick={back}
        disabled={disabled || value.length === 0}
        aria-label="Backspace"
      >
        ⌫
      </button>
      <button
        type="button"
        className={styles.key}
        onClick={() => push("0")}
        disabled={disabled}
        aria-label="Number 0"
      >
        0
      </button>
      <button
        type="button"
        className={`${styles.key} ${styles.enter}`}
        onClick={onSubmit}
        disabled={disabled || value.length === 0}
        aria-label="Submit answer"
      >
        Enter
      </button>
    </div>
  );
}
