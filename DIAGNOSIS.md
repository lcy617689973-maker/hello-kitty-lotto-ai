# 原压缩包故障诊断

原文件清单只有 7 个文件：`index.html`、`netlify.toml`、说明文档、图片、两个 JSON 和 Python 重建脚本。

关键缺失：

1. `netlify/functions/lotto-data.*` 不存在。
2. `netlify/functions/update-lotto-data.*` 不存在。
3. `package.json` 不存在，但 `netlify.toml` 却执行 `npm run build`。
4. `netlify.toml` 指定的 Functions 目录不存在。
5. 页面访问 `/.netlify/functions/lotto-data` 必然失败，然后静默回退到静态 JSON。
6. `/assets/*` 的一年 immutable 缓存规则可能让静态 JSON 长期保持旧版本。
7. 旧说明把 Scheduled Function 写成可以通过 URL 手动补录；Netlify 生产环境中的 Scheduled Function 不能直接通过 URL 调用，因此修复版增加了独立的同步函数 `refresh-lotto-data`。

结论：不是 WestLotto 自动读取“偶尔失效”，而是这次迭代生成 ZIP 时把整套后端文件漏掉了，只保留了前端读取入口和文字说明。
