# 三平台内容准备与草稿交付结果

> 后续更新：2026-09-12 已实现并验收 Edge 扩展统一按钮。当前入口与实际结果见 [统一草稿交付结果](2026-09-12-unified-draft-delivery-result.md)，下文为此前阶段记录。

> 最新整理：2026-09-10。用户确认内容已准备好，并将默认目标调整为草稿交付、人工最终发表。

## 交付结论

本项目现在按每期一个内容项目管理原始材料、工作稿和三平台版本。日常入口是 content-projects/；.content/ 保留内部版本、状态和恢复材料。网站没有后台草稿箱，使用本地 Astro 预览。公众号通过官方 API 保存草稿；小红书为创作浏览器中的本地草稿。未声称有保证三站同时云端存稿或公开发表的通用按钮。

长期方法见 [内容工作流](../content-workflow.md)、[部署维护](../deployment.md)。开发约定见 [本任务计划](2026-09-07-three-channel-publishing-plan.md)。

## 首期内容

内容项目：content-projects/gpt-6-astra-model-guidance/，标题《GPT-6 Astra 官方提示指南（中文整理）》。

| 平台 | 当前事实 | 交付位置 |
| --- | --- | --- |
| 网站 | 已于 2026-09-08 按用户明确确认公开；HTTPS、域名和 Web 端口已接通 | platforms/website/，线上 https://luiaiworld.com/articles/gpt-6-astra/ |
| 微信 | 官方 API 草稿保存及回读成功，尚未由本任务公开发表 | platforms/wechat/ 的 preview.html、body.html、draft.json、receipt.json |
| 小红书 | 已保存 8 张图片及文案的浏览器本地草稿；未实际执行公开发布 | platforms/xiaohongshu/ 的 cards、caption.txt、post.json、receipt.json |

公众号保留用户后台人工编辑、橙色截图主题、23 项连续引用和 12 段完整提示词，重复无序列表标记已修正。整理时通过新的可复用读稿命令刷新内容，bodyHash 仍为 e040b47c85209b62f826c9d3648fba855c7e1b8815631ee982a78fea45ba6b04。

最初放在仓库根的 Markdown 已移动到该项目的 sources/，SHA-256 为 639105c18b16362f51156f98ecc08b67d47dd22e686292fcca48a29228b1ebde，移动前后及恢复快照中的字节一致。source/origin 历史资料、主题参考截图、千问生图试验均在本期项目内。工作稿与平台人工稿分别保留，不用旧原稿覆盖用户修改。

已交付平台事实属于原版本 938e72550eb87d1076b3e0a3dc157325535652a692ac9851d3d918da42f93e2d。目录迁移和工具更新生成了新的本地准备版本 0b77b5dc4cd59ad1beb2445559884999a690a1e1894f8020fbd716fb6a04fe60；它不继承旧版本的批准，也没有被重新上传平台。最新平台交付状态以本期 project.json 与平台回执为准。

## 本次整理

- 活跃 docs 现只保留内容工作流、部署维护、本任务计划和本任务结果四份文档。旧 LDP 的 connector、计划、报告、knowledge 和 evolution-log 已移出活跃目录。
- 停用的旧 Codex 架构稿与三张配图已归档，站点只保留当前已发布指南。对应旧文专属测试改为当前文章的来源、身份说明和提示词完整性检查；通用站点回归继续保留。
- .content/wechat 内的一次性调试脚本、失败 HTML 和诊断回执等已移出工作目录；最终稿和关键回执保存在内容项目。旧实验目录、旧主题样例、部署临时目录和过期预览缓存一并归档。
- content core 从 content-projects 读取工作稿，只跟踪 article.md、xiaohongshu.json 和 assets；增加测试保证资料和平台回执不会改变渲染版本或被混入产物。
- 增加 scripts/content/wechat-draft.ts，将现有读稿与防冲突更新逻辑参数化，凭据仍来自用户级 Baoyu 配置。为了在现有 Astro 类型检查下检查 Node 脚本，增加开发期 @types/node 24.13.4；没有新增生产运行依赖。首次类型检查缺 Node 类型的问题已修复。
- README 和项目 content-distributor skill 已按新的草稿目标重写；旧流程的自动 push、合并和发表授权不再作为活跃规则。

## 清理方式与恢复

批量递归删除命令被工具策略拒绝，未返回具体原因，没有删除其中任何目标。随后改用可恢复归档，已核对路径在本仓库内且不为链接。此次应称为“移出活跃目录并归档”，不能称为这些文件已彻底删除。

- 归档目录：.content/archive/cleanup-20260910/，保留原相对路径。
- 整理前恢复快照：.content/backups/cleanup-previous.tar.gz，约 7.8 MB，已校验可读取并验证原始 Markdown 哈希。
- 恢复时先解包到独立目录，核对后恢复所需文件；不要直接覆盖已继续编辑的内容项目。

保留了运行所需的 node_modules、当前构建产物和类型缓存，以及历史平台关联版本、状态和清理元数据。没有清空浏览器数据或修改本机 Baoyu 凭据；没有删除全局插件或其他项目文件。

## 验证

| 项目 | 结果 |
| --- | --- |
| 原始稿迁移 | 字节及 SHA-256 与快照一致 |
| npm run wechat:draft -- read（整理时的文章 ID） | 官方 API 回读成功，保存到新平台目录，正文哈希一致 |
| npm run check | 28 files；0 errors / warnings / hints |
| npm test | 28/28 PASS；普通构建 5 个页面，仅当前公开文章 |
| content prepare | 从新项目目录成功生成版本包，未覆盖平台最终稿 |
| content preview | 实际启动本地服务，文章 HTTP 200、标题正确；检查后使用 Astro 正式命令停止 |
| 预览后普通构建回归 | 再次 npm test，28/28 PASS，未将私人内容项目混入公开产物 |
| 公网视觉验收 | 本轮未重新部署，不重复声称做了新的公网或手机视觉验收 |

## 后续边界

用户已表示三平台内容准备完成。以后重点是新的内容项目和草稿交付，不继续建设无人值守公开发布。公众号和小红书最终发表由用户在平台操作；网站由用户明确触发部署。若将来要求网站后台草稿箱、真正的统一发布按钮或自动化小红书公开发表，需要另行实施和验证。

本轮没有 Git commit/push、没有再次部署、没有发表公众号或小红书，也没有更新跨会话记忆。当前 main 基线 HEAD 为 86b1c8e；未提交改动包含本次内容管线、主题及整理成果。


## 2026-09-10 内容项目改名

用户将本地内容项目 gpt-6-astra 改名为 gpt-6-astra-model-guidance。目录、project.json 的 id、当前命令示例及活跃路径引用已同步。以新 ID 实际 prepare 成功，版本为 4757728f8e355710a829aee36aa416f13b6af9e510759d0866e18fc34eae0780，verify 通过。旧状态账本及不可变版本保留原 ID 作为历史，新项目记录 previousIds 和历史账本入口。既有平台回执、mediaId、原稿字面及线上 /articles/gpt-6-astra/ 地址不修改。
