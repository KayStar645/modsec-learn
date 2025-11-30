const state = {
  config: { paranoia_levels: [], models: {}, datasets: [] },
  results: [],
  logs: { entries: [], total: 0, page: 1, page_size: 50, total_pages: 1 },
  resultIndex: new Map(),
  logIndex: new Map(),
  batchSummary: null,
  batchResults: [], // Lưu kết quả batch để phân tích
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
  
  // Toggle batch explanation
  document.getElementById("toggle-explanation-btn")?.addEventListener("click", () => {
    const explanationDiv = document.getElementById("batch-explanation");
    const toggleText = document.getElementById("explanation-toggle-text");
    if (explanationDiv && toggleText) {
      const isHidden = explanationDiv.classList.contains("d-none");
      explanationDiv.classList.toggle("d-none");
      toggleText.textContent = isHidden ? "Ẩn giải thích" : "Hiển thị giải thích";
    }
  });

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
    state.batchResults = data.results || []; // Lưu kết quả batch
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
        entry.payload
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
  
  // Khởi tạo tooltip sau khi render
  setTimeout(() => {
    initRuleTooltips();
  }, 50);
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
          entry.payload
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

  // Khởi tạo tooltip sau khi render
  setTimeout(() => {
    initRuleTooltips();
  }, 50);

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

// Tạo tooltip text cho rule từ RULES_DATA
function getRuleTooltip(ruleId) {
  const rule = RULES_DATA[ruleId];
  if (!rule) {
    return `Rule ${ruleId}: Không có thông tin chi tiết`;
  }
  
  const parts = [];
  parts.push(`<strong>${rule.name}</strong>`);
  parts.push(rule.description);
  
  if (rule.patterns && rule.patterns.length > 0) {
    parts.push(`<br/><strong>Patterns:</strong> ${rule.patterns.slice(0, 3).join(", ")}${rule.patterns.length > 3 ? "..." : ""}`);
  }
  
  if (rule.severity) {
    parts.push(`<br/><strong>Severity:</strong> ${rule.severity}`);
  }
  
  if (rule.score) {
    parts.push(`<br/><strong>Điểm:</strong> ${rule.score}`);
  }
  
  if (rule.pl && rule.pl.length > 0) {
    parts.push(`<br/><strong>Paranoia Levels:</strong> PL ${rule.pl.join(", PL ")}`);
  }
  
  return parts.join("<br/>");
}

// Khởi tạo tooltip cho tất cả rule badges
function initRuleTooltips() {
  const tooltips = document.querySelectorAll('.rule-badge[data-bs-toggle="tooltip"]');
  tooltips.forEach(el => {
    // Xóa tooltip cũ nếu có
    const existingTooltip = bootstrap.Tooltip.getInstance(el);
    if (existingTooltip) {
      existingTooltip.dispose();
    }
    // Tạo tooltip mới
    try {
      new bootstrap.Tooltip(el, {
        html: true,
        placement: 'top',
        trigger: 'hover'
      });
    } catch (e) {
      // Bỏ qua lỗi nếu Bootstrap chưa sẵn sàng
    }
  });
}

function renderRules(rules, details, limit = 5) {
  const hasDetails = Array.isArray(details) && details.length;
  const source = hasDetails ? details : rules || [];

  if (!source || source.length === 0) {
    return '<span class="text-muted">Không kích hoạt</span>';
  }

  const items = source.slice(0, limit).map((item, index) => {
    const id = hasDetails ? item.id : item;
    const message = hasDetails ? item.message || "" : "";
    const severity = hasDetails ? item.severity_label || "" : "";
    
    // Lấy tooltip từ RULES_DATA
    const ruleTooltip = getRuleTooltip(id);
    const tooltipId = `rule-tooltip-${id}-${index}-${Date.now()}`;
    
    // Tạo tooltip HTML với Bootstrap tooltip
    return `<span 
      class="badge bg-info text-dark me-1 rule-badge" 
      data-bs-toggle="tooltip" 
      data-bs-html="true"
      data-bs-placement="top"
      title="${escapeHtml(ruleTooltip).replace(/"/g, '&quot;')}"
      id="${tooltipId}">${escapeHtml(id)}${severity ? ` (${severity})` : ''}</span>`;
  });

  if (source.length > limit) {
    items.push(`<span class="badge bg-secondary">+${source.length - limit}</span>`);
  }

  const html = items.join("");
  
  // Khởi tạo tooltip sau khi render
  setTimeout(() => {
    initRuleTooltips();
  }, 50);

  return html;
}

function renderBatchSummary() {
  const container = document.getElementById("batch-summary");
  const explanationDiv = document.getElementById("batch-explanation");
  const toggleBtn = document.getElementById("toggle-explanation-btn");
  const analysisDiv = document.getElementById("batch-analysis");
  
  if (!container) return;

  if (!state.batchSummary) {
    container.classList.add("d-none");
    if (explanationDiv) explanationDiv.classList.add("d-none");
    if (toggleBtn) toggleBtn.style.display = "none";
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
    <div class="d-flex flex-wrap align-items-center gap-3 mb-2">
      <div><strong>Batch ID:</strong> <code class="small">${batch_id}</code></div>
      <div><strong>Nguồn:</strong> ${source || "N/A"}</div>
      <div><strong>Thời gian:</strong> ${timeText}</div>
    </div>
    <div class="row g-2 mt-2">
      <div class="col-md-3">
        <div class="border rounded p-2 text-center">
          <div class="fw-bold text-primary">${total}</div>
          <div class="small text-muted">Tổng payload</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="border rounded p-2 text-center">
          <div class="fw-bold text-danger">${modsecurity_block}</div>
          <div class="small text-muted">ModSecurity chặn</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="border rounded p-2 text-center">
          <div class="fw-bold text-warning">${ml_detect}</div>
          <div class="small text-muted">ML đánh dấu attack</div>
        </div>
      </div>
      <div class="col-md-3">
        <div class="border rounded p-2 text-center">
          <div class="fw-bold text-success">${concordant_block}</div>
          <div class="small text-muted">Cùng chặn</div>
        </div>
      </div>
    </div>
  `;

  // Hiển thị nút toggle
  if (toggleBtn) {
    toggleBtn.style.display = "block";
  }

  // Phân tích kết quả batch thực tế
  if (analysisDiv && state.batchResults.length > 0) {
    const analysis = analyzeBatchResults(state.batchResults);
    analysisDiv.innerHTML = renderDetailedAnalysis(analysis, modsecurity_block, ml_detect, concordant_block, total);
  } else if (analysisDiv) {
    // Fallback nếu chưa có kết quả
    const onlyModSec = modsecurity_block - concordant_block;
    const onlyML = ml_detect - concordant_block;
    const bothAllow = total - modsecurity_block - onlyML;
    const totalDetected = modsecurity_block + onlyML;

    analysisDiv.innerHTML = `
      <div class="alert alert-warning mb-0">
        <small>Chưa có dữ liệu chi tiết. Vui lòng chạy batch để xem phân tích cụ thể.</small>
      </div>
    `;
  }
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

// Dữ liệu rules với mô tả chi tiết
const RULES_DATA = {
  "942100": {
    name: "SQL Keywords Detection",
    description: "Phát hiện các từ khóa SQL nguy hiểm như SELECT, UNION, INSERT, UPDATE, DELETE, DROP",
    patterns: ["SELECT", "UNION", "INSERT", "UPDATE", "DELETE", "DROP"],
    severity: "CRITICAL",
    pl: [1, 2, 3, 4],
    score: 5,
    examples: ["UNION SELECT", "DROP TABLE", "INSERT INTO"]
  },
  "942110": {
    name: "SQL Injection Attack: Common Injection Testing",
    description: "Phát hiện các cố gắng bypass logic (luôn đúng) như OR 1=1, OR true",
    patterns: ["OR 1=1", "OR true", "AND 1=1", "OR '1'='1'"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["OR 1=1", "username=' OR '1'='1"]
  },
  "942120": {
    name: "SQL Injection Attack: Database Schema Detection",
    description: "Phát hiện truy cập vào schema database như information_schema, pg_catalog",
    patterns: ["information_schema", "pg_catalog", "sys.schema"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["FROM information_schema.tables", "pg_catalog.pg_user"]
  },
  "942130": {
    name: "SQL Injection Attack: Time-based Attack Detection",
    description: "Phát hiện tấn công time-based sử dụng delay như SLEEP, BENCHMARK, WAITFOR",
    patterns: ["SLEEP(", "BENCHMARK(", "WAITFOR DELAY"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["SLEEP(5)", "BENCHMARK(1000000,MD5(1))"]
  },
  "942131": {
    name: "SQL Injection Attack: Time-based Attack Detection (Extended)",
    description: "Phát hiện time-based attacks với các hàm khác như IF, CASE",
    patterns: ["IF(", "CASE WHEN", "WAITFOR"],
    severity: "WARNING",
    pl: [2, 3, 4],
    score: 3,
    examples: ["IF(1=1, SLEEP(5), 0)", "CASE WHEN 1=1 THEN SLEEP(5)"]
  },
  "942140": {
    name: "SQL Injection Attack: Boolean-based Blind SQL Injection",
    description: "Phát hiện boolean-based blind SQL injection",
    patterns: ["AND", "OR", "XOR"],
    severity: "WARNING",
    pl: [2, 3, 4],
    score: 3,
    examples: ["AND 1=1", "OR 1=2"]
  },
  "942150": {
    name: "SQL Injection Attack: SQL Tautology Detected",
    description: "Phát hiện tautology (luôn đúng) trong SQL",
    patterns: ["'1'='1'", "'a'='a'", "1=1"],
    severity: "WARNING",
    pl: [2, 3, 4],
    score: 3,
    examples: ["'1'='1'", "OR 'a'='a'"]
  },
  "942151": {
    name: "SQL Injection Attack: SQL Tautology Detected (Extended)",
    description: "Phát hiện tautology mở rộng",
    patterns: ["'1'='1", "1=1--", "true=true"],
    severity: "WARNING",
    pl: [3, 4],
    score: 3,
    examples: ["'1'='1--", "true=true"]
  },
  "942160": {
    name: "Detects basic SQL authentication bypass attempts",
    description: "Phát hiện cố gắng bypass authentication cơ bản",
    patterns: ["admin'--", "admin'/*", "' OR '1'='1"],
    severity: "CRITICAL",
    pl: [1, 2, 3, 4],
    score: 5,
    examples: ["admin'--", "admin'/*"]
  },
  "942170": {
    name: "Detects SQL benchmark and sleep injection attempts",
    description: "Phát hiện benchmark và sleep injection",
    patterns: ["BENCHMARK", "SLEEP", "PG_SLEEP"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["BENCHMARK(1000000,MD5(1))", "PG_SLEEP(5)"]
  },
  "942180": {
    name: "Detects basic SQL injection attempts",
    description: "Phát hiện SQL injection cơ bản",
    patterns: ["' OR", "' AND", "';"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["' OR 1=1", "'; DROP TABLE"]
  },
  "942190": {
    name: "Detects MSSQL code execution and information gathering attempts",
    description: "Phát hiện code execution và information gathering trên MSSQL",
    patterns: ["xp_cmdshell", "sp_executesql", "OPENROWSET"],
    severity: "CRITICAL",
    pl: [2, 3, 4],
    score: 5,
    examples: ["xp_cmdshell('dir')", "sp_executesql"]
  },
  "942200": {
    name: "Detects MySQL comment-/space-obfuscated injections",
    description: "Phát hiện SQL injection sử dụng comment và space để obfuscate",
    patterns: ["--", "#", "/*", "*/"],
    severity: "WARNING",
    pl: [1, 2, 3, 4],
    score: 3,
    examples: ["-- comment", "/* comment */", "# comment"]
  },
  "942210": {
    name: "Detects chained SQL injection attempts",
    description: "Phát hiện chained SQL injection (nhiều câu lệnh)",
    patterns: [";", "UNION ALL", "UNION SELECT"],
    severity: "ERROR",
    pl: [2, 3, 4],
    score: 4,
    examples: ["; DROP TABLE", "UNION ALL SELECT"]
  },
  "942230": {
    name: "Detects conditional SQL injection attempts",
    description: "Phát hiện conditional SQL injection",
    patterns: ["IF(", "CASE", "IIF("],
    severity: "WARNING",
    pl: [2, 3, 4],
    score: 3,
    examples: ["IF(1=1, SLEEP(5), 0)", "CASE WHEN"]
  },
  "942240": {
    name: "Detects MySQL stored procedure/function injection attempts",
    description: "Phát hiện stored procedure/function injection trên MySQL",
    patterns: ["PROCEDURE", "FUNCTION", "CALL"],
    severity: "ERROR",
    pl: [3, 4],
    score: 4,
    examples: ["CALL procedure()", "FUNCTION()"]
  },
  "942250": {
    name: "Detects MySQL UDF injection and other data/structure manipulation attempts",
    description: "Phát hiện UDF injection và data/structure manipulation",
    patterns: ["UDF", "LOAD_FILE", "INTO OUTFILE"],
    severity: "CRITICAL",
    pl: [3, 4],
    score: 5,
    examples: ["LOAD_FILE('/etc/passwd')", "INTO OUTFILE"]
  },
  "942260": {
    name: "Detects basic SQL authentication bypass attempts 2/3",
    description: "Phát hiện authentication bypass (phiên bản 2)",
    patterns: ["' OR", "'='", "LIKE '"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["' OR '1'='1", "LIKE '%'"]
  },
  "942270": {
    name: "Looking for basic sql injection. Common attack string for mysql, oracle and others",
    description: "Tìm kiếm SQL injection cơ bản cho MySQL, Oracle",
    patterns: ["' OR", "UNION", "SELECT"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["' OR 1=1", "UNION SELECT"]
  },
  "942280": {
    name: "Detects PostgreSQL pg_sleep injection, waitfor delay attacks and database shutdown attempts",
    description: "Phát hiện pg_sleep injection, waitfor delay và database shutdown",
    patterns: ["pg_sleep", "WAITFOR", "SHUTDOWN"],
    severity: "CRITICAL",
    pl: [2, 3, 4],
    score: 5,
    examples: ["pg_sleep(5)", "WAITFOR DELAY '00:00:05'"]
  },
  "942290": {
    name: "Finds basic MongoDB SQL injection attempts",
    description: "Phát hiện MongoDB SQL injection cơ bản",
    patterns: ["$where", "$ne", "$gt"],
    severity: "WARNING",
    pl: [3, 4],
    score: 3,
    examples: ["$where", "$ne: null"]
  },
  "942300": {
    name: "Detects MySQL comment-/space-obfuscated injections and union/select",
    description: "Phát hiện obfuscated injection với comment/space và union/select",
    patterns: ["/**/", "UNION/**/SELECT", "/*!50000"],
    severity: "ERROR",
    pl: [2, 3, 4],
    score: 4,
    examples: ["/**/UNION/**/SELECT", "/*!50000UNION*/"]
  },
  "942310": {
    name: "Detects SQL injection with hex encoding",
    description: "Phát hiện SQL injection sử dụng hex encoding",
    patterns: ["0x", "UNHEX", "HEX("],
    severity: "WARNING",
    pl: [3, 4],
    score: 3,
    examples: ["0x61646d696e", "UNHEX('61646d696e')"]
  },
  "942320": {
    name: "Detects SQL injection with base64 encoding",
    description: "Phát hiện SQL injection sử dụng base64 encoding",
    patterns: ["FROM_BASE64", "TO_BASE64", "base64"],
    severity: "WARNING",
    pl: [3, 4],
    score: 3,
    examples: ["FROM_BASE64", "TO_BASE64"]
  },
  "942330": {
    name: "Detects classic SQL injection probings 1/2",
    description: "Phát hiện classic SQL injection probing (phần 1)",
    patterns: ["' OR", "' AND", "';"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["' OR 1=1", "' AND 1=1"]
  },
  "942340": {
    name: "Detects basic SQL authentication bypass attempts 3/3",
    description: "Phát hiện authentication bypass (phiên bản 3)",
    patterns: ["' OR", "'='", "LIKE"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["' OR '1'='1", "LIKE '%'"]
  },
  "942350": {
    name: "Detects MySQL UDF injection and other data/structure manipulation attempts",
    description: "Phát hiện MySQL UDF injection và manipulation",
    patterns: ["UDF", "LOAD_FILE", "INTO DUMPFILE"],
    severity: "CRITICAL",
    pl: [3, 4],
    score: 5,
    examples: ["LOAD_FILE('/etc/passwd')", "INTO DUMPFILE"]
  },
  "942360": {
    name: "Detects concatenated basic SQL injection and SQLLite attempts",
    description: "Phát hiện concatenated SQL injection và SQLLite attempts",
    patterns: ["||", "CONCAT", "||'"],
    severity: "WARNING",
    pl: [2, 3, 4],
    score: 3,
    examples: ["'||'", "CONCAT('a','b')"]
  },
  "942370": {
    name: "Detects classic SQL injection probings 2/2",
    description: "Phát hiện classic SQL injection probing (phần 2)",
    patterns: ["' OR", "UNION", "SELECT"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["' OR 1=1", "UNION SELECT"]
  },
  "942380": {
    name: "Detects SQL injection attempts with chained keywords",
    description: "Phát hiện SQL injection với chained keywords",
    patterns: ["UNION ALL", "UNION SELECT", "ORDER BY"],
    severity: "ERROR",
    pl: [2, 3, 4],
    score: 4,
    examples: ["UNION ALL SELECT", "ORDER BY 1"]
  },
  "942390": {
    name: "Detects SQL injection attempts with stacked queries",
    description: "Phát hiện stacked queries (nhiều câu lệnh)",
    patterns: [";", "EXEC", "EXECUTE"],
    severity: "CRITICAL",
    pl: [2, 3, 4],
    score: 5,
    examples: ["; DROP TABLE", "EXEC xp_cmdshell"]
  },
  "942400": {
    name: "Detects SQL injection with common backtick and function obfuscation",
    description: "Phát hiện SQL injection với backtick và function obfuscation",
    patterns: ["`", "FUNCTION", "PROCEDURE"],
    severity: "WARNING",
    pl: [3, 4],
    score: 3,
    examples: ["`table`", "FUNCTION()"]
  },
  "942410": {
    name: "Detects SQL injection with common SQL keywords",
    description: "Phát hiện SQL injection với SQL keywords phổ biến",
    patterns: ["SELECT", "INSERT", "UPDATE", "DELETE"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["SELECT * FROM", "INSERT INTO"]
  },
  "942430": {
    name: "Restricted SQL Character Anomaly Detection (args): number of special characters exceeded",
    description: "Phát hiện số lượng ký tự đặc biệt vượt quá ngưỡng",
    patterns: ["'", '"', ";", "--"],
    severity: "WARNING",
    pl: [2, 3, 4],
    score: 3,
    examples: ["Nhiều ký tự đặc biệt"]
  },
  "942440": {
    name: "SQL Comment Sequence Detected",
    description: "Phát hiện SQL comment sequence",
    patterns: ["--", "/*", "*/", "#"],
    severity: "WARNING",
    pl: [1, 2, 3, 4],
    score: 3,
    examples: ["-- comment", "/* comment */"]
  },
  "942450": {
    name: "SQL Hex Encoding Identified",
    description: "Phát hiện hex encoding trong SQL",
    patterns: ["0x", "UNHEX", "HEX("],
    severity: "WARNING",
    pl: [3, 4],
    score: 3,
    examples: ["0x61646d696e", "UNHEX('61646d696e')"]
  },
  "942470": {
    name: "SQL Injection Attack: Common Injection Testing Detected",
    description: "Phát hiện common injection testing",
    patterns: ["OR 1=1", "OR true", "AND 1=1"],
    severity: "ERROR",
    pl: [1, 2, 3, 4],
    score: 4,
    examples: ["OR 1=1", "AND 1=1"]
  },
  "942480": {
    name: "SQL Injection Attack: SQL Tautology Detected",
    description: "Phát hiện SQL tautology",
    patterns: ["'1'='1'", "'a'='a'", "1=1"],
    severity: "WARNING",
    pl: [2, 3, 4],
    score: 3,
    examples: ["'1'='1'", "OR 'a'='a'"]
  },
  "942490": {
    name: "SQL Injection Attack: SQL Tautology Detected (Extended)",
    description: "Phát hiện SQL tautology mở rộng",
    patterns: ["'1'='1", "true=true", "false=false"],
    severity: "WARNING",
    pl: [3, 4],
    score: 3,
    examples: ["'1'='1--", "true=true"]
  },
  "942500": {
    name: "SQL Injection Attack: MySQL Comment Detection",
    description: "Phát hiện MySQL comment",
    patterns: ["--", "#", "/*", "*/"],
    severity: "WARNING",
    pl: [1, 2, 3, 4],
    score: 3,
    examples: ["-- comment", "# comment"]
  },
  "942510": {
    name: "SQL Injection Attack: PostgreSQL Function Detection",
    description: "Phát hiện PostgreSQL function",
    patterns: ["pg_", "FUNCTION", "PROCEDURE"],
    severity: "ERROR",
    pl: [3, 4],
    score: 4,
    examples: ["pg_sleep", "pg_user"]
  },
  "942520": {
    name: "SQL Injection Attack: MSSQL Function Detection",
    description: "Phát hiện MSSQL function",
    patterns: ["xp_", "sp_", "OPENROWSET"],
    severity: "CRITICAL",
    pl: [2, 3, 4],
    score: 5,
    examples: ["xp_cmdshell", "sp_executesql"]
  },
  "942530": {
    name: "SQL Injection Attack: Oracle Function Detection",
    description: "Phát hiện Oracle function",
    patterns: ["UTL_", "SYS.", "DBMS_"],
    severity: "ERROR",
    pl: [3, 4],
    score: 4,
    examples: ["UTL_HTTP", "SYS.USER_TABLES"]
  },
  "942540": {
    name: "SQL Injection Attack: SQLite Function Detection",
    description: "Phát hiện SQLite function",
    patterns: ["sqlite_", "load_extension"],
    severity: "WARNING",
    pl: [3, 4],
    score: 3,
    examples: ["sqlite_version", "load_extension"]
  }
};

function renderRulesList() {
  const container = document.getElementById("rules-list");
  const emptyMsg = document.getElementById("rules-empty");
  const searchInput = document.getElementById("rule-search");
  const plFilter = document.getElementById("rule-pl-filter");

  if (!container || !searchInput || !plFilter) return;

  const searchTerm = (searchInput.value || "").toLowerCase();
  const selectedPl = plFilter.value ? Number(plFilter.value) : null;

  const filteredRules = Object.entries(RULES_DATA).filter(([ruleId, rule]) => {
    // Search filter
    const matchesSearch =
      ruleId.toLowerCase().includes(searchTerm) ||
      rule.name.toLowerCase().includes(searchTerm) ||
      rule.description.toLowerCase().includes(searchTerm) ||
      (rule.patterns || []).some((p) => p.toLowerCase().includes(searchTerm));

    // PL filter
    const matchesPl = selectedPl === null || rule.pl.includes(selectedPl);

    return matchesSearch && matchesPl;
  });

  container.innerHTML = "";
  emptyMsg.classList.toggle("d-none", filteredRules.length > 0);

  if (filteredRules.length === 0) {
    return;
  }

  filteredRules.forEach(([ruleId, rule]) => {
    const col = document.createElement("div");
    col.className = "col-md-6 col-lg-4";

    const severityBadgeClass = {
      CRITICAL: "bg-danger",
      ERROR: "bg-warning text-dark",
      WARNING: "bg-info text-dark",
      NOTICE: "bg-secondary"
    }[rule.severity] || "bg-secondary";

    const plBadges = rule.pl.map((pl) => `<span class="badge bg-primary me-1">PL ${pl}</span>`).join("");

    const examplesHtml = rule.examples
      ? `<div class="mt-2"><strong>Ví dụ:</strong><ul class="small mb-0 ps-3"><li>${rule.examples
          .map((ex) => `<code>${escapeHtml(ex)}</code>`)
          .join("</li><li>")}</li></ul></div>`
      : "";

    const patternsHtml = rule.patterns
      ? `<div class="mt-2"><strong>Patterns:</strong> ${rule.patterns
          .map((p) => `<code class="small">${escapeHtml(p)}</code>`)
          .join(", ")}</div>`
      : "";

    col.innerHTML = `
      <div class="card h-100">
        <div class="card-header d-flex justify-content-between align-items-center">
          <h6 class="mb-0"><code>${ruleId}</code></h6>
          <span class="badge ${severityBadgeClass}">${rule.severity}</span>
        </div>
        <div class="card-body">
          <h6 class="card-title">${escapeHtml(rule.name)}</h6>
          <p class="card-text small">${escapeHtml(rule.description)}</p>
          <div class="mb-2">
            <strong>Paranoia Levels:</strong> ${plBadges}
          </div>
          <div class="mb-2">
            <strong>Điểm:</strong> <span class="badge bg-secondary">${rule.score}</span>
          </div>
          ${patternsHtml}
          ${examplesHtml}
        </div>
      </div>
    `;

    container.appendChild(col);
  });
}

function bindRulesEvents() {
  const searchInput = document.getElementById("rule-search");
  const plFilter = document.getElementById("rule-pl-filter");

  if (searchInput) {
    searchInput.addEventListener("input", renderRulesList);
  }

  if (plFilter) {
    plFilter.addEventListener("change", renderRulesList);
  }
}

// Phân tích kết quả batch và nhóm payload theo từng model
function analyzeBatchResults(results) {
  const analysis = {
    byModel: {}, // Phân tích theo từng model
    allModels: [] // Danh sách tất cả models
  };

  results.forEach((result) => {
    const modSecBlock = result.modsecurity?.decision === "block";
    const modSecScore = result.modsecurity?.score || 0;
    const modSecRules = result.modsecurity?.triggered_rules || [];
    
    // Lấy tất cả kết quả ML (có thể có nhiều model)
    const mlResults = result.ml_results?.length ? result.ml_results : (result.ml ? [result.ml] : []);
    
    // Phân tích theo từng model
    mlResults.forEach((ml) => {
      const modelKey = ml.model_key || "unknown";
      const mlAttack = ml.prediction === 1;
      
      if (!analysis.byModel[modelKey]) {
        analysis.byModel[modelKey] = {
          modelName: ml.model_name || modelKey,
          modelKey: modelKey,
          bothBlock: [],
          onlyModSec: [],
          onlyML: [],
          bothAllow: [],
          stats: {
            total: 0,
            bothBlock: 0,
            onlyModSec: 0,
            onlyML: 0,
            bothAllow: 0
          }
        };
        analysis.allModels.push(modelKey);
      }
      
      const modelAnalysis = analysis.byModel[modelKey];
      modelAnalysis.stats.total++;
      
      const payloadData = {
        payload: result.payload,
        payloadPreview: result.payload_preview || result.payload.substring(0, 60),
        modSecScore: modSecScore,
        modSecRules: modSecRules,
        mlModel: ml.model_name || modelKey,
        mlConfidence: ml.probability_attack !== undefined 
          ? ml.probability_attack 
          : ml.decision_score !== undefined 
          ? ml.decision_score 
          : null,
        mlPrediction: ml.prediction,
        metadata: result.metadata
      };
      
      if (modSecBlock && mlAttack) {
        modelAnalysis.bothBlock.push(payloadData);
        modelAnalysis.stats.bothBlock++;
      } else if (modSecBlock && !mlAttack) {
        modelAnalysis.onlyModSec.push(payloadData);
        modelAnalysis.stats.onlyModSec++;
      } else if (!modSecBlock && mlAttack) {
        modelAnalysis.onlyML.push(payloadData);
        modelAnalysis.stats.onlyML++;
      } else {
        modelAnalysis.bothAllow.push(payloadData);
        modelAnalysis.stats.bothAllow++;
      }
    });
  });

  return analysis;
}

// Hiển thị phân tích chi tiết với danh sách payload theo từng model
function renderDetailedAnalysis(analysis, modSecBlock, mlDetect, concordantBlock, total) {
  const modelKeys = analysis.allModels || Object.keys(analysis.byModel);
  
  if (modelKeys.length === 0) {
    return `<div class="alert alert-warning mb-0">Không có dữ liệu mô hình để phân tích.</div>`;
  }
  
  let html = '';
  
  // Tính toán thống kê tổng hợp
  let totalBothBlock = 0;
  let totalOnlyModSec = 0;
  let totalOnlyML = 0;
  let totalBothAllow = 0;
  let totalMLDetect = 0;
  
  modelKeys.forEach(key => {
    const modelData = analysis.byModel[key];
    totalBothBlock += modelData.stats.bothBlock;
    totalOnlyModSec += modelData.stats.onlyModSec;
    totalOnlyML += modelData.stats.onlyML;
    totalBothAllow += modelData.stats.bothAllow;
    totalMLDetect += modelData.stats.bothBlock + modelData.stats.onlyML;
  });
  
  // Hiển thị phân tích theo từng model
  html += `
    <div class="mb-3">
      <h6 class="mb-2">📊 Phân tích theo từng mô hình (${modelKeys.length} mô hình):</h6>
      <div class="accordion" id="modelAnalysisAccordion">
  `;
  
  modelKeys.forEach((modelKey, index) => {
    const modelData = analysis.byModel[modelKey];
    const accordionId = `model-${index}`;
    const stats = modelData.stats;
    
    html += `
      <div class="accordion-item">
        <h2 class="accordion-header" id="heading-${accordionId}">
          <button class="accordion-button ${index === 0 ? '' : 'collapsed'}" type="button" data-bs-toggle="collapse" data-bs-target="#collapse-${accordionId}">
            <strong>${escapeHtml(modelData.modelName)}</strong>
            <span class="badge bg-success ms-2">Cùng chặn: ${stats.bothBlock}</span>
            <span class="badge bg-danger ms-1">Chỉ ModSec: ${stats.onlyModSec}</span>
            <span class="badge bg-warning ms-1">Chỉ ML: ${stats.onlyML}</span>
            <span class="badge bg-info ms-1">Cả hai cho phép: ${stats.bothAllow}</span>
          </button>
        </h2>
        <div id="collapse-${accordionId}" class="accordion-collapse collapse ${index === 0 ? 'show' : ''}" data-bs-parent="#modelAnalysisAccordion">
          <div class="accordion-body">
            <div class="row g-3">
              <div class="col-12">
                <div class="border-start border-3 border-success ps-3 py-2 mb-2 bg-light rounded">
                  <h6 class="text-success mb-1">✅ Cùng chặn với ModSecurity: ${stats.bothBlock} payload</h6>
                  <small class="text-muted">ModSecurity: block + ${modelData.modelName}: attack → Đồng thuận cao</small>
                </div>
                ${renderPayloadList(modelData.bothBlock, "success", false, false)}
              </div>
              
              <div class="col-12">
                <div class="border-start border-3 border-danger ps-3 py-2 mb-2 bg-light rounded">
                  <h6 class="text-danger mb-1">⚠️ Chỉ ModSecurity chặn: ${stats.onlyModSec} payload</h6>
                  <small class="text-muted">ModSecurity: block + ${modelData.modelName}: legit → Có thể là false positive</small>
                </div>
                ${renderPayloadList(modelData.onlyModSec, "danger", false, false)}
              </div>
              
              <div class="col-12">
                <div class="border-start border-3 border-warning ps-3 py-2 mb-2 bg-light rounded">
                  <h6 class="text-warning mb-1">🔍 Chỉ ${modelData.modelName} đánh dấu: ${stats.onlyML} payload</h6>
                  <small class="text-muted">ModSecurity: allow + ${modelData.modelName}: attack → ${modelData.modelName} phát hiện thêm</small>
                </div>
                ${renderPayloadList(modelData.onlyML, "warning", false, false)}
              </div>
              
              <div class="col-12">
                <div class="border-start border-3 border-info ps-3 py-2 mb-2 bg-light rounded">
                  <h6 class="text-info mb-1">✓ Cả hai đều cho phép: ${stats.bothAllow} payload</h6>
                  <small class="text-muted">ModSecurity: allow + ${modelData.modelName}: legit → Có thể là payload hợp lệ</small>
                </div>
                ${renderPayloadList(modelData.bothAllow, "info", true, false)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  });
  
  html += `</div></div>`;
  
  // So sánh giữa các model
  if (modelKeys.length > 1) {
    html += `
      <div class="mt-4">
        <h6 class="mb-3">📈 So sánh giữa các mô hình:</h6>
        <div class="table-responsive">
          <table class="table table-sm table-bordered">
            <thead class="table-light">
              <tr>
                <th>Mô hình</th>
                <th class="text-center">Cùng chặn</th>
                <th class="text-center">Chỉ ModSec</th>
                <th class="text-center">Chỉ ML</th>
                <th class="text-center">Cả hai cho phép</th>
                <th class="text-center">Tổng ML phát hiện</th>
                <th class="text-center">Tỉ lệ đồng thuận</th>
              </tr>
            </thead>
            <tbody>
    `;
    
    modelKeys.forEach(key => {
      const modelData = analysis.byModel[key];
      const stats = modelData.stats;
      const totalMLDetect = stats.bothBlock + stats.onlyML;
      const agreementRate = stats.total > 0 ? ((stats.bothBlock / stats.total) * 100).toFixed(1) : '0.0';
      
      html += `
        <tr>
          <td><strong>${escapeHtml(modelData.modelName)}</strong></td>
          <td class="text-center"><span class="badge bg-success">${stats.bothBlock}</span></td>
          <td class="text-center"><span class="badge bg-danger">${stats.onlyModSec}</span></td>
          <td class="text-center"><span class="badge bg-warning">${stats.onlyML}</span></td>
          <td class="text-center"><span class="badge bg-info">${stats.bothAllow}</span></td>
          <td class="text-center"><strong>${totalMLDetect}</strong></td>
          <td class="text-center"><strong>${agreementRate}%</strong></td>
        </tr>
      `;
    });
    
    html += `
            </tbody>
          </table>
        </div>
      </div>
    `;
  }
  
  // Tổng hợp
  html += `
    <div class="mt-3 p-3 bg-light rounded">
      <h6>📊 Tổng hợp:</h6>
      <ul class="mb-0 small">
        <li>ModSecurity chặn: <strong>${modSecBlock}</strong> payload</li>
        <li>Tổng ML phát hiện (tất cả models): <strong>${totalMLDetect}</strong> payload</li>
        <li>Tổng cùng chặn (tất cả models): <strong>${totalBothBlock}</strong> payload</li>
        <li>Số mô hình đã phân tích: <strong>${modelKeys.length}</strong></li>
      </ul>
    </div>
  `;
  
  return html;
}

// Hiển thị danh sách payload
function renderPayloadList(payloads, colorClass, showAll = false, compact = false) {
  if (payloads.length === 0) {
    return `<div class="text-muted small ps-3">Không có payload nào trong nhóm này.</div>`;
  }
  
  const maxShow = compact ? 5 : 10;
  const toShow = showAll ? payloads : payloads.slice(0, maxShow);
  const remaining = payloads.length - toShow.length;
  
  let html = `<div class="list-group list-group-flush">`;
  
  toShow.forEach((item, idx) => {
    const payloadText = escapeHtml(item.payloadPreview || item.payload.substring(0, 80));
    const modSecBadge = item.modSecScore >= 5.0 
      ? `<span class="badge bg-danger">Block (${item.modSecScore.toFixed(2)})</span>`
      : `<span class="badge bg-success">Allow (${item.modSecScore.toFixed(2)})</span>`;
    
    const rulesBadges = (item.modSecRules || []).slice(0, 3).map((r, idx) => {
      const ruleTooltip = getRuleTooltip(r);
      const tooltipId = `rule-tooltip-payload-${r}-${idx}-${Date.now()}`;
      return `<span 
        class="badge bg-info text-dark rule-badge" 
        data-bs-toggle="tooltip" 
        data-bs-html="true"
        data-bs-placement="top"
        title="${escapeHtml(ruleTooltip).replace(/"/g, '&quot;')}"
        id="${tooltipId}">${escapeHtml(r)}</span>`;
    }).join(" ");
    const moreRules = (item.modSecRules || []).length > 3 
      ? `<span class="badge bg-secondary">+${item.modSecRules.length - 3}</span>` 
      : "";
    
    // Hiển thị thông tin ML cho model cụ thể
    let mlInfo = "";
    if (item.mlModel) {
      const mlBadge = item.mlPrediction === 1
        ? `<span class="badge bg-danger">Attack</span>`
        : `<span class="badge bg-success">Legit</span>`;
      
      let confidenceText = "";
      if (item.mlConfidence !== null && item.mlConfidence !== undefined) {
        if (item.mlConfidence <= 1 && item.mlConfidence >= 0) {
          // Probability (0-1)
          confidenceText = `${(item.mlConfidence * 100).toFixed(1)}%`;
        } else {
          // Decision score
          confidenceText = `Score: ${item.mlConfidence.toFixed(3)}`;
        }
      }
      
      mlInfo = `<div class="small text-muted mt-1"><strong>${item.mlModel}:</strong> ${mlBadge} ${confidenceText ? `(${confidenceText})` : ''}</div>`;
    }
    
    const name = item.metadata?.name ? `<strong>${escapeHtml(item.metadata.name)}:</strong> ` : "";
    
    html += `
      <div class="list-group-item">
        <div class="d-flex justify-content-between align-items-start">
          <div class="flex-grow-1">
            <div>${name}<code class="small">${payloadText}${item.payload && item.payload.length > 80 ? '...' : ''}</code></div>
            <div class="mt-1">
              <strong>ModSecurity:</strong> ${modSecBadge}
              ${rulesBadges ? `<br/><strong>Rules:</strong> ${rulesBadges} ${moreRules}` : '<br/><span class="text-muted small">Không có rules</span>'}
            </div>
            ${mlInfo}
          </div>
        </div>
      </div>
    `;
  });
  
  html += `</div>`;
  
  if (remaining > 0 && !showAll) {
    html += `<div class="text-muted small ps-3 mt-2">... và ${remaining} payload khác</div>`;
  }
  
  // Khởi tạo tooltip cho rules badges sau khi render
  setTimeout(() => {
    initRuleTooltips();
  }, 100);
  
  return html;
}

document.addEventListener("DOMContentLoaded", async () => {
  state.detailModal = new bootstrap.Modal(document.getElementById("detailModal"));
  await fetchConfig();
  await fetchLogs(1);
  await fetchStats();
  bindEvents();
  bindRulesEvents();
  renderBatchSummary();
  renderRulesList();
});

