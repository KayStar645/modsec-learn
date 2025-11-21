const state = {
  config: { paranoia_levels: [], models: {}, datasets: [] },
  results: [],
  logs: { entries: [], total: 0, page: 1, page_size: 50, total_pages: 1 },
  resultIndex: new Map(),
  logIndex: new Map(),
  batchSummary: null,
  detailModal: null,
  charts: {
    attackRate: null,
    agreement: null,
  },
  modelStats: { models: [], total_entries: 0 },
  batchModelKeys: [],
};

const SAMPLE_PAYLOADS = {
  legit: "id=10&action=view&category=products",
  sqli: "id=1 UNION SELECT username, password FROM users --",
  blind: "id=1' AND SLEEP(5)--",
};

async function fetchConfig() {
  try {
    const response = await fetch("/api/config");
    if (!response.ok) {
      throw new Error("Không thể nạp cấu hình demo.");
    }
    state.config = await response.json();
    populateSelectors();
    populateDatasetOptions();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

function populateSelectors() {
  const manualSelect = document.getElementById("pl-select");
  const batchSelect = document.getElementById("batch-pl-select");
  const selects = [manualSelect, batchSelect].filter(Boolean);

  selects.forEach((select) => {
    select.innerHTML = "";
    state.config.paranoia_levels.forEach((pl) => {
      const option = document.createElement("option");
      option.value = pl;
      option.textContent = `PL ${pl}`;
      select.appendChild(option);
    });
  });

  if (manualSelect && batchSelect && !batchSelect.value) {
    batchSelect.value = manualSelect.value;
  }

  updateModelOptions();
  manualSelect?.addEventListener("change", updateModelOptions);
  batchSelect?.addEventListener("change", () => {
    renderBatchModelCheckboxes();
  });
}

function populateDatasetOptions() {
  const datasetSelect = document.getElementById("dataset-select");
  if (!datasetSelect) {
    return;
  }

  datasetSelect.innerHTML = "";
  (state.config.datasets || []).forEach((dataset) => {
    const option = document.createElement("option");
    option.value = dataset.key;
    option.textContent = `${dataset.key} (${dataset.count})`;
    datasetSelect.appendChild(option);
  });

  if (!datasetSelect.value && datasetSelect.options.length > 0) {
    datasetSelect.value = datasetSelect.options[0].value;
  }
  updateDatasetMeta();
  datasetSelect.addEventListener("change", updateDatasetMeta);
  renderBatchModelCheckboxes();
}

function updateDatasetMeta() {
  const datasetSelect = document.getElementById("dataset-select");
  const meta = document.getElementById("dataset-meta");
  if (!datasetSelect || !meta) {
    return;
  }
  const selected = (state.config.datasets || []).find(
    (item) => item.key === datasetSelect.value
  );
  if (selected) {
    meta.textContent = `Số payload: ${selected.count} | File: ${selected.path}`;
  } else {
    meta.textContent = "Không tìm thấy thông tin dataset.";
  }
}

function updateModelOptions() {
  const modelSelect = document.getElementById("model-select");
  const plSelect = document.getElementById("pl-select");
  if (!modelSelect || !plSelect) {
    return;
  }
  const currentPl = Number(plSelect.value);
  const modelsForPl = state.config.models[currentPl] || [];

  modelSelect.innerHTML = '<option value="">Tự động chọn</option>';
  modelsForPl.forEach((model) => {
    const option = document.createElement("option");
    option.value = model.key;
    option.textContent = model.label;
    modelSelect.appendChild(option);
  });

  renderBatchModelCheckboxes();
}

function renderBatchModelCheckboxes() {
  const container = document.getElementById("batch-model-checkboxes");
  const plSelect = document.getElementById("batch-pl-select") || document.getElementById("pl-select");
  if (!container || !plSelect) {
    return;
  }

  const currentPl = Number(plSelect.value);
  const modelsForPl = state.config.models[currentPl] || [];
  container.innerHTML = "";

  if (!modelsForPl.length) {
    container.innerHTML = '<span class="text-muted">Không có mô hình ML cho PL này.</span>';
    state.batchModelKeys = [];
    return;
  }

  let initialSelection = (state.batchModelKeys || []).filter((key) =>
    modelsForPl.some((model) => model.key === key)
  );
  if (!initialSelection.length) {
    initialSelection = modelsForPl.map((model) => model.key);
  }
  state.batchModelKeys = initialSelection.slice();

  const row = document.createElement("div");
  row.className = "row g-2";

  modelsForPl.forEach((model) => {
    const col = document.createElement("div");
    col.className = "col-sm-6 col-md-4";
    const div = document.createElement("div");
    div.className = "form-check";

    const input = document.createElement("input");
    input.className = "form-check-input";
    input.type = "checkbox";
    input.id = `model-${model.key}`;
    input.value = model.key;
    input.checked = initialSelection.includes(model.key);

    const label = document.createElement("label");
    label.className = "form-check-label";
    label.htmlFor = input.id;
    label.textContent = model.label;

    input.addEventListener("change", () => {
      const selected = Array.from(container.querySelectorAll("input[type=checkbox]:checked")).map(
        (el) => el.value
      );
      state.batchModelKeys = selected;
    });

    div.appendChild(input);
    div.appendChild(label);
    col.appendChild(div);
    row.appendChild(col);
  });

  container.appendChild(row);
}

function bindEvents() {
  const form = document.getElementById("payload-form");
  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await submitPayload();
  });

  document.querySelectorAll("[data-demo]").forEach((button) => {
    button.addEventListener("click", () => {
      const type = button.getAttribute("data-demo");
      const textarea = document.getElementById("payload");
      if (textarea) {
        textarea.value = SAMPLE_PAYLOADS[type] || "";
      }
    });
  });

  document.getElementById("batch-run-btn")?.addEventListener("click", runBatch);
  document.getElementById("reload-logs-btn")?.addEventListener("click", () => fetchLogs(1));
  document.getElementById("log-limit")?.addEventListener("change", () => fetchLogs(1));
  document.getElementById("log-prev-btn")?.addEventListener("click", () => changeLogPage(-1));
  document.getElementById("log-next-btn")?.addEventListener("click", () => changeLogPage(1));
  document.getElementById("refresh-stats-btn")?.addEventListener("click", () => fetchStats());

  document.querySelector("#results-table tbody")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-analysis-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-analysis-id");
    const entry = state.resultIndex.get(id);
    if (entry) {
      openDetail(entry);
    }
  });

  document.querySelector("#logs-table tbody")?.addEventListener("click", (event) => {
    const btn = event.target.closest("[data-log-id]");
    if (!btn) return;
    const id = btn.getAttribute("data-log-id");
    const entry = state.logIndex.get(id);
    if (entry) {
      openDetail(entry);
    }
  });
}

async function submitPayload() {
  const payloadInput = document.getElementById("payload");
  const plSelect = document.getElementById("pl-select");
  const modelSelect = document.getElementById("model-select");

  if (!payloadInput || !plSelect) {
    return;
  }

  const payload = payloadInput.value.trim();
  if (!payload) {
    showAlert("Payload không được để trống.", "warning");
    return;
  }

  const requestBody = {
    payload,
    paranoia_level: Number(plSelect.value),
  };

  if (modelSelect && modelSelect.value) {
    requestBody.model_key = modelSelect.value;
  }

  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Không thể phân tích payload.");
    }

    appendResult(data, "single");
    showAlert("Phân tích thành công.", "success");
    payloadInput.focus();
    await fetchLogsOnBackground();
    await fetchStatsOnBackground();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

async function runBatch() {
  const datasetSelect = document.getElementById("dataset-select");
  const batchPlSelect = document.getElementById("batch-pl-select");
  const manualPlSelect = document.getElementById("pl-select");
  const modelSelect = document.getElementById("model-select");
  const batchSizeInput = document.getElementById("batch-size");

  const datasetKey = datasetSelect?.value || "default";
  const paranoiaLevel =
    Number(batchPlSelect?.value) ||
    Number(manualPlSelect?.value) ||
    state.config.paranoia_levels[0] ||
    1;
  const limitValue = Number(batchSizeInput?.value);
  const selectedModels =
    state.batchModelKeys && state.batchModelKeys.length
      ? state.batchModelKeys
      : Array.from(document.querySelectorAll("#batch-model-checkboxes input[type=checkbox]:checked")).map(
          (el) => el.value
        );

  if (!selectedModels || !selectedModels.length) {
    showAlert("Vui lòng chọn ít nhất một mô hình học máy để chạy batch.", "warning");
    return;
  }

  const requestBody = {
    dataset: datasetKey,
    paranoia_level: paranoiaLevel,
    model_keys: selectedModels,
  };

  if (Number.isFinite(limitValue) && limitValue > 0) {
    requestBody.limit = limitValue;
  }

  if (modelSelect && modelSelect.value) {
    requestBody.model_key = modelSelect.value;
  }

  try {
    showAlert("Đang chạy batch, vui lòng chờ...", "info");
    const response = await fetch("/api/run_batch", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Batch thất bại.");
    }

    state.batchSummary = data.summary;
    renderBatchSummary();

    data.results.forEach((result) => {
      appendResult(result, "batch");
    });

    showAlert(`Hoàn tất batch ${data.summary.total} payload.`, "success");
    await fetchLogsOnBackground();
    await fetchStatsOnBackground();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

function appendResult(result, source = "single") {
  const entry = { ...result, _source: source };
  state.resultIndex.set(entry.analysis_id, entry);
  state.results.unshift(entry);
  if (state.results.length > 100) {
    const removed = state.results.pop();
    if (removed) {
      state.resultIndex.delete(removed.analysis_id);
    }
  }
  renderResults();
}

function renderResults() {
  const tbody = document.querySelector("#results-table tbody");
  if (!tbody) return;
  tbody.innerHTML = "";

  state.results.forEach((entry) => {
    const tr = document.createElement("tr");
    const mlInfo = renderMlCell(entry);
    const wafBadge = buildDecisionBadge(entry.modsecurity.decision);
    const rulesCell = renderRules(
      entry.modsecurity.triggered_rules,
      entry.modsecurity.triggered_rules_details
    );
    const sourceBadge =
      entry._source === "batch"
        ? '<span class="badge bg-secondary ms-1">Batch</span>'
        : "";

    tr.innerHTML = `
      <td>${dayjs(entry.timestamp).format("HH:mm:ss")}</td>
      <td class="payload-cell" title="${escapeHtml(entry.payload)}">${escapeHtml(
        shorten(entry.payload, 80)
      )}${sourceBadge}</td>
      <td>PL ${entry.paranoia_level}</td>
      <td>${wafBadge}<div class="text-muted small">Score: ${entry.modsecurity.score.toFixed(
        2
      )}</div></td>
      <td>${mlInfo}</td>
      <td>${rulesCell}</td>
      <td><button class="btn btn-sm btn-outline-primary" data-analysis-id="${
        entry.analysis_id
      }">Xem</button></td>
    `;

    tbody.appendChild(tr);
  });
}

async function fetchLogs(page) {
  try {
    const logLimitInput = document.getElementById("log-limit");
    const requestedLimit =
      Number(logLimitInput?.value) || state.logs.page_size || 50;

    const params = new URLSearchParams();
    params.set("limit", requestedLimit);

    const targetPage =
      page !== undefined && page !== null ? page : state.logs.page || 1;
    params.set("page", targetPage);

    const response = await fetch(`/api/logs?${params.toString()}`);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Không thể tải log.");
    }

    state.logs = {
      entries: data.entries || [],
      total: data.total || 0,
      page: data.page || targetPage,
      page_size: data.page_size || requestedLimit,
      total_pages:
        data.total_pages ||
        Math.max(
          1,
          Math.ceil((data.total || 0) / (data.page_size || requestedLimit))
        ),
    };

    if (logLimitInput) {
      logLimitInput.value = state.logs.page_size;
    }

    state.logIndex.clear();
    state.logs.entries.forEach((entry) =>
      state.logIndex.set(entry.analysis_id, entry)
    );
    renderLogs();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

function changeLogPage(delta) {
  const current = state.logs.page || 1;
  const totalPages = state.logs.total_pages || 1;
  const next = current + delta;
  if (next < 1 || next > totalPages) {
    return;
  }
  fetchLogs(next);
}

function renderLogs() {
  const tbody = document.querySelector("#logs-table tbody");
  const meta = document.getElementById("log-meta");
  if (!tbody || !meta) return;

  tbody.innerHTML = "";
  state.logs.entries
    .slice()
    .reverse()
    .forEach((entry) => {
      const wafBadge = buildDecisionBadge(entry.modsecurity.decision);
      const mlCell = renderMlCell(entry);
      const rulesCell = renderRules(
        entry.modsecurity.triggered_rules,
        entry.modsecurity.triggered_rules_details
      );
      const source = entry.metadata?.source || "N/A";

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${dayjs(entry.timestamp).format("YYYY-MM-DD HH:mm:ss")}</td>
        <td class="payload-cell" title="${escapeHtml(entry.payload)}">${escapeHtml(
          shorten(entry.payload, 70)
        )}</td>
        <td>PL ${entry.paranoia_level}</td>
        <td>${wafBadge}</td>
        <td>${rulesCell}</td>
        <td>${mlCell}</td>
        <td>${source}</td>
        <td><button class="btn btn-sm btn-outline-primary" data-log-id="${
          entry.analysis_id
        }">Xem</button></td>
      `;
      tbody.appendChild(tr);
    });

  const page = state.logs.page || 1;
  const pageSize = state.logs.page_size || state.logs.entries.length;
  const totalPages = state.logs.total_pages || 1;
  meta.textContent = `Trang ${page}/${totalPages} – hiển thị ${state.logs.entries.length}/${state.logs.total} bản ghi (mỗi trang ${pageSize}).`;

  const pageInfo = document.getElementById("log-page-info");
  if (pageInfo) {
    pageInfo.textContent = `Trang ${page}/${totalPages}`;
  }
  const prevBtn = document.getElementById("log-prev-btn");
  const nextBtn = document.getElementById("log-next-btn");
  if (prevBtn) {
    prevBtn.disabled = page <= 1;
  }
  if (nextBtn) {
    nextBtn.disabled = page >= totalPages;
  }
}

function renderRules(rules, details, limit = 5) {
  const hasDetails = Array.isArray(details) && details.length;
  const source = hasDetails ? details : rules || [];

  if (!source || source.length === 0) {
    return '<span class="text-muted">Không kích hoạt</span>';
  }

  const items = source.slice(0, limit).map((item) => {
    const id = hasDetails ? item.id : item;
    const message = hasDetails ? item.message || "" : "";
    const severity = hasDetails ? item.severity_label || "" : "";
    const titleParts = [];
    if (message) titleParts.push(message);
    if (severity) titleParts.push(`Severity: ${severity}`);
    const titleAttr = titleParts.length ? ` title="${escapeHtml(titleParts.join(" | "))}"` : "";
    return `<span class="badge bg-info text-dark me-1"${titleAttr}>${escapeHtml(id)}</span>`;
  });

  if (source.length > limit) {
    items.push(`<span class="badge bg-secondary">+${source.length - limit}</span>`);
  }

  return items.join("");
}

function renderBatchSummary() {
  const container = document.getElementById("batch-summary");
  if (!container) return;

  if (!state.batchSummary) {
    container.classList.add("d-none");
    container.textContent = "";
    return;
  }

  const {
    batch_id,
    timestamp,
    source,
    total,
    modsecurity_block,
    ml_detect,
    concordant_block,
  } = state.batchSummary;

  const timeText = timestamp ? dayjs(timestamp).format("YYYY-MM-DD HH:mm:ss") : "-";
  container.classList.remove("d-none");
  container.innerHTML = `
    <strong>Batch ID:</strong> ${batch_id}<br/>
    Nguồn: ${source || "N/A"} | Thời gian: ${timeText}<br/>
    Tổng payload: ${total} | ModSecurity chặn: ${modsecurity_block} | ML đánh dấu attack: ${ml_detect} | Cùng chặn: ${concordant_block}
  `;
}

function buildDecisionBadge(decision) {
  return decision === "block"
    ? '<span class="badge bg-danger">Block</span>'
    : '<span class="badge bg-success">Allow</span>';
}

function formatMlScores(ml) {
  if (ml?.probability_attack !== undefined) {
    return `<div class="text-muted small">Attack: ${(ml.probability_attack * 100).toFixed(
      1
    )}%</div>`;
  }
  if (ml?.decision_score !== undefined) {
    return `<div class="text-muted small">Score: ${ml.decision_score.toFixed(3)}</div>`;
  }
  return "";
}

function formatMlList(entry) {
  const mlResults = entry.ml_results?.length
    ? entry.ml_results
    : entry.ml
    ? [entry.ml]
    : [];
  if (!mlResults.length) {
    return '<span class="text-muted">Không có mô hình</span>';
  }
  const items = mlResults.map((ml) => {
    const statusBadge =
      ml.prediction === 1
        ? '<span class="badge bg-danger ms-1">Attack</span>'
        : '<span class="badge bg-success ms-1">Legit</span>';
    const extra =
      ml.probability_attack !== undefined
        ? `Attack ${(ml.probability_attack * 100).toFixed(1)}%`
        : ml.decision_score !== undefined
        ? `Score ${ml.decision_score.toFixed(3)}`
        : "";
    return `<li>${ml.model_name}${statusBadge} <span class="text-muted small">${extra}</span></li>`;
  });
  return `<ul class="mb-0 ps-3">${items.join("")}</ul>`;
}

function formatRuleList(details) {
  if (!details || !details.length) {
    return '<span class="text-muted">Không có thông tin chi tiết.</span>';
  }
  const items = details.map((rule) => {
    const message = rule.message ? ` - ${escapeHtml(rule.message)}` : "";
    const severity = rule.severity_label ? ` (${rule.severity_label})` : "";
    const phase =
      rule.phase !== null && rule.phase !== undefined ? ` | Phase ${rule.phase}` : "";
    return `<li><code>${escapeHtml(rule.id)}</code>${severity}${phase}${message}</li>`;
  });
  return `<ul class="mb-0 ps-3">${items.join("")}</ul>`;
}

function renderMlCell(entry) {
  const mlResults = entry.ml_results?.length
    ? entry.ml_results
    : entry.ml
    ? [entry.ml]
    : [];
  if (!mlResults.length) {
    return '<span class="text-muted">Không có mô hình</span>';
  }

  const primary = mlResults[0];
  const badgeClass = primary.prediction === 1 ? "bg-danger" : "bg-success";
  const label = primary.prediction === 1 ? "Attack" : "Legit";
  const extra = formatMlScores(primary);
  const additional =
    mlResults.length > 1
      ? `<div class="text-muted small mt-1">+${mlResults.length - 1} mô hình khác</div>`
      : "";

  return `${primary.model_name}<br/><span class="badge ${badgeClass}">${label}</span>${extra}${additional}`;
}

function showAlert(message, type = "info") {
  const alertArea = document.getElementById("alert-area");
  if (!alertArea) return;
  const alert = document.createElement("div");
  alert.className = `alert alert-${type}`;
  alert.textContent = message;
  alertArea.innerHTML = "";
  alertArea.appendChild(alert);

  setTimeout(() => {
    alert.remove();
  }, 4000);
}

function shorten(text, maxLength) {
  return text.length > maxLength ? `${text.slice(0, maxLength - 3)}...` : text;
}

function escapeHtml(text) {
  if (!text) return "";
  return text.replace(/[&<>"']/g, (char) => {
    const map = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;",
    };
    return map[char];
  });
}

async function fetchLogsOnBackground() {
  try {
    await fetchLogs(state.logs.page || 1);
    await fetchStatsOnBackground();
  } catch {
    // bỏ qua lỗi background
  }
}

async function fetchStats(limit) {
  try {
    const effectiveLimit =
      limit ||
      state.logs.page_size ||
      Number(document.getElementById("log-limit")?.value) ||
      undefined;
    const params = new URLSearchParams();
    if (effectiveLimit) {
      params.set("limit", effectiveLimit);
    }
    const url = params.toString() ? `/api/stats?${params.toString()}` : "/api/stats";
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Không thể tải thống kê.");
    }
    state.modelStats = data;
    renderStats();
  } catch (error) {
    showAlert(error.message, "danger");
  }
}

function renderStats() {
  const { models = [], total_entries = 0 } = state.modelStats || {};
  const meta = document.getElementById("stats-meta");

  if (!models.length) {
    updateChart("attackRate", "chart-attack-rate", null);
    updateChart("agreement", "chart-agreement", null);
    if (meta) {
      meta.textContent = "Chưa có dữ liệu log chứa mô hình để lập báo cáo.";
    }
    return;
  }

  const labels = models.map((m) => m.model_name);
  const attackRates = models.map((m) =>
    m.total ? Number(((m.predict_attack / m.total) * 100).toFixed(1)) : 0
  );
  const totalPreds = models.map((m) => m.total);
  const attackCounts = models.map((m) => m.predict_attack);
  const agreementRates = models.map((m) =>
    m.modsecurity_block
      ? Number(((m.agree_with_modsecurity / m.modsecurity_block) * 100).toFixed(1))
      : 0
  );

  updateChart("attackRate", "chart-attack-rate", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Tỉ lệ mô hình đánh dấu attack (%)",
          data: attackRates,
          backgroundColor: "#dc3545",
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          max: 100,
          title: { display: true, text: "Phần trăm (%)" },
        },
      },
    },
  });

  updateChart("agreement", "chart-agreement", {
    type: "bar",
    data: {
      labels,
      datasets: [
        {
          label: "Tổng số dự đoán",
          data: totalPreds,
          backgroundColor: "#0d6efd",
        },
        {
          label: "Đánh dấu attack",
          data: attackCounts,
          backgroundColor: "#ffc107",
        },
        {
          label: "Phối hợp với ModSecurity (%)",
          data: agreementRates,
          type: "line",
          yAxisID: "y1",
          borderColor: "#198754",
          backgroundColor: "rgba(25, 135, 84, 0.2)",
          tension: 0.3,
        },
      ],
    },
    options: {
      responsive: true,
      scales: {
        y: {
          beginAtZero: true,
          title: { display: true, text: "Số lần" },
        },
        y1: {
          beginAtZero: true,
          position: "right",
          grid: { drawOnChartArea: false },
          max: 100,
          title: { display: true, text: "Phần trăm (%)" },
        },
      },
    },
  });

  if (meta) {
    meta.textContent = `Dựa trên ${total_entries} bản ghi log có mô hình (mỗi trang ${
      state.logs.page_size ?? "n/a"
    }).`;
  }
}

function updateChart(key, canvasId, config) {
  const existing = state.charts[key];
  if (!config) {
    if (existing) {
      existing.destroy();
      state.charts[key] = null;
    }
    const canvas = document.getElementById(canvasId);
    if (canvas) {
      const ctx = canvas.getContext("2d");
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    return;
  }

  if (typeof Chart === "undefined") {
    return;
  }

  const canvas = document.getElementById(canvasId);
  if (!canvas) {
    return;
  }

  if (existing) {
    existing.destroy();
  }
  state.charts[key] = new Chart(canvas, config);
}

async function fetchStatsOnBackground() {
  try {
    await fetchStats();
  } catch {
    // bỏ qua lỗi background
  }
}

function openDetail(entry) {
  if (!state.detailModal) return;

  const title = entry.metadata?.name || escapeHtml(shorten(entry.payload, 60));
  const metadataEl = document.getElementById("detail-metadata");
  const rulesEl = document.getElementById("detail-rules");
  const modelsEl = document.getElementById("detail-models");

  if (metadataEl) {
    metadataEl.innerHTML = `
      <div><strong>Payload:</strong> ${escapeHtml(entry.payload)}</div>
      <div><strong>Thời gian:</strong> ${dayjs(entry.timestamp).format("YYYY-MM-DD HH:mm:ss")}</div>
      <div><strong>Paranoia Level:</strong> ${entry.paranoia_level}</div>
      <div><strong>Nguồn:</strong> ${entry.metadata?.source || "N/A"}</div>
    `;
  }

  renderTimeline(entry.steps || []);

  if (rulesEl) {
    const details = entry.modsecurity?.triggered_rules_details;
    const hasDetails = details && details.length;
    const html = hasDetails
      ? formatRuleList(details)
      : entry.modsecurity?.triggered_rules?.length
      ? renderRules(entry.modsecurity.triggered_rules, null, entry.modsecurity.triggered_rules.length)
      : '<span class="text-muted">Không có</span>';
    rulesEl.innerHTML = `<strong>Rules kích hoạt:</strong><div class="mt-2">${html}</div>`;
  }

  if (modelsEl) {
    modelsEl.innerHTML = `<strong>Kết quả mô hình ML:</strong><div class="mt-2">${formatMlList(
      entry
    )}</div>`;
  }

  document.getElementById("detailModalLabel").textContent = `Sơ đồ xử lý - ${title}`;
  state.detailModal.show();
}

function renderTimeline(steps) {
  const container = document.getElementById("detail-timeline");
  if (!container) return;
  container.innerHTML = "";

  steps.forEach((step, index) => {
    const item = document.createElement("div");
    item.className = "timeline-step";
    const detail = escapeHtml(step.detail || "").replace(/\n/g, "<br/>");
    item.innerHTML = `
      <div class="timeline-index">${index + 1}</div>
      <div class="timeline-content">
        <h6 class="mb-1">${escapeHtml(step.title || "Bước")}</h6>
        <p class="mb-0">${detail}</p>
        ${
          step.status
            ? `<span class="badge ${
                step.status === "block" ? "bg-danger" : "bg-success"
              } mt-2">${step.status.toUpperCase()}</span>`
            : ""
        }
      </div>
    `;
    container.appendChild(item);
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  state.detailModal = new bootstrap.Modal(document.getElementById("detailModal"));
  await fetchConfig();
  await fetchLogs(1);
  await fetchStats();
  bindEvents();
  renderBatchSummary();
});

