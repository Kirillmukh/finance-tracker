import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  setLegendClickCallback,
  getHiddenCategories,
  clearHiddenCategories,
  updateCharts,
  updateChartForRates,
  updateChartForTags,
} from '../js/chart.js'

// Мок Chart.js (загружается как глобальная переменная через CDN)
let mockChartInstance

function setupChartMock(existingChart = null) {
  mockChartInstance = {
    destroy: vi.fn(),
    update: vi.fn(),
    data: {
      labels: ['Food', 'Transport'],
      datasets: [{ data: [100, 50], backgroundColor: [], label: '' }],
    },
    options: {},
    getDatasetMeta: vi.fn(() => ({
      data: [{ hidden: false }, { hidden: false }],
      controller: {
        getStyle: vi.fn(() => ({
          backgroundColor: '#fff',
          borderColor: '#000',
          borderWidth: 1,
        })),
      },
    })),
  }

  global.Chart = vi.fn(() => mockChartInstance)
  global.Chart.getChart = vi.fn(() => existingChart)

  document.body.innerHTML = '<canvas id="chart"></canvas>'
}

beforeEach(() => {
  clearHiddenCategories()
  setLegendClickCallback(null)
  setupChartMock()
})

describe('getHiddenCategories / clearHiddenCategories', () => {
  it('изначально возвращает пустой Set', () => {
    expect(getHiddenCategories().size).toBe(0)
  })

  it('clearHiddenCategories очищает Set', () => {
    const hidden = getHiddenCategories()
    hidden.add('Food')
    expect(hidden.size).toBe(1)
    clearHiddenCategories()
    expect(getHiddenCategories().size).toBe(0)
  })
})

describe('setLegendClickCallback', () => {
  it('сохраняет и вызывает callback', () => {
    const cb = vi.fn()
    setLegendClickCallback(cb)

    // Имитируем вызов legend onClick из Chart.js
    const legendOnClick = global.Chart.mock.calls.length === 0
      ? null
      : global.Chart.mock.calls[0]?.[1]?.options?.plugins?.legend?.onClick

    // Если updateCharts ещё не вызван, убедимся что callback записан
    // Проверяем через updateCharts
    updateCharts({ Food: 100 }, 'pie')
    const chartConfig = global.Chart.mock.calls[0][1]
    const legendClick = chartConfig.options.plugins.legend.onClick

    const mockLegendItem = { index: 0 }
    const mockLegend = {
      chart: {
        data: { labels: ['Food'] },
        getDatasetMeta: vi.fn(() => ({
          data: [{ hidden: false }],
        })),
        update: vi.fn(),
      },
    }
    legendClick.call(null, null, mockLegendItem, mockLegend)
    expect(cb).toHaveBeenCalled()
  })
})

describe('updateCharts', () => {
  it('создаёт pie-чарт по умолчанию', () => {
    updateCharts({ Food: 100, Transport: 50 })
    expect(global.Chart).toHaveBeenCalledOnce()
    const config = global.Chart.mock.calls[0][1]
    expect(config.type).toBe('pie')
  })

  it('создаёт bar-чарт при type="bar"', () => {
    updateCharts({ lunch: 200 }, 'bar')
    const config = global.Chart.mock.calls[0][1]
    expect(config.type).toBe('bar')
  })

  it('использует ключи объекта как labels', () => {
    updateCharts({ Food: 100, Transport: 50 })
    const config = global.Chart.mock.calls[0][1]
    expect(config.data.labels).toEqual(['Food', 'Transport'])
  })

  it('уничтожает существующий чарт перед созданием нового', () => {
    const existing = { destroy: vi.fn() }
    global.Chart.getChart = vi.fn(() => existing)
    updateCharts({ Food: 100 })
    expect(existing.destroy).toHaveBeenCalled()
  })

  it('легенда добавляет категорию в hiddenCategories при скрытии', () => {
    updateCharts({ Food: 100, Transport: 50 })
    const config = global.Chart.mock.calls[0][1]
    const legendClick = config.options.plugins.legend.onClick

    const mockChart = {
      data: { labels: ['Food', 'Transport'] },
      getDatasetMeta: vi.fn(() => ({
        data: [{ hidden: false }, { hidden: false }],
      })),
      update: vi.fn(),
    }
    legendClick.call(null, null, { index: 0 }, { chart: mockChart })

    expect(getHiddenCategories().has('Food')).toBe(true)
  })

  it('легенда удаляет категорию из hiddenCategories при показе', () => {
    updateCharts({ Food: 100 })
    const config = global.Chart.mock.calls[0][1]
    const legendClick = config.options.plugins.legend.onClick

    const meta = { data: [{ hidden: true }] }
    const mockChart = {
      data: { labels: ['Food'] },
      getDatasetMeta: vi.fn(() => meta),
      update: vi.fn(),
    }

    // Сначала скрываем
    getHiddenCategories().add('Food')
    // Потом показываем (hidden было true, переключается в false)
    legendClick.call(null, null, { index: 0 }, { chart: mockChart })

    expect(getHiddenCategories().has('Food')).toBe(false)
  })
})

describe('updateChartForRates', () => {
  it('заменяет технические ключи rate на читаемые метки', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    const chartObj = { waste: 100, ok: 200, good: 50 }
    updateChartForRates(chartObj)
    expect(mockChartInstance.data.labels).toContain('плохая')
    expect(mockChartInstance.data.labels).toContain('ок')
    expect(mockChartInstance.data.labels).toContain('осознанная')
  })

  it('устанавливает цвета соответствующие рейтингу', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    const chartObj = { waste: 100 }
    updateChartForRates(chartObj)
    expect(mockChartInstance.data.datasets[0].backgroundColor).toContain('#f54242')
  })

  it('вызывает chart.update()', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    updateChartForRates({ ok: 100 })
    expect(mockChartInstance.update).toHaveBeenCalled()
  })
})

describe('updateChartForTags', () => {
  it('устанавливает label для datasets', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    updateChartForTags()
    expect(mockChartInstance.data.datasets[0].label).toBe('Сумма транзакций по тегам')
  })

  it('устанавливает options с scales.y.beginAtZero', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    updateChartForTags()
    expect(mockChartInstance.options.scales.y.beginAtZero).toBe(true)
  })

  it('вызывает chart.update()', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    updateChartForTags()
    expect(mockChartInstance.update).toHaveBeenCalled()
  })
})
