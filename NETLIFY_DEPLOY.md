# Netlify 发布与自动更新

这个版本已经按“长期运营架构”准备好：

官方开奖 → Netlify 定时函数 → 更新数据仓库 → 生成最新 JSON → 网页读取最新 JSON

## 发布

要启用“每周自动更新”，推荐用 Git 或 Netlify CLI 发布。拖拽上传可以预览静态网页，但手动部署不会运行构建命令，因此不适合作为这个自动更新版本的长期发布方式。

### 推荐方式：连接 Git

1. 把这个文件夹上传到 GitHub 或 GitLab 仓库。
2. 在 Netlify 里选择 Add new site → Import an existing project。
3. 连接仓库后，Netlify 会读取 `netlify.toml`：
   - Build command: `npm run build`
   - Publish directory: `.`
   - Functions directory: `netlify/functions`
4. 发布成功后，打开 Netlify 的 Functions 页面，确认能看到：
   - `lotto-data`
   - `update-lotto-data`，并带有 Scheduled 标记

### 也可以：Netlify CLI

在项目文件夹里登录并发布：

```bash
npx netlify deploy --prod --build
```

Netlify CLI 会构建项目并上传静态文件、Functions 和配置。

## 自动更新

网站里已经包含两个 Netlify Functions：

- `lotto-data`：网页读取的最新统计 JSON。
- `update-lotto-data`：每周三、每周六柏林时间 20:00 自动尝试读取官方最新开奖，更新历史数据库，并重新生成冷热号、AI 推荐、AI Score 等统计结果。

为了兼容德国夏令时和冬令时，Netlify 会在 UTC 18:00 和 19:00 的 0 / 15 / 30 / 45 分唤醒，函数内部只会在柏林时间 20 点这一小时真正更新。这样官方数据晚几分钟发布也能自动补上。

## 官方数据源

建议在 Netlify 的 Site settings → Environment variables 里添加：

`LOTTO_LATEST_JSON_URL`

这里可以填 Westlotto 或 LOTTO.de 的官方开奖 JSON 地址。如果官方页面结构变化，函数会先用这个地址；没有配置时，会尝试自动解析官方开奖页面。解析失败时不会覆盖旧数据，网站会继续显示上一版稳定数据。

如果想手动测试一次，可以在 Environment variables 里临时添加：

`FORCE_LOTTO_UPDATE=true`

然后到 Netlify Functions 页面手动运行 `update-lotto-data`。测试完成后建议删除这个变量，避免非开奖时间也更新。
