// Chart module - handles chart operations
import { RATES } from './utils.js';

const CHART_COLORS = [
  '#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f',
  '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
  '#4f46e5', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899',
  '#14b8a6', '#f97316', '#06b6d4', '#84cc16', '#e11d48',
];

let hiddenCategories = new Set();
let onLegendClickCallback = null;

export function setLegendClickCallback(callback) {
  onLegendClickCallback = callback;
}

export function getHiddenCategories() {
  return hiddenCategories;
}

export function clearHiddenCategories() {
  hiddenCategories.clear();
}

function setLegendToggleVisible(visible) {
  const btn = document.getElementById("legend-toggle");
  if (btn) btn.style.display = visible ? '' : 'none';
}

function renderCustomLegend(chart) {
  const container = document.getElementById("chart-legend");
  if (!container) return;
  setLegendToggleVisible(true);
  container.innerHTML = '';

  const labels = chart.data.labels;
  const bgColors = chart.data.datasets[0].backgroundColor;
  const meta = chart.getDatasetMeta(0);

  labels.forEach((label, i) => {
    const color = Array.isArray(bgColors) ? bgColors[i] : bgColors;
    const isHidden = meta.data[i] && meta.data[i].hidden;

    const item = document.createElement('div');
    item.className = 'legend-item' + (isHidden ? ' legend-item--hidden' : '');
    item.innerHTML = `<span class="legend-swatch" style="background:${color}"></span><span class="legend-text">${label}</span>`;
    item.addEventListener('click', () => {
      meta.data[i].hidden = !meta.data[i].hidden;
      if (meta.data[i].hidden) {
        hiddenCategories.add(label);
        item.classList.add('legend-item--hidden');
      } else {
        hiddenCategories.delete(label);
        item.classList.remove('legend-item--hidden');
      }
      chart.update();
      if (onLegendClickCallback) onLegendClickCallback();
    });
    container.appendChild(item);
  });
}

export function updateCharts(object, type = "pie") {
  const existing = Chart.getChart("chart");
  if (existing) existing.destroy();

  const labels = Object.keys(object);
  const values = Object.values(object);
  const colors = labels.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]);

  const chart = new Chart(document.getElementById("chart"), {
    type,
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors }],
    },
    options: {
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              const chart = context.chart;
              const meta = chart.getDatasetMeta(0);
              const dataset = context.dataset.data;
              let total = 0;
              dataset.forEach((val, index) => {
                if (!meta.data[index].hidden) total += val;
              });
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              return `${label}: ${value} ₽ (${percentage}%)`;
            }
          }
        }
      }
    }
  });

  renderCustomLegend(chart);
}

export function updateChartForRates(chartObject) {
  let colors = [];
  for (const key in chartObject) {
    colors.push(RATES.get(key)[1]);
    chartObject[RATES.get(key)[0]] = chartObject[key];
    delete chartObject[key];
  }
  const pieChart = Chart.getChart("chart");
  pieChart.data.labels = Object.keys(chartObject);
  pieChart.data.datasets[0].backgroundColor = colors;
  pieChart.update();
  const container = document.getElementById("chart-legend");
  if (container) container.classList.remove('legend-hidden');
  renderCustomLegend(pieChart);
  setLegendToggleVisible(false);
}

export function updateChartForTags() {
  const barChart = Chart.getChart("chart");
  barChart.data.datasets[0].label = "Сумма транзакций по тегам";
  barChart.options = {
    scales: { y: { beginAtZero: true } },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.dataset.label || '';
            const value = context.parsed.y || 0;
            return `${label}: ${value} ₽`;
          }
        }
      }
    }
  };
  barChart.update();
  setLegendToggleVisible(false);
  const container = document.getElementById("chart-legend");
  if (container) container.innerHTML = '';
}