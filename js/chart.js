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

function updateLegendPercents(container, values, meta) {
  let total = 0;
  values.forEach((value, i) => {
    if (!(meta.data[i] && meta.data[i].hidden)) total += value;
  });
  container.querySelectorAll('.legend-percent').forEach((el, i) => {
    const isHidden = meta.data[i] && meta.data[i].hidden;
    el.textContent = isHidden || total <= 0 ? '' : `${((values[i] / total) * 100).toFixed(1)}%`;
  });
}

function renderCustomLegend(chart) {
  const container = document.getElementById("chart-legend");
  if (!container) return;
  setLegendToggleVisible(true);
  container.innerHTML = '';

  const labels = chart.data.labels;
  const values = chart.data.datasets[0].data;
  const bgColors = chart.data.datasets[0].backgroundColor;
  const meta = chart.getDatasetMeta(0);

  labels.forEach((label, i) => {
    const color = Array.isArray(bgColors) ? bgColors[i] : bgColors;
    const isHidden = meta.data[i] && meta.data[i].hidden;

    const item = document.createElement('div');
    item.className = 'legend-item' + (isHidden ? ' legend-item--hidden' : '');
    item.innerHTML = `<span class="legend-name"><span class="legend-swatch" style="background:${color}"></span><span class="legend-text">${label}</span></span><span class="legend-amount">${values[i]} ₽</span><span class="legend-percent"></span>`;
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
      updateLegendPercents(container, values, meta);
      if (onLegendClickCallback) onLegendClickCallback();
    });
    container.appendChild(item);
  });

  updateLegendPercents(container, values, meta);
}

export function updateCharts(object, type = "pie") {
  const existing = Chart.getChart("chart");
  if (existing) existing.destroy();

  const entries = Object.entries(object).sort((a, b) => b[1] - a[1]);
  const labels = entries.map(([label]) => label);
  const values = entries.map(([, value]) => value);
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
  const entries = Object.entries(chartObject).sort((a, b) => b[1] - a[1]);
  const pieChart = Chart.getChart("chart");
  pieChart.data.labels = entries.map(([key]) => RATES.get(key)[0]);
  pieChart.data.datasets[0].data = entries.map(([, value]) => value);
  pieChart.data.datasets[0].backgroundColor = entries.map(([key]) => RATES.get(key)[1]);
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