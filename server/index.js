const http = require("http");
const fs = require("fs");
const https = require("https");
const net = require("net");
const tls = require("tls");
const path = require("path");
const crypto = require("crypto");
const { spawn } = require("child_process");
const { createRecord, updateRecord, getRecord, listRecords, findRecords, deleteRecord, readCollection, writeCollection, nowIso } = require("./store");

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return;
  const content = fs.readFileSync(filePath, "utf8");
  content.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;
    const index = trimmed.indexOf("=");
    if (index === -1) return;
    const key = trimmed.slice(0, index).trim();
    const rawValue = trimmed.slice(index + 1).trim();
    if (!key || process.env[key]) return;
    process.env[key] = rawValue.replace(/^['"]|['"]$/g, "");
  });
}

const root = path.resolve(__dirname, "..");
loadEnvFile(path.join(root, ".env"));
loadEnvFile(path.join(root, ".env.local"));
const publicDir = path.join(root, "public");
const uploadDir = path.join(root, "work", "uploads");
const exportDir = path.join(root, "work", "exports");
const logDir = path.join(root, "work", "logs");
fs.mkdirSync(uploadDir, { recursive: true });
fs.mkdirSync(exportDir, { recursive: true });
fs.mkdirSync(logDir, { recursive: true });

const PORT = Number(process.env.PORT || 4173);
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const CODEX_RUNTIME_PYTHON_DIR = path.join(
  process.env.USERPROFILE || process.env.HOME || "",
  ".cache",
  "codex-runtimes",
  "codex-primary-runtime",
  "dependencies",
  "python"
);
const CODEX_RUNTIME_PYTHON_BIN = process.platform === "win32"
  ? path.join(CODEX_RUNTIME_PYTHON_DIR, "python.exe")
  : path.join(CODEX_RUNTIME_PYTHON_DIR, "bin", "python3");
const PYTHON_BINS = Array.from(new Set([
  process.env.PYTHON_BIN,
  fs.existsSync(CODEX_RUNTIME_PYTHON_BIN) ? CODEX_RUNTIME_PYTHON_BIN : "",
  process.platform === "win32" ? "python" : "python3",
].filter(Boolean)));
const PYTHON_PACKAGE_DIR = process.env.PYTHONPATH || (fs.existsSync(CODEX_RUNTIME_PYTHON_DIR) ? CODEX_RUNTIME_PYTHON_DIR : "");
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || "deepseek-v4-flash";
const DEEPSEEK_API_URL = process.env.DEEPSEEK_API_URL || "https://api.deepseek.com/chat/completions";
const DEEPSEEK_PROXY_URL = process.env.DEEPSEEK_PROXY_URL || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY || "";
const TAVILY_API_KEY = process.env.TAVILY_API_KEY || "";
const OCR_PROVIDER = process.env.OCR_PROVIDER || "";
const OCR_API_URL = process.env.OCR_API_URL || "";
const OCR_API_KEY = process.env.OCR_API_KEY || "";
const EMBEDDING_API_URL = process.env.EMBEDDING_API_URL || "";
const EMBEDDING_API_KEY = process.env.EMBEDDING_API_KEY || "";
const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL || "text-embedding";
const SESSION_COOKIE = "jobpilot_session";
const SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const COOKIE_SECURE =
  String(process.env.COOKIE_SECURE || "").toLowerCase() === "true" ||
  process.env.NODE_ENV === "production";
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);
const PLAN_LIMITS = {
  free: {
    singleAnalysis: 15,
    batchRuns: 5,
    exports: 10,
  },
};

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
};

const keywordCatalog = [
  "JavaScript", "TypeScript", "React", "Vue", "Node.js", "Python", "Java", "Go", "SQL",
  "PostgreSQL", "MySQL", "Redis", "Docker", "Kubernetes", "AWS", "AIGC", "NLP",
  "SaaS", "CRM", "ERP", "SEO", "Scrum", "Agent", "Prompt",
  "AI", "product", "growth", "strategy", "content", "data", "analysis", "research"
];

const phraseCatalog = [
  "北京大学", "信息管理系", "人机交互", "用户体验", "信息架构", "电子商务", "数据叙事", "数据分析",
  "人工智能", "计算思维", "面向对象", "程序设计", "产品负责人", "产品经理", "AI产品", "AI 产品",
  "用户研究", "需求分析", "项目管理", "海投优化", "求职工作台", "岗位方向分类", "版本管理",
  "结构化总结", "匹配解释", "交互流程", "异常提示", "挑战杯", "课外学术科技作品竞赛",
  "语言通货膨胀", "工作焦虑", "情绪劳动", "组织沟通", "情感替代", "交互质量", "自我效能",
  "心理韧性", "混合研究", "深度访谈", "问卷调查", "招生志愿者", "招生办公室", "校园十佳歌手",
  "选手与嘉宾对接", "原型", "思维导图", "Axure", "Figma", "墨刀", "XMind", "SPSS"
];

const jdSignalCatalog = [
  "985高校", "硕士在读", "海外留学", "计算机", "软件工程", "社会心理", "市场营销",
  "互联网产品实习", "社交产品", "职场社交", "社交网络", "职场人脉", "产品设计",
  "产品开发流程", "产品文档", "需求文档", "原型设计", "Axure", "Sketch", "Office",
  "XMind", "Excel", "SQL", "Python", "数据分析", "数据敏感度", "竞品分析",
  "需求调研", "用户需求", "用户反馈", "用户体验", "交互设计", "审美能力",
  "学习能力", "沟通能力", "团队协作", "责任心", "自我驱动", "项目跟进",
  "跨部门协作", "研发协作", "设计协作", "运营协作", "项目交付", "产品上线",
  "运营工作", "用户活跃度", "留存率", "转化率", "关键指标", "数据监控",
  "数据跟踪", "产品优化", "产品策略", "市场动态"
];

const jdSignalLower = jdSignalCatalog.map((item) => ({ original: item, lower: item.toLowerCase() }));
const jdDerivedSignals = [
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
  ["互联网产品实习", /互联网产品实习|产品实习/],
];

const stopWords = new Set([
  "the", "and", "for", "with", "that", "this", "you", "are", "will", "from", "have",
  "工作", "使用", "活动", "研究", "相关", "通过", "负责", "经验", "能力", "要求", "优先", "熟悉",
  "具备", "参与", "完成", "支持", "我们", "公司", "团队", "业务", "岗位", "用户", "项目",
  "项目经历", "项目成员", "校园经历", "荣誉技能", "个人评价", "教育背景", "主修课程", "连续三年",
  "累计", "场景", "方向", "版本", "模块", "流程", "能力", "背景", "工具", "内容", "结果",
  "说明", "同学", "老师"
]);

const phraseCatalogLower = phraseCatalog.map((item) => ({ original: item, lower: item.toLowerCase() }));
const keywordCatalogMap = new Map(keywordCatalog.map((item) => [item.toLowerCase(), item]));
const resumeSectionAliasGroups = {
  education: ["教育背景", "教育经历", "学历背景", "教育信息", "主修课程"],
  projects: ["项目经历", "项目经验", "项目实践", "产品项目", "科研项目", "研究经历"],
  experience: ["工作经历", "实习经历", "实践经历", "任职经历", "校园经历", "学生工作"],
  honors: ["荣誉技能", "荣誉奖项", "获奖经历", "奖励情况", "荣誉情况"],
  skills: ["技能", "专业技能", "工具技能", "能力技能", "工具能力"],
  profile: ["个人评价", "自我评价", "个人总结", "自我介绍"],
};
const resumeSectionLookup = new Map(
  Object.entries(resumeSectionAliasGroups).flatMap(([key, values]) => values.map((value) => [value, key]))
);
const groupedKeywordCatalog = {
  coreSkills: [
    "产品经理", "产品负责人", "用户研究", "需求分析", "数据分析", "信息架构", "用户体验", "人机交互",
    "交互流程", "版本管理", "项目管理", "原型", "沟通协调", "深度访谈", "问卷调查", "混合研究",
  ],
  tools: ["Python", "SPSS", "Figma", "Axure", "墨刀", "XMind", "SQL", "Java"],
  education: ["北京大学", "信息管理系", "电子商务", "数据叙事", "人工智能", "计算思维", "程序设计"],
  projectTags: ["求职工作台", "挑战杯", "招生志愿者", "校园十佳歌手", "AI产品", "情感替代", "工作焦虑", "组织沟通"],
};
const keywordGroupLabels = {
  coreSkills: "核心能力",
  tools: "工具技能",
  education: "教育背景",
  projectTags: "项目标签",
};

function splitChinesePhrase(text) {
  return String(text || "")
    .split(/[、，,；;：:（）()｜|/\\\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function send(res, status, body, type = "application/json; charset=utf-8") {
  res.writeHead(status, { "Content-Type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}

function sendSuccess(res, statusCode, body = {}) {
  send(res, statusCode, { status: "success", ...body });
}

function sendError(res, statusCode, message, detail, error = "request_failed") {
  const payload = { status: "error", error, message };
  if (detail) payload.detail = detail;
  res._jobpilotErrorCode = error;
  send(res, statusCode, payload);
}

function getUserPlan(user) {
  return user?.plan && PLAN_LIMITS[user.plan] ? user.plan : "free";
}

function isAdminUser(user) {
  const email = normalizeEmail(user?.email || "");
  return Boolean(email && ADMIN_EMAILS.includes(email));
}

function getUserQuotaSnapshot(user) {
  const plan = getUserPlan(user);
  const limits = PLAN_LIMITS[plan];
  const used = {
    singleAnalysisUsed: Number(user?.quota?.singleAnalysisUsed || 0),
    batchRunsUsed: Number(user?.quota?.batchRunsUsed || 0),
    exportsUsed: Number(user?.quota?.exportsUsed || 0),
  };
  return {
    plan,
    resetAt: user?.quotaResetAt || nowIso(),
    limits,
    used,
    remaining: {
      singleAnalysis: Math.max(0, limits.singleAnalysis - used.singleAnalysisUsed),
      batchRuns: Math.max(0, limits.batchRuns - used.batchRunsUsed),
      exports: Math.max(0, limits.exports - used.exportsUsed),
    },
  };
}

function formatQuotaExceededMessage(type, snapshot) {
  const labelMap = {
    singleAnalysis: "single JD analyses",
    batchRuns: "batch runs",
    exports: "resume exports",
  };
  const label = labelMap[type] || "usage";
  return `Your ${label} quota for the ${snapshot.plan} plan has been used up.`;
}

function checkQuota(res, user, type) {
  const snapshot = getUserQuotaSnapshot(user);
  const limitKey =
    type === "singleAnalysis" ? "singleAnalysisUsed" :
    type === "batchRuns" ? "batchRunsUsed" :
    type === "exports" ? "exportsUsed" :
    "";
  if (!limitKey) return snapshot;
  const used = snapshot.used[limitKey];
  const limit = snapshot.limits[type];
  if (used >= limit) {
    logErrorEvent("quota.exceeded", {
      userId: user?.id || "",
      plan: snapshot.plan,
      quotaType: type,
      used,
      limit,
      errorCode: "quota_exceeded",
    });
    sendError(
      res,
      429,
      formatQuotaExceededMessage(type, snapshot),
      `Limit: ${limit}, used: ${used}.`,
      "quota_exceeded"
    );
    return null;
  }
  return snapshot;
}

function logToFile(name, payload) {
  const line = JSON.stringify(payload) + "\n";
  fs.appendFileSync(path.join(logDir, name), line, "utf8");
}

function logErrorEvent(kind, payload = {}) {
  const entry = {
    timestamp: nowIso(),
    kind,
    ...payload,
  };
  console.error(`[${entry.timestamp}] ${kind}`, payload.message || payload.errorCode || "");
  logToFile("errors.log", entry);
}

function logAiMetric(kind, payload = {}) {
  logToFile("ai_metrics.log", {
    timestamp: nowIso(),
    kind,
    ...payload,
  });
}

function logUserEvent(kind, payload = {}) {
  logToFile("user_events.log", {
    timestamp: nowIso(),
    kind,
    ...payload,
  });
}

function readJsonLines(name, limit = 200) {
  const file = path.join(logDir, name);
  if (!fs.existsSync(file)) return [];
  try {
    const lines = fs.readFileSync(file, "utf8").split(/\r?\n/).filter(Boolean);
    return lines
      .slice(-limit)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

function classifyRequestPath(pathname = "") {
  if (pathname === "/api/analyze") return "single_analysis";
  if (pathname === "/api/batch-jds") return "batch_parse";
  if (pathname === "/api/cluster-jds") return "batch_cluster";
  if (pathname === "/api/resume-variants") return "variant_generate";
  if (pathname === "/api/export-resume") return "resume_export";
  if (pathname === "/api/upload-resume") return "resume_upload";
  if (pathname === "/api/fetch-jd") return "jd_fetch";
  return "other";
}

function formatRequestLabel(pathname = "") {
  const map = {
    single_analysis: "单 JD 分析",
    batch_parse: "海投解析",
    batch_cluster: "岗位分类",
    variant_generate: "生成版本",
    resume_export: "导出简历",
    resume_upload: "上传简历",
    jd_fetch: "抓取 JD",
    other: "其他操作",
  };
  return map[classifyRequestPath(pathname)] || "其他操作";
}

function buildUsageCenter(user) {
  const requestEntries = readJsonLines("requests.log", 400)
    .filter((item) => item.userId === user.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const errorEntries = readJsonLines("errors.log", 200)
    .filter((item) => item.userId === user.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const aiEntries = readJsonLines("ai_metrics.log", 300)
    .filter((item) => item.userId === user.id)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const todayKey = nowIso().slice(0, 10);
  const todayRequests = requestEntries.filter((item) => String(item.timestamp || "").slice(0, 10) === todayKey);
  const todayActions = {
    singleAnalysis: todayRequests.filter((item) => item.path === "/api/analyze" && item.statusCode < 400).length,
    batchRuns: todayRequests.filter((item) => item.path === "/api/batch-jds" && item.statusCode < 400).length,
    exports: todayRequests.filter((item) => item.path === "/api/export-resume" && item.statusCode < 400).length,
    errors: todayRequests.filter((item) => Number(item.statusCode || 0) >= 400).length,
  };

  const recentActivity = requestEntries.slice(0, 8).map((item) => ({
    timestamp: item.timestamp,
    label: formatRequestLabel(item.path),
    path: item.path,
    statusCode: item.statusCode,
    durationMs: item.durationMs,
    status: Number(item.statusCode || 0) >= 400 ? "error" : "success",
    errorCode: item.errorCode || "",
  }));

  const recentErrors = errorEntries.slice(0, 6).map((item) => ({
    timestamp: item.timestamp,
    kind: item.kind,
    errorCode: item.errorCode || "",
    message: item.message || "",
    quotaType: item.quotaType || "",
  }));

  return {
    quotaSummary: getUserQuotaSnapshot(user),
    todayActions,
    recentActivity,
    recentErrors,
    aiSummary: summarizeAiMetrics(aiEntries),
  };
}

function summarizeAiMetrics(entries = []) {
  const completed = entries.filter((item) => String(item.kind || "").includes("completed") || item.status === "success");
  const failed = entries.filter((item) => String(item.kind || "").includes("failed") || item.status === "error" || item.status === "fallback");
  const durations = entries.map((item) => Number(item.durationMs || 0)).filter(Boolean);
  const totalCacheHits = entries.reduce((sum, item) => sum + Number(item.cacheHits || 0), 0);
  const totalCacheMisses = entries.reduce((sum, item) => sum + Number(item.cacheMisses || 0), 0);
  return {
    total: entries.length,
    completed: completed.length,
    failed: failed.length,
    averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : 0,
    cacheHits: totalCacheHits,
    cacheMisses: totalCacheMisses,
    cacheHitRate: totalCacheHits + totalCacheMisses ? Number((totalCacheHits / (totalCacheHits + totalCacheMisses)).toFixed(2)) : 0,
    recent: entries.slice(0, 8),
  };
}

function buildAdminMonitor() {
  const requestEntries = readJsonLines("requests.log", 500)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const errorEntries = readJsonLines("errors.log", 300)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const aiEntries = readJsonLines("ai_metrics.log", 500)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const userEventEntries = readJsonLines("user_events.log", 500)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const last24hStart = Date.now() - 24 * 60 * 60 * 1000;
  const last24hRequests = requestEntries.filter((item) => new Date(item.timestamp).getTime() >= last24hStart);
  const failedRequests = requestEntries.filter((item) => Number(item.statusCode || 0) >= 400);
  const quotaExceededCount = errorEntries.filter((item) => item.errorCode === "quota_exceeded").length;

  const requestBreakdownMap = new Map();
  for (const item of requestEntries) {
    const key = item.path || "unknown";
    requestBreakdownMap.set(key, (requestBreakdownMap.get(key) || 0) + 1);
  }

  const errorBreakdownMap = new Map();
  for (const item of errorEntries) {
    const key = item.kind || item.errorCode || "unknown";
    errorBreakdownMap.set(key, (errorBreakdownMap.get(key) || 0) + 1);
  }

  return {
    overview: {
      totalRequests: requestEntries.length,
      failedRequests: failedRequests.length,
      quotaExceededCount,
      last24hRequests: last24hRequests.length,
      aiRequests: aiEntries.length,
      aiFailures: summarizeAiMetrics(aiEntries).failed,
      cacheHitRate: summarizeAiMetrics(aiEntries).cacheHitRate,
      userEvents: userEventEntries.length,
    },
    aiSummary: summarizeAiMetrics(aiEntries),
    recentUserEvents: userEventEntries.slice(0, 20),
    recentRequests: requestEntries.slice(0, 20).map((item) => ({
      timestamp: item.timestamp,
      path: item.path,
      statusCode: item.statusCode,
      durationMs: item.durationMs,
      userId: item.userId || "",
      errorCode: item.errorCode || "",
    })),
    recentErrors: errorEntries.slice(0, 20).map((item) => ({
      timestamp: item.timestamp,
      kind: item.kind || "",
      errorCode: item.errorCode || "",
      message: item.message || "",
      userId: item.userId || "",
    })),
    requestBreakdown: Array.from(requestBreakdownMap.entries())
      .map(([path, count]) => ({ path, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
    errorBreakdown: Array.from(errorBreakdownMap.entries())
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 12),
  };
}

function appendSetCookie(res, value) {
  const previous = res.getHeader("Set-Cookie");
  if (!previous) {
    res.setHeader("Set-Cookie", value);
    return;
  }
  const list = Array.isArray(previous) ? previous.concat(value) : [previous, value];
  res.setHeader("Set-Cookie", list);
}

function setSessionCookie(res, token, maxAgeMs = SESSION_MAX_AGE_MS) {
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${Math.max(0, Math.floor(maxAgeMs / 1000))}`,
  ];
  if (COOKIE_SECURE) parts.push("Secure");
  appendSetCookie(res, parts.join("; "));
}

function clearSessionCookie(res) {
  const parts = [`${SESSION_COOKIE}=`, "Path=/", "HttpOnly", "SameSite=Lax", "Max-Age=0"];
  if (COOKIE_SECURE) parts.push("Secure");
  appendSetCookie(res, parts.join("; "));
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return header.split(/;\s*/).reduce((acc, part) => {
    if (!part) return acc;
    const index = part.indexOf("=");
    if (index < 0) return acc;
    const key = part.slice(0, index).trim();
    const value = decodeURIComponent(part.slice(index + 1).trim());
    acc[key] = value;
    return acc;
  }, {});
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${derived}`;
}

function verifyPassword(password, storedHash) {
  const [salt, hashed] = String(storedHash || "").split(":");
  if (!salt || !hashed) return false;
  const derived = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hashed, "hex"), Buffer.from(derived, "hex"));
}

function createUserRecord(payload) {
  return createRecord("users", payload, "user");
}

function createSessionRecord(payload) {
  return createRecord("sessions", payload, "session");
}

function getUserByEmail(email) {
  return findRecords("users", (item) => normalizeEmail(item.email) === normalizeEmail(email), 1)[0] || null;
}

function getSessionByToken(token) {
  if (!token) return null;
  const session = findRecords("sessions", (item) => item.token === token, 1)[0] || null;
  if (!session) return null;
  const expiresAt = new Date(session.expiresAt || 0).getTime();
  if (!expiresAt || expiresAt <= Date.now()) {
    deleteRecord("sessions", session.id);
    return null;
  }
  return session;
}

function getCurrentUser(req) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  const session = getSessionByToken(token);
  if (!session) return null;
  const user = getRecord("users", session.userId);
  if (!user || user.status === "deleted") return null;
  return { user, session };
}

function requireAuth(req, res) {
  const current = getCurrentUser(req);
  if (!current) {
    sendError(res, 401, "请先登录后再继续。", null, "auth_required");
    return null;
  }
  return current;
}

function requireAdmin(req, res) {
  const current = requireAuth(req, res);
  if (!current) return null;
  if (!isAdminUser(current.user)) {
    sendError(res, 403, "Admin access required.", null, "admin_forbidden");
    return null;
  }
  return current;
}

function assertOwnership(res, record, userId, type = "record") {
  if (!record) {
    sendError(res, 404, "Record not found or removed.", null, `${type}_not_found`);
    return false;
  }
  if (!record.userId || record.userId !== userId) {
    sendError(res, 403, "This record does not belong to you.", null, "forbidden");
    return false;
  }
  return true;
}

function withUser(record, userId) {
  return { ...record, userId };
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error("璇锋眰鍐呭杩囧ぇ"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function parseJson(buffer) {
  return JSON.parse(buffer.toString("utf8") || "{}");
}

function serializeUser(user) {
  if (!user) return null;
  const quotaSummary = getUserQuotaSnapshot(user);
  return {
    id: user.id,
    email: user.email,
    isAdmin: isAdminUser(user),
    plan: quotaSummary.plan,
    quota: user.quota || {
      singleAnalysisUsed: 0,
      batchRunsUsed: 0,
      exportsUsed: 0,
    },
    quotaResetAt: quotaSummary.resetAt,
    quotaSummary,
    createdAt: user.createdAt,
    status: user.status,
  };
}

function parseMultipart(buffer, contentType) {
  const boundaryMatch = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType || "");
  if (!boundaryMatch) throw new Error("缂哄皯涓婁紶杈圭晫");
  const boundary = Buffer.from(`--${boundaryMatch[1] || boundaryMatch[2]}`);
  const parts = [];
  let cursor = buffer.indexOf(boundary);
  while (cursor !== -1) {
    cursor += boundary.length;
    if (buffer[cursor] === 45 && buffer[cursor + 1] === 45) break;
    if (buffer[cursor] === 13 && buffer[cursor + 1] === 10) cursor += 2;
    const headerEnd = buffer.indexOf(Buffer.from("\r\n\r\n"), cursor);
    if (headerEnd === -1) break;
    const header = buffer.slice(cursor, headerEnd).toString("utf8");
    const dataStart = headerEnd + 4;
    const next = buffer.indexOf(boundary, dataStart);
    if (next === -1) break;
    const dataEnd = next - 2;
    const disposition = /content-disposition:[^\r\n]+/i.exec(header)?.[0] || "";
    parts.push({
      name: /name="([^"]+)"/.exec(disposition)?.[1],
      filename: /filename="([^"]*)"/.exec(disposition)?.[1],
      contentType: /content-type:\s*([^\r\n]+)/i.exec(header)?.[1]?.trim(),
      data: buffer.slice(dataStart, Math.max(dataStart, dataEnd)),
    });
    cursor = next;
  }
  return parts;
}

function safeFileName(name) {
  const ext = path.extname(name || "").toLowerCase();
  const stem = path
    .basename(name || "resume", ext)
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "-")
    .slice(0, 60);
  return `${Date.now()}-${stem || "resume"}${ext}`;
}

function exportFileName(name = "resume-variant") {
  const stem = String(name)
    .replace(/[^\w\u4e00-\u9fa5.-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "resume-variant";
  return `${Date.now()}-${stem}.docx`;
}

function runPythonJsonWithFallback(scriptPath, args, defaultErrorMessage) {
  let index = 0;
  return new Promise((resolve, reject) => {
    const tryNextPython = (lastError = null) => {
      const pythonBin = PYTHON_BINS[index];
      if (!pythonBin) {
        reject(lastError || new Error("python_spawn_failed:no_python_available"));
        return;
      }
      index += 1;
    let settled = false;
      let child;
      try {
        child = spawn(pythonBin, [scriptPath, ...args], {
          cwd: root,
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: "utf-8",
            ...(PYTHON_PACKAGE_DIR ? { PYTHONPATH: PYTHON_PACKAGE_DIR } : {}),
          },
        });
      } catch (error) {
        const wrapped = new Error(`python_spawn_failed:${error.code || error.message}`);
        if (index < PYTHON_BINS.length) {
          tryNextPython(wrapped);
          return;
        }
        reject(wrapped);
        return;
      }
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", (error) => {
      settled = true;
        const wrapped = new Error(`python_spawn_failed:${error.code || error.message}`);
        if (index < PYTHON_BINS.length) tryNextPython(wrapped);
        else reject(wrapped);
    });
    child.on("close", (code) => {
      if (settled) return;
      try {
        const parsed = JSON.parse(stdout || "{}");
          if (code !== 0 || parsed.error) reject(new Error(parsed.error || stderr || defaultErrorMessage));
          else resolve(parsed);
      } catch (error) {
        reject(new Error(stderr || error.message));
      }
    });
    };
    tryNextPython();
  });
}

function extractText(filePath) {
  const script = path.join(__dirname, "extract_text.py");
  return runPythonJsonWithFallback(script, [filePath], "文本解析失败")
    .then((parsed) => parsed.text || "");
}

function runPythonJson(scriptPath, args) {
  return runPythonJsonWithFallback(scriptPath, args, "处理失败");
}

function normalizeText(text) {
  return String(text || "")
    .replace(/\r/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function detectUploadFailureMessage(ext, rawMessage) {
  const message = String(rawMessage || "");
  if (message.includes("python_spawn_failed") || message.includes("spawn EPERM") || message.includes("EPERM")) {
    return {
      message: "本地简历解析器启动失败，请先直接粘贴简历文本，或稍后重新启动项目再试。",
      error: "resume_parser_unavailable",
      detail: "",
    };
  }
  if (ext === ".doc") {
    return {
      message: "暂不支持直接解析 .doc 文件，请先转换为 .docx 后再上传。",
      error: "doc_parse_failed",
      detail: rawMessage,
    };
  }
  return {
    message: "简历文本解析失败，请检查文件后重试，或直接粘贴简历文本。",
    error: "resume_extract_failed",
    detail: rawMessage,
  };
}

async function tryOcrExtract(filePath, userId = "") {
  if (!OCR_API_URL || !OCR_API_KEY) {
    return {
      status: "ocr_unconfigured",
      text: "",
      message: "这份 PDF 可能是扫描版或图片版，需要 OCR 才能识别。当前未配置 OCR，请粘贴简历文本，或上传可复制文字的 PDF/Word 文件。",
    };
  }
  const startedAt = Date.now();
  try {
    const fileBase64 = fs.readFileSync(filePath).toString("base64");
    const response = await fetch(OCR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OCR_API_KEY}`,
      },
      body: JSON.stringify({
        provider: OCR_PROVIDER || "custom",
        fileBase64,
      }),
    });
    if (!response.ok) throw new Error(`OCR API failed: ${response.status}`);
    const data = await response.json();
    const text = normalizeText(data.text || data.result?.text || data.data?.text || "");
    logAiMetric("ocr.completed", {
      userId,
      provider: OCR_PROVIDER || "custom",
      durationMs: Date.now() - startedAt,
      status: text ? "success" : "empty",
    });
    return {
      status: text ? "ocr_completed" : "ocr_failed",
      text,
      message: text ? "OCR 识别完成。" : "OCR 没有识别出可用文本，请粘贴简历文本或更换文件。",
    };
  } catch (error) {
    logErrorEvent("ocr.failed", {
      userId,
      errorCode: "ocr_failed",
      message: error.message,
    });
    logAiMetric("ocr.failed", {
      userId,
      provider: OCR_PROVIDER || "custom",
      durationMs: Date.now() - startedAt,
      status: "error",
    });
    return {
      status: "ocr_failed",
      text: "",
      message: "OCR 识别失败，请粘贴简历文本，或上传可复制文字的 PDF/Word 文件。",
    };
  }
}

function tokenize(text) {
  const raw = String(text || "");
  const source = raw.toLowerCase();
  const tokens = [];

  for (const item of phraseCatalogLower) {
    if (source.includes(item.lower)) tokens.push(item.original);
  }

  const zhChunks = raw.match(/[\u4e00-\u9fa5]{2,16}/g) || [];
  for (const chunk of zhChunks) {
    const parts = splitChinesePhrase(chunk);
    if (!parts.length) parts.push(chunk);
    for (const part of parts) {
      if (part.length < 2 || part.length > 16) continue;
      if (stopWords.has(part)) continue;
      if (/^(北京大|京大|大学|本科|用户|工作|使用|活动|研究|分析|工具)$/.test(part)) continue;
      tokens.push(part);
    }
  }

  const enMatches = raw.match(/[A-Za-z][A-Za-z0-9+#.-]{1,24}/g) || [];
  for (const word of enMatches) {
    const normalized = word.toLowerCase();
    const canonical = keywordCatalogMap.get(normalized) || word;
    if (!stopWords.has(normalized) && canonical.length > 1) tokens.push(canonical);
  }

  return tokens;
}

function topTerms(text, max = 18) {
  const scores = new Map();
  const source = String(text || "");
  for (const term of tokenize(source)) {
    const bonus = /[\u4e00-\u9fa5]{4,}|[A-Z]{2,}|(?:Python|Figma|Axure|SPSS|SQL|AI|SaaS)/.test(term) ? 2 : 1;
    scores.set(term, (scores.get(term) || 0) + bonus);
  }
  for (const item of [...keywordCatalog, ...phraseCatalog]) {
    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = (source.match(new RegExp(escaped, "gi")) || []).length;
    if (count) scores.set(item, (scores.get(item) || 0) + count * 6);
  }
  const ranked = [...scores.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .map(([term]) => term);

  const finalTerms = [];
  for (const term of ranked) {
    if (finalTerms.some((picked) => picked.includes(term) || term.includes(picked))) continue;
    finalTerms.push(term);
    if (finalTerms.length >= max) break;
  }
  return finalTerms;
}

function isNoisyJdTerm(term) {
  const value = String(term || "").trim();
  if (!value || value.length < 2) return true;
  if (value.length > 12 && !/互联网产品实习|跨部门协作|产品开发流程/.test(value)) return true;
  if (/者优先|熟练使用|参与过|具备一定|有一定|能够|负责|协助|相关项目|办公软件|进行测试|进行分析|深入的理解/.test(value)) return true;
  if (/^(职位要求|任职要求|经验要求|技能要求|能力与素质|职位描述|岗位职责|教育背景)$/.test(value)) return true;
  if (/^(产品|用户|数据|能力|要求|优先|熟悉|使用|相关|项目|工作|功能|特点)$/.test(value)) return true;
  return false;
}

function topJdTerms(text, max = 18) {
  const source = String(text || "");
  const lowered = source.toLowerCase();
  const scores = new Map();
  for (const item of jdSignalLower) {
    const count = lowered.split(item.lower).length - 1;
    if (count > 0) scores.set(item.original, (scores.get(item.original) || 0) + count * 10 + Math.min(item.original.length, 8));
  }
  for (const [label, regex] of jdDerivedSignals) {
    if (regex.test(source)) scores.set(label, (scores.get(label) || 0) + 26);
  }

  const shortCandidates = source
    .split(/[，。；;、\n\r:：\-·\s]+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2 && item.length <= 8 && !isNoisyJdTerm(item));
  for (const item of shortCandidates) {
    if (/产品|数据|用户|需求|交互|竞品|原型|文档|协作|指标|留存|转化|社交|职场|人脉|市场|测试|体验/.test(item)) {
      scores.set(item, (scores.get(item) || 0) + 2);
    }
  }

  return [...scores.entries()]
    .filter(([term]) => !isNoisyJdTerm(term))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .map(([term]) => term)
    .filter((term, index, arr) => !arr.slice(0, index).some((picked) => picked.includes(term) || term.includes(picked)))
    .slice(0, max);
}

function normalizeResumeHeading(line) {
  return String(line || "")
    .replace(/^[#*\-\s]+/, "")
    .replace(/[：:]+$/, "")
    .replace(/\s+/g, "")
    .trim();
}

function detectResumeSectionByContent(line) {
  if (/北京大学|本科|硕士|博士|主修课程|学院|专业/.test(line)) return "education";
  if (/Figma|Axure|XMind|SPSS|Python|SQL|工具|技能/.test(line)) return "skills";
  if (/特等奖|一等奖|二等奖|优秀|获评|荣誉|奖/.test(line)) return "honors";
  if (/负责|设计|规划|推动|研究|分析|问卷|访谈|项目/.test(line)) return "projects";
  if (/志愿者|嘉宾|活动|招生|接待|候场|协调/.test(line)) return "experience";
  return "other";
}

function splitResumeSections(text) {
  const sections = { education: [], projects: [], experience: [], honors: [], skills: [], profile: [], other: [] };
  let current = "other";
  for (const rawLine of String(text || "").split(/\r?\n+/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const heading = normalizeResumeHeading(line);
    const aliasMatch = resumeSectionLookup.get(heading);
    if (aliasMatch) {
      current = aliasMatch;
      continue;
    }
    if (/^##?\s*/.test(rawLine) || /^(教育背景|教育经历|项目经历|校园经历|荣誉技能|个人评价)/.test(line)) {
      current = detectResumeSectionByContent(line);
      if (current !== "other") continue;
    }
    sections[current].push(line);
  }
  return Object.fromEntries(Object.entries(sections).map(([key, lines]) => [key, lines.join("\n").trim()]));
}

function dedupeTerms(items, max = 8) {
  const picked = [];
  for (const term of items.filter(Boolean)) {
    if (picked.some((item) => item.includes(term) || term.includes(item))) continue;
    picked.push(term);
    if (picked.length >= max) break;
  }
  return picked;
}

function extractGroupedTerms(text, sections) {
  const source = String(text || "");
  const sectionText = sections || splitResumeSections(source);
  const groupTerms = {
    coreSkills: [
      ...topTerms([sectionText.projects, sectionText.experience, sectionText.profile].filter(Boolean).join("\n"), 12),
      ...Object.values(groupedKeywordCatalog.coreSkills).filter((item) => new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(source)),
    ],
    tools: [
      ...Object.values(groupedKeywordCatalog.tools).filter((item) => new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(source)),
      ...topTerms([sectionText.skills, sectionText.honors].filter(Boolean).join("\n"), 10),
    ],
    education: [
      ...Object.values(groupedKeywordCatalog.education).filter((item) => new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(source)),
      ...topTerms(sectionText.education, 10),
    ],
    projectTags: [
      ...Object.values(groupedKeywordCatalog.projectTags).filter((item) => new RegExp(item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(source)),
      ...topTerms([sectionText.projects, sectionText.honors].filter(Boolean).join("\n"), 12),
    ],
  };

  const groups = Object.entries(groupTerms)
    .map(([key, items]) => ({
      key,
      label: keywordGroupLabels[key],
      items: dedupeTerms(items.filter((term) => !stopWords.has(String(term).toLowerCase())), 6),
    }))
    .filter((group) => group.items.length);

  const flattened = dedupeTerms(groups.flatMap((group) => group.items), 18);
  return { groups, flattened, sections: sectionText };
}

async function extractResumeKeywordGroupsWithDeepSeek(text, localResult) {
  const result = await callDeepSeek({
    messages: [
      { role: "system", content: "Return valid JSON only." },
      {
        role: "user",
        content: `Please read this resume and return JSON with arrays: coreSkills, tools, education, projectTags. Keep each item short, specific, and resume-relevant. Avoid generic words like 工作, 使用, 活动, 研究. Resume:\n${text}\nLocal groups:${JSON.stringify(localResult.groups)}`,
      },
    ],
  });
  if (!result || typeof result !== "object") return null;
  const groups = ["coreSkills", "tools", "education", "projectTags"].map((key) => ({
    key,
    label: keywordGroupLabels[key],
    items: dedupeTerms((Array.isArray(result[key]) ? result[key] : []).map((item) => String(item || "").trim()).filter(Boolean), 6),
  })).filter((group) => group.items.length);
  if (!groups.length) return null;
  return {
    groups,
    flattened: dedupeTerms(groups.flatMap((group) => group.items), 18),
    provider: "deepseek",
  };
}

function vectorize(text) {
  const vector = new Map();
  for (const token of tokenize(text)) vector.set(token, (vector.get(token) || 0) + 1);
  for (const item of keywordCatalog) {
    const escaped = item.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const count = (String(text).match(new RegExp(escaped, "gi")) || []).length;
    if (count) vector.set(`kw:${item.toLowerCase()}`, (vector.get(`kw:${item.toLowerCase()}`) || 0) + count * 8);
  }
  const norm = Math.sqrt([...vector.values()].reduce((sum, value) => sum + value * value, 0)) || 1;
  return { vector, norm };
}

function hashText(text) {
  return crypto.createHash("sha256").update(String(text || "")).digest("hex");
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
};

function displayChunkLabel(label, fallback = "内容片段") {
  const key = String(label || "").replace(/-\d+$/, "");
  return chunkLabelText[key] || fallback;
}

function mapToObject(map) {
  return Object.fromEntries([...map.entries()]);
}

function objectToMap(value) {
  if (value instanceof Map) return value;
  return new Map(Object.entries(value || {}).map(([key, item]) => [key, Number(item) || 0]));
}

function normalizeVectorPayload(payload) {
  if (Array.isArray(payload)) {
    const vector = new Map(payload.map((value, index) => [String(index), Number(value) || 0]));
    const norm = Math.sqrt(payload.reduce((sum, value) => sum + Number(value || 0) ** 2, 0)) || 1;
    return { vector, norm };
  }
  const vector = objectToMap(payload);
  const norm = Math.sqrt([...vector.values()].reduce((sum, value) => sum + value * value, 0)) || 1;
  return { vector, norm };
}

function cosineVectors(a, b) {
  let dot = 0;
  const left = a.vector.size <= b.vector.size ? a.vector : b.vector;
  const right = a.vector.size <= b.vector.size ? b.vector : a.vector;
  for (const [term, value] of left) {
    if (right.has(term)) dot += value * right.get(term);
  }
  return dot / ((a.norm || 1) * (b.norm || 1));
}

function classifyChunkLabel(text, docType, index) {
  const raw = String(text || "");
  const rules = docType === "resume"
    ? [
        ["project", /项目|课题|研究|产品实践|作品|挑战杯|AI聊天|求职工作台|产品验证/i],
        ["internship", /实习|工作经历|任职|运营|产品助理|用户增长|上线|交付/i],
        ["skill", /技能|工具|Python|SQL|Figma|Axure|Sketch|XMind|SPSS|Excel|Office|墨刀|原型/i],
        ["education", /教育背景|学历|学校|大学|专业|课程|GPA|学位/i],
        ["campus", /校园|社团|志愿|招生|学生会|比赛|竞赛|活动/i],
        ["summary", /个人评价|自我评价|个人简介|求职意向|优势/i],
      ]
    : [
        ["requirements", /要求|任职|资格|优先|学历|经验|能力|熟悉/i],
        ["responsibilities", /职责|负责|推进|建设|设计|分析|协同/i],
        ["compensation", /薪资|工资|k|K|月薪|年薪|福利/i],
        ["location", /城市|地点|上海|北京|广州|深圳|杭州|远程/i],
      ];
  const match = rules.find(([, regex]) => regex.test(raw));
  return match?.[0] || (docType === "resume" ? "profile" : "overview") + `-${index + 1}`;
}

function splitResumeBlocks(text) {
  const normalized = normalizeText(text);
  const markerPattern = /(教育背景|教育经历|项目经历|项目经验|实习经历|工作经历|校园经历|荣誉奖项|技能|工具技能|个人评价|自我评价|个人简介|求职意向)/g;
  const matches = [...normalized.matchAll(markerPattern)];
  if (!matches.length) return normalized.split(/\n{2,}/g);
  const blocks = [];
  for (let index = 0; index < matches.length; index += 1) {
    const start = matches[index].index;
    const end = matches[index + 1]?.index ?? normalized.length;
    blocks.push(normalized.slice(start, end));
  }
  const prefix = normalized.slice(0, matches[0].index).trim();
  if (prefix.length >= 20) blocks.unshift(prefix);
  return blocks;
}

function chunkText(text, docType) {
  const normalized = normalizeText(text);
  const rawBlocks = docType === "resume"
    ? splitResumeBlocks(normalized)
    : normalized.split(/\n{2,}|(?=教育背景|任职要求|职位要求|岗位职责|职位描述|岗位要求|经验要求|技能要求|能力与素质)/g);
  const blocks = rawBlocks
    .map((item) => normalizeText(item))
    .filter((item) => item.length >= 20);
  const chunks = [];
  const source = blocks.length ? blocks : [normalized];
  for (const block of source) {
    if (block.length <= 900) {
      chunks.push(block);
      continue;
    }
    for (let i = 0; i < block.length; i += 700) chunks.push(block.slice(i, i + 900));
  }
  return chunks.slice(0, 24).map((item, index) => ({
    id: `${docType}-chunk-${index + 1}`,
    index,
    docType,
    label: classifyChunkLabel(item, docType, index),
    text: item,
    hash: hashText(`${docType}:${item}`),
  }));
}

async function callEmbeddingApi(text) {
  if (!EMBEDDING_API_URL || !EMBEDDING_API_KEY) return null;
  const response = await fetch(EMBEDDING_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${EMBEDDING_API_KEY}`,
    },
    body: JSON.stringify({ input: text, model: EMBEDDING_MODEL }),
  });
  if (!response.ok) throw new Error(`Embedding API failed: ${response.status}`);
  const data = await response.json();
  return data.embedding || data.data?.[0]?.embedding || data.result?.embedding || null;
}

async function vectorizeCached(chunk, userId = "") {
  const cache = readCollection("vectorCache");
  const model = EMBEDDING_API_URL && EMBEDDING_API_KEY ? EMBEDDING_MODEL : "local-keyword-vector";
  const cached = cache.find((item) => item.hash === chunk.hash && item.model === model);
  if (cached?.vector) {
    return {
      ...chunk,
      vectorData: normalizeVectorPayload(cached.vector),
      cacheHit: true,
      vectorProvider: cached.provider || "cache",
    };
  }

  let provider = "local-fallback";
  let payload = null;
  try {
    const embedding = await callEmbeddingApi(chunk.text);
    if (embedding) {
      payload = embedding;
      provider = "embedding-api";
    }
  } catch (error) {
    logErrorEvent("embedding.failed", {
      userId,
      errorCode: "embedding_failed",
      message: error.message,
    });
  }
  if (!payload) payload = mapToObject(vectorize(chunk.text).vector);
  const vectorData = normalizeVectorPayload(payload);
  cache.unshift({
    id: `vec_${chunk.hash.slice(0, 16)}`,
    hash: chunk.hash,
    model,
    provider,
    vector: payload,
    createdAt: nowIso(),
  });
  writeCollection("vectorCache", cache.slice(0, 2000));
  return {
    ...chunk,
    vectorData,
    cacheHit: false,
    vectorProvider: provider,
  };
}

async function buildRetrievalContext(resumeText, jdText, userId = "") {
  const resumeChunks = chunkText(resumeText, "resume");
  const jdChunks = chunkText(jdText, "jd");
  const vectorizedResume = await Promise.all(resumeChunks.map((chunk) => vectorizeCached(chunk, userId)));
  const vectorizedJd = await Promise.all(jdChunks.map((chunk) => vectorizeCached(chunk, userId)));
  const pairs = [];
  for (const jdChunk of vectorizedJd) {
    for (const resumeChunk of vectorizedResume) {
      const labelBoost =
        (jdChunk.label === "requirements" && ["skill", "project", "internship", "education"].includes(resumeChunk.label) ? 0.08 : 0) +
        (jdChunk.label === "responsibilities" && ["project", "internship", "skill"].includes(resumeChunk.label) ? 0.1 : 0) +
        (resumeChunk.label === "education" && jdChunk.label !== "requirements" ? -0.12 : 0);
      const rawScore = cosineVectors(jdChunk.vectorData, resumeChunk.vectorData);
      pairs.push({
        score: Number(Math.max(0, Math.min(1, rawScore + labelBoost)).toFixed(3)),
        rawScore: Number(rawScore.toFixed(3)),
        jdLabel: jdChunk.label,
        jdText: jdChunk.text.slice(0, 520),
        resumeLabel: resumeChunk.label,
        resumeText: resumeChunk.text.slice(0, 520),
      });
    }
  }
  const sortedPairs = pairs.sort((a, b) => b.score - a.score);
  const selected = [];
  const seen = new Set();
  const addPair = (pair) => {
    const key = `${pair.jdLabel}:${pair.resumeLabel}:${pair.jdText.slice(0, 48)}:${pair.resumeText.slice(0, 48)}`;
    if (seen.has(key)) return;
    selected.push(pair);
    seen.add(key);
  };
  for (const label of ["requirements", "responsibilities"]) {
    const pair = sortedPairs.find((item) => item.jdLabel === label && item.resumeLabel !== "education");
    if (pair) addPair(pair);
  }
  for (const label of ["project", "internship", "skill", "education"]) {
    const pair = sortedPairs.find((item) => item.resumeLabel === label);
    if (pair) addPair(pair);
  }
  for (const pair of sortedPairs) {
    if (selected.length >= 6) break;
    addPair(pair);
  }
  const allChunks = [...vectorizedResume, ...vectorizedJd];
  return {
    resumeChunks: resumeChunks.map(({ id, index, docType, label, text, hash }) => ({ id, index, docType, label, text, hash })),
    jdChunks: jdChunks.map(({ id, index, docType, label, text, hash }) => ({ id, index, docType, label, text, hash })),
    evidence: selected.slice(0, 6),
    cacheStats: {
      hits: allChunks.filter((item) => item.cacheHit).length,
      misses: allChunks.filter((item) => !item.cacheHit).length,
      provider: EMBEDDING_API_URL && EMBEDDING_API_KEY ? "embedding-api" : "local-fallback",
    },
  };
}

function cosine(aText, bText) {
  const a = vectorize(aText);
  const b = vectorize(bText);
  let dot = 0;
  for (const [term, value] of a.vector) {
    if (b.vector.has(term)) dot += value * b.vector.get(term);
  }
  return dot / (a.norm * b.norm);
}

function overlapScore(resumeKeywords, jdKeywords) {
  const resumeSet = new Set(resumeKeywords.map((k) => k.toLowerCase()));
  const matches = jdKeywords.filter((k) => {
    const lower = k.toLowerCase();
    return resumeSet.has(lower) || [...resumeSet].some((r) => r.includes(lower) || lower.includes(r));
  });
  return {
    ratio: jdKeywords.length ? matches.length / jdKeywords.length : 0,
    matches,
    gaps: jdKeywords.filter((k) => !matches.includes(k)).slice(0, 10),
  };
}

function inferEvidenceInsight(item) {
  const jdText = item.jdText || "";
  const resumeText = item.resumeText || "";
  const merged = `${jdText}\n${resumeText}`;
  const matched = [];
  [
    "用户研究", "需求调研", "竞品分析", "产品原型", "产品文档", "用户反馈", "产品优化",
    "数据分析", "Python", "SQL", "Excel", "Axure", "Figma", "XMind", "交互设计",
    "用户体验", "项目跟进", "团队协作", "社交产品", "职场社交",
  ].forEach((term) => {
    if (new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i").test(merged)) matched.push(term);
  });
  const gaps = [];
  if (/社交产品|职场社交|社交网络|职场人脉/.test(jdText) && !/社交产品|职场社交|社交网络|职场人脉/.test(resumeText)) gaps.push("社交产品场景");
  if (/实习|上线|开发进度|研发|设计|运营/.test(jdText) && !/实习|上线|研发|设计|运营|交付/.test(resumeText)) gaps.push("互联网产品实习或上线协作证据");
  if (/用户反馈|关键指标|活跃度|留存率|转化率/.test(jdText) && !/用户反馈|关键指标|活跃|留存|转化|指标/.test(resumeText)) gaps.push("用户反馈和指标监控表达");
  const gap = gaps[0] || "更明确的岗位关键词和结果指标";
  return {
    matchPoint: matched.slice(0, 4).join("、") || "有一定语义相关经历",
    gap,
    action: `围绕“${gap}”补一句真实经历，写清工具、动作和结果。`,
  };
}

function inferTitle(text, index = 1) {
  const lines = normalizeText(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const firstUseful = lines.find((line) => /缁忕悊|浜у搧|宸ョ▼甯坾杩愯惀|绛栫暐|鍐呭|澧為暱|鏁版嵁|AI|JD|宀椾綅|鑱屼綅/i.test(line)) || lines[0] || "";
  const match = firstUseful.match(/(?:宀椾綅|鑱屼綅|鍚嶇О|title)[:锛歕s]*([^銆傦紱;\n]{2,36})/i);
  return (match?.[1] || firstUseful || `JD ${index}`).replace(/^[-#\d.\s]+/, "").slice(0, 36);
}

function inferTags(text) {
  const t = String(text);
  const tags = [];
  const rules = [
    ["AI product", /AI|AIGC|LLM|Agent|Prompt|model|NLP/i],
    ["Content product", /content|community|CMS|SEO|editor/i],
    ["Strategy product", /strategy|market|pricing|planning|business/i],
    ["Growth product", /growth|conversion|retention|A\/B|experiment/i],
    ["Data product", /data|BI|metric|report|dashboard|warehouse/i],
    ["B2B product", /SaaS|CRM|ERP|enterprise|platform/i],
    ["C-end product", /consumer|app|member|social/i],
  ];
  for (const [label, regex] of rules) if (regex.test(t)) tags.push(label);
  return tags.length ? tags : ["General product"];
}

function summarize(text, type) {
  const lines = normalizeText(text).split("\n").map((line) => line.trim()).filter(Boolean);
  const keywords = type === "jd" ? topJdTerms(text, 16) : topTerms(text, 16);
  const yearMatch = String(text).match(/(\d+)\s*(?:years?|年)/i);
  const education = /博士|PhD/i.test(text) ? "博士"
    : /硕士|Master/i.test(text) ? "硕士"
      : /本科|Bachelor/i.test(text) ? "本科"
        : /大专|College/i.test(text) ? "大专"
          : "未明确";
  return {
    title: type === "resume" ? "简历摘要" : "JD 摘要",
    overview: lines.slice(0, 3).join("；").slice(0, 260) || "内容较短，暂无法生成完整摘要。",
    years: yearMatch ? `${yearMatch[1]} 年相关经历` : "未明确",
    education,
    highlights: keywords.slice(0, 8),
    sections: [
      { label: type === "resume" ? "核心背景" : "岗位职责", value: lines.slice(0, 4).join("；").slice(0, 300) },
      { label: type === "resume" ? "技能与经历" : "任职要求", value: keywords.slice(0, 10).join("、") || "待补充" },
      { label: type === "resume" ? "亮点" : "加分方向", value: inferHighlights(text, type).join("；") },
    ],
  };
}

function inferHighlights(text, type) {
  const result = [];
  const t = String(text);
  if (/负责人|负责|lead|manager|owner/i.test(t)) result.push("包含负责人与主导信号");
  if (/0-1|上线|发布|落地|launch|go-live|build/i.test(t)) result.push("体现从设计到落地的闭环经历");
  if (/数据|指标|增长|留存|转化|data|metric|growth|retention|conversion/i.test(t)) result.push("强调数据驱动思维");
  if (/AI|AIGC|LLM|Agent|Prompt|NLP|大模型/i.test(t)) result.push("包含 AI 相关背景");
  if (/跨团队|协作|沟通|cross|team|stakeholder|collaboration/i.test(t)) result.push("体现跨团队协作能力");
  if (!result.length) result.push(type === "resume" ? "建议补充量化结果和项目影响。" : "建议明确技能、年限和行业要求。");
  return result;
}

function createResumeRecord(payload) {
  return createRecord("resumes", payload, "resume");
}

function createJdRecord(payload) {
  return createRecord("jds", payload, "jd");
}

function createMatchReport(payload) {
  return createRecord("reports", payload, "report");
}

function createBatchRun(payload) {
  return createRecord("batchRuns", payload, "batch");
}

function createClusterRecord(payload) {
  return createRecord("clusters", payload, "cluster");
}

function createVariantRecord(payload) {
  return createRecord("variants", payload, "variant");
}

function normalizeDeliveryStatus(value) {
  const allowed = new Set(["待投", "已投", "等反馈", "暂缓"]);
  return allowed.has(value) ? value : "待投";
}

function pickResumeSnapshot(resume) {
  if (!resume) return null;
  return {
    id: resume.id,
    fileName: resume.fileName || "未命名简历",
    fileType: resume.fileType || "text",
    previewType: resume.previewType || "text",
    text: resume.text || "",
    keywords: resume.keywords || [],
    chunks: resume.chunks || [],
    parseStatus: resume.parseStatus || "",
    ocrStatus: resume.ocrStatus || "",
    summary: resume.summary || null,
    createdAt: resume.createdAt,
    status: resume.status,
  };
}

function pickJdSnapshot(jd) {
  if (!jd) return null;
  return {
    id: jd.id,
    title: jd.title || "未命名 JD",
    sourceUrl: jd.sourceUrl || "",
    rawText: jd.rawText || "",
    keywords: jd.keywords || [],
    chunks: jd.chunks || [],
    summary: jd.summary || null,
    kind: jd.kind || "single",
    createdAt: jd.createdAt,
    status: jd.status,
  };
}

function hardConditionScore(resumeText, jdText) {
  const resumeYears = Number((String(resumeText).match(/(\d+)\s*(?:years?)/i) || [])[1] || 0);
  const jdYears = Number((String(jdText).match(/(\d+)\s*(?:years?)/i) || [])[1] || 0);
  const experience = !jdYears ? 0.7 : Math.min(1, resumeYears / jdYears);
  const education = 0.8;
  return {
    experience,
    education,
    note: jdYears ? `JD expects about ${jdYears} years; resume indicates about ${resumeYears || "unknown"} years.` : "JD does not specify hard year requirements.",
  };
}

const analysisDimensionNameMap = {
  "Skill match": "技能匹配",
  "Experience match": "经验匹配",
  "Industry match": "行业/业务匹配",
  "Responsibility match": "岗位职责匹配",
  "Education and extras": "教育与附加项",
  "Industry fit": "行业匹配",
  "Role fit": "岗位匹配",
  "Direction fit": "方向匹配",
  "Salary fit": "薪资匹配",
  "Location fit": "城市匹配",
  "Bonus points": "其他加分项",
};

const analysisTextMap = new Map([
  ["Strong match. Fine-tune before sending.", "整体匹配度较高，投递前再做一轮定向优化。"],
  ["Reasonable match, but it needs tailoring.", "整体有一定匹配度，但还需要针对岗位继续改简历。"],
  ["Large gap. Adjust target direction or rewrite relevant experience.", "当前差距较大，建议调整投递方向或重写相关经历表达。"],
  ["Strongly recommend applying", "强烈建议投递"],
  ["Apply after optimization", "优化后可投递"],
  ["Not a priority apply", "暂不建议优先投递"],
  ["Bring the most relevant JD terms into the summary and project bullets.", "先把 JD 里最关键的关键词写进个人摘要和项目经历。"],
  ["Add evidence, metrics, or tools for the main gaps where you have real experience.", "针对主要差距补充真实做过的工具、方法或结果指标。"],
  ["Rewrite the top 2-3 experiences using job-language and outcome-focused bullets.", "把最相关的 2 到 3 段经历改写成更贴近岗位语言、结果导向的表达。"],
  ["DeepSeek unavailable. Local fallback used.", "DeepSeek 当前不可用，已自动切换为本地分析结果。"],
]);

function toChineseAnalysisText(text) {
  const raw = String(text || "").trim();
  if (!raw) return "";
  if (/[\u4e00-\u9fff]/.test(raw) && !/[A-Za-z]{4,}/.test(raw)) return raw;
  if (analysisTextMap.has(raw)) return analysisTextMap.get(raw);

  return raw
    .replace(/^Semantic similarity is ([\d.]+)%\.?$/i, "语义相似度约为 $1%。")
    .replace(/^Keyword coverage is ([\d.]+)%\.?$/i, "关键词覆盖率约为 $1%。")
    .replace(/^JD expects about (\d+) years; resume indicates about (unknown|\d+) years\.?$/i, (_, jdYears, resumeYears) =>
      `JD 期望约 ${jdYears} 年相关经验；简历中识别到的经验年限为${resumeYears === "unknown" ? "未明确标注" : `${resumeYears} 年`}。`)
    .replace(/^JD does not specify hard year requirements\.?$/i, "JD 未明确写出硬性的年限要求。")
    .replace(/^DeepSeek unavailable\. Local fallback used\.?$/i, "DeepSeek 当前不可用，已自动切换为本地分析结果。")
    .replace(/^current student status not indicated$/i, "简历中未明确标注当前在校状态")
    .replace(/^preferred major not specified$/i, "简历中未明确对应岗位偏好的专业背景")
    .replace(/^internship duration not specified$/i, "简历中未明确可实习时长")
    .replace(/^weekly availability not specified$/i, "简历中未明确每周可到岗时间");
}

function normalizeAnalysisLanguage(analysis) {
  if (!analysis || typeof analysis !== "object") return analysis;
  const normalized = { ...analysis };
  normalized.verdict = toChineseAnalysisText(normalized.verdict);
  normalized.recommendation = toChineseAnalysisText(normalized.recommendation);
  normalized.fallbackReason = toChineseAnalysisText(normalized.fallbackReason);

  if (Array.isArray(normalized.dimensions)) {
    normalized.dimensions = normalized.dimensions.map((item) => ({
      ...item,
      name: analysisDimensionNameMap[String(item?.name || "").trim()] || String(item?.name || "").trim(),
    }));
  }

  for (const key of ["reasons", "matches", "gaps", "nextSteps"]) {
    if (Array.isArray(normalized[key])) {
      normalized[key] = normalized[key]
        .map((item) => toChineseAnalysisText(item))
        .filter(Boolean);
    }
  }
  if (Array.isArray(normalized.priorityActions)) {
    normalized.priorityActions = normalized.priorityActions.map((item) => toChineseAnalysisText(item)).filter(Boolean);
  }
  if (Array.isArray(normalized.evidence)) {
    normalized.evidence = normalized.evidence.map((item) => ({
      ...item,
      summary: toChineseAnalysisText(item?.summary || ""),
    }));
  }

  return normalized;
}

function heuristicAnalysis(resumeText, jdText) {
  const resumeKeywords = topTerms(resumeText, 18);
  const jdKeywords = topJdTerms(jdText, 18);
  const sim = cosine(resumeText, jdText);
  const overlap = overlapScore(resumeKeywords, jdKeywords);
  const hardChecks = hardConditionScore(resumeText, jdText);
  const hasSalary = /薪资|工资|月薪|年薪|\d+\s*[kK]/.test(jdText);
  const salaryHit = !hasSalary || /薪资|工资|期望|月薪|年薪|\d+\s*[kK]/.test(resumeText);
  const hasLocation = /上海|北京|广州|深圳|杭州|成都|武汉|南京|远程|城市|地点/.test(jdText);
  const locationHit = !hasLocation || /上海|北京|广州|深圳|杭州|成都|武汉|南京|远程/.test(resumeText);
  const industry = Math.round(Math.min(12, sim * 9 + overlap.ratio * 5));
  const role = Math.round(Math.min(18, overlap.ratio * 14 + sim * 8));
  const experience = Math.round(Math.min(16, hardChecks.experience * 16));
  const direction = Math.round(Math.min(12, (sim * 0.75 + overlap.ratio * 0.25) * 12));
  const education = Math.round(Math.min(10, hardChecks.education * 10));
  const salary = salaryHit ? 8 : 4;
  const location = locationHit ? 8 : 4;
  const bonus = Math.round(Math.min(16, Math.max(4, overlap.matches.length * 1.5 + sim * 8)));
  const score = Math.max(5, Math.min(100, industry + role + experience + direction + education + salary + location + bonus));
  const priorityActions = [
    overlap.gaps[0] ? `优先补充 ${overlap.gaps[0]} 的真实经历或项目证据。` : "优先把最相关的项目经历前置。",
    "把匹配 JD 的关键词写进个人摘要和项目 bullet。",
    "每条改写建议都补充工具、动作和结果指标，避免泛泛而谈。",
  ];
  return {
    provider: "local-fallback",
    score,
    verdict: score >= 80 ? "整体匹配度较高，投递前再做一轮定向优化。" : score >= 60 ? "整体有一定匹配度，但还需要针对岗位继续改简历。" : "当前差距较大，建议调整投递方向或重写相关经历表达。",
    recommendation: score >= 80 ? "强烈建议投递" : score >= 60 ? "优化后可投递" : "暂不建议优先投递",
    dimensions: [
      { name: "行业匹配", score: industry, max: 12 },
      { name: "岗位匹配", score: role, max: 18 },
      { name: "经验匹配", score: experience, max: 16 },
      { name: "方向匹配", score: direction, max: 12 },
      { name: "学历匹配", score: education, max: 10 },
      { name: "薪资匹配", score: salary, max: 8 },
      { name: "城市匹配", score: location, max: 8 },
      { name: "其他加分项", score: bonus, max: 16 },
    ],
    vectorSimilarity: Number(sim.toFixed(3)),
    keywordCoverage: Number(overlap.ratio.toFixed(3)),
    reasons: [
      `语义相似度约为 ${(sim * 100).toFixed(1)}%。`,
      `关键词覆盖率约为 ${(overlap.ratio * 100).toFixed(1)}%。`,
      hardChecks.note
        .replace(/JD expects about (\d+) years; resume indicates about (unknown|\d+) years\./i, (_, jdYears, resumeYears) =>
          `JD 期望约 ${jdYears} 年相关经验；简历中识别到的经验年限为${resumeYears === "unknown" ? "未明确标注" : `${resumeYears} 年`}。`)
        .replace(/JD does not specify hard year requirements\./i, "JD 未明确写出硬性的年限要求。"),
    ],
    matches: overlap.matches.slice(0, 10),
    gaps: overlap.gaps,
    evidence: [],
    priorityActions,
    nextSteps: [
      ...priorityActions,
    ],
  };
}
function httpRequestJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => (raw += chunk));
      res.on("end", () => {
        if (res.statusCode < 200 || res.statusCode >= 300) {
          reject(new Error(`DeepSeek API 返回错误 ${res.statusCode}${raw ? `：${raw.slice(0, 200)}` : ""}`));
          return;
        }
        try {
          resolve(JSON.parse(raw || "{}"));
        } catch (error) {
          reject(new Error("DeepSeek API 返回内容不是有效 JSON。"));
        }
      });
    });
    req.setTimeout(30000, () => {
      req.destroy(new Error("DeepSeek API 请求超时，请检查网络或代理。"));
    });
    req.on("error", (error) => reject(error));
    req.write(body);
    req.end();
  });
}

function tlsSocketRequestJson(socket, target, headers, body) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    socket.setTimeout(30000, () => {
      socket.destroy(new Error("DeepSeek API 请求超时，请检查网络或代理。"));
    });
    socket.on("data", (chunk) => chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)));
    socket.once("error", reject);
    socket.once("end", () => {
      const rawBuffer = Buffer.concat(chunks);
      const splitIndex = rawBuffer.indexOf(Buffer.from("\r\n\r\n"));
      const headerBuffer = splitIndex >= 0 ? rawBuffer.slice(0, splitIndex) : rawBuffer;
      const headerText = headerBuffer.toString("utf8");
      let responseBodyBuffer = splitIndex >= 0 ? rawBuffer.slice(splitIndex + 4) : Buffer.alloc(0);
      if (/transfer-encoding:\s*chunked/i.test(headerText)) {
        responseBodyBuffer = decodeChunkedBody(responseBodyBuffer);
      }
      const responseBody = responseBodyBuffer.toString("utf8");
      const statusCode = Number((headerText.match(/^HTTP\/1\.[01]\s+(\d+)/) || [])[1] || 0);
      if (statusCode < 200 || statusCode >= 300) {
        reject(new Error(`DeepSeek API 返回错误 ${statusCode || "unknown"}${responseBody ? `：${responseBody.slice(0, 200)}` : ""}`));
        return;
      }
      try {
        resolve(JSON.parse(responseBody || "{}"));
      } catch (error) {
        reject(new Error(`DeepSeek API 返回内容不是有效 JSON：${responseBody.slice(0, 200)}`));
      }
    });
    const headerLines = Object.entries(headers)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\r\n");
    socket.write(`POST ${target.pathname}${target.search} HTTP/1.1\r\nHost: ${target.hostname}\r\n${headerLines}\r\nConnection: close\r\n\r\n${body}`);
  });
}

function decodeChunkedBody(body) {
  let index = 0;
  const decoded = [];
  while (index < body.length) {
    const lineEnd = body.indexOf(Buffer.from("\r\n"), index);
    if (lineEnd === -1) break;
    const sizeText = body.slice(index, lineEnd).toString("ascii").split(";")[0].trim();
    const size = Number.parseInt(sizeText, 16);
    if (!Number.isFinite(size) || size < 0) break;
    index = lineEnd + 2;
    if (size === 0) break;
    decoded.push(body.slice(index, index + size));
    index += size + 2;
  }
  return decoded.length ? Buffer.concat(decoded) : body;
}

function createProxyTunnel(proxyUrl, targetHost, targetPort) {
  const proxy = new URL(proxyUrl);
  if (proxy.protocol === "socks5:" || proxy.protocol === "socks:") {
    return createSocks5Tunnel(proxy, targetHost, targetPort);
  }
  const proxyPort = Number(proxy.port || (proxy.protocol === "https:" ? 443 : 80));
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, proxy.hostname);
    socket.setTimeout(30000);
    socket.once("connect", () => {
      const auth = proxy.username || proxy.password
        ? `Proxy-Authorization: Basic ${Buffer.from(`${decodeURIComponent(proxy.username)}:${decodeURIComponent(proxy.password)}`).toString("base64")}\r\n`
        : "";
      socket.write(`CONNECT ${targetHost}:${targetPort} HTTP/1.1\r\nHost: ${targetHost}:${targetPort}\r\n${auth}Connection: close\r\n\r\n`);
    });
    socket.once("timeout", () => {
      socket.destroy(new Error("DeepSeek 代理连接超时。"));
    });
    socket.once("error", reject);
    let header = "";
    socket.on("data", function onData(chunk) {
      header += chunk.toString("utf8");
      if (!header.includes("\r\n\r\n")) return;
      socket.off("data", onData);
      if (!/^HTTP\/1\.[01] 200/i.test(header)) {
        socket.destroy();
        reject(new Error(`DeepSeek 代理连接失败：${header.split("\r\n")[0] || "unknown"}`));
        return;
      }
      const secureSocket = tls.connect({ socket, servername: targetHost });
      secureSocket.once("secureConnect", () => resolve(secureSocket));
      secureSocket.once("error", reject);
    });
  });
}

function createSocks5Tunnel(proxy, targetHost, targetPort) {
  const proxyPort = Number(proxy.port || 1080);
  return new Promise((resolve, reject) => {
    const socket = net.connect(proxyPort, proxy.hostname);
    socket.setTimeout(30000);
    let stage = "greeting";
    socket.once("connect", () => {
      socket.write(Buffer.from([0x05, 0x01, 0x00]));
    });
    socket.once("timeout", () => {
      socket.destroy(new Error("DeepSeek SOCKS5 代理连接超时。"));
    });
    socket.once("error", reject);
    socket.on("data", function onData(chunk) {
      if (stage === "greeting") {
        if (chunk.length < 2 || chunk[0] !== 0x05 || chunk[1] !== 0x00) {
          socket.destroy();
          reject(new Error("DeepSeek SOCKS5 代理认证失败。"));
          return;
        }
        stage = "connect";
        const hostBuffer = Buffer.from(targetHost);
        const request = Buffer.concat([
          Buffer.from([0x05, 0x01, 0x00, 0x03, hostBuffer.length]),
          hostBuffer,
          Buffer.from([(targetPort >> 8) & 0xff, targetPort & 0xff]),
        ]);
        socket.write(request);
        return;
      }
      if (stage === "connect") {
        socket.off("data", onData);
        if (chunk.length < 2 || chunk[0] !== 0x05 || chunk[1] !== 0x00) {
          socket.destroy();
          reject(new Error(`DeepSeek SOCKS5 代理连接失败，状态码 ${chunk[1] ?? "unknown"}。`));
          return;
        }
        const addressType = chunk[3];
        let responseLength = 4;
        if (addressType === 0x01) responseLength += 4;
        else if (addressType === 0x03) responseLength += 1 + chunk[4];
        else if (addressType === 0x04) responseLength += 16;
        responseLength += 2;
        const remaining = chunk.slice(responseLength);
        if (remaining.length) socket.unshift(remaining);
        const secureSocket = tls.connect({ socket, servername: targetHost });
        secureSocket.once("secureConnect", () => resolve(secureSocket));
        secureSocket.once("error", reject);
      }
    });
  });
}

async function postDeepSeekJson(payload) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) throw new Error("DeepSeek API Key 未配置。");
  const body = JSON.stringify(payload);
  const target = new URL(DEEPSEEK_API_URL);
  const headers = {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
    Authorization: `Bearer ${apiKey}`,
  };
  const baseOptions = {
    method: "POST",
    hostname: target.hostname,
    port: Number(target.port || 443),
    path: `${target.pathname}${target.search}`,
    headers,
  };
  let lastError = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      if (DEEPSEEK_PROXY_URL) {
        const socket = await createProxyTunnel(DEEPSEEK_PROXY_URL, target.hostname, Number(target.port || 443));
        return await tlsSocketRequestJson(socket, target, headers, body);
      }
      return await httpRequestJson(baseOptions, body);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await delay(500 * attempt);
    }
  }
  throw new Error(`${DEEPSEEK_PROXY_URL ? "通过代理仍无法连接 DeepSeek API" : "无法连接 DeepSeek API"}，请检查网络、代理或防火墙设置。${lastError?.message ? ` 原因：${lastError.message}` : ""}`);
}

async function callDeepSeek(payload) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) return null;
  const json = await postDeepSeekJson({
    model: DEEPSEEK_MODEL,
    messages: payload.messages,
    response_format: { type: "json_object" },
    temperature: 0.1,
  });
  return JSON.parse(json.choices?.[0]?.message?.content || "{}");
}

async function fetchUrlTextFallback(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 JobMatchWorkbench/1.0" },
    });
    if (response.status === 401 || response.status === 403) {
      throw new Error("Target page may require login or is blocking access.");
    }
    if (response.status >= 500) {
      throw new Error("Target page is temporarily unavailable.");
    }
    const html = await response.text();
    const text = normalizeText(
      html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/g, " ")
        .replace(/&amp;/g, "&")
    );
    if (!response.ok) throw new Error(`Page access failed (${response.status})`);
    if (text.length < 80) throw new Error("Page content is too short or blocked.");
    return text.slice(0, 12000);
  } catch (error) {
    if (error.name === "AbortError") throw new Error("抓取超时，请稍后重试或手动粘贴 JD。");
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchUrlTextWithTavily(url, userId = "") {
  if (!TAVILY_API_KEY) return null;
  const startedAt = Date.now();
  const response = await fetch("https://api.tavily.com/extract", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${TAVILY_API_KEY}`,
    },
    body: JSON.stringify({
      urls: [url],
      extract_depth: "basic",
      include_images: false,
    }),
  });
  if (!response.ok) throw new Error(`Tavily extract failed: ${response.status}`);
  const data = await response.json();
  const item = data.results?.[0] || data.response?.results?.[0] || data;
  const text = normalizeText(item.raw_content || item.content || item.text || "");
  logAiMetric("jd_fetch.tavily", {
    userId,
    durationMs: Date.now() - startedAt,
    status: text.length >= 80 ? "success" : "empty",
  });
  if (text.length < 80) throw new Error("Tavily returned too little JD content.");
  return text.slice(0, 12000);
}

async function fetchUrlText(url, userId = "") {
  let fallbackReason = "";
  try {
    const tavilyText = await fetchUrlTextWithTavily(url, userId);
    if (tavilyText) return { text: tavilyText, provider: "tavily", fallbackReason: "" };
  } catch (error) {
    fallbackReason = error.message;
    logErrorEvent("jd_fetch.tavily_failed", {
      userId,
      errorCode: "tavily_failed",
      message: error.message,
    });
  }

  const startedAt = Date.now();
  const text = await fetchUrlTextFallback(url);
  logAiMetric("jd_fetch.fallback", {
    userId,
    durationMs: Date.now() - startedAt,
    status: "success",
    fallbackReason,
  });
  return { text, provider: "direct-fetch", fallbackReason };
}
function parseBatchText(batchText) {
  return normalizeText(batchText)
    .split(/\n\s*(?:-{3,}|={3,}|#{2,})\s*\n/g)
    .map((item) => normalizeText(item))
    .filter((item) => item.length >= 30)
    .slice(0, 30);
}

function buildJDItem(rawText, index, sourceUrl = "") {
  const text = normalizeText(rawText);
  const keywords = topJdTerms(text, 16);
  const analysis = heuristicAnalysis("", text);
  return {
    id: `jd-${Date.now()}-${index}-${Math.random().toString(16).slice(2, 8)}`,
    title: inferTitle(text, index + 1),
    sourceUrl,
    rawText: text,
    summary: summarize(text, "jd"),
    keywords,
    tags: inferTags(text),
    years: (text.match(/(\d+)\s*(?:years?)/i) || [])[1] || "Unknown",
    matchScore: 0,
    vectorSignal: analysis.vectorSimilarity,
    status: "ok",
  };
}

function enrichJDMatches(jds, resumeText) {
  return jds.map((jd) => ({
    ...jd,
    matchScore: resumeText ? heuristicAnalysis(resumeText, jd.rawText).score : 0,
  }));
}

function preferredClusterName(items) {
  const tagScores = new Map();
  for (const item of items) {
    for (const tag of item.tags || []) tagScores.set(tag, (tagScores.get(tag) || 0) + 1);
  }
  return [...tagScores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "閫氱敤浜у搧缁忕悊";
}

function clusterJDs(jds, resumeText = "") {
  const clusters = [];
  const usable = enrichJDMatches(jds.filter((jd) => jd.rawText), resumeText);
  for (const jd of usable) {
    let best = null;
    let bestScore = 0;
    for (const cluster of clusters) {
      const rep = cluster.items.map((item) => item.rawText).join("\n");
      const sim = cosine(jd.rawText, rep);
      const tagHit = jd.tags.some((tag) => cluster.tags.has(tag)) ? 0.18 : 0;
      if (sim + tagHit > bestScore) {
        best = cluster;
        bestScore = sim + tagHit;
      }
    }
    if (best && bestScore >= 0.36) {
      best.items.push(jd);
      for (const tag of jd.tags) best.tags.add(tag);
    } else {
      clusters.push({ items: [jd], tags: new Set(jd.tags) });
    }
  }

  return clusters.slice(0, 6).map((cluster, index) => {
    const items = cluster.items;
    const keywords = topJdTerms(items.map((item) => item.rawText).join("\n"), 14);
    const averageMatchScore = Math.round(items.reduce((sum, item) => sum + item.matchScore, 0) / items.length);
    const name = preferredClusterName(items);
    return {
      id: `cluster-${index + 1}`,
      name,
      jdIds: items.map((item) => item.id),
      jdTitles: items.map((item) => item.title),
      keywords,
      commonRequirements: keywords.slice(0, 8),
      mustHave: keywords.slice(0, 5),
      niceToHave: keywords.slice(5, 10),
      reason: `These JDs repeatedly emphasize ${keywords.slice(0, 5).join(", ")}.`,
      priority: averageMatchScore >= 80 ? "high" : averageMatchScore >= 60 ? "medium" : "observe",
      averageMatchScore,
      jdCount: items.length,
    };
  });
}

function makeResumeVariant(resumeText, cluster, jds) {
  const clusterJds = jds.filter((jd) => cluster.jdIds.includes(jd.id));
  const resumeKeywords = topTerms(resumeText, 18);
  const strengthen = cluster.keywords.filter((kw) => !resumeKeywords.some((rk) => rk.toLowerCase() === kw.toLowerCase())).slice(0, 8);
  const matched = cluster.keywords.filter((kw) => resumeKeywords.some((rk) => rk.toLowerCase() === kw.toLowerCase())).slice(0, 8);
  const proofWarnings = strengthen.length
    ? strengthen.slice(0, 5).map((kw) => `Only add ${kw} if it is backed by real experience.`)
    : ["This direction is already close to the base resume. Double-check metrics and claims before sending."];
  const draftBullets = [
    `Rewrite the profile summary around ${cluster.name} and highlight ${cluster.keywords.slice(0, 4).join(", ")}.`,
    "Move the most relevant projects upward and use outcome-focused bullet points.",
    `Reuse responsibility language from ${clusterJds.slice(0, 3).map((jd) => jd.title).join(", ")}.`,
    "Push unrelated content lower so the most relevant experience gets more space.",
  ];
  return {
    id: `variant-${cluster.id}`,
    clusterId: cluster.id,
    name: `${cluster.name} variant`,
    positioning: `Designed for ${cluster.name}, covering ${cluster.jdCount} JDs with an average match score of ${cluster.averageMatchScore}.`,
    keywordStrategy: {
      strengthen,
      matched,
      secondary: cluster.niceToHave,
    },
    rewritePlan: [
      "Rewrite the summary so it sounds like the target direction, not a generic background.",
      "Reorder the skills section using the most repeated JD terms first.",
      "Prioritize the top 2-3 projects that best match this direction.",
      "Add verified scale, efficiency, revenue, growth, or launch outcomes where possible.",
    ],
    draftContent: {
      title: `${cluster.name} tailored draft`,
      summary: `This version highlights ${matched.concat(strengthen).slice(0, 6).join(", ")} for ${cluster.name} opportunities.`,
      skills: cluster.keywords.slice(0, 12),
      bullets: draftBullets,
      suitableJDs: clusterJds.map((jd) => jd.title),
    },
    truthCheckWarnings: proofWarnings,
    deliveryStatus: "待投",
  };
}
async function handleRegister(req, res) {
  const { email = "", password = "" } = parseJson(await readBody(req, 512 * 1024));
  const normalizedEmail = normalizeEmail(email);
  if (!isValidEmail(normalizedEmail)) {
    logErrorEvent("auth.register.invalid_email", { email: normalizedEmail, errorCode: "invalid_email" });
    return sendError(res, 400, "请输入有效的邮箱地址。", null, "invalid_email");
  }
  if (String(password).length < 8) {
    logErrorEvent("auth.register.invalid_password", { email: normalizedEmail, errorCode: "invalid_password" });
    return sendError(res, 400, "Password must be at least 8 characters.", null, "invalid_password");
  }
  if (getUserByEmail(normalizedEmail)) {
    logErrorEvent("auth.register.email_taken", { email: normalizedEmail, errorCode: "email_taken" });
    return sendError(res, 409, "This email is already registered.", null, "email_taken");
  }
  const user = createUserRecord({
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    plan: "free",
    quota: {
      singleAnalysisUsed: 0,
      batchRunsUsed: 0,
      exportsUsed: 0,
    },
    quotaResetAt: nowIso(),
  });
  const token = crypto.randomBytes(32).toString("hex");
  createSessionRecord({
    userId: user.id,
    token,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString(),
  });
  setSessionCookie(res, token);
  sendSuccess(res, 201, { message: "Registered and logged in.", user: serializeUser(user) });
}

async function handleLogin(req, res) {
  const { email = "", password = "" } = parseJson(await readBody(req, 512 * 1024));
  const user = getUserByEmail(email);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    logErrorEvent("auth.login.invalid_credentials", { email: normalizeEmail(email), errorCode: "invalid_credentials" });
    return sendError(res, 401, "Email or password is incorrect.", null, "invalid_credentials");
  }
  const token = crypto.randomBytes(32).toString("hex");
  createSessionRecord({
    userId: user.id,
    token,
    expiresAt: new Date(Date.now() + SESSION_MAX_AGE_MS).toISOString(),
  });
  setSessionCookie(res, token);
  sendSuccess(res, 200, { message: "Logged in.", user: serializeUser(user) });
}

async function handleLogout(req, res) {
  const cookies = parseCookies(req);
  const token = cookies[SESSION_COOKIE];
  if (token) {
    const session = getSessionByToken(token);
    if (session) deleteRecord("sessions", session.id);
  }
  clearSessionCookie(res);
  sendSuccess(res, 200, { message: "Logged out." });
}

function handleAuthMe(req, res) {
  const current = getCurrentUser(req);
  if (!current) return sendError(res, 401, "请先登录后再继续。", null, "auth_required");
  sendSuccess(res, 200, { user: serializeUser(current.user) });
}

async function handleTrackEvent(req, res) {
  const current = getCurrentUser(req);
  const { event = "", payload = {} } = parseJson(await readBody(req, 128 * 1024));
  const safeEvent = String(event || "").trim().slice(0, 80);
  if (!safeEvent) return sendError(res, 400, "缺少事件名称。", null, "missing_event");
  logUserEvent(safeEvent, {
    userId: current?.user?.id || "",
    payload,
  });
  sendSuccess(res, 200, { message: "事件已记录。" });
}
async function handleUpload(req, res) {
  const current = requireAuth(req, res);
  if (!current) return;
  const body = await readBody(req);
  const parts = parseMultipart(body, req.headers["content-type"]);
  const file = parts.find((p) => p.name === "resume" && p.filename);
  if (!file) return sendError(res, 400, "请先选择一份简历文件。", null, "missing_file");
  if (!path.extname(file.filename || "")) return sendError(res, 400, "文件缺少扩展名，请上传 PDF、DOC 或 DOCX 文件。", null, "missing_extension");
  if (!file.data?.length) return sendError(res, 400, "文件内容为空，请重新选择文件。", null, "empty_file");
  if (file.data.length > MAX_UPLOAD_BYTES) return sendError(res, 413, "请上传小于 10MB 的文件。", null, "file_too_large");
  const ext = path.extname(file.filename).toLowerCase();
  if (![".pdf", ".doc", ".docx"].includes(ext)) return sendError(res, 400, "目前仅支持 PDF、DOC 和 DOCX 简历文件。", null, "unsupported_file_type");

  const filename = safeFileName(file.filename);
  const filePath = path.join(uploadDir, filename);
  fs.writeFileSync(filePath, file.data);

  let text = "";
  let parseStatus = "text_extracted";
  let ocrStatus = "";
  let ocrMessage = "";
  try {
    text = normalizeText(await extractText(filePath));
  } catch (error) {
    if (ext === ".pdf") {
      parseStatus = "ocr_pending";
      const ocr = await tryOcrExtract(filePath, current.user.id);
      text = ocr.text;
      ocrStatus = ocr.status;
      ocrMessage = ocr.message;
    }
    if (text) {
      parseStatus = ocrStatus || "ocr_completed";
    } else if (ocrStatus) {
      return sendError(res, 422, "这份 PDF 需要 OCR 识别后才能分析。", ocrMessage, ocrStatus);
    } else {
      const failure = detectUploadFailureMessage(ext, error.message);
      return sendError(res, 422, failure.message, failure.detail, failure.error);
    }
  }

  if (!text) {
    if (ext === ".pdf") {
      parseStatus = "ocr_pending";
      const ocr = await tryOcrExtract(filePath, current.user.id);
      text = ocr.text;
      ocrStatus = ocr.status;
      ocrMessage = ocr.message;
      if (!text) return sendError(res, 422, "这份 PDF 需要 OCR 识别后才能分析。", ocrMessage, ocrStatus || "ocr_failed");
      parseStatus = ocrStatus || "ocr_completed";
    }
    if (!text) return sendError(res, 422, "没有提取到有效的简历文本，请粘贴简历文本或更换文件。", null, "empty_resume_text");
  }

  const localKeywordResult = extractGroupedTerms(text);
  let keywordGroups = localKeywordResult.groups;
  let keywords = localKeywordResult.flattened;
  let keywordProvider = "local-fallback";
  try {
    const deepseekKeywordResult = await extractResumeKeywordGroupsWithDeepSeek(text, localKeywordResult);
    if (deepseekKeywordResult) {
      keywordGroups = deepseekKeywordResult.groups;
      keywords = deepseekKeywordResult.flattened;
      keywordProvider = deepseekKeywordResult.provider || "deepseek";
    }
  } catch (error) {
    logErrorEvent("deepseek.resume_keywords_failed", {
      userId: current.user.id,
      errorCode: "deepseek_resume_keywords_failed",
      message: error.message,
    });
  }

  const resumeRecord = createResumeRecord(withUser({
    fileName: file.filename,
    storedName: filename,
    fileType: ext.replace(".", ""),
    previewType: ext === ".pdf" ? "pdf" : "text",
    previewUrl: ext === ".pdf" ? `/uploads/${encodeURIComponent(filename)}` : null,
    text,
    keywords,
    keywordGroups,
    keywordProvider,
    chunks: chunkText(text, "resume"),
    parseStatus,
    ocrStatus,
    summary: summarize(text, "resume"),
  }, current.user.id));

  logUserEvent("resume.uploaded", {
    userId: current.user.id,
    fileType: ext.replace(".", ""),
    parseStatus,
    ocrStatus,
  });

  sendSuccess(res, 200, {
    message: parseStatus === "text_extracted" ? "简历解析成功。" : "简历已解析，并返回 OCR 状态。",
    resumeId: resumeRecord.id,
    createdAt: resumeRecord.createdAt,
    fileName: resumeRecord.fileName,
    storedName: resumeRecord.storedName,
    fileType: resumeRecord.fileType,
    previewType: resumeRecord.previewType,
    previewUrl: resumeRecord.previewUrl,
    text: resumeRecord.text,
    keywords: resumeRecord.keywords,
    keywordGroups: resumeRecord.keywordGroups || [],
    keywordProvider: resumeRecord.keywordProvider || "local-fallback",
    parseStatus: resumeRecord.parseStatus,
    ocrStatus: resumeRecord.ocrStatus || "",
    summary: resumeRecord.summary,
  });
}

async function handleFetchJd(req, res) {
  const current = getCurrentUser(req);
  const { url } = parseJson(await readBody(req, 2 * 1024 * 1024));
  if (!/^https?:\/\//i.test(url || "")) return sendError(res, 400, "请输入有效的 JD 链接。", null, "invalid_jd_url");
  try {
    const result = await fetchUrlText(url, current?.user?.id || "");
    logUserEvent("jd.fetched", {
      userId: current?.user?.id || "",
      sourceUrl: url,
      provider: result.provider,
      fallbackReason: result.fallbackReason || "",
    });
    sendSuccess(res, 200, {
      message: "JD 获取成功。",
      text: result.text,
      source: url,
      provider: result.provider,
      fallbackReason: result.fallbackReason || "",
    });
  } catch (error) {
    sendError(res, 422, "JD 获取失败，请手动粘贴 JD 内容。", error.message, "jd_fetch_failed");
  }
}
async function handleAnalyze(req, res) {
  return handleAnalyzeSecure(req, res);
}

async function handleBatchJds(req, res) {
  return handleBatchJdsSecure(req, res);
}

async function handleClusterJds(req, res) {
  return handleClusterJdsSecure(req, res);
}

async function handleResumeVariants(req, res) {
  return handleResumeVariantsSecure(req, res);
}

async function handleUpdateVariant(req, res, variantId) {
  return handleUpdateVariantSecure(req, res, variantId);
}

async function handleExportResume(req, res) {
  return handleExportResumeSecure(req, res);
}

function handleGetResumeList(req, res) {
  return handleGetResumeListSecure(req, res);
}

function handleGetResumeDetail(req, res, resumeId) {
  return handleGetResumeDetailSecure(req, res, resumeId);
}

function handleGetJdList(req, res) {
  return handleGetJdListSecure(req, res);
}

function handleGetRecentHistory(req, res) {
  return handleGetRecentHistorySecure(req, res);
}

function handleGetReport(req, res, reportId) {
  return handleGetReportSecure(req, res, reportId);
}

function handleGetBatchRun(req, res, batchRunId) {
  return handleGetBatchRunSecure(req, res, batchRunId);
}

function handleGetVariant(req, res, variantId) {
  return handleGetVariantSecure(req, res, variantId);
}
async function handleAnalyzeSecure(req, res) {
  const current = requireAuth(req, res);
  if (!current) return;
  if (!checkQuota(res, current.user, "singleAnalysis")) return;
  const analysisStartedAt = Date.now();
  const { resumeText, jdText, resumeId, jdSourceUrl = "" } = parseJson(await readBody(req, 8 * 1024 * 1024));
  if (!normalizeText(resumeText)) return sendError(res, 400, "请先上传并解析简历。", null, "missing_resume_text");
  if (!normalizeText(jdText)) return sendError(res, 400, "请先填写 JD 内容。", null, "missing_jd_text");

  const resumeRecord = resumeId ? getRecord("resumes", resumeId) : null;
  if (resumeId && !assertOwnership(res, resumeRecord, current.user.id, "resume")) return;

  const resumeSummary = summarize(resumeText, "resume");
  const jdSummary = summarize(jdText, "jd");
  const resumeKeywords = topTerms(resumeText, 18);
  const jdKeywords = topJdTerms(jdText, 18);
  const local = heuristicAnalysis(resumeText, jdText);
  const retrieval = await buildRetrievalContext(resumeText, jdText, current.user.id);
  local.evidence = retrieval.evidence.map((item) => ({
    score: item.score,
    resumeLabel: displayChunkLabel(item.resumeLabel, "简历片段"),
    resumeText: item.resumeText,
    jdLabel: displayChunkLabel(item.jdLabel, "岗位片段"),
    jdText: item.jdText,
    ...inferEvidenceInsight(item),
    summary: `岗位“${displayChunkLabel(item.jdLabel, "片段")}”与简历“${displayChunkLabel(item.resumeLabel, "片段")}”存在 ${Math.round(item.score * 100)}% 的可迁移匹配。`,
  }));
  local.cacheStats = retrieval.cacheStats;
  let analysis = local;
  let message = "报告已生成。";

  try {
    const deepseek = await callDeepSeek({
      messages: [
        {
          role: "system",
          content: "你是中文求职顾问，擅长校招、实习和产品岗位简历诊断。只返回合法 JSON。所有文本字段必须使用简体中文，不要输出英文句子。dimensions 中的名称必须使用：行业匹配、岗位匹配、经验匹配、方向匹配、学历匹配、薪资匹配、城市匹配、其他加分项。",
        },
        {
          role: "user",
          content: `请比较这份简历与岗位 JD，并返回 JSON，字段必须包含 score、verdict、recommendation、dimensions、reasons、matches、gaps、evidence、priorityActions、nextSteps。\n要求：\n1. 所有说明文字都用简体中文。\n2. score 是 0-100 分；dimensions 必须覆盖 8 个维度，且总 max 为 100。\n3. 这是校招/实习岗位，不要因为缺少正式全职经验就极端压低评分；请区分“可迁移匹配”和“硬缺口”。\n4. evidence 必须基于我提供的证据片段，不允许凭空编造经历。每条 evidence 尽量包含 summary、matchPoint、gap、action、resumeText、jdText。\n5. priorityActions 要给 3 条最优先、可执行的改简历动作，必须具体到“把哪段经历改成什么方向”。\n6. matches 以中文关键词或 JD 中的中文要求为主；如果原词本身是通用英文技能词，例如 Python、SQL，可以保留。\n7. 不要添加 JSON 之外的任何内容。\n简历摘要：${resumeSummary.overview}\n简历关键词：${resumeKeywords.join(", ")}\nJD 摘要：${jdSummary.overview}\nJD 关键词：${jdKeywords.join(", ")}\n证据片段：${JSON.stringify(local.evidence)}\n本地分析结果：${JSON.stringify(local)}`,
        },
      ],
    });
    if (deepseek) analysis = { ...local, ...deepseek, provider: "deepseek", cacheStats: retrieval.cacheStats };
  } catch (error) {
    logErrorEvent("deepseek.single_analysis_failed", {
      userId: current.user.id,
      errorCode: "deepseek_failed",
      message: error.message,
    });
    logAiMetric("analysis.deepseek_failed", {
      userId: current.user.id,
      provider: "deepseek",
      durationMs: Date.now() - analysisStartedAt,
      status: "fallback",
      fallbackReason: error.message,
    });
    analysis.deepseekError = error.message;
    analysis.fallbackReason = "DeepSeek 当前不可用，已自动切换为本地分析结果。";
    message = "DeepSeek 当前不可用，已自动切换为本地分析结果。";
  }

  analysis = normalizeAnalysisLanguage(analysis);
  if (!Array.isArray(analysis.evidence) || !analysis.evidence.length) analysis.evidence = local.evidence;
  if (!Array.isArray(analysis.priorityActions) || !analysis.priorityActions.length) analysis.priorityActions = analysis.nextSteps || local.priorityActions;
  analysis.cacheStats = retrieval.cacheStats;

  const linkedResume = resumeRecord || createResumeRecord(withUser({
    fileName: "未命名简历",
    fileType: "text",
    previewType: "text",
    text: resumeText,
    keywords: resumeKeywords,
    chunks: retrieval.resumeChunks,
    summary: resumeSummary,
  }, current.user.id));
  const jdRecord = createJdRecord(withUser({
    title: inferTitle(jdText),
    sourceUrl: jdSourceUrl,
    rawText: jdText,
    keywords: jdKeywords,
    chunks: retrieval.jdChunks,
    summary: jdSummary,
    kind: "single",
  }, current.user.id));
  const report = createMatchReport(withUser({
    resumeId: linkedResume.id,
    jdId: jdRecord.id,
    provider: analysis.provider || "local-fallback",
    fallbackReason: analysis.fallbackReason || "",
    resume: pickResumeSnapshot(linkedResume),
    jd: pickJdSnapshot(jdRecord),
    analysis,
    cacheStats: retrieval.cacheStats,
  }, current.user.id));

  updateRecord("users", current.user.id, (user) => ({
    quota: { ...(user.quota || {}), singleAnalysisUsed: Number(user.quota?.singleAnalysisUsed || 0) + 1 },
  }));

  logAiMetric("analysis.completed", {
    userId: current.user.id,
    provider: analysis.provider || "local-fallback",
    durationMs: Date.now() - analysisStartedAt,
    cacheHits: retrieval.cacheStats.hits,
    cacheMisses: retrieval.cacheStats.misses,
    fallbackReason: analysis.fallbackReason || "",
    status: "success",
  });
  logUserEvent("analysis.generated", {
    userId: current.user.id,
    provider: analysis.provider || "local-fallback",
    score: analysis.score,
  });

  sendSuccess(res, 200, {
    message,
    reportId: report.id,
    createdAt: report.createdAt,
    resumeId: linkedResume.id,
    jdId: jdRecord.id,
    resume: { keywords: resumeKeywords, summary: resumeSummary },
    jd: { keywords: jdKeywords, summary: jdSummary },
    analysis,
    cacheStats: retrieval.cacheStats,
  });
}

async function handleBatchJdsSecure(req, res) {
  const current = requireAuth(req, res);
  if (!current) return;
  if (!checkQuota(res, current.user, "batchRuns")) return;
  const { resumeText = "", resumeId, batchText = "", urls = [], manualItems = [] } = parseJson(await readBody(req, 10 * 1024 * 1024));
  const resumeRecord = resumeId ? getRecord("resumes", resumeId) : null;
  if (resumeId && !assertOwnership(res, resumeRecord, current.user.id, "resume")) return;

  const items = [];
  const failures = [];
  const textItems = [...parseBatchText(batchText), ...manualItems.map((item) => item.text || item.rawText || "").filter(Boolean)];
  textItems.slice(0, 30).forEach((item, index) => items.push(buildJDItem(item, index)));

  for (const url of urls.slice(0, Math.max(0, 30 - items.length))) {
    if (!/^https?:\/\//i.test(url || "")) {
      failures.push({ sourceUrl: url, error: "链接格式无效" });
      continue;
    }
    try {
      const result = await fetchUrlText(url, current.user.id);
      items.push(buildJDItem(result.text, items.length, url));
    } catch (error) {
      failures.push({ sourceUrl: url, error: "抓取失败，请手动粘贴 JD。", detail: error.message });
    }
  }

  const enrichedItems = enrichJDMatches(items, resumeText);
  if (!enrichedItems.length) {
    const detail = failures.length ? "All URLs failed or no valid JD text was found." : null;
    return sendError(res, 422, "没有识别到有效的 JD 内容。", detail, "empty_batch_jds");
  }

  const linkedResume = resumeRecord || (normalizeText(resumeText)
    ? createResumeRecord(withUser({
        fileName: "未命名简历",
        fileType: "text",
        previewType: "text",
        text: resumeText,
        keywords: topTerms(resumeText, 18),
        summary: summarize(resumeText, "resume"),
      }, current.user.id))
    : null);

  const jdRecords = enrichedItems.map((item) => createJdRecord(withUser({
    title: item.title,
    sourceUrl: item.sourceUrl || "",
    rawText: item.rawText,
    keywords: item.keywords,
    summary: item.summary,
    matchScore: item.matchScore,
    kind: "batch",
    tags: item.tags,
  }, current.user.id)));

  const batchRun = createBatchRun(withUser({
    resumeId: linkedResume?.id || "",
    source: { batchText, urls },
    itemIds: jdRecords.map((item) => item.id),
    failures,
    clusters: [],
    variants: [],
    provider: "local-fallback",
    status: failures.length ? "partial_success" : "success",
  }, current.user.id));

  updateRecord("users", current.user.id, (user) => ({
    quota: { ...(user.quota || {}), batchRunsUsed: Number(user.quota?.batchRunsUsed || 0) + 1 },
  }));

  sendSuccess(res, 200, {
    message: failures.length
      ? `Parsed ${enrichedItems.length} JDs, with ${failures.length} failed links.`
      : `Parsed ${enrichedItems.length} JDs.`,
    batchRunId: batchRun.id,
    createdAt: batchRun.createdAt,
    resumeId: linkedResume?.id || "",
    items: enrichedItems.map((item, index) => ({ ...item, id: jdRecords[index].id, createdAt: jdRecords[index].createdAt })),
    failures,
    limit: 30,
  });
}

async function handleClusterJdsSecure(req, res) {
  const current = requireAuth(req, res);
  if (!current) return;
  const { resumeText = "", batchRunId = "", jds = [] } = parseJson(await readBody(req, 10 * 1024 * 1024));
  if (!Array.isArray(jds) || jds.length < 2) return sendError(res, 400, "至少需要 2 条 JD 才能进行岗位方向归类。", null, "insufficient_jds_for_cluster");
  const batchRun = batchRunId ? getRecord("batchRuns", batchRunId) : null;
  if (batchRunId && !assertOwnership(res, batchRun, current.user.id, "batch_run")) return;

  const clusters = clusterJDs(jds, resumeText);
  const clusterRecords = clusters.map((cluster) => createClusterRecord(withUser({
    batchRunId,
    name: cluster.name,
    jdIds: cluster.jdIds,
    jdTitles: cluster.jdTitles,
    keywords: cluster.keywords,
    commonRequirements: cluster.commonRequirements,
    mustHave: cluster.mustHave,
    niceToHave: cluster.niceToHave,
    reason: cluster.reason,
    priority: cluster.priority,
    averageMatchScore: cluster.averageMatchScore,
    jdCount: cluster.jdCount,
    provider: "local-fallback",
  }, current.user.id)));

  if (batchRunId) updateRecord("batchRuns", batchRunId, { clusters: clusterRecords.map((item) => item.id) });

  sendSuccess(res, 200, {
    message: `已生成 ${clusters.length} 个岗位方向。`,
    clusters: clusterRecords.map((record) => ({
      id: record.id,
      name: record.name,
      jdIds: record.jdIds,
      jdTitles: record.jdTitles,
      keywords: record.keywords,
      commonRequirements: record.commonRequirements,
      mustHave: record.mustHave,
      niceToHave: record.niceToHave,
      reason: record.reason,
      priority: record.priority,
      averageMatchScore: record.averageMatchScore,
      jdCount: record.jdCount,
      createdAt: record.createdAt,
    })),
    provider: "local-fallback",
  });
}

async function handleResumeVariantsSecure(req, res) {
  const current = requireAuth(req, res);
  if (!current) return;
  const { resumeText = "", resumeId = "", batchRunId = "", jds = [], clusters = [], targetClusterIds = [] } = parseJson(await readBody(req, 10 * 1024 * 1024));
  if (!normalizeText(resumeText)) return sendError(res, 400, "请先上传基础简历。", null, "missing_resume_text");
  if (!Array.isArray(clusters) || !clusters.length) return sendError(res, 400, "请先生成岗位方向。", null, "missing_clusters");
  const selected = clusters.filter((cluster) => !targetClusterIds.length || targetClusterIds.includes(cluster.id));
  if (!selected.length) return sendError(res, 400, "No target cluster was selected.", null, "missing_target_clusters");

  const resumeRecord = resumeId ? getRecord("resumes", resumeId) : null;
  if (resumeId && !assertOwnership(res, resumeRecord, current.user.id, "resume")) return;
  const batchRun = batchRunId ? getRecord("batchRuns", batchRunId) : null;
  if (batchRunId && !assertOwnership(res, batchRun, current.user.id, "batch_run")) return;

  const linkedResume = resumeRecord || createResumeRecord(withUser({
    fileName: "未命名简历",
    fileType: "text",
    previewType: "text",
    text: resumeText,
    keywords: topTerms(resumeText, 18),
    summary: summarize(resumeText, "resume"),
  }, current.user.id));

  const variants = selected.map((cluster) => makeResumeVariant(resumeText, cluster, jds));
  const variantRecords = variants.map((variant) => createVariantRecord(withUser({
    batchRunId,
    resumeId: linkedResume.id,
    clusterId: variant.clusterId,
    name: variant.name,
    positioning: variant.positioning,
    keywordStrategy: variant.keywordStrategy,
    rewritePlan: variant.rewritePlan,
    draftContent: variant.draftContent,
    truthCheckWarnings: variant.truthCheckWarnings,
    isPrimary: false,
    provider: "local-fallback",
  }, current.user.id)));
  if (batchRunId) updateRecord("batchRuns", batchRunId, { variants: variantRecords.map((item) => item.id) });

  sendSuccess(res, 200, {
    message: `已生成 ${variants.length} 个简历版本。`,
    variants: variantRecords.map((record) => ({
      id: record.id,
      clusterId: record.clusterId,
      name: record.name,
      positioning: record.positioning,
      keywordStrategy: record.keywordStrategy,
      rewritePlan: record.rewritePlan,
      draftContent: record.draftContent,
      truthCheckWarnings: record.truthCheckWarnings,
      isPrimary: record.isPrimary,
      deliveryStatus: normalizeDeliveryStatus(record.deliveryStatus),
      exportFileName: record.exportFileName || "",
      exportPath: record.exportPath || "",
      lastExportedAt: record.lastExportedAt || "",
      exportHistory: record.exportHistory || [],
      exportCount: Array.isArray(record.exportHistory) ? record.exportHistory.length : 0,
      createdAt: record.createdAt,
      resumeId: record.resumeId,
      batchRunId: record.batchRunId,
    })),
    provider: "local-fallback",
  });
}

async function handleUpdateVariantSecure(req, res, variantId) {
  const current = requireAuth(req, res);
  if (!current) return;
  const variant = getRecord("variants", variantId);
  if (!assertOwnership(res, variant, current.user.id, "variant")) return;
  const { name, isPrimary, deliveryStatus } = parseJson(await readBody(req, 512 * 1024));
  const patch = {};
  if (typeof name === "string") {
    const nextName = name.trim().slice(0, 60);
    if (!nextName) return sendError(res, 400, "Variant name cannot be empty.", null, "invalid_variant_name");
    patch.name = nextName;
  }
  if (typeof isPrimary === "boolean") patch.isPrimary = isPrimary;
  if (typeof deliveryStatus === "string") patch.deliveryStatus = normalizeDeliveryStatus(deliveryStatus);
  if (!Object.keys(patch).length) return sendError(res, 400, "No changes were provided.", null, "missing_variant_updates");
  if (patch.isPrimary === true && variant.batchRunId) {
    findRecords("variants", (item) => item.batchRunId === variant.batchRunId && item.userId === current.user.id, Infinity).forEach((item) => {
      if (item.id !== variantId && item.isPrimary) updateRecord("variants", item.id, { isPrimary: false });
    });
  }
  const updated = updateRecord("variants", variantId, patch);
  let message = "Variant updated.";
  if (patch.isPrimary) message = "Primary variant updated.";
  else if (patch.deliveryStatus) message = "Delivery status updated.";
  else if (patch.name) message = "Variant name updated.";
  sendSuccess(res, 200, { message, item: updated });
}

async function handleExportResumeSecure(req, res) {
  const current = requireAuth(req, res);
  if (!current) return;
  if (!checkQuota(res, current.user, "exports")) return;
  const { variant } = parseJson(await readBody(req, 2 * 1024 * 1024));
  if (!variant) return sendError(res, 400, "Missing variant payload.", null, "missing_variant");
  const variantRecord = variant.id ? getRecord("variants", variant.id) : null;
  if (variant.id && !assertOwnership(res, variantRecord, current.user.id, "variant")) return;
  const payloadName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const payloadPath = path.join(exportDir, payloadName);
  const filename = exportFileName(variant.name || variant.draftContent?.title || "resume-variant");
  const outputPath = path.join(exportDir, filename);
  fs.writeFileSync(payloadPath, JSON.stringify({ variant }, null, 2), "utf8");
  try {
    const script = path.join(__dirname, "export_resume_doc.py");
    await runPythonJson(script, [payloadPath, outputPath]);
    const exportedAt = new Date().toISOString();
    if (variantRecord) {
      const history = Array.isArray(variantRecord.exportHistory) ? [...variantRecord.exportHistory] : [];
      history.unshift({ fileName: filename, downloadUrl: `/exports/${encodeURIComponent(filename)}`, exportedAt });
      updateRecord("variants", variant.id, {
        exportFileName: filename,
        exportPath: `/exports/${encodeURIComponent(filename)}`,
        lastExportedAt: exportedAt,
        exportHistory: history.slice(0, 10),
      });
    }
    updateRecord("users", current.user.id, (user) => ({
      quota: { ...(user.quota || {}), exportsUsed: Number(user.quota?.exportsUsed || 0) + 1 },
    }));
    logUserEvent("resume.exported", {
      userId: current.user.id,
      variantId: variant?.id || "",
      fileName: filename,
    });
    sendSuccess(res, 200, {
      message: "Word export generated.",
      variantName: variant.name,
      fileName: filename,
      downloadUrl: `/exports/${encodeURIComponent(filename)}`,
      exportedAt,
    });
  } catch (error) {
    logErrorEvent("export.resume_failed", {
      userId: current.user.id,
      variantId: variant?.id || "",
      errorCode: "export_failed",
      message: error.message,
    });
    return sendError(res, 500, "Word export failed.", error.message, "export_failed");
  } finally {
    if (fs.existsSync(payloadPath)) fs.unlinkSync(payloadPath);
  }
}

function handleGetResumeListSecure(req, res) {
  const current = requireAuth(req, res);
  if (!current) return;
  const items = findRecords("resumes", (item) => item.userId === current.user.id, 20).map((item) => ({
    id: item.id,
    fileName: item.fileName,
    fileType: item.fileType,
    previewType: item.previewType,
    keywords: item.keywords || [],
    keywordGroups: item.keywordGroups || [],
    summary: item.summary || null,
    createdAt: item.createdAt,
    status: item.status,
  }));
  sendSuccess(res, 200, { items });
}

function handleGetResumeDetailSecure(req, res, resumeId) {
  const current = requireAuth(req, res);
  if (!current) return;
  const resume = getRecord("resumes", resumeId);
  if (!assertOwnership(res, resume, current.user.id, "resume")) return;
  const reports = findRecords("reports", (item) => item.resumeId === resumeId && item.userId === current.user.id, 10).map((item) => ({
    id: item.id,
    type: "report",
    title: item.jd?.title || "Single JD report",
    score: item.analysis?.score ?? null,
    recommendation: item.analysis?.recommendation || "",
    createdAt: item.createdAt,
  }));
  const batchRuns = findRecords("batchRuns", (item) => item.resumeId === resumeId && item.userId === current.user.id, 10).map((item) => ({
    id: item.id,
    type: "batch",
    title: `Batch run · ${item.itemIds?.length || 0} JDs`,
    jdCount: item.itemIds?.length || 0,
    clusterCount: item.clusters?.length || 0,
    variantCount: item.variants?.length || 0,
    createdAt: item.createdAt,
    status: item.status,
  }));
  sendSuccess(res, 200, { item: resume, related: { reports, batchRuns } });
}

function handleGetJdListSecure(req, res) {
  const current = requireAuth(req, res);
  if (!current) return;
  const items = findRecords("jds", (item) => item.userId === current.user.id, 30).map((item) => ({
    id: item.id,
    title: item.title,
    sourceUrl: item.sourceUrl,
    kind: item.kind,
    createdAt: item.createdAt,
    status: item.status,
  }));
  sendSuccess(res, 200, { items });
}

function handleGetRecentHistorySecure(req, res) {
  const current = requireAuth(req, res);
  if (!current) return;
  const reports = findRecords("reports", (item) => item.userId === current.user.id, 8).map((item) => ({
    id: item.id,
    type: "report",
    title: item.jd?.title || "单 JD 分析报告",
    recommendation: normalizeAnalysisLanguage(item.analysis || {})?.recommendation || "",
    score: normalizeAnalysisLanguage(item.analysis || {})?.score ?? null,
    provider: item.provider || item.analysis?.provider || "local-fallback",
    createdAt: item.createdAt,
    resumeId: item.resumeId,
  }));
  const batchRuns = findRecords("batchRuns", (item) => item.userId === current.user.id, 8).map((item) => ({
    id: item.id,
    type: "batch",
    title: `Batch run · ${item.itemIds?.length || 0} JDs`,
    status: item.status,
    provider: item.provider || "local-fallback",
    createdAt: item.createdAt,
    resumeId: item.resumeId,
    jdCount: item.itemIds?.length || 0,
    clusterCount: item.clusters?.length || 0,
    variantCount: item.variants?.length || 0,
  }));
  const items = [...reports, ...batchRuns].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()).slice(0, 12);
  sendSuccess(res, 200, { items });
}

function handleGetReportSecure(req, res, reportId) {
  const current = requireAuth(req, res);
  if (!current) return;
  const report = getRecord("reports", reportId);
  if (!assertOwnership(res, report, current.user.id, "report")) return;
  sendSuccess(res, 200, {
    item: {
      ...report,
      analysis: normalizeAnalysisLanguage(report.analysis || {}),
    },
  });
}

function handleGetBatchRunSecure(req, res, batchRunId) {
  const current = requireAuth(req, res);
  if (!current) return;
  const batchRun = getRecord("batchRuns", batchRunId);
  if (!assertOwnership(res, batchRun, current.user.id, "batch_run")) return;
  const jds = (batchRun.itemIds || []).map((id) => getRecord("jds", id)).filter((item) => item && item.userId === current.user.id);
  const clusters = (batchRun.clusters || []).map((id) => getRecord("clusters", id)).filter((item) => item && item.userId === current.user.id);
  const variants = (batchRun.variants || []).map((id) => getRecord("variants", id)).filter((item) => item && item.userId === current.user.id);
  sendSuccess(res, 200, { item: { ...batchRun, jds, clusters, variants } });
}

function handleGetVariantSecure(req, res, variantId) {
  const current = requireAuth(req, res);
  if (!current) return;
  const variant = getRecord("variants", variantId);
  if (!assertOwnership(res, variant, current.user.id, "variant")) return;
  sendSuccess(res, 200, { item: variant });
}

function handleGetUsageCenterSecure(req, res) {
  const current = requireAuth(req, res);
  if (!current) return;
  sendSuccess(res, 200, buildUsageCenter(current.user));
}

function handleGetAdminMonitor(req, res) {
  const current = requireAdmin(req, res);
  if (!current) return;
  sendSuccess(res, 200, buildAdminMonitor());
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith("/uploads/")) {
    const name = decodeURIComponent(url.pathname.replace("/uploads/", ""));
    const file = path.join(uploadDir, path.basename(name));
    if (!fs.existsSync(file)) return send(res, 404, "Not found", "text/plain");
    res.writeHead(200, { "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
    fs.createReadStream(file).pipe(res);
    return;
  }
  if (url.pathname.startsWith("/exports/")) {
    const name = decodeURIComponent(url.pathname.replace("/exports/", ""));
    const file = path.join(exportDir, path.basename(name));
    if (!fs.existsSync(file)) return send(res, 404, "Not found", "text/plain");
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${path.basename(file)}"`,
    });
    fs.createReadStream(file).pipe(res);
    return;
  }
  const target = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
  const filePath = path.normalize(path.join(publicDir, target));
  if (!filePath.startsWith(publicDir) || !fs.existsSync(filePath)) {
    return send(res, 404, "Not found", "text/plain");
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(filePath).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

function attachRequestLogging(req, res) {
  const startedAt = Date.now();
  const originalWriteHead = res.writeHead.bind(res);
  res.writeHead = function patchedWriteHead(statusCode, ...args) {
    res.statusCode = statusCode;
    return originalWriteHead(statusCode, ...args);
  };
  res.on("finish", () => {
    const current = getCurrentUser(req);
    const entry = {
      timestamp: nowIso(),
      method: req.method,
      path: req.url,
      userId: current?.user?.id || null,
      statusCode: res.statusCode || 200,
      durationMs: Date.now() - startedAt,
      errorCode: res._jobpilotErrorCode || "",
    };
    logToFile("requests.log", entry);
    if (entry.statusCode >= 400) {
      console.warn(`[${entry.timestamp}] ${entry.method} ${entry.path} -> ${entry.statusCode}`);
    }
  });
}

async function handleDeepSeekCheck(req, res) {
  try {
    const result = await postDeepSeekJson({
      model: DEEPSEEK_MODEL,
      messages: [
        { role: "system", content: "只返回合法 JSON。" },
        { role: "user", content: "返回 {\"ok\":true,\"message\":\"connected\"}" },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    });
    sendSuccess(res, 200, {
      connected: true,
      model: DEEPSEEK_MODEL,
      proxy: Boolean(DEEPSEEK_PROXY_URL),
      response: result.choices?.[0]?.message?.content || "",
    });
  } catch (error) {
    sendError(res, 502, "DeepSeek 连接失败。", error.message, "deepseek_check_failed");
  }
}

const server = http.createServer(async (req, res) => {
  attachRequestLogging(req, res);
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (req.method === "POST" && req.url === "/api/auth/register") return await handleRegister(req, res);
    if (req.method === "POST" && req.url === "/api/auth/login") return await handleLogin(req, res);
    if (req.method === "POST" && req.url === "/api/auth/logout") return await handleLogout(req, res);
    if (req.method === "POST" && req.url === "/api/events") return await handleTrackEvent(req, res);
    if (req.method === "GET" && url.pathname === "/api/auth/me") return handleAuthMe(req, res);
    if (req.method === "POST" && req.url === "/api/upload-resume") return await handleUpload(req, res);
    if (req.method === "POST" && req.url === "/api/fetch-jd") return await handleFetchJd(req, res);
    if (req.method === "POST" && req.url === "/api/analyze") return await handleAnalyzeSecure(req, res);
    if (req.method === "POST" && req.url === "/api/batch-jds") return await handleBatchJdsSecure(req, res);
    if (req.method === "POST" && req.url === "/api/cluster-jds") return await handleClusterJdsSecure(req, res);
    if (req.method === "POST" && req.url === "/api/resume-variants") return await handleResumeVariantsSecure(req, res);
    if (req.method === "POST" && req.url === "/api/export-resume") return await handleExportResumeSecure(req, res);
    if (req.method === "POST" && url.pathname.startsWith("/api/resume-variants/")) return await handleUpdateVariantSecure(req, res, decodeURIComponent(url.pathname.split("/").pop()));
    if (req.method === "GET" && url.pathname === "/api/resumes") return handleGetResumeListSecure(req, res);
    if (req.method === "GET" && url.pathname.startsWith("/api/resumes/")) return handleGetResumeDetailSecure(req, res, decodeURIComponent(url.pathname.split("/").pop()));
    if (req.method === "GET" && url.pathname === "/api/jds") return handleGetJdListSecure(req, res);
    if (req.method === "GET" && url.pathname === "/api/history") return handleGetRecentHistorySecure(req, res);
    if (req.method === "GET" && url.pathname === "/api/usage-center") return handleGetUsageCenterSecure(req, res);
    if (req.method === "GET" && url.pathname === "/api/admin/monitor") return handleGetAdminMonitor(req, res);
    if (req.method === "GET" && url.pathname === "/api/deepseek/check") return await handleDeepSeekCheck(req, res);
    if (req.method === "GET" && url.pathname.startsWith("/api/reports/")) return handleGetReportSecure(req, res, decodeURIComponent(url.pathname.split("/").pop()));
    if (req.method === "GET" && url.pathname.startsWith("/api/batch-runs/")) return handleGetBatchRunSecure(req, res, decodeURIComponent(url.pathname.split("/").pop()));
    if (req.method === "GET" && url.pathname.startsWith("/api/resume-variants/")) return handleGetVariantSecure(req, res, decodeURIComponent(url.pathname.split("/").pop()));
    if (req.method === "GET") return serveStatic(req, res);
    sendError(res, 405, "当前请求方法不支持。", null, "method_not_allowed");
  } catch (error) {
    logErrorEvent("server.unhandled", {
      path: req.url,
      method: req.method,
      errorCode: "server_error",
      message: error.message,
    });
    sendError(res, 500, error.message || "服务器出现异常。", null, "server_error");
  }
});

server.listen(PORT, () => {
  console.log(`Job Match Workbench running at http://localhost:${PORT}`);
  console.log(`DeepSeek: ${process.env.DEEPSEEK_API_KEY ? `enabled (${DEEPSEEK_MODEL})` : "not configured, using local fallback"}`);
});







