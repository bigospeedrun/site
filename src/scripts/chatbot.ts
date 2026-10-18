import {formatReply} from '../lib/chat-format';

type Message = {role: 'user' | 'assistant'; content: string};
type Config = {available: boolean; logging: boolean; stub: boolean};

export function initChatbot() {
  const root = document.getElementById('bos-chat');
  if (!root || root.dataset.ready) return;
  root.dataset.ready = 'true';
  const panel = root.querySelector<HTMLElement>('.bos-chat-panel')!;
  const toggle = root.querySelector<HTMLButtonElement>('.bos-chat-toggle')!;
  const close = root.querySelector<HTMLButtonElement>('.bos-chat-close')!;
  const list = root.querySelector<HTMLElement>('.bos-chat-messages')!;
  const form = root.querySelector<HTMLFormElement>('form')!;
  const input = root.querySelector<HTMLInputElement>('input')!;
  const submit = form.querySelector<HTMLButtonElement>('button')!;
  const status = root.querySelector<HTMLElement>('.bos-chat-status')!;
  const disclosure = root.querySelector<HTMLElement>('.bos-chat-disclosure')!;
  const logging = root.querySelector<HTMLElement>('.bos-chat-logging')!;
  const starters = root.querySelector<HTMLElement>('.bos-chat-starters')!;
  const history: Message[] = [];
  let config: Config | null = null, busy = false, checking = false;
  let controller: AbortController | null = null;
  const phone = matchMedia('(max-width: 600px)');
  const visibleCharts = new Set<Element>();
  function updateLauncher() {
    toggle.hidden = !config?.available || !panel.hidden || (phone.matches && visibleCharts.size > 0);
  }
  // Keep the floating launcher clear of chart marks, dates and controls on
  // narrow screens. The open conversation stays available until closed.
  const chartObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (entry.isIntersecting) visibleCharts.add(entry.target);
      else visibleCharts.delete(entry.target);
    }
    updateLauncher();
  });
  document.querySelectorAll('progress-chart').forEach(chart => chartObserver.observe(chart));
  phone.addEventListener('change', updateLauncher);

  function controls() {
    const disabled = busy || !config?.available;
    input.disabled = submit.disabled = disabled;
    starters.querySelectorAll('button').forEach(button => { button.disabled = disabled; });
    list.setAttribute('aria-busy', String(busy));
  }

  async function configure(focusInput = false) {
    if (checking) return;
    checking = true;
    config = null; controls(); updateLauncher();
    try {
      const response = await fetch('/api/chat', {cache: 'no-store', signal: AbortSignal.timeout(8_000)});
      if (!response.ok) throw new Error();
      const value = await response.json();
      if (typeof value.available !== 'boolean' || typeof value.logging !== 'boolean' || typeof value.stub !== 'boolean') throw new Error();
      config = value;
      disclosure.textContent = value.stub ? 'This local demo uses fixed replies. Messages stay on this server.' : value.available ? 'Claude answers from this site. Anthropic receives messages to generate replies. Answers can be wrong.' : 'The chat is not available yet. The FAQ can help.';
      logging.hidden = !value.logging;
    } catch {
      disclosure.textContent = 'The chat is not available. Please read the FAQ on the About page.';
      logging.hidden = true;
    }
    checking = false;
    if (!config?.available && !panel.hidden) hide();
    controls(); updateLauncher();
    if (focusInput && !panel.hidden && !busy && config?.available) input.focus();
  }

  function hide() {
    panel.hidden = true; updateLauncher();
    toggle.setAttribute('aria-expanded', 'false');
    controller?.abort();
    if (!toggle.hidden) toggle.focus();
    else document.querySelector<HTMLButtonElement>('progress-chart button')?.focus({preventScroll: true});
  }
  updateLauncher();
  void configure();
  // Status is runtime configuration, never a build-time flag. Recheck hidden
  // chat on return and periodically so an open page can pick up availability.
  const refreshAvailability = () => {
    if (document.visibilityState === 'visible' && panel.hidden && !busy) void configure();
  };
  window.addEventListener('focus', refreshAvailability);
  document.addEventListener('visibilitychange', refreshAvailability);
  window.setInterval(refreshAvailability, 60_000);
  toggle.addEventListener('click', () => {
    if (!config?.available) return;
    panel.hidden = false; toggle.hidden = true;
    toggle.setAttribute('aria-expanded', 'true'); close.focus();
    void configure(true);
  });
  close.addEventListener('click', hide);
  panel.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); hide(); } });

  function addMessage(role: Message['role'], text: string) {
    const item = document.createElement('div');
    item.className = 'bos-chat-message'; item.dataset.role = role;
    item.setAttribute('aria-label', role === 'user' ? 'You' : 'Assistant');
    if (role === 'user') item.textContent = text; else item.innerHTML = formatReply(text);
    list.append(item); list.scrollTop = list.scrollHeight;
    return item;
  }

  async function send(text: string) {
    const content = text.trim();
    if (!content || content.length > 2_000 || busy || !config?.available) return;
    busy = true; controls(); starters.hidden = true; input.value = '';
    status.classList.remove('bos-chat-sr');
    addMessage('user', content); status.textContent = 'Claude is replying…';
    const message: Message = {role: 'user', content};
    // Keep complete pairs and cap history to the same total as the server.
    const sent = [...history, message];
    while (sent.length > 19 || sent.reduce((n, m) => n + m.content.length, 0) > 16_000) sent.splice(0, 2);
    controller = new AbortController();
    const timeout = setTimeout(() => controller?.abort(), 55_000);
    const bot = addMessage('assistant', '');
    let reply = '', completed = false, buffer = '', refused = false;
    try {
      const response = await fetch('/api/chat', {
        method: 'POST', headers: {'Content-Type': 'application/json'}, signal: controller.signal,
        body: JSON.stringify({messages: sent, page: location.pathname.replace(/\/$/, '') || '/', loggingNotice: config.logging}),
      });
      if (!response.ok) {
        if (response.status === 409) void configure();
        const err = await response.json().catch(() => null);
        throw new Error(err?.error?.message || 'The chat is unavailable. Please try again.');
      }
      if (!response.body) throw new Error('The reply was interrupted. Please try again.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const {done, value} = await reader.read();
          buffer += done ? decoder.decode() : decoder.decode(value, {stream: true});
          if (buffer.length > 100_000) throw new Error('The reply is too long.');
          let frame: RegExpExecArray | null;
          while ((frame = /\r?\n\r?\n/.exec(buffer))) {
            const block = buffer.slice(0, frame.index); buffer = buffer.slice(frame.index + frame[0].length);
            const data = block.split(/\r?\n/).filter(l => l.startsWith('data:')).map(l => l.slice(5).trimStart()).join('\n');
            if (!data) continue;
            if (data === '[DONE]') { completed = true; break; }
            const event = JSON.parse(data);
            if (event.error) {
              // The server sends fixed short texts; a refusal also sets event.refused and keeps no retry text.
              refused = event.refused === true;
              throw new Error(typeof event.error === 'string' && event.error.length <= 200 ? event.error : 'The reply was interrupted. Please try again.');
            }
            if (typeof event.text === 'string') {
              reply += event.text;
              if (reply.length > 8_000) throw new Error('The reply is too long.');
              const nearEnd = list.scrollHeight - list.scrollTop - list.clientHeight < 80;
              bot.innerHTML = formatReply(reply);
              if (nearEnd) list.scrollTop = list.scrollHeight;
            }
          }
          if (done || completed) break;
        }
      } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
      if (!completed || !reply) throw new Error('The reply was interrupted. Please try again.');
      history.push(message, {role: 'assistant', content: reply});
      while (history.length > 18) history.splice(0, 2);
      status.classList.add('bos-chat-sr');
      status.textContent = 'The reply is ready.';
      bot.setAttribute('tabindex', '0');
    } catch (err) {
      bot.remove();
      status.textContent = controller.signal.aborted ? 'The reply stopped. Send the message again to retry.' : err instanceof Error ? err.message : 'The chat is unavailable. Please try again.';
      if (!refused) input.value = content;
    } finally {
      clearTimeout(timeout); controller = null; busy = false; controls();
      if (!panel.hidden && config?.available) input.focus();
    }
  }
  form.addEventListener('submit', event => { event.preventDefault(); void send(input.value); });
  starters.querySelectorAll('button').forEach(button => button.addEventListener('click', () => { void send(button.textContent ?? ''); }));
}
