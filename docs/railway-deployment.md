# Railway 部署说明

本文档记录 JobPilot 当前实际采用的上线方案：

```text
GitHub -> Railway -> job.weng1013.cn
```

## 1. GitHub 仓库

当前仓库：

```text
https://github.com/RefahLeno/jobpilot
```

每次修改代码后，推送到 `main` 分支即可触发 Railway 重新部署。

## 2. Railway 项目

在 Railway 中选择：

```text
New Project -> Deploy from GitHub repo -> RefahLeno/jobpilot
```

项目使用 Dockerfile 构建，不再依赖 Nixpacks 自动猜测 Python 环境。

关键文件：

- `Dockerfile`
- `.dockerignore`
- `railway.json`
- `package.json`
- `requirements.txt`

## 3. 环境变量

在 Railway 服务的 `Variables` 中配置：

```text
NODE_ENV=production
COOKIE_SECURE=true
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-chat
ADMIN_EMAILS=your_admin_email@example.com
PYTHON_BIN=/opt/venv/bin/python
```

说明：

- `DEEPSEEK_API_KEY` 不要写入 GitHub 仓库，只放在 Railway Variables。
- `ADMIN_EMAILS` 是管理员邮箱白名单，不是邮箱密码。
- `PYTHON_BIN=/opt/venv/bin/python` 对应 Dockerfile 中创建的 Python 虚拟环境。

## 4. 域名绑定

Railway 服务中添加 Custom Domain：

```text
job.weng1013.cn
```

Railway 会要求在腾讯云 DNSPod 添加两类记录：

```text
CNAME job                  <railway-domain>.up.railway.app
TXT   _railway-verify.job  railway-verify=<value>
```

添加完成后，等待 Railway 显示绿色对勾，并确认浏览器可以访问：

```text
https://job.weng1013.cn
```

## 5. 验收步骤

上线后至少验证：

- 首页访问
- 注册 / 登录
- 上传 PDF / Word 简历
- 粘贴 JD 并生成分析
- 批量导入 JD
- Word 导出
- 手机微信内访问

## 6. 当前风险

当前版本仍使用本地 JSON 文件保存用户、简历、JD、报告和会话数据。该方案适合 MVP 内测，但不适合长期正式运营。

后续建议：

- 接入 PostgreSQL
- 增加持久化文件存储
- 增加频率限制和用量保护
- 增加密码重置流程
- 增加访问日志和错误告警

