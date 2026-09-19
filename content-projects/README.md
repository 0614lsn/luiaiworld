# 内容项目

每期内容一个目录，目录名就是 `content` 命令使用的文章 ID，例如 `gpt-6-astra-model-guidance`。

`_planning/` 保存本地创作规划资料和初始选题记录，不是文章项目，也不作为 `content prepare` 的输入；通用功能规格保存在 `docs/development/`。

```text
<文章ID>/
  README.md              本期定位、来源及交付入口
  project.json           本期进度与平台状态摘要
  article.md             当前工作稿，生成内容包的唯一正文输入
  xiaohongshu.json        选择小红书时需要的改写与有序图片清单
  xiaohongshu/
    analysis.md          baoyu-xhs-images 本期分析
    outline.md           本期图片方案
    prompts/             生图前保存的逐图完整提示词
    images/              实际生成图与选用的原图副本，按清单上传
  sources/               最初原稿、资料、主题参考截图
  assets/                正文实际使用的图片等附件
  experiments/           生图尝试等非正式素材
  platforms/
    website/             已部署版本记录；draft/ 保存按钮交付的本地草稿
    wechat/              最新公众号正文、预览、API 回读及回执
    xiaohongshu/          图片卡片、标题和文案
```

这些项目默认不进入 Git，也不会随网站构建公开。`sources/` 保留原始资料，编辑 `article.md` 进行创作；不要把密钥或登录数据放在内容项目里。`platforms/` 是平台定稿和回读，尤其可能包含用户在后台做过的修改，不能用新的生成结果直接覆盖。

创作前先确定平台，按选定平台完成稿件；小红书图片每期通过 baoyu-xhs-images 动态创作。创作稿齐备后运行 `npm run content:hub`，在 Edge 扩展中确认本篇目标平台并点击「交付所选草稿」。未选站不生成或存稿；只选网站/公众号不需要小红书文案与图片。也可运行 `npm run content -- prepare <文章ID> --platforms website,wechat` 仅生成所选版本包；低层 prepare 同样必须明确平台。包含网站稿时用 `npm run content -- preview <文章ID>` 审核。安装、图片清单格式与恢复见 [内容工作流](../docs/content-workflow.md)。
