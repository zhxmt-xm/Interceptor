# Interceptor

Cross-platform desktop HTTP debugging proxy, designed as an alternative to Charles and Fiddler.

## Status

M0 (project scaffold and toolchain) and M1 (IPC communication foundation) are complete. The application provides the secure Electron shell, modular Ant Design traffic workspace, managed Proxy Core lifecycle, typed Main/Core MessagePort RPC, and structured in-memory Core diagnostics. Traffic capture and its event backpressure start in later milestones.

The next implementation task is M2/T2.1: define the Capture SQLite schema, forward-only migrations, and fixture database tests. UtilityProcess `parentPort` remains lifecycle-only apart from transferring the dedicated business MessagePort.

Documentation is split to keep routine context small:

- [stages/PROGRESS.md](stages/PROGRESS.md) is the required first read, concise Stage index, and current snapshot.
- [stages/HANDOVER.md](stages/HANDOVER.md) contains the detailed current continuation state, code locations, remaining work, and next action.
- [stages/ARCHITECTURE.md](stages/ARCHITECTURE.md) describes only the architecture already implemented in code.
- [stages/](stages/) contains one implementation and validation record per Stage.
- [stages/桌面网络调试代理完整方案.md](stages/桌面网络调试代理完整方案.md) is the authoritative product design for every Stage.

## Prerequisites

- Node.js 24.18.0 LTS
- npm 11.16.0
- Windows or macOS

The required versions are also pinned in `.nvmrc`, `.npmrc`, and `package.json`.

## Local Commands

All examples below use Windows PowerShell from the repository root.

### Verify Toolchain

```powershell
node --version
npm --version
npx --version
```

Expected project baseline: Node.js `24.18.0`, npm/npx `11.16.0`.

### Install Dependencies

```powershell
npm install
```

If GitHub release downloads are unreliable during install, development startup, or packaging, set a temporary Electron mirror in the current PowerShell session:

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm install
```

Remove the temporary override when it is no longer needed:

```powershell
Remove-Item Env:ELECTRON_MIRROR -ErrorAction SilentlyContinue
```

Packager validates Electron artifacts against the official SHA-256 checksums bundled with the locked `electron` npm package. The mirror is not hard-coded into the repository.

### Start Development Mode

```powershell
npm run dev
```

This builds Proxy Core, starts the Vite renderer server, launches Electron, and enables Renderer HMR. In the running Forge terminal, type `rs` and press Enter to restart Electron Main and Proxy Core.

The Main process allows same-application Renderer reloads while rejecting external navigation, so a cold `npm run dev` launch can complete Vite's dependency update without a manual reload.

To start only the Desktop workspace after Core has already been built:

```powershell
npm run build:core
npm run start --workspace @interceptor/desktop
```

When the Electron binary has not been downloaded yet:

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run dev
```

If a development window remains blank after dependency or Vite configuration changes, stop the current Forge process, clear only the generated Vite optimizer cache, and restart:

```powershell
Remove-Item -Recurse -Force .\apps\desktop\node_modules\.vite -ErrorAction SilentlyContinue
npm run dev
```

Do not delete `node_modules` for this check; `.vite` is generated cache and is already ignored by Git.

The Main process must allow reloads within the exact Vite origin while denying all external navigation. If the page only appears after pressing reload, verify the trusted Renderer URL policy before changing Vite dependency settings:

```powershell
npm run test --workspace @interceptor/desktop -- --run src/main/security/tests/trusted-renderer-url.test.ts
```

### Debug Renderer

Start development mode, then press `Ctrl+Shift+I` in the Electron window to open Chromium DevTools:

```powershell
npm run dev
```

Changes to these files should update through Vite HMR without restarting Electron:

```text
apps/desktop/src/renderer/app/App.tsx
apps/desktop/src/renderer/app/App.module.css
apps/desktop/src/renderer/features/traffic/TrafficWorkspace.tsx
apps/desktop/src/renderer/features/traffic/TrafficWorkspace.module.css
apps/desktop/src/renderer/theme/theme.ts
apps/desktop/src/renderer/styles/global.css
```

For a test-only Chrome DevTools Protocol endpoint:

```powershell
npm run build:core
Push-Location apps/desktop
& '..\..\node_modules\.bin\electron-forge.cmd' start -- --remote-debugging-port=9333
Pop-Location
```

Inspect available targets at `http://127.0.0.1:9333/json` or through `chrome://inspect`.

### Debug Electron Main

```powershell
npm run build:core
npm run start --workspace @interceptor/desktop -- --inspect-electron
```

For a breakpoint before Main executes application code:

```powershell
npm run build:core
npm run start --workspace @interceptor/desktop -- --inspect-brk-electron
```

Attach with VS Code's **Debug: Attach to Node Process** command or connect to the inspector endpoint printed in the terminal.

### Debug Proxy Core

Build Core independently:

```powershell
npm run build:core
```

Then run the managed Desktop process:

```powershell
npm run dev
```

Proxy Core stdout/stderr, including structured M1 diagnostics, is forwarded to the Forge terminal with a `[proxy-core]` prefix. Core requires Electron `UtilityProcess.parentPort`, so running `core-entry.cjs` directly with Node is intentionally unsupported. A dedicated Core inspector launch path has not been added yet.

Run the lifecycle supervisor tests while editing Core process management:

```powershell
npm run test:watch --workspace @interceptor/desktop -- src/main/core/tests/core-supervisor.test.ts
```

Run that test once:

```powershell
npm run test --workspace @interceptor/desktop -- --run src/main/core/tests/core-supervisor.test.ts
```

### Type Checking

```powershell
npm run typecheck
```

Check one workspace:

```powershell
npm run typecheck --workspace @interceptor/desktop
npm run typecheck --workspace @interceptor/proxy-core
npm run typecheck --workspace @interceptor/core-protocol
```

### Unit Tests

```powershell
npm run test:unit
```

The root command runs Desktop, Proxy Core, and Protocol tests.

Watch unit tests:

```powershell
npm run test:watch --workspace @interceptor/desktop
```

### Package Application

```powershell
npm run package
```

`npm run package` validates/builds the Protocol package, bundles Proxy Core and its protocol runtime into one CommonJS file with esbuild, then creates the Electron artifact. On Windows the output is `apps/desktop/out/Interceptor-win32-x64`.

If the Electron release download is unreliable:

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
```

Run the packaged application:

```powershell
& .\apps\desktop\out\Interceptor-win32-x64\Interceptor.exe
```

Run the packaged application with a test-only Renderer CDP endpoint:

```powershell
& .\apps\desktop\out\Interceptor-win32-x64\Interceptor.exe --remote-debugging-port=9333
```

### Regenerate Application Icons

The editable identity source is `apps/desktop/assets/interceptor-icon.svg`. Regenerate the packaged PNG, ICO, and ICNS assets from the repository root with:

```powershell
.\scripts\generate-icon.ps1
```

Forge selects ICO on Windows and ICNS on macOS, and ships the PNG for the BrowserWindow and Renderer brand mark. Review all generated formats before committing an icon change.

### Packaged Smoke Test

Run against an existing package:

```powershell
npm run test:smoke --workspace @interceptor/desktop
```

Build a fresh package and then run smoke:

```powershell
npm run test:smoke
```

The smoke test validates the hardened final executable, Renderer isolation, narrow Preload API, production CSP, heartbeat-driven Core process status, MessagePort echo and Trace, forced Core crash/restart with a new RPC port, theme layouts, and process cleanup.

### Inspect Packaged Security

Read Electron Fuses from the final executable:

```powershell
& .\node_modules\.bin\electron-fuses.cmd read --app .\apps\desktop\out\Interceptor-win32-x64\Interceptor.exe
```

List ASAR contents:

```powershell
& .\node_modules\.bin\asar.cmd list .\apps\desktop\out\Interceptor-win32-x64\resources\app.asar
```

Audit production dependencies:

```powershell
npm audit --omit=dev
```

Inspect the complete development dependency audit separately:

```powershell
npm audit
```

### Diagnose Forge Packaging

Enable detailed Forge, Packager, and Electron download logs for one PowerShell session:

```powershell
$env:DEBUG = 'electron-forge:*,electron-packager,@electron/get*'
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
```

Clear diagnostic environment variables afterward:

```powershell
Remove-Item Env:DEBUG -ErrorAction SilentlyContinue
Remove-Item Env:ELECTRON_MIRROR -ErrorAction SilentlyContinue
```

### Chromium Winsock 10108 Startup Log

On some Windows systems, Electron may print this message once for Main, Network Service, and Proxy Core UtilityProcess:

```text
ERROR:net\base\network_change_notifier_win.cc:213
WSALookupServiceBegin failed with: 10108
```

Windows defines `10108` as `WSASERVICE_NOT_FOUND`. Chromium attempted to query the legacy Network Location Awareness (`NS_NLA`) Winsock namespace, then falls back to an unknown connection type and continues startup. It is not a Proxy Core JavaScript exception.

No action is required when:

- the Electron window opens;
- the status bar shows `Core Running`;
- the Vite page is reachable in development mode; and
- normal DNS/network access works.

Check the active processes and development page:

```powershell
Get-Process -Name electron,Interceptor -ErrorAction SilentlyContinue |
	Select-Object Id, ProcessName, StartTime, Path

Invoke-WebRequest 'http://localhost:5173/' -UseBasicParsing -TimeoutSec 5 |
	Select-Object StatusCode
```

Vite may listen only on IPv6 localhost. Check the actual listener before treating an IPv4 test as a failure:

```powershell
Get-NetTCPConnection -State Listen -LocalPort 5173 -ErrorAction SilentlyContinue |
	Select-Object LocalAddress, LocalPort, OwningProcess

Test-NetConnection ::1 -Port 5173
```

Check Windows network services and DNS only if the UI or real network requests also fail:

```powershell
Get-Service NlaSvc,nsi,Dnscache -ErrorAction SilentlyContinue |
	Select-Object Name, Status, StartType

Resolve-DnsName nodejs.org
netsh winsock show catalog
```

Do not run `netsh winsock reset` for this startup log alone. It changes the machine-wide network stack and is only appropriate when Windows networking is genuinely broken outside Interceptor as well.

### Full Stage Regression Sequence

```powershell
npm run typecheck
npm run test:unit
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
npm run test:smoke --workspace @interceptor/desktop
npm audit --omit=dev
git diff --check
```

## Structure

```text
apps/desktop/                         Electron main, preload, Renderer, assets, tests
apps/desktop/src/renderer/app/        Application shell and navigation
apps/desktop/src/renderer/features/   Product workspaces such as Traffic
apps/desktop/src/renderer/components/ Shared Renderer controls
apps/desktop/src/renderer/theme/      Ant Design theme configuration
apps/desktop/src/renderer/styles/     Minimal global reset and design variables
apps/proxy-core/                      Independent Node.js Proxy Core process
packages/core-protocol/               Typed Main/Core messages and runtime validation
scripts/                              Repeatable repository asset tooling
```

Future shared domain, rules, storage, and inspector packages will be added under `packages/` as their milestones begin.

## Security Baseline

- Renderer sandbox and context isolation enabled
- Node integration disabled
- Narrow, typed Preload API
- Environment-specific CSP with no production network access
- Permissions, navigation, popups, downloads, and webviews denied by default
- Same-application Renderer reloads allowed only for the exact development origin or packaged HTML path
- ASAR integrity and restrictive Electron Fuses enabled
- Proxy Core shipped as a separate UtilityProcess resource
- Main transfers a private business MessagePort to Core; Renderer never receives it
