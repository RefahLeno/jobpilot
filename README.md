# JobPilot 求职工作台

JobPilot 是一个面向求职者的 Web 工作台。

用户上传基础简历后，可以做两类分析：

- `单 JD 匹配`：判断当前岗位值不值得投、差距在哪里、下一步怎么改
- `海投优化`：批量导入 JD，自动归类岗位方向，并生成多版本简历建议

当前仓库已经具备内测版主流程，可以作为对外试用版本继续部署上线。

## 当前能力

- PDF / Word 简历上传
- PDF 原样预览、Word 文本预览
- 简历关键词和结构化摘要
- 单 JD 粘贴 / 链接抓取
- 单 JD 匹配评分报告
- 海投模式批量 JD 导入
- JD 聚类与岗位方向分类
- 多版本简历建议与草稿
- Word 导出
- 登录 / 历史记录 / 管理员监控

## 本地启动

### 1. 运行环境

- Node.js `18+`
- Python `3.11+`

### 2. 安装 Python 依赖

```bash
python -m pip install -r requirements.txt
```

### 3. 设置环境变量

参考 [`.env.example`](C:/Users/13058/Documents/Codex/2026-06-25/1-word-pdf-2-3-d/.env.example)：

```text
PORT=4173
DEEPSEEK_API_KEY=your_deepseek_api_key
DEEPSEEK_MODEL=deepseek-v4-flash
ADMIN_EMAILS=1305813360@qq.com
PYTHON_BIN=python3
```

### 4. 启动服务

```bash
npm start
```

浏览器打开：

```text
http://localhost:4173
```

## DeepSeek 接入

如果没有配置 `DEEPSEEK_API_KEY`，系统会使用本地 fallback 逻辑完成关键词提取、聚类和评分流程，方便本地演示。

配置完成后：

- 单 JD 匹配结果优先走 DeepSeek
- DeepSeek 不可用时回退到本地逻辑
- 前端会显示当前结果来源

推荐模型：

```text
deepseek-v4-flash
```

## 生产部署

推荐部署形态：

- 腾讯云轻量应用服务器
- Ubuntu 22.04
- Nginx
- Node.js 单服务
- Python 辅助脚本
- 腾讯云域名解析
- Let's Encrypt HTTPS

当前默认主域名方案：

```text
https://weng1013.cn
```

部署材料已放在 `deploy/` 和 `docs/`：

- [deploy/install-server.sh](C:/Users/13058/Documents/Codex/2026-06-25/1-word-pdf-2-3-d/deploy/install-server.sh)
- [deploy/jobpilot.service](C:/Users/13058/Documents/Codex/2026-06-25/1-word-pdf-2-3-d/deploy/jobpilot.service)
- [deploy/nginx.jobpilot.conf](C:/Users/13058/Documents/Codex/2026-06-25/1-word-pdf-2-3-d/deploy/nginx.jobpilot.conf)
- [deploy/backup-work.sh](C:/Users/13058/Documents/Codex/2026-06-25/1-word-pdf-2-3-d/deploy/backup-work.sh)
- [docs/tencent-cloud-launch.md](C:/Users/13058/Documents/Codex/2026-06-25/1-word-pdf-2-3-d/docs/tencent-cloud-launch.md)
- [docs/deployment-input-checklist.md](C:/Users/13058/Documents/Codex/2026-06-25/1-word-pdf-2-3-d/docs/deployment-input-checklist.md)

## 重要说明

- 当前默认数据存储仍为本地 JSON，适合内测版，不适合长期高并发正式运营
- 扫描版 PDF 暂不支持 OCR
- `.doc` 文件会尽量解析，但正式建议使用 `.docx`
- JD 链接抓取可能被目标网站登录、反爬或动态渲染拦截，失败时请手动粘贴
- 第一版正式承诺的是 Web 使用体验和 Word 导出
