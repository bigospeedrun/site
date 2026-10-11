import {problemLinks} from '../lib/navigation';
import {breakthroughLabel, breakthroughDefinition} from '../lib/evidence';
import {siteOrigin} from '../lib/seo';
export function GET() {
  return new Response(`# Big O Speedrun

Big O Speedrun tracks improved algorithmic bounds for classic problems.

## When to use this site

Use this site to compare bounds, read their assumptions and evidence, and find the original sources. Each problem page states its computation model and evidence rules. Cite the linked source and retain the stated assumptions and evidence level. Check the data update time before describing a result as current.

## Problems and sources

${problemLinks.map(([slug,title])=>`- [${title}](${siteOrigin}/${slug}): bounds, evidence rules and source links.`).join('\n')}

## Reference

${breakthroughLabel}: ${breakthroughDefinition}

- [How do I start?](${siteOrigin}/about#get-started): choose a problem and check the latest updates.
- [Submit a result](${siteOrigin}/about#submit): start here to find the submission route for each problem and the full instructions.
- [About and evidence levels](${siteOrigin}/about#evidence-levels): evidence definitions.
- [Structured data](${siteOrigin}/chat-knowledge.json): update times, page text, evidence definitions, current leaders overall and by evidence level, their assumptions and sources, and repository submission links. This file does not contain the full record history.
- [Sitemap](${siteOrigin}/sitemap.xml): public page URLs.

Request a page with Accept: text/markdown to read its Markdown representation.
`,{headers:{'Content-Type':'text/plain; charset=utf-8'}});
}
