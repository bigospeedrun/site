import {problems, dataUpdatedAt, boardRecords} from '../lib/data';
import {createKnowledge} from '../lib/chat-knowledge';
export const prerender = true;
export function GET() {
  return Response.json(createKnowledge(problems, dataUpdatedAt, boardRecords));
}
