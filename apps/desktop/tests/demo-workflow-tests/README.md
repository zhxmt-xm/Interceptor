# Demo workflow tests

按 feature 录制真实 App 演示视频，生成中英双语字幕。和 `e2e-workflow-tests` 平级，但不属于 E2E 日常套件。

## 入口

```powershell
npm start
# Test → Demo 视频（单 feature，中英字幕）
```

或直接运行：

```powershell
npm run test:demo:workflow --workspace @interceptor/desktop -- --feature breakpoints
```

默认使用 `apps/desktop/out/Interceptor-<platform>-<arch>` 的 packaged App；也可用 `--app` 或 `INTERCEPTOR_E2E_APP_PATH` 指定。

当前 feature：`capture`、`breakpoints`。新增 feature 时在 `workflows/` 放入同名 `*.workflow.ts`，`npm start` 会自动列出。

## 输出

`apps/desktop/test-results/demo-videos/<timestamp>-<feature>/`

- `video.mp4`：H.264，中英字幕已烧录
- `readme.png`：1200 宽的 APNG，给 README 内联使用
- `captions.ass`、`captions-en.srt`、`captions-zh.srt`
- `capture/frames.json`、`capture/captions.json`
- `manifest.json`

`features.json` 登记的 `readmeAsset` 会在生成后自动覆盖 `architecture/assets` 下的同名 APNG；提交前先看一帧确认字幕和 UI。视频不进入仓库；官网或视频平台托管，README 只放 APNG 或可播放页面链接。

## 约束

- 只操作真实 App，不用合成 UI。
- 录制会临时接管系统代理；测试结束后 driver 负责恢复。
- 同一时间只跑一个 feature；不并入 E2E 全量套件。
- `@ffmpeg-installer/ffmpeg` 提供默认编码器；可用 `FFMPEG_PATH` 指向系统 ffmpeg，缺字体时字幕可能回退，先在目标平台看一帧再发布。
