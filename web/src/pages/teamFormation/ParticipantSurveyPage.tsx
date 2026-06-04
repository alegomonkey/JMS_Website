import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useDocumentTitle } from "../../lib/useDocumentTitle";
import {
  type Alias,
  type SnapshotQuestion,
  type TeamFormation,
  fetchAliases,
  getParticipantSnapshot,
  reserveParticipantSlot,
  submitParticipantResponse,
  validateCode,
} from "../../lib/teamFormationApi";
import styles from "./ParticipantSurveyPage.module.css";

// ── State machine ────────────────────────────────────────────────────────────

type ParticipantState =
  | { phase: "loading" }
  | { phase: "code-prompt"; error: string | null }
  | { phase: "name-selection"; session: TeamFormation; aliases: Alias[]; questions: SnapshotQuestion[] }
  | {
      phase: "survey";
      session: TeamFormation;
      questions: SnapshotQuestion[];
      slotNumber?: number;
      aliasId?: number;
      aliasName?: string;
      aliases: Alias[];
      answers: Record<string, unknown>;
    }
  | {
      phase: "review";
      session: TeamFormation;
      questions: SnapshotQuestion[];
      slotNumber?: number;
      aliasId?: number;
      aliasName?: string;
      aliases: Alias[];
      answers: Record<string, unknown>;
      validationErrors: Record<string, string>;
      submitError: string | null;
    }
  | { phase: "submitted"; session: TeamFormation; slotNumber?: number; aliasName?: string }
  | {
      phase: "error";
      code: "invalid-code" | "not-active" | "slot-full" | "already-submitted" | "generic";
      message: string;
    };

// ── Helpers ──────────────────────────────────────────────────────────────────

function validateAnswers(
  questions: SnapshotQuestion[],
  answers: Record<string, unknown>,
  slotMode: "numbered" | "named",
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const q of questions) {
    if (q.block_type === "avoid_respondent" && slotMode === "numbered") continue;
    const key = String(q.id);
    const val = answers[key];
    if (q.block_type === "skill_selection" || q.block_type === "negative_skill") {
      const arr = val as string[] | undefined;
      if (!arr || arr.length === 0) errors[key] = "Please select at least one option.";
    } else if (q.block_type === "written_answer") {
      if (!val || String(val).trim() === "") errors[key] = "Please provide an answer.";
    } else if (q.block_type === "avoid_respondent") {
      // optional
    } else if (q.block_type === "multiple_choice") {
      const allowMultiple = q.config.allow_multiple as boolean | undefined;
      if (allowMultiple) {
        const arr = val as string[] | undefined;
        if (!arr || arr.length === 0) errors[key] = "Please select at least one option.";
      } else {
        if (val === undefined || val === null || val === "") errors[key] = "Please select an option.";
      }
    } else if (q.block_type === "custom_scale") {
      if (val === undefined || val === null) errors[key] = "Please provide a rating.";
    }
    // skill_level is optional (depends on parent selections)
  }
  return errors;
}

// ── Main component ────────────────────────────────────────────────────────────

export function ParticipantSurveyPage(): JSX.Element {
  useDocumentTitle("Join team formation — JMS");
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [state, setState] = useState<ParticipantState>({ phase: "loading" });
  const focusTargetRef = useRef<HTMLHeadingElement>(null);

  const loadSession = useCallback(async (code: string) => {
    setState({ phase: "loading" });
    try {
      const { session } = await validateCode(code);

      if (session.slot_mode === "numbered") {
        let slotNumber: number;
        try {
          const slotRes = await reserveParticipantSlot(session.id);
          slotNumber = slotRes.slot_number;
        } catch (err: unknown) {
          const status = (err as { status?: number }).status;
          if (status === 409) {
            setState({ phase: "error", code: "slot-full", message: "All submission slots are filled." });
          } else {
            setState({ phase: "error", code: "generic", message: String(err) });
          }
          return;
        }

        try {
          const snap = await getParticipantSnapshot(session.id);
          setState({
            phase: "survey",
            session,
            questions: snap.questions,
            slotNumber,
            aliases: [],
            answers: {},
          });
        } catch {
          setState({ phase: "error", code: "not-active", message: "Survey is no longer accepting responses." });
        }
      } else {
        // named mode: load aliases + snapshot in parallel
        try {
          const [aliasRes, snap] = await Promise.all([
            fetchAliases(session.id),
            getParticipantSnapshot(session.id),
          ]);
          setState({
            phase: "name-selection",
            session,
            aliases: aliasRes.aliases,
            questions: snap.questions,
          });
        } catch {
          setState({ phase: "error", code: "not-active", message: "Survey is no longer accepting responses." });
        }
      }
    } catch (err: unknown) {
      const status = (err as { status?: number }).status;
      if (status === 404) {
        setState({ phase: "error", code: "invalid-code", message: "This code is not valid or the session is no longer active." });
      } else {
        setState({ phase: "error", code: "generic", message: String(err) });
      }
    }
  }, []);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) {
      setState({ phase: "code-prompt", error: null });
    } else {
      void loadSession(code);
    }
  }, [searchParams, loadSession]);

  // Focus heading when phase changes
  useEffect(() => {
    if (state.phase !== "loading") {
      focusTargetRef.current?.focus();
    }
  }, [state.phase]);

  // ── Render ─────────────────────────────────────────────────────────────────

  if (state.phase === "loading") {
    return (
      <div className={styles.page}>
        <p className={styles.loading} aria-live="polite">Loading…</p>
      </div>
    );
  }

  if (state.phase === "code-prompt") {
    return (
      <CodePromptScreen
        error={state.error}
        headingRef={focusTargetRef}
        onSubmit={(code) => navigate(`/team-formation/join?code=${encodeURIComponent(code)}`)}
      />
    );
  }

  if (state.phase === "name-selection") {
    return (
      <NameSelectionScreen
        session={state.session}
        aliases={state.aliases}
        questions={state.questions}
        headingRef={focusTargetRef}
        onContinue={(alias) => {
          setState({
            phase: "survey",
            session: state.session,
            questions: state.questions,
            aliasId: alias.id,
            aliasName: alias.display_name,
            aliases: state.aliases,
            answers: {},
          });
        }}
      />
    );
  }

  if (state.phase === "survey") {
    return (
      <SurveyScreen
        session={state.session}
        questions={state.questions}
        slotNumber={state.slotNumber}
        aliasName={state.aliasName}
        aliases={state.aliases}
        answers={state.answers}
        headingRef={focusTargetRef}
        focusBlockId={null}
        onAnswersChange={(answers) => setState({ ...state, answers })}
        onReview={(answers) => {
          const errors = validateAnswers(state.questions, answers, state.session.slot_mode);
          setState({
            phase: "review",
            session: state.session,
            questions: state.questions,
            slotNumber: state.slotNumber,
            aliasId: state.aliasId,
            aliasName: state.aliasName,
            aliases: state.aliases,
            answers,
            validationErrors: errors,
            submitError: null,
          });
        }}
      />
    );
  }

  if (state.phase === "review") {
    return (
      <ReviewScreen
        session={state.session}
        questions={state.questions}
        slotNumber={state.slotNumber}
        aliasId={state.aliasId}
        aliasName={state.aliasName}
        aliases={state.aliases}
        answers={state.answers}
        validationErrors={state.validationErrors}
        submitError={state.submitError}
        headingRef={focusTargetRef}
        onEdit={(focusBlockId) => {
          setState({
            phase: "survey",
            session: state.session,
            questions: state.questions,
            slotNumber: state.slotNumber,
            aliasId: state.aliasId,
            aliasName: state.aliasName,
            aliases: state.aliases,
            answers: state.answers,
          });
          // focusBlockId handled via URL hash after transition
          void focusBlockId;
        }}
        onSubmit={async (answers) => {
          const errors = validateAnswers(state.questions, answers, state.session.slot_mode);
          if (Object.keys(errors).length > 0) {
            setState({ ...state, validationErrors: errors, submitError: null });
            return;
          }
          try {
            await submitParticipantResponse(state.session.id, {
              slot_number: state.slotNumber,
              alias_id: state.aliasId,
              answers,
            });
            setState({
              phase: "submitted",
              session: state.session,
              slotNumber: state.slotNumber,
              aliasName: state.aliasName,
            });
          } catch (err: unknown) {
            const status = (err as { status?: number }).status;
            if (status === 409) {
              setState({ phase: "error", code: "already-submitted", message: "A response has already been recorded for this slot." });
            } else {
              setState({ ...state, submitError: "Submission failed. Please try again." });
            }
          }
        }}
      />
    );
  }

  if (state.phase === "submitted") {
    return <ConfirmationScreen session={state.session} slotNumber={state.slotNumber} aliasName={state.aliasName} headingRef={focusTargetRef} />;
  }

  // error
  return <ErrorScreen code={state.code} message={state.message} headingRef={focusTargetRef} />;
}

// ── CodePromptScreen ──────────────────────────────────────────────────────────

function CodePromptScreen({
  error,
  headingRef,
  onSubmit,
}: {
  error: string | null;
  headingRef: React.RefObject<HTMLHeadingElement>;
  onSubmit: (code: string) => void;
}): JSX.Element {
  const [code, setCode] = useState("");
  const inputId = useId();
  const errorId = useId();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = code.trim();
    if (trimmed) onSubmit(trimmed);
  };

  return (
    <div className={styles.page}>
      <h1 className={styles.pageHeading} ref={headingRef} tabIndex={-1}>Join a team formation session</h1>
      <form className={styles.codeForm} onSubmit={handleSubmit} noValidate>
        <label htmlFor={inputId} className={styles.label}>Enter invite code</label>
        <div className={styles.codeInputRow}>
          <input
            id={inputId}
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className={styles.codeInput}
            autoComplete="off"
            spellCheck={false}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? "true" : undefined}
          />
          <button type="submit" className={styles.primaryBtn} disabled={!code.trim()}>
            Continue
          </button>
        </div>
        {error && (
          <p id={errorId} role="alert" className={styles.errorMsg}>{error}</p>
        )}
      </form>
    </div>
  );
}

// ── NameSelectionScreen ───────────────────────────────────────────────────────

function NameSelectionScreen({
  session,
  aliases,
  questions,
  headingRef,
  onContinue,
}: {
  session: TeamFormation;
  aliases: Alias[];
  questions: SnapshotQuestion[];
  headingRef: React.RefObject<HTMLHeadingElement>;
  onContinue: (alias: Alias) => void;
}): JSX.Element {
  void questions;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Alias | null>(null);
  const [open, setOpen] = useState(false);
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [activeIndex, setActiveIndex] = useState(-1);

  const filtered = aliases.filter((a) =>
    a.display_name.toLowerCase().includes(query.toLowerCase()),
  );

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    setSelected(null);
    setOpen(true);
    setActiveIndex(-1);
  };

  const selectAlias = (alias: Alias) => {
    setSelected(alias);
    setQuery(alias.display_name);
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      setActiveIndex(0);
      e.preventDefault();
      return;
    }
    if (!open) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0 && filtered[activeIndex]) {
      e.preventDefault();
      selectAlias(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    } else if (e.key === "Home") {
      e.preventDefault();
      setActiveIndex(0);
    } else if (e.key === "End") {
      e.preventDefault();
      setActiveIndex(filtered.length - 1);
    }
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageHeading} ref={headingRef} tabIndex={-1}>{session.title}</h1>
      <p className={styles.subText}>Find your name in the list to continue.</p>

      <div className={styles.comboboxWrap}>
        <label htmlFor={inputId} className={styles.label}>Your name</label>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          value={query}
          onChange={handleInputChange}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          className={styles.comboboxInput}
          autoComplete="off"
        />
        {open && filtered.length > 0 && (
          <ul
            id={listboxId}
            ref={listRef}
            role="listbox"
            className={styles.listbox}
            aria-label="Names"
          >
            {filtered.map((a, i) => (
              <li
                key={a.id}
                id={optionId(i)}
                role="option"
                aria-selected={selected?.id === a.id}
                className={`${styles.option} ${i === activeIndex ? styles.optionActive : ""}`}
                onMouseDown={() => selectAlias(a)}
              >
                {a.display_name}
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className={styles.helper}>
        If your name is not listed, contact the session organiser.
      </p>
      <button
        type="button"
        className={styles.primaryBtn}
        disabled={selected === null}
        onClick={() => selected && onContinue(selected)}
      >
        This is me — Continue
      </button>
    </div>
  );
}

// ── SlotBanner ────────────────────────────────────────────────────────────────

function SlotBanner({ slotNumber }: { slotNumber: number }): JSX.Element {
  return (
    <div className={styles.slotBanner} role="status" aria-live="polite">
      You are <strong>Submission {slotNumber}</strong>.{" "}
      Save this number — your team assignment will be shared using it.
    </div>
  );
}

// ── BlockInput ────────────────────────────────────────────────────────────────

function BlockInput({
  question,
  answers,
  aliases,
  selfAliasId,
  slotMode,
  onChange,
  error,
}: {
  question: SnapshotQuestion;
  answers: Record<string, unknown>;
  aliases: Alias[];
  selfAliasId?: number;
  slotMode: "numbered" | "named";
  onChange: (key: string, value: unknown) => void;
  error?: string;
}): JSX.Element | null {
  const key = String(question.id);
  const errorId = useId();
  const labelId = useId();

  if (question.block_type === "avoid_respondent" && slotMode === "numbered") return null;

  if (question.block_type === "skill_selection" || question.block_type === "negative_skill") {
    const skills =
      (question.config.skills as string[]) ?? (question.config.categories as string[]) ?? [];
    const allowMultiple = Boolean(
      question.config.multi ?? question.config.multi_select ?? question.config.allow_multiple,
    );
    const selected = (answers[key] as string[] | undefined) ?? [];

    // Proficiency is folded into the skill block: rate each selected skill 1–10,
    // stored separately at `${qId}:levels` so the selection itself stays an array.
    const askProficiency =
      question.block_type === "skill_selection" && Boolean(question.config.ask_proficiency);
    const levelsKey = `${key}:levels`;
    const ratings = (answers[levelsKey] as Record<string, number> | undefined) ?? {};
    const selectedSkills = allowMultiple
      ? selected
      : typeof answers[key] === "string"
        ? [answers[key] as string]
        : [];

    const proficiencyBlock =
      askProficiency && selectedSkills.length > 0 ? (
        <div className={styles.blockWrap}>
          <p className={styles.muted}>Rate your proficiency (1–10) for each selected skill:</p>
          {selectedSkills.map((skill) => {
            const val = ratings[skill] ?? 5;
            return (
              <div key={skill} className={styles.sliderRow}>
                <label className={styles.sliderLabel} htmlFor={`${levelsKey}-${skill}`}>
                  {skill}
                </label>
                <input
                  id={`${levelsKey}-${skill}`}
                  type="range"
                  min={1}
                  max={10}
                  value={val}
                  aria-valuemin={1}
                  aria-valuemax={10}
                  aria-valuenow={val}
                  aria-valuetext={`${val} out of 10`}
                  onChange={(e) => onChange(levelsKey, { ...ratings, [skill]: Number(e.target.value) })}
                  className={styles.slider}
                />
                <span className={styles.sliderValue} aria-hidden>{val}</span>
              </div>
            );
          })}
        </div>
      ) : null;

    if (allowMultiple) {
      return (
        <>
          <fieldset className={styles.blockFieldset} aria-describedby={error ? errorId : undefined}>
            <legend id={labelId} className={styles.blockLegend}>{question.prompt}</legend>
            {error && <p id={errorId} role="alert" className={styles.blockError}>{error}</p>}
            {skills.map((skill) => (
              <label key={skill} className={styles.checkLabel}>
                <input
                  type="checkbox"
                  checked={selected.includes(skill)}
                  onChange={(e) => {
                    const next = e.target.checked
                      ? [...selected, skill]
                      : selected.filter((s) => s !== skill);
                    onChange(key, next);
                  }}
                />
                {skill}
              </label>
            ))}
          </fieldset>
          {proficiencyBlock}
        </>
      );
    } else {
      return (
        <>
          <fieldset className={styles.blockFieldset} aria-describedby={error ? errorId : undefined}>
            <legend className={styles.blockLegend}>{question.prompt}</legend>
            {error && <p id={errorId} role="alert" className={styles.blockError}>{error}</p>}
            {skills.map((skill) => (
              <label key={skill} className={styles.checkLabel}>
                <input
                  type="radio"
                  name={key}
                  value={skill}
                  checked={(answers[key] as string) === skill}
                  onChange={() => onChange(key, skill)}
                />
                {skill}
              </label>
            ))}
          </fieldset>
          {proficiencyBlock}
        </>
      );
    }
  }

  if (question.block_type === "skill_level") {
    const parentId = question.config.parent_question_id as number | undefined;
    const parentKey = parentId !== undefined ? String(parentId) : null;
    const parentSelections = parentKey ? ((answers[parentKey] as string[] | undefined) ?? []) : [];

    if (parentSelections.length === 0) {
      return (
        <div className={styles.blockWrap}>
          <p className={styles.blockPrompt}>{question.prompt}</p>
          <p className={styles.muted}>Select skills above to rate them.</p>
        </div>
      );
    }

    const ratings = (answers[key] as Record<string, number> | undefined) ?? {};

    return (
      <div className={styles.blockWrap}>
        <p className={styles.blockPrompt}>{question.prompt}</p>
        {parentSelections.map((skill) => {
          const val = ratings[skill] ?? 5;
          return (
            <div key={skill} className={styles.sliderRow}>
              <label className={styles.sliderLabel} htmlFor={`${key}-${skill}`}>
                {skill}
              </label>
              <input
                id={`${key}-${skill}`}
                type="range"
                min={1}
                max={10}
                value={val}
                aria-valuemin={1}
                aria-valuemax={10}
                aria-valuenow={val}
                aria-valuetext={`${val} out of 10`}
                onChange={(e) => {
                  onChange(key, { ...ratings, [skill]: Number(e.target.value) });
                }}
                className={styles.slider}
              />
              <span className={styles.sliderValue} aria-hidden>{val}</span>
            </div>
          );
        })}
      </div>
    );
  }

  if (question.block_type === "written_answer") {
    const maxChars = (question.config.max_chars as number) ?? 500;
    const placeholder = (question.config.placeholder as string) ?? "";
    const val = (answers[key] as string) ?? "";
    const inputId = labelId;
    return (
      <div className={styles.blockWrap}>
        <label htmlFor={inputId} className={styles.blockPrompt}>{question.prompt}</label>
        {error && <p id={errorId} role="alert" className={styles.blockError}>{error}</p>}
        <textarea
          id={inputId}
          value={val}
          onChange={(e) => onChange(key, e.target.value)}
          maxLength={maxChars}
          placeholder={placeholder}
          className={styles.textarea}
          aria-describedby={error ? errorId : undefined}
        />
        <p className={styles.charCount}>{val.length}/{maxChars}</p>
      </div>
    );
  }

  if (question.block_type === "avoid_respondent") {
    // Multi-select combobox of all aliases excluding self
    return (
      <AvoidRespondentBlock
        question={question}
        answers={answers}
        aliases={aliases}
        selfAliasId={selfAliasId}
        onChange={onChange}
      />
    );
  }

  if (question.block_type === "custom_scale") {
    const min = (question.config.min as number) ?? 1;
    const max = (question.config.max as number) ?? 10;
    const val = (answers[key] as number) ?? min;
    const minLabel = (question.config.min_label as string) ?? String(min);
    const maxLabel = (question.config.max_label as string) ?? String(max);
    const inputId = labelId;
    return (
      <div className={styles.blockWrap}>
        <label htmlFor={inputId} className={styles.blockPrompt}>{question.prompt}</label>
        {error && <p id={errorId} role="alert" className={styles.blockError}>{error}</p>}
        <div className={styles.scaleRow}>
          <span className={styles.scaleLabel}>{minLabel}</span>
          <input
            id={inputId}
            type="range"
            min={min}
            max={max}
            value={val}
            aria-valuemin={min}
            aria-valuemax={max}
            aria-valuenow={val}
            aria-valuetext={`${val} out of ${max}`}
            onChange={(e) => onChange(key, Number(e.target.value))}
            className={styles.slider}
            aria-describedby={error ? errorId : undefined}
          />
          <span className={styles.scaleLabel}>{maxLabel}</span>
          <span className={styles.sliderValue}>{val}</span>
        </div>
      </div>
    );
  }

  if (question.block_type === "multiple_choice") {
    const options = (question.config.options as string[]) ?? [];
    const allowMultiple = question.config.allow_multiple as boolean | undefined;
    if (allowMultiple) {
      const selected = (answers[key] as string[] | undefined) ?? [];
      return (
        <fieldset className={styles.blockFieldset} aria-describedby={error ? errorId : undefined}>
          <legend className={styles.blockLegend}>{question.prompt}</legend>
          {error && <p id={errorId} role="alert" className={styles.blockError}>{error}</p>}
          {options.map((opt) => (
            <label key={opt} className={styles.checkLabel}>
              <input
                type="checkbox"
                checked={selected.includes(opt)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, opt]
                    : selected.filter((o) => o !== opt);
                  onChange(key, next);
                }}
              />
              {opt}
            </label>
          ))}
        </fieldset>
      );
    } else {
      return (
        <fieldset className={styles.blockFieldset} aria-describedby={error ? errorId : undefined}>
          <legend className={styles.blockLegend}>{question.prompt}</legend>
          {error && <p id={errorId} role="alert" className={styles.blockError}>{error}</p>}
          {options.map((opt) => (
            <label key={opt} className={styles.checkLabel}>
              <input
                type="radio"
                name={key}
                value={opt}
                checked={(answers[key] as string) === opt}
                onChange={() => onChange(key, opt)}
              />
              {opt}
            </label>
          ))}
        </fieldset>
      );
    }
  }

  return null;
}

// ── AvoidRespondentBlock ──────────────────────────────────────────────────────

function AvoidRespondentBlock({
  question,
  answers,
  aliases,
  selfAliasId,
  onChange,
}: {
  question: SnapshotQuestion;
  answers: Record<string, unknown>;
  aliases: Alias[];
  selfAliasId?: number;
  onChange: (key: string, value: unknown) => void;
}): JSX.Element {
  const key = String(question.id);
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputId = useId();
  const listboxId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const selected = (answers[key] as number[] | undefined) ?? [];
  const others = aliases.filter((a) => a.id !== selfAliasId);
  const filtered = others.filter(
    (a) =>
      !selected.includes(a.id) &&
      a.display_name.toLowerCase().includes(query.toLowerCase()),
  );

  const addSelection = (alias: Alias) => {
    onChange(key, [...selected, alias.id]);
    setQuery("");
    setOpen(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const removeSelection = (id: number) => {
    onChange(key, selected.filter((s) => s !== id));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      setOpen(true);
      setActiveIndex(0);
      e.preventDefault();
      return;
    }
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0 && filtered[activeIndex]) {
      e.preventDefault();
      addSelection(filtered[activeIndex]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setActiveIndex(-1);
    }
  };

  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const item = listRef.current.children[activeIndex] as HTMLElement | undefined;
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  const optionId = (i: number) => `${listboxId}-opt-${i}`;
  const selectedNames = selected.map((id) => aliases.find((a) => a.id === id)?.display_name ?? String(id));

  return (
    <div className={styles.blockWrap}>
      <p className={styles.blockPrompt}>{question.prompt}</p>
      {selectedNames.length > 0 && (
        <ul className={styles.selectedPills} aria-label="Selected people to avoid">
          {selected.map((id, i) => (
            <li key={id} className={styles.pill}>
              {selectedNames[i]}
              <button
                type="button"
                className={styles.pillRemove}
                aria-label={`Remove ${selectedNames[i]}`}
                onClick={() => removeSelection(id)}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
      <label htmlFor={inputId} className={styles.srOnly}>Search people to avoid</label>
      <div className={styles.comboboxWrap} style={{ position: "relative" }}>
        <input
          id={inputId}
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={activeIndex >= 0 ? optionId(activeIndex) : undefined}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActiveIndex(-1); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          onKeyDown={handleKeyDown}
          className={styles.comboboxInput}
          placeholder="Search…"
          autoComplete="off"
        />
        {open && filtered.length > 0 && (
          <ul id={listboxId} ref={listRef} role="listbox" className={styles.listbox} aria-label="People">
            {filtered.map((a, i) => (
              <li
                key={a.id}
                id={optionId(i)}
                role="option"
                aria-selected={false}
                className={`${styles.option} ${i === activeIndex ? styles.optionActive : ""}`}
                onMouseDown={() => addSelection(a)}
              >
                {a.display_name}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── SurveyScreen ─────────────────────────────────────────────────────────────

function SurveyScreen({
  session,
  questions,
  slotNumber,
  aliasName,
  aliases,
  answers,
  headingRef,
  focusBlockId,
  onAnswersChange,
  onReview,
}: {
  session: TeamFormation;
  questions: SnapshotQuestion[];
  slotNumber?: number;
  aliasName?: string;
  aliases: Alias[];
  answers: Record<string, unknown>;
  headingRef: React.RefObject<HTMLHeadingElement>;
  focusBlockId: number | null;
  onAnswersChange: (answers: Record<string, unknown>) => void;
  onReview: (answers: Record<string, unknown>) => void;
}): JSX.Element {
  const selfAliasId = aliases.find((a) => a.display_name === aliasName)?.id;
  const visibleQuestions = questions.filter(
    (q) => !(q.block_type === "avoid_respondent" && session.slot_mode === "numbered"),
  );

  const handleChange = (key: string, value: unknown) => {
    onAnswersChange({ ...answers, [key]: value });
  };

  // Focus a specific block when returning from review
  const blockRefs = useRef<Map<number, HTMLElement>>(new Map());
  useEffect(() => {
    if (focusBlockId !== null) {
      const el = blockRefs.current.get(focusBlockId);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        const focusable = el.querySelector<HTMLElement>("input, textarea, select, button");
        focusable?.focus();
      }
    }
  }, [focusBlockId]);

  return (
    <div className={styles.page}>
      {slotNumber !== undefined && <SlotBanner slotNumber={slotNumber} />}
      <h1 className={styles.pageHeading} ref={headingRef} tabIndex={-1}>{session.title}</h1>
      <p className={styles.progressNote} aria-live="polite">
        {visibleQuestions.length} question{visibleQuestions.length === 1 ? "" : "s"}
        {session.slot_mode === "numbered" ? " (avoid-respondent questions hidden)" : ""}
      </p>
      <div className={styles.questionList}>
        {questions.map((q) => {
          if (q.block_type === "avoid_respondent" && session.slot_mode === "numbered") return null;
          return (
            <section
              key={q.id}
              id={`block-${q.id}`}
              className={styles.blockSection}
              ref={(el) => { if (el) blockRefs.current.set(q.id, el); }}
            >
              <BlockInput
                question={q}
                answers={answers}
                aliases={aliases}
                selfAliasId={selfAliasId}
                slotMode={session.slot_mode}
                onChange={handleChange}
              />
            </section>
          );
        })}
      </div>
      <div className={styles.navRow}>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => onReview(answers)}
        >
          Review my answers
        </button>
      </div>
    </div>
  );
}

// ── ReviewBlock ───────────────────────────────────────────────────────────────

function ReviewBlock({
  question,
  answers,
  aliases,
  slotMode,
  error,
  onEdit,
}: {
  question: SnapshotQuestion;
  answers: Record<string, unknown>;
  aliases: Alias[];
  slotMode: "numbered" | "named";
  error?: string;
  onEdit: (blockId: number) => void;
}): JSX.Element | null {
  if (question.block_type === "avoid_respondent" && slotMode === "numbered") return null;

  const key = String(question.id);
  let displayValue: React.ReactNode = <span className={styles.muted}>(no answer)</span>;

  if (question.block_type === "skill_selection" || question.block_type === "negative_skill" || question.block_type === "multiple_choice") {
    const arr = answers[key] as string[] | string | undefined;
    if (arr && arr.length > 0) {
      const items = Array.isArray(arr) ? arr : [arr];
      displayValue = <ul className={styles.reviewList}>{items.map((s) => <li key={s}>{s}</li>)}</ul>;
    }
  } else if (question.block_type === "written_answer") {
    const val = answers[key] as string | undefined;
    if (val && val.trim()) displayValue = <p className={styles.reviewText}>{val}</p>;
  } else if (question.block_type === "skill_level") {
    const ratings = answers[key] as Record<string, number> | undefined;
    if (ratings && Object.keys(ratings).length > 0) {
      displayValue = (
        <ul className={styles.reviewList}>
          {Object.entries(ratings).map(([skill, rating]) => (
            <li key={skill}>{skill}: {rating}/10</li>
          ))}
        </ul>
      );
    }
  } else if (question.block_type === "avoid_respondent") {
    const ids = answers[key] as number[] | undefined;
    if (ids && ids.length > 0) {
      const names = ids.map((id) => aliases.find((a) => a.id === id)?.display_name ?? String(id));
      displayValue = <ul className={styles.reviewList}>{names.map((n) => <li key={n}>{n}</li>)}</ul>;
    }
  } else if (question.block_type === "custom_scale") {
    const val = answers[key] as number | undefined;
    if (val !== undefined) displayValue = <span>{val}</span>;
  }

  return (
    <section className={`${styles.reviewBlock} ${error ? styles.reviewBlockError : ""}`} id={`review-block-${question.id}`}>
      <div className={styles.reviewBlockHeader}>
        <h3 className={styles.reviewBlockPrompt}>{question.prompt}</h3>
        <a
          href={`#block-${question.id}`}
          className={styles.editLink}
          onClick={(e) => { e.preventDefault(); onEdit(question.id); }}
        >
          Edit
        </a>
      </div>
      {error && <p role="alert" className={styles.blockError}>{error}</p>}
      {displayValue}
    </section>
  );
}

// ── ReviewScreen ─────────────────────────────────────────────────────────────

function ReviewScreen({
  session,
  questions,
  slotNumber,
  aliasName,
  aliases,
  answers,
  validationErrors,
  submitError,
  headingRef,
  onEdit,
  onSubmit,
}: {
  session: TeamFormation;
  questions: SnapshotQuestion[];
  slotNumber?: number;
  aliasId?: number;
  aliasName?: string;
  aliases: Alias[];
  answers: Record<string, unknown>;
  validationErrors: Record<string, string>;
  submitError: string | null;
  headingRef: React.RefObject<HTMLHeadingElement>;
  onEdit: (focusBlockId: number | null) => void;
  onSubmit: (answers: Record<string, unknown>) => Promise<void>;
}): JSX.Element {
  const errorSummaryRef = useRef<HTMLDivElement>(null);
  const hasErrors = Object.keys(validationErrors).length > 0;
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (hasErrors && errorSummaryRef.current) {
      errorSummaryRef.current.focus();
    }
  }, [hasErrors, validationErrors]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await onSubmit(answers);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={styles.page}>
      {slotNumber !== undefined && <SlotBanner slotNumber={slotNumber} />}
      <h1 className={styles.pageHeading} ref={headingRef} tabIndex={-1}>Review your answers</h1>
      {aliasName && <p className={styles.subText}>Submitting as: <strong>{aliasName}</strong></p>}

      {hasErrors && (
        <div
          ref={errorSummaryRef}
          className={styles.errorSummary}
          role="alert"
          tabIndex={-1}
        >
          <h2 className={styles.errorSummaryHeading}>Please fix the following before submitting:</h2>
          <ul>
            {Object.entries(validationErrors).map(([qId, msg]) => {
              const q = questions.find((qu) => String(qu.id) === qId);
              return (
                <li key={qId}>
                  <a
                    href={`#block-${qId}`}
                    onClick={(e) => { e.preventDefault(); onEdit(Number(qId)); }}
                  >
                    {q?.prompt ?? `Question ${qId}`}
                  </a>: {msg}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <div className={styles.reviewList}>
        {questions.map((q) => (
          <ReviewBlock
            key={q.id}
            question={q}
            answers={answers}
            aliases={aliases}
            slotMode={session.slot_mode}
            error={validationErrors[String(q.id)]}
            onEdit={onEdit}
          />
        ))}
      </div>

      <div className={styles.navRow}>
        <button
          type="button"
          className={styles.ghostBtn}
          onClick={() => onEdit(null)}
        >
          Back to survey
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          disabled={submitting}
          onClick={() => void handleSubmit()}
        >
          {submitting ? "Submitting…" : "Submit"}
        </button>
      </div>
      {submitError && <p role="alert" className={styles.errorMsg}>{submitError}</p>}
    </div>
  );
}

// ── ConfirmationScreen ────────────────────────────────────────────────────────

function ConfirmationScreen({
  session,
  slotNumber,
  aliasName,
  headingRef,
}: {
  session: TeamFormation;
  slotNumber?: number;
  aliasName?: string;
  headingRef: React.RefObject<HTMLHeadingElement>;
}): JSX.Element {
  return (
    <div className={styles.page}>
      <h1 className={styles.pageHeading} ref={headingRef} tabIndex={-1}>Response submitted!</h1>
      {slotNumber !== undefined && (
        <p>Submission <strong>{slotNumber}</strong> received. Thank you.</p>
      )}
      {aliasName && (
        <p>Response submitted for <strong>{aliasName}</strong>. Thank you.</p>
      )}
      {session.closes_at ? (
        <p>This survey closes on {new Date(session.closes_at * 1000).toLocaleString()}.</p>
      ) : (
        <p>{session.slots_submitted} of {session.slot_count} submissions received.</p>
      )}
    </div>
  );
}

// ── ErrorScreen ───────────────────────────────────────────────────────────────

const ERROR_COPY: Record<string, { heading: string; body: string }> = {
  "invalid-code": {
    heading: "Invalid invite code",
    body: "This code is not valid or the session is no longer active.",
  },
  "not-active": {
    heading: "Survey closed",
    body: "This survey is no longer accepting responses.",
  },
  "slot-full": {
    heading: "All slots filled",
    body: "This survey is no longer accepting responses. All submission slots are filled.",
  },
  "already-submitted": {
    heading: "Already submitted",
    body: "A response has already been recorded for this slot.",
  },
  generic: {
    heading: "Something went wrong",
    body: "",
  },
};

function ErrorScreen({
  code,
  message,
  headingRef,
}: {
  code: string;
  message: string;
  headingRef: React.RefObject<HTMLHeadingElement>;
}): JSX.Element {
  const copy = ERROR_COPY[code] ?? ERROR_COPY["generic"]!;
  return (
    <div className={styles.page}>
      <h1 className={styles.pageHeading} ref={headingRef} tabIndex={-1}>{copy.heading}</h1>
      <p>{copy.body || message}</p>
      <p className={styles.muted}>If you believe this is an error, contact the session organiser.</p>
    </div>
  );
}
