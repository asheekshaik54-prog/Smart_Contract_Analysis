import '@testing-library/jest-dom/vitest'
class IO { observe() {} unobserve() {} disconnect() {} takeRecords() { return [] } }
class RO { observe() {} unobserve() {} disconnect() {} }
;(globalThis as any).IntersectionObserver ??= IO
;(globalThis as any).ResizeObserver ??= RO
window.matchMedia ??= ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as any
window.scrollTo = (() => {}) as any
