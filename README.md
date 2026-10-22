<p align="center">
  <img src="apps/desktop/assets/interceptor-icon.png" width="80" height="80" alt="Interceptor logo">
</p>

# Interceptor

[English](README.md) | [简体中文](README.zh-CN.md)

**See what your app sends. Change what it receives. Reproduce the problem.**

Interceptor is a desktop HTTP(S) debugging proxy for web/API developers and QA engineers on **Windows and macOS**. Inspect HTTP/1.1, HTTP/2, WebSocket and gRPC traffic, test a different response without changing the server, and replay requests from one workspace. Agent and MCP add optional AI assistance; ordinary debugging needs no model account.

[Download](#download) | [Quick Start](#quick-start) | [Features](#features) | [Illustrated Guide](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/README.en.md) | [Feedback](https://github.com/zhxmt-xm/Interceptor/issues)

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="architecture/assets/readme-capture-dark.png">
  <img src="architecture/assets/readme-capture-light.png" alt="Capture showing six local HTTP requests and the selected order response as formatted JSON" width="1600">
</picture>

*Real App screenshots from the macOS release, with a Chinese interface and controlled local traffic, not design mockups. Light and dark images use the App's themes. [Screenshot sources and demonstration limits](architecture/assets/readme-media.json).*

## Download

Available pre-release: [v0.1.1-alpha.1](https://github.com/zhxmt-xm/Interceptor/releases/tag/v0.1.1-alpha.1). Choose your OS and CPU below, or see [all releases and compatibility notes](https://github.com/zhxmt-xm/Interceptor/releases).

| Platform | Downloads | Installation |
| --- | --- | --- |
| macOS · Apple Silicon (arm64) | [DMG](https://github.com/zhxmt-xm/Interceptor/releases/download/v0.1.1-alpha.1/Interceptor-0.1.1-alpha.1-darwin-arm64.dmg) · [ZIP](https://github.com/zhxmt-xm/Interceptor/releases/download/v0.1.1-alpha.1/Interceptor-0.1.1-alpha.1-darwin-arm64.zip) | Copy Interceptor to Applications before opening it. |
| macOS · Intel (x64) | [DMG](https://github.com/zhxmt-xm/Interceptor/releases/download/v0.1.1-alpha.1/Interceptor-0.1.1-alpha.1-darwin-x64.dmg) · [ZIP](https://github.com/zhxmt-xm/Interceptor/releases/download/v0.1.1-alpha.1/Interceptor-0.1.1-alpha.1-darwin-x64.zip) | Copy Interceptor to Applications before opening it. |
| Windows · x64 | [EXE](https://github.com/zhxmt-xm/Interceptor/releases/download/v0.1.1-alpha.1/Interceptor-0.1.1-alpha.1-win32-x64.exe) · [MSI](https://github.com/zhxmt-xm/Interceptor/releases/download/v0.1.1-alpha.1/Interceptor-0.1.1-alpha.1-win32-x64.msi) · [ZIP](https://github.com/zhxmt-xm/Interceptor/releases/download/v0.1.1-alpha.1/Interceptor-0.1.1-alpha.1-win32-x64.zip) | Run an installer, or extract the entire ZIP before launching the App. |

**Access:** the product and Guidebook repositories are currently private. Downloads, issues and guide links require access to their respective GitHub repositories. A `404` can mean you are signed out or lack permission; it does not make a private release anonymously downloadable.

<details>
<summary>Installation permissions, signing and updates</summary>

- macOS packages use ad-hoc signing and are not notarized by Apple. After verifying the source and integrity of the download, use **System Settings → Privacy & Security → Open Anyway** if macOS offers it.
- Windows installers are unsigned. Follow the normal per-application approval process only for a download you trust. Managed devices may prohibit installation.
- Do not disable system-wide security protections. Helper installation, system proxy changes and CA trust have their own normal system authorization steps.
- Updates use GitHub Releases. Checks are anonymous; the App does not request a GitHub login or token. While the repository is private, in-app update checks cannot access its releases: use the authorized browser downloads above. Downloading and opening an installer remain explicit user actions.

</details>

Release assets are not a claim that every platform-specific workflow has been verified. Read the release's validation notes and the guide's platform prerequisites. These screenshots show macOS, not Windows or Android.

## Quick Start

1. **Launch and check readiness.** Interceptor starts a local proxy at `127.0.0.1:8888` and attempts to take over the system proxy. Complete any required system prompts, then confirm the listener is ready and Capture is recording.
2. **Route your test application.** Applications that follow the system proxy use it automatically. For other proxy-aware clients, explicitly configure `127.0.0.1:8888`.
3. **Reproduce one request.** Exercise an endpoint you are authorized to inspect. Select its row in Capture to read the request, response and timing. No AI setup is required.
4. **Enable HTTPS inspection only when needed.** Open Settings → Certificates and check the local CA. Generate or trust it only if needed, complete the OS authorization, then enable HTTPS decryption. Existing CA material does not need to be replaced.
5. **Save, then quit normally.** Export a HAR or native archive before closing: the current Capture session is temporary. Normal exit restores the system proxy settings Interceptor owns.

[Follow the illustrated first-request guide](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/getting-started.md) · [Troubleshooting and proxy recovery](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/troubleshooting.md)

Certificate pinning and separate trust stores can prevent decryption. TLS passthrough keeps a connection encrypted; it does not expose its HTTP content. Interceptor cannot capture a client that bypasses the proxy entirely. Pausing recording does not stop forwarding or disable Rules.

## Features

### Capture: find the request that explains the failure

- Filter traffic by application, host, method, status, protocol, content type and matched rule.
- Inspect headers, cookies, request/response bodies, timing and TLS details; switch between JSON trees, formatted text, raw content, images and hex.
- Read WebSocket frames and gRPC messages alongside HTTP/1.1 and HTTP/2 exchanges.

The opening screenshot shows a selected order response. More real steps: [Capture](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/capture.md) · [HTTP/2](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/capture.md#walkthrough-capture-http2) · [WebSocket](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/capture.md#walkthrough-capture-websocket-messages) · [gRPC](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/capture.md#walkthrough-capture-grpc-messages)

### Rules: test a different outcome without changing the server

- Match requests or responses and rewrite headers, query parameters, bodies or status codes.
- Mock a response, map to a local file or another server, block traffic, or add a delay.
- Organize rules in folders and inspect their hits and recorded effects.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="architecture/assets/readme-rules-dark.png">
  <img src="architecture/assets/readme-rules-light.png" alt="Rules matching a local host and path and adding an x-interceptor-demo request header, with one recorded hit" width="1600">
</picture>

[Rules walkthrough: matching, rewriting, mocking and mapping](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/rules.md)

### Breakpoints: review traffic before it continues

- Pause HTTP requests, responses or WebSocket frames that match a breakpoint rule.
- Continue unchanged, forward edited content or drop it; manage multiple paused items from the queue.
- HTTP pauses occur at the header stage, so the original body may not yet be available.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="architecture/assets/readme-breakpoints-dark.png">
  <img src="architecture/assets/readme-breakpoints-light.png" alt="A paused local order request with original JSON, an edited replacement body and continue, forward edited and drop controls" width="1600">
</picture>

[Breakpoints walkthrough: pause, edit, continue and drop](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/breakpoints.md)

### Composer: reproduce an API call on its own

- Send a captured request to Composer, or build one from scratch.
- Edit query parameters, headers, authentication and bodies; inspect the response and timing.
- Save reusable requests in collections, use request history, or probe a TLS connection.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="architecture/assets/readme-composer-dark.png">
  <img src="architecture/assets/readme-composer-light.png" alt="Composer sending a GET with a custom header and showing a 200 JSON response" width="1600">
</picture>

Composer sends directly: its requests do not enter Capture or run through Rules. [Composer and collection walkthrough](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/composer.md).

### Agent: ask for help inside the workspace

- Configure DeepSeek or an OpenAI-compatible endpoint with your own model settings and credentials when required.
- Discuss traffic and let the Agent use only the Tools you enable; review changes in `Ask` mode.
- Keep encrypted local conversation history, switch chats, stop a turn or retry.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="architecture/assets/readme-agent-dark.png">
  <img src="architecture/assets/readme-agent-light.png" alt="The built-in Agent beside Capture, displaying a response from a clearly labeled local demonstration model" width="1600">
</picture>

*This screenshot uses a deterministic, keyless local demonstration model, not a commercial model performance or compatibility test.*

[Agent setup and conversation walkthrough](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/agent.md)

### MCP: use Interceptor from a compatible AI client

- Enable the optional, loopback-only MCP server and create a separate client credential for each host.
- Copy the connection configuration to a host supporting the required Streamable HTTP protocol.
- Control MCP Tools independently of the built-in Agent; rotate or revoke client access in Settings.

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="architecture/assets/readme-mcp-dark.png">
  <img src="architecture/assets/readme-mcp-light.png" alt="Settings showing a running loopback MCP server, a local demonstration client and separate Agent and MCP Tool switches" width="1600">
</picture>

*This screenshot shows real local server/client configuration, not acceptance of a particular external host. MCP is off by default.*

[MCP setup and compatibility guide](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/mcp.md) · [Tool reference](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/tool-reference.md)

### Save, configure and troubleshoot

| Feature | Why it is useful | Illustrated steps |
| --- | --- | --- |
| Import and export | Exchange HAR files, reopen native capture archives, save individual bodies, and share Rules or Composer collections. | [Files and export privacy](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/transfer.md#walkthrough) |
| System and upstream proxy | Inspect proxy ownership and restore it; choose Direct, System, manual proxy or PAC routing. | [Proxy settings](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/settings.md#walkthrough-settings-proxy-routing) · [Upstream](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/settings.md#upstream) |
| HTTPS and TLS passthrough | Manage CA trust, enable decryption, or keep selected hosts encrypted. | [Certificates](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/settings.md#https-decryption) · [Passthrough](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/settings.md#tls-passthrough) |
| Diagnostics | Filter structured logs, inspect an operation and export redacted diagnostics for a bug report. | [Diagnostics walkthrough](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/diagnostics.md#walkthrough) |
| Workspace | Resize panels and choose from four time-of-day themes and 15 interface languages. | [Navigation and preferences](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/workspace.md) |

The [complete guide](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/README.en.md) also covers storage, updates, Windows AppContainer prerequisites and recovery. Platform-specific or external-service steps retain their stated limits; macOS screenshots do not replace those checks.

## Agent and MCP Permissions

AI is optional. Model requests may incur provider charges. Agent and MCP have **separate per-Tool switches**, and an Agent chat's execution mode does not change an MCP client's mode.

| Operation | `Ask` | `Auto` |
| --- | --- | --- |
| Enabled query Tool | Runs without per-call approval | Runs without per-call approval |
| Enabled change Tool | Requires explicit App approval | Runs without per-call approval |
| Disabled Tool | Rejected | Rejected |
| Native file dialogs and OS authorization | Still required | Still required |

`Ask` is not read-only mode: queries can expose data. To allow inspection only, disable change Tools as described in the [permissions guide](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/tool-permissions.md#read-only).

## Privacy and Safety

- **Capture storage is local.** Recordings, exported files and diagnostic logs can contain cookies, credentials and personal data. Inspect only traffic you are authorized to access.
- **Check exports before sharing.** HAR privacy options are not blanket anonymization; native archives preserve full data. Review bodies, URLs and other fields yourself.
- **AI can send data outside the App.** Agent sends conversation context and Tool results to the configured model provider. An authorized MCP client can receive data exposed by its enabled Tools. Review both permissions and the recipient's data policy.
- **CA trust outlives decryption and the App.** Turning off decryption or quitting does not uninstall the CA. Remove its trust through Settings when no longer needed; never share its private key.
- **Close normally to restore the proxy.** If another application changes the system proxy during a session, Interceptor avoids overwriting that application's settings. Use the [recovery guide](https://github.com/zhxmt-xm/Interceptor-Homepage/blob/main/guidebook/en/troubleshooting.md) if cleanup is interrupted.

## Feedback and Contributing

Report reproducible problems or suggest improvements through [GitHub Issues](https://github.com/zhxmt-xm/Interceptor/issues). Include the app version, operating system, relevant protocol and reproduction steps, without private traffic, API keys or certificate material.

Code, documentation, translations and focused bug reports are welcome. Start with the [development guide (Chinese)](architecture/development.md) for source builds, setup, debugging and validation. The [architecture index (Chinese)](architecture/README.md) describes modules and feature contracts.

After setup, run `npm start` to choose Development, Test, Build or Release. Test offers normal E2E runs or step screenshots; screenshots remain local evidence, not automatic website publications. See the [release guide (Chinese)](architecture/release-guide.md) before publishing a build.

## Acknowledgements

Interceptor builds on [Electron](https://www.electronjs.org/), [Mockttp](https://github.com/httptoolkit/mockttp), [React](https://react.dev/) and [Monaco Editor](https://microsoft.github.io/monaco-editor/), alongside the other libraries used in this repository.

## License

Interceptor's original code is licensed under [Apache-2.0](LICENSE), with attribution in [NOTICE](NOTICE). Third-party components retain their own licenses and notices; the application includes its license and dependency notices. Using the software does not require sponsorship.
