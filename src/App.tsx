import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  Activity, Archive, ArrowDownLeft, ArrowRight, ArrowUpRight, BarChart3,
  Bell, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp,
  Clock3, Code2, Copy, ExternalLink, Eye, EyeOff, Filter,
  FolderGit2, GitBranch, GitFork, Github, Globe2, KeyRound, Layers3, LayoutDashboard,
  LockKeyhole, Menu, MoreHorizontal, Plus, RefreshCcw, Search, Settings2, ShieldAlert,
  ShieldCheck, Sparkles, Star, Trash2, TrendingUp, X, Zap
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { github, isDesktop, type GitHubUser, type Repo, type RepoDetails } from "./api";

type View = "overview" | "repositories" | "activity" | "insights" | "settings";
type Modal = "connect" | "create" | "delete" | "bulkDelete" | "edit" | "visibility" | "archive" | null;
type FilterType = "all" | "public" | "private" | "archived";
type SortType = "updated" | "name" | "stars";

type Notice = { type: "success" | "error" | "info"; message: string };

const nav: { group: string; items: { id: View; label: string; icon: LucideIcon }[] }[] = [
  { group: "WORKSPACE", items: [
    { id: "overview", label: "Overview", icon: LayoutDashboard },
    { id: "repositories", label: "Repositories", icon: FolderGit2 },
    { id: "activity", label: "Recent activity", icon: Activity },
    { id: "insights", label: "Insights", icon: BarChart3 }
  ] },
  { group: "PREFERENCES", items: [{ id: "settings", label: "Settings", icon: Settings2 }] }
];

const languageColors: Record<string, string> = {
  Java: "#e89171", TypeScript: "#6b96ee", JavaScript: "#e5cf79", Rust: "#d0a278",
  Python: "#79b5d6", Go: "#78c8d6", HTML: "#ea765e", CSS: "#ae8bda",
  Kotlin: "#b496f6", C: "#7f8df5", "C++": "#ae80cb", Shell: "#a5cb80"
};
const languageColor = (s: string | null) => languageColors[s ?? ""] || "#a5acc3";
const prettyDate = (iso: string) => {
  const days = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 86400000);
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.floor(days / 30)} months ago`;
  return `${Math.floor(days / 365)} years ago`;
};
const formatNumber = (n: number) => n.toLocaleString("en-US");
const errorMessage = (e: unknown) => e instanceof Error ? e.message : String(e);

async function visit(url: string) {
  if (!url.startsWith("https://github.com/") && !url.startsWith("https://docs.github.com/")) return;
  if (isDesktop) await openUrl(url);
  else window.open(url, "_blank", "noopener,noreferrer");
}

function Brandmark({ small = false }: { small?: boolean }) {
  return <div className={`brandmark ${small ? "brandmark-small" : ""}`}><GitBranch strokeWidth={2.7} size={small ? 19 : 23} /></div>;
}

function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "green" | "purple" | "amber" }) {
  return <span className={`pill pill-${tone}`}>{children}</span>;
}

function IconButton({ icon: Icon, label, onClick, className = "" }: { icon: LucideIcon; label: string; onClick: () => void; className?: string }) {
  return <button type="button" className={`icon-btn ${className}`} aria-label={label} title={label} onClick={onClick}><Icon size={17} /></button>;
}

function StatCard({ icon: Icon, title, value, note, color, delay = 0 }: { icon: LucideIcon; title: string; value: string; note: string; color: string; delay?: number }) {
  return <motion.div className="stat-card" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay, duration: .35 }}>
    <div className="stat-card-top"><span className="stat-icon" style={{ color, background: `${color}13`, borderColor: `${color}27` }}><Icon size={19} /></span><TrendingUp size={15} className="muted-icon" /></div>
    <div className="stat-number">{value}</div><div className="stat-label">{title}</div><div className="stat-note">{note}</div>
  </motion.div>;
}

function RepoCard({ repo, checked, onCheck, onView, onMenu, menuOpen, onAction, editable }: {
  repo: Repo; checked: boolean; onCheck: (id: number) => void; onView: (repo: Repo) => void;
  onMenu: (id: number) => void; menuOpen: boolean;
  onAction: (action: string, repo: Repo) => void; editable: boolean;
}) {
  return <motion.article layout className={`repo-card ${checked ? "repo-selected" : ""}`} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: .97 }}>
    <div className="repo-card-top">
      <div className="repo-icon"><FolderGit2 size={20} /></div>
      <div className="repo-card-actions">
        <button className={`repo-selector ${checked ? "selected" : ""}`} aria-label={`Select ${repo.name}`} onClick={() => onCheck(repo.id)}>{checked && <Check size={13} />}</button>
        <div className="menu-wrapper">
          <IconButton icon={MoreHorizontal} label={`More actions for ${repo.name}`} onClick={() => onMenu(repo.id)} className={menuOpen ? "active" : ""} />
          {menuOpen && <div className="action-menu" role="menu">
            <button onClick={() => onAction("open", repo)}><ExternalLink size={15} /> Open on GitHub</button>
            <button onClick={() => onAction("clone", repo)}><Copy size={15} /> Copy clone command</button>
            <button onClick={() => onAction("edit", repo)} disabled={!editable}><Settings2 size={15} /> Edit repository</button>
            <button onClick={() => onAction("archive", repo)} disabled={!editable}><Archive size={15} /> {repo.archived ? "Unarchive" : "Archive"}</button>
            <button onClick={() => onAction("visibility", repo)} disabled={!editable}><Eye size={15} /> Change visibility</button>
            <div className="menu-divider" />
            <button className="destructive" onClick={() => onAction("delete", repo)} disabled={!editable}><Trash2 size={15} /> Delete repository</button>
          </div>}
        </div>
      </div>
    </div>
    <button className="repo-heading" onClick={() => onView(repo)} title={`Inspect ${repo.full_name}`}>
      {repo.name}<ArrowUpRight size={15} />
    </button>
    <div className="repo-subtitle">{repo.owner.login} / {repo.name}</div>
    <p className="repo-description">{repo.description || "No description yet. Add one to make this project easier to find."}</p>
    <div className="repo-tags">
      <Pill>{repo.private ? <><LockKeyhole size={11} /> Private</> : <><Globe2 size={11} /> Public</>}</Pill>
      {repo.archived && <Pill tone="amber"><Archive size={11} /> Archived</Pill>}
      {repo.fork && <Pill tone="purple"><GitFork size={11} /> Fork</Pill>}
    </div>
    <div className="repo-card-bottom">
      <div className="repo-language"><span className="language-dot" style={{ background: languageColor(repo.language) }} />{repo.language || "Other"}</div>
      <div className="repo-meta"><span><Star size={13} />{formatNumber(repo.stargazers_count)}</span><span><GitFork size={13} />{formatNumber(repo.forks_count)}</span></div>
    </div>
    <div className="repo-updated"><Clock3 size={12} /> Updated {prettyDate(repo.updated_at)}</div>
  </motion.article>;
}

function ModalFrame({ title, eyebrow, children, onClose, width = "normal" }: { title: string; eyebrow?: string; children: ReactNode; onClose: () => void; width?: "normal" | "wide" }) {
  return <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
    <motion.div role="dialog" aria-modal="true" aria-label={title} className={`modal modal-${width}`} initial={{ opacity: 0, y: 28, scale: .96 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 15, scale: .97 }} transition={{ type: "spring", damping: 28, stiffness: 350 }}>
      <header className="modal-heading"><div>{eyebrow && <div className="eyebrow">{eyebrow}</div>}<h2>{title}</h2></div><IconButton icon={X} label="Close" onClick={onClose}/></header>
      {children}
    </motion.div>
  </motion.div>;
}

function ActivityRow({ repo, onOpen }: { repo: Repo; onOpen: (repo: Repo) => void }) {
  return <button className="activity-row" onClick={() => onOpen(repo)}>
    <div className="activity-symbol"><GitBranch size={16}/></div>
    <div className="activity-copy"><strong>{repo.name}</strong><span>Repository updated · {repo.language || "Code"}</span></div>
    <span className="activity-date">{prettyDate(repo.updated_at)}</span><ChevronRight size={15} className="muted-icon" />
  </button>;
}

export default function App() {
  const [view, setView] = useState<View>("overview");
  const [owner, setOwner] = useState("OreoStudios");
  const [ownerInput, setOwnerInput] = useState("OreoStudios");
  const [user, setUser] = useState<GitHubUser | null>(null);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const [selectedRepo, setSelectedRepo] = useState<Repo | null>(null);
  const [details, setDetails] = useState<RepoDetails | null>(null);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<FilterType>("all");
  const [sort, setSort] = useState<SortType>("updated");
  const [display, setDisplay] = useState<"grid" | "list">("grid");
  const [menuId, setMenuId] = useState<number | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [confirmText, setConfirmText] = useState("");
  const [createName, setCreateName] = useState("");
  const [createDesc, setCreateDesc] = useState("");
  const [createPrivate, setCreatePrivate] = useState(true);
  const [editName, setEditName] = useState("");
  const [editDesc, setEditDesc] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);

  const connected = !!user && isDesktop;

  const refresh = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const result = await github.list(owner);
      setRepos(result);
      setSelected(prev => prev.filter(id => result.some(r => r.id === id)));
    } catch (e) {
      setError(errorMessage(e)); setRepos([]);
    } finally { setLoading(false); }
  }, [owner]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault(); setPaletteOpen(v => !v);
      }
      if (event.key === "Escape") { setPaletteOpen(false); setModal(null); setSelectedRepo(null); setMenuId(null); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const stats = useMemo(() => ({
    total: repos.length,
    public: repos.filter(r => !r.private).length,
    private: repos.filter(r => r.private).length,
    archived: repos.filter(r => r.archived).length,
    stars: repos.reduce((sum, r) => sum + r.stargazers_count, 0),
    active: repos.filter(r => !r.archived).length,
    forks: repos.reduce((sum, r) => sum + r.forks_count, 0)
  }), [repos]);

  const filtered = useMemo(() => repos.filter(r => {
    const q = search.toLowerCase().trim();
    const matches = !q || `${r.full_name} ${r.description || ""} ${r.language || ""}`.toLowerCase().includes(q);
    const matchesFilter = filter === "all" || (filter === "public" && !r.private) || (filter === "private" && r.private) || (filter === "archived" && r.archived);
    return matches && matchesFilter;
  }).sort((a, b) => sort === "stars" ? b.stargazers_count - a.stargazers_count : sort === "name" ? a.name.localeCompare(b.name) : new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()), [repos, search, filter, sort]);

  const recent = useMemo(() => [...repos].sort((a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)).slice(0, 5), [repos]);
  const languages = useMemo(() => {
    const values = new Map<string, number>();
    repos.forEach(r => values.set(r.language || "Other", (values.get(r.language || "Other") || 0) + 1));
    return [...values.entries()].sort((a, b) => b[1] - a[1]);
  }, [repos]);

  const notify = (type: Notice["type"], message: string) => {
    setNotice({ type, message });
    window.setTimeout(() => setNotice(null), 5000);
  };
  const resetModal = () => { if (!busy) { setModal(null); setConfirmText(""); } };
  const begin = (next: Modal, repo: Repo | null = null) => {
    setSelectedRepo(repo); setModal(next); setConfirmText(""); setMenuId(null);
    if (repo) { setEditName(repo.name); setEditDesc(repo.description || ""); }
  };

  async function connect() {
    if (!isDesktop) return notify("info", "The browser preview is read-only. Launch the Tauri desktop app to connect.");
    setBusy(true);
    try {
      const u = await github.connect(token);
      setUser(u); setToken(""); setModal(null);
      notify("success", `Connected to GitHub as @${u.login}`);
      void refresh();
    } catch (e) { notify("error", errorMessage(e)); }
    finally { setBusy(false); }
  }

  async function mutate(action: () => Promise<unknown>, successMessage: string) {
    setBusy(true);
    try {
      await action(); setModal(null); setSelectedRepo(null); setConfirmText("");
      notify("success", successMessage); await refresh();
    } catch (e) { notify("error", errorMessage(e)); }
    finally { setBusy(false); }
  }

  function guard(action: string, repo: Repo) {
    if (action === "open") { void visit(repo.html_url); setMenuId(null); return; }
    if (action === "clone") {
      void navigator.clipboard.writeText(`git clone ${repo.clone_url}`).then(() => notify("success", "Clone command copied to clipboard")).catch(() => notify("error", "Could not access the clipboard"));
      setMenuId(null); return;
    }
    if (!connected) { notify("info", "Connect a GitHub token to manage repositories."); setMenuId(null); return; }
    if (repo.permissions?.admin === false && ["edit", "archive", "visibility", "delete"].includes(action)) {
      notify("error", "This repository requires GitHub admin permissions."); setMenuId(null); return;
    }
    if (["edit", "archive", "visibility", "delete"].includes(action)) begin(action as Modal, repo);
  }

  function viewRepo(repo: Repo) {
    setSelectedRepo(repo); setMenuId(null); setDetails(null); setDetailsLoading(true);
    void github.details(repo.full_name).then(setDetails).catch(e => notify("error", errorMessage(e))).finally(() => setDetailsLoading(false));
  }

  const selectedRepos = repos.filter(r => selected.includes(r.id));
  const requiredConfirmation = modal === "bulkDelete" ? `DELETE ${selectedRepos.length} REPOSITORIES` : (selectedRepo?.full_name || "");

  async function doBulkDelete() {
    if (confirmText !== requiredConfirmation || !connected) return;
    setBusy(true);
    const failures: string[] = [];
    let count = 0;
    for (const r of selectedRepos) {
      try { await github.delete(r.full_name, r.full_name); count++; }
      catch (e) { failures.push(`${r.name}: ${errorMessage(e)}`); }
    }
    setBusy(false); setSelected([]); setConfirmText(""); setModal(null);
    await refresh();
    notify(failures.length ? "error" : "success", `${count} repositories deleted${failures.length ? `; ${failures.length} failed. ${failures[0]}` : "."}`);
  }

  async function doBulkArchive() {
    if (!connected) { notify("info", "Connect first to archive repositories."); return; }
    if (!window.confirm(`Archive ${selectedRepos.length} selected repositories? This disables new commits until they are unarchived.`)) return;
    setBusy(true);
    let failed = 0;
    for (const r of selectedRepos.filter(r => !r.archived)) {
      try { await github.update(r.full_name, { archived: true }); }
      catch { failed++; }
    }
    setSelected([]); setBusy(false); await refresh();
    notify(failed ? "error" : "success", failed ? `${failed} repositories could not be archived.` : "Selected repositories archived.");
  }

  const filters: { id: FilterType; label: string; count: number }[] = [
    { id: "all", label: "All", count: stats.total },
    { id: "public", label: "Public", count: stats.public },
    { id: "private", label: "Private", count: stats.private },
    { id: "archived", label: "Archived", count: stats.archived }
  ];

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="sidebar-brand"><Brandmark/><div><div className="brand-title">Git<span>Flow</span></div><div className="brand-caption">YOUR COMMAND CENTER</div></div></div>
      <div className="workspace-chip"><span className="workspace-avatar">O</span><span className="workspace-text"><strong>{owner}</strong><small>GitHub workspace</small></span><ChevronDown size={14} /></div>
      <div className="sidebar-scroll">
        {nav.map(section => <div className="nav-group" key={section.group}>
          <div className="nav-section-label">{section.group}</div>
          {section.items.map(({ id, label, icon: Icon }) => <button key={id} className={`nav-link ${view === id ? "current" : ""}`} onClick={(e) => { e.stopPropagation(); setView(id); setMenuId(null); }}><Icon size={17} strokeWidth={view === id ? 2.4 : 1.9}/><span>{label}</span>{id === "repositories" && <small>{stats.total}</small>}{view === id && <i />}</button>)}
        </div>)}
        <div className="sidebar-upgrade">
          <div className="sidebar-upgrade-icon"><Sparkles size={19}/></div>
          <strong>Work smarter.</strong><p>Every repository, one beautiful command center.</p>
          <button onClick={() => setPaletteOpen(true)}>Explore commands <ArrowRight size={13}/></button>
        </div>
      </div>
      <div className="sidebar-footer">
        <div className="status-live"><span className="status-led" /> {connected ? "GitHub connected" : "Read-only mode"}</div>
        <button className="profile" onClick={() => connected ? setView("settings") : begin("connect")}>
          <div className="profile-avatar">{user?.avatar_url ? <img src={user.avatar_url} alt="GitHub avatar"/> : <Github size={19}/>}</div>
          <div className="profile-text"><strong>{user?.login || "Connect GitHub"}</strong><small>{connected ? "Authenticated session" : "Set up your account"}</small></div><ChevronRight size={15} />
        </button>
      </div>
    </aside>

    <div className="main-pane">
      <header className="topbar">
        <div className="breadcrumb"><Menu size={17} className="topbar-menu"/><span>Workspace</span><ChevronRight size={14}/><strong>{view === "overview" ? "Dashboard" : view === "repositories" ? "Repositories" : view === "activity" ? "Recent activity" : view === "insights" ? "Insights" : "Settings"}</strong></div>
        <div className="topbar-actions">
          {!isDesktop && <span className="demo-label"><span /> Browser preview</span>}
          <button className="command-trigger" onClick={() => setPaletteOpen(true)}><Search size={15}/><span>Quick search</span><kbd>Ctrl K</kbd></button>
          <IconButton icon={RefreshCcw} label="Refresh repositories" onClick={() => void refresh()}/>
          <IconButton icon={Bell} label="Notifications" onClick={() => notify("info", "You're all caught up. GitFlow checks GitHub when you refresh.")}/>
          <div className="topbar-avatar" onClick={() => begin("connect")} title="GitHub account">{user?.avatar_url ? <img src={user.avatar_url} alt=""/> : <Github size={17}/>}</div>
        </div>
      </header>

      <main className="content">
        <AnimatePresence mode="wait">
          <motion.div key={view} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: .18 }}>
            {view === "overview" && <>
              <div className="heading-row"><div><div className="eyebrow"><span className="tiny-sparkle">✦</span> YOUR WORKSPACE AT A GLANCE</div><h1>Good to have you here<span className="purple-dot">.</span></h1><p className="page-subtitle">Everything you need to manage your code, beautifully organized.</p></div><button className="primary-btn" onClick={() => begin("create")}><Plus size={17}/> New repository</button></div>
              <div className="hero"><div className="hero-aura"/><div className="hero-copy"><Pill tone="purple"><Zap size={12}/> ALL SYSTEMS READY</Pill><h2>One workspace.<br/><span>Infinite possibilities.</span></h2><p>Stay in flow. Manage every repository, track activity, and ship without switching tabs.</p><button onClick={() => setView("repositories")} className="hero-button">Explore repositories <ArrowUpRight size={17}/></button></div><div className="hero-art" aria-hidden="true"><div className="orbit orbit-one"/><div className="orbit orbit-two"/><div className="orbit orbit-three"/><div className="hero-center"><GitBranch size={43}/></div><div className="hero-floating float-one"><Code2 size={22}/></div><div className="hero-floating float-two"><Star size={20}/></div><div className="hero-floating float-three"><GitFork size={20}/></div><div className="hero-line line-one"/><div className="hero-line line-two"/></div></div>
              <div className="stats-grid">
                <StatCard icon={FolderGit2} title="Total repositories" value={formatNumber(stats.total)} note="In this workspace" color="#a994ff" delay={.02}/>
                <StatCard icon={Globe2} title="Public repositories" value={formatNumber(stats.public)} note="Open to the world" color="#79cbaf" delay={.06}/>
                <StatCard icon={LockKeyhole} title="Private repositories" value={formatNumber(stats.private)} note="Visible with access" color="#efbb7c" delay={.1}/>
                <StatCard icon={Star} title="Total stars" value={formatNumber(stats.stars)} note="Across your projects" color="#88baff" delay={.14}/>
              </div>
              <div className="overview-grid">
                <section className="surface-section"><div className="section-heading"><div><h3>Recently updated</h3><p>Pick up where you left off</p></div><button className="link-btn" onClick={() => setView("activity")}>View all <ArrowRight size={14}/></button></div>
                  {recent.length ? recent.map(r => <ActivityRow key={r.id} repo={r} onOpen={viewRepo}/>) : <div className="empty-mini">No repositories in this workspace yet.</div>}
                </section>
                <section className="surface-section"><div className="section-heading"><div><h3>Workspace overview</h3><p>Visibility and project health</p></div><Layers3 size={17} className="muted-icon"/></div>
                  <div className="health-ring-wrap"><div className="health-ring" style={{ "--percentage": `${stats.total ? (stats.active / stats.total) * 100 : 0}%` } as CSSProperties}><div><strong>{stats.total ? Math.round(stats.active / stats.total * 100) : 0}%</strong><span>Active</span></div></div><div className="health-items"><div><span className="legend-dot" style={{ background: "#aa96f4" }}/><span>Active projects</span><strong>{stats.active}</strong></div><div><span className="legend-dot" style={{ background: "#5d6082" }}/><span>Archived</span><strong>{stats.archived}</strong></div><div><span className="legend-dot" style={{ background: "#88baff" }}/><span>Total forks</span><strong>{stats.forks}</strong></div></div></div>
                  <div className="workspace-footnote"><ShieldCheck size={15}/> GitHub API powered. Nothing is deleted without confirmation.</div>
                </section>
              </div>
            </>}
            {view === "repositories" && <>
              <div className="heading-row"><div><div className="eyebrow">REPOSITORY MANAGEMENT</div><h1>Repositories<span className="purple-dot">.</span></h1><p className="page-subtitle">Your entire code universe, in one place.</p></div><button className="primary-btn" onClick={() => begin("create")}><Plus size={17}/> New repository</button></div>
              <div className="repos-toolbar"><div className="repo-search"><Search size={17}/><input placeholder="Search repositories, languages, descriptions..." value={search} onChange={e => setSearch(e.target.value)}/>{search && <IconButton icon={X} label="Clear search" onClick={() => setSearch("")}/>}</div><div className="sort-select"><Filter size={16}/><select aria-label="Sort repositories" value={sort} onChange={e => setSort(e.target.value as SortType)}><option value="updated">Recently updated</option><option value="name">Name A–Z</option><option value="stars">Most stars</option></select></div><div className="display-switch"><button title="Grid view" className={display === "grid" ? "active" : ""} onClick={() => setDisplay("grid")}><LayoutDashboard size={15}/></button><button title="List view" className={display === "list" ? "active" : ""} onClick={() => setDisplay("list")}><Menu size={15}/></button></div></div>
              <div className="filter-line"><div className="filter-tabs">{filters.map(f => <button key={f.id} className={filter === f.id ? "active" : ""} onClick={() => { setFilter(f.id); setSelected([]); }}>{f.label}<small>{f.count}</small></button>)}</div><span className="result-counter">Showing {filtered.length} of {repos.length} repositories</span></div>
              {selected.length > 0 && <div className="bulk-bar"><div className="bulk-info"><span className="bulk-count">{selected.length}</span> selected<button className="bulk-clear" onClick={() => setSelected([])}>Clear</button></div><div className="bulk-buttons"><button onClick={() => void doBulkArchive()} disabled={!connected || busy}><Archive size={15}/> Archive selected</button><button className="danger-outline" onClick={() => begin("bulkDelete")} disabled={!connected || busy}><Trash2 size={15}/> Delete selected</button></div></div>}
              {loading && <div className="loading-bar"/>}
              {!loading && filtered.length === 0 ? <div className="empty-state"><FolderGit2 size={32}/><h3>No repositories found</h3><p>Try a different filter or connect a GitHub account to view private repositories.</p><button className="secondary-btn" onClick={() => { setSearch(""); setFilter("all"); }}>Clear filters</button></div> :
                <div className={`repo-grid ${display === "list" ? "repo-list" : ""}`}>
                  <AnimatePresence>{filtered.map(repo => <RepoCard key={repo.id} repo={repo} checked={selected.includes(repo.id)} onCheck={id => setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])} onView={viewRepo} onMenu={id => setMenuId(v => v === id ? null : id)} menuOpen={menuId === repo.id} onAction={guard} editable={connected}/>)}</AnimatePresence>
                </div>}
            </>}
            {view === "activity" && <>
              <div className="heading-row"><div><div className="eyebrow">KEEP THE MOMENTUM</div><h1>Recent activity<span className="purple-dot">.</span></h1><p className="page-subtitle">Repository updates, all in one timeline.</p></div><button className="secondary-btn" onClick={() => void refresh()}><RefreshCcw size={16}/> Refresh</button></div>
              <div className="surface-section timeline"><div className="section-heading"><div><h3>Workspace timeline</h3><p>Based on each repository's last update timestamp</p></div><Pill tone="purple"><Activity size={12}/> Live GitHub data</Pill></div>
                {[...repos].sort((a,b) => Date.parse(b.updated_at)-Date.parse(a.updated_at)).map(r => <div className="timeline-item" key={r.id}><div className="timeline-icon"><GitBranch size={15}/></div><div><strong>{r.name} <span>was updated</span></strong><small>{r.full_name} · {r.language || "Other"}</small></div><time>{new Date(r.updated_at).toLocaleDateString()}</time><button onClick={() => viewRepo(r)}><ArrowUpRight size={15}/></button></div>)}
                {!repos.length && <div className="empty-mini">There is no activity to display yet.</div>}
              </div>
            </>}
            {view === "insights" && <>
              <div className="heading-row"><div><div className="eyebrow">MAKE DATA WORK FOR YOU</div><h1>Insights<span className="purple-dot">.</span></h1><p className="page-subtitle">A bird's-eye view of your GitHub workspace.</p></div><Pill tone="purple"><Sparkles size={13}/> Workspace analytics</Pill></div>
              <div className="stats-grid"><StatCard icon={Layers3} title="Active projects" value={`${stats.active}`} note="Not archived" color="#a994ff"/><StatCard icon={Star} title="Stars earned" value={`${stats.stars}`} note="Public recognition" color="#efbb7c"/><StatCard icon={GitFork} title="Forks created" value={`${stats.forks}`} note="Community engagement" color="#79cbaf"/><StatCard icon={Code2} title="Languages" value={`${languages.length}`} note="Languages represented" color="#88baff"/></div>
              <div className="overview-grid insight-grid"><section className="surface-section"><div className="section-heading"><div><h3>Language distribution</h3><p>By primary repository language</p></div><Code2 size={17} className="muted-icon"/></div><div className="language-bars">{languages.length ? languages.map(([lang, count]) => <div className="language-row" key={lang}><div><span className="language-dot" style={{ background: languageColor(lang) }}/><strong>{lang}</strong><span>{count} repos</span></div><div className="progress-track"><div style={{ width: `${count / Math.max(1, stats.total) * 100}%`, background: languageColor(lang) }}/></div></div>) : <div className="empty-mini">No language data available.</div>}</div></section>
                <section className="surface-section"><div className="section-heading"><div><h3>Top repositories</h3><p>Ranked by GitHub stars</p></div><Star size={17} className="muted-icon"/></div>{[...repos].sort((a,b) => b.stargazers_count-a.stargazers_count).slice(0, 6).map((r,i) => <button className="top-repo" key={r.id} onClick={() => viewRepo(r)}><span>0{i+1}</span><strong>{r.name}</strong><small><Star size={13}/> {r.stargazers_count}</small><ArrowUpRight size={15}/></button>)}{repos.length === 0 && <div className="empty-mini">Nothing to rank yet.</div>}</section>
              </div>
            </>}
            {view === "settings" && <>
              <div className="heading-row"><div><div className="eyebrow">MAKE IT YOURS</div><h1>Settings<span className="purple-dot">.</span></h1><p className="page-subtitle">Manage the account and workspace used by GitFlow.</p></div></div>
              <div className="settings-stack">
                <div className="surface-section settings-card"><div className="settings-icon"><Github size={23}/></div><div className="settings-copy"><h3>GitHub connection</h3><p>{connected ? `Signed in as @${user?.login}. Credentials are held in memory until you disconnect or close GitFlow.` : "Connect with a GitHub personal access token to manage private and organization repositories."}</p><div className="setting-status"><span className={`status-led ${connected ? "" : "offline"}`}/>{connected ? "Connected and authenticated" : "Not connected"}</div></div><div className="settings-actions">{connected ? <button className="secondary-btn" onClick={() => void github.disconnect().then(() => { setUser(null); notify("success", "Disconnected from GitHub"); void refresh(); }).catch(e => notify("error", errorMessage(e)))}>Disconnect</button> : <button className="primary-btn" onClick={() => begin("connect")}><KeyRound size={16}/> Connect</button>}</div></div>
                <div className="surface-section settings-card"><div className="settings-icon"><Layers3 size={23}/></div><div className="settings-copy"><h3>Active workspace</h3><p>Enter an organization or personal GitHub username. GitFlow will load its repositories automatically.</p><div className="owner-form"><input aria-label="GitHub organization or username" value={ownerInput} onChange={e => setOwnerInput(e.target.value)} placeholder="OreoStudios"/><button className="secondary-btn" onClick={() => { if (!/^[A-Za-z0-9_.-]+$/.test(ownerInput.trim())) return notify("error", "Enter a valid GitHub owner name"); setOwner(ownerInput.trim()); setSelected([]); notify("success", `Workspace set to ${ownerInput.trim()}`); }}>Apply workspace</button></div></div></div>
                <div className="surface-section settings-card"><div className="settings-icon"><ShieldCheck size={23}/></div><div className="settings-copy"><h3>Safety and privacy</h3><p>GitFlow never saves your personal access token to localStorage or a file. Delete operations require an exact-name confirmation, and private repositories require appropriate GitHub permissions.</p><div className="settings-mini"><Pill tone="green"><ShieldCheck size={12}/> Token held in memory</Pill><Pill><LockKeyhole size={12}/> Destructive actions protected</Pill></div></div></div>
                <div className="surface-section settings-card"><div className="settings-icon"><CircleHelp size={23}/></div><div className="settings-copy"><h3>About GitFlow</h3><p>GitFlow v0.1.0 — built with Tauri 2, Rust, React, and TypeScript. Made for fast GitHub workflows by Oreo Studios.</p></div><button className="secondary-btn" onClick={() => void visit("https://github.com/OreoStudios")}>Oreo Studios <ExternalLink size={14}/></button></div>
              </div>
            </>}
          </motion.div>
        </AnimatePresence>
        {!!error && <div className="error-banner"><ShieldAlert size={17}/><span>{error}</span><button onClick={() => void refresh()}>Try again</button></div>}
        <footer className="app-footer"><span>GitFlow <span className="footer-version">v0.1.0</span> · Made for builders</span><span><span className="status-led"/> {loading ? "Syncing" : isDesktop ? "GitHub API" : "Preview data"} <span className="footer-divider">·</span> Oreo Studios</span></footer>
      </main>
    </div>

    <AnimatePresence>{notice && <motion.div className={`toast toast-${notice.type}`} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 30 }}><span className="toast-icon">{notice.type === "success" ? <CheckCircle2 size={18}/> : notice.type === "error" ? <ShieldAlert size={18}/> : <Bell size={18}/>}</span><span>{notice.message}</span><IconButton icon={X} label="Dismiss notice" onClick={() => setNotice(null)}/></motion.div>}</AnimatePresence>

    <AnimatePresence>{paletteOpen && <ModalFrame title="Command palette" eyebrow="GO ANYWHERE, INSTANTLY" onClose={() => setPaletteOpen(false)}><div className="palette-items">{nav.flatMap(n => n.items).map(item => <button key={item.id} onClick={() => { setView(item.id); setPaletteOpen(false); }}><item.icon size={17}/>{item.label}<ArrowUpRight size={14}/></button>)}<button onClick={() => { setPaletteOpen(false); begin("create"); }}><Plus size={17}/>Create repository<ArrowUpRight size={14}/></button><button onClick={() => { setPaletteOpen(false); begin("connect"); }}><KeyRound size={17}/>Connect GitHub<ArrowUpRight size={14}/></button></div><p className="modal-hint"><kbd>Ctrl K</kbd> to toggle · <kbd>Esc</kbd> to close</p></ModalFrame>}</AnimatePresence>

    <AnimatePresence>{modal && <ModalFrame title={modal === "connect" ? "Connect to GitHub" : modal === "create" ? "Create a repository" : modal === "edit" ? "Edit repository" : modal === "archive" ? (selectedRepo?.archived ? "Unarchive repository" : "Archive repository") : modal === "visibility" ? "Change visibility" : modal === "bulkDelete" ? "Delete selected repositories" : "Delete repository"} eyebrow={modal === "delete" || modal === "bulkDelete" ? "DANGER ZONE" : "GITFLOW WORKSPACE"} onClose={resetModal}>
      {modal === "connect" && <div className="modal-body"><div className="modal-feature-icon"><KeyRound size={25}/></div><p>Use a GitHub personal access token to connect. Your token stays only in the Rust process memory until GitFlow closes.</p><label className="field-label">PERSONAL ACCESS TOKEN</label><input className="field" type="password" autoComplete="off" placeholder="github_pat_... or ghp_..." value={token} onChange={e => setToken(e.target.value)} onKeyDown={e => { if (e.key === "Enter") void connect(); }}/><div className="permission-note"><ShieldCheck size={17}/><span>For deletion, a fine-grained token needs repository <b>Administration: Read and write</b>. Restrict access to only the repositories you intend to manage.</span></div><button className="subtle-link" onClick={() => void visit("https://github.com/settings/personal-access-tokens/new")}>Create a fine-grained token <ExternalLink size={14}/></button><div className="modal-actions"><button className="secondary-btn" onClick={resetModal}>Cancel</button><button className="primary-btn" disabled={busy || token.length < 10} onClick={() => void connect()}>{busy ? "Connecting..." : "Connect GitHub"}<ArrowRight size={15}/></button></div></div>}
      {modal === "create" && <div className="modal-body"><p>Start your next project without leaving GitFlow. The repository will be created under <strong>{owner}</strong>.</p><label className="field-label">REPOSITORY NAME</label><input autoFocus className="field" placeholder="my-awesome-project" value={createName} onChange={e => setCreateName(e.target.value)}/><label className="field-label">DESCRIPTION</label><textarea className="field textarea" placeholder="What's this project about?" value={createDesc} onChange={e => setCreateDesc(e.target.value)}/><div className="privacy-picker"><button className={!createPrivate ? "chosen" : ""} onClick={() => setCreatePrivate(false)}><Globe2 size={19}/><span><b>Public</b><small>Anyone can see this repo</small></span></button><button className={createPrivate ? "chosen" : ""} onClick={() => setCreatePrivate(true)}><LockKeyhole size={19}/><span><b>Private</b><small>Only people with access</small></span></button></div><div className="modal-actions"><button className="secondary-btn" onClick={resetModal}>Cancel</button><button className="primary-btn" disabled={busy || !connected || !/^[A-Za-z0-9_.-]+$/.test(createName)} onClick={() => void mutate(() => github.create({ owner, name: createName, description: createDesc, is_private: createPrivate }), "Repository created successfully")}><Plus size={16}/>{busy ? "Creating..." : "Create repository"}</button></div>{!connected && <p className="modal-hint">Connect your GitHub account before creating a repository.</p>}</div>}
      {modal === "edit" && selectedRepo && <div className="modal-body"><p>Editing <strong>{selectedRepo.full_name}</strong>. Changes will be sent directly to GitHub.</p><label className="field-label">REPOSITORY NAME</label><input className="field" value={editName} onChange={e => setEditName(e.target.value)}/><label className="field-label">DESCRIPTION</label><textarea className="field textarea" value={editDesc} onChange={e => setEditDesc(e.target.value)}/><div className="modal-actions"><button className="secondary-btn" onClick={resetModal}>Cancel</button><button className="primary-btn" disabled={busy || !/^[A-Za-z0-9_.-]+$/.test(editName)} onClick={() => void mutate(() => github.update(selectedRepo.full_name, { name: editName, description: editDesc }), "Repository updated successfully")}>{busy ? "Saving..." : "Save changes"}</button></div></div>}
      {modal === "archive" && selectedRepo && <div className="modal-body"><div className="modal-feature-icon amber"><Archive size={24}/></div><p>{selectedRepo.archived ? "Unarchiving will allow new changes to this repository again." : "Archiving will make this repository read-only. Its code and history stay on GitHub, and it can be unarchived later."}</p><div className="warning-repo">{selectedRepo.full_name}</div><div className="modal-actions"><button className="secondary-btn" onClick={resetModal}>Cancel</button><button className="primary-btn" disabled={busy} onClick={() => void mutate(() => github.update(selectedRepo.full_name, { archived: !selectedRepo.archived }), `Repository ${selectedRepo.archived ? "unarchived" : "archived"}`)}>{busy ? "Working..." : selectedRepo.archived ? "Unarchive" : "Archive"}</button></div></div>}
      {modal === "visibility" && selectedRepo && <div className="modal-body"><div className="modal-feature-icon amber">{selectedRepo.private ? <Eye size={24}/> : <EyeOff size={24}/>}</div><p>Change <strong>{selectedRepo.full_name}</strong> from {selectedRepo.private ? "private to public" : "public to private"}.</p><div className="warning-box"><ShieldAlert size={19}/><span>{selectedRepo.private ? "Making a repository public exposes its code and history. Review for secrets and confidential data before proceeding." : "Making a repository private may affect forks, access permissions, and integrations."}</span></div><label className="field-label">TYPE {selectedRepo.private ? "MAKE PUBLIC" : "MAKE PRIVATE"} TO CONFIRM</label><input autoComplete="off" className="field" value={confirmText} onChange={e => setConfirmText(e.target.value)}/><div className="modal-actions"><button className="secondary-btn" onClick={resetModal}>Cancel</button><button className="primary-btn" disabled={busy || confirmText !== (selectedRepo.private ? "MAKE PUBLIC" : "MAKE PRIVATE")} onClick={() => void mutate(() => github.update(selectedRepo.full_name, { is_private: !selectedRepo.private }), "Repository visibility updated")}>Change visibility</button></div></div>}
      {(modal === "delete" || modal === "bulkDelete") && <div className="modal-body"><div className="modal-feature-icon danger"><Trash2 size={24}/></div><div className="warning-box danger-box"><ShieldAlert size={19}/><span><strong>This action is destructive.</strong> Deleting a repository removes its code and associated data. Recovery is not guaranteed.</span></div><p>{modal === "delete" ? <>You are about to permanently delete <strong>{selectedRepo?.full_name}</strong> from GitHub.</> : <>You are about to delete <strong>{selectedRepos.length} repositories</strong>: {selectedRepos.map(r => r.name).join(", ")}.</>}</p><label className="field-label">TYPE <strong>{requiredConfirmation}</strong> TO CONFIRM</label><input autoComplete="off" className="field danger-field" placeholder={requiredConfirmation} value={confirmText} onChange={e => setConfirmText(e.target.value)}/><div className="modal-actions"><button className="secondary-btn" onClick={resetModal}>Cancel</button><button className="danger-btn" disabled={busy || !connected || confirmText !== requiredConfirmation} onClick={() => void (modal === "bulkDelete" ? doBulkDelete() : selectedRepo && mutate(() => github.delete(selectedRepo.full_name, confirmText), "Repository deleted from GitHub"))}><Trash2 size={16}/>{busy ? "Deleting..." : modal === "bulkDelete" ? `Delete ${selectedRepos.length} repositories` : "Delete repository"}</button></div></div>}
    </ModalFrame>}</AnimatePresence>

    <AnimatePresence>{selectedRepo && !modal && <motion.div className="drawer-scrim" onMouseDown={e => { if (e.target === e.currentTarget) setSelectedRepo(null); }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}><motion.aside className="repo-drawer" initial={{ x: 480 }} animate={{ x: 0 }} exit={{ x: 480 }} transition={{ type: "spring", damping: 30, stiffness: 300 }}><div className="drawer-header"><div className="eyebrow">REPOSITORY DETAILS</div><IconButton icon={X} label="Close details" onClick={() => setSelectedRepo(null)}/></div><div className="drawer-project-icon"><FolderGit2 size={28}/></div><h2>{selectedRepo.name}</h2><div className="drawer-fullname">{selectedRepo.full_name}</div><p>{selectedRepo.description || "No repository description."}</p><div className="drawer-pills"><Pill>{selectedRepo.private ? "Private" : "Public"}</Pill>{selectedRepo.archived && <Pill tone="amber">Archived</Pill>}<Pill tone="purple">{selectedRepo.language || "Unknown language"}</Pill></div><button className="drawer-open" onClick={() => void visit(selectedRepo.html_url)}>Open on GitHub <ExternalLink size={16}/></button><div className="drawer-stats"><div><Star size={17}/><strong>{selectedRepo.stargazers_count}</strong><small>Stars</small></div><div><GitFork size={17}/><strong>{selectedRepo.forks_count}</strong><small>Forks</small></div><div><ArrowDownLeft size={17}/><strong>{selectedRepo.open_issues_count}</strong><small>Open issues*</small></div></div><div className="drawer-section"><h3>Branches</h3>{detailsLoading ? <div className="loading-text">Fetching repository details...</div> : details?.branches.length ? details.branches.map(name => <div className="branch-row" key={name}><GitBranch size={15}/><span>{name}</span>{name === selectedRepo.default_branch && <Pill tone="green">Default</Pill>}</div>) : <div className="empty-mini">No branch data available.</div>}</div><div className="drawer-section"><h3>Latest workflow runs</h3>{details?.runs.length ? details.runs.map(run => <button className="workflow-row" onClick={() => void visit(run.html_url)} key={run.id}><span className={`run-dot ${run.conclusion === "success" ? "run-success" : run.conclusion === "failure" ? "run-failure" : ""}`}/><span>{run.name || "Workflow"}<small>{run.conclusion || run.status || "Queued"}</small></span><ArrowUpRight size={15}/></button>) : <div className="empty-mini">No recent workflow runs or insufficient API permissions.</div>}</div><div className="drawer-bottom"><button className="secondary-btn" onClick={() => guard("clone", selectedRepo)}><Copy size={15}/> Copy clone</button><button className="danger-outline" disabled={!connected} onClick={() => begin("delete", selectedRepo)}><Trash2 size={15}/> Delete</button></div><small className="drawer-note">* GitHub's issue count may include pull requests.</small></motion.aside></motion.div>}</AnimatePresence>
  </div>;
}
