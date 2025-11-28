const API_BASE = "https://api.thatstockpredictor.com";

const tickerInput = document.getElementById("ticker");
const runBtn = document.getElementById("run-btn");
const metricsPre = document.getElementById("metrics");
const payloadPre = document.getElementById("payload");

runBtn.addEventListener("click", runPrediction);

async function runPrediction() {
  const ticker = (tickerInput.value || "AAPL").trim().toUpperCase();
  if (!ticker) return;

  const modelRadio = document.querySelector('input[name="model"]:checked');
  const model = modelRadio ? modelRadio.value : "xgb";

  runBtn.disabled = true;
  runBtn.textContent = "Running...";

  try {
    const url = `${API_BASE}/api/predict?ticker=${encodeURIComponent(
      ticker
    )}&model=${encodeURIComponent(model)}`;

    const resp = await fetch(url);
    if (!resp.ok) {
      const txt = await resp.text();
      throw new Error(`Backend error: ${resp.status} ${txt}`);
    }

    const payload = await resp.json();

    const met = payload.metrics || {};
    const lines = [
      `Ticker: ${payload.ticker || ""}`,
      `Model: ${payload.model || ""}`,
      "",
      ...Object.entries(met).map(([k, v]) =>
        typeof v === "number" ? `${k}: ${v.toFixed(4)}` : `${k}: ${v}`
      ),
    ];
    metricsPre.textContent = lines.join("\n");

    payloadPre.textContent = JSON.stringify(payload, null, 2);

    const hist = payload.history || [];
    const preds = payload.predictions_next5 || payload.predictions || [];
    const signals = payload.signals || [];
    const nextSignal = payload.next_signal || null;

    renderCandles(hist, preds, signals, nextSignal);
  } catch (err) {
    console.error(err);
    metricsPre.textContent = String(err);
    payloadPre.textContent = "";
    Plotly.newPlot("chart", [], { title: "Error" });
  } finally {
    runBtn.disabled = false;
    runBtn.textContent = "Run Prediction";
  }
}

function renderCandles(history, preds, signals, nextSignal) {
  const histArr = Array.isArray(history) ? history : [];
  const predArr = Array.isArray(preds) ? preds : [];

  if (!histArr.length) {
    Plotly.newPlot("chart", [], { title: "No data" });
    return;
  }

  const histDates = histArr.map((c) => c.date || c.datetime || c.time);
  const histOpen = histArr.map((c) => c.open);
  const histHigh = histArr.map((c) => c.high);
  const histLow = histArr.map((c) => c.low);
  const histClose = histArr.map((c) => c.close);

  const predDates = predArr.map((c) => c.date || c.datetime || c.time);
  const predOpen = predArr.map((c) => c.open);
  const predHigh = predArr.map((c) => c.high);
  const predLow = predArr.map((c) => c.low);
  const predClose = predArr.map((c) => c.close);

  const traces = [];

  // Historical
  traces.push({
    x: histDates,
    open: histOpen,
    high: histHigh,
    low: histLow,
    close: histClose,
    type: "candlestick",
    name: "History",
  });

  // Predicted 5 bars
  if (predDates.length) {
    traces.push({
      x: predDates,
      open: predOpen,
      high: predHigh,
      low: predLow,
      close: predClose,
      type: "candlestick",
      name: "Predicted Next 5",
      increasing: { line: { color: "green" } },
      decreasing: { line: { color: "red" } },
    });
  }

  // Historical signals (classifier backtest arrows)
  if (Array.isArray(signals) && signals.length) {
    const buyX = [];
    const buyY = [];
    const sellX = [];
    const sellY = [];

    for (const s of signals) {
      if (!s || !s.date) continue;
      const price = s.price ?? null;
      if (s.side === "buy") {
        buyX.push(s.date);
        buyY.push(price);
      } else if (s.side === "sell") {
        sellX.push(s.date);
        sellY.push(price);
      }
    }

    if (buyX.length) {
      traces.push({
        x: buyX,
        y: buyY,
        mode: "markers",
        name: "Historical BUY",
        marker: {
          symbol: "triangle-up",
          size: 12,
          color: "green",
          line: { width: 1, color: "black" },
        },
        hovertemplate: "Historical BUY<br>%{x}<br>%{y}<extra></extra>",
      });
    }

    if (sellX.length) {
      traces.push({
        x: sellX,
        y: sellY,
        mode: "markers",
        name: "Historical SELL",
        marker: {
          symbol: "triangle-down",
          size: 12,
          color: "red",
          line: { width: 1, color: "black" },
        },
        hovertemplate: "Historical SELL<br>%{x}<br>%{y}<extra></extra>",
      });
    }
  }

  // ----- NEXT-DAY PREDICTED ARROW -----
  if (nextSignal) {
    const ns = nextSignal;
    const isBuy = ns.side === "buy";
    const probText =
      typeof ns.prob === "number"
        ? `<br>Confidence: ${(ns.prob * 100).toFixed(1)}%`
        : "";

    traces.push({
      x: [ns.date],
      y: [ns.price],
      mode: "markers",
      name: "Next-Day Signal",
      marker: {
        symbol: isBuy ? "triangle-up" : "triangle-down",
        size: 14,
        color: isBuy ? "limegreen" : "red",
        line: { width: 1, color: "black" },
      },
      hovertemplate:
        (isBuy ? "Predicted BUY" : "Predicted SELL") +
        probText +
        "<br>%{x}<br>%{y}<extra></extra>",
    });
  }

  const layout = {
    dragmode: "zoom",
    showlegend: true,
    legend: { x: 0, y: 1.1, orientation: "h" },
    margin: { t: 40, r: 10, b: 40, l: 50 },
    xaxis: { rangeslider: { visible: false } },
  };

  Plotly.newPlot("chart", traces, layout, { responsive: true });
}
