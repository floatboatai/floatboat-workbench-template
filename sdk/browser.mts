// ABOUTME: 页面直接连接本地工作台；宿主主题仅用于未自行声明明暗方案的页面。
export { createWorkbenchAsrClient } from './browser-asr.mjs';
export interface WorkbenchThemeDeclaration {
  brand?: string;
  toolbar?: string;
  accent?: string;
}

export interface WorkbenchPage {
  fetch(input: string | URL, init?: RequestInit): Promise<Response>;
  announceTheme(theme: WorkbenchThemeDeclaration): void;
  /** 页面主动卸载时释放主题观察；重复连接共享同一实例。 */
  dispose(): void;
}

const COLOR_FUNCTION = /^(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\(/iu;
const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/iu;
const NAMED_COLOR = /^[a-z][a-z0-9-]*$/iu;
const THEME_TOKENS = ['background', 'text', 'border', 'muted', 'primary'] as const;
let activePage: WorkbenchPage | undefined;
let pendingDeclaration: WorkbenchThemeDeclaration = {};

function isSafeColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const normalized = value.trim();
  if (!normalized || normalized.length > 96 || /[;{}"']/u.test(normalized)) return false;
  if (/^(?:transparent|currentcolor|inherit|initial|unset|revert|revert-layer)$/iu.test(normalized)) return false;
  if (!HEX_COLOR.test(normalized) && !COLOR_FUNCTION.test(normalized) && !NAMED_COLOR.test(normalized)) return false;
  return typeof CSS === 'undefined' || typeof CSS.supports !== 'function' || CSS.supports('color', normalized);
}

function normalizeTheme(theme: WorkbenchThemeDeclaration): WorkbenchThemeDeclaration {
  return Object.fromEntries(
    Object.entries(theme)
      .filter(([name]) => name === 'brand' || name === 'toolbar' || name === 'accent')
      .filter(([, value]) => isSafeColor(value))
      .map(([name, value]) => [name, value.trim()]),
  ) as WorkbenchThemeDeclaration;
}

function rgba(color: string): number[] | null {
  const match = /^rgba?\(([^)]+)\)$/iu.exec(color);
  if (match) {
    const parts = match[1].split(/[\s,/]+/u).filter(Boolean);
    const alpha = parts[3] ?? '1';
    return [
      ...parts.slice(0, 3).map((part) => Number.parseFloat(part) * (part.endsWith('%') ? 2.55 : 1)),
      Number.parseFloat(alpha) / (alpha.endsWith('%') ? 100 : 1),
    ];
  }
  if (typeof CanvasRenderingContext2D !== 'undefined' && isSafeColor(color)) {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (context) {
      context.fillStyle = color;
      context.fillRect(0, 0, 1, 1);
      const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
      return [red, green, blue, alpha / 255];
    }
  }
  return null;
}

function toolbarSurface(element: HTMLElement): string | undefined {
  const color = [0, 0, 0];
  let alpha = 0;
  for (let ancestor: HTMLElement | null = element; ancestor; ancestor = ancestor.parentElement) {
    const style = getComputedStyle(ancestor);
    if (style.display === 'none' || style.visibility === 'hidden' || Number(style.opacity || 1) < 0.95) return;
    if (alpha >= 0.999) continue;
    if (style.backgroundImage && style.backgroundImage !== 'none') return;
    const layer = rgba(style.backgroundColor);
    if (!layer) continue;
    const weight = layer[3] * (1 - alpha);
    for (let index = 0; index < 3; index++) color[index] += layer[index] * weight;
    alpha += weight;
  }
  // 没有确定底色时不能把透明黑当作工作台颜色。
  if (alpha < 0.999) return;
  return `rgb(${color.map(Math.round).join(', ')})`;
}

function getToolbarColor(): string | undefined {
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(
      '[data-workbench-toolbar], [data-toolbar], [role="toolbar"], header, nav, [class*="toolbar" i], [class*="topbar" i], [class*="top-bar" i]',
    ),
  )
    .map((element) => ({ element, rect: element.getBoundingClientRect() }))
    .filter(
      ({ rect }) =>
        rect.top >= -1 &&
        rect.top <= 80 &&
        rect.height > 0 &&
        rect.height <= 160 &&
        rect.width >= window.innerWidth * 0.55,
    )
    .sort((left, right) => left.rect.top - right.rect.top || right.rect.width - left.rect.width);
  for (const { element } of candidates) {
    const color = toolbarSurface(element);
    if (color) return color;
  }
  return undefined;
}

export function announceWorkbenchTheme(theme: WorkbenchThemeDeclaration): void {
  if (activePage) activePage.announceTheme(theme);
  else {
    pendingDeclaration = normalizeTheme(theme);
    if (window.parent !== window)
      window.parent.postMessage({ type: 'floatboat:workbench-theme', theme: pendingDeclaration }, '*');
  }
}

export function connectWorkbenchPage(_legacyOptions?: unknown): Promise<WorkbenchPage> {
  if (activePage) return Promise.resolve(activePage);
  const parameters = new URLSearchParams(location.hash.slice(1));
  if (parameters.has('workbench-page')) {
    parameters.delete('workbench-page');
    history.replaceState(null, '', `${location.pathname}${location.search}${parameters.size ? `#${parameters}` : ''}`);
  }
  let declared: WorkbenchThemeDeclaration = pendingDeclaration;
  let hostTheme: Record<string, unknown> = {};
  let lastPublished = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  const originalTokens = new Map<string, { value: string; priority: string }>();
  const projectedTokens = new Map<string, string>();
  const root = document.documentElement;
  const applyHostTheme = () => {
    // 单一明暗方案意味着页面拥有自己的调色板，混入宿主 token 会造成深底深字。
    const schemes = getComputedStyle(root).colorScheme.split(/\s+/u);
    const ownsPalette = schemes.includes('dark') !== schemes.includes('light');
    for (const name of THEME_TOKENS) {
      const token = `--workbench-${name}`;
      if (ownsPalette) {
        if (projectedTokens.has(token) && root.style.getPropertyValue(token) === projectedTokens.get(token)) {
          const original = originalTokens.get(token);
          if (original?.value) root.style.setProperty(token, original.value, original.priority);
          else root.style.removeProperty(token);
        }
        projectedTokens.delete(token);
      } else if (typeof hostTheme[name] === 'string') {
        if (!originalTokens.has(token))
          originalTokens.set(token, {
            value: root.style.getPropertyValue(token),
            priority: root.style.getPropertyPriority(token),
          });
        if (root.style.getPropertyValue(token) !== hostTheme[name]) root.style.setProperty(token, hostTheme[name]);
        projectedTokens.set(token, hostTheme[name]);
      }
    }
  };
  const publish = () => {
    if (disposed || window.parent === window) return;
    applyHostTheme();
    const toolbar = getToolbarColor();
    const theme = { ...(toolbar ? { toolbar } : {}), ...declared };
    const serialized = JSON.stringify(theme);
    if (serialized === lastPublished) return;
    lastPublished = serialized;
    window.parent.postMessage({ type: 'floatboat:workbench-theme', theme }, '*');
  };
  const schedule = () => {
    if (timer !== undefined || disposed) return;
    timer = setTimeout(() => {
      timer = undefined;
      publish();
    }, 120);
  };
  const receive = (event: MessageEvent) => {
    if (window.parent === window || event.source !== window.parent || event.data?.type !== 'floatboat:workbench')
      return;
    hostTheme = event.data.theme ?? {};
    applyHostTheme();
    if (typeof event.data.language === 'string') root.lang = event.data.language;
    schedule();
  };
  const observer = new MutationObserver((records) => {
    if (
      records.some(
        (record) =>
          record.type === 'attributes' ||
          record.type === 'childList' ||
          record.target.parentElement?.tagName === 'STYLE',
      )
    )
      schedule();
  });
  const media = window.matchMedia?.('(prefers-color-scheme: dark)');
  const page: WorkbenchPage = {
    fetch(input, init) {
      const target = new URL(input, location.href);
      if (target.origin !== location.origin) throw new Error('WORKBENCH_PAGE_TARGET_INVALID');
      return fetch(target, init);
    },
    announceTheme(theme) {
      declared = normalizeTheme(theme);
      publish();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      clearTimeout(timer);
      observer.disconnect();
      window.removeEventListener('message', receive);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('pagehide', page.dispose);
      document.removeEventListener('load', schedule, true);
      document.removeEventListener('transitionend', schedule);
      media?.removeEventListener('change', schedule);
      if (activePage === page) activePage = undefined;
      pendingDeclaration = {};
    },
  };
  activePage = page;
  if (window.parent !== window) {
    window.addEventListener('message', receive);
    window.addEventListener('resize', schedule);
    window.addEventListener('pagehide', page.dispose);
    document.addEventListener('load', schedule, true);
    document.addEventListener('transitionend', schedule);
    media?.addEventListener('change', schedule);
    observer.observe(root, {
      attributes: true,
      attributeFilter: ['class', 'style', 'hidden', 'data-theme'],
      childList: true,
      characterData: true,
      subtree: true,
    });
    window.parent.postMessage({ type: 'floatboat:workbench-ready' }, '*');
    schedule();
  }
  return Promise.resolve(page);
}
