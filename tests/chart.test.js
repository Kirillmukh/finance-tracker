import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  setLegendClickCallback,
  setSliceClickCallback,
  getHiddenCategories,
  clearHiddenCategories,
  updateCharts,
  updateChartForRates,
  updateChartForTags,
} from '../js/chart.js'

// Мок Chart.js (загружается как глобальная переменная через CDN)
let mockChartInstance

function setupChartMock(existingChart = null) {
  const dataVisibility = [true, true]
  mockChartInstance = {
    destroy: vi.fn(),
    update: vi.fn(),
    data: {
      labels: ['Food', 'Transport'],
      datasets: [{ data: [100, 50], backgroundColor: [], label: '' }],
    },
    options: {},
    toggleDataVisibility: vi.fn((i) => { dataVisibility[i] = !dataVisibility[i] }),
    getDataVisibility: vi.fn((i) => dataVisibility[i]),
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

  document.body.innerHTML = '<canvas id="chart"></canvas><div id="chart-legend"></div>'
}

beforeEach(() => {
  clearHiddenCategories()
  setLegendClickCallback(null)
  setSliceClickCallback(null)
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
    updateCharts({ Food: 100 }, 'pie')

    const legendItem = document.querySelector('.legend-item')
    legendItem.click()

    expect(cb).toHaveBeenCalled()
  })
})

describe('setSliceClickCallback — клик по сегменту графика', () => {
  function getOnClick() {
    updateCharts({ Food: 100, Transport: 50 })
    return global.Chart.mock.calls[0][1].options.onClick
  }

  it('передаёт label кликнутого сегмента в callback', () => {
    const cb = vi.fn()
    setSliceClickCallback(cb)
    const onClick = getOnClick()
    const chart = { data: { labels: ['Food', 'Transport'] } }
    onClick({}, [{ index: 1 }], chart)
    expect(cb).toHaveBeenCalledWith('Transport')
  })

  it('передаёт null при клике мимо сегментов', () => {
    const cb = vi.fn()
    setSliceClickCallback(cb)
    const onClick = getOnClick()
    onClick({}, [], { data: { labels: ['Food', 'Transport'] } })
    expect(cb).toHaveBeenCalledWith(null)
  })

  it('не падает если callback не установлен', () => {
    const onClick = getOnClick()
    expect(() => onClick({}, [{ index: 0 }], { data: { labels: ['Food'] } })).not.toThrow()
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

  it('сортирует данные по убыванию суммы', () => {
    updateCharts({ Transport: 50, Food: 100, Cafe: 75 })
    const config = global.Chart.mock.calls[0][1]
    expect(config.data.labels).toEqual(['Food', 'Cafe', 'Transport'])
    expect(config.data.datasets[0].data).toEqual([100, 75, 50])
  })

  it('легенда рендерит название, сумму и процент', () => {
    updateCharts({ Food: 100, Transport: 50 })
    const items = document.querySelectorAll('.legend-item')
    expect(items.length).toBe(2)
    expect(items[0].querySelector('.legend-text').textContent).toBe('Food')
    expect(items[0].querySelector('.legend-amount').textContent).toBe('100 ₽')
    expect(items[0].querySelector('.legend-percent').textContent).toBe('66.7%')
    expect(items[1].querySelector('.legend-percent').textContent).toBe('33.3%')
  })

  it('пересчитывает проценты при скрытии категории', () => {
    updateCharts({ Food: 100, Transport: 50 })
    const items = document.querySelectorAll('.legend-item')
    items[0].click() // скрыть Food

    expect(items[0].querySelector('.legend-percent').textContent).toBe('')
    expect(items[1].querySelector('.legend-percent').textContent).toBe('100.0%')
  })

  it('уничтожает существующий чарт перед созданием нового', () => {
    const existing = { destroy: vi.fn() }
    global.Chart.getChart = vi.fn(() => existing)
    updateCharts({ Food: 100 })
    expect(existing.destroy).toHaveBeenCalled()
  })

  it('легенда добавляет категорию в hiddenCategories при скрытии', () => {
    updateCharts({ Food: 100, Transport: 50 })

    const legendItem = document.querySelector('.legend-item')
    legendItem.click()

    expect(getHiddenCategories().has('Food')).toBe(true)
  })

  it('переключает видимость данных через Chart.js для пересчёта масштаба', () => {
    updateCharts({ Food: 100, Transport: 50 })
    document.querySelector('.legend-item').click()
    expect(mockChartInstance.toggleDataVisibility).toHaveBeenCalledWith(0)
    expect(mockChartInstance.update).toHaveBeenCalled()
  })

  it('удаляет скрытый столбец без пустого места и восстанавливает его', () => {
    updateCharts({ large: 1000, small: 10 }, 'bar')
    const item = document.querySelector('.legend-item')
    item.click()
    expect(mockChartInstance.data.labels).toEqual(['Transport'])
    expect(mockChartInstance.data.datasets[0].data).toEqual([50])
    item.click()
    expect(mockChartInstance.data.labels).toEqual(['Food', 'Transport'])
    expect(mockChartInstance.data.datasets[0].data).toEqual([100, 50])
  })

  it('легенда удаляет категорию из hiddenCategories при показе', () => {
    updateCharts({ Food: 100 })

    const legendItem = document.querySelector('.legend-item')
    legendItem.click()
    legendItem.click()

    expect(getHiddenCategories().has('Food')).toBe(false)
  })
})

describe('updateChartForRates', () => {
  it('заменяет технические ключи rate на читаемые метки', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    const chartObj = { waste: 100, ok: 200, good: 50 }
    updateChartForRates(chartObj)
    expect(mockChartInstance.data.labels).toContain('Плохая')
    expect(mockChartInstance.data.labels).toContain('Ок')
    expect(mockChartInstance.data.labels).toContain('Осознанная')
  })

  it('устанавливает цвета соответствующие рейтингу', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    const chartObj = { waste: 100 }
    updateChartForRates(chartObj)
    expect(mockChartInstance.data.datasets[0].backgroundColor).toContain('#f43f5e')
  })

  it('сортирует дольки по убыванию суммы', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    updateChartForRates({ waste: 100, ok: 200, good: 50 })
    expect(mockChartInstance.data.labels).toEqual(['Ок', 'Плохая', 'Осознанная'])
    expect(mockChartInstance.data.datasets[0].data).toEqual([200, 100, 50])
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

  it('скрывает названия тегов на оси X', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    updateChartForTags()
    expect(mockChartInstance.options.scales.x.ticks.display).toBe(false)
  })

  it('вызывает chart.update()', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    updateChartForTags()
    expect(mockChartInstance.update).toHaveBeenCalled()
  })

  it('рендерит список тегов с суммами и процентами', () => {
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    updateChartForTags()
    const items = document.querySelectorAll('.legend-item')
    expect(items).toHaveLength(2)
    expect(items[0].querySelector('.legend-text').textContent).toBe('Food')
    expect(items[0].querySelector('.legend-amount').textContent).toBe('100 ₽')
    expect(items[0].querySelector('.legend-percent').textContent).toBe('66.7%')
  })

  it('передаёт кликнутый тег в callback', () => {
    const cb = vi.fn()
    setSliceClickCallback(cb)
    global.Chart.getChart = vi.fn(() => mockChartInstance)
    updateChartForTags()
    mockChartInstance.options.onClick({}, [{ index: 1 }], mockChartInstance)
    expect(cb).toHaveBeenCalledWith('Transport')
  })
})
