// Chart module - handles chart operations
import { RATES } from './utils.js';

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

export function updateCharts(object, type = "pie") {
  const chart = Chart.getChart("chart");
  if (chart) {
    chart.destroy();
  }
  
  new Chart(document.getElementById("chart"), {
    type: type,
    data: {
      labels: Object.keys(object),
      datasets: [
        {
          data: Object.values(object),
        },
      ],
    },
    options: {
      plugins: {
        tooltip: {
          callbacks: {
            label: function(context) {
              const label = context.label || '';
              const value = context.parsed || 0;
              
              // Calculate total for percentage, excluding hidden items
              const chart = context.chart;
              const meta = chart.getDatasetMeta(0);
              const dataset = context.dataset.data;
              
              let total = 0;
              dataset.forEach((val, index) => {
                if (!meta.data[index].hidden) {
                  total += val;
                }
              });
              
              const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
              
              return `${label}: ${value} ₽ (${percentage}%)`;
            }
          }
        },
        legend: {
          onClick: function(e, legendItem, legend) {
            const index = legendItem.index;
            const chart = legend.chart;
            const meta = chart.getDatasetMeta(0);
            const label = chart.data.labels[index];
            
            // Toggle visibility
            meta.data[index].hidden = !meta.data[index].hidden;
            
            // Update hidden categories set
            if (meta.data[index].hidden) {
              hiddenCategories.add(label);
            } else {
              hiddenCategories.delete(label);
            }
            
            chart.update();
            
            // Call the callback to update balance
            if (onLegendClickCallback) {
              onLegendClickCallback();
            }
          },
          labels: {
            generateLabels: function(chart) {
              const data = chart.data;
              if (data.labels.length && data.datasets.length) {
                const meta = chart.getDatasetMeta(0);
                return data.labels.map((label, i) => {
                  const style = meta.controller.getStyle(i);
                  return {
                    text: label,
                    fillStyle: style.backgroundColor,
                    strokeStyle: style.borderColor,
                    lineWidth: style.borderWidth,
                    hidden: meta.data[i].hidden,
                    index: i,
                    // Add strikethrough when hidden
                    fontColor: meta.data[i].hidden ? '#999' : '#666',
                    textDecoration: meta.data[i].hidden ? 'line-through' : ''
                  };
                });
              }
              return [];
            }
          }
        }
      }
    }
  });
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
}

export function updateChartForTags() {
  const barChart = Chart.getChart("chart");
  barChart.data.datasets[0].label = "Сумма транзакций по тегам";
  barChart.options = {
    scales: {
      y: {
        beginAtZero: true,
      },
    },
    plugins: {
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
}