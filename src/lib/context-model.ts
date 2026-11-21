// Backend processing only. These instructions are never sent to the conversation model.
import { DEFAULT_SUMMARY_MODEL, readProvider, type MemoryConfig } from './memory.ts';

export async function contextJson(instructions: string, input: unknown, schema: object, config: MemoryConfig, signal: AbortSignal): Promise<unknown> {
  if (!config.summaryKey) throw Error('context_unavailable');
  const url = new URL(config.summaryBaseUrl || 'https://api.runyour.ai/v1');
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw Error('invalid_context_url');
  url.pathname = url.pathname.replace(/\/+$/, '') + '/responses';
  const response = await (config.fetch ?? fetch)(url, {
    method: 'POST', headers: { Authorization: `Bearer ${config.summaryKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: config.summaryModel || DEFAULT_SUMMARY_MODEL, store: false, stream: false,
      reasoning: { effort: 'low' }, max_output_tokens: 4096, instructions,
      input: [{ role: 'user', content: JSON.stringify(input) }],
      text: { format: { type: 'json_schema', name: 'backend_context', strict: true, schema } },
    }), signal, cache: 'no-store', redirect: 'error',
  });
  const body = await readProvider(response, signal) as { status?: string; output?: { type: string; content?: { type: string; text?: string }[] }[] };
  if (body.status !== 'completed' || !Array.isArray(body.output)) throw Error('invalid_context_result');
  const text = body.output.flatMap(x => x.type === 'message' ? x.content ?? [] : []).filter(x => x.type === 'output_text').map(x => x.text ?? '').join('');
  return JSON.parse(text);
}

export const stringSchema = { type: 'string' };
export const objectSchema = (properties: Record<string, object>) => ({ type: 'object', properties, required: Object.keys(properties), additionalProperties: false });
