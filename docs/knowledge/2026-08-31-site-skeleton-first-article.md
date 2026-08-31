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
