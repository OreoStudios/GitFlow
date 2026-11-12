import { invoke } from "@tauri-apps/api/core";

export interface Repo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  fork: boolean;
  archived: boolean;
  html_url: string;
  clone_url: string;
  language: string | null;
  stargazers_count: number;
  forks_count: number;
  open_issues_count: number;
  updated_at: string;
  pushed_at: string | null;
  created_at: string;
  default_branch: string;
  size: number;
  owner: { login: string; avatar_url: string | null };
  permissions?: { admin?: boolean; push?: boolean; pull?: boolean } | null;
}

export interface Workspace {
  login: string;
  avatar_url: string | null;
  kind: string;
}

export interface GitHubUser {
  login: string;
  name: string | null;
  avatar_url: string | null;
  public_repos: number | null;
}

export interface RepoDetails {
  branches: string[];
  open_pull_requests: number;
  runs: Array<{
    id: number;
    name: string | null;
    status: string | null;
    conclusion: string | null;
    html_url: string;
    created_at: string;
  }>;
}

export const isDesktop = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const demoNames = [
  ["MinecraftModulith", "A clean, modular architecture framework for Paper & Folia plugins.", "Java"],
  ["OEssentials", "Modular Minecraft essentials across networks.", "Java"],
  ["ModeledNPCS", "Immersive, interactive Minecraft NPCs and dialogues.", "Java"],
  ["CustomiZer", "Custom items, blocks and graphical interfaces.", "Java"],
  ["OreoStudios", "Creative development studio and its website.", "TypeScript"],
  ["ModernFactions", "Modern faction gameplay for multiplayer servers.", "Java"],
] as const;

export const demoRepos: Repo[] = demoNames.map(([name, description, language], i) => ({
  id: i + 1, name, full_name: `OreoStudios/${name}`, description,
  private: false, fork: false, archived: i === 5,
  html_url: `https://github.com/OreoStudios/${name}`,
  clone_url: `https://github.com/OreoStudios/${name}.git`, language,
  stargazers_count: 0, forks_count: 0, open_issues_count: 0,
  updated_at: new Date(Date.now() - i * 3 * 86400000).toISOString(),
  pushed_at: new Date(Date.now() - i * 3 * 86400000).toISOString(),
  created_at: new Date(Date.now() - 180 * 86400000).toISOString(),
  default_branch: "main", size: 0,
  owner: { login: "OreoStudios", avatar_url: null },
}));

function desktopOnly() {
  if (!isDesktop) throw new Error("This action requires the GitFlow desktop app. Run npm run desktop.");
}

export const github = {
  connect: (token: string) => { desktopOnly(); return invoke<GitHubUser>("connect_github", { token }); },
  disconnect: () => { desktopOnly(); return invoke<void>("disconnect_github"); },
  workspaces: () => isDesktop
    ? invoke<Workspace[]>("list_workspaces")
    : Promise.resolve<Workspace[]>([{ login: "OreoStudios", avatar_url: null, kind: "organization" }]),
  list: (owner: string) => isDesktop
    ? invoke<Repo[]>("list_repositories", { owner })
    : Promise.resolve(owner === "all" ? demoRepos : demoRepos.filter(r => r.owner.login.toLowerCase() === owner.toLowerCase())),
  create: (input: { owner: string; name: string; description: string; is_private: boolean }) => {
    desktopOnly();
    return invoke<Repo>("create_repository", { ...input, isPrivate: input.is_private });
  },
  update: (fullName: string, input: { name?: string; description?: string; is_private?: boolean; archived?: boolean }) => {
    desktopOnly();
    return invoke<Repo>("update_repository", { fullName, name: input.name ?? null, description: input.description ?? null, isPrivate: input.is_private ?? null, archived: input.archived ?? null });
  },
  delete: (fullName: string, confirmation: string) => {
    desktopOnly();
    return invoke<void>("delete_repository", { fullName, confirmation });
  },
  details: (fullName: string): Promise<RepoDetails> => isDesktop ? invoke<RepoDetails>("repository_details", { fullName }) : Promise.resolve({ branches: ["main", "develop"], open_pull_requests: 0, runs: [] }),
};
