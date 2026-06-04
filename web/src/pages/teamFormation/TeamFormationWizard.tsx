import { useEffect, useId, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth.js";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import { SurveyBuilder, type SurveyBuilderHandle } from "../../components/SurveyBuilder.js";
import { SurveyLibrary } from "../../components/SurveyLibrary.js";
import { type Survey, fetchSurveyWithQuestions, forkSurvey } from "../../lib/surveyApi.js";
import {
  type Alias,
  type TeamFormation,
  addAlias,
  createSession,
  fetchAliases,
  fetchSession,
  launchSession,
  removeAlias,
  updateSession,
} from "../../lib/teamFormationApi.js";
import styles from "./TeamFormationWizard.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4;

type WizardState =
  | { phase: "loading" }
  | { phase: "ready"; session: TeamFormation | null; step: Step; aliases: Alias[] }
  | { phase: "error"; message: string }
  | { phase: "launched"; session: TeamFormation };

// ── Step labels ────────────────────────────────────────────────────────────

const STEPS: Record<Step, string> = {
  1: "Team Configuration",
  2: "Survey Setup",
  3: "Access Control",
  4: "Review & Launch",
};

// ── Main component ──────────────────────────────────────────────────────────

export function TeamFormationWizard(): JSX.Element {
  const { id } = useParams<{ id?: string }>();
  const sessionId = id ? Number(id) : undefined;
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  useDocumentTitle(sessionId ? "Edit Session — JMS" : "New Session — JMS");

  const [state, setState] = useState<WizardState>({ phase: "loading" });

  useEffect(() => {
    if (!sessionId) {
      setState({ phase: "ready", session: null, step: 1, aliases: [] });
      return;
    }
    let cancelled = false;
    Promise.all([fetchSession(sessionId), fetchAliases(sessionId)])
      .then(([{ session }, { aliases }]) => {
        if (!cancelled) {
          setState({ phase: "ready", session, step: determineStep(session), aliases });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load session";
          setState({ phase: "error", message: msg });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) return <p className={styles.message}>Loading…</p>;

  if (!user) {
    return (
      <div>
        <h1>{sessionId ? "Edit Session" : "New Session"}</h1>
        <p>You must be signed in to manage team formation sessions.</p>
      </div>
    );
  }

  if (state.phase === "loading") return <p className={styles.message}>Loading…</p>;
  if (state.phase === "error") {
    return (
      <p className={styles.message} role="alert">
        {state.message}
      </p>
    );
  }
  if (state.phase === "launched") {
    return <PostLaunchScreen session={state.session} />;
  }

  const { session, step, aliases } = state;

  function setStep(s: Step): void {
    setState((prev) => (prev.phase === "ready" ? { ...prev, step: s } : prev));
  }

  function setSession(s: TeamFormation): void {
    setState((prev) => (prev.phase === "ready" ? { ...prev, session: s } : prev));
  }

  function setAliases(a: Alias[]): void {
    setState((prev) => (prev.phase === "ready" ? { ...prev, aliases: a } : prev));
  }

  return (
    <div className={styles.root}>
      <h1 className={styles.heading}>{sessionId ? "Edit Session" : "New Session"}</h1>

      <StepStepper
        currentStep={step}
        canGoTo={(s) => {
          if (s === 1) return true;
          if (s === 2) return session !== null;
          if (s === 3) return session?.survey_id != null;
          if (s === 4) return session?.survey_id != null;
          return false;
        }}
        onStepClick={setStep}
      />

      <div className={styles.stepContent}>
        {step === 1 && (
          <Step1Config
            session={session}
            onSave={(s) => {
              setSession(s);
              if (!sessionId) {
                void navigate(`/team-formation/${s.id}/edit`, { replace: true });
              }
              setStep(2);
            }}
          />
        )}
        {step === 2 && session && (
          <Step2Survey
            session={session}
            onSurveyAttached={(s) => setSession(s)}
            onNext={() => setStep(3)}
            onBack={() => setStep(1)}
          />
        )}
        {step === 3 && session && (
          <Step3Access
            session={session}
            aliases={aliases}
            onSave={(s, a) => {
              setSession(s);
              setAliases(a);
              setStep(4);
            }}
            onBack={() => setStep(2)}
            onAliasesChange={setAliases}
          />
        )}
        {step === 4 && session && (
          <Step4Review
            session={session}
            aliases={aliases}
            onBack={() => setStep(3)}
            onLaunched={(s) => setState({ phase: "launched", session: s })}
          />
        )}
      </div>
    </div>
  );
}

// ── determineStep ──────────────────────────────────────────────────────────

function determineStep(session: TeamFormation): Step {
  if (!session.survey_id) return 2;
  if (session.slot_mode === "numbered" && session.slot_count > 0) return 4;
  return 3;
}

// ── StepStepper ────────────────────────────────────────────────────────────

function StepStepper({
  currentStep,
  canGoTo,
  onStepClick,
}: {
  currentStep: Step;
  canGoTo: (s: Step) => boolean;
  onStepClick: (s: Step) => void;
}): JSX.Element {
  return (
    <>
      <ol className={styles.stepper} aria-label="Wizard steps">
        {([1, 2, 3, 4] as Step[]).map((s) => {
          const reachable = canGoTo(s);
          const active = currentStep === s;
          const done = currentStep > s;
          return (
            <li
              key={s}
              className={`${styles.stepperItem} ${active ? styles.stepperActive : done ? styles.stepperDone : ""}`}
            >
              <button
                type="button"
                className={styles.stepperBtn}
                onClick={() => reachable && onStepClick(s)}
                aria-current={active ? "step" : undefined}
                aria-disabled={!reachable}
                tabIndex={reachable ? 0 : -1}
              >
                <span className={styles.stepNum} aria-hidden="true">
                  {s}
                </span>
                <span className={styles.stepLabel}>{STEPS[s]}</span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className={styles.stepperMobile} aria-live="polite">
        Step {currentStep} of 4: {STEPS[currentStep]}
      </p>
    </>
  );
}

// ── Step 1 — Team Configuration ────────────────────────────────────────────

interface Step1Props {
  session: TeamFormation | null;
  onSave: (session: TeamFormation) => void;
}

function Step1Config({ session, onSave }: Step1Props): JSX.Element {
  const [title, setTitle] = useState(session?.title ?? "");
  const [description, setDescription] = useState(session?.description ?? "");
  const [numTeams, setNumTeams] = useState(session?.num_teams ?? 2);
  const [targetSize, setTargetSize] = useState(session?.target_team_size ?? 4);
  const [closesAtDate, setClosesAtDate] = useState(
    session?.closes_at ? epochToDate(session.closes_at) : "",
  );
  const [closesAtTime, setClosesAtTime] = useState(
    session?.closes_at ? epochToTime(session.closes_at) : "",
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const titleId = useId();
  const descId = useId();
  const numTeamsId = useId();
  const targetSizeId = useId();
  const closesAtId = useId();
  const closesAtTimeId = useId();
  const titleCountId = useId();
  const descCountId = useId();

  function validate(): boolean {
    const errs: Record<string, string> = {};
    if (!title.trim()) errs.title = "Title is required.";
    if (numTeams < 2) errs.numTeams = "Must be at least 2 teams.";
    if (targetSize < 1) errs.targetSize = "Must be at least 1 member per team.";
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function handleNext(): Promise<void> {
    if (!validate()) return;
    setBusy(true);
    setSaveError(null);
    try {
      const closes = dateTimeToEpoch(closesAtDate, closesAtTime);
      const body = {
        title: title.trim(),
        description: description.trim() || null,
        num_teams: numTeams,
        target_team_size: targetSize,
        slot_mode: "numbered" as const,
        slot_count: numTeams * targetSize,
        closes_at: closes,
      };
      const { session: saved } = session
        ? await updateSession(session.id, body)
        : await createSession(body);
      onSave(saved);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const expectedParticipants = numTeams * targetSize;

  return (
    <div className={styles.stepForm}>
      <div className={styles.field}>
        <label htmlFor={titleId}>
          Title <span className={styles.required} aria-label="required">*</span>
        </label>
        <input
          id={titleId}
          type="text"
          className={styles.input}
          value={title}
          maxLength={200}
          aria-describedby={`${titleCountId}${errors.title ? ` ${titleId}-err` : ""}`}
          aria-invalid={errors.title ? true : undefined}
          onChange={(e) => setTitle(e.target.value)}
        />
        <span id={titleCountId} className={styles.charCount} aria-live="polite">
          {title.length}/200
        </span>
        {errors.title && (
          <p id={`${titleId}-err`} className={styles.fieldError} role="alert">
            {errors.title}
          </p>
        )}
      </div>

      <div className={styles.field}>
        <label htmlFor={descId}>Description</label>
        <textarea
          id={descId}
          className={styles.textarea}
          value={description}
          maxLength={2000}
          rows={3}
          aria-describedby={descCountId}
          onChange={(e) => setDescription(e.target.value)}
        />
        <span id={descCountId} className={styles.charCount} aria-live="polite">
          {description.length}/2000
        </span>
      </div>

      <div className={styles.row}>
        <div className={styles.field}>
          <label htmlFor={numTeamsId}>
            Number of teams <span className={styles.required} aria-label="required">*</span>
          </label>
          <input
            id={numTeamsId}
            type="number"
            className={styles.input}
            value={numTeams}
            min={2}
            aria-invalid={errors.numTeams ? true : undefined}
            aria-describedby={errors.numTeams ? `${numTeamsId}-err` : undefined}
            onChange={(e) => setNumTeams(Math.max(2, Number(e.target.value)))}
          />
          {errors.numTeams && (
            <p id={`${numTeamsId}-err`} className={styles.fieldError} role="alert">
              {errors.numTeams}
            </p>
          )}
        </div>

        <div className={styles.field}>
          <label htmlFor={targetSizeId}>
            Target members/team <span className={styles.required} aria-label="required">*</span>
          </label>
          <input
            id={targetSizeId}
            type="number"
            className={styles.input}
            value={targetSize}
            min={1}
            aria-invalid={errors.targetSize ? true : undefined}
            aria-describedby={errors.targetSize ? `${targetSizeId}-err` : undefined}
            onChange={(e) => setTargetSize(Math.max(1, Number(e.target.value)))}
          />
          {errors.targetSize && (
            <p id={`${targetSizeId}-err`} className={styles.fieldError} role="alert">
              {errors.targetSize}
            </p>
          )}
        </div>
      </div>

      <p className={styles.helper}>
        Expected participants: <strong>{expectedParticipants}</strong>. Remainders distributed
        round-robin.
      </p>

      <div className={styles.field}>
        <label htmlFor={closesAtId}>Auto-close deadline</label>
        <div className={styles.dateTimeRow}>
          <input
            id={closesAtId}
            type="date"
            className={styles.input}
            aria-label="Deadline date"
            value={closesAtDate}
            onChange={(e) => setClosesAtDate(e.target.value)}
          />
          <input
            id={closesAtTimeId}
            type="time"
            className={styles.input}
            aria-label="Deadline time"
            value={closesAtTime}
            onChange={(e) => setClosesAtTime(e.target.value)}
          />
        </div>
        <span className={styles.helper}>
          Closes when all slots fill or this deadline passes, whichever is first. A date with no
          time closes at end of day.
        </span>
      </div>

      {saveError && (
        <p className={styles.saveError} role="alert">
          {saveError}
        </p>
      )}

      <div className={styles.navRow}>
        <div />
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => void handleNext()}
          disabled={busy}
        >
          {busy ? "Saving…" : "Next →"}
        </button>
      </div>
    </div>
  );
}

// ── Step 2 — Survey Setup ──────────────────────────────────────────────────

interface Step2Props {
  session: TeamFormation;
  onSurveyAttached: (session: TeamFormation) => void;
  onNext: () => void;
  onBack: () => void;
}

function Step2Survey({ session, onSurveyAttached, onNext, onBack }: Step2Props): JSX.Element {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<"select" | "edit">(
    session.survey_id ? "edit" : "select",
  );
  const [attachedSurveyId, setAttachedSurveyId] = useState<number | null>(session.survey_id);
  const [attachedTitle, setAttachedTitle] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);

  const selectTabId = useId();
  const editTabId = useId();
  const selectPanelId = useId();
  const editPanelId = useId();
  const builderRef = useRef<SurveyBuilderHandle>(null);

  async function attachSurvey(surveyId: number, title?: string): Promise<void> {
    setBusy(true);
    setAttachError(null);
    try {
      const { session: updated } = await updateSession(session.id, { survey_id: surveyId });
      setAttachedSurveyId(surveyId);
      if (title) setAttachedTitle(title);
      // Open the editor directly rather than showing an "attached" interstitial.
      setActiveTab("edit");
      onSurveyAttached(updated);
    } catch (err) {
      setAttachError(err instanceof Error ? err.message : "Failed to attach survey");
    } finally {
      setBusy(false);
    }
  }

  function handleSurveyCreated(newId: number): void {
    void attachSurvey(newId);
  }

  function handleSurveySelected(survey: Survey): void {
    // Fork public surveys not owned by current user so they can be edited
    if (user && survey.owner_id !== user.id) {
      setBusy(true);
      setAttachError(null);
      forkSurvey(survey.id)
        .then(({ survey: forked }) => attachSurvey(forked.id, forked.title))
        .catch((err: unknown) => {
          setAttachError(err instanceof Error ? err.message : "Failed to copy survey");
          setBusy(false);
        });
    } else {
      void attachSurvey(survey.id, survey.title);
    }
  }

  async function handleNext(): Promise<void> {
    if (!attachedSurveyId) {
      setNextError("Please attach a survey before continuing.");
      return;
    }
    setNextError(null);
    // Persist any unsaved survey edits before leaving the step
    if (activeTab === "edit" && builderRef.current) {
      setBusy(true);
      try {
        await builderRef.current.save();
      } catch (err) {
        setNextError(err instanceof Error ? err.message : "Failed to save survey");
        setBusy(false);
        return;
      }
      setBusy(false);
    }
    onNext();
  }

  const editLabel = attachedSurveyId ? "Edit Survey" : "Create New Survey";

  return (
    <div className={styles.stepForm}>
      <div className={styles.tabs} role="tablist" aria-label="Survey setup method">
        <button
          role="tab"
          id={selectTabId}
          aria-selected={activeTab === "select"}
          aria-controls={selectPanelId}
          className={activeTab === "select" ? styles.tabActive : styles.tab}
          type="button"
          onClick={() => setActiveTab("select")}
        >
          Select Survey
        </button>
        <button
          role="tab"
          id={editTabId}
          aria-selected={activeTab === "edit"}
          aria-controls={editPanelId}
          className={activeTab === "edit" ? styles.tabActive : styles.tab}
          type="button"
          onClick={() => setActiveTab("edit")}
        >
          {editLabel}
        </button>
      </div>

      {attachError && (
        <p className={styles.saveError} role="alert">
          {attachError}
        </p>
      )}

      <div
        role="tabpanel"
        id={selectPanelId}
        aria-labelledby={selectTabId}
        hidden={activeTab !== "select"}
      >
        {activeTab === "select" && (
          <SurveyLibrary
            embeddedInWizard
            onSelect={handleSurveySelected}
            onCreateNew={() => {
              setAttachedSurveyId(null);
              setAttachedTitle(null);
              setActiveTab("edit");
            }}
          />
        )}
      </div>
      <div
        role="tabpanel"
        id={editPanelId}
        aria-labelledby={editTabId}
        hidden={activeTab !== "edit"}
      >
        {activeTab === "edit" && (
          <>
            {attachedSurveyId && attachedTitle && (
              <p className={styles.editingNote}>
                Editing: <strong>{attachedTitle}</strong>
              </p>
            )}
            <SurveyBuilder
              ref={builderRef}
              surveyId={attachedSurveyId ?? undefined}
              onSurveyCreated={handleSurveyCreated}
            />
          </>
        )}
      </div>

      {nextError && (
        <p className={styles.saveError} role="alert">
          {nextError}
        </p>
      )}

      <div className={styles.navRow}>
        <button type="button" className={styles.secondaryBtn} onClick={onBack}>
          ← Back
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => void handleNext()}
          disabled={busy}
        >
          {busy ? "Saving…" : "Next →"}
        </button>
      </div>
    </div>
  );
}

// ── Step 3 — Access Control ────────────────────────────────────────────────

interface Step3Props {
  session: TeamFormation;
  aliases: Alias[];
  onSave: (session: TeamFormation, aliases: Alias[]) => void;
  onBack: () => void;
  onAliasesChange: (aliases: Alias[]) => void;
}

function Step3Access({ session, aliases, onSave, onBack, onAliasesChange }: Step3Props): JSX.Element {
  const [slotMode, setSlotMode] = useState<"numbered" | "named">(session.slot_mode);
  const [pendingMode, setPendingMode] = useState<"numbered" | "named" | null>(null);
  const [nameInput, setNameInput] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);
  const [importText, setImportText] = useState("");
  const [busy, setBusy] = useState(false);
  const [autofillBusy, setAutofillBusy] = useState(false);
  const [nextError, setNextError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const nameInputId = useId();
  const importId = useId();
  const countId = useId();

  const slotCount = session.num_teams * session.target_team_size;

  async function handleModeChange(mode: "numbered" | "named"): Promise<void> {
    if (mode === slotMode) return;
    const hasData = slotMode === "named" ? aliases.length > 0 : false;
    if (hasData) {
      setPendingMode(mode);
      return;
    }
    await commitModeChange(mode);
  }

  async function commitModeChange(mode: "numbered" | "named"): Promise<void> {
    setBusy(true);
    setSaveError(null);
    try {
      const { session: updated } = await updateSession(session.id, {
        slot_mode: mode,
        slot_count: slotCount,
      });
      setSlotMode(mode);
      setPendingMode(null);
      if (mode === "numbered") {
        onAliasesChange([]);
      }
      // Update parent session ref
      onSave(updated, mode === "numbered" ? [] : aliases);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to update mode");
    } finally {
      setBusy(false);
    }
  }

  async function addName(): Promise<void> {
    const name = nameInput.trim();
    if (!name) return;
    if (aliases.some((a) => a.display_name === name)) {
      setNameError(`"${name}" is already in the list.`);
      return;
    }
    setNameError(null);
    setBusy(true);
    try {
      const { alias } = await addAlias(session.id, name);
      onAliasesChange([...aliases, alias]);
      setNameInput("");
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to add name");
    } finally {
      setBusy(false);
    }
  }

  async function handleRemoveAlias(aliasId: number): Promise<void> {
    try {
      await removeAlias(session.id, aliasId);
      onAliasesChange(aliases.filter((a) => a.id !== aliasId));
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to remove name");
    }
  }

  async function handleImport(): Promise<void> {
    const names = importText
      .split("\n")
      .map((n) => n.trim())
      .filter(Boolean)
      .filter((n) => !aliases.some((a) => a.display_name === n));
    if (names.length === 0) {
      setImportText("");
      return;
    }
    setBusy(true);
    const added: Alias[] = [];
    for (const name of names) {
      try {
        const { alias } = await addAlias(session.id, name);
        added.push(alias);
      } catch {
        // skip duplicates or errors silently
      }
    }
    onAliasesChange([...aliases, ...added]);
    setImportText("");
    setBusy(false);
  }

  async function handleAutofill(): Promise<void> {
    const deficit = slotCount - aliases.length;
    if (deficit <= 0) return;
    setAutofillBusy(true);
    const added: Alias[] = [];
    for (let i = 0; i < deficit; i++) {
      const name = `Participant ${aliases.length + added.length + 1}`;
      try {
        const { alias } = await addAlias(session.id, name);
        added.push(alias);
      } catch {
        break;
      }
    }
    onAliasesChange([...aliases, ...added]);
    setAutofillBusy(false);
  }

  async function handleNext(): Promise<void> {
    if (slotMode === "named" && aliases.length !== slotCount) {
      setNextError(
        `Add ${slotCount - aliases.length} more name${slotCount - aliases.length === 1 ? "" : "s"} to continue.`,
      );
      return;
    }
    setNextError(null);
    setBusy(true);
    setSaveError(null);
    try {
      const { session: updated } = await updateSession(session.id, {
        slot_mode: slotMode,
        slot_count: slotCount,
      });
      onSave(updated, aliases);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  const inviteUrl = `${window.location.origin}/team-formation/join?code=${session.invite_code}`;

  async function copyInvite(): Promise<void> {
    await navigator.clipboard.writeText(inviteUrl);
  }

  return (
    <div className={styles.stepForm}>
      {pendingMode && (
        <div className={styles.modeWarning} role="alert">
          <p>
            Changing mode will clear all existing{" "}
            {slotMode === "named" ? "aliases" : "slot count"}. Continue?
          </p>
          <div className={styles.modeWarningBtns}>
            <button
              type="button"
              className={styles.primaryBtn}
              onClick={() => void commitModeChange(pendingMode)}
            >
              Yes, change
            </button>
            <button
              type="button"
              className={styles.secondaryBtn}
              onClick={() => setPendingMode(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <fieldset className={styles.modeFieldset}>
        <legend>Submission mode</legend>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name="slot_mode"
            value="numbered"
            checked={slotMode === "numbered"}
            onChange={() => void handleModeChange("numbered")}
          />
          <span>
            <strong>Numbered</strong> — Participants get an automatically assigned submission
            number. No setup required. Does not prevent the same person submitting more than once.
          </span>
        </label>
        <label className={styles.radioLabel}>
          <input
            type="radio"
            name="slot_mode"
            value="named"
            checked={slotMode === "named"}
            onChange={() => void handleModeChange("named")}
          />
          <span>
            <strong>Named</strong> — You enter a name for each participant. They select their name
            before responding. Does not verify identity or prevent selecting the wrong name or
            submitting under multiple names.
          </span>
        </label>
      </fieldset>

      {slotMode === "numbered" && (
        <p className={styles.slotCountNote}>
          Slots: <strong>{slotCount}</strong> ({session.num_teams} teams ×{" "}
          {session.target_team_size} members)
        </p>
      )}

      {slotMode === "named" && (
        <div className={styles.namedSection}>
          <div className={styles.field}>
            <label htmlFor={nameInputId}>Add participant name</label>
            <div className={styles.tagRow}>
              <input
                id={nameInputId}
                type="text"
                className={styles.input}
                value={nameInput}
                maxLength={100}
                aria-describedby={nameError ? `${nameInputId}-err` : undefined}
                aria-invalid={nameError ? true : undefined}
                onChange={(e) => {
                  setNameInput(e.target.value);
                  setNameError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addName();
                  }
                }}
              />
              <button
                type="button"
                className={styles.addBtn}
                onClick={() => void addName()}
                disabled={busy}
              >
                Add
              </button>
            </div>
            {nameError && (
              <p id={`${nameInputId}-err`} className={styles.fieldError} role="alert">
                {nameError}
              </p>
            )}
          </div>

          <p
            id={countId}
            className={aliases.length === slotCount ? styles.countOk : styles.countNote}
            aria-live="polite"
          >
            {aliases.length} of {slotCount} names added
          </p>

          {aliases.length > 0 && (
            <ul className={styles.aliasList} aria-label="Participant names">
              {aliases.map((a) => (
                <li key={a.id} className={styles.aliasChip}>
                  <span>{a.display_name}</span>
                  <button
                    type="button"
                    className={styles.removeAliasBtn}
                    aria-label={`Remove ${a.display_name}`}
                    onClick={() => void handleRemoveAlias(a.id)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}

          <div className={styles.aliasActions}>
            {aliases.length < slotCount && (
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => void handleAutofill()}
                disabled={autofillBusy}
              >
                {autofillBusy ? "Filling…" : "Auto-fill remaining"}
              </button>
            )}
          </div>

          <details className={styles.importDetails}>
            <summary className={styles.importSummary}>Import names…</summary>
            <div className={styles.importBody}>
              <label htmlFor={importId} className={styles.importLabel}>
                One name per line
              </label>
              <textarea
                id={importId}
                className={styles.textarea}
                rows={5}
                value={importText}
                onChange={(e) => setImportText(e.target.value)}
              />
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={() => void handleImport()}
                disabled={busy}
              >
                Import
              </button>
            </div>
          </details>
        </div>
      )}

      <div className={styles.inviteBox}>
        <p className={styles.inviteLabel}>Invite code</p>
        <div className={styles.inviteRow}>
          <code className={styles.inviteCode}>{session.invite_code}</code>
          <button
            type="button"
            className={styles.secondaryBtn}
            onClick={() => void copyInvite()}
          >
            Copy link
          </button>
        </div>
        <p className={styles.inviteUrl}>{inviteUrl}</p>
      </div>

      {saveError && (
        <p className={styles.saveError} role="alert">
          {saveError}
        </p>
      )}

      {nextError && (
        <p className={styles.saveError} role="alert">
          {nextError}
        </p>
      )}

      <div className={styles.navRow}>
        <button type="button" className={styles.secondaryBtn} onClick={onBack}>
          ← Back
        </button>
        <button
          type="button"
          className={styles.primaryBtn}
          onClick={() => void handleNext()}
          disabled={busy}
        >
          {busy ? "Saving…" : "Next →"}
        </button>
      </div>
    </div>
  );
}

// ── Step 4 — Review & Launch ───────────────────────────────────────────────

interface Step4Props {
  session: TeamFormation;
  aliases: Alias[];
  onBack: () => void;
  onLaunched: (session: TeamFormation) => void;
}

function Step4Review({ session, aliases, onBack, onLaunched }: Step4Props): JSX.Element {
  const [hasAvoidRespondent, setHasAvoidRespondent] = useState(false);
  const [surveyTitle, setSurveyTitle] = useState<string | null>(null);
  const [blockCount, setBlockCount] = useState<number | null>(null);

  const [showModal, setShowModal] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [launching, setLaunching] = useState(false);
  const [launchError, setLaunchError] = useState<string | null>(null);

  const launchBtnRef = useRef<HTMLButtonElement>(null);
  const checkboxRef = useRef<HTMLInputElement>(null);
  const modalTitleId = useId();

  useEffect(() => {
    if (!session.survey_id) return;
    fetchSurveyWithQuestions(session.survey_id)
      .then(({ survey, questions }) => {
        setSurveyTitle(survey.title);
        setBlockCount(questions.length);
        setHasAvoidRespondent(questions.some((q) => q.block_type === "avoid_respondent"));
      })
      .catch(() => null);
  }, [session.survey_id]);

  // Focus trap for modal
  useEffect(() => {
    if (!showModal) return;
    checkboxRef.current?.focus();

    function trapFocus(e: KeyboardEvent): void {
      if (e.key === "Escape") {
        e.preventDefault();
        closeModal();
        return;
      }
      if (e.key !== "Tab") return;
      const modal = document.getElementById("launch-modal-box");
      if (!modal) return;
      const focusable = modal.querySelectorAll<HTMLElement>(
        'button, input, [tabindex]:not([tabindex="-1"])',
      );
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    document.addEventListener("keydown", trapFocus);
    return () => document.removeEventListener("keydown", trapFocus);
  }, [showModal]); // eslint-disable-line react-hooks/exhaustive-deps

  function closeModal(): void {
    setShowModal(false);
    setConfirmed(false);
    setLaunchError(null);
    launchBtnRef.current?.focus();
  }

  async function handleLaunch(): Promise<void> {
    if (!confirmed) return;
    setLaunching(true);
    setLaunchError(null);
    try {
      const { session: launched } = await launchSession(session.id);
      setShowModal(false);
      onLaunched(launched);
    } catch (err) {
      setLaunchError(err instanceof Error ? err.message : "Launch failed");
    } finally {
      setLaunching(false);
    }
  }

  const slotCount = session.slot_mode === "numbered"
    ? session.num_teams * session.target_team_size
    : aliases.length;

  const closesAtStr = session.closes_at
    ? new Date(session.closes_at * 1000).toLocaleString()
    : "None";

  return (
    <div className={styles.stepForm}>
      <h2 className={styles.reviewHeading}>Session Summary</h2>

      <dl className={styles.summary}>
        <div className={styles.summaryRow}>
          <dt>Title</dt>
          <dd>{session.title}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>Teams</dt>
          <dd>{session.num_teams}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>Target size</dt>
          <dd>{session.target_team_size} members/team</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>Mode</dt>
          <dd>{session.slot_mode === "numbered" ? "Numbered" : "Named"}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>Slots</dt>
          <dd>{slotCount}</dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>Survey</dt>
          <dd>
            {surveyTitle
              ? `${surveyTitle}${blockCount !== null ? ` (${blockCount} block${blockCount === 1 ? "" : "s"})` : ""}`
              : session.survey_id
              ? "Loading…"
              : "None"}
          </dd>
        </div>
        <div className={styles.summaryRow}>
          <dt>Auto-close</dt>
          <dd>{closesAtStr}</dd>
        </div>
      </dl>

      {hasAvoidRespondent && session.slot_mode === "numbered" && (
        <div className={styles.bannerAmber} role="note">
          Your survey contains avoid-respondent blocks. These will be hidden from participants
          in Numbered mode.
        </div>
      )}

      {hasAvoidRespondent && session.slot_mode === "named" && (
        <div className={styles.bannerInfo} role="note">
          Avoid-respondent blocks will be shown to participants.
        </div>
      )}

      <div className={styles.navRow}>
        <button type="button" className={styles.secondaryBtn} onClick={onBack}>
          ← Back
        </button>
        <button
          ref={launchBtnRef}
          type="button"
          className={styles.launchBtn}
          onClick={() => setShowModal(true)}
        >
          Launch Session
        </button>
      </div>

      {showModal && (
        <div className={styles.modalOverlay}>
          <div
            className={styles.modalBackdrop}
            onClick={closeModal}
            aria-hidden="true"
          />
          <div
            id="launch-modal-box"
            role="dialog"
            aria-modal="true"
            aria-labelledby={modalTitleId}
            className={styles.modalBox}
          >
            <h2 id={modalTitleId} className={styles.modalTitle}>
              Launch session?
            </h2>
            <p>
              Once launched, the survey cannot be edited. Participants will see it exactly as it
              is now. This cannot be undone.
            </p>
            <label className={styles.confirmLabel}>
              <input
                ref={checkboxRef}
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              I understand the survey is now locked.
            </label>
            {launchError && (
              <p className={styles.saveError} role="alert">
                {launchError}
              </p>
            )}
            <div className={styles.modalActions}>
              <button
                type="button"
                className={styles.secondaryBtn}
                onClick={closeModal}
              >
                Cancel
              </button>
              <button
                type="button"
                className={styles.launchBtn}
                disabled={!confirmed || launching}
                onClick={() => void handleLaunch()}
              >
                {launching ? "Launching…" : "Launch"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── PostLaunchScreen ───────────────────────────────────────────────────────

function PostLaunchScreen({ session }: { session: TeamFormation }): JSX.Element {
  const inviteUrl = `${window.location.origin}/team-formation/join?code=${session.invite_code}`;

  async function copyInvite(): Promise<void> {
    await navigator.clipboard.writeText(inviteUrl);
  }

  return (
    <div className={styles.postLaunch}>
      <h1>Session launched!</h1>
      <p>Share this invite code with participants:</p>
      <div className={styles.postLaunchCode}>
        <code className={styles.bigInviteCode}>{session.invite_code}</code>
        <button
          type="button"
          className={styles.secondaryBtn}
          onClick={() => void copyInvite()}
        >
          Copy link
        </button>
      </div>
      <p className={styles.postLaunchUrl}>
        Or share the link:{" "}
        <a href={inviteUrl} className={styles.inviteLink}>
          {inviteUrl}
        </a>
      </p>
      <p className={styles.postLaunchNext}>
        Participants can now access the survey using this code. Once all responses are collected,
        return here to run the team formation algorithm.
      </p>
      <Link to="/team-formation" className={styles.secondaryBtn}>
        ← Back to dashboard
      </Link>
    </div>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────

function epochToDate(epoch: number): string {
  const d = new Date(epoch * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function epochToTime(epoch: number): string {
  const d = new Date(epoch * 1000);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Combine a date (YYYY-MM-DD) and time (HH:MM) into an epoch. A date with no
// time defaults to end-of-day; an empty date yields null (no deadline).
function dateTimeToEpoch(date: string, time: string): number | null {
  if (!date) return null;
  const t = time || "23:59";
  return Math.floor(new Date(`${date}T${t}`).getTime() / 1000);
}
