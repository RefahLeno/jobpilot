const $ = (id) => document.getElementById(id);

function formatTimeLabel(value) {
  if (!value) return "未知时间";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "未知时间";
  return date.toLocaleString("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error((await response.text()) || "请求失败");
  }
  const data = await response.json();
  if (!response.ok || data.status === "error") {
    const error = new Error(data.message || data.error || "请求失败");
    error.payload = data;
    throw error;
  }
  return data;
}

function renderStatus(message, type = "warn") {
  const el = $("adminStatusNote");
  if (!message) {
    el.textContent = "";
    el.className = "admin-status-note hidden";
    return;
  }
  el.textContent = message;
  el.className = `admin-status-note ${type}`;
}

function renderOverview(overview = {}) {
  $("adminOverviewGrid").innerHTML = `
    <article class="usage-summary-card">
      <small>总请求数</small>
      <strong>${overview.totalRequests ?? 0}</strong>
      <span>最近读取窗口内累计</span>
    </article>
    <article class="usage-summary-card">
      <small>失败请求数</small>
      <strong>${overview.failedRequests ?? 0}</strong>
      <span>状态码大于等于 400</span>
    </article>
    <article class="usage-summary-card">
      <small>超额次数</small>
      <strong>${overview.quotaExceededCount ?? 0}</strong>
      <span>命中过额度限制</span>
    </article>
    <article class="usage-summary-card">
      <small>最近 24 小时请求</small>
      <strong>${overview.last24hRequests ?? 0}</strong>
      <span>近 24 小时活跃情况</span>
    </article>
  `;
}

function renderRequestList(items = []) {
  const container = $("adminRecentRequests");
  if (!items.length) {
    container.innerHTML = `<div class="support-empty">当前没有可展示的请求日志。</div>`;
    return;
  }
  container.innerHTML = items.map((item) => `
    <article class="admin-log-card ${Number(item.statusCode || 0) >= 400 ? "error" : ""}">
      <div class="admin-log-top">
        <strong>${item.path || "未知接口"}</strong>
        <span>${formatTimeLabel(item.timestamp)}</span>
      </div>
      <p>状态码 ${item.statusCode ?? "--"} · ${item.durationMs ?? "--"}ms</p>
      <small>${item.userId || "匿名 / 未识别用户"}${item.errorCode ? ` · ${item.errorCode}` : ""}</small>
    </article>
  `).join("");
}

function renderErrorList(items = []) {
  const container = $("adminRecentErrors");
  if (!items.length) {
    container.innerHTML = `<div class="support-empty">当前没有可展示的错误日志。</div>`;
    return;
  }
  container.innerHTML = items.map((item) => `
    <article class="admin-log-card error">
      <div class="admin-log-top">
        <strong>${item.kind || "未知错误"}</strong>
        <span>${formatTimeLabel(item.timestamp)}</span>
      </div>
      <p>${item.message || item.errorCode || "暂无详细信息"}</p>
      <small>${item.userId || "未关联用户"}${item.errorCode ? ` · ${item.errorCode}` : ""}</small>
    </article>
  `).join("");
}

function renderBreakdown(containerId, items = [], keyName) {
  const container = $(containerId);
  if (!items.length) {
    container.innerHTML = `<div class="support-empty">当前没有可展示的分布统计。</div>`;
    return;
  }
  container.innerHTML = items.map((item) => `
    <article class="admin-breakdown-card">
      <strong>${item[keyName] || "未知项"}</strong>
      <span>${item.count ?? 0} 次</span>
    </article>
  `).join("");
}

renderOverview = function renderOverviewWithAiMetrics(overview = {}) {
  $("adminOverviewGrid").innerHTML = `
    <article class="usage-summary-card">
      <small>总请求数</small>
      <strong>${overview.totalRequests ?? 0}</strong>
      <span>最近读取窗口内累计</span>
    </article>
    <article class="usage-summary-card">
      <small>失败请求数</small>
      <strong>${overview.failedRequests ?? 0}</strong>
      <span>状态码大于等于 400</span>
    </article>
    <article class="usage-summary-card">
      <small>超额次数</small>
      <strong>${overview.quotaExceededCount ?? 0}</strong>
      <span>命中过额度限制</span>
    </article>
    <article class="usage-summary-card">
      <small>最近 24 小时请求</small>
      <strong>${overview.last24hRequests ?? 0}</strong>
      <span>最近 24 小时活跃情况</span>
    </article>
    <article class="usage-summary-card">
      <small>AI 请求数</small>
      <strong>${overview.aiRequests ?? 0}</strong>
      <span>模型、OCR、抓取和向量事件</span>
    </article>
    <article class="usage-summary-card">
      <small>AI 失败/回退</small>
      <strong>${overview.aiFailures ?? 0}</strong>
      <span>失败、fallback 或错误状态</span>
    </article>
    <article class="usage-summary-card">
      <small>向量缓存命中率</small>
      <strong>${Math.round(Number(overview.cacheHitRate || 0) * 100)}%</strong>
      <span>简历/JD chunk 复用情况</span>
    </article>
    <article class="usage-summary-card">
      <small>用户行为事件</small>
      <strong>${overview.userEvents ?? 0}</strong>
      <span>上传、粘贴、分析、导出等行为</span>
    </article>
  `;
};

async function bootstrap() {
  try {
    const auth = await fetch("/api/auth/me").then(parseResponse);
    if (!auth.user?.isAdmin) {
      renderStatus("当前账号没有管理员权限，无法查看监控页。", "warn");
      return;
    }

    const data = await fetch("/api/admin/monitor").then(parseResponse);
    renderStatus("", "info");
    renderOverview(data.overview || {});
    renderRequestList(data.recentRequests || []);
    renderErrorList(data.recentErrors || []);
    renderBreakdown("adminRequestBreakdown", data.requestBreakdown || [], "path");
    renderBreakdown("adminErrorBreakdown", data.errorBreakdown || [], "kind");
  } catch (error) {
    const code = error?.payload?.error;
    if (code === "auth_required") {
      renderStatus("请先登录管理员账号，再查看监控页。", "warn");
      return;
    }
    if (code === "admin_forbidden") {
      renderStatus("当前账号不是管理员，无法访问这套监控。", "warn");
      return;
    }
    renderStatus(error.message || "监控数据加载失败。", "warn");
  }
}

bootstrap();
