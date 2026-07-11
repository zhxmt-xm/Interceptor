# Interceptor

Cross-platform desktop HTTP debugging proxy, designed as an alternative to Charles and Fiddler.

## Status

M0 (project scaffold and toolchain) is complete. The application currently provides the secure Electron shell and managed Proxy Core lifecycle; traffic capture starts in later milestones.

See [PROGRESS.md](PROGRESS.md) for implementation details, validation history, known risks, and the next task.

## Prerequisites

- Node.js 24.18.0 LTS
- npm 11.16.0
- Windows or macOS

The required versions are also pinned in `.nvmrc`, `.npmrc`, and `package.json`.

## Commands

```powershell
npm install
npm run dev
npm run typecheck
npm run test:unit
npm run package
npm run test:smoke --workspace @interceptor/desktop
```

`npm run package` builds Proxy Core first, then creates the Electron artifact. On Windows the output is `apps/desktop/out/Interceptor-win32-x64`.

If GitHub release downloads are unreliable during install, development startup, or packaging, a temporary Electron mirror can be supplied without changing project files:

```powershell
$env:ELECTRON_MIRROR = 'https://npmmirror.com/mirrors/electron/'
npm run package
```

Packager validates the downloaded artifact against the official SHA-256 checksums bundled with the locked `electron` npm package. The mirror is not hard-coded into the repository.

## Structure

```text
apps/desktop/          Electron main, preload, React renderer, tests
apps/proxy-core-node/  Independent Node.js Proxy Core process
```

Future shared protocol, domain, rules, storage, and inspector packages will be added under `packages/` as their milestones begin.

## Security Baseline

- Renderer sandbox and context isolation enabled
- Node integration disabled
- Narrow, typed Preload API
- Environment-specific CSP with no production network access
- Permissions, navigation, popups, downloads, and webviews denied by default
- ASAR integrity and restrictive Electron Fuses enabled
- Proxy Core shipped as a separate UtilityProcess resource
