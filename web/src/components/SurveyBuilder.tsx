import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  type BlockType,
  type Survey,
  type SurveyQuestion,
  addQuestion,
  createSurvey,
  deleteQuestion,
  fetchSurveyWithQuestions,
  reorderQuestions,
  updateQuestion,
  updateSurvey,
} from "../lib/surveyApi.js";
import styles from "./SurveyBuilder.module.css";

// ── Types ──────────────────────────────────────────────────────────────────

interface BuilderQuestion {
  localId: string;
  id?: number;
  sort_order: number;
  block_type: BlockType;
  prompt: string;
  config: Record<string, unknown>;
  dirty: boolean;
  unsaveableReason?: string;
}

type BuilderState =
  | { phase: "loading" }
  | {
      phase: "ready";
      survey: Survey;
      questions: BuilderQuestion[];
      saved: boolean;
      saveError: string | null;
    }
  | { phase: "error"; message: string };

type PreviewMode = "numbered" | "named" | null;

const BLOCK_LABELS: Record<BlockType, string> = {
  skill_selection: "Skill Selection",
  skill_level: "Skill Level",
  written_answer: "Written Answer",
  negative_skill: "Negative Skill",
  avoid_respondent: "Avoid Respondent",
  custom_scale: "Custom Scale",
  multiple_choice: "Multiple Choice",
};

const DEFAULT_CONFIGS: Record<BlockType, Record<string, unknown>> = {
  skill_selection: { skills: [], multi: false },
  skill_level: { parent_question_id: null, min: 1, max: 10 },
  written_answer: { max_chars: 500, placeholder: "" },
  negative_skill: { skills: [], multi: false },
  avoid_respondent: { label: "People I'd prefer not to be grouped with" },
  custom_scale: { min: 1, max: 5, min_label: "", max_label: "" },
  multiple_choice: { options: [], allow_multiple: false },
};

// ── Props ──────────────────────────────────────────────────────────────────

interface Props {
  surveyId?: number;
  onSurveyCreated?: (id: number) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function localId(): string {
  return crypto.randomUUID();
}

function toBuilderQuestion(q: SurveyQuestion): BuilderQuestion {
  return {
    localId: localId(),
    id: q.id,
    sort_order: q.sort_order,
    block_type: q.block_type as BlockType,
    prompt: q.prompt,
    config: q.config,
    dirty: false,
  };
}

function validateSkillLevels(questions: BuilderQuestion[]): BuilderQuestion[] {
  return questions.map((q, idx) => {
    if (q.block_type !== "skill_level") return { ...q, unsaveableReason: undefined };
    const parentIdx = [...questions.slice(0, idx)]
      .reverse()
      .findIndex((prev) => prev.block_type === "skill_selection");
    if (parentIdx === -1) {
      return {
        ...q,
        unsaveableReason: "A Skill Selection block must appear above this block",
        config: { ...q.config, parent_question_id: null },
      };
    }
    const parent = [...questions.slice(0, idx)].reverse()[parentIdx]!;
    return {
      ...q,
      unsaveableReason: undefined,
      config: { ...q.config, parent_question_id: parent.id ?? null },
    };
  });
}

// ── Main component ──────────────────────────────────────────────────────────

export function SurveyBuilder({ surveyId, onSurveyCreated }: Props): JSX.Element {
  const [state, setState] = useState<BuilderState>({ phase: "loading" });
  const [previewMode, setPreviewMode] = useState<PreviewMode>(null);
  const [deletingLocalId, setDeletingLocalId] = useState<string | null>(null);
  const [dragState, setDragState] = useState<{
    localId: string;
    fromIndex: number;
    toIndex: number;
  } | null>(null);
  const dragOverRef = useRef<string | null>(null);

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const liveRegionRef = useRef<HTMLDivElement | null>(null);

  // ── Load ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!surveyId) {
      setState({
        phase: "ready",
        survey: {
          id: 0,
          owner_id: 0,
          owner_username: "",
          title: "",
          description: null,
          is_public: 0,
          is_approved: 0,
          tags: [],
          created_at: 0,
          updated_at: 0,
        },
        questions: [],
        saved: false,
        saveError: null,
      });
      return;
    }
    let cancelled = false;
    fetchSurveyWithQuestions(surveyId)
      .then(({ survey, questions }) => {
        if (!cancelled) {
          setState({
            phase: "ready",
            survey,
            questions: validateSkillLevels(questions.map(toBuilderQuestion)),
            saved: true,
            saveError: null,
          });
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : "Failed to load survey";
          setState({ phase: "error", message: msg });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [surveyId]);

  // ── Auto-save (600ms debounce on blur) ───────────────────────────────────

  const triggerSave = useCallback(() => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      void performSave();
    }, 600);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function performSave(): Promise<void> {
    setState((prev) => {
      if (prev.phase !== "ready") return prev;
      return { ...prev, saveError: null };
    });

    let currentState: BuilderState | null = null;
    setState((prev) => {
      currentState = prev;
      return prev;
    });

    if (!currentState || (currentState as BuilderState).phase !== "ready") return;
    const s = currentState as Extract<BuilderState, { phase: "ready" }>;

    try {
      let surveyData = s.survey;

      if (surveyData.id === 0) {
        const { survey } = await createSurvey({
          title: surveyData.title || "Untitled Survey",
          description: surveyData.description,
          is_public: Boolean(surveyData.is_public),
          tags: surveyData.tags,
        });
        surveyData = survey;
        onSurveyCreated?.(survey.id);
      } else {
        const { survey } = await updateSurvey(surveyData.id, {
          title: surveyData.title,
          description: surveyData.description,
          is_public: Boolean(surveyData.is_public),
          tags: surveyData.tags,
        });
        surveyData = survey;
      }

      const updatedQuestions: BuilderQuestion[] = [];
      for (const q of s.questions) {
        if (q.unsaveableReason) {
          updatedQuestions.push(q);
          continue;
        }
        if (!q.dirty) {
          updatedQuestions.push(q);
          continue;
        }
        if (!q.id) {
          const { question } = await addQuestion(surveyData.id, {
            block_type: q.block_type,
            prompt: q.prompt,
            config: q.config,
          });
          updatedQuestions.push({ ...q, id: question.id, dirty: false });
        } else {
          await updateQuestion(surveyData.id, q.id, { prompt: q.prompt, config: q.config });
          updatedQuestions.push({ ...q, dirty: false });
        }
      }

      const savedIds = updatedQuestions
        .filter((q) => q.id !== undefined)
        .map((q) => q.id as number);
      if (savedIds.length > 0) {
        await reorderQuestions(surveyData.id, savedIds);
      }

      // Re-validate skill_level parent links now that all blocks have DB IDs
      const revalidated = validateSkillLevels(updatedQuestions);
      const finalQuestions: BuilderQuestion[] = [];
      for (let i = 0; i < revalidated.length; i++) {
        const orig = updatedQuestions[i]!;
        const fixed = revalidated[i]!;
        if (
          fixed.block_type === "skill_level" &&
          fixed.id &&
          fixed.config.parent_question_id !== orig.config.parent_question_id &&
          fixed.config.parent_question_id !== null
        ) {
          await updateQuestion(surveyData.id, fixed.id, { config: fixed.config });
          finalQuestions.push({ ...fixed, dirty: false });
        } else {
          finalQuestions.push(fixed);
        }
      }

      setState({
        phase: "ready",
        survey: surveyData,
        questions: finalQuestions,
        saved: true,
        saveError: null,
      });

      if (savedHideTimerRef.current) clearTimeout(savedHideTimerRef.current);
      savedHideTimerRef.current = setTimeout(() => {
        setState((prev) => (prev.phase === "ready" ? { ...prev, saved: false } : prev));
      }, 3000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Save failed";
      setState((prev) =>
        prev.phase === "ready" ? { ...prev, saveError: msg } : prev,
      );
    }
  }

  // ── Block operations ──────────────────────────────────────────────────────

  function addBlock(type: BlockType): void {
    setState((prev) => {
      if (prev.phase !== "ready") return prev;
      const newQ: BuilderQuestion = {
        localId: localId(),
        sort_order: prev.questions.length,
        block_type: type,
        prompt: "",
        config: { ...DEFAULT_CONFIGS[type] },
        dirty: true,
      };
      const updated = validateSkillLevels([...prev.questions, newQ]);
      return { ...prev, questions: updated };
    });
  }

  function updateBlock(lId: string, patch: Partial<Pick<BuilderQuestion, "prompt" | "config">>): void {
    setState((prev) => {
      if (prev.phase !== "ready") return prev;
      const updated = validateSkillLevels(
        prev.questions.map((q) =>
          q.localId === lId ? { ...q, ...patch, dirty: true } : q,
        ),
      );
      return { ...prev, questions: updated };
    });
  }

  function moveBlock(index: number, dir: -1 | 1): void {
    setState((prev) => {
      if (prev.phase !== "ready") return prev;
      const qs = [...prev.questions];
      const target = index + dir;
      if (target < 0 || target >= qs.length) return prev;
      [qs[index], qs[target]] = [qs[target]!, qs[index]!];
      const updated = validateSkillLevels(
        qs.map((q, i) => ({ ...q, sort_order: i, dirty: true })),
      );
      return { ...prev, questions: updated };
    });
    triggerSave();
  }

  function confirmDelete(lId: string): void {
    setState((prev) => {
      if (prev.phase !== "ready") return prev;
      const q = prev.questions.find((q) => q.localId === lId);
      if (!q) return prev;

      let idsToDelete: number[] = [q.id].filter(Boolean) as number[];

      if (q.block_type === "skill_selection") {
        const linked = prev.questions.filter(
          (lq) =>
            lq.block_type === "skill_level" &&
            lq.config.parent_question_id === q.id,
        );
        idsToDelete = [...idsToDelete, ...linked.map((l) => l.id).filter(Boolean) as number[]];
      }

      void (async () => {
        if (prev.phase !== "ready") return;
        const surveyId = prev.survey.id;
        for (const id of idsToDelete) {
          await deleteQuestion(surveyId, id);
        }
        setState((cur) => {
          if (cur.phase !== "ready") return cur;
          const linkerIds =
            q.block_type === "skill_selection"
              ? cur.questions
                  .filter(
                    (lq) =>
                      lq.block_type === "skill_level" &&
                      lq.config.parent_question_id === q.id,
                  )
                  .map((lq) => lq.localId)
              : [];
          const filtered = cur.questions.filter(
            (cq) => cq.localId !== lId && !linkerIds.includes(cq.localId),
          );
          return { ...cur, questions: validateSkillLevels(filtered) };
        });
      })();
      return prev;
    });
    setDeletingLocalId(null);
  }

  // ── Drag-and-drop (native HTML5) ─────────────────────────────────────────

  function handleDragStart(e: React.DragEvent, lId: string, fromIndex: number): void {
    e.dataTransfer.effectAllowed = "move";
    dragOverRef.current = lId;
    setDragState({ localId: lId, fromIndex, toIndex: fromIndex });
  }

  function handleDragOver(e: React.DragEvent, toIndex: number): void {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragState((prev) => (prev ? { ...prev, toIndex } : null));
  }

  function handleDrop(e: React.DragEvent): void {
    e.preventDefault();
    if (!dragState) return;
    const { fromIndex, toIndex } = dragState;
    setDragState(null);
    if (fromIndex === toIndex) return;
    setState((prev) => {
      if (prev.phase !== "ready") return prev;
      const qs = [...prev.questions];
      const [moved] = qs.splice(fromIndex, 1);
      if (!moved) return prev;
      qs.splice(toIndex, 0, moved);
      return {
        ...prev,
        questions: validateSkillLevels(qs.map((q, i) => ({ ...q, sort_order: i, dirty: true }))),
      };
    });
    triggerSave();
  }

  // ── Keyboard-sortable drag handle ─────────────────────────────────────────

  function handleHandleKeyDown(
    e: React.KeyboardEvent,
    lId: string,
    index: number,
    totalLen: number,
  ): void {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault();
      if (!dragState) {
        setDragState({ localId: lId, fromIndex: index, toIndex: index });
        announce(`Grabbed. Current position ${index + 1} of ${totalLen}. Use arrow keys to move.`);
      } else {
        const { fromIndex, toIndex } = dragState;
        setDragState(null);
        if (fromIndex !== toIndex) {
          setState((prev) => {
            if (prev.phase !== "ready") return prev;
            const qs = [...prev.questions];
            const [moved] = qs.splice(fromIndex, 1);
            if (!moved) return prev;
            qs.splice(toIndex, 0, moved);
            return {
              ...prev,
              questions: validateSkillLevels(
                qs.map((q, i) => ({ ...q, sort_order: i, dirty: true })),
              ),
            };
          });
          triggerSave();
        }
        announce("Dropped.");
      }
    } else if (e.key === "Escape") {
      e.preventDefault();
      setDragState(null);
      announce("Cancelled.");
    } else if (e.key === "ArrowUp" && dragState) {
      e.preventDefault();
      const next = Math.max(0, dragState.toIndex - 1);
      setDragState({ ...dragState, toIndex: next });
      announce(`Position ${next + 1} of ${totalLen}.`);
    } else if (e.key === "ArrowDown" && dragState) {
      e.preventDefault();
      const next = Math.min(totalLen - 1, dragState.toIndex + 1);
      setDragState({ ...dragState, toIndex: next });
      announce(`Position ${next + 1} of ${totalLen}.`);
    }
  }

  function announce(msg: string): void {
    if (liveRegionRef.current) {
      liveRegionRef.current.textContent = "";
      setTimeout(() => {
        if (liveRegionRef.current) liveRegionRef.current.textContent = msg;
      }, 50);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (state.phase === "loading") {
    return <p className={styles.message}>Loading survey…</p>;
  }
  if (state.phase === "error") {
    return (
      <p className={styles.message} role="alert">
        {state.message}
      </p>
    );
  }

  const { survey, questions, saved, saveError } = state;

  const reorderedQuestions = dragState
    ? (() => {
        const qs = [...questions];
        const [moved] = qs.splice(dragState.fromIndex, 1);
        if (moved) qs.splice(dragState.toIndex, 0, moved);
        return qs;
      })()
    : questions;

  return (
    <div className={styles.root}>
      <div
        ref={liveRegionRef}
        aria-live="assertive"
        aria-atomic="true"
        className={styles.srOnly}
      />

      <div className={styles.metaSection}>
        <MetaFields
          survey={survey}
          onChange={(patch) =>
            setState((prev) =>
              prev.phase === "ready" ? { ...prev, survey: { ...prev.survey, ...patch } } : prev,
            )
          }
          onBlur={triggerSave}
        />
        <div className={styles.saveStatus} aria-live="polite">
          {saved && <span className={styles.savedMsg}>Saved</span>}
          {saveError && (
            <span className={styles.saveErr} role="alert">
              {saveError}
            </span>
          )}
        </div>
      </div>

      <div className={styles.previewToggle}>
        <span id="preview-label">Preview as respondent:</span>
        <button
          type="button"
          aria-pressed={previewMode === "numbered"}
          className={previewMode === "numbered" ? styles.previewBtnActive : styles.previewBtn}
          onClick={() => setPreviewMode((m) => (m === "numbered" ? null : "numbered"))}
          aria-describedby="preview-label"
        >
          Numbered
        </button>
        <button
          type="button"
          aria-pressed={previewMode === "named"}
          className={previewMode === "named" ? styles.previewBtnActive : styles.previewBtn}
          onClick={() => setPreviewMode((m) => (m === "named" ? null : "named"))}
          aria-describedby="preview-label"
        >
          Named
        </button>
      </div>

      {previewMode && (
        <PreviewPanel questions={questions} mode={previewMode} />
      )}

      <div className={styles.blockList}>
        {reorderedQuestions.map((q, idx) => {
          const actualIndex = questions.findIndex((aq) => aq.localId === q.localId);
          const isBeingDragged = dragState?.localId === q.localId;
          const isDeleteTarget = deletingLocalId === q.localId;

          const linkedSkillLevel =
            q.block_type === "skill_selection"
              ? questions.filter(
                  (lq) =>
                    lq.block_type === "skill_level" &&
                    lq.config.parent_question_id === q.id,
                )
              : [];

          return (
            <div
              key={q.localId}
              className={`${styles.block} ${isBeingDragged ? styles.blockDragging : ""}`}
              draggable
              onDragStart={(e) => handleDragStart(e, q.localId, actualIndex)}
              onDragOver={(e) => handleDragOver(e, idx)}
              onDrop={handleDrop}
              onDragEnd={() => setDragState(null)}
            >
              <div className={styles.blockHeader}>
                <button
                  type="button"
                  className={styles.dragHandle}
                  role="button"
                  tabIndex={0}
                  aria-roledescription="sortable item"
                  aria-description="Press Space to grab, arrow keys to move, Space or Enter to drop, Escape to cancel"
                  aria-label={`Drag handle for block ${idx + 1}: ${BLOCK_LABELS[q.block_type]}`}
                  onKeyDown={(e) =>
                    handleHandleKeyDown(e, q.localId, actualIndex, questions.length)
                  }
                >
                  ⠿
                </button>
                <span className={styles.blockType}>{BLOCK_LABELS[q.block_type]}</span>
                <div className={styles.blockActions}>
                  <button
                    type="button"
                    className={styles.moveBtn}
                    onClick={() => moveBlock(actualIndex, -1)}
                    disabled={actualIndex === 0}
                    aria-label={`Move block ${idx + 1} up`}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className={styles.moveBtn}
                    onClick={() => moveBlock(actualIndex, 1)}
                    disabled={actualIndex === questions.length - 1}
                    aria-label={`Move block ${idx + 1} down`}
                  >
                    ↓
                  </button>
                  {!isDeleteTarget && (
                    <button
                      type="button"
                      className={styles.deleteBtn}
                      onClick={() => setDeletingLocalId(q.localId)}
                      aria-label={`Delete block ${idx + 1}`}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>

              {isDeleteTarget && (
                <div className={styles.deleteConfirm} role="alert">
                  {linkedSkillLevel.length > 0 ? (
                    <span>
                      This will also delete {linkedSkillLevel.length} linked Skill Level block
                      {linkedSkillLevel.length > 1 ? "s" : ""}. Continue?
                    </span>
                  ) : (
                    <span>Delete this block?</span>
                  )}
                  <button
                    type="button"
                    className={styles.confirmYes}
                    onClick={() => confirmDelete(q.localId)}
                  >
                    Yes
                  </button>
                  <button
                    type="button"
                    className={styles.confirmNo}
                    onClick={() => setDeletingLocalId(null)}
                  >
                    No
                  </button>
                </div>
              )}

              {q.unsaveableReason && (
                <div className={styles.blockError} role="alert">
                  {q.unsaveableReason}
                </div>
              )}

              {q.block_type === "avoid_respondent" && (
                <div className={styles.blockInfo}>
                  In Numbered mode sessions this block will not be shown to participants.
                </div>
              )}

              <BlockConfig
                question={q}
                allQuestions={questions}
                onChange={(patch) => {
                  updateBlock(q.localId, patch);
                  triggerSave();
                }}
                onBlur={triggerSave}
              />
            </div>
          );
        })}
      </div>

      <AddBlockMenu onAdd={addBlock} />
    </div>
  );
}

// ── MetaFields ─────────────────────────────────────────────────────────────

interface MetaFieldsProps {
  survey: Survey;
  onChange: (patch: Partial<Survey>) => void;
  onBlur: () => void;
}

function MetaFields({ survey, onChange, onBlur }: MetaFieldsProps): JSX.Element {
  const [tagInput, setTagInput] = useState("");
  const titleId = useId();
  const descId = useId();

  function addTag(): void {
    const tag = tagInput.trim();
    if (!tag || survey.tags.includes(tag) || survey.tags.length >= 10) return;
    onChange({ tags: [...survey.tags, tag] });
    setTagInput("");
  }

  function removeTag(tag: string): void {
    onChange({ tags: survey.tags.filter((t) => t !== tag) });
  }

  return (
    <div className={styles.metaFields}>
      <div className={styles.field}>
        <label htmlFor={titleId}>Title</label>
        <input
          id={titleId}
          type="text"
          className={styles.input}
          value={survey.title}
          maxLength={200}
          onChange={(e) => onChange({ title: e.target.value })}
          onBlur={onBlur}
        />
      </div>

      <div className={styles.field}>
        <label htmlFor={descId}>Description</label>
        <textarea
          id={descId}
          className={styles.textarea}
          value={survey.description ?? ""}
          maxLength={2000}
          rows={3}
          onChange={(e) => onChange({ description: e.target.value || null })}
          onBlur={onBlur}
        />
      </div>

      <div className={styles.field}>
        <fieldset className={styles.checkFieldset}>
          <legend>Visibility</legend>
          <label className={styles.checkLabel}>
            <input
              type="checkbox"
              checked={Boolean(survey.is_public)}
              onChange={(e) => {
                onChange({ is_public: e.target.checked ? 1 : 0 });
                onBlur();
              }}
            />
            Submit for public library
          </label>
          {Boolean(survey.is_public) && !Boolean(survey.is_approved) && (
            <p className={styles.configNote} style={{ marginTop: "0.35rem" }}>
              Awaiting admin approval before appearing in library.
            </p>
          )}
          {Boolean(survey.is_public) && Boolean(survey.is_approved) && (
            <p className={styles.configNote} style={{ marginTop: "0.35rem" }}>
              Approved — visible in library.
            </p>
          )}
        </fieldset>
      </div>

      <div className={styles.field}>
        <label htmlFor="survey-tags">Tags</label>
        <div className={styles.tagRow}>
          <input
            id="survey-tags"
            type="text"
            className={styles.input}
            placeholder="Add tag…"
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addTag();
              }
            }}
            onBlur={onBlur}
          />
          <button type="button" className={styles.addTagBtn} onClick={addTag}>
            Add
          </button>
        </div>
        {survey.tags.length > 0 && (
          <ul className={styles.tagList} aria-label="Survey tags">
            {survey.tags.map((t) => (
              <li key={t} className={styles.tagChip}>
                <span>#{t}</span>
                <button
                  type="button"
                  aria-label={`Remove tag ${t}`}
                  className={styles.removeTag}
                  onClick={() => removeTag(t)}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// ── AddBlockMenu ───────────────────────────────────────────────────────────

interface AddBlockMenuProps {
  onAdd: (type: BlockType) => void;
}

const BLOCK_TYPES: BlockType[] = [
  "skill_selection",
  "skill_level",
  "written_answer",
  "negative_skill",
  "avoid_respondent",
  "custom_scale",
  "multiple_choice",
];

function AddBlockMenu({ onAdd }: AddBlockMenuProps): JSX.Element {
  return (
    <div className={styles.addMenu}>
      <span className={styles.addLabel}>Add block:</span>
      {BLOCK_TYPES.map((type) => (
        <button
          key={type}
          type="button"
          className={styles.addBlockBtn}
          onClick={() => onAdd(type)}
        >
          + {BLOCK_LABELS[type]}
        </button>
      ))}
    </div>
  );
}

// ── BlockConfig ────────────────────────────────────────────────────────────

interface BlockConfigProps {
  question: BuilderQuestion;
  allQuestions: BuilderQuestion[];
  onChange: (patch: Partial<Pick<BuilderQuestion, "prompt" | "config">>) => void;
  onBlur: () => void;
}

function BlockConfig({ question, allQuestions, onChange, onBlur }: BlockConfigProps): JSX.Element {
  const promptId = useId();
  const { block_type: type, prompt, config } = question;

  const promptField = (
    <div className={styles.field}>
      <label htmlFor={promptId}>Prompt</label>
      <input
        id={promptId}
        type="text"
        className={styles.input}
        value={prompt}
        maxLength={500}
        onChange={(e) => onChange({ prompt: e.target.value })}
        onBlur={onBlur}
      />
    </div>
  );

  if (type === "skill_selection" || type === "negative_skill") {
    return (
      <div className={`${styles.configSection} ${type === "negative_skill" ? styles.negativeSkill : ""}`}>
        {promptField}
        <SkillListConfig
          config={config}
          onChange={(cfg) => {
            onChange({ config: cfg });
            onBlur();
          }}
        />
      </div>
    );
  }

  if (type === "skill_level") {
    const parentQ = allQuestions.find(
      (q) => q.id !== undefined && q.id === config.parent_question_id,
    );
    return (
      <div className={styles.configSection}>
        {promptField}
        <p className={styles.configNote}>
          {parentQ
            ? `Linked to: "${parentQ.prompt || "(no prompt)"}" (Skill Selection)`
            : "No linked Skill Selection found above."}
        </p>
        <p className={styles.configNote}>Scale: 1–10 (fixed)</p>
      </div>
    );
  }

  if (type === "written_answer") {
    const maxCharsId = useId();
    const placeholderId = useId();
    return (
      <div className={styles.configSection}>
        {promptField}
        <div className={styles.field}>
          <label htmlFor={maxCharsId}>Max characters (50–5000)</label>
          <input
            id={maxCharsId}
            type="number"
            className={styles.input}
            min={50}
            max={5000}
            value={(config.max_chars as number) ?? 500}
            onChange={(e) =>
              onChange({ config: { ...config, max_chars: Number(e.target.value) } })
            }
            onBlur={onBlur}
          />
        </div>
        <div className={styles.field}>
          <label htmlFor={placeholderId}>Placeholder text</label>
          <input
            id={placeholderId}
            type="text"
            className={styles.input}
            value={(config.placeholder as string) ?? ""}
            maxLength={200}
            onChange={(e) =>
              onChange({ config: { ...config, placeholder: e.target.value } })
            }
            onBlur={onBlur}
          />
        </div>
      </div>
    );
  }

  if (type === "avoid_respondent") {
    const labelId = useId();
    return (
      <div className={styles.configSection}>
        {promptField}
        <div className={styles.field}>
          <label htmlFor={labelId}>Field label</label>
          <input
            id={labelId}
            type="text"
            className={styles.input}
            value={(config.label as string) ?? "People I'd prefer not to be grouped with"}
            maxLength={200}
            onChange={(e) => onChange({ config: { ...config, label: e.target.value } })}
            onBlur={onBlur}
          />
        </div>
      </div>
    );
  }

  if (type === "custom_scale") {
    const minId = useId();
    const maxId = useId();
    const minLabelId = useId();
    const maxLabelId = useId();
    return (
      <div className={styles.configSection}>
        {promptField}
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor={minId}>Min value</label>
            <input
              id={minId}
              type="number"
              className={styles.input}
              value={(config.min as number) ?? 1}
              onChange={(e) => onChange({ config: { ...config, min: Number(e.target.value) } })}
              onBlur={onBlur}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={maxId}>Max value</label>
            <input
              id={maxId}
              type="number"
              className={styles.input}
              value={(config.max as number) ?? 5}
              onChange={(e) => onChange({ config: { ...config, max: Number(e.target.value) } })}
              onBlur={onBlur}
            />
          </div>
        </div>
        <div className={styles.row}>
          <div className={styles.field}>
            <label htmlFor={minLabelId}>Min label</label>
            <input
              id={minLabelId}
              type="text"
              className={styles.input}
              value={(config.min_label as string) ?? ""}
              maxLength={100}
              onChange={(e) =>
                onChange({ config: { ...config, min_label: e.target.value } })
              }
              onBlur={onBlur}
            />
          </div>
          <div className={styles.field}>
            <label htmlFor={maxLabelId}>Max label</label>
            <input
              id={maxLabelId}
              type="text"
              className={styles.input}
              value={(config.max_label as string) ?? ""}
              maxLength={100}
              onChange={(e) =>
                onChange({ config: { ...config, max_label: e.target.value } })
              }
              onBlur={onBlur}
            />
          </div>
        </div>
      </div>
    );
  }

  if (type === "multiple_choice") {
    return (
      <div className={styles.configSection}>
        {promptField}
        <MultipleChoiceConfig
          config={config}
          onChange={(cfg) => {
            onChange({ config: cfg });
            onBlur();
          }}
        />
      </div>
    );
  }

  return <div className={styles.configSection}>{promptField}</div>;
}

// ── SkillListConfig ────────────────────────────────────────────────────────

interface SkillListConfigProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function SkillListConfig({ config, onChange }: SkillListConfigProps): JSX.Element {
  const [input, setInput] = useState("");
  const inputId = useId();
  const multiId = useId();
  const skills = (config.skills as string[]) ?? [];

  function addSkill(): void {
    const skill = input.trim();
    if (!skill || skills.includes(skill)) return;
    onChange({ ...config, skills: [...skills, skill] });
    setInput("");
  }

  function removeSkill(skill: string): void {
    onChange({ ...config, skills: skills.filter((s) => s !== skill) });
  }

  function moveSkill(idx: number, dir: -1 | 1): void {
    const next = [...skills];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    onChange({ ...config, skills: next });
  }

  return (
    <div>
      <div className={styles.field}>
        <label htmlFor={inputId}>Skills</label>
        <div className={styles.tagRow}>
          <input
            id={inputId}
            type="text"
            className={styles.input}
            placeholder="Add skill…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill();
              }
            }}
          />
          <button type="button" className={styles.addTagBtn} onClick={addSkill}>
            Add
          </button>
        </div>
      </div>
      {skills.length > 0 && (
        <ul className={styles.skillList} aria-label="Skills">
          {skills.map((skill, idx) => (
            <li key={skill} className={styles.skillItem}>
              <input
                type={Boolean(config.multi) ? "checkbox" : "radio"}
                disabled
                aria-hidden="true"
                tabIndex={-1}
                className={styles.previewCheckbox}
              />
              <span>{skill}</span>
              <div className={styles.skillActions}>
                <button
                  type="button"
                  className={styles.moveBtn}
                  onClick={() => moveSkill(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Move ${skill} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.moveBtn}
                  onClick={() => moveSkill(idx, 1)}
                  disabled={idx === skills.length - 1}
                  aria-label={`Move ${skill} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.removeTag}
                  onClick={() => removeSkill(skill)}
                  aria-label={`Remove ${skill}`}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <label className={styles.checkLabel} htmlFor={multiId}>
        <input
          id={multiId}
          type="checkbox"
          checked={Boolean(config.multi)}
          onChange={(e) => onChange({ ...config, multi: e.target.checked })}
        />
        Allow multi-select
      </label>
    </div>
  );
}

// ── MultipleChoiceConfig ───────────────────────────────────────────────────

interface MultipleChoiceConfigProps {
  config: Record<string, unknown>;
  onChange: (config: Record<string, unknown>) => void;
}

function MultipleChoiceConfig({ config, onChange }: MultipleChoiceConfigProps): JSX.Element {
  const [input, setInput] = useState("");
  const inputId = useId();
  const multiId = useId();
  const options = (config.options as string[]) ?? [];

  function addOption(): void {
    const opt = input.trim();
    if (!opt) return;
    onChange({ ...config, options: [...options, opt] });
    setInput("");
  }

  function removeOption(idx: number): void {
    onChange({ ...config, options: options.filter((_, i) => i !== idx) });
  }

  function moveOption(idx: number, dir: -1 | 1): void {
    const next = [...options];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target]!, next[idx]!];
    onChange({ ...config, options: next });
  }

  return (
    <div>
      <div className={styles.field}>
        <label htmlFor={inputId}>Options</label>
        <div className={styles.tagRow}>
          <input
            id={inputId}
            type="text"
            className={styles.input}
            placeholder="Add option…"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addOption();
              }
            }}
          />
          <button type="button" className={styles.addTagBtn} onClick={addOption}>
            Add
          </button>
        </div>
      </div>
      {options.length > 0 && (
        <ol className={styles.skillList} aria-label="Options">
          {options.map((opt, idx) => (
            <li key={`${opt}-${idx}`} className={styles.skillItem}>
              <input
                type={Boolean(config.allow_multiple) ? "checkbox" : "radio"}
                disabled
                aria-hidden="true"
                tabIndex={-1}
                className={styles.previewCheckbox}
              />
              <span>{opt}</span>
              <div className={styles.skillActions}>
                <button
                  type="button"
                  className={styles.moveBtn}
                  onClick={() => moveOption(idx, -1)}
                  disabled={idx === 0}
                  aria-label={`Move option ${idx + 1} up`}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className={styles.moveBtn}
                  onClick={() => moveOption(idx, 1)}
                  disabled={idx === options.length - 1}
                  aria-label={`Move option ${idx + 1} down`}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className={styles.removeTag}
                  onClick={() => removeOption(idx)}
                  aria-label={`Remove option ${idx + 1}`}
                >
                  <span aria-hidden="true">×</span>
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
      <label className={styles.checkLabel} htmlFor={multiId}>
        <input
          id={multiId}
          type="checkbox"
          checked={Boolean(config.allow_multiple)}
          onChange={(e) => onChange({ ...config, allow_multiple: e.target.checked })}
        />
        Allow multiple selections
      </label>
    </div>
  );
}

// ── PreviewPanel ───────────────────────────────────────────────────────────

interface PreviewPanelProps {
  questions: BuilderQuestion[];
  mode: "numbered" | "named";
}

const DUMMY_ALIASES = ["Alice", "Bob", "Charlie"];

function PreviewPanel({ questions, mode }: PreviewPanelProps): JSX.Element {
  return (
    <section className={styles.previewPanel} role="region" aria-label="Survey preview">
      <h3 className={styles.previewHeading}>Preview ({mode === "numbered" ? "Numbered" : "Named"} mode)</h3>
      <div className={styles.previewList}>
        {questions.map((q, idx) => {
          if (mode === "numbered" && q.block_type === "avoid_respondent") {
            return (
              <div key={q.localId} className={styles.previewHidden}>
                [Hidden in Numbered mode]
              </div>
            );
          }
          return (
            <div key={q.localId} className={styles.previewBlock}>
              <p className={styles.previewPrompt}>
                <strong>Q{idx + 1}.</strong> {q.prompt || <em>(no prompt)</em>}
              </p>
              <PreviewBlockAnswer question={q} mode={mode} />
            </div>
          );
        })}
        {questions.length === 0 && (
          <p className={styles.previewEmpty}>No blocks yet.</p>
        )}
      </div>
    </section>
  );
}

function PreviewBlockAnswer({
  question,
  mode,
}: {
  question: BuilderQuestion;
  mode: "numbered" | "named";
}): JSX.Element {
  const { block_type: type, config } = question;

  if (type === "skill_selection" || type === "negative_skill") {
    const skills = (config.skills as string[]) ?? [];
    return (
      <div className={styles.previewField}>
        {skills.map((s) => (
          <label key={s} className={styles.previewOption}>
            <input type={config.multi ? "checkbox" : "radio"} disabled />
            {s}
          </label>
        ))}
        {skills.length === 0 && <span className={styles.previewNote}>(no skills defined)</span>}
      </div>
    );
  }

  if (type === "skill_level") {
    return (
      <div className={styles.previewField}>
        <input type="range" min={1} max={10} disabled className={styles.previewRange} />
        <span className={styles.previewNote}>1–10</span>
      </div>
    );
  }

  if (type === "written_answer") {
    const maxChars = (config.max_chars as number) ?? 500;
    const placeholder = (config.placeholder as string) ?? "";
    return (
      <div className={styles.previewField}>
        <textarea disabled placeholder={placeholder || `Max ${maxChars} characters`} rows={3} className={styles.previewTextarea} />
      </div>
    );
  }

  if (type === "avoid_respondent") {
    if (mode === "named") {
      return (
        <div className={styles.previewField}>
          {DUMMY_ALIASES.map((a) => (
            <label key={a} className={styles.previewOption}>
              <input type="checkbox" disabled />
              {a}
            </label>
          ))}
        </div>
      );
    }
    return <div />;
  }

  if (type === "custom_scale") {
    const min = (config.min as number) ?? 1;
    const max = (config.max as number) ?? 5;
    const minLabel = (config.min_label as string) ?? "";
    const maxLabel = (config.max_label as string) ?? "";
    return (
      <div className={styles.previewField}>
        <input type="range" min={min} max={max} disabled className={styles.previewRange} />
        <div className={styles.previewScaleLabels}>
          <span>{minLabel || min}</span>
          <span>{maxLabel || max}</span>
        </div>
      </div>
    );
  }

  if (type === "multiple_choice") {
    const options = (config.options as string[]) ?? [];
    const multi = Boolean(config.allow_multiple);
    return (
      <div className={styles.previewField}>
        {options.map((opt, i) => (
          <label key={`${opt}-${i}`} className={styles.previewOption}>
            <input type={multi ? "checkbox" : "radio"} disabled />
            {opt}
          </label>
        ))}
        {options.length === 0 && <span className={styles.previewNote}>(no options defined)</span>}
      </div>
    );
  }

  return <div />;
}
