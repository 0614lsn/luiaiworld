# LUI AI WORLD

「路易的 AI 新世界」的个人网站与本地内容工作区，用于记录 AI 工程实践、源码阅读和工具使用。网站基于 Astro 构建；内容创作以每期独立项目组织，由 Codex 和 skills 协助整理素材、撰写文章，并准备个人站、微信公众号和小红书三个版本。

**默认流程是准备内容、交付草稿、人工审核，再由用户决定发表。**

[访问网站](https://luiaiworld.com/) · [阅读首篇文章](https://luiaiworld.com/articles/gpt-6-astra/)

## 快速开始：运行网站

需要 Node.js `>=22.12.0` 和 npm。在仓库根目录执行：

```bash
npm ci
npm run dev
```

打开终端输出的本地地址，即可浏览首页、文章列表和已公开文章。网站源码使用 Astro 与 TypeScript，构建结果是静态 HTML、CSS 和少量交互脚本；文章中的提示词块支持复制与自然换行。

运行网站不需要公众号或小红书账号，也不依赖本机的私人内容项目。

## 用 Codex 准备一期内容

在这个项目中打开 Codex，可以这样开始：

> 请按本项目的内容分发 skill，新建一期关于「主题」的内容项目。先整理原始素材和工作稿，再生成个人站、公众号和小红书版本，保存到可用的草稿位置，最后给我审核入口，不公开发表。

项目协作入口是 [content-distributor](.agents/skills/content-distributor/SKILL.md)。Codex 与 skills 完成创作后，可用 **Edge 的「LUI 三站草稿交付」按钮**统一完成格式适配、存稿和回读核验。

每期内容放在 `content-projects/<文章ID>/`，其中：

- `sources/` 保存原始文章、资料和参考截图。
- `article.md` 是当前工作稿，`assets/` 放正文附件。
- `xiaohongshu.json` 保存小红书文案与卡片脚本。
- `platforms/` 保存各平台最新交付稿、预览和回执，包括后台人工编辑过的版本。

完整结构见 [内容项目目录说明](content-projects/README.md)。内容项目默认被 Git 忽略，获取代码仓库后需要先创建或恢复自己的内容项目。

### 生成与审核

本期项目准备好 `article.md` 和与原稿匹配的 `xiaohongshu.json` 后，在仓库根运行：

```bash
npm run content:hub
```

首次在日常使用的 Edge 加载 [本地扩展](extensions/draft-delivery)，填写本机连接码、Edge profile 备注和小红书账号显示名称。此后点击扩展，选中本期内容，点击 **「交付三站草稿」**；页面分别显示三站结果，只有全部核验成功才显示完成。首次配置步骤见 [内容工作流](docs/content-workflow.md#首次配置-edge-按钮)。

连接码和任务记录位于被 Git 忽略的 `.content/delivery/`。公众号继续使用本机的 Baoyu 账号/API/SSH 配置；小红书使用当前 Edge profile 的登录与草稿，不再以 Codex 内置浏览器为交付目标。

也可以仅生成本地包、查看账本和预览网站草稿。示例 ID 应替换为实际存在的项目目录名：

```bash
npm run content -- prepare gpt-6-astra-model-guidance
npm run content -- status gpt-6-astra-model-guidance
npm run content -- preview gpt-6-astra-model-guidance
```

`prepare` 输出一个版本化内容包的位置，包含网站稿、公众号 HTML 与封面、小红书文案与卡片；相同输入会复用已有版本。`status` 显示版本记录，`preview` 在 `http://127.0.0.1:4322` 提供网站草稿预览。

`prepare` 仍只生成本地内容包；**统一按钮才会继续执行平台存稿**。已有公众号人工稿会先回读保留，工作稿与其来源版本不同会提示合并。小红书保存结果未知时先回读，不重复新增。

### 三个平台的交付方式

| 平台 | 草稿与审核入口 | 最终发表 |
| --- | --- | --- |
| 个人站 | 本地工作稿、`platforms/website/draft/` 及 Astro 预览 | 用户确认后执行部署 |
| 微信公众号 | 通过官方 API 保存到公众号草稿箱，并回读核对 | 用户在公众号后台手动发表 |
| 小红书 | 当前指定 Edge profile 的创作平台图文草稿，保存后重新打开核对 | 用户在后台手动发布 |

公众号操作依赖已安装的 `baoyu-post-to-wechat` 技能及账号配置，通过 Bun 运行。小红书草稿仍属于浏览器本地数据；换 profile 或清除该网站数据会影响可见性，因此图片、文案和核验回执也保留在本地项目中。关闭交付页可以稍后恢复；遇到登录、平台校验或人工改稿冲突时，页面显示具体待处理项。

账号配置、已有草稿的回读与更新、排版约束及版本清理，见 [内容工作流](docs/content-workflow.md)。网站上线步骤见 [部署与维护](docs/deployment.md)。

## 网站开发与验证

| 命令 | 用途 |
| --- | --- |
| `npm run dev` | 启动网站开发环境 |
| `npm run check` | 检查 Astro 与 TypeScript |
| `npm test` | 构建网站并运行测试 |
| `npm run build` | 生成 `dist/` 静态文件 |
| `npm run preview` | 预览已经构建的静态网站 |

网站草稿预览与普通构建共用部分 Astro 内部状态，应串行运行。在 Codex 中启动的开发服务可能转入后台，可用 `npm run dev -- status` 查看，使用 `npm run dev -- stop` 停止后再检查或构建。

## 内容与代码的存放边界

- `src/`、`public/`：网站源码与公开资源；正式文章位于 `src/content/articles/`，普通构建只展示 `published` 状态的文章。
- `content-projects/`：作者日常使用的内容项目，默认不进入 Git，也不直接进入网站构建。
- `.content/`：内部版本包、状态、清理回执与恢复材料，无需作为日常创作入口。
- `scripts/`、`tests/`：内容处理、部署辅助与验证代码。

每期内容以自己的项目说明和平台回执为交付入口。当前按钮的实现与验收见 [统一草稿交付结果](docs/development/2026-09-12-unified-draft-delivery-result.md)，此前的目录整理见 [内容整理记录](docs/development/2026-09-07-three-channel-publishing-result.md)。
