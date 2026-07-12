const state = {
  mode: "single",
  resumeId: "",
  resumeText: "",
  jdText: "",
  jdSourceUrl: "",
  resumeSummary: null,
  resumeKeywordGroups: [],
  reportId: "",
  batchRunId: "",
  batchDraftJds: [],
  batchJds: [],
  clusters: [],
  variants: [],
  analysis: null,
  resumeLibrary: [],
  recentHistory: [],
  usageCenter: null,
  detailView: null,
  auth: {
    user: null,
    status: "idle",
    modalMode: "login",
    error: "",
  },
  ui: {
    uploadStatus: "idle",
    singleStatus: "idle",
    batchStatus: "idle",
    reportError: "",
    batchFailures: [],
    jdManualTracked: false,
  },
};

const modeMeta = {
  single: {
    title: "当前是单 JD 匹配",
    text: "适合判断某一个岗位值不值得投、你的简历差在哪里，以及应该怎么针对性修改。",
    badge: "精投",
    heroPrimaryLabel: "开始单 JD 分析",
    heroSecondaryLabel: "切到海投优化",
    quickActions: [
      { label: "上传简历", target: "workspace" },
      { label: "填写 JD", target: "jdSection" },
      { label: "查看报告", target: "reportSection" },
    ],
  },
  batch: {
    title: "当前是海投优化",
    text: "适合处理一批岗位，把它们分成几个方向，再为每个方向整理对应的简历版本策略。",
    badge: "海投",
    heroPrimaryLabel: "开始批量分析",
    heroSecondaryLabel: "切到单 JD 匹配",
    quickActions: [
      { label: "批量导入", target: "batchImportSection" },
      { label: "岗位分类", target: "clusterSection" },
      { label: "简历版本", target: "variantSection" },
    ],
  },
};

const $ = (id) => document.getElementById(id);
const storageKeys = {
  resumeId: "jobpilot.resumeId",
  reportId: "jobpilot.reportId",
  batchRunId: "jobpilot.batchRunId",
};

function toast(message, type = "info") {
  const el = $("toast");
  el.textContent = message;
  el.className = `toast ${type}`;
  setTimeout(() => {
    el.className = "toast hidden";
  }, 3200);
}

function setLoading(button, loading, label) {
  button.disabled = loading;
  button.dataset.original ||= button.textContent;
  button.textContent = loading ? label : button.dataset.original;
}

function getSaved(key) {
  try {
    return window.localStorage.getItem(key) || "";
  } catch {
    return "";
  }
}

function saveValue(key, value) {
  try {
    if (value) window.localStorage.setItem(key, value);
    else window.localStorage.removeItem(key);
  } catch {
    // noop
  }
}

function getJson(url) {
  return fetch(url).then(parseResponse);
}

async function parseResponse(response) {
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await response.text();
    throw new Error(text || "请求失败");
  }

  const data = await response.json();
  if (!response.ok || data.status === "error") {
    const error = new Error(data.message || data.error || "请求失败");
    error.payload = data;
    throw error;
  }
  return data;
}

function postJson(url, body) {
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then(parseResponse);
}

function trackEvent(event, payload = {}) {
  postJson("/api/events", { event, payload }).catch(() => {});
}

function setAuthStatus(message, type = "info") {
  setStatusNote("authStatusNote", type, message);
}

function updateAuthModalCopy() {
  const isRegister = state.auth.modalMode === "register";
  $("authEyebrow").textContent = isRegister ? "创建账号" : "账号入口";
  $("authTitle").textContent = isRegister ? "注册后继续" : "登录后继续";
  $("authSubtitle").textContent = isRegister
    ? "注册后，你的简历、报告、海投批次和版本都会只归你自己查看。"
    : "登录后，你的简历、报告、海投批次和版本都会只归你自己查看。";
  $("authSubmitBtn").textContent = isRegister ? "注册并继续" : "登录并继续";
  $("authSwitchText").textContent = isRegister ? "已经有账号？" : "还没有账号？";
  $("authSwitchBtn").textContent = isRegister ? "去登录" : "去注册";
  $("authPassword").setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
}

function renderAuthEntry() {
  const container = $("authEntry");
  const user = state.auth.user;
  if (!container) return;
  if (!user) {
    container.innerHTML = `
      <button class="nav-link-btn" id="openLoginBtn" type="button">登录</button>
      <button class="nav-link-btn" id="openRegisterBtn" type="button">注册</button>
    `;
    return;
  }
  container.innerHTML = `
    ${user.isAdmin ? `<a class="nav-link-btn admin-link-btn" href="/admin-monitor.html">管理员监控</a>` : ""}
    <span class="auth-pill">${user.email}</span>
    <button class="nav-link-btn" id="logoutBtn" type="button">退出登录</button>
  `;
}

function getQuotaSummary(user = state.auth.user) {
  return user?.quotaSummary || null;
}

function renderAuthQuotaPanel() {
  const panel = $("authQuotaPanel");
  if (!panel) return;
  const summary = getQuotaSummary();
  if (!summary) {
    panel.className = "auth-quota-panel hidden";
    panel.innerHTML = "";
    return;
  }
  panel.className = "auth-quota-panel";
  panel.innerHTML = `
    <div class="auth-quota-head">
      <strong>当前额度</strong>
      <span>${summary.plan} 方案</span>
    </div>
    <div class="auth-quota-grid">
      <article class="auth-quota-item">
        <small>单 JD 剩余额度</small>
        <strong>${summary.remaining.singleAnalysis}</strong>
        <span>已用 ${summary.used.singleAnalysisUsed} / ${summary.limits.singleAnalysis}</span>
      </article>
      <article class="auth-quota-item">
        <small>海投批次额度</small>
        <strong>${summary.remaining.batchRuns}</strong>
        <span>已用 ${summary.used.batchRunsUsed} / ${summary.limits.batchRuns}</span>
      </article>
      <article class="auth-quota-item">
        <small>导出额度</small>
        <strong>${summary.remaining.exports}</strong>
        <span>已用 ${summary.used.exportsUsed} / ${summary.limits.exports}</span>
      </article>
    </div>
  `;
}

function openAuthModal(mode = "login", message = "") {
  state.auth.modalMode = mode;
  state.auth.error = "";
  $("authModal").classList.remove("hidden");
  $("authModal").setAttribute("aria-hidden", "false");
  updateAuthModalCopy();
  setAuthStatus(message, message ? "info" : "info");
  if (!message) setAuthStatus("", "info");
  setTimeout(() => $("authEmail").focus(), 0);
}

function closeAuthModal() {
  $("authModal").classList.add("hidden");
  $("authModal").setAttribute("aria-hidden", "true");
  setAuthStatus("", "info");
}

async function loadAuth() {
  state.auth.status = "loading";
  try {
    const data = await getJson("/api/auth/me");
    state.auth.user = data.user || null;
    state.auth.status = "ready";
  } catch {
    state.auth.user = null;
    state.auth.status = "guest";
  }
  renderAuthEntry();
  renderAuthQuotaPanel();
  renderUsageCenter();
}

async function submitAuth(event) {
  event.preventDefault();
  const email = $("authEmail").value.trim();
  const password = $("authPassword").value;
  if (!email || !password) {
    setAuthStatus("请先填写邮箱和密码。", "warn");
    return;
  }
  const btn = $("authSubmitBtn");
  setLoading(btn, true, state.auth.modalMode === "register" ? "注册中..." : "登录中...");
  try {
    const data = await postJson(
      state.auth.modalMode === "register" ? "/api/auth/register" : "/api/auth/login",
      { email, password }
    );
    state.auth.user = data.user || null;
    state.auth.status = "ready";
    renderAuthEntry();
    renderAuthQuotaPanel();
    closeAuthModal();
    await Promise.all([loadResumeLibrary(), loadRecentHistory(), loadUsageCenter()]);
    toast(data.message || "已完成登录");
  } catch (error) {
    state.auth.error = handleUiError(error, { toast: false, statusNoteId: "authStatusNote" });
  } finally {
    setLoading(btn, false);
  }
}

async function logout() {
  try {
    const data = await postJson("/api/auth/logout", {});
    state.auth.user = null;
    state.auth.status = "guest";
    state.resumeLibrary = [];
    state.recentHistory = [];
    state.usageCenter = null;
    state.detailView = null;
    renderAuthEntry();
    renderAuthQuotaPanel();
    renderResumeLibrary();
    renderRecentHistory();
    renderUsageCenter();
    renderDetailPanel();
    toast(data.message || "已退出登录");
  } catch (error) {
    handleUiError(error);
  }
}

function requireAuthAction(message = "请先登录后再继续。") {
  if (state.auth.user) return true;
  openAuthModal("login", message);
  return false;
}

function setStatusNote(id, type, message) {
  const el = $(id);
  if (!message) {
    el.textContent = "";
    el.className = "status-note hidden";
    return;
  }
  el.textContent = message;
  el.className = `status-note ${type}`;
}

function renderChips(container, items, empty = "等待提取") {
  container.innerHTML = "";
  const list = (items || []).filter(Boolean);
  if (!list.length) {
    const span = document.createElement("span");
    span.className = "empty-chip";
    span.textContent = empty;
    container.appendChild(span);
    return;
  }

  for (const item of list) {
    const chip = document.createElement("span");
    chip.className = "chip";
    chip.textContent = item;
    container.appendChild(chip);
  }
}

function renderList(el, items, empty) {
  el.innerHTML = "";
  const list = items || [];
  if (!list.length && empty) {
    const li = document.createElement("li");
    li.textContent = empty;
    el.appendChild(li);
    return;
  }

  for (const item of list) {
    const li = document.createElement("li");
    li.textContent = item;
    el.appendChild(li);
  }
}

function normalizeDimensionName(name) {
  return String(name || "").trim();
}

function weakDimensionFix(name) {
  const label = normalizeDimensionName(name);
  if (label.includes("行业")) return "先补行业场景、业务对象和目标用户表达。";
  if (label.includes("岗位")) return "先把 JD 中的岗位职责写进最相关经历。";
  if (label.includes("技能")) return "先把 JD 高频技能词写进摘要和项目经历。";
  if (label.includes("经验")) return "先强化与你目标岗位最相关的经历表达。";
  if (label.includes("方向")) return "先突出与你投递方向最一致的项目和成果。";
  if (label.includes("薪资")) return "先确认薪资期望和岗位层级是否匹配。";
  if (label.includes("城市")) return "先确认城市、远程或到岗条件是否匹配。";
  if (label.includes("职责")) return "先重写最相关项目成果与职责表述。";
  if (label.includes("教育") || label.includes("证书") || label.includes("附加")) return "先补足硬性要求和可证明信息。";
  return "先补最影响匹配度的核心要求";
}

function deriveReportInsights(analysis) {
  const dimensions = analysis?.dimensions || [];
  const reasons = analysis?.reasons || [];
  const matches = analysis?.matches || [];
  const gaps = analysis?.gaps || [];
  const nextSteps = analysis?.priorityActions?.length ? analysis.priorityActions : (analysis?.nextSteps || []);
  const score = Number(analysis?.score || 0);
  const weakest = dimensions
    .map((item) => ({
      ...item,
      ratio: item?.max ? item.score / item.max : 0,
    }))
    .sort((a, b) => a.ratio - b.ratio)[0];

  const risk = score >= 80
    ? { label: "低风险", badge: "可直接投递", className: "low" }
    : score >= 60
      ? { label: "中风险", badge: "建议优化后投递", className: "medium" }
      : { label: "高风险", badge: "建议先补改", className: "high" };

  const fixes = [];
  if (weakest?.name) fixes.push(weakDimensionFix(weakest.name));
  if (gaps[0]) fixes.push(`先补 ${gaps[0]} 相关表述`);
  if (nextSteps[0]) fixes.push(nextSteps[0].replace(/銆?/u, ""));

  const topFixes = [...new Set(fixes.filter(Boolean))].slice(0, 3);
  const weakDimensionText = weakest?.name
    ? `当前最弱的是“${weakest.name}”，${reasons[0] || "建议优先补齐这一块的表达。"}`
    : "完成分析后，这里会告诉你最需要优先补改的方向。";

  return {
    topFixes,
    risk,
    gapCount: gaps.length,
    strengthCount: matches.length,
    primaryWeakDimension: weakest?.name || "待分析",
    weakDimensionText,
  };
}

function renderTopFixes(items) {
  const container = $("topFixes");
  container.innerHTML = "";
  const list = items?.length ? items : ["完成分析后，这里会出现优先补改项"];
  list.forEach((item, index) => {
    const chip = document.createElement("span");
    chip.className = `fix-pill${items?.length ? "" : " empty"}`;
    chip.textContent = items?.length ? `${index + 1}. ${item}` : item;
    container.appendChild(chip);
  });
}

function renderReportGuidance(analysis) {
  const insights = deriveReportInsights(analysis || {});
  $("reportHeadline").textContent = insights.topFixes[0] || analysis?.recommendation || "先上传简历并填写 JD。";
  $("riskLevel").textContent = insights.risk.label;
  $("riskBadge").textContent = insights.risk.badge;
  $("riskBadge").className = `risk-badge ${insights.risk.className}`;
  $("weakDimensionText").textContent = insights.weakDimensionText;
  $("weakDimensionLabel").textContent = insights.primaryWeakDimension;
  $("gapCount").textContent = `${insights.gapCount} 项`;
  $("strengthCount").textContent = `${insights.strengthCount} 项`;
  renderTopFixes(insights.topFixes);
}

function renderSummary(target, summary) {
  if (!summary) return;
  const lines = [
    summary.overview || "",
    "",
    ...(summary.sections || []).map((section) => `${section.label}：${section.value || "待补充"}`),
  ].filter(Boolean);
  target.textContent = lines.join("\n");
}

function scrollToSection(targetId) {
  const el = $(targetId);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderModeActions(mode) {
  const container = $("modeActions");
  container.innerHTML = "";
  for (const item of modeMeta[mode].quickActions) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "nav-link-btn";
    button.textContent = item.label;
    button.dataset.target = item.target;
    container.appendChild(button);
  }
}

function updateModeContext(mode) {
  const meta = modeMeta[mode];
  $("modeContextTitle").textContent = meta.title;
  $("modeContextText").textContent = meta.text;
  $("modeContextBadge").textContent = meta.badge;
  $("heroPrimaryBtn").textContent = meta.heroPrimaryLabel;
  $("heroSecondaryBtn").textContent = meta.heroSecondaryLabel;
  $("singlePreviewCard").classList.toggle("hidden", mode !== "single");
  $("batchPreviewCard").classList.toggle("hidden", mode !== "batch");
}

function switchMode(mode, options = {}) {
  state.mode = mode;
  $("singleMode").classList.toggle("hidden", mode !== "single");
  $("batchMode").classList.toggle("hidden", mode !== "batch");
  $("singleModeBtn").classList.toggle("active", mode === "single");
  $("batchModeBtn").classList.toggle("active", mode === "batch");
  renderModeActions(mode);
  updateModeContext(mode);

  if (options.scroll) {
    scrollToSection(mode === "single" ? "workspace" : "batchImportSection");
  }
}

function handleUiError(error, options = {}) {
  const payload = error?.payload || {};
  const message = localizeReportText(payload.message || error.message || "操作失败，请稍后重试。");
  if (options.toast !== false) toast(message, options.type || "warn");
  if (options.statusNoteId) {
    const detail = payload.detail ? `${message} ${localizeReportText(payload.detail)}` : message;
    setStatusNote(options.statusNoteId, "warn", detail);
  }
  return message;
}

function renderResumePanel() {
  const hasResume = Boolean(state.resumeText);
  $("resumePreview").classList.toggle("hidden", hasResume && $("pdfPreview").src && $("pdfPreview").dataset.active === "true");
  if (!hasResume && $("pdfPreview").dataset.active !== "true") {
    $("resumePreview").textContent = "简历内容会显示在这里。";
  }
}

function renderUploadState(message, type = "info") {
  setStatusNote("resumeStatusNote", type, localizeReportText(message));
}

function renderReportState(message, type = "info") {
  setStatusNote("reportStatusNote", type, localizeReportText(message));
}

function renderBatchState(message, type = "info") {
  setStatusNote("batchStatusNote", type, localizeReportText(message));
}

function renderKeywordGroups(container, groups) {
  container.innerHTML = "";
  const list = Array.isArray(groups) ? groups.filter((group) => group?.items?.length) : [];
  if (!list.length) return;

  list.forEach((group) => {
    const block = document.createElement("section");
    block.className = "keyword-group";
    block.innerHTML = `
      <div class="keyword-group-label">${group.label || group.key || "关键词分组"}</div>
      <div class="chips">${group.items.map((item) => `<span class="chip">${item}</span>`).join("")}</div>
    `;
    container.appendChild(block);
  });
}

const chunkLabelText = {
  requirements: "任职要求",
  responsibilities: "岗位职责",
  compensation: "薪资条件",
  location: "城市地点",
  overview: "岗位概览",
  education: "教育背景",
  skill: "工具技能",
  skills: "工具技能",
  project: "项目经历",
  projects: "项目经历",
  internship: "实习/工作经历",
  experience: "实习/工作经历",
  campus: "校园经历",
  summary: "个人总结",
  profile: "个人简介",
  resume: "简历",
  jd: "岗位 JD",
};

function displayChunkLabel(label, fallback = "内容片段") {
  const key = String(label || "").replace(/-\d+$/, "");
  return chunkLabelText[key] || label || fallback;
}

function localizeReportText(text) {
  return String(text || "")
    .replace(/Resume parsed successfully\.?/gi, "简历解析成功。")
    .replace(/Resume parsed with OCR status\.?/gi, "简历已解析，并返回 OCR 状态。")
    .replace(/JD fetched successfully\.?/gi, "JD 获取成功。")
    .replace(/Please log in first\.?/gi, "请先登录后再继续。")
    .replace(/Not logged in\.?/gi, "请先登录后再继续。")
    .replace(/Method not allowed\.?/gi, "当前请求方法不支持。")
    .replace(/Server error\.?/gi, "服务器出现异常。")
    .replace(/Untitled resume/gi, "未命名简历")
    .replace(/Untitled JD/gi, "未命名 JD")
    .replace(/"requirements"/g, "“任职要求”")
    .replace(/"responsibilities"/g, "“岗位职责”")
    .replace(/"education"/g, "“教育背景”")
    .replace(/"skill"/g, "“工具技能”")
    .replace(/"skills"/g, "“工具技能”")
    .replace(/"project"/g, "“项目经历”")
    .replace(/"projects"/g, "“项目经历”")
    .replace(/"internship"/g, "“实习/工作经历”")
    .replace(/"experience"/g, "“实习/工作经历”")
    .replace(/requirements/g, "任职要求")
    .replace(/responsibilities/g, "岗位职责")
    .replace(/education/g, "教育背景")
    .replace(/skills?/g, "工具技能")
    .replace(/projects?/g, "项目经历")
    .replace(/internship/g, "实习经历")
    .replace(/experience/g, "经历");
}

function localizeBatchText(text) {
  return String(text || "")
    .replace(/These JDs repeatedly emphasize/gi, "这些 JD 反复强调")
    .replace(/Designed for (.+?), covering (\d+) JDs? with an average match score of (\d+)\.?/gi, "面向$1方向，覆盖 $2 条 JD，平均匹配分为 $3 分。")
    .replace(/Only add (.+?) if it is backed by real experience\.?/gi, "仅在具备真实经历支撑时添加$1。")
    .replace(/This direction is already close to the base resume\. Double-check metrics and claims before sending\.?/gi, "该方向与基础简历已经较为接近，投递前请再次核对数据和表述。")
    .replace(/This version highlights (.+?) for (.+?) opportunities\.?/gi, "该版本重点突出$1，以匹配$2方向的岗位机会。")
    .replace(/Rewrite the profile summary around (.+?) and highlight (.+?)\.?/gi, "围绕$1方向改写个人摘要，并突出$2。")
    .replace(/Move the most relevant projects upward and use outcome-focused bullet points\.?/gi, "将最相关的项目经历前置，并使用突出成果的要点表述。")
    .replace(/Reuse responsibility language from (.+?)\.?/gi, "参考$1中的岗位职责用语进行改写。")
    .replace(/Push unrelated content lower so the most relevant experience gets more space\.?/gi, "将关联度较低的内容后移，为最相关的经历留出更多篇幅。")
    .replace(/Rewrite the summary so it sounds like the target direction, not a generic background\.?/gi, "改写个人摘要，使其突出目标方向，而不是泛泛描述个人背景。")
    .replace(/Reorder the skills section using the most repeated JD terms first\.?/gi, "根据 JD 中出现频率重新排列技能，优先展示高频词。")
    .replace(/Prioritize the top 2-3 projects that best match this direction\.?/gi, "优先展示与该方向最匹配的 2–3 个项目。")
    .replace(/Add verified scale, efficiency, revenue, growth, or launch outcomes where possible\.?/gi, "尽可能补充经过核实的规模、效率、收入、增长或上线成果。")
    .replace(/tailored draft/gi, "定向简历草稿")
    .replace(/resume[-\s]?variant/gi, "简历版本")
    .replace(/\bvariant\b/gi, "版本")
    .replace(/\bobserve\b/gi, "观察")
    .replace(/\bhigh\b/gi, "优先")
    .replace(/\bmedium\b/gi, "一般");
}

function renderEvidenceList(items = []) {
  const container = $("evidenceList");
  if (!container) return;
  if (!items.length) {
    container.innerHTML = `<div class="support-empty">生成报告后，这里会展示命中证据、主要缺口和改写方向。</div>`;
    return;
  }
  container.innerHTML = items.slice(0, 6).map((item) => `
    <article class="evidence-item">
      <div class="evidence-top">
        <strong>${localizeReportText(item.summary || "这条证据解释了一个匹配或缺口")}</strong>
        <span>${Math.round(Number(item.score || 0) * 100)}%</span>
      </div>
      <div class="evidence-brief">
        <section>
          <small>已有证据</small>
          <p>${item.matchPoint || "简历中有部分相关经历，但表达还不够直接。"}</p>
        </section>
        <section>
          <small>主要缺口</small>
          <p>${item.gap || "缺少更贴近 JD 的场景、动作或结果指标。"}</p>
        </section>
        <section>
          <small>怎么补</small>
          <p>${item.action || "把相关经历改写成 JD 语言，并补充工具、动作和量化结果。"}</p>
        </section>
      </div>
      <div class="evidence-columns">
        <section>
          <small>简历片段 · ${displayChunkLabel(item.resumeLabel, "简历片段")}</small>
          <p>${item.resumeText || "暂无简历片段"}</p>
        </section>
        <section>
          <small>JD 片段 · ${displayChunkLabel(item.jdLabel, "岗位片段")}</small>
          <p>${item.jdText || "暂无 JD 片段"}</p>
        </section>
      </div>
    </article>
  `).join("");
}

function keywordGroupsMarkup(groups) {
  const list = Array.isArray(groups) ? groups.filter((group) => group?.items?.length) : [];
  if (!list.length) return "";
  return `
    <div class="keyword-groups">
      ${list.map((group) => `
        <section class="keyword-group">
          <div class="keyword-group-label">${group.label || group.key || "关键词分组"}</div>
          <div class="chips">${group.items.map((item) => `<span class="chip">${item}</span>`).join("")}</div>
        </section>
      `).join("")}
    </div>
  `;
}

function renderBatchSetupGuide() {
  const badge = $("batchSetupBadge");
  const note = $("batchSetupNote");
  const list = $("batchSetupList");
  if (!badge || !note || !list) return;

  const authReady = Boolean(state.auth.user);
  const resumeReady = Boolean(state.resumeText);
  const hasBatchInput = Boolean(
    state.batchDraftJds.length ||
    ($("batchDraftText")?.value || "").trim() ||
    ($("batchUrls")?.value || "").trim()
  );

  const items = [
    authReady ? "已登录，可以保存海投批次和简历版本。" : "先登录，系统才会保存你的海投批次和版本记录。",
    resumeReady ? "基础简历已就绪，可以作为海投版本的母版。" : "先上传一份基础简历，海投生成会基于这份内容展开。",
    hasBatchInput ? "JD 输入已准备好，下一步可以直接开始解析。" : "逐条粘贴 JD 或上传图片识别，再点 + 加入队列。",
  ];

  list.innerHTML = items.map((item) => `<li>${item}</li>`).join("");

  if (!authReady) {
    badge.textContent = "先登录";
    note.textContent = "海投分析、分类和版本生成都依赖登录态，否则系统不会保存你的批次。";
    return;
  }
  if (!resumeReady) {
    badge.textContent = "传简历";
    note.textContent = "海投优化不是直接改 JD，它会拿基础简历去生成不同岗位方向的版本。";
    return;
  }
  if (!hasBatchInput) {
    badge.textContent = "导入 JD";
    note.textContent = "现在只差一组 JD 了。建议先用示例或直接粘贴你正在投递的岗位内容。";
    return;
  }

  badge.textContent = "可开始";
  note.textContent = "前置条件已经齐了，现在可以解析 JD，再继续做岗位方向分类和版本生成。";
}

function renderReportFallback() {
  $("scoreValue").textContent = "--";
  $("recommendation").textContent = "等待分析";
  $("verdict").textContent = "上传简历并填写 JD 后，点击生成匹配分。";
  $("dimensions").innerHTML = "";
  renderList($("reasons"), [], "等待分析理由");
  renderChips($("matches"), [], "暂无明显匹配点");
  renderChips($("gaps"), [], "暂无明显欠缺点");
  renderList($("nextSteps"), [], "等待下一步建议");
  renderEvidenceList([]);
  renderReportGuidance(null);
}

function updateRestoreButtons() {
  $("restoreReportBtn").classList.toggle("hidden", !getSaved(storageKeys.reportId));
  $("restoreBatchBtn").classList.toggle("hidden", !getSaved(storageKeys.batchRunId));
}

function formatTimeLabel(value) {
  if (!value) return "鍒氬垰";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "鍒氬垰";
  return `${date.getMonth() + 1}-${date.getDate()} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function variantDownloadLabel(variant) {
  if (!variant?.lastExportedAt) return "未导出";
  return `已导出 ${formatTimeLabel(variant.lastExportedAt)}`;
}

function variantDisplayName(variant) {
  return localizeBatchText(variant?.name || variant?.draftContent?.title || "未命名版本");
}

function variantSortValue(value) {
  const time = value ? new Date(value).getTime() : 0;
  return Number.isNaN(time) ? 0 : time;
}

function normalizeDeliveryStatus(value) {
  return ["待投", "已投", "等反馈", "暂缓"].includes(value) ? value : "待投";
}

function deliveryStatusMeta(value) {
  const status = normalizeDeliveryStatus(value);
  const meta = {
    "待投": { label: "待投", tone: "todo" },
    "已投": { label: "已投", tone: "sent" },
    "等反馈": { label: "等反馈", tone: "waiting" },
    "暂缓": { label: "暂缓", tone: "paused" },
  };
  return meta[status];
}

function isDeliveredProgress(value) {
  const status = normalizeDeliveryStatus(value);
  return status === "已投" || status === "等反馈";
}

function sortedVariants(items) {
  return [...(items || [])].sort((a, b) => {
    const primaryGap = Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary));
    if (primaryGap) return primaryGap;
    const exportGap = variantSortValue(b.lastExportedAt) - variantSortValue(a.lastExportedAt);
    if (exportGap) return exportGap;
    return variantSortValue(b.createdAt) - variantSortValue(a.createdAt);
  });
}

function trimText(value, max = 56) {
  const text = String(value || "").trim();
  return text.length > max ? `${text.slice(0, max)}...` : text;
}

function getResumeById(id) {
  return state.resumeLibrary.find((item) => item.id === id) || null;
}

function describeResumeSource(variant) {
  const resume = getResumeById(variant?.resumeId);
  if (!resume) {
    return {
      name: "当前基础简历",
      note: "这版简历沿用了当前批次使用的基础简历。",
      time: "",
    };
  }
  return {
    name: resume.fileName || "未命名简历",
    note: resume.summary?.overview || "这版简历基于这份基础简历生成，可回到简历库继续调整原始表达。",
    time: resume.createdAt ? formatTimeLabel(resume.createdAt) : "",
  };
}

function deriveBatchDashboard() {
  const dashboard = {
    headline: "先完成人岗方向分类，再决定优先投递版本。",
    summary: "这里会汇总本批次最值得优先推进的方向、当前优先投递版本，以及最近导出动作，帮助你判断下一步先投哪一类岗位。",
    primaryVariantName: "待生成",
    primaryVariantNote: "生成版本后可手动设为优先投递。",
    priorityDirection: "待分类",
    priorityNote: "会结合覆盖 JD 数和平均匹配分判断。",
    coverage: `${state.batchJds.length || 0} 条 JD`,
    coverageNote: state.batchJds.length ? "这是当前批次已纳入分析的岗位数量。" : "先导入并分类 JD，才能看到覆盖范围。",
    lastExport: "暂无",
    lastExportNote: "导出 Word 版本后，会在这里保留最近动作。",
  };

  const primaryVariant = state.variants.find((item) => item.isPrimary) || state.variants[0] || null;
  const clusters = state.clusters || [];
  const bestCluster = [...clusters].sort((a, b) => {
    const scoreGap = (b.averageMatchScore || 0) - (a.averageMatchScore || 0);
    if (scoreGap !== 0) return scoreGap;
    return (b.jdCount || 0) - (a.jdCount || 0);
  })[0] || null;
  const latestExportedVariant = [...state.variants]
    .filter((item) => item.lastExportedAt)
    .sort((a, b) => variantSortValue(b.lastExportedAt) - variantSortValue(a.lastExportedAt))[0] || null;

  if (primaryVariant) {
    const cluster = clusters.find((item) => item.id === primaryVariant.clusterId) || {};
    const source = describeResumeSource(primaryVariant);
    dashboard.primaryVariantName = variantDisplayName(primaryVariant);
    dashboard.primaryVariantNote = `${localizeBatchText(cluster.name || "未分配方向")} · 基于 ${source.name}`;
    dashboard.coverage = `${cluster.jdCount || 0} 条 JD`;
    dashboard.coverageNote = cluster.jdCount
      ? `这版更适合优先覆盖 ${cluster.jdCount} 条相近岗位。`
      : "这版还没有关联到清晰的岗位方向。";
  }

  if (bestCluster) {
    dashboard.priorityDirection = localizeBatchText(bestCluster.name || "当前方向");
    dashboard.priorityNote = `${bestCluster.jdCount || 0} 条 JD · 平均匹配 ${bestCluster.averageMatchScore || 0} 分`;
    dashboard.headline = `建议先推进“${localizeBatchText(bestCluster.name || "当前方向")}”这条投递线。`;
    dashboard.summary = bestCluster.reason
      ? localizeBatchText(bestCluster.reason)
      : "这个方向在当前批次里更集中，也更适合优先产出和投递。";
  }

  if (latestExportedVariant) {
    dashboard.lastExport = variantDisplayName(latestExportedVariant);
    dashboard.lastExportNote = `${formatTimeLabel(latestExportedVariant.lastExportedAt)} 导出，可继续沿这版往下微调。`;
  }

  dashboard.totalJd = state.batchJds.length || 0;
  dashboard.variantCount = state.variants.length || 0;
  dashboard.processedCount = state.variants.filter((item) => isDeliveredProgress(item.deliveryStatus)).length;
  dashboard.pendingCount = Math.max(dashboard.variantCount - dashboard.processedCount, 0);
  dashboard.totalJdNote = dashboard.totalJd ? "已纳入当前批次的岗位数" : "先导入 JD 再开始推进";
  dashboard.variantCountNote = dashboard.variantCount ? "已经产出的可投递版本数" : "先完成岗位分类再生成版本";
  dashboard.processedNote = dashboard.processedCount ? "已有导出记录，可继续顺着往下投" : "还没有版本进入导出动作";
  dashboard.pendingNote = dashboard.pendingCount ? "这些版本还没进入导出动作" : "当前没有待处理版本";
  dashboard.actionNote = primaryVariant
    ? `建议先围绕“${variantDisplayName(primaryVariant)}”推进，再处理其余方向。`
    : "生成版本后，这里会提示你优先推进哪一版。";
  dashboard.directionSummaries = clusters.map((cluster) => {
    const variant = state.variants.find((item) => item.clusterId === cluster.id) || null;
    const delivery = deliveryStatusMeta(variant?.deliveryStatus);
    const status = variant?.isPrimary
      ? `优先投递 · ${delivery.label}`
      : variant
        ? delivery.label
        : "待处理";
    return {
      id: cluster.id,
      name: localizeBatchText(cluster.name || "未命名方向"),
      jdCount: cluster.jdCount || 0,
      averageMatchScore: cluster.averageMatchScore || 0,
      variantName: variant ? variantDisplayName(variant) : "待生成版本",
      status,
      isPriority: bestCluster ? cluster.id === bestCluster.id : false,
      isPrimary: Boolean(variant?.isPrimary),
    };
  });

  return dashboard;
}

function deriveBatchReport(item) {
  const clusters = item?.clusters || [];
  const variants = sortedVariants(item?.variants || []);
  const primaryVariant = variants.find((entry) => entry.isPrimary) || variants[0] || null;
  const bestCluster = [...clusters].sort((a, b) => {
    const scoreGap = (b.averageMatchScore || 0) - (a.averageMatchScore || 0);
    if (scoreGap !== 0) return scoreGap;
    return (b.jdCount || 0) - (a.jdCount || 0);
  })[0] || null;
  const latestExportedVariant = [...variants]
    .filter((entry) => entry.lastExportedAt)
    .sort((a, b) => variantSortValue(b.lastExportedAt) - variantSortValue(a.lastExportedAt))[0] || null;
  const processedCount = variants.filter((entry) => isDeliveredProgress(entry.deliveryStatus)).length;
  const pendingCount = Math.max(variants.length - processedCount, 0);

  return {
    clusters,
    variants,
    primaryVariant,
    bestCluster,
    latestExportedVariant,
    processedCount,
    pendingCount,
  };
}

function renderBatchDetailMarkup(item) {
  const source = describeResumeSource(item);
  const report = deriveBatchReport(item);
  const primaryCluster = report.primaryVariant
    ? report.clusters.find((cluster) => cluster.id === report.primaryVariant.clusterId) || null
    : null;
  const headline = report.bestCluster
    ? `建议这批优先推进“${report.bestCluster.name || "当前方向"}”`
    : "先完成岗位分类，再判断这批应该优先投递哪条线";
  const summary = report.bestCluster?.reason
    || "这里会集中展示这批 JD 的方向分布、优先投递版本和推进状态，方便你继续海投。";

  return `
    <div class="detail-shell batch-report-shell">
      <div class="detail-head">
        <div>
          <strong>海投批次详情</strong>
          <span>${formatTimeLabel(item.createdAt)}  · ${item.provider === "deepseek" ? "DeepSeek" : "本地规则"}</span>
        </div>
        <span>${item.itemIds?.length || item.jds?.length || 0} 条 JD</span>
      </div>

      <div class="batch-report-hero">
        <article class="summary-focus-card batch-report">
          <small>本批次结论</small>
          <strong>${headline}</strong>
          <p>${summary}</p>
        </article>
        <div class="summary-stat-grid batch-report-stats">
          <article>
            <small>优先投递版本</small>
            <strong>${report.primaryVariant ? variantDisplayName(report.primaryVariant) : "待生成"}</strong>
          </article>
          <article>
            <small>建议优先方向</small>
            <strong>${report.bestCluster?.name || "待分类"}</strong>
          </article>
          <article>
            <small>基础简历</small>
            <strong>${source.name}</strong>
          </article>
        </div>
      </div>

      <div class="guidance-metrics batch-guidance-metrics">
        <article>
          <small>岗位方向</small>
          <strong>${report.clusters.length}</strong>
        </article>
        <article>
          <small>简历版本</small>
          <strong>${report.variants.length}</strong>
        </article>
        <article>
          <small>已处理</small>
          <strong>${report.processedCount}</strong>
        </article>
        <article>
          <small>待处理</small>
          <strong>${report.pendingCount}</strong>
        </article>
      </div>

      <div class="detail-grid">
        <div class="detail-block batch-report-block">
          <strong>批次总览</strong>
          <p>基础简历：${source.name}</p>
          <p>当前优先投递：${report.primaryVariant ? variantDisplayName(report.primaryVariant) : "还没有优先投递版本"}</p>
          <p>优先投递覆盖：${primaryCluster?.jdCount || 0} 条 JD</p>
          <p>最近导出：${report.latestExportedVariant ? `${variantDisplayName(report.latestExportedVariant)} · ${formatTimeLabel(report.latestExportedVariant.lastExportedAt)}` : "还没有导出记录"}</p>
        </div>
        <div class="detail-block batch-report-block">
          <strong>继续推进建议</strong>
          <div class="detail-list">
            <div class="detail-list-item"><p>${report.primaryVariant ? `先沿着“${variantDisplayName(report.primaryVariant)}”继续投递或微调。` : "先生成版本，再挑一版设为优先投递。"}</p></div>
            <div class="detail-list-item"><p>${report.pendingCount ? `当前还有 ${report.pendingCount} 个版本未进入导出动作，建议优先清掉待处理项。` : "当前所有版本都已经进入过导出动作，可以继续回看投递反馈。"}</p></div>
            <div class="detail-list-item"><p>${report.bestCluster ? `优先方向是“${report.bestCluster.name}”，因为它在这批里的匹配度和方向集中度更高。` : "当前还缺少足够的分类结果，建议先完成岗位方向整理。"}</p></div>
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-timeline batch-report-timeline">
          <strong>方向比较</strong>
          <div class="detail-list">
            ${report.clusters.length ? report.clusters.map((cluster) => {
              const variant = report.variants.find((entry) => entry.clusterId === cluster.id);
              const delivery = deliveryStatusMeta(variant?.deliveryStatus);
              const status = variant?.isPrimary
                ? `优先投递 · ${delivery.label}`
                : variant
                  ? delivery.label
                  : "待处理";
              return `
                <div class="detail-list-item batch-direction-item">
                  <strong>${cluster.name}</strong>
                  <p>${cluster.jdCount || 0} 条 JD  · 平均  ${cluster.averageMatchScore || 0} 分 · ${status}</p>
                  <p>${variant ? `对应版本：${variantDisplayName(variant)}` : "还没有生成对应版本"}</p>
                </div>
              `;
            }).join("") : `<div class="detail-list-item"><p>当前还没有岗位方向分类。</p></div>`}
          </div>
        </div>
        <div class="detail-timeline batch-report-timeline">
          <strong>版本推进</strong>
          <div class="detail-list">
            ${report.variants.length ? report.variants.map((variant) => {
              const cluster = report.clusters.find((entry) => entry.id === variant.clusterId) || {};
              return `
                <div class="detail-list-item batch-variant-item">
                  <strong>${variantDisplayName(variant)}${variant.isPrimary ? "  · 优先投递" : ""}</strong>
                  <p>${cluster.name || "未分配方向"} · ${deliveryStatusMeta(variant.deliveryStatus).label}${variant.lastExportedAt ? ` · 导出 ${formatTimeLabel(variant.lastExportedAt)}` : ""}</p>
                  <p>${trimText(variant.positioning || "暂无版本定位", 80)}</p>
                </div>
              `;
            }).join("") : `<div class="detail-list-item"><p>本批次还没有生成简历版本。</p></div>`}
          </div>
        </div>
      </div>

      <div class="detail-grid">
        <div class="detail-timeline">
          <strong>失败项与提醒</strong>
          <div class="detail-list">
            ${(item.failures || []).length ? item.failures.map((failure) => `
              <div class="detail-list-item">
                <strong>${failure.sourceUrl || "失败项"}</strong>
                <p>${failure.error || "抓取失败"}${failure.detail ? `  · ${failure.detail}` : ""}</p>
              </div>
            `).join("") : `<div class="detail-list-item"><p>本批次没有失败项，可以直接继续处理版本和投递。</p></div>`}
          </div>
        </div>
        <div class="detail-timeline">
          <strong>基础简历来源</strong>
          <div class="variant-inline-linkage">
            <small>基于基础简历</small>
            <strong>${source.name}</strong>
            <p class="variant-source-note">${source.note}${source.time ? `  · ${source.time}` : ""}</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderBatchFailures() {
  const container = $("batchFailureList");
  const failures = state.ui.batchFailures || [];
  if (!failures.length) {
    container.innerHTML = "";
    container.className = "failure-list hidden";
    return;
  }

  container.className = "failure-list";
  container.innerHTML = "";
  failures.forEach((item, index) => {
    const card = document.createElement("article");
    card.className = "failure-item";
    card.innerHTML = `
      <strong>失败项 ${index + 1}</strong>
      <span>${item.sourceUrl || "手动输入项"}</span>
      <small>${item.error || "抓取失败"}${item.detail ? ` · ${item.detail}` : ""}</small>
    `;
    container.appendChild(card);
  });
}

function renderResumeLibrary() {
  const container = $("resumeLibrary");
  if (!container) return;
  const items = state.resumeLibrary || [];
  if (!items.length) {
    container.innerHTML = `<div class="support-empty">上传过的简历会显示在这里。</div>`;
    return;
  }

  container.innerHTML = "";
  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = `support-card${item.id === state.resumeId ? " current" : ""}`;
    card.innerHTML = `
      <div class="support-card-head">
        <strong>${item.fileName || "未命名简历"}</strong>
        <span>${item.id === state.resumeId ? "当前使用中" : "可切换"}</span>
      </div>
      <p>${trimText(item.summary?.overview || "暂无摘要")}</p>
      <div class="support-meta">
        <span>${String(item.fileType || "text").toUpperCase()}</span>
        <span>${formatTimeLabel(item.createdAt)}</span>
      </div>
      <div class="support-actions">
        <button class="secondary resume-detail-btn" type="button" data-id="${item.id}">看详情</button>
        <button class="secondary resume-select-btn" type="button" data-id="${item.id}">${item.id === state.resumeId ? "当前简历" : "切换使用"}</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderRecentHistory() {
  const container = $("recentHistory");
  if (!container) return;
  const items = state.recentHistory || [];
  if (!items.length) {
    container.innerHTML = `<div class="support-empty">最近生成的报告和海投批次会显示在这里。</div>`;
    return;
  }

  container.innerHTML = "";
  items.forEach((item) => {
    const isReport = item.type === "report";
    const card = document.createElement("article");
    card.className = "support-card";
    card.innerHTML = `
      <div class="support-card-head">
        <strong>${trimText(item.title || (isReport ? "单 JD 报告" : "海投批次"), 40)}</strong>
        <span>${isReport ? "单 JD" : "海投"}</span>
      </div>
      <p>${isReport
        ? `${item.score ?? "--"} 分 · ${item.recommendation || "待查看建议"}`
        : `${item.jdCount || 0} 条 JD · ${item.clusterCount || 0} 个方向 · ${item.variantCount || 0} 个版本`}</p>
      <div class="support-meta">
        <span>${item.provider === "deepseek" ? "DeepSeek" : "本地规则"}</span>
        <span>${formatTimeLabel(item.createdAt)}</span>
      </div>
      <div class="support-actions">
        <button class="secondary history-detail-btn" type="button" data-type="${item.type}" data-id="${item.id}">看详情</button>
        <button class="secondary history-open-btn" type="button" data-type="${item.type}" data-id="${item.id}">打开记录</button>
      </div>
    `;
    container.appendChild(card);
  });
}

function renderUsageCenter() {
  const container = $("usageCenter");
  if (!container) return;
  const data = state.usageCenter;
  if (!state.auth.user) {
    container.innerHTML = `<div class="support-empty">登录后，这里会显示你的额度和最近操作记录。</div>`;
    return;
  }
  if (!data) {
    container.innerHTML = `<div class="support-empty">正在整理你的使用记录和额度状态。</div>`;
    return;
  }

  const quota = data.quotaSummary || {};
  const recentActivity = data.recentActivity || [];
  const recentErrors = data.recentErrors || [];
  const today = data.todayActions || {};

  container.className = "usage-center";
  container.innerHTML = `
    <div class="usage-summary-grid">
      <article class="usage-summary-card">
        <small>单 JD 剩余额度</small>
        <strong>${quota.remaining?.singleAnalysis ?? 0}</strong>
        <span>已用 ${quota.used?.singleAnalysisUsed ?? 0} / ${quota.limits?.singleAnalysis ?? 0}</span>
      </article>
      <article class="usage-summary-card">
        <small>海投批次剩余额度</small>
        <strong>${quota.remaining?.batchRuns ?? 0}</strong>
        <span>已用 ${quota.used?.batchRunsUsed ?? 0} / ${quota.limits?.batchRuns ?? 0}</span>
      </article>
      <article class="usage-summary-card">
        <small>导出剩余额度</small>
        <strong>${quota.remaining?.exports ?? 0}</strong>
        <span>已用 ${quota.used?.exportsUsed ?? 0} / ${quota.limits?.exports ?? 0}</span>
      </article>
      <article class="usage-summary-card">
        <small>今天异常次数</small>
        <strong>${today.errors ?? 0}</strong>
        <span>${quota.plan || "free"} 方案</span>
      </article>
    </div>
    <div class="usage-detail-grid">
      <section class="usage-block">
        <h3>今天的关键操作</h3>
        <p>帮助你快速判断今天已经推进到了哪一步。</p>
        <div class="usage-summary-grid">
          <article class="usage-summary-card">
            <small>单 JD 分析</small>
            <strong>${today.singleAnalysis ?? 0}</strong>
            <span>今日成功次数</span>
          </article>
          <article class="usage-summary-card">
            <small>海投解析</small>
            <strong>${today.batchRuns ?? 0}</strong>
            <span>今日成功次数</span>
          </article>
          <article class="usage-summary-card">
            <small>简历导出</small>
            <strong>${today.exports ?? 0}</strong>
            <span>今日成功次数</span>
          </article>
          <article class="usage-summary-card">
            <small>最近错误</small>
            <strong>${recentErrors.length}</strong>
            <span>最近 6 条提醒</span>
          </article>
        </div>
      </section>
      <section class="usage-block">
        <h3>最近错误与提醒</h3>
        <p>主要记录超额、导出失败和模型回退等关键问题。</p>
        <div class="usage-error-list">
          ${recentErrors.length ? recentErrors.map((item) => `
            <article class="usage-error-item">
              <div class="usage-error-top">
                <strong>${item.kind || "系统提醒"}</strong>
                <span>${formatTimeLabel(item.timestamp)}</span>
              </div>
              <small>${item.message || item.errorCode || item.quotaType || "暂无详细说明"}</small>
            </article>
          `).join("") : `<div class="usage-empty">最近没有新的错误提醒。</div>`}
        </div>
      </section>
    </div>
    <section class="usage-block">
      <h3>最近操作记录</h3>
      <p>这里记录你最近的关键动作，方便快速回看是不是刚刚已经跑过一次。</p>
      <div class="usage-activity-list">
        ${recentActivity.length ? recentActivity.map((item) => `
          <article class="usage-activity-item ${item.status === "error" ? "error" : ""}">
            <div class="usage-activity-top">
              <strong>${item.label}</strong>
              <span>${formatTimeLabel(item.timestamp)}</span>
            </div>
            <small>${item.statusCode}  · ${item.durationMs}ms${item.errorCode ? `  · ${item.errorCode}` : ""}</small>
          </article>
        `).join("") : `<div class="usage-empty">还没有最近操作记录。</div>`}
      </div>
    </section>
  `;
}

function renderDetailPanel() {
  const container = $("detailContent");
  if (!container) return;
  const detail = state.detailView;
  if (!detail) {
    container.innerHTML = "";
    return;
  }

  if (detail.type === "resume") {
    const relatedReports = detail.related?.reports || [];
    const relatedBatchRuns = detail.related?.batchRuns || [];
    container.innerHTML = `
      <div class="detail-shell">
        <div class="detail-head">
          <div>
            <strong>${detail.item.fileName || "未命名简历"}</strong>
            <span>${String(detail.item.fileType || "text").toUpperCase()}  · ${formatTimeLabel(detail.item.createdAt)}</span>
          </div>
          <span>${detail.item.id === state.resumeId ? "当前分析使用中" : "历史简历"}</span>
        </div>
        <div class="detail-grid">
          <div class="detail-block">
            <strong>简历摘要</strong>
            <p>${detail.item.summary?.overview || "暂无摘要"}</p>
            <div class="chips">${(detail.item.keywords || []).slice(0, 12).map((kw) => `<span class="chip">${kw}</span>`).join("")}</div>
            ${keywordGroupsMarkup(detail.item.keywordGroups || [])}
          </div>
          <div class="detail-block">
            <strong>上传信息</strong>
            <p>上传时间：${formatTimeLabel(detail.item.createdAt)}</p>
            <p>预览方式：${detail.item.previewType || "text"}</p>
            <p>当前状态：${detail.item.status || "active"}</p>
          </div>
        </div>
        <div class="detail-grid">
          <div class="detail-timeline">
            <strong>关联单 JD 报告</strong>
            <div class="detail-list">
              ${relatedReports.length ? relatedReports.map((item) => `
                <div class="detail-list-item">
                  <strong>${trimText(item.title, 42)}</strong>
                  <p>${item.score ?? "--"} 分 · ${item.recommendation || "待查看建议"} · ${formatTimeLabel(item.createdAt)}</p>
                </div>
              `).join("") : `<div class="detail-list-item"><p>这份简历还没有关联的单 JD 报告。</p></div>`}
            </div>
          </div>
          <div class="detail-timeline">
            <strong>关联海投批次</strong>
            <div class="detail-list">
              ${relatedBatchRuns.length ? relatedBatchRuns.map((item) => `
                <div class="detail-list-item">
                  <strong>${item.title}</strong>
                  <p>${item.jdCount || 0} 条 JD  · ${item.clusterCount || 0} 个方向 · ${item.variantCount || 0} 个版本 · ${formatTimeLabel(item.createdAt)}</p>
                </div>
              `).join("") : `<div class="detail-list-item"><p>这份简历还没有关联的海投批次。</p></div>`}
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  if (detail.type === "report") {
    container.innerHTML = `
      <div class="detail-shell">
        <div class="detail-head">
          <div>
            <strong>${trimText(detail.item.jd?.title || "单 JD 报告", 46)}</strong>
            <span>${formatTimeLabel(detail.item.createdAt)}  · ${detail.item.provider === "deepseek" ? "DeepSeek" : "本地规则"}</span>
          </div>
          <span>${detail.item.analysis?.score ?? "--"} 分</span>
        </div>
        <div class="detail-grid">
          <div class="detail-block">
            <strong>结论</strong>
            <p>${detail.item.analysis?.verdict || "暂无结论"}</p>
            <div class="chips">${(detail.item.analysis?.matches || []).slice(0, 10).map((kw) => `<span class="chip">${kw}</span>`).join("")}</div>
          </div>
          <div class="detail-block">
            <strong>下一步建议</strong>
            <div class="detail-list">
              ${(detail.item.analysis?.nextSteps || []).map((step) => `<div class="detail-list-item"><p>${step}</p></div>`).join("") || `<div class="detail-list-item"><p>暂无建议</p></div>`}
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  if (detail.type === "batch") {
    const item = detail.item;
    const delivery = deliveryStatusMeta(item.deliveryStatus);
    const source = describeResumeSource(item);
    container.innerHTML = `
      <div class="detail-shell">
        <div class="detail-head">
          <div>
            <strong>海投批次详情</strong>
            <span>${formatTimeLabel(item.createdAt)}  · ${item.provider === "deepseek" ? "DeepSeek" : "本地规则"}</span>
          </div>
          <span>${item.itemIds?.length || item.jds?.length || 0} 条 JD</span>
        </div>
        <div class="detail-grid">
          <div class="detail-block">
            <strong>本批次概览</strong>
            <p>岗位方向：${item.clusters?.length || 0} 个</p>
            <p>简历版本：${item.variants?.length || 0} 个</p>
            <p>失败项：${item.failures?.length || 0} 个</p>
          </div>
          <div class="detail-block">
            <strong>岗位方向</strong>
            <div class="detail-list">
              ${(item.clusters || []).map((cluster) => `
                <div class="detail-list-item">
                  <strong>${cluster.name}</strong>
                  <p>${cluster.jdCount || 0} 条 JD  · 平均  ${cluster.averageMatchScore || 0} 分</p>
                </div>
              `).join("") || `<div class="detail-list-item"><p>暂无岗位方向。</p></div>`}
            </div>
          </div>
        </div>
        <div class="detail-grid">
          <div class="detail-timeline">
            <strong>版本结果</strong>
            <div class="detail-list">
              ${(item.variants || []).map((variant) => `
                <div class="detail-list-item">
                  <strong>${variant.name}</strong>
                  <p>${trimText(variant.positioning || "暂无定位", 60)}</p>
                </div>
              `).join("") || `<div class="detail-list-item"><p>本批次还没有生成版本。</p></div>`}
            </div>
          </div>
          <div class="detail-timeline">
            <strong>失败与提醒</strong>
            <div class="detail-list">
              ${(item.failures || []).length ? item.failures.map((failure) => `
                <div class="detail-list-item">
                  <strong>${failure.sourceUrl || "失败项"}</strong>
                  <p>${failure.error || "抓取失败"}${failure.detail ? `：${failure.detail}` : ""}</p>
                </div>
              `).join("") : `<div class="detail-list-item"><p>本批次没有失败项。</p></div>`}
            </div>
          </div>
        </div>
      </div>
    `;
    return;
  }

  if (detail.type === "variant") {
    const item = detail.item;
    const downloadBlock = item.exportPath
      ? `<a class="detail-link" href="${item.exportPath}" target="_blank" rel="noreferrer">下载 Word 草稿</a>`
      : `<span class="detail-link muted">还未导出 Word</span>`;
    const historyItems = (item.exportHistory || []).slice(0, 5).map((entry) => `
      <div class="variant-history-item">
        <span>${entry.fileName || "Word 草稿"}</span>
        <span>${formatTimeLabel(entry.exportedAt)}</span>
      </div>
    `).join("");
    container.innerHTML = `
      <div class="detail-shell">
        <div class="detail-head">
          <div>
            <strong>${item.draftContent?.title || item.name || "简历版本详情"}</strong>
            <span>${formatTimeLabel(item.createdAt)}  · ${item.provider === "deepseek" ? "DeepSeek" : "本地规则"}</span>
          </div>
          <span>${item.lastExportedAt ? `最近导出 ${formatTimeLabel(item.lastExportedAt)}` : "未导出"}</span>
        </div>
        <div class="detail-grid">
          <div class="detail-block">
            <strong>版本定位</strong>
            <p>${item.positioning || "暂无版本定位"}</p>
            <div class="chips">${(item.draftContent?.skills || []).slice(0, 12).map((kw) => `<span class="chip">${kw}</span>`).join("")}</div>
            <p class="variant-secondary-note">${item.isPrimary ? "当前优先投递版本" : "尚未设为优先投递版本"}</p>
          </div>
          <div class="detail-block">
            <strong>导出状态</strong>
            <p>${variantDownloadLabel(item)}</p>
            <p>${downloadBlock}</p>
            <div class="support-actions variant-card-actions">
              <button class="secondary mini-primary" type="button" data-id="${item.id}">${item.isPrimary ? "当前优先投递" : "设为优先投递"}</button>
            </div>
          </div>
        </div>
        <div class="detail-grid">
          <div class="detail-timeline">
            <strong>改写重点</strong>
            <div class="detail-list">
              ${(item.rewritePlan || []).map((step) => `<div class="detail-list-item"><p>${step}</p></div>`).join("") || `<div class="detail-list-item"><p>暂无改写重点。</p></div>`}
            </div>
          </div>
          <div class="detail-timeline">
            <strong>真实性提醒</strong>
            <div class="detail-list">
              ${(item.truthCheckWarnings || []).map((warning) => `<div class="detail-list-item"><p>${warning}</p></div>`).join("") || `<div class="detail-list-item"><p>暂无额外提醒。</p></div>`}
            </div>
          </div>
        </div>
        <div class="detail-block">
          <strong>导出历史</strong>
          <div class="variant-history">
            ${historyItems || `<div class="variant-history-item"><span>还没有导出记录</span><span>等待导出</span></div>`}
          </div>
        </div>
        <form class="variant-rename-form" data-id="${item.id}">
          <input type="text" name="variantName" value="${variantDisplayName(item)}" maxlength="60" />
          <button type="submit" class="secondary">保存名称</button>
        </form>
      </div>
    `;
  }
}

function renderAnalysis(data) {
  const { resume, jd, analysis } = data;
  state.analysis = analysis;
  renderChips($("resumeKeywords"), resume.keywords, "等待解析简历关键词");
  renderChips($("jdKeywords"), jd.keywords, "等待提取 JD 关键词");
  $("scoreValue").textContent = Math.round(analysis.score ?? 0);
  $("recommendation").textContent = analysis.recommendation || "已生成建议";
  $("verdict").textContent = analysis.verdict || "";
  renderReportGuidance(analysis);

  $("dimensions").innerHTML = "";
  for (const item of analysis.dimensions || []) {
    const row = document.createElement("div");
    row.className = "dimension-row";
    const pct = item.max ? Math.round((item.score / item.max) * 100) : 0;
    row.innerHTML = `
      <div><span>${item.name}</span><strong>${item.score}/${item.max}</strong></div>
      <div class="bar"><i style="width:${pct}%"></i></div>
    `;
    $("dimensions").appendChild(row);
  }

  renderList($("reasons"), analysis.reasons, "等待分析理由");
  renderChips($("matches"), analysis.matches, "暂无明显匹配点");
  renderChips($("gaps"), analysis.gaps, "暂无明显欠缺点");
  renderList($("nextSteps"), analysis.priorityActions?.length ? analysis.priorityActions : analysis.nextSteps, "等待下一步建议");
  renderEvidenceList(analysis.evidence || []);
}

function applyResumeSnapshot(snapshot) {
  if (!snapshot) return;
  state.resumeId = snapshot.id || state.resumeId;
  state.resumeText = snapshot.text || "";
  state.resumeSummary = snapshot.summary || null;
  state.resumeKeywordGroups = snapshot.keywordGroups || [];
  $("resumeMeta").textContent = `${snapshot.fileName || "已恢复简历"} · 最近保存`;
  $("resumeMeta").classList.remove("hidden");
  $("pdfPreview").src = "";
  $("pdfPreview").dataset.active = "false";
  $("pdfPreview").classList.add("hidden");
  $("resumePreview").classList.remove("hidden");
  renderSummary($("resumePreview"), snapshot.summary);
  renderChips($("resumeKeywords"), snapshot.keywords || [], "等待解析简历关键词");
  renderKeywordGroups($("resumeKeywordGroups"), state.resumeKeywordGroups);
}

function applySingleReport(report) {
  state.reportId = report.id || "";
  state.analysis = report.analysis || null;
  state.jdText = report.jd?.rawText || "";
  state.jdSourceUrl = report.jd?.sourceUrl || "";
  if (report.resume) applyResumeSnapshot(report.resume);
  $("jdText").value = state.jdText;
  renderAnalysis({
    resume: report.resume || { keywords: [], summary: null },
    jd: report.jd || { keywords: [], summary: null },
    analysis: report.analysis || {},
  });
  state.ui.singleStatus = "analysis_ready";
  renderResumeLibrary();
  renderSingleState();
}

function applyBatchRun(batchRun) {
  state.batchRunId = batchRun.id || "";
  state.batchJds = batchRun.jds || [];
  state.clusters = batchRun.clusters || [];
  state.variants = sortedVariants(batchRun.variants || []);
  state.ui.batchFailures = batchRun.failures || [];
  state.ui.batchStatus = state.ui.batchFailures.length ? "partial_success" : "success";
  renderResumeLibrary();
  renderAll();
}

async function loadResumeLibrary() {
  try {
    const data = await getJson("/api/resumes");
    state.resumeLibrary = data.items || [];
  } catch {
    state.resumeLibrary = [];
  }
  renderResumeLibrary();
}

async function loadRecentHistory() {
  try {
    const data = await getJson("/api/history");
    state.recentHistory = data.items || [];
  } catch {
    state.recentHistory = [];
  }
  renderRecentHistory();
}

async function loadUsageCenter() {
  if (!state.auth.user) {
    state.usageCenter = null;
    renderUsageCenter();
    return;
  }
  try {
    const data = await getJson("/api/usage-center");
    state.usageCenter = data;
  } catch {
    state.usageCenter = null;
  }
  renderUsageCenter();
}

async function restoreResumeById(id) {
  const match = state.resumeLibrary.find((item) => item.id === id);
  if (!match) return;
  state.resumeId = match.id;
  state.resumeSummary = match.summary || null;
  state.resumeKeywordGroups = match.keywordGroups || [];
  $("resumeMeta").textContent = `${match.fileName || "已选择简历"} · 历史简历`;
  $("resumeMeta").classList.remove("hidden");
  renderUploadState("已切换当前基础简历。重新生成报告或海投分析时会使用这份简历。", "success");
  saveValue(storageKeys.resumeId, state.resumeId);
  renderResumeLibrary();
  renderChips($("resumeKeywords"), match.keywords || [], "等待解析简历关键词");
  renderKeywordGroups($("resumeKeywordGroups"), state.resumeKeywordGroups);
  toast("已切换基础简历");
}

async function loadResumeDetail(id) {
  try {
    const data = await getJson(`/api/resumes/${encodeURIComponent(id)}`);
    state.detailView = { type: "resume", ...data };
    renderDetailPanel();
  } catch (error) {
    handleUiError(error);
  }
}

async function loadHistoryDetail(type, id) {
  try {
    const url = type === "report"
      ? `/api/reports/${encodeURIComponent(id)}`
      : `/api/batch-runs/${encodeURIComponent(id)}`;
    const data = await getJson(url);
    state.detailView = { type, ...data };
    renderDetailPanel();
  } catch (error) {
    handleUiError(error);
  }
}

async function loadVariantDetail(id) {
  try {
    const data = await getJson(`/api/resume-variants/${encodeURIComponent(id)}`);
    state.detailView = { type: "variant", ...data };
    renderDetailPanel();
  } catch (error) {
    handleUiError(error);
  }
}

async function openCurrentBatchDetail() {
  if (!state.batchRunId) {
    toast("先完成一次海投分析，再查看批次详情", "warn");
    return;
  }
  await loadHistoryDetail("batch", state.batchRunId);
  toast("已打开当前海投批次详情");
}

async function updateVariant(id, payload, successMessage) {
  const data = await postJson(`/api/resume-variants/${encodeURIComponent(id)}`, payload);
  const updated = data.item;
  state.variants = state.variants.map((item) => (item.id === id ? { ...item, ...updated } : item));

  if (typeof payload.isPrimary === "boolean" && payload.isPrimary && updated.batchRunId) {
    state.variants = state.variants.map((item) => (
      item.batchRunId === updated.batchRunId
        ? { ...item, isPrimary: item.id === id }
        : item
    ));
  }

  if (state.detailView?.type === "variant" && state.detailView?.item?.id === id) {
    state.detailView = { type: "variant", item: updated };
    renderDetailPanel();
  }

  state.variants = sortedVariants(state.variants);
  renderVariants();
  toast(successMessage || data.message || "版本信息已更新");
  return updated;
}

async function restoreLastReport() {
  const reportId = getSaved(storageKeys.reportId);
  if (!reportId) return;
  try {
    const data = await getJson(`/api/reports/${encodeURIComponent(reportId)}`);
    applySingleReport(data.item);
    renderReportState("已恢复上次保存的单 JD 报告。", "success");
    await loadRecentHistory();
    toast("已恢复上次报告");
  } catch (error) {
    saveValue(storageKeys.reportId, "");
    updateRestoreButtons();
    handleUiError(error, { statusNoteId: "reportStatusNote" });
  }
}

async function restoreLastBatchRun() {
  const batchRunId = getSaved(storageKeys.batchRunId);
  if (!batchRunId) return;
  try {
    const data = await getJson(`/api/batch-runs/${encodeURIComponent(batchRunId)}`);
    applyBatchRun(data.item);
    renderBatchState("已恢复上次保存的海投批次。", "success");
    await loadRecentHistory();
    toast("已恢复上次海投批次");
  } catch (error) {
    saveValue(storageKeys.batchRunId, "");
    updateRestoreButtons();
    handleUiError(error, { statusNoteId: "batchStatusNote" });
  }
}

function renderJdList() {
  $("jdCounter").textContent = `${state.batchJds.length} 条`;
  const list = $("jdList");
  list.innerHTML = "";

  if (!state.batchJds.length) {
    list.className = "jd-list empty-state";
    list.textContent = "等待导入 JD。";
    return;
  }

  list.className = "jd-list";
  state.batchJds.forEach((jd, index) => {
    const card = document.createElement("article");
    card.className = "jd-card";
    card.innerHTML = `
      <div class="card-title-row">
        <strong>${index + 1}. ${localizeBatchText(jd.title)}</strong>
        <span>${jd.matchScore || 0} 分</span>
      </div>
      <p>${localizeBatchText(jd.summary?.overview || jd.rawText.slice(0, 120))}</p>
      <div class="chips">${(jd.keywords || [])
        .slice(0, 8)
        .map((kw) => `<span class="chip">${localizeBatchText(kw)}</span>`)
        .join("")}</div>
    `;
    list.appendChild(card);
  });
}

function renderClusters() {
  const list = $("clusterList");
  list.innerHTML = "";

  if (!state.clusters.length) {
    list.className = "cluster-list empty-state";
    list.textContent = state.batchJds.length
      ? "先生成岗位方向分类，再查看聚类结果。"
      : "解析 JD 后生成岗位方向分类。";
    return;
  }

  list.className = "cluster-list";
  state.clusters.forEach((cluster) => {
    const card = document.createElement("article");
    card.className = "cluster-card";
    card.innerHTML = `
      <div class="card-title-row"><strong>${localizeBatchText(cluster.name)}</strong><span>${localizeBatchText(cluster.priority)}</span></div>
      <div class="cluster-meta"><span>${cluster.jdCount} 条 JD</span><span>均分 ${cluster.averageMatchScore}</span></div>
      <p>${localizeBatchText(cluster.reason)}</p>
      <div class="chips">${(cluster.keywords || [])
        .slice(0, 8)
        .map((kw) => `<span class="chip">${localizeBatchText(kw)}</span>`)
        .join("")}</div>
    `;
    list.appendChild(card);
  });
}

function renderBatchDashboard() {
  const dashboard = deriveBatchDashboard();
  $("dashboardHeadline").textContent = dashboard.headline;
  $("dashboardSummary").textContent = dashboard.summary;
  $("dashboardPrimaryVariant").textContent = dashboard.primaryVariantName;
  $("dashboardPrimaryVariantNote").textContent = dashboard.primaryVariantNote;
  $("dashboardPriorityDirection").textContent = dashboard.priorityDirection;
  $("dashboardPriorityNote").textContent = dashboard.priorityNote;
  $("dashboardCoverage").textContent = dashboard.coverage;
  $("dashboardCoverageNote").textContent = dashboard.coverageNote;
  $("dashboardLastExport").textContent = dashboard.lastExport;
  $("dashboardLastExportNote").textContent = dashboard.lastExportNote;
  $("cockpitTotalJd").textContent = String(dashboard.totalJd || 0);
  $("cockpitTotalJdNote").textContent = dashboard.totalJdNote;
  $("cockpitVariantCount").textContent = String(dashboard.variantCount || 0);
  $("cockpitVariantCountNote").textContent = dashboard.variantCountNote;
  $("cockpitProcessedCount").textContent = String(dashboard.processedCount || 0);
  $("cockpitProcessedNote").textContent = dashboard.processedNote;
  $("cockpitPendingCount").textContent = String(dashboard.pendingCount || 0);
  $("cockpitPendingNote").textContent = dashboard.pendingNote;
  $("cockpitActionNote").textContent = dashboard.actionNote;

  const directionList = $("cockpitDirectionList");
  directionList.innerHTML = "";
  const items = dashboard.directionSummaries || [];
  if (!items.length) {
    directionList.innerHTML = `<div class="support-empty">先完成岗位方向分类，这里才会出现每个方向的投递状态。</div>`;
    return;
  }

  items.forEach((item) => {
    const card = document.createElement("article");
    card.className = `cockpit-direction-card${item.isPriority ? " priority" : ""}`;
    card.innerHTML = `
      <div class="cockpit-direction-topline">
        <strong>${item.name}</strong>
        <span class="cockpit-direction-status">${item.status}</span>
      </div>
      <div class="cockpit-direction-meta">
        <span>覆盖 ${item.jdCount} 条 JD</span>
        <span>均分 ${item.averageMatchScore}</span>
      </div>
      <p>${item.isPrimary ? "当前优先投递版本" : "对应版本"}：${item.variantName}</p>
    `;
    directionList.appendChild(card);
  });
}

function deliveryStatusSelectMarkup(variant) {
  const current = normalizeDeliveryStatus(variant.deliveryStatus);
  return `
    <label class="status-select-wrap">
      <span>投递状态</span>
      <select class="status-select" data-id="${variant.id}">
        ${["待投", "已投", "等反馈", "暂缓"].map((status) => `<option value="${status}"${status === current ? " selected" : ""}>${status}</option>`).join("")}
      </select>
    </label>
  `;
}

function enhanceVariantRelationshipViews() {
  const detail = state.detailView;
  if (detail?.type === "batch" && detail.item) {
    const batchBlock = $("detailContent")?.querySelector(".detail-block");
    const resume = getResumeById(detail.item.resumeId);
    if (batchBlock && resume && !batchBlock.querySelector(".variant-inline-linkage")) {
      const linkage = document.createElement("div");
      linkage.className = "variant-inline-linkage";
      linkage.innerHTML = `
        <small>本批次基础简历</small>
        <strong>${resume.fileName || "未命名简历"}</strong>
        <p class="variant-source-note">${resume.summary?.overview || "这份基础简历被用于本次海投版本生成。"}${resume.createdAt ? ` · ${formatTimeLabel(resume.createdAt)}` : ""}</p>
      `;
      batchBlock.appendChild(linkage);
    }
  }

  if (detail?.type === "variant" && detail.item) {
    const detailShell = $("detailContent")?.querySelector(".detail-shell");
    const detailBlock = detailShell?.querySelector(".detail-block");
    if (detailBlock && !detailBlock.querySelector(".variant-inline-linkage")) {
      const source = describeResumeSource(detail.item);
      const linkage = document.createElement("div");
      linkage.className = "variant-inline-linkage";
      linkage.innerHTML = `
        <small>基于基础简历</small>
        <strong>${source.name}</strong>
        <p class="variant-source-note">${source.note}${source.time ? `  · ${source.time}` : ""}</p>
      `;
      detailBlock.appendChild(linkage);
    }
  }

  const cards = $("variantDetails")?.querySelectorAll(".variant-card") || [];
  cards.forEach((card, index) => {
    if (card.querySelector(".variant-inline-linkage")) return;
    const variant = state.variants[index];
    if (!variant) return;
    const source = describeResumeSource(variant);
    const linkage = document.createElement("div");
    linkage.className = "variant-inline-linkage";
    linkage.innerHTML = `
      <small>基于基础简历</small>
      <strong>${source.name}</strong>
      <p class="variant-source-note">${source.note}${source.time ? `  · ${source.time}` : ""}</p>
    `;
    const anchor = card.querySelector(".variant-inline-meta");
    if (anchor) anchor.insertAdjacentElement("afterend", linkage);
  });
}

function enhanceVariantDeliveryViews() {
  const headerRow = document.querySelector(".variant-table thead tr");
  if (headerRow && headerRow.children.length === 8) {
    const th = document.createElement("th");
    th.textContent = "投递状态";
    headerRow.insertBefore(th, headerRow.children[5]);
  }

  const rows = $("variantRows")?.querySelectorAll("tr") || [];
  rows.forEach((row, index) => {
    const emptyCell = row.querySelector(".table-empty");
    if (emptyCell) {
      emptyCell.colSpan = 9;
      return;
    }
    if (row.querySelector(".delivery-badge")) return;
    const variant = state.variants[index];
    if (!variant) return;
    const delivery = deliveryStatusMeta(variant.deliveryStatus);
    const td = document.createElement("td");
    td.innerHTML = `<span class="delivery-badge ${delivery.tone}">${delivery.label}</span>`;
    const actionCell = row.lastElementChild;
    row.insertBefore(td, actionCell);
  });

  const cards = $("variantDetails")?.querySelectorAll(".variant-card") || [];
  cards.forEach((card, index) => {
    const variant = state.variants[index];
    if (!variant) return;
    const delivery = deliveryStatusMeta(variant.deliveryStatus);

    const inlineMeta = card.querySelector(".variant-inline-meta");
    if (inlineMeta && !inlineMeta.querySelector(".delivery-badge")) {
      const badge = document.createElement("span");
      badge.className = `delivery-badge ${delivery.tone}`;
      badge.textContent = delivery.label;
      inlineMeta.appendChild(badge);
    }

    if (!card.querySelector(".status-select-wrap")) {
      const summaryHeading = Array.from(card.querySelectorAll("strong")).find((el) => el.textContent.includes("来源") || el.textContent.includes("草稿"));
      if (summaryHeading) {
        summaryHeading.insertAdjacentHTML("beforebegin", deliveryStatusSelectMarkup(variant));
      }
    }
  });

  if (state.detailView?.type === "variant" && state.detailView.item) {
    const container = $("detailContent");
    const detailShell = container?.querySelector(".detail-shell");
    if (detailShell && !detailShell.querySelector(".status-select-wrap")) {
      const variant = state.detailView.item;
      const delivery = deliveryStatusMeta(variant.deliveryStatus);
      const blocks = detailShell.querySelectorAll(".detail-block");
      if (blocks[0] && !blocks[0].querySelector(".delivery-badge")) {
        const note = document.createElement("p");
        note.className = "variant-secondary-note";
        note.innerHTML = `投递状态：<span class="delivery-badge ${delivery.tone}">${delivery.label}</span>`;
        blocks[0].appendChild(note);
      }
      if (blocks[1]) {
        blocks[1].insertAdjacentHTML("beforeend", deliveryStatusSelectMarkup(variant));
      }
    }
  }
}

function renderVariants() {
  const rows = $("variantRows");
  const details = $("variantDetails");
  rows.innerHTML = "";
  details.innerHTML = "";

  if (!state.variants.length) {
    rows.innerHTML = `<tr><td colspan="8" class="table-empty">先完成岗位方向分类，再生成简历版本。</td></tr>`;
    return;
  }

  state.variants.forEach((variant) => {
    const cluster = state.clusters.find((item) => item.id === variant.clusterId) || {};
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${variant.name}</strong></td>
      <td>${cluster.name || "-"}</td>
      <td>${cluster.jdCount || 0}</td>
      <td>${cluster.averageMatchScore || 0}</td>
      <td>${(variant.draftContent?.skills || []).slice(0, 5).join("、")}</td>
      <td>${(variant.rewritePlan || []).slice(0, 2).join("；")}</td>
      <td>${variant.truthCheckWarnings?.[0] || "需要人工确认真实性"}</td>
      <td><button class="secondary mini-export" type="button" data-id="${variant.id}">导出</button></td>
    `;
    rows.appendChild(tr);

    const panel = document.createElement("article");
    panel.className = "variant-card";
    panel.innerHTML = `
      <h3>${variant.draftContent?.title || variant.name}</h3>
      <p>${variant.positioning || ""}</p>
      <div class="variant-columns">
        <div>
          <strong>关键词策略</strong>
          <div class="chips">${(variant.draftContent?.skills || [])
            .slice(0, 10)
            .map((kw) => `<span class="chip">${kw}</span>`)
            .join("")}</div>
        </div>
        <div>
          <strong>事实风险</strong>
          <ul>${(variant.truthCheckWarnings || [])
            .map((item) => `<li>${item}</li>`)
            .join("")}</ul>
        </div>
      </div>
      <strong>草稿摘要</strong>
      <p>${variant.draftContent?.summary || ""}</p>
      <strong>改写要点</strong>
      <ul>${(variant.draftContent?.bullets || []).map((item) => `<li>${item}</li>`).join("")}</ul>
    `;
    details.appendChild(panel);
  });
}

function renderSingleState() {
  if (state.ui.singleStatus === "idle") {
    renderReportFallback();
    renderReportState("等待上传简历并填写 JD。", "info");
    return;
  }
  if (state.ui.singleStatus === "resume_ready") {
    renderReportState("简历已就绪，接下来可以粘贴 JD 或从链接获取。", "info");
    return;
  }
  if (state.ui.singleStatus === "jd_fetching") {
    renderReportState("正在获取 JD 内容，请稍候。", "info");
    return;
  }
  if (state.ui.singleStatus === "jd_ready") {
    renderReportState("JD 已就绪，可以生成匹配报告了。", "success");
    return;
  }
  if (state.ui.singleStatus === "analyzing") {
    renderReportState("正在生成匹配报告，请稍候。", "info");
    return;
  }
  if (state.ui.singleStatus === "analysis_ready") {
    const provider = state.analysis?.provider === "deepseek" ? "DeepSeek" : "本地规则";
    const fallback = state.analysis?.fallbackReason ? ` ${state.analysis.fallbackReason}` : "";
    renderReportState(`报告已生成，当前结果来源：${provider}${fallback ? `。${fallback}` : ""}`, "success");
    return;
  }
  if (state.ui.singleStatus === "error") {
    renderReportState(state.ui.reportError || "当前操作未完成，请检查提示后重试。", "warn");
  }
}

function renderBatchStatePanels() {
  renderBatchSetupGuide();
  if (state.ui.batchStatus === "idle") {
    renderBatchState("建议单次分析 5–30 条 JD，分类结果会更清晰。", "info");
  } else if (state.ui.batchStatus === "parsing") {
    renderBatchState("正在解析 JD 内容，请稍候。", "info");
  } else if (state.ui.batchStatus === "partial_success") {
    renderBatchState(`已解析 ${state.batchJds.length} 条 JD，另有 ${state.ui.batchFailures.length} 条抓取失败。`, "warn");
  } else if (state.ui.batchStatus === "success") {
    renderBatchState(`已解析 ${state.batchJds.length} 条 JD，可以继续做岗位方向分类。`, "success");
  } else if (state.ui.batchStatus === "clustering") {
    renderBatchState("正在生成岗位方向分类，请稍候。", "info");
  } else if (state.ui.batchStatus === "varianting") {
    renderBatchState("正在生成简历版本草稿，请稍候。", "info");
  } else if (state.ui.batchStatus === "error") {
    renderBatchState("本次批量处理未完成，请检查失败提示后重试。", "warn");
  }
  renderBatchFailures();
}

renderVariants = function renderVariantsOverride() {
  const rows = $("variantRows");
  const details = $("variantDetails");
  rows.innerHTML = "";
  details.innerHTML = "";

  if (!state.variants.length) {
    rows.innerHTML = `<tr><td colspan="8" class="table-empty">先完成岗位方向分类，再生成简历版本。</td></tr>`;
    return;
  }

  state.variants.forEach((variant) => {
    const cluster = state.clusters.find((item) => item.id === variant.clusterId) || {};
    const row = document.createElement("tr");
    row.innerHTML = `
      <td><strong>${variant.name || "未命名版本"}</strong></td>
      <td>${cluster.name || "-"}</td>
      <td>${cluster.jdCount || 0}</td>
      <td>${cluster.averageMatchScore || 0}</td>
      <td>${(variant.draftContent?.skills || []).slice(0, 5).join(" / ") || "-"}</td>
      <td><span class="delivery-badge ${delivery.tone}">${delivery.label}</span></td>
      <td>${(variant.rewritePlan || []).slice(0, 2).join("；") || "-"}</td>
      <td>${variant.truthCheckWarnings?.[0] || "需要人工确认真实性"}</td>
      <td>
        <div class="variant-row-actions">
          <button class="secondary mini-detail" type="button" data-id="${variant.id}">详情</button>
          <button class="secondary mini-export" type="button" data-id="${variant.id}">导出</button>
        </div>
      </td>
    `;
    rows.appendChild(row);

    const panel = document.createElement("article");
    panel.className = "variant-card";
    panel.innerHTML = `
      <h3>${variant.draftContent?.title || variant.name || "简历版本"}</h3>
      <p>${variant.positioning || ""}</p>
      <div class="variant-columns">
        <div>
          <strong>关键词策略</strong>
          <div class="chips">${(variant.draftContent?.skills || [])
            .slice(0, 10)
            .map((kw) => `<span class="chip">${kw}</span>`)
            .join("")}</div>
        </div>
        <div>
          <strong>事实风险</strong>
          <ul>${(variant.truthCheckWarnings || []).map((item) => `<li>${item}</li>`).join("")}</ul>
        </div>
      </div>
      <div class="variant-inline-meta">
        <span>${cluster.name || "未分配方向"}</span>
        <span>${variantDownloadLabel(variant)}</span>
        <span class="delivery-badge ${delivery.tone}">${delivery.label}</span>
      </div>
      <strong>草稿摘要</strong>
      <p>${variant.draftContent?.summary || ""}</p>
      <strong>鏀瑰啓 bullet</strong>
      <ul>${(variant.draftContent?.bullets || []).map((item) => `<li>${item}</li>`).join("")}</ul>
      <div class="support-actions variant-card-actions">
         <button class="secondary variant-detail-btn" type="button" data-id="${variant.id}">查看详情</button>
         <button class="secondary mini-export" type="button" data-id="${variant.id}">导出 Word</button>
         ${variant.exportPath ? `<a class="detail-link" href="${variant.exportPath}" target="_blank" rel="noreferrer">下载已导出文件</a>` : ""}
      </div>
    `;
    details.appendChild(panel);
  });
}

function renderAll() {
  renderResumePanel();
  renderSingleState();
  renderBatchDraftQueue();
  renderJdList();
  renderClusters();
  renderBatchDashboard();
  renderVariants();
  renderBatchStatePanels();
  enhanceVariantRelationshipViews();
  enhanceVariantDeliveryViews();
}

const originalRenderDetailPanel = renderDetailPanel;
renderDetailPanel = function renderDetailPanelWithLinkage() {
  originalRenderDetailPanel();
  enhanceVariantRelationshipViews();
};

const linkedRenderDetailPanel = renderDetailPanel;
renderDetailPanel = function renderDetailPanelWithBatchReport() {
  const container = $("detailContent");
  if (!container) return;
  if (state.detailView?.type === "batch" && state.detailView?.item) {
    container.innerHTML = renderBatchDetailMarkup(state.detailView.item);
    enhanceVariantRelationshipViews();
    enhanceVariantDeliveryViews();
    return;
  }
  linkedRenderDetailPanel();
  enhanceVariantDeliveryViews();
};

function localKeywords(text) {
  const catalog = [
    "JavaScript", "TypeScript", "React", "Vue", "Node.js", "Python", "Java", "Go", "SQL",
    "数据分析", "机器学习", "大模型", "NLP", "产品设计", "AI产品", "B端产品", "内容产品",
    "策略产品", "增长产品", "数据产品", "SaaS", "增长", "用户研究", "需求分析", "项目管理",
    "金融", "电商", "教育", "医疗", "运营", "销售", "市场", "团队管理", "沟通",
    "985高校", "硕士在读", "海外留学", "计算机", "软件工程", "社会心理", "市场营销",
    "互联网产品实习", "社交产品", "职场社交", "社交网络", "职场人脉", "产品开发流程",
    "产品文档", "需求文档", "原型设计", "Axure", "Sketch", "Office", "XMind", "Excel",
    "数据敏感度", "竞品分析", "需求调研", "用户需求", "用户反馈", "用户体验", "交互设计",
    "审美能力", "学习能力", "沟通能力", "团队协作", "责任心", "自我驱动", "项目跟进",
    "跨部门协作", "研发协作", "设计协作", "运营协作", "项目交付", "产品上线",
    "用户活跃度", "留存率", "转化率", "关键指标", "数据监控", "产品优化", "产品策略",
  ];

  const hits = catalog.filter((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(escaped, "i").test(text);
  });

  const derivedRules = [
    ["社交产品", /社交产品|社交网络|职场人脉/],
    ["职场社交", /职场社交|职场人脉/],
    ["竞品分析", /竞品|市场动态/],
    ["需求调研", /需求调研|用户需求|挖掘用户需求/],
    ["用户反馈", /用户反馈|收集用户/],
    ["交互设计", /交互设计|用户体验/],
    ["产品原型", /原型|Axure|Sketch/],
    ["产品文档", /产品文档|需求文档/],
    ["数据分析", /数据分析|数据跟踪|数据监控|数据中发现/],
    ["关键指标", /关键指标|用户活跃度|留存率|转化率/],
    ["项目跟进", /项目跟进|开发进度|按时交付/],
    ["跨部门协作", /研发|设计|运营|沟通协调/],
    ["产品优化", /产品优化|优化建议|持续优化/],
    ["产品上线", /产品上线|上线后的运营/],
  ];
  const derivedHits = derivedRules.filter(([, regex]) => regex.test(text)).map(([label]) => label);

  const noisy = /者优先|熟练使用|参与过|具备一定|有一定|能够|负责|协助|相关项目|办公软件|进行测试|进行分析|深入的理解|职位要求|任职要求|经验要求|技能要求|能力与素质|职位描述|岗位职责/;
  const zhTerms = [...String(text).matchAll(/[\u4e00-\u9fa5]{2,6}/g)]
    .map((m) => m[0])
    .filter((word) => !noisy.test(word) && !/^(产品|用户|数据|能力|要求|优先|熟悉|使用|相关|项目|工作|功能|特点)$/.test(word))
    .slice(0, 100);
  const freq = new Map();
  for (const word of zhTerms) freq.set(word, (freq.get(word) || 0) + 1);

  return [
      ...new Set([
      ...derivedHits,
      ...hits,
      ...[...freq.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([word]) => word),
    ]),
  ].slice(0, 18);
}

async function uploadResume(file) {
  state.ui.uploadStatus = "uploading";
  state.ui.singleStatus = "idle";
  state.ui.reportError = "";
  const shortName = file.name.length > 24 ? `${file.name.slice(0, 24)}...` : file.name;
  $("resumeMeta").textContent = `正在解析：${shortName}`;
  $("resumeMeta").classList.remove("hidden");
  renderUploadState("正在上传并解析简历，请稍候。", "info");
  renderReportFallback();
  renderSingleState();

  const form = new FormData();
  form.append("resume", file);

  try {
    const response = await fetch("/api/upload-resume", { method: "POST", body: form });
    const data = await parseResponse(response);
    state.resumeId = data.resumeId || "";
    state.resumeText = data.text || "";
    state.resumeSummary = data.summary || null;
    state.resumeKeywordGroups = data.keywordGroups || [];
    state.jdSourceUrl = "";
    state.reportId = "";
    state.batchRunId = "";
    state.ui.uploadStatus = "success";
    state.ui.singleStatus = "resume_ready";
    state.analysis = null;

    $("resumeMeta").textContent = `${data.fileName} · 已解析 ${state.resumeText.length} 字`;
    $("resumeMeta").classList.remove("hidden");

    const isPdf = data.previewType === "pdf" && data.previewUrl;
    $("pdfPreview").classList.toggle("hidden", !isPdf);
    $("resumePreview").classList.toggle("hidden", Boolean(isPdf));
    $("pdfPreview").dataset.active = isPdf ? "true" : "false";
    if (isPdf) {
      $("pdfPreview").src = data.previewUrl;
    } else {
      $("pdfPreview").src = "";
      renderSummary($("resumePreview"), data.summary);
    }

    renderChips($("resumeKeywords"), data.keywords, "等待解析简历关键词");
    renderKeywordGroups($("resumeKeywordGroups"), state.resumeKeywordGroups);
    renderUploadState(data.message || "简历解析完成。", "success");
    saveValue(storageKeys.resumeId, state.resumeId);
    await loadResumeLibrary();
    renderSingleState();
    updateRestoreButtons();
    trackEvent("resume.uploaded", {
      fileName: data.fileName,
      parseStatus: data.parseStatus || "",
      ocrStatus: data.ocrStatus || "",
    });
    toast(data.message || "简历解析完成");
  } catch (error) {
    state.ui.uploadStatus = "error";
    state.ui.singleStatus = "error";
    state.ui.reportError = handleUiError(error, { statusNoteId: "resumeStatusNote" });
    $("resumeMeta").classList.add("hidden");
    renderSingleState();
  }
}

async function fetchJd() {
  const url = $("jdUrl").value.trim();
  if (!url) return toast("请先粘贴 JD 链接", "warn");

  state.ui.singleStatus = "jd_fetching";
  renderSingleState();
  const btn = $("fetchJdBtn");
  setLoading(btn, true, "获取中...");
  try {
    const data = await postJson("/api/fetch-jd", { url });
    $("jdText").value = data.text;
    state.jdText = data.text;
    state.jdSourceUrl = url;
    state.ui.singleStatus = "jd_ready";
    renderChips($("jdKeywords"), localKeywords(data.text), "等待提取 JD 关键词");
    renderSingleState();
    trackEvent("jd.fetched", {
      provider: data.provider || "direct-fetch",
      fallbackReason: data.fallbackReason || "",
      textLength: data.text.length,
    });
    toast(data.message || "JD 获取完成");
  } catch (error) {
    state.ui.singleStatus = state.resumeText ? "resume_ready" : "error";
    handleUiError(error, { statusNoteId: "reportStatusNote" });
    renderSingleState();
  } finally {
    setLoading(btn, false);
  }
}

async function uploadJdImage(file) {
  if (!file) return;
  const isSupportedImage = /^image\/(png|jpe?g|webp)$/i.test(file.type || "") || /\.(png|jpe?g|webp)$/i.test(file.name || "");
  if (!isSupportedImage) {
    return toast("请上传 PNG、JPG 或 WebP 图片", "warn");
  }

  const btn = $("jdImageBtn");
  const form = new FormData();
  form.append("jdImage", file);
  setStatusNote("jdImageStatusNote", "info", "正在识别图片文字...");
  setLoading(btn, true, "识别中...");

  try {
    const response = await fetch("/api/ocr-jd-image", { method: "POST", body: form });
    const data = await parseResponse(response);
    $("jdText").value = data.text || "";
    state.jdText = data.text || "";
    state.jdSourceUrl = "";
    state.ui.singleStatus = state.resumeText ? "jd_ready" : "idle";
    renderChips($("jdKeywords"), localKeywords(state.jdText), "等待提取 JD 关键词");
    renderSingleState();
    setStatusNote("jdImageStatusNote", "success", data.message || "已识别图片文字，请检查后生成报告。");
    trackEvent("jd.image_ocr", {
      fileType: file.type || "",
      textLength: state.jdText.length,
    });
    toast("JD 图片识别完成");
  } catch (error) {
    handleUiError(error, { statusNoteId: "jdImageStatusNote" });
  } finally {
    setLoading(btn, false);
    $("jdImageInput").value = "";
  }
}

async function analyze() {
  state.jdText = $("jdText").value.trim();
  if (!state.resumeText) return toast("请先上传并解析简历", "warn");
  if (!state.jdText) return toast("请先填写 JD 内容", "warn");

  state.ui.singleStatus = "analyzing";
  state.ui.reportError = "";
  renderSingleState();

  const btn = $("analyzeBtn");
  setLoading(btn, true, "分析中...");
  try {
    const data = await postJson("/api/analyze", {
      resumeId: state.resumeId,
      resumeText: state.resumeText,
      jdText: state.jdText,
      jdSourceUrl: state.jdSourceUrl,
    });
    state.reportId = data.reportId || "";
    state.resumeId = data.resumeId || state.resumeId;
    renderAnalysis(data);
    state.ui.singleStatus = "analysis_ready";
    saveValue(storageKeys.reportId, state.reportId);
    saveValue(storageKeys.resumeId, state.resumeId);
    await loadAuth();
    await loadRecentHistory();
    await loadUsageCenter();
    updateRestoreButtons();
    renderSingleState();
    trackEvent("analysis.generated", {
      reportId: state.reportId,
      provider: data.analysis?.provider || "",
      score: data.analysis?.score ?? null,
      cacheHits: data.cacheStats?.hits ?? data.analysis?.cacheStats?.hits ?? 0,
    });
    toast(data.message || "匹配报告已生成");
  } catch (error) {
    state.ui.singleStatus = "error";
    state.ui.reportError = handleUiError(error, { statusNoteId: "reportStatusNote" });
    renderSingleState();
  } finally {
    setLoading(btn, false);
  }
}

function sampleBatchText() {
  return [
    "岗位：AI 产品经理\n负责 AI Agent、知识库、工作流和 SaaS 产品规划，推动需求分析、用户研究、跨部门协作与 0-1 上线。要求熟悉 AIGC、Prompt、SQL、CRM 和数据分析，3 年以上产品经验。",
    "岗位：内容产品经理\n负责内容生产、审核、分发和推荐策略，优化创作者工具、内容标签、SEO 和用户留存。要求熟悉内容生态、CMS、社区运营、数据分析和 A/B 实验。",
    "岗位：产品策略经理\n负责市场洞察、竞品研究、商业化策略和产品路线规划，结合数据分析制定增长与定价策略。要求具备战略思考、商业分析、跨部门沟通和项目管理能力。",
    "岗位：增长产品经理\n负责用户拉新、转化、留存和增长实验，设计会员、裂变、活动和数据看板。要求熟悉增长模型、埋点、A/B 测试、SQL 和数据驱动决策。",
    "岗位：数据产品经理\n负责数据平台、BI 报表、指标体系、数据治理和分析工具建设，服务业务团队提升决策效率。要求熟悉 SQL、数据仓库、指标口径和 B 端产品设计。",
  ].join("\n---\n");
}

function splitBatchText(text) {
  return String(text || "")
    .split(/\n\s*---\s*\n/g)
    .map((item) => item.trim())
    .filter(Boolean);
}

function syncBatchTextField() {
  const field = $("batchText");
  if (field) field.value = state.batchDraftJds.join("\n---\n");
}

function resetBatchResultsForDraftChange() {
  state.batchRunId = "";
  state.batchJds = [];
  state.clusters = [];
  state.variants = [];
  state.ui.batchFailures = [];
  saveValue(storageKeys.batchRunId, "");
}

function renderBatchOutputsAfterDraftChange() {
  renderBatchDraftQueue();
  renderJdList();
  renderClusters();
  renderBatchDashboard();
  renderVariants();
  updateRestoreButtons();
}

function renderBatchDraftQueue() {
  const list = $("batchDraftQueue");
  if (!list) return;
  list.innerHTML = "";
  $("jdCounter").textContent = `${state.batchJds.length || state.batchDraftJds.length} 条`;

  if (!state.batchDraftJds.length) {
    list.className = "draft-jd-list empty-state";
    list.textContent = "尚未加入 JD。";
    syncBatchTextField();
    return;
  }

  list.className = "draft-jd-list";
  state.batchDraftJds.forEach((text, index) => {
    const item = document.createElement("article");
    item.className = "draft-jd-item";

    const copy = document.createElement("div");
    copy.className = "draft-jd-copy";

    const title = document.createElement("strong");
    title.textContent = `第 ${index + 1} 条 JD`;
    const summary = document.createElement("p");
    summary.textContent = trimText(text.replace(/\s+/g, " "), 110);
    copy.append(title, summary);

    const remove = document.createElement("button");
    remove.className = "secondary mini-primary draft-remove-btn";
    remove.type = "button";
    remove.dataset.index = String(index);
    remove.textContent = "删除";

    item.append(copy, remove);
    list.appendChild(item);
  });
  syncBatchTextField();
}

function addBatchDraftJd() {
  const text = $("batchDraftText").value.trim();
  if (!text) return toast("请先粘贴一条 JD，或上传图片识别文字", "warn");
  resetBatchResultsForDraftChange();
  state.batchDraftJds.push(text);
  $("batchDraftText").value = "";
  state.ui.batchStatus = "idle";
  renderBatchOutputsAfterDraftChange();
  renderBatchStatePanels();
  toast(`已加入第 ${state.batchDraftJds.length} 条 JD`);
}

function removeBatchDraftJd(index) {
  resetBatchResultsForDraftChange();
  state.batchDraftJds.splice(index, 1);
  state.ui.batchStatus = "idle";
  renderBatchOutputsAfterDraftChange();
  renderBatchStatePanels();
}

async function uploadBatchJdImage(file) {
  if (!file) return;
  if (!requireAuthAction("登录后才能识别和保存 JD 图片。")) return;
  const isSupportedImage = /^image\/(png|jpe?g|webp)$/i.test(file.type || "") || /\.(png|jpe?g|webp)$/i.test(file.name || "");
  if (!isSupportedImage) return toast("请上传 PNG、JPG 或 WebP 图片", "warn");

  const btn = $("batchImageBtn");
  const form = new FormData();
  form.append("jdImage", file);
  setStatusNote("batchImageStatusNote", "info", "正在识别图片文字...");
  setLoading(btn, true, "识别中...");

  try {
    const response = await fetch("/api/ocr-jd-image", { method: "POST", body: form });
    const data = await parseResponse(response);
    $("batchDraftText").value = data.text || "";
    setStatusNote("batchImageStatusNote", "success", "已识别图片文字，检查后点 + 加入队列。");
    renderBatchSetupGuide();
    trackEvent("jd.image_ocr.batch", {
      fileType: file.type || "",
      textLength: (data.text || "").length,
    });
    toast("JD 图片识别完成");
  } catch (error) {
    handleUiError(error, { statusNoteId: "batchImageStatusNote" });
  } finally {
    setLoading(btn, false);
    $("batchImageInput").value = "";
  }
}

async function parseBatchJds() {
  if (!state.resumeText) return toast("请先上传基础简历", "warn");

  const draftText = $("batchDraftText").value.trim();
  if (draftText) addBatchDraftJd();
  const batchText = state.batchDraftJds.join("\n---\n").trim();
  syncBatchTextField();
  const urls = $("batchUrls")
    .value
    .split(/\n+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!batchText && !urls.length) {
    state.ui.batchStatus = "idle";
    renderBatchStatePanels();
    return toast("请先粘贴 JD 文本，或填写至少一个 JD 链接", "warn");
  }

  state.ui.batchStatus = "parsing";
  state.ui.batchFailures = [];
  renderBatchStatePanels();

  const btn = $("parseBatchBtn");
  setLoading(btn, true, "解析中...");
  try {
    const data = await postJson("/api/batch-jds", {
      resumeId: state.resumeId,
      resumeText: state.resumeText,
      batchText,
      urls,
    });

    state.batchRunId = data.batchRunId || "";
    state.resumeId = data.resumeId || state.resumeId;
    state.batchJds = data.items || [];
    state.clusters = [];
    state.variants = [];
    state.ui.batchFailures = data.failures || [];
    state.ui.batchStatus = state.ui.batchFailures.length ? "partial_success" : "success";

    saveValue(storageKeys.batchRunId, state.batchRunId);
    saveValue(storageKeys.resumeId, state.resumeId);
    await loadAuth();
    await loadRecentHistory();
    await loadUsageCenter();
    updateRestoreButtons();
    renderAll();
    toast(data.message || `已解析 ${state.batchJds.length} 条 JD`);
  } catch (error) {
    state.ui.batchStatus = "error";
    state.ui.batchFailures = [];
    handleUiError(error, { statusNoteId: "batchStatusNote" });
    renderBatchStatePanels();
  } finally {
    setLoading(btn, false);
  }
}

async function clusterJds() {
  if (state.batchJds.length < 2) return toast("至少需要 2 条 JD 才能分类", "warn");

  state.ui.batchStatus = "clustering";
  renderBatchStatePanels();
  const btn = $("clusterBtn");
  setLoading(btn, true, "分类中...");
  try {
    const data = await postJson("/api/cluster-jds", {
      batchRunId: state.batchRunId,
      resumeText: state.resumeText,
      jds: state.batchJds,
    });
    state.clusters = data.clusters || [];
    state.ui.batchStatus = "success";
    renderAll();
    toast(data.message || `已生成 ${state.clusters.length} 个岗位方向`);
  } catch (error) {
    state.ui.batchStatus = "error";
    handleUiError(error, { statusNoteId: "batchStatusNote" });
    renderBatchStatePanels();
  } finally {
    setLoading(btn, false);
  }
}

async function generateVariants() {
  if (!state.resumeText) return toast("请先上传基础简历", "warn");
  if (!state.clusters.length) return toast("请先生成岗位方向分类", "warn");

  state.ui.batchStatus = "varianting";
  renderBatchStatePanels();
  const btn = $("variantBtn");
  setLoading(btn, true, "生成中...");
  try {
    const data = await postJson("/api/resume-variants", {
      resumeId: state.resumeId,
      batchRunId: state.batchRunId,
      resumeText: state.resumeText,
      jds: state.batchJds,
      clusters: state.clusters,
    });
    state.variants = sortedVariants(data.variants || []);
    state.ui.batchStatus = "success";
    renderAll();
    toast(data.message || `已生成 ${state.variants.length} 个简历版本`);
  } catch (error) {
    state.ui.batchStatus = "error";
    handleUiError(error, { statusNoteId: "batchStatusNote" });
    renderBatchStatePanels();
  } finally {
    setLoading(btn, false);
  }
}

async function exportVariant(id) {
  const variant = state.variants.find((item) => item.id === id);
  if (!variant) return;
  try {
    const data = await postJson("/api/export-resume", { variant });
    if (data.downloadUrl) {
      window.open(data.downloadUrl, "_blank");
    }
    toast(data.message || "Word 简历草稿已生成");
  } catch (error) {
    handleUiError(error);
  }
}

exportVariant = async function exportVariantOverride(id) {
  const variant = state.variants.find((item) => item.id === id);
  if (!variant) return;
  try {
    const data = await postJson("/api/export-resume", { variant });
    const history = Array.isArray(variant.exportHistory) ? [...variant.exportHistory] : [];
    history.unshift({
      fileName: data.fileName,
      downloadUrl: data.downloadUrl,
      exportedAt: data.exportedAt || new Date().toISOString(),
    });
    const nextVariant = {
      ...variant,
      exportFileName: data.fileName || variant.exportFileName,
      exportPath: data.downloadUrl || variant.exportPath,
      lastExportedAt: data.exportedAt || new Date().toISOString(),
      exportHistory: history.slice(0, 10),
    };
    state.variants = sortedVariants(state.variants.map((item) => (item.id === id ? nextVariant : item)));
    if (state.detailView?.type === "variant" && state.detailView?.item?.id === id) {
      state.detailView = { type: "variant", item: nextVariant };
      renderDetailPanel();
    }
    renderVariants();
    await loadAuth();
    await loadUsageCenter();
    trackEvent("resume.exported", {
      variantId: id,
      fileName: data.fileName || "",
    });
    if (data.downloadUrl) {
      window.open(data.downloadUrl, "_blank");
    }
    toast(data.message || "Word 简历草稿已生成");
  } catch (error) {
    handleUiError(error);
  }
};

renderVariants = function renderVariantsManaged() {
  const rows = $("variantRows");
  const details = $("variantDetails");
  rows.innerHTML = "";
  details.innerHTML = "";

  if (!state.variants.length) {
    rows.innerHTML = `<tr><td colspan="8" class="table-empty">先完成人岗方向分类，再生成简历版本。</td></tr>`;
    return;
  }

  state.variants.forEach((variant) => {
    const cluster = state.clusters.find((item) => item.id === variant.clusterId) || {};
    const displayName = variantDisplayName(variant);
    const delivery = deliveryStatusMeta(variant.deliveryStatus);
    const primaryText = variant.isPrimary ? "当前优先投递" : "设为优先投递";
    const inlinePrimary = variant.isPrimary
      ? `<span class="primary-flag">当前优先投递</span>`
      : localizeBatchText(cluster.name || "未分配方向");
    const historyItems = (variant.exportHistory || []).slice(0, 3).map((entry) => `
      <div class="variant-history-item">
        <span>${entry.fileName || "Word 草稿"}</span>
        <span>${formatTimeLabel(entry.exportedAt)}</span>
      </div>
    `).join("");

    const row = document.createElement("tr");
    row.innerHTML = `
      <td>
        <strong>${displayName}</strong>
        ${variant.isPrimary ? `<div class="variant-secondary-note">当前优先投递</div>` : ""}
      </td>
      <td>${localizeBatchText(cluster.name || "-")}</td>
      <td>${cluster.jdCount || 0}</td>
      <td>${cluster.averageMatchScore || 0}</td>
      <td>${(variant.draftContent?.skills || []).slice(0, 5).map(localizeBatchText).join("、") || "-"}</td>
      <td>${(variant.rewritePlan || []).slice(0, 2).map(localizeBatchText).join("；") || "-"}</td>
      <td>${localizeBatchText(variant.truthCheckWarnings?.[0] || "需要人工确认真实性")}</td>
      <td>
        <div class="variant-row-actions">
          <button class="secondary mini-detail" type="button" data-id="${variant.id}">详情</button>
          <button class="secondary mini-primary" type="button" data-id="${variant.id}">${primaryText}</button>
          <button class="secondary mini-export" type="button" data-id="${variant.id}">导出</button>
        </div>
      </td>
    `;
    rows.appendChild(row);

    const panel = document.createElement("article");
    panel.className = "variant-card";
    panel.innerHTML = `
      <h3>${localizeBatchText(variant.draftContent?.title || displayName)}</h3>
      <p>${localizeBatchText(variant.positioning || "")}</p>
      <div class="variant-columns">
        <div>
          <strong>关键词策略</strong>
          <div class="chips">${(variant.draftContent?.skills || [])
            .slice(0, 10)
            .map((kw) => `<span class="chip">${localizeBatchText(kw)}</span>`)
            .join("")}</div>
        </div>
        <div>
          <strong>事实风险</strong>
          <ul>${(variant.truthCheckWarnings || []).map((item) => `<li>${localizeBatchText(item)}</li>`).join("")}</ul>
        </div>
      </div>
      <div class="variant-inline-meta">
        <span>${inlinePrimary}</span>
        <span>${variantDownloadLabel(variant)}</span>
      </div>
      <strong>草稿摘要</strong>
      <p>${localizeBatchText(variant.draftContent?.summary || "")}</p>
      <strong>改写要点</strong>
      <ul>${(variant.draftContent?.bullets || []).map((item) => `<li>${localizeBatchText(item)}</li>`).join("")}</ul>
      <strong>最近导出</strong>
      <div class="variant-history">
        ${historyItems || `<div class="variant-history-item"><span>还没有导出记录</span><span>等待导出</span></div>`}
      </div>
      <form class="variant-rename-form" data-id="${variant.id}">
        <input type="text" name="variantName" value="${displayName}" maxlength="60" />
        <button type="submit" class="secondary">保存名称</button>
      </form>
      <div class="support-actions variant-card-actions">
        <button class="secondary variant-detail-btn" type="button" data-id="${variant.id}">查看详情</button>
        <button class="secondary mini-primary" type="button" data-id="${variant.id}">${primaryText}</button>
        <button class="secondary mini-export" type="button" data-id="${variant.id}">导出 Word</button>
        ${variant.exportPath ? `<a class="detail-link" href="${variant.exportPath}" target="_blank" rel="noreferrer">涓嬭浇宸插鍑烘枃浠?/a>` : ""}
      </div>
    `;
    details.appendChild(panel);
  });
};

async function renameVariant(id, name) {
  const trimmed = String(name || "").trim();
  if (!trimmed) return toast("版本名称不能为空", "warn");
  try {
    await updateVariant(id, { name: trimmed }, "版本名称已更新");
  } catch (error) {
    handleUiError(error);
  }
}

async function setPrimaryVariant(id) {
  const variant = state.variants.find((item) => item.id === id);
  if (!variant || variant.isPrimary) return;
  try {
    await updateVariant(id, { isPrimary: true }, "已设为当前优先投递版本");
  } catch (error) {
    handleUiError(error);
  }
}

async function setDeliveryStatus(id, deliveryStatus) {
  const variant = state.variants.find((item) => item.id === id);
  if (!variant) return;
  const nextStatus = normalizeDeliveryStatus(deliveryStatus);
  if (normalizeDeliveryStatus(variant.deliveryStatus) === nextStatus) return;
  try {
    await updateVariant(id, { deliveryStatus: nextStatus }, "投递状态已更新");
  } catch (error) {
    handleUiError(error);
  }
}

const originalHandleUiError = handleUiError;
handleUiError = function handleUiErrorWithAuth(error, options = {}) {
  const payload = error?.payload || {};
  if (payload.error === "auth_required") {
    openAuthModal("login", payload.message || "请先登录后再继续。");
  }
  if (payload.error === "invalid_credentials") {
    openAuthModal("login", payload.message || "邮箱或密码不正确。");
  }
  if (payload.error === "email_taken") {
    openAuthModal("register", payload.message || "这个邮箱已经注册过了。");
  }
  if (payload.error === "quota_exceeded") {
    renderAuthQuotaPanel();
    openAuthModal("login", payload.message || "当前额度已用完。");
  }
  return originalHandleUiError(error, options);
};

const originalUpdateRestoreButtons = updateRestoreButtons;
updateRestoreButtons = function updateRestoreButtonsWithAuth() {
  if (!state.auth.user) {
    $("restoreReportBtn").classList.add("hidden");
    $("restoreBatchBtn").classList.add("hidden");
    return;
  }
  originalUpdateRestoreButtons();
};

const originalRenderResumeLibrary = renderResumeLibrary;
renderResumeLibrary = function renderResumeLibraryWithAuth() {
  const container = $("resumeLibrary");
  if (!container) return;
  if (!state.auth.user) {
    container.innerHTML = `<div class="support-empty">登录后，这里会显示你上传过的简历。</div>`;
    return;
  }
  originalRenderResumeLibrary();
};

const originalRenderRecentHistory = renderRecentHistory;
renderRecentHistory = function renderRecentHistoryWithAuth() {
  const container = $("recentHistory");
  if (!container) return;
  if (!state.auth.user) {
    container.innerHTML = `<div class="support-empty">登录后，这里会保留你的报告和海投批次。</div>`;
    return;
  }
  originalRenderRecentHistory();
};

const originalRenderUsageCenter = renderUsageCenter;
renderUsageCenter = function renderUsageCenterWithAuth() {
  const container = $("usageCenter");
  if (!container) return;
  if (!state.auth.user) {
    container.innerHTML = `<div class="support-empty">登录后，这里会显示你的额度和最近操作记录。</div>`;
    return;
  }
  originalRenderUsageCenter();
};

const originalLoadResumeLibrary = loadResumeLibrary;
loadResumeLibrary = async function loadResumeLibraryWithAuth() {
  if (!state.auth.user) {
    state.resumeLibrary = [];
    renderResumeLibrary();
    return;
  }
  return originalLoadResumeLibrary();
};

const originalLoadRecentHistory = loadRecentHistory;
loadRecentHistory = async function loadRecentHistoryWithAuth() {
  if (!state.auth.user) {
    state.recentHistory = [];
    renderRecentHistory();
    return;
  }
  return originalLoadRecentHistory();
};

const originalLoadUsageCenter = loadUsageCenter;
loadUsageCenter = async function loadUsageCenterWithAuth() {
  if (!state.auth.user) {
    state.usageCenter = null;
    renderUsageCenter();
    return;
  }
  return originalLoadUsageCenter();
};

const originalUploadResume = uploadResume;
uploadResume = async function uploadResumeWithAuth(file) {
  if (!requireAuthAction("登录后才能上传和保存简历。")) return;
  return originalUploadResume(file);
};

const originalAnalyze = analyze;
analyze = async function analyzeWithAuth() {
  if (!requireAuthAction("登录后才能生成和保存匹配报告。")) return;
  return originalAnalyze();
};

const originalParseBatchJds = parseBatchJds;
parseBatchJds = async function parseBatchJdsWithAuth() {
  if (!requireAuthAction("登录后才能发起海投分析。")) return;
  return originalParseBatchJds();
};

const originalClusterJds = clusterJds;
clusterJds = async function clusterJdsWithAuth() {
  if (!requireAuthAction("登录后才能生成岗位方向分类。")) return;
  return originalClusterJds();
};

const originalGenerateVariants = generateVariants;
generateVariants = async function generateVariantsWithAuth() {
  if (!requireAuthAction("登录后才能生成简历版本。")) return;
  return originalGenerateVariants();
};

const originalExportVariant = exportVariant;
exportVariant = async function exportVariantWithAuth(id) {
  if (!requireAuthAction("登录后才能导出简历版本。")) return;
  return originalExportVariant(id);
};

const originalOpenCurrentBatchDetail = openCurrentBatchDetail;
openCurrentBatchDetail = async function openCurrentBatchDetailWithAuth() {
  if (!requireAuthAction("登录后才能查看已保存的海投批次。")) return;
  return originalOpenCurrentBatchDetail();
};

$("singleModeBtn").addEventListener("click", () => switchMode("single"));
$("batchModeBtn").addEventListener("click", () => switchMode("batch"));

$("modeActions").addEventListener("click", (event) => {
  const btn = event.target.closest(".nav-link-btn");
  if (!btn) return;
  scrollToSection(btn.dataset.target);
});

$("heroPrimaryBtn").addEventListener("click", () => {
  scrollToSection(state.mode === "single" ? "workspace" : "batchImportSection");
});

$("heroSecondaryBtn").addEventListener("click", () => {
  const nextMode = state.mode === "single" ? "batch" : "single";
  switchMode(nextMode, { scroll: true });
});

$("resumeInput").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) uploadResume(file);
});

$("uploadZone").addEventListener("dragover", (event) => {
  event.preventDefault();
  $("uploadZone").classList.add("dragging");
});

$("uploadZone").addEventListener("dragleave", () => {
  $("uploadZone").classList.remove("dragging");
});

$("uploadZone").addEventListener("drop", (event) => {
  event.preventDefault();
  $("uploadZone").classList.remove("dragging");
  const file = event.dataTransfer.files?.[0];
  if (file) uploadResume(file);
});

$("jdImageBtn").addEventListener("click", () => {
  $("jdImageInput").click();
});

$("jdImageInput").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) uploadJdImage(file);
});

$("jdText").addEventListener("input", (event) => {
  state.jdText = event.target.value;
  if (!state.ui.jdManualTracked && state.jdText.trim().length >= 80) {
    state.ui.jdManualTracked = true;
    trackEvent("jd.manual_input", { textLength: state.jdText.trim().length });
  }
  if (!state.jdText.trim()) state.ui.jdManualTracked = false;
  if (state.jdText.trim()) {
    state.ui.singleStatus = state.resumeText ? "jd_ready" : "idle";
    renderSingleState();
  }
  renderChips($("jdKeywords"), localKeywords(event.target.value), "等待提取 JD 关键词");
});

$("batchDraftText").addEventListener("input", () => {
  if (state.ui.batchStatus === "idle") renderBatchStatePanels();
  else renderBatchSetupGuide();
});

$("batchUrls").addEventListener("input", () => {
  if (state.ui.batchStatus === "idle") renderBatchStatePanels();
  else renderBatchSetupGuide();
});

$("fetchJdBtn").addEventListener("click", fetchJd);
$("analyzeBtn").addEventListener("click", analyze);

["topFixes", "nextSteps"].forEach((id) => {
  const el = $(id);
  if (!el) return;
  el.addEventListener("click", (event) => {
    const text = event.target?.textContent?.trim();
    if (text) trackEvent("suggestion.opened", { source: id, text: text.slice(0, 120) });
  });
});
$("restoreReportBtn").addEventListener("click", restoreLastReport);
$("restoreBatchBtn").addEventListener("click", restoreLastBatchRun);

$("loadSampleBatchBtn").addEventListener("click", () => {
  resetBatchResultsForDraftChange();
  state.batchDraftJds = splitBatchText(sampleBatchText());
  $("batchDraftText").value = "";
  renderBatchOutputsAfterDraftChange();
  renderBatchStatePanels();
  toast("已填入 5 条示例 JD");
});

$("addBatchJdBtn").addEventListener("click", addBatchDraftJd);

$("batchImageBtn").addEventListener("click", () => {
  $("batchImageInput").click();
});

$("batchImageInput").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  if (file) uploadBatchJdImage(file);
});

$("batchDraftQueue").addEventListener("click", (event) => {
  const btn = event.target.closest(".draft-remove-btn");
  if (!btn) return;
  removeBatchDraftJd(Number(btn.dataset.index));
});

$("parseBatchBtn").addEventListener("click", parseBatchJds);
$("clusterBtn").addEventListener("click", clusterJds);
$("variantBtn").addEventListener("click", generateVariants);
$("cockpitOpenBatchDetail").addEventListener("click", openCurrentBatchDetail);
$("cockpitJumpPrimary").addEventListener("click", () => {
  const primaryVariant = state.variants.find((item) => item.isPrimary) || state.variants[0];
  if (!primaryVariant) return toast("先生成简历版本，再定位优先投递版本", "warn");
  scrollToSection("variantSection");
  loadVariantDetail(primaryVariant.id);
});
$("cockpitJumpVariants").addEventListener("click", () => {
  if (!state.variants.length) return toast("先生成简历版本，再查看全部版本", "warn");
  scrollToSection("variantSection");
});

$("variantRows").addEventListener("click", (event) => {
  const detailBtn = event.target.closest(".mini-detail");
  const primaryBtn = event.target.closest(".mini-primary");
  const btn = event.target.closest(".mini-export");
  if (detailBtn) loadVariantDetail(detailBtn.dataset.id);
  if (primaryBtn) setPrimaryVariant(primaryBtn.dataset.id);
  if (btn) exportVariant(btn.dataset.id);
});

$("variantDetails").addEventListener("click", (event) => {
  const detailBtn = event.target.closest(".variant-detail-btn");
  const primaryBtn = event.target.closest(".mini-primary");
  const exportBtn = event.target.closest(".mini-export");
  const renameForm = event.target.closest(".variant-rename-form");
  if (detailBtn) loadVariantDetail(detailBtn.dataset.id);
  if (primaryBtn) setPrimaryVariant(primaryBtn.dataset.id);
  if (exportBtn) exportVariant(exportBtn.dataset.id);
  if (renameForm) event.preventDefault();
});

$("variantDetails").addEventListener("submit", (event) => {
  const form = event.target.closest(".variant-rename-form");
  if (!form) return;
  event.preventDefault();
  const input = form.querySelector('input[name="variantName"]');
  renameVariant(form.dataset.id, input?.value || "");
});

$("variantDetails").addEventListener("change", (event) => {
  const select = event.target.closest(".status-select");
  if (!select) return;
  setDeliveryStatus(select.dataset.id, select.value);
});

const detailContentEl = $("detailContent");
if (detailContentEl) {
  detailContentEl.addEventListener("change", (event) => {
    const select = event.target.closest(".status-select");
    if (!select) return;
    setDeliveryStatus(select.dataset.id, select.value);
  });
}

const resumeLibraryEl = $("resumeLibrary");
if (resumeLibraryEl) {
  resumeLibraryEl.addEventListener("click", (event) => {
    const detailBtn = event.target.closest(".resume-detail-btn");
    const btn = event.target.closest(".resume-select-btn");
    if (detailBtn) loadResumeDetail(detailBtn.dataset.id);
    if (btn) restoreResumeById(btn.dataset.id);
  });
}

const recentHistoryEl = $("recentHistory");
if (recentHistoryEl) {
  recentHistoryEl.addEventListener("click", (event) => {
    const detailBtn = event.target.closest(".history-detail-btn");
    const btn = event.target.closest(".history-open-btn");
    if (detailBtn) {
      loadHistoryDetail(detailBtn.dataset.type, detailBtn.dataset.id);
      return;
    }
    if (!btn) return;
    if (btn.dataset.type === "report") {
      saveValue(storageKeys.reportId, btn.dataset.id);
      updateRestoreButtons();
      restoreLastReport();
      switchMode("single", { scroll: true });
    } else {
      saveValue(storageKeys.batchRunId, btn.dataset.id);
      updateRestoreButtons();
      restoreLastBatchRun();
      switchMode("batch", { scroll: true });
    }
  });
}

renderChips($("resumeKeywords"), [], "等待解析简历关键词");
renderKeywordGroups($("resumeKeywordGroups"), []);
renderChips($("jdKeywords"), [], "等待提取 JD 关键词");
$("authEntry").addEventListener("click", (event) => {
  const loginBtn = event.target.closest("#openLoginBtn");
  const registerBtn = event.target.closest("#openRegisterBtn");
  const logoutBtn = event.target.closest("#logoutBtn");
  if (loginBtn) openAuthModal("login");
  if (registerBtn) openAuthModal("register");
  if (logoutBtn) logout();
});

$("closeAuthBtn").addEventListener("click", closeAuthModal);
$("authBackdrop").addEventListener("click", closeAuthModal);
$("authSwitchBtn").addEventListener("click", () => {
  openAuthModal(state.auth.modalMode === "login" ? "register" : "login");
});
$("authForm").addEventListener("submit", submitAuth);

switchMode("single");
renderAll();
updateRestoreButtons();
renderAuthEntry();
renderUsageCenter();
loadAuth().then(async () => {
  await loadResumeLibrary();
  await loadRecentHistory();
  await loadUsageCenter();
  updateRestoreButtons();
});
renderDetailPanel();


