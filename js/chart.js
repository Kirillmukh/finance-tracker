// Chart module - handles chart operations
import { RATES } from './utils.js';

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
  };
  barChart.update();
}