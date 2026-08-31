# 外部资源连接器

> 状态：active（2026-08-31；Contract change 已批准；公开仓库、`origin`、默认分支与初始 refs 已回读验证）

## 作用域（硬限制）

- 唯一允许创建和写入的外部资源：GitHub 账号 `0614lsn` 下的仓库 `luiaiworld`。
- 预期 URL：`https://github.com/0614lsn/luiaiworld`。
- 可见性：公开。
- 不操作该账号的其他仓库、组织、gist、issue、PR、Actions、release、secret 或账户设置。

## 代码版本 — Git

- 本地仓库：`D:\MyProject\luiaiworld`。
- 主线：`main`。
- 集成分支：`feature/site-skeleton-first-article`。
- 活动远端：`origin=https://github.com/0614lsn/luiaiworld.git`。
- push 纪律：只允许 fast-forward push；禁止 force push、history rewrite、未知远端合并和远端删除。
- 阶段 2/3：原子 commit 收口后串行同步 feature，Candidate 冻结前核对本地/远端 SHA。
- 阶段 4：自动终审四条件满足后，本地 `--no-ff` 合并并 push `main`。
- 阶段 5：收尾 commit 继续 fast-forward push `main`；本需求不删除远端 feature。
- 大文件策略：本轮只有三张约 1.2–1.5 MB 的源码架构 PNG，可进入 Git；私钥、token、`.pem`、`.env`、构建目录和依赖目录不得进入 Git。
- 许可证：公开可读不等于开源授权；用户未裁决许可证，本需求不添加 LICENSE。

## 协作层 — GitHub

- 单一通道：GitHub CLI `gh`，Git 操作使用 HTTPS `origin`。
- 认证来源：系统 keyring 中的既有 `gh` 登录态；不读取、不打印、不复制 token，不把凭证放进命令、日志或仓库。
- 2026-08-31 创建前 sanity：`gh 2.98.0`；active account `0614lsn`；目标仓库 `NOT_FOUND`。
- 2026-08-31 创建后核验：仓库 `0614lsn/luiaiworld` 为 `PUBLIC`，description/homepage 符合 plan，默认分支 `main`；本地 `main` 与 feature 初始 refs 已 fast-forward push 并回读一致。
- 外部写操作只按已重新批准的 LDP plan 预授权清单执行；同名仓库竞态、账号变化、非 fast-forward 或敏感扫描命中时立即停止。

## 文档

- 本地 Git 仓库中的 plan、report、knowledge 与本连接器注册表是流程事实源。
- GitHub 只镜像已提交历史，不以网页临时状态替代本地权威工件。

## 人工通道

- plan 闸门、Contract change 重审与终审异常升级均使用当前 Codex 会话。
- 消息展示或 CLI 登录成功不代表批准，必须以用户明确裁决原文为准。

## 运行环境

- GitHub CLI：`gh 2.98.0`。
- Git 认证：HTTPS，经 `gh`/系统 keyring 提供；凭证不进入项目文件。
- Node.js/npm 与站点依赖约定见实施 plan 和 `package-lock.json`。
