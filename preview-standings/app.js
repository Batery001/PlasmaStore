(function () {
  "use strict";

  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const metaPanel = document.getElementById("metaPanel");
  const metaGrid = document.getElementById("metaGrid");
  const finalWarn = document.getElementById("finalWarn");
  const previewPanel = document.getElementById("previewPanel");
  const categoriesRoot = document.getElementById("categoriesRoot");
  const actionsPanel = document.getElementById("actionsPanel");
  const btnClear = document.getElementById("btnClear");
  const btnConfirm = document.getElementById("btnConfirm");
  const jsonOut = document.getElementById("jsonOut");
  const toast = document.getElementById("toast");
  const modeBadge = document.getElementById("modeBadge");
  const liveBanner = document.getElementById("liveBanner");
  const liveBannerText = document.getElementById("liveBannerText");
  const autoRefresh = document.getElementById("autoRefresh");
  const adminNotice = document.getElementById("adminNotice");
  const adminNoticeBody = document.getElementById("adminNoticeBody");
  const btnOpenPreview = document.getElementById("btnOpenPreview");
  const btnDismissNotice = document.getElementById("btnDismissNotice");

  /** @type {{ payload: object, fileName: string, source: 'html' | 'tdf' } | null} */
  let state = null;

  let liveTomDataPath = "";
  let lastLiveKey = "";

  /** @type {{ fileName: string; mtimeMs: number; payload: object } | null} */
  let lastPendingSnapshot = null;

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function formatSavedAt(mtimeMs) {
    try {
      return new Date(mtimeMs).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return String(mtimeMs);
    }
  }

  function show(el, on) {
    el.classList.toggle("hidden", !on);
  }

  function parseRoundInfo(h3Text) {
    const m = h3Text && h3Text.match(/Ronda\s+(\d+)\s*\/\s*(\d+)/i);
    if (!m) return { current: null, total: null, text: h3Text || "" };
    return { current: parseInt(m[1], 10), total: parseInt(m[2], 10), text: h3Text.trim() };
  }

  function isLikelyFinalRound(round) {
    if (round.current == null || round.total == null) return null;
    return round.current === round.total;
  }

  /**
   * @param {string} htmlText
   * @param {string} fileName
   */
  function parseStandingsHtml(htmlText, fileName) {
    const doc = new DOMParser().parseFromString(htmlText, "text/html");
    const torneoEl = doc.querySelector("p");
    const torneoB = torneoEl && torneoEl.querySelector("b");
    const tournamentName = (torneoB && torneoB.textContent.trim()) || "";

    const h3 = doc.querySelector("h3");
    const roundLine = (h3 && h3.textContent) || "";
    const round = parseRoundInfo(roundLine);

    const footerDate =
      doc.querySelector("table.footer td.footer[align='right'] b") ||
      doc.querySelector("table.footer td[align='right'] b");
    const generatedAt = footerDate ? footerDate.textContent.trim() : "";

    const h2s = doc.querySelectorAll("h2");
    const categories = [];

    h2s.forEach((h2) => {
      const division = h2.textContent.trim();
      let table = h2.nextElementSibling;
      while (table && table.nodeType === 1 && table.tagName !== "TABLE") {
        table = table.nextElementSibling;
      }
      if (!table || table.tagName !== "TABLE") return;

      const rows = Array.from(table.querySelectorAll("tr")).slice(1);
      const headers = Array.from(table.querySelectorAll("tr:first-child th, tr:first-child td")).map((th) =>
        th.textContent.replace(/\s+/g, " ").trim()
      );

      const topRows = rows.slice(0, 4).map((tr) => {
        const cells = Array.from(tr.querySelectorAll("td")).map((td) => td.textContent.replace(/\u00a0/g, " ").trim());
        const rowObj = {};
        headers.forEach((h, i) => {
          rowObj[h || `col_${i}`] = cells[i] ?? "";
        });
        return rowObj;
      });

      categories.push({ division, headers, rows: topRows });
    });

    const payload = {
      source: "html",
      sourceFile: fileName,
      tournamentName,
      roundLabel: round.text,
      roundCurrent: round.current,
      roundTotal: round.total,
      generatedAt,
      warnings: [],
      categories: categories.map((c) => ({
        division: c.division,
        top4: c.rows,
      })),
    };

    return { payload, round, categories };
  }

  /**
   * @param {object} payload
   * @returns {{ division: string, headers: string[], rows: object[] }[]}
   */
  function categoriesForRender(payload) {
    const list = payload.categories || [];
    return list.map((c) => {
      const top4 = c.top4;
      if (Array.isArray(top4) && top4.length) {
        const headers = Object.keys(top4[0]);
        return { division: c.division, headers, rows: top4 };
      }
      return { division: c.division || "—", headers: c.headers || [], rows: c.rows || [] };
    });
  }

  /**
   * @param {object} payload
   * @param {{ current: number|null, total: number|null, text: string }} round
   */
  function renderMeta(payload, round) {
    metaGrid.innerHTML = "";
    const items = [["Torneo", payload.tournamentName || "—"]];

    if (payload.source === "tdf") {
      items.push(["Origen", `Archivo .tdf (TOM v${payload.tomVersion || "?"})`]);
      items.push(["Fecha del evento (TOM)", payload.tournamentStartDate || "—"]);
      items.push(["Rondas", payload.roundLabel || "—"]);
    } else {
      items.push(["Clasificación (informe)", payload.roundLabel || "—"]);
      items.push(["Generado (informe)", payload.generatedAt || "—"]);
    }

    items.push(["Archivo", payload.sourceFile || "—"]);

    items.forEach(([k, v]) => {
      const dt = document.createElement("dt");
      dt.textContent = k;
      const dd = document.createElement("dd");
      dd.textContent = v;
      metaGrid.appendChild(dt);
      metaGrid.appendChild(dd);
    });

    const parts = [];

    if (Array.isArray(payload.warnings) && payload.warnings.length) {
      parts.push(payload.warnings.join(" "));
    }

    if (payload.source === "html") {
      const likely = isLikelyFinalRound(round);
      if (likely === false) {
        parts.push(
          "La ronda del informe no coincide con la última (p. ej. 2/3). Revisa que sea el standing final antes de publicar."
        );
      } else if (likely === null) {
        parts.push(
          "No se pudo detectar el patrón Ronda X/Y en el HTML. Comprueba manualmente que sea el informe final."
        );
      }
    } else if (payload.source === "tdf") {
      const rc = payload.roundCurrent;
      const rt = payload.roundTotal;
      if (rc != null && rt != null && rc !== rt) {
        parts.push("Las rondas en el .tdf no cuadran (current vs total); revisa el archivo.");
      }
    }

    if (parts.length) {
      finalWarn.textContent = parts.join("\n\n");
      show(finalWarn, true);
    } else {
      show(finalWarn, false);
    }
  }

  function renderCategories(categories) {
    categoriesRoot.innerHTML = "";
    categories.forEach((cat) => {
      const block = document.createElement("div");
      block.className = "category-block";
      const h = document.createElement("h3");
      h.className = "category-name";
      h.textContent = cat.division;
      block.appendChild(h);

      const wrap = document.createElement("div");
      wrap.className = "table-wrap";
      const table = document.createElement("table");
      table.className = "preview";
      const thead = document.createElement("thead");
      const hr = document.createElement("tr");
      const thPos = document.createElement("th");
      thPos.textContent = "#";
      hr.appendChild(thPos);
      cat.headers.forEach((label) => {
        const th = document.createElement("th");
        th.textContent = label;
        hr.appendChild(th);
      });
      thead.appendChild(hr);
      table.appendChild(thead);

      const tbody = document.createElement("tbody");
      cat.rows.forEach((rowObj, idx) => {
        const tr = document.createElement("tr");
        const td0 = document.createElement("td");
        td0.className = "num";
        td0.textContent = String(idx + 1);
        tr.appendChild(td0);
        cat.headers.forEach((hname) => {
          const td = document.createElement("td");
          td.textContent = rowObj[hname] ?? "";
          tr.appendChild(td);
        });
        tbody.appendChild(tr);
      });
      table.appendChild(tbody);
      wrap.appendChild(table);
      block.appendChild(wrap);
      categoriesRoot.appendChild(block);
    });
  }

  /**
   * @param {object} payload
   * @param {string} fileName
   * @param {'html' | 'tdf'} source
   */
  function applyPayload(payload, fileName, source) {
    const round =
      source === "html"
        ? parseRoundInfo(payload.roundLabel || "")
        : {
            current: payload.roundCurrent ?? null,
            total: payload.roundTotal ?? null,
            text: payload.roundLabel || "",
          };

    const categories = categoriesForRender(payload);
    if (!categories.length) {
      return false;
    }

    state = { payload: { ...payload, sourceFile: fileName || payload.sourceFile, source }, fileName, source };
    renderMeta(state.payload, round);
    renderCategories(categories);
    show(metaPanel, true);
    show(previewPanel, true);
    show(actionsPanel, true);
    btnConfirm.disabled = false;
    show(jsonOut, false);
    show(toast, false);
    return true;
  }

  function loadFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === "string" ? reader.result : "";
      try {
        const { payload, round, categories } = parseStandingsHtml(text, file.name);
        if (!categories.length) {
          alert("No se encontraron tablas de clasificación (buscando <h2> + tabla). Revisa el HTML.");
          return;
        }
        applyPayload(payload, file.name, "html");
        modeBadge.textContent = "Modo manual (HTML)";
      } catch (e) {
        console.error(e);
        alert("Error al analizar el archivo: " + (e && e.message ? e.message : String(e)));
      }
    };
    reader.readAsText(file, "UTF-8");
  }

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    const f = fileInput.files && fileInput.files[0];
    loadFile(f);
    fileInput.value = "";
  });

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  btnClear.addEventListener("click", () => {
    state = null;
    btnConfirm.disabled = true;
    show(metaPanel, false);
    show(previewPanel, false);
    show(actionsPanel, false);
    show(jsonOut, false);
    show(toast, false);
  });

  btnDismissNotice.addEventListener("click", () => {
    show(adminNotice, false);
  });

  btnOpenPreview.addEventListener("click", () => {
    if (!lastPendingSnapshot || !lastPendingSnapshot.payload) return;
    const p = lastPendingSnapshot;
    const ok = applyPayload({ ...p.payload, source: "tdf" }, p.fileName, "tdf");
    if (!ok) {
      finalWarn.textContent = "El .tdf no tiene standings con top 4 reconocibles.";
      show(finalWarn, true);
      show(metaPanel, true);
    }
  });

  btnConfirm.addEventListener("click", () => {
    if (!state) return;
    const body = { ...state.payload, publishedAt: new Date().toISOString(), dryRun: true };
    jsonOut.textContent = JSON.stringify(body, null, 2);
    show(jsonOut, true);
    show(toast, true);
    toast.textContent = "Simulación OK — en producción este JSON se enviaría a tu backend.";
  });

  async function tryLiveConnect() {
    try {
      const res = await fetch("/api/health", { cache: "no-store" });
      if (!res.ok) return;
      const data = await res.json();
      liveTomDataPath = data.tomData || "";
      show(liveBanner, true);
      liveBannerText.textContent = `Watcher activo. Leyendo cambios en la raíz de: ${liveTomDataPath}`;
      modeBadge.textContent = "Modo watcher (.tdf)";
      show(adminNotice, false);
      pollLoop();
    } catch {
      modeBadge.textContent = "Modo prueba (solo HTML)";
    }
  }

  async function pollLoop() {
    for (;;) {
      await new Promise((r) => setTimeout(r, 2000));
      if (!liveTomDataPath) return;
      try {
        const res = await fetch("/api/pending", { cache: "no-store" });
        if (!res.ok) continue;
        const data = await res.json();
        const p = data.pending;
        if (!p) continue;

        const key = `${p.fileName}|${p.mtimeMs}|${p.parseError || ""}`;
        if (key === lastLiveKey) continue;
        lastLiveKey = key;

        show(adminNotice, true);
        const savedAt = formatSavedAt(p.mtimeMs);

        if (p.parseError) {
          lastPendingSnapshot = null;
          adminNoticeBody.innerHTML = `Error al leer <strong>${escapeHtml(p.fileName)}</strong>.<br><strong>Guardado en disco:</strong> ${escapeHtml(
            savedAt
          )}<br><br>${escapeHtml(p.parseError)}`;
          show(btnOpenPreview, false);

          state = null;
          btnConfirm.disabled = true;
          show(metaPanel, true);
          show(previewPanel, false);
          show(actionsPanel, false);
          metaGrid.innerHTML = "";
          const dt = document.createElement("dt");
          dt.textContent = "Error";
          const dd = document.createElement("dd");
          dd.textContent = p.parseError;
          metaGrid.appendChild(dt);
          metaGrid.appendChild(dd);
          finalWarn.textContent = `Último archivo: ${p.fileName}. Corrige el .tdf o espera a que TOM guarde de nuevo.`;
          show(finalWarn, true);
          show(metaPanel, true);
          continue;
        }

        if (!p.payload) continue;

        lastPendingSnapshot = {
          fileName: p.fileName,
          mtimeMs: p.mtimeMs,
          payload: p.payload,
        };

        const tName = p.payload.tournamentName || "—";
        const tStart = p.payload.tournamentStartDate || "—";
        adminNoticeBody.innerHTML = `Hay una actualización del torneo <strong>${escapeHtml(tName)}</strong>.<br><strong>Fecha del evento (TOM):</strong> ${escapeHtml(
          tStart
        )}<br><strong>Archivo:</strong> ${escapeHtml(p.fileName)} · <strong>Guardado en disco:</strong> ${escapeHtml(savedAt)}`;

        if (autoRefresh.checked) {
          show(btnOpenPreview, false);
          const ok = applyPayload({ ...p.payload, source: "tdf" }, p.fileName, "tdf");
          if (!ok) {
            finalWarn.textContent = "El .tdf no tiene standings con top 4 reconocibles.";
            show(finalWarn, true);
          }
        } else {
          show(btnOpenPreview, true);
        }
      } catch {
        /* ignorar cortes de red locales */
      }
    }
  }

  tryLiveConnect();
})();
