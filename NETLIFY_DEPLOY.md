# Netlify 发布与 WestLotto 自动更新

## 这次修复了什么

原压缩包的 `netlify.toml` 声明了两个 Functions，但实际压缩包里没有 `netlify/functions/`，也没有 `package.json`。因此网页只能读取静态的 `assets/lotto-stats.json`，不存在任何自动抓取任务。

本修复版已补齐：

- `netlify/functions/lotto-data.mjs`：网页读取 Netlify Blobs 中的最新统计数据。
- `netlify/functions/update-lotto-data.mjs`：定时读取 WestLotto/LOTTO.de 官方最新开奖。
- `netlify/functions/refresh-lotto-data.mjs`：可手动触发一次官方抓取。
- `netlify/functions/_shared/`：官方页面解析、数据持久化和统计重算逻辑。
- `package.json`：安装 `@netlify/blobs` 并保证构建命令存在。
- 修正 JSON 缓存规则，避免备用数据被缓存一年。

## 正确发布方式

### 推荐：GitHub 连接 Netlify

1. 将这个文件夹完整上传到 GitHub 仓库；不要只上传 `index.html` 和 `assets`。
2. 在 Netlify 选择 **Add new project → Import an existing project**。
3. 选择仓库后，Netlify 自动读取 `netlify.toml`：
   - Build command：`npm run build`
   - Publish directory：`.`
   - Functions directory：`netlify/functions`
4. 部署完成后打开 Netlify 的 **Functions** 页面，应该看到：
   - `lotto-data`
   - `refresh-lotto-data`
   - `update-lotto-data`，并显示 **Scheduled** 标记

### 也可以：Netlify CLI

在项目文件夹中运行：

```bash
npx netlify deploy --prod --build
```

仅把文件夹或 ZIP 拖到 Netlify Drop 通常只适合静态站点，不应作为这个带 Functions 的自动更新版本的发布方式。

## 自动更新逻辑

`update-lotto-data` 按 UTC 在每周三、周六的 16:00–20:59 每 10 分钟运行一次。它会：

1. 优先读取环境变量 `LOTTO_LATEST_JSON_URL` 指定的官方 JSON（可选）。
2. 如果未配置或失败，读取 WestLotto 官方 LOTTO 6aus49 开奖页。
3. 如果 WestLotto 失败，再尝试 LOTTO.de。
4. 验证日期、6 个不重复主号码以及 Superzahl。
5. 只有发现新一期或官方数据修正时，才写入 Netlify Blobs 并重新生成统计数据。

## 手动测试

### 测试官方抓取

部署后访问：

```text
https://你的域名/.netlify/functions/refresh-lotto-data
```

返回 `updated`、`corrected` 或 `unchanged` 都表示函数正常执行。

### 手动补录（带保护）

先在 Netlify 的 Environment variables 中添加：

```text
UPDATE_LOTTO_TOKEN=你自己设置的一串长密码
```

然后访问：

```text
https://你的域名/.netlify/functions/refresh-lotto-data?date=2026-07-11&main=1,4,6,20,41,48&super=3&token=你的密码
```

不要公开这个 token。未配置 token 时，手动号码写入默认关闭。

## 可选环境变量

- `LOTTO_LATEST_JSON_URL`：你确认可用的官方开奖 JSON 地址。
- `UPDATE_LOTTO_TOKEN`：保护手动补录接口的密码。

## 检查是否真的自动更新

1. Netlify → Functions → `update-lotto-data`，确认有 **Scheduled** 标记。
2. 查看函数日志，寻找 `Scheduled lotto update result`。
3. 打开：

```text
https://你的域名/.netlify/functions/lotto-data
```

检查 `dateRange.to` 和 `recentDraws` 最后一项。
4. 网页顶部应显示“Netlify 自动更新数据已加载”；如果显示“Westlotto 历史开奖频率已加载”，说明函数读取失败，页面正在使用静态备用 JSON。
