const libraryCount = document.querySelector("#libraryCount");
const indexCount = document.querySelector("#indexCount");
const libraryState = document.querySelector("#libraryState");
const searchState = document.querySelector("#searchState");
const libraryFiles = document.querySelector("#libraryFiles");
const libraryGroupSelect = document.querySelector("#libraryGroupSelect");
const queryFile = document.querySelector("#queryFile");
const queryPageSelect = document.querySelector("#queryPageSelect");
const uploadLibraryBtn = document.querySelector("#uploadLibraryBtn");
const rebuildBtn = document.querySelector("#rebuildBtn");
const searchBtn = document.querySelector("#searchBtn");
const limitSelect = document.querySelector("#limitSelect");
const results = document.querySelector("#results");
const emptyState = document.querySelector("#emptyState");
const resultSummary = document.querySelector("#resultSummary");
const queryDimensions = document.querySelector("#queryDimensions");

uploadLibraryBtn.addEventListener("click", uploadLibrary);
rebuildBtn.addEventListener("click", rebuildIndex);
searchBtn.addEventListener("click", search);
libraryFiles.addEventListener("change", () => {
  const count = libraryFiles.files.length;
  libraryState.textContent = count ? `${count} selected` : "Ready";
});
queryFile.addEventListener("change", () => {
  const file = queryFile.files[0];
  searchState.textContent = file ? file.name : "Idle";
});

loadStatus();

async function loadStatus() {
  const payload = await api("/api/status");
  libraryCount.textContent = payload.library_pdf_count ?? 0;
  indexCount.textContent = payload.indexed_reference_count ?? payload.indexed_pdf_count ?? 0;
}

async function uploadLibrary() {
  if (!libraryFiles.files.length) {
    toast("Select one or more library PDFs.");
    return;
  }
  setBusy(uploadLibraryBtn, true);
  libraryState.textContent = "Uploading";
  try {
    const form = new FormData();
    for (const file of libraryFiles.files) {
      form.append("pdfs", file);
    }
    const group = encodeURIComponent(libraryGroupSelect.value);
    const url = group ? `/api/library/upload?page_group=${group}` : "/api/library/upload";
    const payload = await api(url, { method: "POST", body: form });
    libraryFiles.value = "";
    libraryState.textContent = `${payload.saved.length} added`;
    await loadStatus();
    toast(`${payload.saved.length} PDF file(s) added.`);
  } catch (error) {
    libraryState.textContent = "Error";
    toast(error.message);
  } finally {
    setBusy(uploadLibraryBtn, false);
  }
}

async function rebuildIndex() {
  setBusy(rebuildBtn, true);
  libraryState.textContent = "Indexing";
  try {
    const payload = await api("/api/index/rebuild", { method: "POST" });
    await loadStatus();
    const errors = payload.index.errors || [];
    const indexedPages = payload.index.indexed_pages ?? payload.index.indexed ?? 0;
    libraryState.textContent = errors.length ? "Indexed with errors" : "Indexed";
    toast(`Indexed ${indexedPages} reference page(s).`);
  } catch (error) {
    libraryState.textContent = "Error";
    toast(error.message);
  } finally {
    setBusy(rebuildBtn, false);
  }
}

async function search() {
  const file = queryFile.files[0];
  if (!file) {
    toast("Attach a query PDF.");
    return;
  }
  setBusy(searchBtn, true);
  searchState.textContent = "Searching";
  try {
    const form = new FormData();
    form.append("pdf", file);
    const limit = encodeURIComponent(limitSelect.value);
    const queryPage = encodeURIComponent(queryPageSelect.value);
    const pageParam = queryPage ? `&query_page=${queryPage}` : "";
    const payload = await api(`/api/search?limit=${limit}${pageParam}`, { method: "POST", body: form });
    renderQuery(payload.query);
    renderResults(payload.page_results || [], payload.indexed_reference_count ?? payload.indexed_pdf_count ?? 0);
    searchState.textContent = "Done";
  } catch (error) {
    searchState.textContent = "Error";
    toast(error.message);
  } finally {
    setBusy(searchBtn, false);
  }
}

function renderQuery(query) {
  if (!query) {
    queryDimensions.textContent = "No query loaded";
    queryDimensions.classList.add("muted");
    return;
  }

  const details = [`${query.page_count || 0} pages`, `${query.dimension_count || 0} dimensions`];
  if (query.selected_page) {
    details.push(`selected page ${query.selected_page}`);
  }
  const dimensions = (query.dimensions || []).slice(0, 16);
  queryDimensions.classList.remove("muted");
  queryDimensions.innerHTML = [...details, ...dimensions].map(chip).join("");
}

function renderResults(pageResults, indexedCount) {
  results.innerHTML = "";
  emptyState.hidden = pageResults.length > 0;
  const matchCount = pageResults.reduce((sum, page) => sum + (page.matches?.length || 0), 0);
  resultSummary.textContent = `${pageResults.length} query page(s), ${matchCount} shown match(es), ${indexedCount} indexed reference page(s).`;

  for (const page of pageResults) {
    const section = document.createElement("section");
    section.className = "page-result";
    const cards = (page.matches || []).map(matchCard).join("");
    section.innerHTML = `
      <div class="page-result-header">
        <div>
          <h3>Query page ${page.query_page}</h3>
          <p>${pageSummary(page)}</p>
        </div>
        <span class="state-pill">${escapeHtml(page.expected_group)}</span>
      </div>
      <div class="page-cards">
        ${cards || `<div class="empty-state"><strong>No matches</strong><span>No reference pages found for this query page.</span></div>`}
      </div>
    `;
    results.appendChild(section);
  }
}

function matchCard(match) {
  const scorePercent = Math.round(match.score * 100);
  const common = match.common_dimensions?.length
    ? match.common_dimensions.map(chip).join("")
    : `<span class="muted">No exact shared dimensions</span>`;

  return `
    <article class="match-card">
      <img class="preview" alt="" src="${escapeAttr(match.preview_url)}" loading="lazy" />
      <div class="match-main">
        <div class="match-title-row">
          <div>
            <h3>${escapeHtml(match.filename)}</h3>
            <div class="match-subtitle">${escapeHtml(match.page_group_label)} - reference page ${escapeHtml(match.reference_page)} - ${escapeHtml(match.relative_path)}</div>
          </div>
          <div class="score">${scorePercent}%</div>
        </div>
        <div class="score-bar" aria-hidden="true"><span style="width:${scorePercent}%"></span></div>
        <div class="breakdown">
          <div><strong>${Math.round((match.title_score || 0) * 100)}%</strong><small>Title box</small></div>
          <div><strong>${Math.round(match.visual_score * 100)}%</strong><small>Visual</small></div>
          <div><strong>${Math.round(match.dimension_score * 100)}%</strong><small>Dimensions</small></div>
          <div><strong>${Math.round(match.text_score * 100)}%</strong><small>Text</small></div>
        </div>
        <div class="match-footer">
          <div class="common-dimensions">${common}</div>
          <a class="pdf-link" href="${escapeAttr(match.pdf_url)}" target="_blank" rel="noreferrer">Open PDF</a>
        </div>
      </div>
    </article>
  `;
}

function pageSummary(page) {
  const before = page.candidate_count || 0;
  const after = page.filtered_candidate_count ?? before;
  const filter = page.title_filter || {};
  const base = `${before} candidate reference page(s) from ${escapeHtml(page.used_group)}`;
  if (!filter.applied) {
    return `${base}. Title-box filter not applied.`;
  }
  return `${base}. Title-box filter kept ${after}.`;
}

function chip(value) {
  return `<span class="dimension-chip">${escapeHtml(value)}</span>`;
}

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || `Request failed with ${response.status}`);
  }
  return payload;
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.dataset.originalText ??= button.textContent;
  button.textContent = busy ? "Working" : button.dataset.originalText;
}

function toast(message) {
  const old = document.querySelector(".toast");
  if (old) old.remove();
  const node = document.createElement("div");
  node.className = "toast";
  node.textContent = message;
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 3500);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttr(value) {
  return escapeHtml(value);
}
