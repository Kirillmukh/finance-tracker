import { describe, it, expect, beforeAll } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const root = resolve(__dirname, '..')

describe('версия приложения на странице настроек', () => {
  let doc

  beforeAll(() => {
    const html = readFileSync(resolve(root, 'index.html'), 'utf-8')
    doc = new DOMParser().parseFromString(html, 'text/html')
  })

  it('элемент #app-version существует в единственном экземпляре', () => {
    expect(doc.querySelectorAll('#app-version').length).toBe(1)
  })

  it('находится внизу страницы настроек (#export-page)', () => {
    const version = doc.querySelector('#app-version')
    const page = doc.querySelector('#export-page')
    expect(page.contains(version)).toBe(true)
    expect(page.lastElementChild).toBe(version)
  })

  it('содержит версию в формате vX.Y.Z', () => {
    const version = doc.querySelector('#app-version')
    expect(version.textContent.trim()).toMatch(/^v\d+\.\d+\.\d+$/)
  })

  it('для #app-version есть правило в styles.css', () => {
    const css = readFileSync(resolve(root, 'styles.css'), 'utf-8')
    expect(css).toContain('#app-version {')
  })
})
