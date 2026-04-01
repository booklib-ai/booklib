# Web Performance Checklist

## Core Web Vitals

### Largest Contentful Paint (LCP) -- Target: <= 2.5s

- [ ] The largest above-the-fold element (hero image, heading) loads within 2.5 seconds
- [ ] LCP resources are discovered early -- no lazy-loading the LCP image
- [ ] LCP images use `fetchpriority="high"` and are preloaded if not in initial HTML

### Interaction to Next Paint (INP) -- Target: <= 200ms

- [ ] All user interactions (click, tap, keypress) produce visual feedback within 200ms
- [ ] Long tasks on the main thread are broken into chunks under 50ms
- [ ] Input handlers do not perform synchronous layout reads followed by writes (forced reflow)

### Cumulative Layout Shift (CLS) -- Target: <= 0.1

- [ ] Images and embeds have explicit width and height attributes or CSS aspect-ratio
- [ ] Web fonts do not cause layout shift on load (use font-display: swap with size-adjust)
- [ ] Dynamically injected content (ads, banners, notifications) reserves space before loading

## RAIL Model

### Response (< 100ms)

- [ ] User input is acknowledged within 100ms -- use optimistic UI for slow backend operations
- [ ] Touch and click handlers complete synchronous work in under 100ms

### Animation (< 10ms per frame)

- [ ] Animations use compositor-only properties (transform, opacity) to avoid layout and paint
- [ ] Scroll-linked effects use Intersection Observer or scroll-driven animations, not scroll event listeners
- [ ] requestAnimationFrame is used for JS-driven animations, not setTimeout or setInterval

### Idle (50ms chunks)

- [ ] Non-critical work is deferred to idle periods using requestIdleCallback or scheduler.yield()
- [ ] Analytics, prefetching, and non-essential initialization run after the page is interactive

### Load (< 1s first paint)

- [ ] First Contentful Paint occurs within 1 second on a median mobile connection
- [ ] Critical rendering path is minimized -- inline critical CSS, defer non-critical JS

## Loading

- [ ] Text assets (HTML, CSS, JS) are compressed with Brotli (preferred) or gzip
- [ ] Code splitting is implemented -- only the code needed for the current route is loaded
- [ ] A CDN serves static assets from edge locations close to users
- [ ] HTTP/2 or HTTP/3 is enabled for multiplexed asset loading
- [ ] Render-blocking resources are eliminated or minimized

## Images

- [ ] Images use modern formats: WebP (broad support) or AVIF (best compression)
- [ ] Responsive images use `srcset` and `sizes` to serve appropriate resolutions
- [ ] Below-the-fold images are lazy-loaded with `loading="lazy"`
- [ ] Image dimensions are specified to prevent layout shift
- [ ] Decorative images are CSS backgrounds, not `<img>` elements

## JavaScript

- [ ] Main thread work is minimized -- heavy computation uses Web Workers
- [ ] Third-party scripts are loaded with `async` or `defer` and audited for size
- [ ] Unused JavaScript is identified and removed (tree-shaking, dead code elimination)
- [ ] Bundle size is monitored in CI with a budget (e.g., max 200KB compressed JS)

## CSS

- [ ] Critical CSS for above-the-fold content is inlined in the `<head>`
- [ ] Non-critical CSS is loaded asynchronously
- [ ] CSS `contain` property is used on complex components to limit layout and paint scope
- [ ] Unused CSS is removed or split per route

## Fonts

- [ ] `font-display: swap` (or optional) prevents invisible text during font loading
- [ ] Web fonts are preloaded with `<link rel="preload" as="font" crossorigin>`
- [ ] Font files are subsetted to include only the characters needed (Latin, extended Latin)
- [ ] Variable fonts are used instead of multiple weight/style files where supported
- [ ] Self-hosted fonts avoid third-party DNS lookup and connection overhead

## Caching

- [ ] Static assets use long-lived `Cache-Control` headers with content-hash filenames for cache busting
- [ ] HTML pages use short cache times or `no-cache` with ETag validation
- [ ] A service worker caches critical assets for offline and instant repeat visits
- [ ] API responses use appropriate caching: `stale-while-revalidate` for non-critical data
