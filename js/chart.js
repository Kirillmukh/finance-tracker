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
let onSliceClickCallback = null;

export function setLegendClickCallback(callback) {
  onLegendClickCallback = callback;
}

export function setSliceClickCallback(callback) {
  onSliceClickCallback = callback;
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

  const labels = [...chart.data.labels];
  // Keep the original values: bar charts temporarily replace hidden values
  // with a compact list so hidden columns leave no gaps.
  const values = [...chart.data.datasets[0].data];
  const rawBgColors = chart.data.datasets[0].backgroundColor;
  const bgColors = Array.isArray(rawBgColors) ? [...rawBgColors] : rawBgColors;
  const meta = chart.getDatasetMeta(0);

  labels.forEach((label, i) => {
    const color = Array.isArray(bgColors) ? bgColors[i] : bgColors;
    const isHidden = meta.data[i] && meta.data[i].hidden;

    const item = document.createElement('div');
    item.className = 'legend-item' + (isHidden ? ' legend-item--hidden' : '');
    item.innerHTML = `<span class="legend-name"><span class="legend-swatch" style="background:${color}"></span><span class="legend-text">${label}</span></span><span class="legend-amount">${values[i]} ₽</span><span class="legend-percent"></span>`;
    item.addEventListener('click', () => {
      if (chart.$financeChartType === 'bar') {
        const willHide = !hiddenCategories.has(label);
        if (willHide) {
          hiddenCategories.add(label);
          item.classList.add('legend-item--hidden');
        } else {
          hiddenCategories.delete(label);
          item.classList.remove('legend-item--hidden');
        }

        const visibleIndexes = labels
          .map((currentLabel, index) => ({ currentLabel, index }))
          .filter(({ currentLabel }) => !hiddenCategories.has(currentLabel));
        chart.data.labels = visibleIndexes.map(({ currentLabel }) => currentLabel);
        chart.data.datasets[0].data = visibleIndexes.map(({ index }) => values[index]);
        if (Array.isArray(bgColors)) {
          chart.data.datasets[0].backgroundColor = visibleIndexes.map(({ index }) => bgColors[index]);
        }
        chart.update();

        const total = visibleIndexes.reduce((sum, { index }) => sum + values[index], 0);
        container.querySelectorAll('.legend-percent').forEach((el, index) => {
          el.textContent = hiddenCategories.has(labels[index]) || total <= 0
            ? ''
            : `${((values[index] / total) * 100).toFixed(1)}%`;
        });
        if (onLegendClickCallback) onLegendClickCallback();
        return;
      }

      if (typeof chart.toggleDataVisibility === 'function') {
        chart.toggleDataVisibility(i);
        meta.data[i].hidden = typeof chart.getDataVisibility === 'function'
          ? !chart.getDataVisibility(i)
          : !meta.data[i].hidden;
      } else {
        meta.data[i].hidden = !meta.data[i].hidden;
      }
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
      onClick: (event, elements, clickedChart) => {
        if (!onSliceClickCallback) return;
        // Click past the slices reports null so the caller can clear its filter
        onSliceClickCallback(elements.length > 0 ? clickedChart.data.labels[elements[0].index] : null);
      },
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
  chart.$financeChartType = type;

  renderCustomLegend(chart);
  const toggle = document.getElementById("legend-toggle");
  if (toggle) toggle.textContent = "Категории ▾";
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
    onClick: (event, elements, clickedChart) => {
      if (!onSliceClickCallback) return;
      onSliceClickCallback(elements.length > 0 ? clickedChart.data.labels[elements[0].index] : null);
    },
    scales: {
      x: { ticks: { display: false } },
      y: { beginAtZero: true },
    },
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
  const container = document.getElementById("chart-legend");
  if (container) container.classList.add('legend-hidden');
  renderCustomLegend(barChart);
  const toggle = document.getElementById("legend-toggle");
  if (toggle) toggle.textContent = "Теги ▾";
}
