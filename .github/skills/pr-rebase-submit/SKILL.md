---
name: pr-rebase-submit
description: 用户授权提交 Interceptor 代码或文档时，在当前 checkout 完成 feature branch、push、PR、rebase merge、分支清理及 main 同步。
---

# PR 提交与合并

授权提交后完成整个流程，不停在创建 PR；用户要求暂缓的步骤除外。

1. 确认提交范围、所需验收结果和 `git status`，保留其他未提交修改。在 commit 前同步文档并删除已完成的 Handover item；提交后不再为 hash、PR 状态或完成总结写回 Handover。
2. `git fetch origin --prune`，在当前 checkout 创建 feature branch。已有该任务的本地 commit 时直接复用，不为走 PR 重做 commit；不创建 worktree。
3. 确认分支相对 `origin/main` 只包含本任务的 commit。只 stage 本任务的文件或 hunk，逐文件审阅 staged diff，一个已授权 item 一个 commit，不混入其他修改。
4. `git push -u origin <branch>`。将 PR 正文写入 UTF-8 临时文件，执行 `gh pr create --base main --head <branch> --title '<title>' --body-file <file>`，写清最终行为、验证结果和未验证范围。
5. 用 `gh pr view <pr> --json state,headRefOid,mergeable,mergeStateStatus,reviewDecision,statusCheckRollup` 检查合并条件。取得 checks 的最终结果；没有 checks 时如实说明，不记作 CI Green。
6. 条件满足后执行 `gh pr merge <pr> --rebase --match-head-commit <head-sha>`，确认 PR 为 `MERGED`。不用 squash、merge commit 或 `--admin` 绕过规则。阻塞时报告原因和恢复命令，不把等待当作完成。
7. 删除远端分支：`git push origin --delete <branch>`，执行 `git fetch origin --prune`，切回 `main` 并用 `git merge --ff-only origin/main` 同步，再用 `git branch -d <branch>` 删除已合并的本地分支。GitHub rebase 改变 SHA 时，只有确认 PR 已合并且该分支与合并结果的 tree 相同，才用 `git branch -D <branch>`。
8. 确认本地 `main`、`origin/main` 和 Git Graph 同在一条线上，分支已清理、原有未提交修改完整保留。最终回复 PR 链接及合并 commit，不再修改 Handover。

本地 `main` 已含原 commit、GitHub rebase merge 改变 SHA 时：

- 在 feature branch 上比较本地 `main` 与 `origin/main` 的 tree；完全相同才执行 `git update-ref -m 'Align main with PR rebase merge' refs/heads/main <origin-main-sha> <old-main-sha>`，再切回 `main`。
- tree 不同则检查具体差异，不强制移动 `main`，不使用 `reset --hard`、清理工作区或覆盖其他修改。
