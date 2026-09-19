---
name: content-distributor
description: 在本项目以每期独立内容项目准备个人网站、微信公众号与小红书稿件，协调草稿交付和回读；默认不执行公开发表。
---

# 三平台内容准备与草稿交付

先读根 README、docs/content-workflow.md、本期 content-projects/<id>/README.md 和 project.json。逐篇确定目标平台，固定使用日常 Edge 保存小红书草稿；默认不公开发表。

## 创作前先确定平台

在生成任何平台专用文案或图片之前，先从用户当前指示确定本期目标平台。用户已明确说“只发公众号”等时直接沿用，不重复询问；没有明确时先询问平台，可以继续整理共用素材，但不得默认三站或提前生成三份平台稿。把确认结果记入本期 project.json 的 distributionDecision.selectedPlatforms。后续扩展勾选是交付范围确认，不是先生成后删除；取消勾选也不会删除历史内容。

## 内容管理

每期新建 content-projects/<id>/。sources/ 保存原始资料，article.md 为唯一工作稿，assets/ 放共用正文附件，xiaohongshu.json 保存审阅后的改写与有序图片清单，xiaohongshu/ 放本期专用图片、逐图提示词和创作记录，experiments/ 放试验，platforms/ 放各平台最新定稿、回读和回执。先保留用户文件，移动原始材料须验证字节不变。

创作交付 article.md 和附件；只有选中小红书才要求与原稿匹配且已审阅的 xiaohongshu.json 和实际图片，不能只改 sourceHash 掩盖原稿变化。主入口为 npm run content:hub + Edge 的「LUI 三站草稿交付」扩展，逐篇勾选平台后点击「交付所选草稿」。新项目默认空选，每篇记住选择；未选站完全跳过生成、存稿和回读，不删除其已有内容。只选网站或公众号时不要求小红书账号。低层 content prepare 必须显式传 --platforms <逗号分隔平台>，本身不上传、不部署。网站为本地草稿，公众号为云端草稿，小红书为 Edge profile 本地草稿。

## 小红书图片创作

每期需要创建或修改小红书配图时，必须使用已安装的 baoyu-xhs-images skill，根据本期内容制定分析、大纲、风格与图片方案，调用实际栅格生图后端。在 Codex 默认按该 skill 的后端规则使用原生 imagegen。不得以 SVG、HTML、Canvas 或固定排版代码替代，不得只写 skill 名称就声称已调用。

调用生图前保存完整逐图提示词；生成后检查图片内容、文字和原图保留情况。把 skill 的 analysis.md、outline.md 等材料保存在本期 xiaohongshu/；交付图片放 xiaohongshu/images/，对应提示词放 xiaohongshu/prompts/。工具生成到默认目录时，复制真实结果到本期，不虚构文件。原图作为证据时保留，不自动重绘或换成文字摘要；选择用于上传的原图副本也放 images/，标记 kind: original，不为其伪造生图提示词。小红书专用图和 prompts 不放通用 assets/，避免混入未选站产物。

xiaohongshu.json 使用 imageSkill: baoyu-xhs-images 和 images 有序清单；kind: generated 必须指向实际存在、非空的 prompt 文件，kind: original 可不带 prompt。字段及样例见 docs/content-workflow.md。记录的 skill 标签只是创作来源说明，实际调用依据仍是本轮工具结果和创作记录。

prepare 与交付按钮只校验、打包、上传已经完成的图片，不会调用 skill 或模型，不会缺图时自动套文字模板。缺图片/提示词就报告小红书创作未完成；已审核图片可复用交付，不因再次点按钮而重新生图。旧 cards 文本脚本仅作为历史资料保留，不能用于新生成；需要重新交付时先用 skill 完成新的图片清单。已撤回文章不自动补做。

## 草稿交付

- 网站：统一按钮保存到 platforms/website/draft/，status: draft 不进入正式站点。可用 content preview 审核；停止 Astro 草稿预览后再运行普通检查或构建。
- 公众号：统一适配器 wechat-delivery.ts 通过 Baoyu 传输新增或回读草稿；已有稿保留平台人工修改，来源变化提示合并。手工更新仍用 wechat:draft read/update 并绑定最新 bodyHash。回执不硬编码到公共脚本。
- 小红书：固定 Edge 扩展实例/profile 和明确账号。按钮使用独立页上传、暂存、重新打开，核对标题、正文、8 图或本期实际图数及图片顺序。不可拿 Codex 内置浏览器的旧回执作为 Edge 成功；不要退回内置浏览器另存。任务进度以 .content/delivery/jobs/ 为准。

统一任务的所选平台均 draft_saved 才报告完成，未选站为 skipped。恢复固定使用原任务平台集合，不能用页面新勾选覆盖。部分失败保留成功项；submission_unknown 必须按原 jobId 恢复只读核实，不通过改变平台组合或文案重复保存。对失败原因如实报告，不能只做本地生成或人工填写回执后声称按钮端到端成功。首次连接由用户填写本机连接码，不要求把码或平台密钥发到聊天。

公众号旧草稿箱开关已废弃，无需用户查找。账号功能、API 权限和实际调用结果分别说明。浏览器被工具拒绝时不换浏览器、CDP、代理或抓取脚本绕过；官方 API 草稿操作不依赖后台浏览器会话。

## 排版与校验

当前项目 editorial-orange 主题根据用户提供的阿里技术截图制作，转换器位于 scripts/content/wechat-editorial-theme.mjs；它不是 Baoyu 原生主题名，不直接写入 Baoyu default_theme。对回读 HTML 后处理，不能由旧 Markdown 重建并覆盖用户编辑。

保持提示词字面、正文、作者及来源；正文引用同行同色，删除引用后重排编号并同步正文，校验所有标注可回查。保留底部 URL 文字引用，移除不兼容的可点击外链、装饰 SVG，不加入无效 JS 复制按钮。带手工圆点的列表项抑制原生 marker，普通列表保留原生标记。字体行内属性要正确转义并回读确认。

遇到正文校验错误时核对平台实际回读、外链和不支持的标签；封面 ID 为空时先核对当前图像并补齐有效素材，不得擅自恢复旧封面。失败先定位原因，不用重复提交掩盖问题。

## 最终发表与状态

默认停止在可审核草稿，不群发。用户在公众号、小红书后台手动发表；网站在用户明确下达部署指示后才处理，见 docs/deployment.md。已公开文章不因草稿目标调整自动撤下。

record 仅登记观察事实，不产生授权。新包不继承旧包批准；实际平台稿可能与初始生成 HTML 不同，收据必须指向最新回读和内容指纹。提交结果未知时先查询，不重复发表或制造重复草稿。人工反馈不是 API 回读，机器校验也不等于人类排版验收。

清理运行 content:prune 先预览，再按已获授权的明确候选执行。保留当前、上一版和仍被平台及文档引用的内容包；临时调试材料可按用户清理授权移除，正式平台稿和源资料留在本期项目。

## 代码与私人内容边界

GitHub 只保留实现、测试、配置模板和必要使用说明。真实正文、文章图片、生成包、平台回执和 docs/development 内部记录留本地；即使文章已公开，也不把原稿加入 Git。正式文章目录为本机 src/content/articles，专用图片用 src/assets/content 或 public/content，均已忽略。提交前检查暂存区，不用强制添加绕过规则。取消跟踪后保留本地文件，历史改写需另外明确授权。具体主机和运维信息读取本地 docs/development/deployment-local.md，不写回公开使用文档。
