# 内容项目

每期内容一个目录，目录名就是 `content` 命令使用的文章 ID，例如 `gpt-6-astra-model-guidance`。

`_planning/` 保存本地创作规划资料和初始选题记录，不是文章项目，也不作为 `content prepare` 的输入；通用功能规格保存在 `docs/development/`。

```text
<文章ID>/
  README.md              本期定位、来源及交付入口
  project.json           本期进度与平台状态摘要
  article.md             当前工作稿，生成内容包的唯一正文输入
  xiaohongshu.json        小红书改写与卡片脚本
  sources/               最初原稿、资料、主题参考截图
  assets/                正文实际使用的图片等附件
  experiments/           生图尝试等非正式素材
  platforms/
    website/             已部署版本记录；draft/ 保存按钮交付的本地草稿
    wechat/              最新公众号正文、预览、API 回读及回执
    xiaohongshu/          图片卡片、标题和文案
```

这些项目默认不进入 Git，也不会随网站构建公开。`sources/` 保留原始资料，编辑 `article.md` 进行创作；不要把密钥或登录数据放在内容项目里。`platforms/` 是平台定稿和回读，尤其可能包含用户在后台做过的修改，不能用新的生成结果直接覆盖。

创作稿齐备后，从仓库根运行 `npm run content:hub`，使用 Edge 的「LUI 三站草稿交付」按钮完成适配与存稿。也可运行 `npm run content -- prepare <文章ID>` 仅生成版本包，运行 `npm run content -- preview <文章ID>` 查看网站本地草稿。安装与恢复见 [内容工作流](../docs/content-workflow.md)。
