---
name: pr-rebase-submit
description: 用户授权提交 Interceptor 代码或文档时，在当前 checkout 完成 feature branch、push、PR、rebase merge、分支清理及 main 同步。
---

# PR 提交与合并

授权提交后完成整个流程，不停在创建 PR；用户要求暂缓的步骤除外。

1. 确认提交范围、所需验收结果和 `git status`，保留其他未提交修改。在 commit 前同步文档并删除已完成的 Handover item；提交后不再为 hash、PR 状态或完成总结写回 Handover。
2. `git fetch origin --prune`，在当前 checkout 创建 feature branch。已有该任务的本地 commit 时直接复用，不为走 PR 重做 commit；不创建 worktree。直连失败时按“网络失败处理”重试后再判断是否阻塞。
3. 确认分支相对 `origin/main` 只包含本任务的 commit。只 stage 本任务的文件或 hunk，逐文件审阅 staged diff，一个已授权 item 一个 commit，不混入其他修改。
4. `git push -u origin <branch>`。将 PR 正文写入 UTF-8 临时文件，执行 `gh pr create --base main --head <branch> --title '<title>' --body-file <file>`，写清最终行为、验证结果和未验证范围；`gh` 缺失时按“无 gh 时的 REST 兜底”完成同等操作。
5. 用 `gh pr view <pr> --json state,headRefOid,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup` 检查合并条件。取得 checks 的最终结果；没有 checks 时如实说明，不记作 CI Green。REST 兜底读取同一 PR 的 `mergeable`/`mergeable_state` 与 check-runs。
6. 条件满足后执行 `gh pr merge <pr> --rebase --match-head-commit <head-sha>`，确认 PR 为 `MERGED`。不用 squash、merge commit 或 `--admin` 绕过规则。阻塞时报告原因和恢复命令，不把等待当作完成。REST 兜底必须带 `sha=<head-sha>`。
7. 删除远端分支：`git push origin --delete <branch>`，执行 `git fetch origin --prune`，切回 `main` 并用 `git merge --ff-only origin/main` 同步，再用 `git branch -d <branch>` 删除已合并的本地分支。GitHub rebase 改变 SHA 时，只有确认 PR 已合并且该分支与合并结果的 tree 相同，才用 `git branch -D <branch>`。
8. 确认本地 `main`、`origin/main` 和 Git Graph 同在一条线上，分支已清理、原有未提交修改完整保留。最终回复 PR 链接及合并 commit，不再修改 Handover。

本地 `main` 已含原 commit、GitHub rebase merge 改变 SHA 时：

- 在 feature branch 上比较本地 `main` 与 `origin/main` 的 tree；完全相同才执行 `git update-ref -m 'Align main with PR rebase merge' refs/heads/main <origin-main-sha> <old-main-sha>`，再切回 `main`。
- tree 不同则检查具体差异，不强制移动 `main`，不使用 `reset --hard`、清理工作区或覆盖其他修改。

## 网络失败处理

- `git fetch`/`git push` 默认直连，至少连续重试 3 次并留出间隔；单次 reset、timeout 或偶发 `expected flush after ref listing` 不直接判定阻塞。
- 直连均失败时检查本机代理是否可用（例如 `127.0.0.1:7890`）；只在本次命令用 `-c http.proxy=<proxy> -c https.proxy=<proxy>` 重试，不把代理写回仓库配置。
- 直连和代理都失败才报告错误：写清尝试次数、具体错误和恢复命令；不把“正在等待”当作完成，不无限重试。

## 无 gh 时的 REST 兜底

- 优先 `gh`；缺失或未登录时用 GitHub REST API 做等价操作。
- 凭据只从现有 git credential 读入环境变量：`printf 'protocol=https\nhost=github.com\n\n' | git credential fill`；只在 `api.github.com` 请求中使用，不打印、不写入文件或仓库，结束不保留。
- 等价步骤：
  - 创建 PR：`POST /repos/<owner>/<repo>/pulls`，`head` 为 feature branch、`base` 为 `main`；正文放 UTF-8 临时文件（建议 `.git/` 下），结束后删除。
  - 合并前检查：`GET /repos/<owner>/<repo>/pulls/<n>` 读取 `state/head.sha/mergeable/mergeable_state`；`GET /repos/<owner>/<repo>/commits/<head-sha>/check-runs` 与 `/status` 读取 checks，`check_runs=0` 时说明没有 CI，不记作 Green。
  - rebase merge：`PUT /repos/<owner>/<repo>/pulls/<n>/merge`，body `{ "merge_method": "rebase", "sha": "<head-sha>" }`，确认返回 `merged=true`；返回的 `sha` 是新的 main commit。
  - 删除远端分支：`DELETE /repos/<owner>/<repo>/git/refs/heads/<branch>`。
- REST 完成后仍执行第 7-8 步；本地分支用 tree 比较确认后再 `-D`。
