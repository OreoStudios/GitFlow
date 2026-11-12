use reqwest::{Client, Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::sync::Mutex;
use tauri::State;

const API: &str = "https://api.github.com";

struct AppState {
    client: Client,
    // The access token only exists in memory and disappears when GitFlow closes.
    token: Mutex<Option<String>>,
}

#[derive(Debug, Serialize, Deserialize)]
struct GitHubUser {
    login: String,
    avatar_url: Option<String>,
    name: Option<String>,
    public_repos: Option<u64>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct RepoOwner {
    login: String,
    avatar_url: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Permissions {
    admin: Option<bool>,
    push: Option<bool>,
    pull: Option<bool>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
struct Repo {
    id: u64,
    name: String,
    full_name: String,
    description: Option<String>,
    private: bool,
    fork: bool,
    archived: bool,
    html_url: String,
    clone_url: String,
    language: Option<String>,
    stargazers_count: u64,
    forks_count: u64,
    open_issues_count: u64,
    updated_at: String,
    pushed_at: Option<String>,
    created_at: String,
    default_branch: String,
    size: u64,
    owner: RepoOwner,
    permissions: Option<Permissions>,
}

#[derive(Debug, Serialize, Deserialize)]
struct WorkflowRun {
    id: u64,
    name: Option<String>,
    status: Option<String>,
    conclusion: Option<String>,
    html_url: String,
    created_at: String,
}

#[derive(Debug, Serialize)]
struct RepoDetails {
    branches: Vec<String>,
    open_pull_requests: usize,
    runs: Vec<WorkflowRun>,
}

fn valid_segment(s: &str) -> bool {
    !s.is_empty()
        && s.len() <= 100
        && s.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.')
        && s != "."
        && s != ".."
}

fn valid_full_name(full_name: &str) -> Result<(&str, &str), String> {
    let (owner, name) = full_name.split_once('/').ok_or("Expected owner/repository")?;
    if !valid_segment(owner) || !valid_segment(name) {
        return Err("Invalid repository name".into());
    }
    Ok((owner, name))
}

fn stored_token(state: &AppState) -> Result<Option<String>, String> {
    state.token.lock().map(|t| t.clone()).map_err(|_| "Authentication state unavailable".into())
}

fn require_token(state: &AppState) -> Result<String, String> {
    stored_token(state)?.ok_or("Connect your GitHub token to use management actions".into())
}

async fn request(
    state: &AppState,
    method: Method,
    path: &str,
    body: Option<Value>,
    must_authenticate: bool,
) -> Result<reqwest::Response, String> {
    let token = if must_authenticate { Some(require_token(state)?) } else { stored_token(state)? };
    let mut builder = state.client.request(method, format!("{API}{path}"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "GitFlow-OreoStudios/0.1");
    if let Some(t) = token { builder = builder.bearer_auth(t); }
    if let Some(value) = body { builder = builder.json(&value); }
    let response = builder.send().await.map_err(|e| format!("Network error: {e}"))?;
    if !response.status().is_success() {
        let status = response.status();
        let data = response.json::<Value>().await.unwrap_or(json!({}));
        let message = data.get("message").and_then(Value::as_str).unwrap_or("GitHub request failed");
        return Err(format!("GitHub returned {status}: {message}"));
    }
    Ok(response)
}

async fn get_json(state: &AppState, path: &str, auth: bool) -> Result<Value, String> {
    request(state, Method::GET, path, None, auth).await?
        .json::<Value>().await.map_err(|e| format!("Invalid GitHub response: {e}"))
}

#[tauri::command]
async fn connect_github(token: String, state: State<'_, AppState>) -> Result<GitHubUser, String> {
    if token.trim().len() < 10 || token.contains(char::is_whitespace) {
        return Err("Please enter a valid GitHub personal access token".into());
    }
    let res = state.client.get(format!("{API}/user"))
        .header("Accept", "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .header("User-Agent", "GitFlow-OreoStudios/0.1")
        .bearer_auth(token.trim())
        .send().await.map_err(|e| format!("Could not reach GitHub: {e}"))?;
    if !res.status().is_success() {
        return Err("Token rejected by GitHub. Check its permissions and expiration.".into());
    }
    let user = res.json::<GitHubUser>().await.map_err(|e| e.to_string())?;
    *state.token.lock().map_err(|_| "Authentication state unavailable")? = Some(token.trim().to_owned());
    Ok(user)
}

#[tauri::command]
fn disconnect_github(state: State<'_, AppState>) -> Result<(), String> {
    *state.token.lock().map_err(|_| "Authentication state unavailable")? = None;
    Ok(())
}

#[derive(Debug, Serialize)]
struct Workspace {
    login: String,
    avatar_url: Option<String>,
    kind: String,
}

// The authenticated endpoint lists repositories the token can access across the
// personal account, collaborator projects and organization memberships.
// The token determines which private repos are visible; GitFlow cannot widen it.
async fn list_accessible_repositories(state: &AppState) -> Result<Vec<Repo>, String> {
    let mut repos = Vec::new();
    for page in 1..=100 {
        let path = format!(
            "/user/repos?affiliation=owner,collaborator,organization_member&per_page=100&page={page}&sort=updated&direction=desc"
        );
        let page_data = request(state, Method::GET, &path, None, true)
            .await?
            .json::<Vec<Repo>>()
            .await
            .map_err(|e| format!("Invalid GitHub repositories response: {e}"))?;
        let count = page_data.len();
        repos.extend(page_data);
        if count < 100 {
            break;
        }
    }
    let mut seen = std::collections::HashSet::new();
    repos.retain(|repo| seen.insert(repo.id));
    repos.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(repos)
}

async fn list_public_owner_repositories(state: &AppState, owner: &str) -> Result<Vec<Repo>, String> {
    let mut repos = Vec::new();
    // Try an organization, then fall back to a personal public account.
    let org_path = format!("/orgs/{owner}/repos?type=all&per_page=100&page=1");
    let org_exists = match request(state, Method::GET, &org_path, None, false).await {
        Ok(response) => {
            let first = response.json::<Vec<Repo>>().await.map_err(|e| e.to_string())?;
            repos.extend(first);
            true
        }
        Err(err) if err.contains("404") => false,
        Err(err) => return Err(err),
    };
    if org_exists {
        if repos.len() < 100 {
            return Ok(repos);
        }
        for page in 2..=100 {
            let path = format!("/orgs/{owner}/repos?type=all&per_page=100&page={page}");
            let page_data = request(state, Method::GET, &path, None, false)
                .await?
                .json::<Vec<Repo>>()
                .await
                .map_err(|e| e.to_string())?;
            let count = page_data.len();
            repos.extend(page_data);
            if count < 100 {
                break;
            }
        }
    } else {
        for page in 1..=100 {
            let path = format!("/users/{owner}/repos?type=owner&per_page=100&page={page}");
            let page_data = request(state, Method::GET, &path, None, false)
                .await?
                .json::<Vec<Repo>>()
                .await
                .map_err(|e| e.to_string())?;
            let count = page_data.len();
            repos.extend(page_data);
            if count < 100 {
                break;
            }
        }
    }
    repos.retain(|repo| repo.owner.login.eq_ignore_ascii_case(owner));
    repos.sort_by(|a, b| b.updated_at.cmp(&a.updated_at));
    Ok(repos)
}

#[tauri::command]
async fn list_repositories(owner: String, state: State<'_, AppState>) -> Result<Vec<Repo>, String> {
    if owner.eq_ignore_ascii_case("all") {
        return list_accessible_repositories(&state).await;
    }
    if !valid_segment(&owner) {
        return Err("Invalid GitHub owner or organization".into());
    }
    if stored_token(&state)?.is_some() {
        let repos = list_accessible_repositories(&state).await?;
        let scoped: Vec<Repo> = repos
            .into_iter()
            .filter(|repo| repo.owner.login.eq_ignore_ascii_case(&owner))
            .collect();
        if !scoped.is_empty() {
            return Ok(scoped);
        }
    }
    list_public_owner_repositories(&state, &owner).await
}

#[tauri::command]
async fn list_workspaces(state: State<'_, AppState>) -> Result<Vec<Workspace>, String> {
    let user = get_json(&state, "/user", true).await?;
    let me: GitHubUser = serde_json::from_value(user)
        .map_err(|e| format!("Cannot read authenticated GitHub user: {e}"))?;
    let mut workspaces = vec![Workspace {
        login: me.login.clone(),
        avatar_url: me.avatar_url,
        kind: "personal".to_string(),
    }];
    let mut seen = std::collections::HashSet::from([me.login.to_lowercase()]);

    // Some fine-grained tokens cannot list organization memberships. Owners
    // of accessible repositories are added below even if this call is denied.
    if let Ok(orgs) = get_json(&state, "/user/orgs?per_page=100", true).await {
        if let Some(items) = orgs.as_array() {
            for item in items {
                if let Some(login) = item.get("login").and_then(Value::as_str) {
                    if seen.insert(login.to_lowercase()) {
                        workspaces.push(Workspace {
                            login: login.to_owned(),
                            avatar_url: item.get("avatar_url").and_then(Value::as_str).map(str::to_owned),
                            kind: "organization".to_string(),
                        });
                    }
                }
            }
        }
    }

    for repo in list_accessible_repositories(&state).await? {
        if seen.insert(repo.owner.login.to_lowercase()) {
            workspaces.push(Workspace {
                login: repo.owner.login,
                avatar_url: repo.owner.avatar_url,
                kind: "repository owner".to_string(),
            });
        }
    }
    workspaces[1..].sort_by(|a, b| a.login.to_lowercase().cmp(&b.login.to_lowercase()));
    Ok(workspaces)
}

#[tauri::command]
async fn create_repository(
    owner: String, name: String, description: String, is_private: bool,
    state: State<'_, AppState>,
) -> Result<Repo, String> {
    if !valid_segment(&owner) || !valid_segment(&name) { return Err("Invalid repository owner or name".into()); }
    if description.len() > 1000 { return Err("Description is too long".into()); }
    let user = get_json(&state, "/user", true).await?;
    let me = user.get("login").and_then(Value::as_str).unwrap_or("");
    let path = if me.eq_ignore_ascii_case(&owner) { "/user/repos".to_owned() } else { format!("/orgs/{owner}/repos") };
    request(&state, Method::POST, &path, Some(json!({
        "name": name, "description": description, "private": is_private, "auto_init": true
    })), true).await?
        .json::<Repo>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn update_repository(
    full_name: String, name: Option<String>, description: Option<String>,
    is_private: Option<bool>, archived: Option<bool>, state: State<'_, AppState>,
) -> Result<Repo, String> {
    valid_full_name(&full_name)?;
    if let Some(ref n) = name { if !valid_segment(n) { return Err("Invalid repository name".into()); } }
    if let Some(ref d) = description { if d.len() > 1000 { return Err("Description is too long".into()); } }
    if name.is_none() && description.is_none() && is_private.is_none() && archived.is_none() {
        return Err("No changes requested".into());
    }
    let mut changes = serde_json::Map::new();
    if let Some(n) = name { changes.insert("name".into(), json!(n)); }
    if let Some(d) = description { changes.insert("description".into(), json!(d)); }
    if let Some(p) = is_private { changes.insert("private".into(), json!(p)); }
    if let Some(a) = archived { changes.insert("archived".into(), json!(a)); }
    request(&state, Method::PATCH, &format!("/repos/{full_name}"), Some(Value::Object(changes)), true)
        .await?.json::<Repo>().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn delete_repository(
    full_name: String, confirmation: String, state: State<'_, AppState>,
) -> Result<(), String> {
    valid_full_name(&full_name)?;
    // Backend confirmation is mandatory. UI validation alone is not enough.
    if confirmation != full_name {
        return Err(format!("Type {full_name} exactly to confirm deletion"));
    }
    let response = request(&state, Method::DELETE, &format!("/repos/{full_name}"), None, true).await?;
    if response.status() != StatusCode::NO_CONTENT {
        return Err(format!("Expected HTTP 204, received {}", response.status()));
    }
    Ok(())
}

#[tauri::command]
async fn repository_details(full_name: String, state: State<'_, AppState>) -> Result<RepoDetails, String> {
    valid_full_name(&full_name)?;

let branches_url = format!("/repos/{full_name}/branches?per_page=100");
let prs_url = format!("/repos/{full_name}/pulls?state=open&per_page=100");
let runs_url = format!("/repos/{full_name}/actions/runs?per_page=8");

let (branches, prs, runs) = tokio::join!(
    get_json(&state, &branches_url, false),
    get_json(&state, &prs_url, false),
    get_json(&state, &runs_url, false),
);

    let branches = branches.unwrap_or(json!([])).as_array().cloned().unwrap_or_default().iter()
        .filter_map(|v| v.get("name").and_then(Value::as_str).map(str::to_owned))
        .collect::<Vec<_>>();
    let open_pull_requests = prs.unwrap_or(json!([])).as_array().map(|v| v.len()).unwrap_or(0);
    let runs = runs.unwrap_or(json!({})).get("workflow_runs").and_then(Value::as_array)
        .cloned().unwrap_or_default().into_iter()
        .filter_map(|v| serde_json::from_value::<WorkflowRun>(v).ok()).collect::<Vec<_>>();
    Ok(RepoDetails { branches, open_pull_requests, runs })
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(25))
        .build().expect("GitHub HTTP client");
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppState { client, token: Mutex::new(None) })
        .invoke_handler(tauri::generate_handler![
            connect_github, disconnect_github, list_repositories, list_workspaces,
            create_repository, update_repository, delete_repository, repository_details,
        ])
        .run(tauri::generate_context!())
        .expect("GitFlow could not start");
}


#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn validates_repository_paths() {
        assert!(valid_full_name("OreoStudios/GitFlow").is_ok());
        assert!(valid_full_name("el211/my.repo-2").is_ok());
        assert!(valid_full_name("/repo").is_err());
        assert!(valid_full_name("owner/../../danger").is_err());
        assert!(valid_full_name("owner/repo?foo").is_err());
    }
}
