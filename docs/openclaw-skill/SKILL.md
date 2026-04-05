---
name: us-weather-radar-public
description: Use when OpenClaw or another model-driven agent needs to work on this repository, start the local dashboard, verify local APIs, or update the weather-demand workflow without relying on any machine-specific paths or credentials.
---

# US Weather Radar Public Skill

This repository-local skill is the open-source-safe version of the weather radar workflow.
It is intentionally free of personal paths, local account names, fixed machine ports, and secrets.

## What this skill is for

- Start the local Node server for the dashboard
- Detect the actual available port at runtime
- Verify the health endpoint before editing or inspecting behavior
- Call the local weather and analysis endpoints
- Keep changes scoped to this repository

## OpenClaw prompt template

Use this template when asking OpenClaw to operate on the project:

```text
Use the us-weather-radar-public skill for this repository.

1. Start the local server using the repo-local launch script.
2. Detect the active port from the server output instead of assuming a fixed port.
3. Verify the health endpoint before making any changes.
4. Inspect or update only files inside this repository.
5. Prefer the local API endpoints for weather, insights, and time series checks.
6. Keep existing behavior unless the task explicitly asks for a change.
7. Report the active URL, changed files, and verification results at the end.
```

Short version:

```text
Use the us-weather-radar-public skill. Start the local server, detect the active port, verify the health endpoint, then inspect or update this repository and report the active URL plus verification results.
```

## Recommended workflow

1. Launch the server with the repo-local script in `scripts/`.
2. Read the actual port from stdout.
3. Verify the health endpoint.
4. Make the requested code or UI change.
5. Re-check the relevant endpoint or page.

## Local API examples

Use the active port reported by the server:

```bash
curl http://<host>:<active-port>/api/health
curl -I http://<host>:<active-port>/
curl http://<host>:<active-port>/api/meta
curl "http://<host>:<active-port>/api/insight?state=texas&persona=vehicle"
curl "http://<host>:<active-port>/api/timeseries?state=california"
```

## Notes for contributors

- Keep all paths relative to the repository.
- Do not hard-code personal directories, usernames, tokens, or model keys.
- Do not assume a fixed port.
- If the default port is busy, the server should fall forward to the next available port.
