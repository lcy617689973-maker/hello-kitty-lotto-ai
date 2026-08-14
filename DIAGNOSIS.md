# 当前发布包检查

这版发布包包含网站运行和自动更新需要的主要文件：

- `index.html`：网页主界面。
- `assets/hello-kitty-template.png`：扭蛋机图片。
- `assets/lotto-records.json`：历史开奖原始数据。
- `assets/lotto-stats.json`：网页初始统计数据。
- `netlify/functions/lotto-data.mjs`：网页线上读取最新统计数据的接口。
- `netlify/functions/update-lotto-data.mjs`：定时/手动更新 WestLotto 最新数据的接口。
- `netlify/functions/lib/latest-draw.mjs`：抓取并解析最新开奖。
- `netlify/functions/lib/stats.mjs`：重新生成统计数据。
- `netlify.toml`：Netlify 构建、函数目录、定时任务配置。
- `package.json`：Netlify 构建和依赖配置。
- `NETLIFY_DEPLOY.md`：部署和手动补录说明。
- `scripts/rebuild_lotto_stats.py`：本地重建统计数据脚本。

与旧文件夹相比，之前缺少的 `DIAGNOSIS.md` 只是诊断说明文件，不影响网站运行；现在已经补回到最新包里。

当前自动更新策略：

- 周三柏林时间 18:25 后开始尝试更新。
- 周六柏林时间 19:25 后开始尝试更新。
- Netlify 每 5 分钟唤醒一次函数。
- 官方源临时不可用时，函数返回 JSON 状态，不再显示崩溃页。

手动补录格式：

```text
https://你的网站域名/.netlify/functions/update-lotto-data?force=1&date=YYYY-MM-DD&main=1,2,3,4,5,6&super=7
```
