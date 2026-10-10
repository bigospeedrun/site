import {sitemapPaths,siteOrigin} from '../lib/seo';
export function GET() {
 const urls=sitemapPaths.map(path=>`  <url><loc>${siteOrigin}${path}</loc></url>`).join('\n');
 return new Response(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,{headers:{'Content-Type':'application/xml; charset=utf-8'}});
}
