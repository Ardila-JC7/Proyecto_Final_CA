(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);
  const state = { chart: null, lastPayload: null, busy: false };
  const numberFormat = new Intl.NumberFormat("es-CO", { maximumFractionDigits: 2 });
  const dateTimeFormat = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", day: "2-digit", month: "short",
    hour: "2-digit", minute: "2-digit", hour12: true
  });
  const timeFormat = new Intl.DateTimeFormat("es-CO", {
    timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit", hour12: true
  });

  function fmt(value) {
    const n = Number(value);
    return Number.isFinite(n) ? numberFormat.format(n) : "—";
  }
  function localDate(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "Fecha no disponible" : dateTimeFormat.format(d);
  }
  function localTime(value) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : timeFormat.format(d);
  }
  function setConnection(ok, text) {
    $("connectionPill").classList.toggle("offline", !ok);
    $("connectionText").textContent = text;
  }
  function showError(message) {
    $("errorMessage").textContent = message || "Ocurrió un error inesperado.";
    $("errorBox").classList.remove("hidden");
  }
  function hideError() {
    $("errorBox").classList.add("hidden");
  }
  function setBusy(busy) {
    state.busy = busy;
    $("applyButton").disabled = busy;
    $("refreshButton").disabled = busy;
    $("chartLoading").classList.toggle("hidden", !busy);
  }
  async function getJSON(url) {
    const response = await fetch(url, { headers: { "Accept": "application/json" } });
    let body;
    try { body = await response.json(); }
    catch (_) { throw new Error(`La API respondió con un formato no válido (HTTP ${response.status}).`); }
    if (!response.ok) {
      const detail = typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail || body);
      throw new Error(detail || `Error HTTP ${response.status}`);
    }
    return body;
  }

  function renderChart(payload) {
    if (typeof Chart === "undefined") {
      throw new Error("No se pudo cargar Chart.js. Comprueba la conexión a Internet y recarga la página.");
    }
    const history = Array.isArray(payload.historico) ? payload.historico : [];
    const forecast = Array.isArray(payload.prediccion) ? payload.prediccion : [];
    const all = [...history, ...forecast];
    const labels = all.map(point => point.tiempo);
    const historyValues = [...history.map(p => Number(p.valor)), ...forecast.map(() => null)];
    const lowerValues = [...history.map(() => null), ...forecast.map(p => Number(p.limite_inferior))];
    const upperValues = [...history.map(() => null), ...forecast.map(p => Number(p.limite_superior))];
    const forecastValues = [...history.map(() => null), ...forecast.map(p => Number(p.prediccion))];

    const ctx = $("forecastChart").getContext("2d");
    if (state.chart) state.chart.destroy();
    state.chart = new Chart(ctx, {
      type: "line",
      data: {
        labels,
        datasets: [
          {
            label: "Histórico",
            data: historyValues,
            borderColor: "#3978e8",
            backgroundColor: "#3978e8",
            borderWidth: 2.2,
            pointRadius: 0,
            pointHoverRadius: 4,
            tension: .28,
            spanGaps: false
          },
          {
            label: "Límite inferior",
            data: lowerValues,
            borderColor: "rgba(23,167,122,0)",
            backgroundColor: "rgba(23,167,122,0)",
            pointRadius: 0,
            borderWidth: 0,
            fill: false
          },
          {
            label: "Intervalo de confianza",
            data: upperValues,
            borderColor: "rgba(23,167,122,.18)",
            backgroundColor: "rgba(23,167,122,.13)",
            pointRadius: 0,
            borderWidth: 1,
            fill: "-1"
          },
          {
            label: "Pronóstico SARIMA",
            data: forecastValues,
            borderColor: "#16a77a",
            backgroundColor: "#16a77a",
            borderWidth: 2.5,
            borderDash: [6, 4],
            pointRadius: 2.5,
            pointHoverRadius: 5,
            tension: .25,
            spanGaps: false
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: "index", intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            backgroundColor: "#152238",
            padding: 11,
            titleFont: { family: "DM Sans", size: 10 },
            bodyFont: { family: "DM Sans", size: 10 },
            callbacks: {
              title: items => items.length ? localDate(items[0].label) : "",
              label: item => item.raw === null || item.raw === undefined
                ? null : `${item.dataset.label}: ${fmt(item.raw)}`
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            border: { display: false },
            ticks: {
              color: "#98a4b4", maxTicksLimit: 8, maxRotation: 0,
              font: { family: "DM Sans", size: 9 },
              callback: function(value) { return localTime(this.getLabelForValue(value)); }
            }
          },
          y: {
            grid: { color: "#eef1f5", drawTicks: false },
            border: { display: false, dash: [3, 4] },
            ticks: { color: "#98a4b4", padding: 9, font: { family: "DM Sans", size: 9 } }
          }
        }
      }
    });
  }

  function renderForecastTable(forecast) {
    const rows = $("forecastRows");
    rows.replaceChildren();
    if (!forecast.length) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 2; td.className = "empty-cell"; td.textContent = "La API no devolvió pronósticos.";
      tr.appendChild(td); rows.appendChild(tr); return;
    }
    forecast.slice(0, 12).forEach(item => {
      const tr = document.createElement("tr");
      const time = document.createElement("td");
      const value = document.createElement("td");
      time.textContent = localTime(item.tiempo);
      value.textContent = fmt(item.prediccion);
      tr.append(time, value); rows.appendChild(tr);
    });
  }

  function renderMetrics(payload) {
    const history = payload.historico || [];
    const forecast = payload.prediccion || [];
    const latest = history.length ? history[history.length - 1] : null;
    const next = forecast.length ? forecast[0] : null;
    const max = forecast.reduce((best, item) =>
      !best || Number(item.prediccion) > Number(best.prediccion) ? item : best, null);

    $("lastValue").textContent = latest ? fmt(latest.valor) : "—";
    $("lastTime").textContent = latest ? localDate(latest.tiempo) : "Sin histórico";
    $("nextValue").textContent = next ? fmt(next.prediccion) : "—";
    $("maxValue").textContent = max ? fmt(max.prediccion) : "—";
    $("maxTime").textContent = max ? localDate(max.tiempo) : "—";
    $("filledHours").textContent = Number(payload.horas_rellenadas ?? 0).toLocaleString("es-CO");
    $("contextHours").textContent = `Contexto: ${payload.horas_contexto_usadas ?? "—"} h`;
    $("confidenceLabel").textContent = `${Math.round(Number(payload.confianza) * 100)} %`;
    $("forecastCount").textContent = `${forecast.length} h`;
    $("lastUpdated").textContent = `Actualizado: ${new Intl.DateTimeFormat("es-CO", { timeZone: "America/Bogota", hour: "2-digit", minute: "2-digit" }).format(new Date())}`;
  }

  function renderModel(model) {
    const order = model.order || [];
    const seasonal = model.seasonal_order || [];
    $("modelOrder").textContent = order.length ? `(${order.join(", ")})` : "No disponible";
    $("seasonalOrder").textContent = seasonal.length ? `(${seasonal.join(", ")})` : "No disponible";
    $("observations").textContent = model.n_observaciones != null ? Number(model.n_observaciones).toLocaleString("es-CO") : "—";
    const metrics = model.metricas_test || {};
    $("modelMae").textContent = metrics.MAE != null ? fmt(metrics.MAE) : "—";
    $("modelRmse").textContent = metrics.RMSE != null ? fmt(metrics.RMSE) : "—";
    $("modelMape").textContent = metrics["MAPE_%"] != null ? `${fmt(metrics["MAPE_%"])} %` : "—";
    $("seriesName").textContent = `${model.measurement || "—"} / ${model.field || "—"}`;
    $("trainedAt").textContent = model.entrenado_en ? `${model.entrenado_en} UTC` : "No disponible";
    $("modelStatus").innerHTML = "<i></i> Modelo cargado";
  }

  async function loadDashboard() {
    if (state.busy) return;
    setBusy(true);
    hideError();
    try {
      const hours = Number($("hoursSelect").value);
      const history = Number($("historySelect").value);
      const confidence = Number($("confidenceSelect").value);
      const query = new URLSearchParams({
        horas: String(hours), historia: String(history), confianza: String(confidence)
      });
      const [payload, health, model] = await Promise.all([
        getJSON(`/api/prediccion?${query.toString()}`),
        getJSON("/api/salud"),
        getJSON("/api/modelo")
      ]);

      if (health.modelo_demo) {
        setConnection(true, "Servicio activo · DEMO");
      } else if (health.influx_configurado && health.modelo_cargado) {
        setConnection(true, "Servicio conectado");
      } else {
        setConnection(false, "Configuración incompleta");
      }
      if (!health.modelo_cargado) throw new Error("La API no tiene un modelo SARIMA cargado.");
      if (health.modelo_demo) {
        showError("La API está utilizando el modelo DEMO. Para la entrega, reemplázalo por tu sarima_config.json real.");
      }

      state.lastPayload = payload;
      renderChart(payload);
      renderMetrics(payload);
      renderForecastTable(payload.prediccion || []);
      renderModel(model);
    } catch (error) {
      setConnection(false, "No se pudo conectar");
      $("modelStatus").innerHTML = "<i style='background:#e05252'></i> No disponible";
      showError(error.message);
    } finally {
      setBusy(false);
    }
  }

  $("applyButton").addEventListener("click", loadDashboard);
  $("refreshButton").addEventListener("click", loadDashboard);
  $("closeError").addEventListener("click", hideError);
  $("hoursSelect").addEventListener("change", loadDashboard);
  $("historySelect").addEventListener("change", loadDashboard);
  $("confidenceSelect").addEventListener("change", loadDashboard);
  loadDashboard();
})();