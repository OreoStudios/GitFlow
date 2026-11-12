# GitFlow

An immersive GitHub command center for Windows, macOS, and Linux, built by Oreo Studios with **Tauri 2 + Rust + React + TypeScript**.

![GitFlow icon](src-tauri/icons/128x128.png)

## Features

- Immersive dark interface: gradients, ambient 3D-style orbit graphic, responsive dashboard, smooth animations, keyboard command palette (`Ctrl+K`)
- Browse public repositories from an organization or user without signing in
- Automatically switch to **All repositories** after GitHub sign-in, combining authorized private projects with public personal and organization repositories
- Switch between your personal account and discovered GitHub organizations directly from the sidebar
- Connect a GitHub fine-grained PAT to access permitted private repositories
- Overview dashboard with real repository, visibility, archive, star, fork, and language counts
- Search repositories by name, description, and language
- Filter public, private, and archived repositories; sort by update, name, or stars
- Grid and list layouts; repository detail drawer with branches, recent GitHub Actions, and pull requests
- Create, rename, edit description, archive/unarchive, and change repository visibility
- Copy `git clone` command; open a repository on GitHub
- Delete repositories with **exact full-name verification**
- Select multiple repositories for bulk archive or bulk deletion (extra phrase confirmation)
- Token stored **only in the native Rust process memory** (not saved to disk or localStorage)

## Requirements

- Node.js 20.19+ or 22+
- Rust toolchain (stable) via [rustup](https://rustup.rs/)
- Windows: Microsoft C++ Build Tools and WebView2 (normally preinstalled on Windows 11)
- macOS: Xcode Command Line Tools
- Linux: Tauri 2's system libraries (`libwebkit2gtk-4.1-dev`, `build-essential`, `curl`, `wget`, `file`, `libxdo-dev`, `libssl-dev`, `librsvg2-dev`, `libayatana-appindicator3-dev` and related GTK dependencies)

## Get started

```bash
npm install
npm run desktop
```

On Windows you can instead double-click `start-gitflow.bat` after installing Node.js and Rust. To produce an installer, double-click `build-windows.bat`.

This starts **the real Tauri desktop application** (React frontend + Rust API backend).

To preview only the UI in a web browser, use:

```bash
npm run dev
```

The browser version uses **clearly labeled sample data**. It **cannot** authenticate or change GitHub repositories; all GitHub operations require the desktop build.

Build the desktop installer (run on the target OS):

```bash
npm run package:desktop
```

Tauri outputs platform-specific bundles in `src-tauri/target/release/bundle/`.

## Authentication

GitFlow uses a fine-grained GitHub Personal Access Token (PAT). In GitHub:

1. Visit https://github.com/settings/personal-access-tokens/new
2. Select the correct **Resource owner** (your personal account or an organization), and limit the token to only the repositories you plan to manage. A **fine-grained PAT is scoped to one resource owner**; one token cannot grant private-repository access across multiple unrelated owners. GitFlow will still discover public projects from accessible accounts and organizations.
3. For read-only browsing, token permissions can be minimal. To create/edit/archive/delete repositories, the token generally needs **Administration: Read and write** on those repositories. Some detail views may additionally need Actions and Pull requests read permissions; inaccessible sections degrade gracefully.
4. The organization may require token approval, or may block repository deletion even for admins.
5. Paste your token into GitFlow's **Connect GitHub** modal. The dashboard automatically switches to **All repositories**, and the sidebar shows your personal account and organizations discovered from your token and public memberships. It stays in RAM until disconnect or app exit.
6. If a private repository is missing, check that the token's **Repository access** covers it and that the organization approved the token. For multiple organizations' private repositories, a classic PAT with appropriate access can work, but it has broader permissions than a fine-grained token; use the least privilege you need.

**Important:** GitFlow never requests the token on a website or from an intermediary server. API calls go from the native Rust backend to `https://api.github.com`. Do not publish your token or commit it to source control.

## Safety

Deletion is real and destructive. GitFlow's Delete dialog requires typing the entire `owner/repo` exactly. A second validation also runs in the Rust backend before any GitHub `DELETE /repos/{owner}/{repo}` request. Bulk deletion requires a separate `DELETE N REPOSITORIES` phrase; then Rust additionally verifies each repository name. There is no automatic delete or timed delete. GitHub's server-side permissions remain authoritative. **Back up important repositories first.**

Changing a private repository to public also requires an explicit typed phrase. Bulk archives require a confirmation. You cannot change repository data in browser preview mode.

## Project structure

- `src/App.tsx`: application UI and workflows
- `src/styles.css`: GitFlow's full custom design system
- `src/api.ts`: typed Rust IPC bridge and clearly labeled browser demo
- `src-tauri/src/lib.rs`: native GitHub API calls, auth, validation, and management operations
- `src-tauri/capabilities/default.json`: minimal Tauri plugin permissions

## Roadmap

Potential future features: OAuth device login, secure OS keychain persistence, branch and PR management, clone into chosen local directory, GitHub Actions dispatch, branch protection dashboards, notifications, richer charts, background sync, multiple independently scoped GitHub sessions.

## Notes

This is a **source project, not a precompiled installer**. You need the Rust toolchain to compile the native desktop binary. For very large accounts, authenticated pagination is capped at 10,000 repositories, and public cross-organization enrichment is limited to 30 organizations per refresh. The GitHub REST API may rate-limit large refreshes.

License: MIT (see `LICENSE`).
