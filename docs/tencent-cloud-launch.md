# 腾讯云内测版上线说明

本文档用于把 JobPilot 部署到腾讯云轻量应用服务器，并通过 `https://weng1013.cn` 对外访问。

## 1. 准备资源

- 腾讯云轻量应用服务器
  - 推荐配置：`2 核 4G`
  - 系统：`Ubuntu 22.04`
- 域名：`weng1013.cn`
- DeepSeek API Key

## 2. 域名解析

在腾讯云 DNS 解析里新增一条记录：

- 主机记录：`@`
- 记录类型：`A`
- 记录值：你的服务器公网 IP

如果你后续想把主站放到子域名，也可以改成：

- 主机记录：`job`
- 最终访问地址：`https://job.weng1013.cn`

当前这份文档默认主站直接使用：

```text
https://weng1013.cn
```

## 3. 服务器初始化

登录服务器后：

```bash
sudo apt update
sudo apt install -y git
```

把仓库拉到服务器：

```bash
cd /var/www
sudo mkdir -p jobpilot
sudo chown -R $USER:$USER /var/www/jobpilot
git clone https://github.com/RefahLeno/jobpilot.git /var/www/jobpilot
cd /var/www/jobpilot
```

执行基础环境安装：

```bash
bash deploy/install-server.sh
```

## 4. 安装依赖

```bash
cd /var/www/jobpilot
npm install
python3 -m pip install -r requirements.txt
```

## 5. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`，至少填写这些：

```text
PORT=4173
NODE_ENV=production
COOKIE_SECURE=true
DEEPSEEK_API_KEY=你的新 DeepSeek Key
DEEPSEEK_MODEL=deepseek-v4-flash
ADMIN_EMAILS=1305813360@qq.com
PYTHON_BIN=python3
```

说明：

- 建议把你之前发过的旧 key 作废，重新生成一个新的
- `COOKIE_SECURE=true` 只在 HTTPS 已接通后使用

## 6. 配置 systemd

复制服务文件：

```bash
sudo cp deploy/jobpilot.service /etc/systemd/system/jobpilot.service
```

默认服务用户是 `ubuntu`。如果你的登录用户不是 `ubuntu`，先修改 `deploy/jobpilot.service` 里的 `User` 和 `Group`，然后执行：

```bash
sudo systemctl daemon-reload
sudo systemctl enable jobpilot
sudo systemctl start jobpilot
sudo systemctl status jobpilot
```

## 7. 配置 Nginx

复制配置：

```bash
sudo cp deploy/nginx.jobpilot.conf /etc/nginx/sites-available/jobpilot
```

因为我们已经把模板改成 `weng1013.cn`，如果你最终就用主域名，可以直接启用：

```bash
sudo ln -sf /etc/nginx/sites-available/jobpilot /etc/nginx/sites-enabled/jobpilot
sudo nginx -t
sudo systemctl reload nginx
```

如果你改用 `job.weng1013.cn`，记得先把 `server_name` 改掉再重载 Nginx。

## 8. 申请 HTTPS

主域名方案：

```bash
sudo certbot --nginx -d weng1013.cn
```

如果你用子域名方案：

```bash
sudo certbot --nginx -d job.weng1013.cn
```

完成后访问：

```text
https://weng1013.cn
```

## 9. 上线验收

至少完成这些检查：

- 首页可以打开
- 注册 / 登录可用
- 上传 PDF / Word 可用
- 单 JD 分析可用
- 海投批量导入可用
- Word 导出可下载
- 管理员监控页仅管理员可见
- DeepSeek 联调正常

## 10. 备份与维护

手动执行一次备份：

```bash
bash deploy/backup-work.sh
```

建议加一个每日备份任务：

```bash
0 3 * * * /bin/bash /var/www/jobpilot/deploy/backup-work.sh >> /var/log/jobpilot-backup.log 2>&1
```

## 11. 当前版本边界

这版适合作为内测版：

- 数据仍保存在本地 JSON 文件
- 扫描版 PDF 暂不支持 OCR
- JD 抓取仍可能被目标站点登录、反爬或动态渲染拦截
- 第一版正式承诺的是 Web 使用体验和 Word 导出
