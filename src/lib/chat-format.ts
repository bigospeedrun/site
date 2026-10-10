import katex from 'katex';

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]!);
}

export function safeLink(value: string): string | null {
  try {
    if (!value.startsWith('https://') && !/^\/(?!\/)/.test(value)) return null;
    const url = new URL(value, 'https://bigospeedrun.com');
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    url.search = '';
    return url.origin === 'https://bigospeedrun.com' ? url.pathname + url.hash : url.href;
  } catch { return null; }
}

// A deliberately small renderer: all prose is escaped; only known constructs
// create HTML. KaTeX runs with trust disabled, including for model output.
export function formatReply(text: string): string {
  const tokens: string[] = [];
  const marker = (html: string) => `\u0000${tokens.push(html) - 1}\u0000`;
  let value = text.replace(/\u0000/g, '');
  value = value.replace(/\\\[([\s\S]*?)\\\]|\\\(([\s\S]*?)\\\)|\$\$([\s\S]*?)\$\$|\$([^$\n]+)\$/g, (_, display: string, inline: string, dollars: string, dollar: string) => {
    const tex = display ?? inline ?? dollars ?? dollar;
    return marker(katex.renderToString(tex, {displayMode: display !== undefined || dollars !== undefined, throwOnError: false, trust: false, strict: 'ignore', maxExpand: 500, maxSize: 10}));
  });
  value = value.replace(/`([^`\n]+)`/g, (_, code: string) => marker(`<code>${escapeHtml(code)}</code>`));
  value = value.replace(/\[([^\]\n]+)\]\(([^\s)]+)\)/g, (_, label: string, href: string) => {
    const safe = safeLink(href);
    return safe ? marker(`<a href="${escapeHtml(safe)}"${safe.startsWith('https://') ? ' target="_blank" rel="noopener noreferrer"' : ''}>${escapeHtml(label)}</a>`) : label;
  });
  value = escapeHtml(value).replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // Nested token markers (for math inside a link label) are restored too.
  for (let i = 0; i < 3; i++) value = value.replace(/\u0000(\d+)\u0000/g, (_, n: string) => tokens[Number(n)] ?? '');
  return value;
}
