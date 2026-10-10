import {parse, type DefaultTreeAdapterMap} from 'parse5';
type ParsedNode = DefaultTreeAdapterMap['node'];
interface Node {type:number; name:string; value:string; attributes:Record<string,string>; children:Node[]}
type ElementNode = Node;
function tree(node:ParsedNode):Node {
  return {type:node.nodeName === '#text' ? 2 : 'tagName' in node ? 1 : 0,
    name:'tagName' in node ? node.tagName : '',value:'value' in node ? node.value : '',
    attributes:'attrs' in node ? Object.fromEntries(node.attrs.map(a=>[a.name,a.value])) : {},
    children:'childNodes' in node ? node.childNodes.map(tree) : []};
}

export interface AgentPage {markdown: string; html: string; redirect?: string}
export type AgentPages = Record<string, AgentPage>;
const children = (node: Node): Node[] => 'children' in node ? node.children : [];
function find(node: Node, predicate: (node: ElementNode) => boolean): ElementNode | undefined {
  if (node.type === 1 && predicate(node)) return node;
  for (const child of children(node)) {const result = find(child, predicate); if (result) return result;}
}
const plain = (node: Node): string => node.type === 2 ? node.value : children(node).map(plain).join('');

// Read the generated document, including collapsed evidence details. Use the
// original KaTeX annotation once instead of its MathML and visual glyph trees.
export function pageMarkdown(html: string): string {
  const document = tree(parse(html,{scriptingEnabled:false}));
  const main = find(document, n => n.name === 'main');
  if (!main) throw new Error('Agent page has no main element');
  function render(node: Node): string {
    if (node.type === 2) return node.value.replace(/\s+/g, ' ');
    if (node.type !== 1 && node.type !== 0) return '';
    if (node.type === 0) return children(node).map(render).join('');
    const {name, attributes: a} = node;
    if (['script','style','svg','button','input','select','fieldset'].includes(name) || a['aria-hidden'] === 'true') return '';
    if ((a.class ?? '').split(' ').includes('katex')) {
      const annotation = find(node, n => n.name === 'annotation' && n.attributes.encoding === 'application/x-tex');
      return annotation ? `$${plain(annotation)}$` : '';
    }
    // These spans duplicate desktop labels, not page content.
    if (/(?:^| )(phone-label|tab-short|mobile-meta|no-results|pagination)(?: |$)/.test(a.class ?? '')) return '';
    const content = children(node).map(render).join('');
    if (/^h[1-6]$/.test(name)) return `\n\n${'#'.repeat(Number(name[1]))} ${content.trim()}\n\n`;
    if (name === 'a' && a.href) return `[${content.trim() || a['aria-label'] || a.href}](${a.href})`;
    if (name === 'img') return a.alt ? `![${a.alt}](${a.src})` : '';
    if (name === 'li') return `\n- ${content.trim()}\n`;
    if (name === 'dt' || name === 'summary') return `\n\n**${content.trim()}**\n\n`;
    if (name === 'tr') {
      const cells = children(node).filter((n): n is ElementNode => n.type === 1 && ['td','th'].includes(n.name) && !(n.attributes.class ?? '').split(' ').includes('mobile-meta'));
      const row = '| ' + cells.map(n => children(n).map(render).join('').trim().replace(/\s*\n\s*/g,' ').replace(/\|/g,'\\|')).join(' | ') + ' |\n';
      return row + (cells.every(n => n.name === 'th') ? '| '+cells.map(()=>'---').join(' | ')+' |\n' : '');
    }
    if (['p','section','div','ul','ol','dl','dd','table','details','footer'].includes(name)) return `\n\n${content.trim()}\n\n`;
    if (name === 'br') return '\n';
    if (name === 'time') return ` ${content} `;
    if (a.title?.startsWith('Exact score:')) return `${content} (${a.title})`;
    if (name === 'span') return ` ${content} `;
    return content;
  }
  const footer = find(document, n => n.name === 'footer' && (n.attributes.class ?? '').includes('site-footer'));
  return (render(main) + (footer ? render(footer) : '')).replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim()+'\n';
}

export function prefersMarkdown(accept = ''): boolean {
  const entries = accept.toLowerCase().split(',').map(part => {
    const [type,...params] = part.trim().split(';');
    const q = params.map(p => p.trim()).find(p => p.startsWith('q='));
    return {type, q: q ? Number(q.slice(2)) : 1};
  });
  const quality = (type: string) => entries.find(e => e.type === type)?.q ?? entries.find(e => e.type === 'text/*')?.q ?? entries.find(e => e.type === '*/*')?.q ?? 0;
  return entries.some(e => e.type === 'text/markdown' && e.q > 0) && quality('text/markdown') >= quality('text/html');
}

export function agentResponse(request: Request, pages: AgentPages, pathname = new URL(request.url).pathname): Response {
  const path = pathname.replace(/\/index\.html$/, '/').replace(/\/$/, '') || '/';
  const page = Object.hasOwn(pages, path) ? pages[path] : pages['/404'];
  const status = Object.hasOwn(pages, path) && path !== '/404' ? 200 : 404;
  const markdown = prefersMarkdown(request.headers.get('accept') ?? '');
  const headers = new Headers({'Content-Type': markdown ? 'text/markdown; charset=utf-8' : 'text/html; charset=utf-8', 'Vary': 'Accept', 'Cache-Control': 'private, no-store'});
  if (page.html.includes('content="noindex"')) headers.set('X-Robots-Tag','noindex');
  if (page.redirect) {headers.set('Location',page.redirect); return new Response(null,{status:301,headers});}
  if (!['GET','HEAD'].includes(request.method)) {headers.set('Allow','GET, HEAD'); return new Response(null,{status:405,headers});}
  return new Response(request.method === 'HEAD' ? null : markdown ? page.markdown : page.html, {status, headers});
}
