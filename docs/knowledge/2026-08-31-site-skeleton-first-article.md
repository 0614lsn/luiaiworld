# 完成个人站骨架与首篇 Codex 架构文章

- **做了什么**：在既有 `luiaiworld` 仓库中建立 Astro 7 纯静态个人站，完成首页、文章列表、动态文章详情、关于页、404、响应式视觉、SEO、内容 schema、自动测试与本地开发文档；把 `codex_arch` 的三张架构图和固定源码快照改写为首篇长文；创建并同步公开 GitHub 仓库。
- **结果 / 结论**：Final Code Head 为 `0964a0f9da8c3b17e79eab6a41491c19da7dddf6`，最终 whole-branch review 为 0 Critical / 0 Important；`npm ci`、Astro check、5 路由静态构建和 11 项 Node 测试通过。文章为 4857 个中文字符、0 Markdown 小标题、L1 零命中，三张源 PNG 构建为 WebP。移动图支持触摸横滑，以及无客户端 JS 的左／中／右 Tab+Enter 定位；外部 Edge 的九组键盘证据均满足 `0 < 198.6667 < 666`。
- **产出位置**：公开仓库 `https://github.com/0614lsn/luiaiworld`；主线 merge commit `079ae17eb22cc8188925276197eafff8e355c2dd`；Final Code Head `0964a0f9da8c3b17e79eab6a41491c19da7dddf6`；report commit `cb4fec03cd07d35af144a53339049bbd168b6376`；实施证据见 `docs/development/2026-08-31-site-skeleton-first-article-plan.md` 与对应 report；文章位于 `src/content/articles/codex-harness-beyond-model.md`。
- **踩过的坑（以后注意）**：
  - Windows 上中断首次 npm 安装会留下缺版本字段的畸形 lock 与受污染 native binding；先核对现场，再从原 `package.json` 重建 lock 并用干净 `npm ci` 验证，不能用重复安装掩盖。
  - Astro 7 默认 Markdown 引擎为 Sätteri；直接加入 remark plugin 会要求额外依赖。简单 inline HTML + Markdown image 可保留 Astro 图片优化，但必须回读真实 build HTML。
  - 超宽架构图缩到移动容器会让标签不可读；局部 64rem viewport 解决可读性，原生 fragment 导航补键盘访问。仅有 `tabindex` 不会自动提供 ArrowRight 行为。
  - 浏览器控制通道也要做对照实验。IAB 连普通链接都无法 Enter 激活时只能记通道不确定；换到有效 Edge 通道，并等待平滑滚动稳定后再读终态。
  - 官方顶层开源清单与固定仓库里的源码事实必须分层陈述；固定 commit 的深链仍要单独核对行锚。
- **当前收尾状态**：`main` 已合并并同步 GitHub；本地 feature 分支仍保留待 5c 按 plan 清场。首次 npm 故障产生的两份可恢复隔离物位于系统 Temp，精确路径删除不在 plan 授权内，当前未删除且不影响仓库。

## 5c 收尾审计（清场前，2026-09-01）

| 事实面 | 状态 | 证据与动作 / 未闭合原因 |
| --- | --- | --- |
| 代码 | `changed-and-verified` | Final `0964a0f9...`、report `cb4fec0...`、merge `079ae17...`；当前 `main=origin/main=4ada704...`，Final 后产品 diff 为零；本地 feature 已 merge，待按清单删除 |
| 运行态 | `verified-current` | 4321 无 listener；无相关 Node/Astro 进程；GitHub Pages、deployment、workflow、release 均未创建；Final 主线执行 `npm run dev -- --host 127.0.0.1 --port 4321` 后首页与文章路由均为 200，PID 已停止 |
| 文档 | `pending` | `docs/development/` 只有 plan/report；connector active；README、knowledge/INDEX、evolution 权威关系一致；本节已落盘清场前事实，仍待清场后补报 |
| 规则 | `verified-current` | 本需求未修改 SKILL、AGENTS 或 rule；P1 提案保持 `status: 待审`，未当作采纳；README 的 `npm ci`、dev、check、build、preview 均有实际运行证据 |
| 记忆 | `changed-and-verified` | Final、合并、两个 Minor、P1 待审提案和下述外部 Temp 精确事实均已进入仓库工件，不依赖 transcript 作为唯一事实 |
| 工作区 | `pending` | 仅一个 worktree，当前 main 干净；本地 feature、`dist/`、`.astro/` 待清理；`node_modules/` 按 plan 保留 |

### 外部遗留（已登记，不在删除授权内）

- `%LOCALAPPDATA%\Temp\luiaiworld-node-modules-incomplete-f720c26447eb437ebdf45618ef15a122`：中断 npm 安装的可恢复现场，12,448 个文件、1,312 个目录、150,801,213 bytes；位于仓库 / workspace 外，保留。
- `%LOCALAPPDATA%\Temp\luiaiworld-package-lock-invalid-d7afda9b9c4b43468acc47de5d786770.json`：畸形 lock 取证副本，119,088 bytes，SHA-256 `5FC9E41457C28B3B04BF46C5BB8EFEE23ABD3863D0A112C0DBD68C017F846421`；318 个 package 条目中 11 个缺 `version`，当前正式 lock 为 363 条且零缺失；保留。
- `%USERPROFILE%\.codex\visualizations\2026\08\31\01a05771-b21f-7092-b808-377ce9033349\c3-keyboard`：11 张 C3 键盘测试截图、479,131 bytes；测试证据且无删除授权，保留。

### 已落盘拟删清单

1. 本地 `feature/site-skeleton-first-article`：已 merge，远端 feature `cb4fec0...` 保留；仅使用非强制 `git branch -d`。
2. `D:\MyProject\luiaiworld\dist`：10 个文件、1,862,336 bytes；ignored 构建 / 测试产物，可由 `npm run build` 重建。
3. `D:\MyProject\luiaiworld\.astro`：9 个文件、55,123 bytes；ignored Astro 缓存，可重建。
4. preview 日志：未发现目标，不执行虚构删除。

### 明确不删

- `D:\MyProject\luiaiworld\node_modules`：按 plan 保留。
- 远端 `origin/feature/site-skeleton-first-article`：按 plan 保留。
- 两份系统 Temp 隔离物、C3 visualization 截图、tracked 架构图、服务器加固脚本和任何远端资源。
- 禁止 `git clean -fdX`、`git branch -D` 或其它 force / 宽泛清理。
