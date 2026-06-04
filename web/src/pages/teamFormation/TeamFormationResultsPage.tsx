import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useAuth } from "../../lib/auth.js";
import { useDocumentTitle } from "../../lib/useDocumentTitle.js";
import {
  type FormTeamsResult,
  type QuestionAggregate,
  type ResponseEntry,
  type TeamFormation,
  type TeamMember,
  type TeamResult,
  closeSession,
  downloadCsv,
  fetchAggregate,
  fetchResponses,
  fetchResults,
  fetchSession,
  fetchTeamMembers,
  formTeams,
  moveTeamMember,
  renameTeam,
  setResponseExcluded,
} from "../../lib/teamFormationApi.js";
import styles from "./TeamFormationResultsPage.module.css";

// ── Helpers ───────────────────────────────────────────────────────────────────

function humanDuration(targetEpoch: number): string {
  const diff = targetEpoch * 1000 - Date.now();
  if (diff <= 0) return "closing soon";
  const s = Math.floor(diff / 1000);
  const m = Math.floor(s / 60);
  const h = Math.floor(m / 60);
  const d = Math.floor(h / 24);
  if (d > 0) return `${d}d ${h % 24}h`;
  if (h > 0) return `${h}h ${m % 60}m`;
  return `${m}m`;
}

function submissionLabel(r: ResponseEntry): string {
  return r.display_name ?? (r.slot_number !== null ? `Submission ${r.slot_number}` : `Response ${r.id}`);
}

function hasDuplicate(r: ResponseEntry, all: ResponseEntry[]): boolean {
  if (r.alias_id === null) return false;
  return all.filter((x) => x.alias_id === r.alias_id).length > 1;
}

const STATUS_LABEL: Record<TeamFormation["status"], string> = {
  draft: "Draft",
  active: "Active",
  closed: "Closed",
  formed: "Formed",
};

// ── Page state ────────────────────────────────────────────────────────────────

type PageState =
  | { phase: "loading" }
  | { phase: "ready"; session: TeamFormation; teams: TeamResult[]; responses: ResponseEntry[] }
  | { phase: "error"; message: string };

// ── Main page ─────────────────────────────────────────────────────────────────

export function TeamFormationResultsPage(): JSX.Element {
  useDocumentTitle("Results — JMS");
  const { id: idParam } = useParams<{ id: string }>();
  const id = Number(idParam);
  const { user, loading: authLoading } = useAuth();
  const [state, setState] = useState<PageState>({ phase: "loading" });

  const load = useCallback(async () => {
    setState({ phase: "loading" });
    try {
      const [{ session }, { teams }, { responses }] = await Promise.all([
        fetchSession(id),
        fetchResults(id),
        fetchResponses(id),
      ]);
      setState({ phase: "ready", session, teams, responses });
    } catch (err: unknown) {
      setState({ phase: "error", message: String(err) });
    }
  }, [id]);

  useEffect(() => {
    if (!authLoading) void load();
  }, [authLoading, load]);

  if (authLoading || state.phase === "loading") {
    return <p className={styles.message}>Loading…</p>;
  }

  if (!user) {
    return (
      <div className={styles.page}>
        <p>
          <Link to="/signin">Sign in</Link> to view results.
        </p>
      </div>
    );
  }

  if (state.phase === "error") {
    return (
      <div className={styles.page}>
        <p role="alert" className={styles.errorMsg}>{state.message}</p>
        <Link to="/team-formation">Back to sessions</Link>
      </div>
    );
  }

  const { session, teams, responses } = state;

  return (
    <div className={styles.page}>
      <nav className={styles.breadcrumb} aria-label="Breadcrumb">
        <Link to="/team-formation">Team Formation</Link>
        <span aria-hidden> / </span>
        <span aria-current="page">{session.title}</span>
      </nav>

      <ResultsHeader
        session={session}
        responses={responses}
        onRefresh={load}
      />

      <TeamTabs
        session={session}
        teams={teams}
        responses={responses}
        onRefresh={load}
      />

      <AggregatePanel sessionId={id} aggregate={null} />
    </div>
  );
}

// ── ResultsHeader ─────────────────────────────────────────────────────────────

function ResultsHeader({
  session,
  responses,
  onRefresh,
}: {
  session: TeamFormation;
  responses: ResponseEntry[];
  onRefresh: () => Promise<void>;
}): JSX.Element {
  const [closeConfirm, setCloseConfirm] = useState(false);
  const [closing, setClosing] = useState(false);
  const [formModal, setFormModal] = useState(false);
  const [formChecked, setFormChecked] = useState(false);
  const [forming, setForming] = useState(false);
  const [formWarnings, setFormWarnings] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const formTriggerRef = useRef<HTMLButtonElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const checkboxId = useId();

  // Duplicate detection for named mode
  const dupeCount = session.slot_mode === "named"
    ? new Set(
        responses
          .filter((r) => r.alias_id !== null)
          .filter((r) => responses.filter((x) => x.alias_id === r.alias_id).length > 1)
          .map((r) => r.alias_id),
      ).size
    : 0;

  // Focus trap for modal
  useEffect(() => {
    if (!formModal) return;
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>(
      "button, input, [href], [tabindex]:not([tabindex='-1'])",
    );
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    first?.focus();

    const trap = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setFormModal(false);
        setFormChecked(false);
        setFormWarnings([]);
        setFormError(null);
        formTriggerRef.current?.focus();
        return;
      }
      if (e.key !== "Tab") return;
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
    };
    document.addEventListener("keydown", trap);
    return () => document.removeEventListener("keydown", trap);
  }, [formModal]);

  const handleClose = async () => {
    setClosing(true);
    try {
      await closeSession(session.id);
      await onRefresh();
    } finally {
      setClosing(false);
      setCloseConfirm(false);
    }
  };

  const handleFormTeams = async () => {
    setForming(true);
    setFormError(null);
    try {
      const result: FormTeamsResult = await formTeams(session.id);
      if (result.warnings.length > 0) {
        setFormWarnings(result.warnings);
      } else {
        setFormModal(false);
        setFormChecked(false);
        await onRefresh();
      }
    } catch (err: unknown) {
      setFormError(String(err));
    } finally {
      setForming(false);
    }
  };

  const handleFormWarningConfirm = async () => {
    setFormModal(false);
    setFormChecked(false);
    setFormWarnings([]);
    await onRefresh();
  };

  const progress = session.slot_count > 0
    ? Math.round((session.slots_submitted / session.slot_count) * 100)
    : 0;

  const canFormTeams = session.status === "closed" || session.status === "formed";

  return (
    <header className={styles.resultsHeader}>
      <div className={styles.titleRow}>
        <h1 className={styles.pageHeading}>{session.title}</h1>
        <span className={`${styles.statusBadge} ${styles[`status_${session.status}`]}`}>
          {STATUS_LABEL[session.status]}
        </span>
      </div>

      <div
        className={styles.progressBar}
        role="progressbar"
        aria-valuenow={session.slots_submitted}
        aria-valuemin={0}
        aria-valuemax={session.slot_count}
        aria-label="Submissions received"
      >
        <div className={styles.progressFill} style={{ width: `${progress}%` }} aria-hidden />
      </div>
      <p className={styles.progressText}>
        {session.slots_submitted} of {session.slot_count} submissions received
      </p>

      {session.status === "active" && session.closes_at && (
        <p className={styles.countdown}>Closes in {humanDuration(session.closes_at)}</p>
      )}

      {dupeCount > 0 && (
        <div className={styles.dupeWarning} role="alert">
          Duplicate submissions detected for {dupeCount} name{dupeCount !== 1 ? "s" : ""}.
          Review marked responses before forming teams.
        </div>
      )}

      <div className={styles.actions}>
        {session.status === "active" && (
          <div className={styles.closeEarlyWrap}>
            {!closeConfirm ? (
              <button
                type="button"
                className={styles.ghostBtn}
                onClick={() => setCloseConfirm(true)}
              >
                Close early
              </button>
            ) : (
              <div className={styles.inlineConfirm} role="alert">
                <span>Stop accepting responses?</span>
                <button
                  type="button"
                  className={styles.dangerBtn}
                  disabled={closing}
                  onClick={() => void handleClose()}
                >
                  {closing ? "Closing…" : "Confirm"}
                </button>
                <button
                  type="button"
                  className={styles.ghostBtn}
                  onClick={() => setCloseConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        <button
          ref={formTriggerRef}
          type="button"
          className={styles.primaryBtn}
          disabled={!canFormTeams}
          onClick={() => { setFormModal(true); setFormChecked(false); setFormWarnings([]); setFormError(null); }}
          aria-haspopup="dialog"
        >
          {session.status === "formed" ? "Re-form teams" : "Form teams"}
        </button>

        {(session.status === "closed" || session.status === "formed") && (
          <button
            type="button"
            className={styles.ghostBtn}
            onClick={() => downloadCsv(session.id)}
          >
            Export CSV
          </button>
        )}
      </div>

      {formModal && (
        <div className={styles.modalOverlay} aria-modal="true" role="dialog" aria-labelledby="form-modal-title">
          <div ref={modalRef} className={styles.modal}>
            {formWarnings.length === 0 ? (
              <>
                <h2 id="form-modal-title" className={styles.modalTitle}>
                  {session.status === "formed" ? "Re-form teams?" : "Form teams?"}
                </h2>
                {session.status === "formed" && (
                  <p className={styles.modalWarning}>
                    This will overwrite current team assignments. Any manual changes will be lost.
                  </p>
                )}
                <label className={styles.checkLabel} htmlFor={checkboxId}>
                  <input
                    id={checkboxId}
                    type="checkbox"
                    checked={formChecked}
                    onChange={(e) => setFormChecked(e.target.checked)}
                  />
                  I understand and want to proceed
                </label>
                {formError && <p role="alert" className={styles.errorMsg}>{formError}</p>}
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    disabled={!formChecked || forming}
                    onClick={() => void handleFormTeams()}
                  >
                    {forming ? "Forming…" : "Confirm"}
                  </button>
                  <button
                    type="button"
                    className={styles.ghostBtn}
                    onClick={() => {
                      setFormModal(false);
                      setFormChecked(false);
                      formTriggerRef.current?.focus();
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 id="form-modal-title" className={styles.modalTitle}>Teams formed with warnings</h2>
                <ul className={styles.warningList}>
                  {formWarnings.map((w, i) => <li key={i}>{w}</li>)}
                </ul>
                <div className={styles.modalActions}>
                  <button
                    type="button"
                    className={styles.primaryBtn}
                    onClick={() => void handleFormWarningConfirm()}
                  >
                    OK
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </header>
  );
}

// ── TeamTabs ──────────────────────────────────────────────────────────────────

function TeamTabs({
  session,
  teams,
  responses,
  onRefresh,
}: {
  session: TeamFormation;
  teams: TeamResult[];
  responses: ResponseEntry[];
  onRefresh: () => Promise<void>;
}): JSX.Element {
  const [activeTeamId, setActiveTeamId] = useState<number | null>(null);
  const [draggedResponseId, setDraggedResponseId] = useState<number | null>(null);
  const tablistId = useId();

  // When teams load, default to first team (or null for all-submissions)
  useEffect(() => {
    setActiveTeamId(null);
  }, [teams.length]);

  const tabId = (teamId: number | null) => `${tablistId}-tab-${teamId ?? "all"}`;
  const panelId = (teamId: number | null) => `${tablistId}-panel-${teamId ?? "all"}`;

  const allTabs: { id: number | null; label: string; count: number }[] = [
    { id: null, label: "All Submissions", count: responses.length },
    ...teams.map((t) => ({ id: t.id, label: t.name, count: t.member_count })),
  ];

  const handleTabKeyDown = (e: React.KeyboardEvent, index: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = allTabs[(index + 1) % allTabs.length];
      if (next) setActiveTeamId(next.id);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev = allTabs[(index - 1 + allTabs.length) % allTabs.length];
      if (prev) setActiveTeamId(prev.id);
    }
  };

  // Drag-over on tab headers activates that tab after 400ms
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleTabDragOver = (e: React.DragEvent, teamId: number | null) => {
    e.preventDefault();
    if (hoverTimer.current === null && teamId !== activeTeamId) {
      hoverTimer.current = setTimeout(() => {
        setActiveTeamId(teamId);
        hoverTimer.current = null;
      }, 400);
    }
  };

  const handleTabDragLeave = () => {
    if (hoverTimer.current !== null) {
      clearTimeout(hoverTimer.current);
      hoverTimer.current = null;
    }
  };

  return (
    <div className={styles.tabsWrap}>
      <div role="tablist" aria-label="Team tabs" className={styles.tabList}>
        {allTabs.map((tab, i) => (
          <button
            key={String(tab.id)}
            id={tabId(tab.id)}
            role="tab"
            aria-selected={activeTeamId === tab.id}
            aria-controls={panelId(tab.id)}
            tabIndex={activeTeamId === tab.id ? 0 : -1}
            className={`${styles.tab} ${activeTeamId === tab.id ? styles.tabActive : ""}`}
            onClick={() => setActiveTeamId(tab.id)}
            onKeyDown={(e) => handleTabKeyDown(e, i)}
            onDragOver={(e) => handleTabDragOver(e, tab.id)}
            onDragLeave={handleTabDragLeave}
          >
            {tab.label}
            <span className={styles.tabCount} aria-hidden>({tab.count})</span>
          </button>
        ))}
      </div>

      {allTabs.map((tab) => (
        <div
          key={String(tab.id)}
          id={panelId(tab.id)}
          role="tabpanel"
          aria-labelledby={tabId(tab.id)}
          hidden={activeTeamId !== tab.id}
          className={styles.tabPanel}
        >
          {tab.id === null ? (
            <SubmissionList
              session={session}
              responses={responses}
              onRefresh={onRefresh}
            />
          ) : (
            <TeamPanel
              session={session}
              team={teams.find((t) => t.id === tab.id)!}
              allTeams={teams}
              allResponses={responses}
              draggedResponseId={draggedResponseId}
              onDragStart={setDraggedResponseId}
              onDragEnd={() => setDraggedResponseId(null)}
              onRefresh={onRefresh}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── SubmissionList ────────────────────────────────────────────────────────────

function SubmissionList({
  session,
  responses,
  onRefresh,
}: {
  session: TeamFormation;
  responses: ResponseEntry[];
  onRefresh: () => Promise<void>;
}): JSX.Element {
  if (responses.length === 0) {
    return <p className={styles.muted}>No submissions yet.</p>;
  }

  return (
    <ul className={styles.submissionList}>
      {responses.map((r) => (
        <li key={r.id} className={`${styles.submissionRow} ${r.is_excluded ? styles.excludedRow : ""}`}>
          <span className={styles.subLabel}>{submissionLabel(r)}</span>
          <span className={styles.subDate}>
            {new Date(r.submitted_at * 1000).toLocaleDateString()}
          </span>
          {session.slot_mode === "named" && hasDuplicate(r, responses) && (
            <span className={styles.dupBadge} aria-label="Duplicate submission">Duplicate</span>
          )}
          {session.slot_mode === "named" && (
            <ExcludeToggle
              sessionId={session.id}
              responseId={r.id}
              excluded={r.is_excluded === 1}
              onRefresh={onRefresh}
            />
          )}
        </li>
      ))}
    </ul>
  );
}

// ── ExcludeToggle ─────────────────────────────────────────────────────────────

function ExcludeToggle({
  sessionId,
  responseId,
  excluded,
  onRefresh,
}: {
  sessionId: number;
  responseId: number;
  excluded: boolean;
  onRefresh: () => Promise<void>;
}): JSX.Element {
  const [busy, setBusy] = useState(false);
  const toggle = async () => {
    setBusy(true);
    try {
      await setResponseExcluded(sessionId, responseId, !excluded);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  };
  return (
    <button
      type="button"
      className={styles.excludeBtn}
      disabled={busy}
      onClick={() => void toggle()}
    >
      {excluded ? "Include" : "Exclude"}
    </button>
  );
}

// ── TeamPanel ─────────────────────────────────────────────────────────────────

function TeamPanel({
  session,
  team,
  allTeams,
  allResponses,
  draggedResponseId,
  onDragStart,
  onDragEnd,
  onRefresh,
}: {
  session: TeamFormation;
  team: TeamResult;
  allTeams: TeamResult[];
  allResponses: ResponseEntry[];
  draggedResponseId: number | null;
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onRefresh: () => Promise<void>;
}): JSX.Element {
  const [panelState, setPanelState] = useState<
    { phase: "loading" } | { phase: "ready"; members: TeamMember[]; total: number } | { phase: "error" }
  >({ phase: "loading" });
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(team.name);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const nameLabelRef = useRef<HTMLHeadingElement>(null);
  const [dragOver, setDragOver] = useState(false);

  useEffect(() => {
    setNameInput(team.name);
  }, [team.name]);

  const loadMembers = useCallback(async () => {
    try {
      const result = await fetchTeamMembers(session.id, team.id, page, pageSize);
      setPanelState({ phase: "ready", members: result.members, total: result.total });
    } catch {
      setPanelState({ phase: "error" });
    }
  }, [session.id, team.id, page, pageSize]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  useEffect(() => {
    if (editingName) nameInputRef.current?.focus();
  }, [editingName]);

  const saveName = async () => {
    const trimmed = nameInput.trim();
    if (!trimmed || trimmed === team.name) {
      setEditingName(false);
      setNameInput(team.name);
      nameLabelRef.current?.focus();
      return;
    }
    try {
      await renameTeam(session.id, team.id, trimmed);
      await onRefresh();
    } catch {
      setNameInput(team.name);
    } finally {
      setEditingName(false);
      nameLabelRef.current?.focus();
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (draggedResponseId === null) return;
    try {
      await moveTeamMember(session.id, team.id, draggedResponseId);
      await onRefresh();
      await loadMembers();
    } finally {
      onDragEnd();
    }
  };

  const totalPages =
    panelState.phase === "ready" ? Math.ceil(panelState.total / pageSize) : 1;

  return (
    <div
      className={`${styles.teamPanel} ${dragOver ? styles.dragOver : ""}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => void handleDrop(e)}
    >
      <div className={styles.teamNameRow}>
        {editingName ? (
          <input
            ref={nameInputRef}
            className={styles.teamNameInput}
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onBlur={() => void saveName()}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); void saveName(); }
              if (e.key === "Escape") {
                setEditingName(false);
                setNameInput(team.name);
                nameLabelRef.current?.focus();
              }
            }}
            aria-label="Team name"
          />
        ) : (
          <h2
            ref={nameLabelRef}
            className={styles.teamName}
            tabIndex={0}
            role="button"
            aria-label={`${team.name}, press Enter to edit`}
            onClick={() => setEditingName(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setEditingName(true); }
            }}
          >
            {team.name}
          </h2>
        )}
        <span className={styles.memberCount} aria-label={`${team.member_count} members`}>
          {team.member_count}
        </span>
      </div>

      {panelState.phase === "loading" && <p className={styles.muted}>Loading…</p>}
      {panelState.phase === "error" && <p className={styles.errorMsg}>Failed to load members.</p>}
      {panelState.phase === "ready" && (
        <>
          <ul className={styles.memberList} aria-label={`Members of ${team.name}`}>
            {panelState.members.map((m) => {
              const response = allResponses.find((r) => r.id === m.response_id);
              return (
                <MemberCard
                  key={m.response_id}
                  member={m}
                  response={response}
                  session={session}
                  allTeams={allTeams}
                  allResponses={allResponses}
                  onDragStart={onDragStart}
                  onDragEnd={onDragEnd}
                  onRefresh={onRefresh}
                  onMembersRefresh={loadMembers}
                />
              );
            })}
          </ul>
          {totalPages > 1 && (
            <div className={styles.pagination} aria-label="Pagination">
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </button>
              <span className={styles.pageInfo}>Page {page} of {totalPages}</span>
              <button
                type="button"
                className={styles.ghostBtn}
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── MemberCard ────────────────────────────────────────────────────────────────

function MemberCard({
  member,
  response,
  session,
  allTeams,
  allResponses,
  onDragStart,
  onDragEnd,
  onRefresh,
  onMembersRefresh,
}: {
  member: TeamMember;
  response: ResponseEntry | undefined;
  session: TeamFormation;
  allTeams: TeamResult[];
  allResponses: ResponseEntry[];
  onDragStart: (id: number) => void;
  onDragEnd: () => void;
  onRefresh: () => Promise<void>;
  onMembersRefresh: () => Promise<void>;
}): JSX.Element {
  const [showMove, setShowMove] = useState(false);
  const isDuplicate = response ? hasDuplicate(response, allResponses) : false;
  const isExcluded = response?.is_excluded === 1;
  // All teams shown as move targets; backend validates that the member moves correctly
  const otherTeams = allTeams;

  const handleMove = async (toTeamId: number) => {
    setShowMove(false);
    try {
      await moveTeamMember(session.id, toTeamId, member.response_id);
      await onRefresh();
    } catch { /* ignore */ }
  };

  const parsedAnswers = (() => {
    if (!response) return null;
    try {
      return JSON.parse(response.answers) as Record<string, unknown>;
    } catch {
      return null;
    }
  })();

  return (
    <li
      className={`${styles.memberCard} ${isExcluded ? styles.excludedCard : ""}`}
      draggable
      onDragStart={() => onDragStart(member.response_id)}
      onDragEnd={onDragEnd}
      aria-label={member.submission_label}
    >
      <div className={styles.cardHeader}>
        <strong className={styles.cardLabel}>{member.submission_label}</strong>
        <div className={styles.cardBadges}>
          {session.slot_mode === "named" && isDuplicate && (
            <span className={styles.dupBadge} aria-label="Duplicate submission">Duplicate</span>
          )}
        </div>
      </div>

      {session.slot_mode === "named" && (
        <ExcludeToggle
          sessionId={session.id}
          responseId={member.response_id}
          excluded={isExcluded}
          onRefresh={async () => { await onRefresh(); await onMembersRefresh(); }}
        />
      )}

      {allTeams.length > 1 && (
        <div className={styles.moveWrap}>
          {!showMove ? (
            <button
              type="button"
              className={styles.moveBtnSmall}
              onClick={() => setShowMove(true)}
              aria-label={`Move ${member.submission_label} to another team`}
            >
              Move…
            </button>
          ) : (
            <div className={styles.moveSelect}>
              <label className={styles.srOnly} htmlFor={`move-${member.response_id}`}>
                Move to team
              </label>
              <select
                id={`move-${member.response_id}`}
                className={styles.select}
                defaultValue=""
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val) void handleMove(val);
                }}
                onBlur={() => setShowMove(false)}
                autoFocus
              >
                <option value="" disabled>Select team…</option>
                {otherTeams.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
              <button
                type="button"
                className={styles.moveBtnSmall}
                onClick={() => setShowMove(false)}
                aria-label="Cancel move"
              >
                ×
              </button>
            </div>
          )}
        </div>
      )}

      {parsedAnswers && (
        <details className={styles.answerDetails}>
          <summary className={styles.answerSummary}>Show answers</summary>
          <div className={styles.answerBody}>
            <AnswerDisplay answers={parsedAnswers} />
          </div>
        </details>
      )}
    </li>
  );
}

// ── AnswerDisplay ─────────────────────────────────────────────────────────────

function AnswerDisplay({ answers }: { answers: Record<string, unknown> }): JSX.Element {
  return (
    <dl className={styles.answerDl}>
      {Object.entries(answers).map(([key, val]) => {
        let display: string;
        if (Array.isArray(val)) {
          display = (val as string[]).join(", ") || "(none)";
        } else if (typeof val === "object" && val !== null) {
          display = Object.entries(val as Record<string, unknown>)
            .map(([k, v]) => `${k}: ${v}`)
            .join(", ");
        } else if (typeof val === "number") {
          display = `${val}/10`;
        } else {
          display = String(val ?? "(no answer)");
        }
        return (
          <div key={key} className={styles.answerEntry}>
            <dt className={styles.answerKey}>Q{key}</dt>
            <dd className={styles.answerVal}>{display}</dd>
          </div>
        );
      })}
    </dl>
  );
}

// ── AggregatePanel ────────────────────────────────────────────────────────────

function AggregatePanel({
  sessionId,
  aggregate: initialAggregate,
}: {
  sessionId: number;
  aggregate: QuestionAggregate[] | null;
}): JSX.Element {
  const [data, setData] = useState<QuestionAggregate[] | null>(initialAggregate);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [opened, setOpened] = useState(false);

  const handleToggle = async (e: React.SyntheticEvent<HTMLDetailsElement>) => {
    const open = (e.target as HTMLDetailsElement).open;
    if (open && !opened) {
      setOpened(true);
      setLoading(true);
      try {
        const { aggregate } = await fetchAggregate(sessionId);
        setData(aggregate);
      } catch (err) {
        setError(String(err));
      } finally {
        setLoading(false);
      }
    }
  };

  const questionCount = data?.length ?? 0;

  return (
    <details className={styles.aggregateDetails} onToggle={(e) => void handleToggle(e)}>
      <summary className={styles.aggregateSummary}>
        Survey aggregate stats{questionCount > 0 ? ` (${questionCount} questions)` : ""}
      </summary>
      {loading && <p className={styles.muted}>Loading stats…</p>}
      {error && <p className={styles.errorMsg}>{error}</p>}
      {data && data.map((q) => <AggregateQuestion key={`${q.question_id}-${q.block_type}`} q={q} />)}
    </details>
  );
}

function AggregateQuestion({ q }: { q: QuestionAggregate }): JSX.Element {
  return (
    <section className={styles.aggSection}>
      <h3 className={styles.aggPrompt}>{q.prompt}</h3>
      <p className={styles.aggMeta}>{q.response_count} response{q.response_count !== 1 ? "s" : ""}</p>
      <AggregateData blockType={q.block_type} data={q.data} />
    </section>
  );
}

type CountItem = { category: string; count: number };
type ChoiceItem = { option: string; count: number; percentage: number };
type SkillLevelItem = { category: string; mean: number; responses: number };
type ScaleData = { mean: number; min: number | null; max: number | null; count: number };

function AggregateData({ blockType, data }: { blockType: string; data: unknown }): JSX.Element {
  if (blockType === "skill_selection" || blockType === "negative_skill") {
    const items = data as CountItem[];
    const maxCount = Math.max(1, ...items.map((i) => i.count));
    return (
      <div
        className={styles.barChart}
        role="img"
        aria-label={`Bar chart for ${blockType}`}
      >
        {items.map((item) => (
          <div key={item.category} className={styles.barRow}>
            <span className={styles.barLabel}>{item.category}</span>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ width: `${(item.count / maxCount) * 100}%` }}
                aria-label={`${item.count} responses`}
              />
            </div>
            <span className={styles.barCount}>{item.count}</span>
          </div>
        ))}
      </div>
    );
  }

  if (blockType === "multiple_choice") {
    const items = data as ChoiceItem[];
    const maxCount = Math.max(1, ...items.map((i) => i.count));
    return (
      <div className={styles.barChart} role="img" aria-label="Multiple choice results">
        {items.map((item) => (
          <div key={item.option} className={styles.barRow}>
            <span className={styles.barLabel}>{item.option}</span>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ width: `${(item.count / maxCount) * 100}%` }}
              />
            </div>
            <span className={styles.barCount}>{item.percentage}%</span>
          </div>
        ))}
      </div>
    );
  }

  if (blockType === "skill_level") {
    const items = data as SkillLevelItem[];
    return (
      <div className={styles.skillLevelList}>
        {items.map((item) => (
          <div key={item.category} className={styles.barRow}>
            <span className={styles.barLabel}>{item.category}</span>
            <div className={styles.barTrack}>
              <div
                className={styles.barFill}
                style={{ width: `${(item.mean / 10) * 100}%` }}
                aria-label={`Mean ${item.mean.toFixed(1)} out of 10`}
              />
            </div>
            <span className={styles.barCount}>{item.mean.toFixed(1)}/10</span>
          </div>
        ))}
      </div>
    );
  }

  if (blockType === "custom_scale") {
    const d = data as ScaleData;
    return (
      <p className={styles.scaleStats}>
        Mean: <strong>{d.mean.toFixed(1)}</strong>
        {d.min !== null && d.max !== null && ` — range ${d.min}–${d.max}`}
        {` — ${d.count} response${d.count !== 1 ? "s" : ""}`}
      </p>
    );
  }

  if (blockType === "written_answer") {
    const { answers } = data as { answers: string[] };
    return (
      <ul className={styles.writtenList}>
        {answers.map((a, i) => <WrittenAnswer key={i} text={a} />)}
      </ul>
    );
  }

  return <p className={styles.muted}>(no display)</p>;
}

function WrittenAnswer({ text }: { text: string }): JSX.Element {
  const [expanded, setExpanded] = useState(false);
  const truncated = text.length > 200 && !expanded;
  return (
    <li className={styles.writtenCard}>
      <p>{truncated ? `${text.slice(0, 200)}…` : text}</p>
      {text.length > 200 && (
        <button
          type="button"
          className={styles.expandBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
    </li>
  );
}
