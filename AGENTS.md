# Shiye AI Agent Instructions

Use these instructions when a user asks an AI coding agent to run Shiye from this repository.

## Environment and bootstrap

- Shiye runs locally on Windows and uses an installed Microsoft Edge or Google Chrome browser. The default `--browser auto` mode prefers Edge and falls back to Chrome.
- Work from the repository root.
- If `dist/src/cli.js` is missing, run `安装拾页.cmd --no-pause`. The equivalent manual commands are `npm ci` and `npm run build`.
- Never use, copy, or modify the user's everyday Edge or Chrome profile. A persistent login profile is allowed only when the user explicitly requests it, and it must use a Shiye-dedicated directory such as `data/browser-profile-edge` or `data/browser-profile-chrome`.

## Canonical capture command

```powershell
.\shiye.cmd capture <url-list.txt> --output "<output-directory>" --retry 1 --json
```

Add `--quality ultra` for 2x output and `--filename sequence` for `0001.png`, `0002.png`, and so on. Prefer headless mode. Use `--visible` only when the user needs to handle a login or CAPTCHA.

## Machine-readable contract

- Always pass `--json` for agent-driven work.
- Treat stdout as one final JSON object. Progress text is written to stderr.
- Exit code `0` means all items completed, `2` means the job completed with failed items, and `1` means invalid input or a command/configuration error.
- Read `ok`, `status`, `total`, `completed`, `failed`, `browser`, `outputDirectory`, `manifestPath`, and `items` from the JSON response.
- `results.json` at `manifestPath` is the durable source of truth. Use `shiye status <results.json> --json` to inspect it and `shiye retry <results.json> --json` to retry failed items.

## Reporting to the user

Report the completed and failed counts, the browser used, the image output directory, the `results.json` path, and any item warnings or errors. Do not print cookies, browser-profile contents, or other credentials.

## Safety boundaries

- Do not upload or publish URLs, screenshots, `results.json`, diagnostics, cookies, or browser profiles unless the user explicitly names the destination and authorizes the upload.
- Do not bypass CAPTCHAs, paywalls, authentication, or access controls.
- Stop and ask the user to take over when a page requires login, CAPTCHA, payment, or other sensitive interaction.
- Do not expose the local web console through a public or LAN-facing proxy.
