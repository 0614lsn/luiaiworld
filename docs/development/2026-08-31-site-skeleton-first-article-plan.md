# 站点骨架与首篇 Codex 架构文章 — 实施 plan

> 状态：Contract change 已获批准（2026-08-31，Codex 当前会话；批准原文：`批准修订 plan，创建公开仓库并进入阶段 2`；原 plan 批准记录保留于下文预裁决记录）
> 仓库：`D:\MyProject\luiaiworld`；分支 `feature/site-skeleton-first-article`；计划远端 `origin=https://github.com/0614lsn/luiaiworld.git`（公开）；feature 原子 commit 串行 push，终审通过后合并并 push `main`，禁止 force push
> Base：`4b28bcd2ffebd0cc7015ca33c6bb3132defd8b45`

## 1. 背景与目标

`D:\MyProject\luiaiworld` 已被用户指定为个人网站唯一项目目录，当前只有一份已验证的
服务器加固脚本，尚无站点代码。前序会话已经裁定可以在 ICP 备案前完成本地开发、构建和
预览，本需求不触碰公网部署。

本需求完成后：

1. 仓库具有一个基于 Astro 7 的纯静态个人站骨架，可在 Windows 本地安装、开发、构建和预览。
2. 站点以「LUI AI WORLD / 路易的 AI 新世界」为标题，提供首页、文章列表、文章详情、关于页和 404 页。
3. 首篇文章以 `D:\MyProject\codex_arch` 的固定源码导读为主要素材，解释 Codex harness 为什么不只是一次模型调用。
4. 文章遵循 `khazix-writer` 的节奏、口语与四层质检，但不冒充卡兹克、不使用其署名或联系方式。
5. 本地构建产物为静态 HTML/CSS/优化图片，不引入前端 UI 框架和客户端 hydration。
6. 在 GitHub 账号 `0614lsn` 下创建公开仓库 `luiaiworld`，把 feature 开发过程与最终 `main` 结果按本 plan 的 push 纪律同步上去。

## 2. 验收标准

### AC1 — 可重复安装与构建

- `package.json` 精确使用 `astro@7.2.9`，开发依赖使用 `@astrojs/check@0.9.10`、`typescript@6.0.3`，并提交 `package-lock.json`。
- 在仓库根执行 `npm ci`、`npm run check`、`npm run build`、`npm test` 均以退出码 0 结束。
- `git status --short` 在验证命令后不出现被测试过程修改的 tracked 文件。

### AC2 — 路由与内容模型

- 构建产物存在 `/`、`/articles/`、`/articles/codex-harness-beyond-model/`、`/about/` 与 `/404.html`。
- `src/content.config.ts` 使用 Astro Content Layer 的 `glob()` loader 与 schema 校验文章标题、描述、发布日期、标签、精选状态和源码基线。
- 首页精选卡片与文章列表都从 content collection 读取同一篇文章，不复制文章元数据。

### AC3 — 视觉、响应式与可访问性

- 视觉采用「电子杂志 × 工程蓝图」：暖纸底、墨色正文、钴蓝与朱红点色、明确网格和细线，不使用渐变、外部字体、堆叠圆角卡片或装饰性大胶囊。
- 桌面宽度 1440×900 与移动宽度 390×844 下，首页、文章列表和文章详情无横向滚动，导航、正文和三张架构图均可读。
- 页面包含 `lang="zh-CN"`、skip link、语义化 landmarks、可见键盘焦点、图片替代文本和 `prefers-reduced-motion` 处理。
- 首页能进入文章，文章页能返回文章列表，主导航能进入关于页；所有站内链接返回成功页面。

### AC4 — SEO 与低带宽静态输出

- 每页具有唯一 `title`、description、canonical、Open Graph 基础字段；文章页包含发布日期与文章类型元数据。
- 站点 canonical 基址为 `https://luiaiworld.com`，但本需求不进行域名解析或公网发布。
- 三张源 PNG 存放于 `src/assets/codex-architecture/`，由 Astro 构建时处理；原始大图不原样复制到 `public/` 或 `dist/`。
- 页面不加载外部字体、分析脚本、广告脚本或客户端框架 bundle。

### AC5 — 首篇文章内容与事实边界

- 文章 slug 固定为 `codex-harness-beyond-model`；工作标题为「我把 Codex 的源码拆开看了看，最让我意外的不是模型」，允许 implementer 在不改变角度的前提下微调标题。
- 正文去除 frontmatter、URL、代码围栏和 Markdown 标记后为 4000–8000 个中文字符；正文不使用 Markdown 小标题，以短段、转场、三张图和必要代码块推进。
- 文章从真实项目事实切入：当前仓库正在搭个人站，`codex_arch` 已形成 7 篇导读和 3 张图；不得编造作者未提供的职业、公司、对话、测试数据或生活经历。
- 主论点固定为：Codex 的可用性来自模型与 harness 的组合；harness 负责状态、循环、工具、审批/沙箱、持久化和客户端协议。
- 明确标注分析基线为 `openai/codex` `d52478c52ef09f001142a4b82339467c3880877f`、抓取时间 2026-08-25；文中“当前”只指该快照。
- 区分官方事实、源码事实和架构推断；不得把“harness 开源”写成“整个 Codex 产品全部开源”。
- 正文就近链接官方 OpenAI harness 文章、Open Source 页面、App Server 文档和固定 GitHub commit；技术调用链与三张图可引用本地 `codex_arch` 的固定源码链接。
- `khazix-writer` L1 prose 扫描零命中：禁用词、冒号、破折号、双引号、结构套话和空泛工具名在“可见散文正文”中为 0；URL、frontmatter、代码块和 Markdown 语法不计入 prose 扫描。
- L2–L4 人工质检全部 PASS，且不出现卡兹克署名、卡兹克邮箱或冒充身份的固定尾部。

### AC6 — 项目入口文档

- `README.md` 只说明项目定位、Node.js `>=22.12.0` 前置条件和经过验证的 `npm ci`、`npm run dev`、`npm run check`、`npm run build`、`npm run preview` 路径。
- README 不包含个人绝对路径、部署承诺、未实现功能、密钥/IP/服务器信息或大段架构说明。

### AC7 — GitHub 公开仓库与远端一致性

- `https://github.com/0614lsn/luiaiworld` 存在且 visibility 为 `PUBLIC`，仓库描述为「路易的 AI 新世界个人网站源码」，homepage 为 `https://luiaiworld.com`，默认分支为 `main`。
- 本地仅配置一个本需求代码远端 `origin=https://github.com/0614lsn/luiaiworld.git`；不操作 `0614lsn` 账号下的其他仓库或组织资源。
- 阶段 3 每个 Candidate 冻结前，远端 `feature/site-skeleton-first-article` 必须与本地 Candidate Head 相同；阶段 4 合并后远端 `main` 必须与本地 merge Head 相同；阶段 5 每次收尾 commit 后继续同步 `main`。
- 全历史与待 push tree 的敏感模式扫描为零命中；`.pem`、私钥、token、`.env`、公网 IP 或本机 SSH 配置不得进入 Git 历史。
- 仓库公开不等于授予开源许可证；本需求不擅自添加 LICENSE、GitHub Actions、branch protection、issue、PR、release 或 secret。

### 验收标准承接核对

| 验收标准 | Task 文件集 | 测试项 |
| --- | --- | --- |
| AC1 | Task 1 的包清单、锁文件、配置、测试 | T1.1、T1.2 |
| AC2 | Task 1 的 content config、pages、layouts、content | T1.2、T1.3 |
| AC3 | Task 1 的 components、layouts、styles、pages、assets | T1.3 |
| AC4 | Task 1 的 config、layouts、assets、content | T1.2、T1.3 |
| AC5 | Task 1 的文章、content test、三张图 | T2.1、T2.2、T2.3 |
| AC6 | Task 1 的 README、package scripts | T1.1、T1.2 |
| AC7 | Task G 的 GitHub 仓库、`origin`、连接器注册表与各阶段远端 refs | TG.1–TG.5、T1.1、阶段 4/5 push 后核验 |

核对结论：AC1–AC6 的文件范围由 Task 1 承接，AC7 的外部资源与路由状态由 Task G 承接；技术、远端、浏览器与文章测试覆盖同宽范围。

## 3. 预裁决记录

前序会话已提供足够裁决，本轮无剩余待澄清项。技术实现细节均可逆、限定在本地仓库，并在
本 plan 闸门整体接受或驳回。

| 编号 | 问题 | 推荐答案 | 用户裁决（原文或摘要 + 日期） |
| --- | --- | --- | --- |
| Q1 | 备案前是否可以开始开发 | 可以先本地开发、构建、预览，正式公网服务前再完成备案 | 用户回复「现在本地开发、构建和预览吧」，2026-08-30 |
| Q2 | 网站代码和文档放在哪里 | 统一放入 `D:\MyProject\luiaiworld` | 用户明确指定该目录为个人网站项目目录，2026-08-30 |
| Q3 | 本轮先交付什么 | 先完成站点骨架和首篇 `codex_arch` 文章 | 用户回复「先做站点骨架和文章」，2026-08-30；本轮再次要求继续完成，2026-08-31 |
| Q4 | 使用什么写作方法 | 使用已安装的长文写作 skill，但内容属于用户个人站 | 用户明确要求用之前安装的写文章 skill，2026-08-30；本 plan 采用 `khazix-writer` 的方法但不冒充其作者身份 |
| Q5 | 是否把代码放到 GitHub | 在用户本人账号中新建唯一目标仓库并按 feature/main 纪律 push | 用户要求「新建一个 luiaiworld 仓库」并提交代码，2026-08-31 |
| Q6 | GitHub 仓库可见性 | 推荐先私有；若用户明确需要公开则按公开仓库执行 | 用户裁决原文：`建为公开仓库`，2026-08-31 |

## 4. 预授权清单

批准本 plan 即一并授权以下动作，实施中不再逐次确认：

1. 使用已登录 GitHub CLI 在账号 `0614lsn` 下创建且仅创建公开仓库 `luiaiworld`，设置 plan 声明的 description/homepage；创建前若同名仓库突然存在，立即停止，不覆盖、不改可见性。
2. 为本地仓库添加唯一代码远端 `origin=https://github.com/0614lsn/luiaiworld.git`；先 push 基线 `main`，再 push 当前 feature，并验证远端 SHA。允许将默认分支校正为 `main`，禁止 force push、history rewrite 和删除远端仓库。
3. feature 上每个已由主控形成的原子 task/fix/report/状态 commit 均可串行 push 到同名远端 feature；任何 push 前先确认 upstream 与 ahead/behind，非 fast-forward 立即停止升级人工。
4. 阶段 4 自动终审四条件满足后，可将 feature 以 `--no-ff` 本地合并到 `main` 并 fast-forward push `main`；阶段 5 的 knowledge/evolution/audit 收尾 commit 可继续逐次 fast-forward push `main`。本需求不删除远端 feature 分支。
5. 在 feature 分支安装并锁定 `astro@7.2.9`、`@astrojs/check@0.9.10`、`typescript@6.0.3`；允许 npm 访问公开 registry，生成 `node_modules/`、`.astro/` 与 `dist/`。
6. 从 `D:\MyProject\codex_arch\diagrams` 复制三张既有 PNG 到本仓 `src/assets/codex-architecture/`；只复制，不修改源目录。
7. 独立 implementer 在 Task 1 文件集内实现、自测并交还写入权；主控精确暂存 payload、README、测试与 Task checkbox，形成一个原子 task commit。
8. 阶段 3 fresh tester 可执行 `npm ci`、类型检查、静态构建、Node 测试，及在 `127.0.0.1:4321` 启停本地 preview；不得监听公网地址或访问生产服务器。
9. 阶段 3 浏览器 tester 可在 Codex 应用内浏览器打开本地 preview、切换桌面/移动视口、点击站内导航并留取截图证据；不得操作用户其他已登录页面。
10. 阶段 3 的 FAIL、Critical 或 Important 可由新的独立 implementer 在本合同范围内修复，并由主控形成原子修复 commit；若需要扩大范围则停止并升级人工。
11. Final Code Head 冻结后，主控可写入并提交本需求唯一 report；push 纪律按第 3、4 项执行。
12. 合并后按 LDP 阶段 5 写入 `docs/knowledge/2026-08-31-site-skeleton-first-article.md`、更新 `docs/knowledge/INDEX.md`，并由独立 subagent 写入 `docs/evolution-log/2026-08-31-site-skeleton-first-article.md`；主控可分别原子提交并 push 这些收尾工件。
13. 六面审计落盘并确认 feature 已合并后，可用非强制方式删除本地 `feature/site-skeleton-first-article` 分支，并删除本轮生成的临时 preview 日志、`dist/`、`.astro/`；保留 `node_modules/` 以便用户继续本地预览。
14. 不得删除或改写 `scripts/harden-luiaiworld-ubuntu.sh`，不得执行 `--force`、删除 GitHub 仓库/远端分支、操作其他 GitHub 资源、服务器写操作、域名/备案/安全组变更或公网部署。

## 5. 终审策略声明

本需求采用默认自动终审。它只修改本地新仓库，不涉及真实数据迁移、生产环境或安全边界。
当且仅当验收标准全 PASS、whole-branch review 零 Critical / Important、零 INCONCLUSIVE、
无预授权外待裁决项时，按第 4 节预授权自动本地合并；任一条件不满足则停下升级人工。

## 6. Task 列表

无开发并行组；Task G 先串行完成外部仓库初始化，Task 1 再由唯一 implementer 写入工作树。

### Task G — GitHub 公开仓库与连接器初始化（串行，Task 1 前）

- [x] 已完成（2026-08-31；公开仓库、`origin`、默认分支、全历史安全扫描与初始 main/feature refs 均已回读验证）
- **目标**：创建唯一目标公开仓库，建立 `origin`，安全同步 `main` 与 feature，并把连接器从 planned 更新为 active。
- **外部对象**：`github.com/0614lsn/luiaiworld`，visibility `PUBLIC`；不得操作其他仓库。
- **文件集（execution subagent 不写；主控收口时允许回写）**：
  - `docs/connectors.md`
  - `docs/development/2026-08-31-site-skeleton-first-article-plan.md` 的 Task G checkbox 与状态注记
- **执行模式**：串行；独立 execution subagent 仅创建/核验 GitHub 仓库，不修改本地文件、不执行 git commit、不再派 agent。
- **隔离位置**：`D:\MyProject\luiaiworld` feature worktree（execution subagent 只读本地状态）。
- **task 分支**：`feature/site-skeleton-first-article`。
- **集成顺序**：序号 1，完成后才派 Task 1。
- **冲突处置**：同名仓库已存在、登录账号变化、visibility/owner 不符、非 fast-forward 或敏感扫描命中时立即停止；不得接管、覆盖、删仓或改历史。
- **完成判据**：
  1. `gh auth status` 显示 active account `0614lsn`，token 仅来自系统 keyring；日志不得出现未遮蔽 token。
  2. 对每个本地 commit 执行只返回命中文件名的敏感内容扫描，私钥头、GitHub/AWS/阿里云 token 与真实公网 IP 零命中；`git ls-files '*.pem' '.env' '.env.*'` 为空。文档中用于说明禁令的字面量不算 secret 命中；任何疑似真实值必须在公开 push 前关闭。
  3. `gh repo view 0614lsn/luiaiworld --json nameWithOwner,visibility,url,defaultBranchRef,description,homepageUrl` 返回 owner/name、`PUBLIC`、description/homepage 与 AC7 一致。
  4. `git remote get-url origin` 精确返回 `https://github.com/0614lsn/luiaiworld.git`；`git ls-remote --heads origin main feature/site-skeleton-first-article` 的 SHA 分别与预期本地 refs 一致。
  5. 主控把 `docs/connectors.md` 状态改为 active、勾选 Task G，并形成一个原子状态 commit 后 fast-forward push feature；最终远端 feature 等于该 commit。

### Task 1 — Astro 站点骨架与首篇文章（串行）

- [x] 已完成（2026-09-01；25 个声明 payload、自测、文章四层质检与边界核对均通过；原子 commit 与远端 SHA 由主控在提交后回读记录）
- **目标**：在既有非空仓库内手动初始化 Astro 7 静态站，完成内容模型、全部页面、视觉系统、三张优化架构图、首篇长文、自动测试与 README。
- **文件集（允许新建 / 修改并提交）**：
  - `.gitignore`
  - `README.md`
  - `package.json`
  - `package-lock.json`
  - `astro.config.mjs`
  - `tsconfig.json`
  - `public/favicon.svg`
  - `src/content.config.ts`
  - `src/content/articles/codex-harness-beyond-model.md`
  - `src/assets/codex-architecture/01-system-context.png`
  - `src/assets/codex-architecture/02-turn-loop.png`
  - `src/assets/codex-architecture/03-tool-approval-sandbox.png`
  - `src/components/SiteHeader.astro`
  - `src/components/SiteFooter.astro`
  - `src/components/ArticleCard.astro`
  - `src/layouts/BaseLayout.astro`
  - `src/layouts/ArticleLayout.astro`
  - `src/pages/index.astro`
  - `src/pages/articles/index.astro`
  - `src/pages/articles/[id].astro`
  - `src/pages/about.astro`
  - `src/pages/404.astro`
  - `src/styles/global.css`
  - `tests/site.test.mjs`
  - `tests/content.test.mjs`
- **生成但不提交的工作路径**：`node_modules/**`、`.astro/**`、`dist/**`。
- **只读事实源**：
  - `D:\MyProject\codex_arch\README.md`、`00`–`06`、`SOURCE_INDEX.md` 与三张 PNG。
  - `C:\Users\lui\.codex\skills\khazix-writer\SKILL.md` 及其 `references/style_examples.md`、`references/content_methodology.md`。
  - 官方 OpenAI 文档：`https://developers.openai.com/blog/codex-as-a-platform`、`https://learn.chatgpt.com/docs/open-source`、`https://learn.chatgpt.com/docs/app-server`。
- **执行模式**：串行。
- **隔离位置**：`D:\MyProject\luiaiworld` feature worktree。
- **task 分支**：`feature/site-skeleton-first-article`。
- **集成顺序**：序号 2；Task G 完成后执行，完成后成为 feature Candidate。
- **冲突处置**：发现 `scripts/harden-luiaiworld-ubuntu.sh` 变化、文件集外 tracked 变化或来源不明写入时立即停止并报 `NEEDS_CONTEXT`；实现判断交新的独立 implementer，主控不下场修。
- **完成判据**：
  1. 运行 `node --version`、`npm --version`、`npm view astro@7.2.9 engines --json`；预期 Node 为 `v24.19.0`、npm 为 `11.17.0`、Astro 要求 Node `>=22.12.0`。
  2. 因仓库非空，禁止运行会初始化 Git 或覆盖目录的交互脚手架；手动创建包清单后执行精确依赖安装，`npm ls --depth=0` 只列计划内直接依赖且退出码为 0。
  3. `npm run check` 退出码 0，输出 0 errors。
  4. `npm run build` 退出码 0，并生成 AC2 枚举的全部路由。
  5. `npm test` 退出码 0；Node 测试逐项断言 AC1、AC2、AC4、AC5 的机械可检查部分。
  6. 文章 prose 扫描按 AC5 的排除规则得到 4000–8000 个中文字符、0 个 Markdown 小标题、L1 禁用词/标点/套话零命中；不得为通过测试而删掉必要源码 URL 或代码。
  7. `git diff -- scripts/harden-luiaiworld-ubuntu.sh` 为空；`git status --short` 的 tracked/untracked payload 与本文件集逐项一致，生成目录均被 `.gitignore` 忽略。

### Task F1 — C1 阻断项修复（串行，合同内验证修复）

- [x] 已完成（2026-09-01；C1 的移动图 FAIL 与 reviewer I1–I3 已完成合同内修复，自测 10/10 通过；原子修复 commit 与 C2 SHA 由主控提交后回读记录）
- **触发证据**：Candidate C1 `7bee2c5584223fa69a67371a3376368e0ba555fe`；T1 唯一 FAIL 为 390×844 三张架构图标签不可读；C1 whole-branch review 另报 2 个 Important：官方开源清单归因粒度写宽、朱红小字号文本对比度约 3.67:1。
- **目标**：关闭 C1 的 1 个测试 FAIL 与 3 个 Important，不扩大站点功能或依赖范围。
- **文件集**：
  - `astro.config.mjs`
  - `src/styles/global.css`
  - `src/content/articles/codex-harness-beyond-model.md`
  - `tests/site.test.mjs`
  - `tests/content.test.mjs`（仅用于不脆弱的来源归因回归；无可靠断言时保持不变）
- **执行模式**：串行；由未参与 C1 实现、测试或 review 的独立 implementer 执行。
- **隔离位置**：`D:\MyProject\luiaiworld` feature worktree。
- **task 分支**：`feature/site-skeleton-first-article`。
- **集成顺序**：序号 3；完成后冻结新 Candidate C2。
- **冲突处置**：需要新增依赖、改 content schema、改页面结构文件或放宽 AC3/AC5 时立即报 `NEEDS_CONTEXT`；不得用 `body { overflow-x: hidden }` 裁掉图、不得删除来源或降低文字字号来绕过问题。
- **完成判据**：
  1. 构建后的三张文章图各自位于可聚焦的局部图示视口，具有可见 focus 与清晰的触摸/键盘横向查看语义；390px 下图使用足以辨认标签的最小展示宽度，溢出只发生在该视口内，页面根节点不横向滚动；桌面图不退化、alt 保留。
  2. 文章官方开源段只把当前 Open Source 页面明确列出的顶层组件归为官方清单事实；Rust Core、协议和沙箱辅助组件改为固定 `d52478c...` 仓库中的源码事实，并就近链接固定源码。
  3. 正常字号朱红文字在实际暖纸背景上的对比度至少 4.5:1，仍保留朱红点色；新增机械断言覆盖颜色/局部图示视口结构，但不得把结构断言冒充真实移动可读性测试。
  4. `npm run check`、`npm run build`、`npm test` 全部退出码 0；文章仍为 4000–8000 中文字符、0 Markdown 小标题、L1 零命中，三张图与事实基线保留。
  5. `git status --short` 只出现本 Task 实际需要的上述文件；不修改 plan checkbox、不 commit、不 push。

## 7. 外部工具入口 dry-run sanity

- 2026-08-31 已在仓库根只读确认 `node v24.19.0`、`npm 11.17.0`。
- 2026-08-31 已执行 `npm view astro version engines --json`，确认当前 `astro 7.2.9` 需要 Node `>=22.12.0`；`@astrojs/check 0.9.10` 支持 TypeScript `^5 || ^6`，故锁定 `typescript 6.0.3`，不使用不兼容的 TypeScript 7。
- Astro 官方文档确认非空目录应采用手动安装；Task 1 第一个实现 step 仍须按完成判据重新执行版本/入口 sanity，结果不符时停止为 `NEEDS_CONTEXT`。
- 2026-08-31 对全部拟新增文件执行 `git check-ignore -v --no-index`，结果为 `ZERO_HITS`，无需 `git add -f`。
- 2026-08-31 已执行 GitHub CLI sanity：`gh 2.98.0`、active account `0614lsn`、HTTPS/keyring 认证、`0614lsn/luiaiworld` 返回 `NOT_FOUND`；凭证值不写入 plan、仓库或后续命令。
- GitHub 创建入口在 Task G 第一项再次执行 `gh auth status` 与 `gh repo view`；目标状态与本次 sanity 不一致时停止，不把“已存在”误当作可接管资源。
- 应用内浏览器入口仅在阶段 3 本地 preview 已启动后使用；tester 首次操作前必须按 Browser skill 读取所选浏览器完整文档。无法建立浏览器会话时，AC3 记 `INCONCLUSIVE`，不得用 HTTP 抓取冒充视觉验证。

## 8. 已知弹性点

1. **Astro 7 API 变化**：精确锁版本并以官方 Content Layer `glob()` loader 为准；若实际类型签名与计划不同，只能在 AC2 语义不变时做合同内适配并记录 report。
2. **npm 瞬时网络错误**：核对未产生半成品锁文件后以完全相同参数重试一次；仍失败则 `BLOCKED`，不改包管理器、不换镜像源。
3. **文章标题微调**：允许在固定 slug、主论点和事实范围不变时优化标题；不视为 Contract change。
4. **长文 markup 与风格扫描冲突**：URL、frontmatter、代码围栏和 Markdown 标记排除在 prose 扫描外；实际呈现给读者的散文仍必须零命中。
5. **图片构建策略**：保留源 PNG 作为仓库事实资产，由 Astro 产出优化文件；若生成格式随 Astro 变化，以“原始 PNG 不原样进入 dist、页面可读、构建通过”为判据。
6. **浏览器能力不可用**：结构/HTTP 测试可继续，但视觉项必须记 `INCONCLUSIVE` 并触发人工升级，不能自动合并。
7. **GitHub 同名仓库竞态**：创建前若 `0614lsn/luiaiworld` 已存在，Task G 停止并升级人工；不得自动复用、改可见性或覆盖内容。
8. **远端分叉**：任何本地分支 behind 或 push 非 fast-forward 都停止；本需求不 pull/rebase 未知远端历史，不 force push。

## 9. 测试计划

阶段 3 冻结 Candidate Head 后，技术/浏览器与文章/事实两组由两个 fresh tester 并行执行，
彼此不写 tracked 文件；证据均记录 Candidate Head 和原始关键输出。两组完成后再派 fresh
whole-branch reviewer 审查 `Base..Candidate` 与全部证据。

### T1 — 技术构建、路由与浏览器（fresh tester A）

证据绑定 AC1、AC2、AC3、AC4、AC6、AC7。

1. 在 `D:\MyProject\luiaiworld` 执行 `git rev-parse HEAD` 并记录 Candidate；执行 `npm ci`、`npm run check`、`npm run build`、`npm test`，预期全部退出码 0，原始关键行返回主控。
2. 执行 `git remote get-url origin` 与 `git ls-remote --heads origin feature/site-skeleton-first-article`，预期 URL 为 AC7 唯一远端且远端 feature SHA 等于 Candidate Head；不一致即 FAIL，不由 tester push 修复。
3. 运行 `git status --short`，预期无 tracked 变化；检查 `dist/` 存在 AC2 全部路由、无外部字体/分析脚本/客户端框架 bundle，三张原始大 PNG 不以原文件名和原始体积复制到 `dist/`。
4. 启动 `npm run preview -- --host 127.0.0.1 --port 4321`；声明观察边界为“进程返回 listening URL 后至首页、文章列表、文章、关于、404 五类页面检查完成”，记录进程/session 与结束状态。
5. 使用应用内浏览器打开 `http://127.0.0.1:4321/`：桌面 1440×900 与移动 390×844 分别检查首页、文章列表、文章详情；断言无横向滚动、导航/焦点可用、三张图可读且有 alt、站内链接正确、404 返回自定义页面，并留取桌面首页、移动首页、桌面文章、移动文章截图证据。
6. 停止 preview 进程并记录退出；不得修改代码。浏览器不可用或 preview 无法归类结束时按第 8 节记 `INCONCLUSIVE`。

### T2 — 文章事实、风格与来源（fresh tester B）

证据绑定 AC5，并复核 AC2 的 metadata 单一来源。

1. 记录 Candidate，执行 `node --test tests/content.test.mjs`；预期全部断言通过，附字符数、标题数、L1 扫描命中数原始输出。
2. 对照 `D:\MyProject\codex_arch\README.md`、`00`–`05` 和 `SOURCE_INDEX.md`，逐条核对固定 commit、日期、开源边界、Thread/Turn/Sampling、StepContext、工具回填、审批/沙箱、rollout/compaction、App Server；每条标为官方事实/源码事实/推断，发现无来源断言即 FAIL。
3. 打开文章中的三类官方链接，核对 OpenAI harness 定义、开源组件边界和 App Server thread/turn/event/approval 口径；网络瞬时失败只使该链接核验阻断，使用完全相同 URL 重试一次，不定性为内容 FAIL。
4. 按 `khazix-writer` L2–L4 通读：具体真实开头、长短句与断裂、扣主线、口语化而非报告体、知识自然掉落、对非技术读者的同理心、文化升维、结尾回环、真人感；逐项给 PASS/FAIL 与原文位置，不得参与修文。
5. 确认无卡兹克署名/邮箱/身份冒充，无用户未提供的第一手经历，无 Markdown 小标题；任一命中即 FAIL。

### T3 — Whole-branch review（fresh reviewer，T1/T2 完成后）

1. 静态审查 `4b28bcd2ffebd0cc7015ca33c6bb3132defd8b45..Candidate Head` 全部 diff，核对文件集、依赖最小性、Astro 7 API、HTML/CSS 可访问性、内容渲染安全、链接与 metadata。
2. 审查 T1/T2 是否完整覆盖 AC1–AC6、是否绑定同一 Candidate、是否存在缺口或测试后 tracked 变化；不亲自重跑测试，不把静态核对称为测试。
3. 按 Critical / Important / Minor 分级；Critical/Important 与 tester FAIL 均交新的独立 implementer 修复，形成新 Candidate 后重跑受影响测试、T1 的 `npm run check && npm run build && npm test` regression sanity 和必要浏览器/内容定向回归，再执行 fresh whole-branch review。
4. 只有零 FAIL、零 Critical/Important、零 INCONCLUSIVE、证据充分时才能冻结 Final Code Head；Minor 全量进入 report ledger。

## 10. 范围外（不做）

- 不部署 ECS，不安装/修改 Nginx、Docker、服务器软件，不开放 80/443，不改安全组、UFW、DNS 或 ICP 备案。
- 除 `github.com/0614lsn/luiaiworld` 外，不创建或修改任何远端仓库；不创建 PR、issue、workflow、release、secret，不授予开源 LICENSE，不发布公网 preview。
- 不做 CMS、后台、数据库、登录、评论、搜索、Newsletter、分析埋点、广告、RSS、站点地图或深色模式。
- 不制作 PPT，不调用 PPT skill；本轮只交付站点与文章。
- 不生成作者照片、社交账号、邮箱或个人履历，不编造用户未提供的身份信息。
- 不改 `D:\MyProject\codex_arch` 源材料，不改既有服务器加固脚本。
