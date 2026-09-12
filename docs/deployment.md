# 个人站部署与维护

网站是 Astro 静态站。Node.js 在本地构建，ECS 上由 Nginx 提供静态 HTML/CSS；无需常驻 Node 应用、数据库或 CMS。

## 当前部署

- 正式域名：`https://luiaiworld.com/`，www 也可访问。
- 既有 SSH 别名：`luiaiworld`。认证使用本机现有密钥配置，不复制密钥到内容项目。
- 线上根目录：`/var/www/luiaiworld/current`，指向 releases 下的已部署静态版本。
- Nginx 配置：`/etc/nginx/sites-available/luiaiworld`。
- HTTPS 由 Certbot 管理，certbot.timer 自动续期，首次部署的模拟续期已成功。
- 用户自行处理公安联网备案；证件或备案个人材料不进入公开仓库。

## 审核后如何上线

用户明确确认要上线的内容项目及版本后，由 Codex 将已审核网站稿放入 `src/content/articles/`，设置 published 状态，执行检查和构建。上传只包含 dist 的新版本目录，校验后切换 current 符号链接，并从公网核对正文及资源。旧版本保留一份用于回退。

用户也可以自行执行这些部署操作；目前没有后台发布按钮。最方便的人工发布入口是明确发出“把已审核的某内容项目部署到个人站”，这一步不会由准备草稿流程自动触发。

常用只读检查：

```bash
ssh luiaiworld 'sudo nginx -t'
ssh luiaiworld 'sudo systemctl status nginx --no-pager'
ssh luiaiworld 'sudo systemctl status certbot.timer --no-pager'
```

`scripts/deploy/nginx-http.conf` 仅用于首次 HTTP 引导，不要用它覆盖已经由 Certbot 配置好 TLS 的线上文件。`30-wechat-forwarding.conf` 是公众号官方 API 的受限 SSH 转发配置，与网站内容部署无关。

部署不要求先推送 GitHub。提交、推送、再次修改 DNS／防火墙等外部动作只按当次明确指示执行，不沿用已结束的旧 LDP 任务授权。
