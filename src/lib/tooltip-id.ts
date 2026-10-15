import {createHash} from 'node:crypto';

// One record per rendered page: a page render has its own Request object.
const used = new WeakMap<object, Map<string, number>>();

// A tooltip id from its label and content, so two builds of one commit give identical HTML
// (random ids made every build look new to the self-hosting image digest). A tooltip that
// repeats on one page gets a suffix in page order, so ids stay unique.
export function tooltipId(page: object, label: string, content: string): string {
 const base = 'info-' + createHash('sha256').update(label + '\0' + content).digest('hex').slice(0, 12);
 const seen = used.get(page) ?? new Map<string, number>();
 used.set(page, seen);
 const count = (seen.get(base) ?? 0) + 1;
 seen.set(base, count);
 return count === 1 ? base : `${base}-${count}`;
}
