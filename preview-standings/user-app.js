(function () {
  "use strict";

  const userSubline = document.getElementById("userSubline");
  const userEmpty = document.getElementById("userEmpty");
  const userContent = document.getElementById("userContent");
  const userTournamentName = document.getElementById("userTournamentName");
  const userEventDate = document.getElementById("userEventDate");
  const userPublishedAt = document.getElementById("userPublishedAt");
  const userCategories = document.getElementById("userCategories");

  let lastFingerprint = "";

  function show(el, on) {
    el.classList.toggle("hidden", !on);
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

  function formatIso(iso) {
    try {
      return new Date(iso).toLocaleString("es-CL", { dateStyle: "short", timeStyle: "short" });
    } catch {
      return iso || "—";
    }
  }

  function render(data) {
    if (!data) {
      show(userEmpty, true);
      show(userContent, false);
      userSubline.textContent = "Sin datos publicados todavía.";
      return;
    }

    show(userEmpty, false);
    show(userContent, true);
    userSubline.textContent = "Último torneo publicado por la tienda.";
    userTournamentName.textContent = data.tournamentName || "Torneo";
    userEventDate.textContent = data.tournamentStartDate || "—";
    userPublishedAt.textContent = data.publishedAt ? formatIso(data.publishedAt) : "—";

    const categories = categoriesForRender(data);
    userCategories.innerHTML = "";
    categories.forEach((cat) => {
      const block = document.createElement("section");
      block.className = "user-cat";
      const h = document.createElement("h3");
      h.className = "user-cat__title";
      h.textContent = cat.division;
      block.appendChild(h);

      const wrap = document.createElement("div");
      wrap.className = "table-wrap user-table-wrap";
      const table = document.createElement("table");
      table.className = "preview user-table";
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
      userCategories.appendChild(block);
    });
  }

  async function poll() {
    try {
      const res = await fetch("/api/public/results", { cache: "no-store" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      const j = await res.json();
      const fp = j.hasData && j.data ? JSON.stringify(j.data) : "";
      if (fp === lastFingerprint) return;
      lastFingerprint = fp;

      if (!j.hasData || !j.data) {
        render(null);
        return;
      }
      render(j.data);
    } catch {
      userSubline.textContent = "No se pudo conectar al servidor. Abre esta página con el servidor activo (p. ej. http://localhost:3847/user.html).";
      show(userEmpty, true);
      show(userContent, false);
    }
  }

  poll();
  setInterval(poll, 3000);
})();
