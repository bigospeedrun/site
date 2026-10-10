import katex from 'katex';

/** Render trusted TeX at build time. The shared layout loads the KaTeX stylesheet. */
export const math = (tex: string, displayMode = false) => katex.renderToString(tex, {
  displayMode, throwOnError: true, output: 'htmlAndMathml', trust: false,
});

/** Render display and inline TeX delimiters in authored HTML. */
export const inlineMath = (html: string) => html
  .replace(/\\\[([\s\S]*?)\\\]/g, (_, tex) => math(tex, true))
  .replace(/\\\(([\s\S]*?)\\\)/g, (_, tex) => math(tex));
