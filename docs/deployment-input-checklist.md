# 外网上线检查清单

JobPilot 当前已采用 Railway 部署，并通过腾讯云 DNSPod 绑定自定义域名。

## 已完成

- GitHub 仓库已建立：`https://github.com/RefahLeno/jobpilot`
- Railway 项目已部署成功
- Railway 临时域名可访问
- 自定义域名已绑定：`https://job.weng1013.cn`
- DNSPod 已配置 Railway 要求的 CNAME 和 TXT 记录
- Dockerfile 构建已替代 Nixpacks 自动构建

## Railway 环境变量

生产环境至少需要：

```text
NODE_ENV=production
COOKIE_SECURE=true
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-chat
ADMIN_EMAILS=your_admin_email@example.com
PYTHON_BIN=/opt/venv/bin/python
```

## 上线验收

- 访问 `https://job.weng1013.cn`
- 注册 / 登录
- 上传 PDF / Word 简历
- 粘贴 JD 生成单 JD 分析
- 批量导入 JD 并分类
- 生成简历版本建议
- 导出 Word 文件
- 手机微信内打开链接

## 后续优先事项

1. 小范围内测，收集真实用户反馈。
2. 统计单次分析耗时、AI 成功率、导出成功率。
3. 将 JSON 文件存储迁移到 PostgreSQL。
4. 增加密码找回和用量保护。
5. 根据反馈优化简历解析、JD 抓取和报告结构。

