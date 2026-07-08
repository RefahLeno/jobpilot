# JobPilot 求职工作台

JobPilot 是一个面向求职者的 AI 求职工作台，帮助用户把简历和岗位 JD 放在一起分析，判断岗位匹配度、定位简历缺口，并生成针对性的优化建议。

当前项目已完成 MVP 上线闭环：

- 线上访问地址：`https://job.weng1013.cn`
- GitHub 仓库：`https://github.com/RefahLeno/jobpilot`
- 部署平台：Railway
- 域名解析：腾讯云 DNSPod

## 核心能力

- 账号注册 / 登录
- PDF / Word 简历上传与文本解析
- 简历关键词、摘要与结构化信息提取
- 单 JD 粘贴或链接抓取
- 单 JD 匹配评分报告
- 批量 JD 导入与岗位方向分类
- 多版本简历建议与草稿生成
- Word 简历导出
- 历史记录、版本管理与管理员监控

## 产品链路

### 单 JD 精投

```text
上传简历 -> 粘贴/抓取 JD -> 匹配评分 -> 缺口分析 -> 优化建议 -> 导出结果
```

适合判断某一个岗位是否值得投递，以及应该如何针对性修改简历。

### 批量海投优化

```text
上传基础简历 -> 批量导入 JD -> 岗位方向分类 -> 生成多版本简历建议 -> 导出版本
```

适合同时投递多个相近岗位时，拆出不同方向的简历版本。

## 技术方案

- 前端：原生 HTML / CSS / JavaScript
- 后端：Node.js HTTP 服务
- 文件解析：Python 脚本
  - PDF：`pdfminer.six`
  - Word：`python-docx`
- AI 分析：DeepSeek API
- 兜底策略：本地规则、关键词匹配、向量/规则证据片段
- 数据存储：本地 JSON 文件，位于 `work/data`
- 部署：Dockerfile + Railway
- 自定义域名：`job.weng1013.cn`

## 本地启动

### 1. 安装依赖

```bash
npm install
python -m pip install -r requirements.txt
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local`，至少配置：

```text
PORT=4173
NODE_ENV=development
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-chat
ADMIN_EMAILS=your_admin_email@example.com
PYTHON_BIN=python
```

如果不配置 `DEEPSEEK_API_KEY`，系统会使用本地规则生成兜底分析结果。

### 3. 启动服务

```bash
npm start
```

浏览器打开：

```text
http://localhost:4173
```

## Railway 部署

项目已包含 Railway 部署配置：

- `Dockerfile`
- `.dockerignore`
- `railway.json`

Railway 会使用 Dockerfile 构建镜像，安装 Node.js、Python、pip 和 `requirements.txt` 中的 Python 依赖。

Railway 生产环境建议配置：

```text
NODE_ENV=production
COOKIE_SECURE=true
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-chat
ADMIN_EMAILS=your_admin_email@example.com
PYTHON_BIN=/opt/venv/bin/python
```

部署后绑定自定义域名：

```text
job.weng1013.cn
```

DNSPod 中按 Railway 提供的记录配置：

- `CNAME job -> <railway-domain>.up.railway.app`
- `TXT _railway-verify.job -> railway-verify=<value>`

详细步骤见 [docs/railway-deployment.md](C:/Users/13058/Documents/jobpilot/docs/railway-deployment.md)。

## 当前版本边界

- 当前数据默认保存在 Railway 容器文件系统的 JSON 文件中，适合 MVP 内测，不适合作为长期高并发生产数据方案。
- Railway 重新部署或容器重建后，本地文件型数据可能存在丢失风险；后续建议迁移到 PostgreSQL。
- 扫描版 PDF 暂不保证 OCR 识别效果。
- JD 链接抓取可能被目标网站登录、反爬或动态渲染拦截，失败时请手动粘贴 JD 文本。
- DeepSeek 不可用时，系统会自动切换为本地规则兜底结果。

## 上线验收清单

- 首页可以通过 `https://job.weng1013.cn` 打开
- 注册 / 登录可用
- PDF / Word 简历上传可用
- 单 JD 分析可用
- 批量 JD 导入和分类可用
- Word 导出可下载
- DeepSeek 联调正常
- 手机微信内打开链接正常

