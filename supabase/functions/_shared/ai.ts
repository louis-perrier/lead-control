import Anthropic from 'npm:@anthropic-ai/sdk'
import { admin } from './core.ts'

export const AI_MODEL_REPLY = 'claude-opus-5'
export const AI_MODEL_SUMMARY = 'claude-opus-5'

// $ par million de tokens, pour l'estimation de coût affichée dans l'admin.
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-opus-5': { input: 5, output: 25 },
}

export type ResolvedKey = { key: string; source: 'platform' | 'byok' }

export async function resolveApiKey(userId: string, planOverride: string | null): Promise<ResolvedKey | null> {
  if (planOverride === 'beta_byok') {
    const { data } = await admin.rpc('get_user_ai_key', { p_user: userId })
    return data ? { key: data as string, source: 'byok' } : null
  }
  const key = Deno.env.get('ANTHROPIC_API_KEY')
  return key ? { key, source: 'platform' } : null
}

export async function generateText(opts: {
  apiKey: string
  model: string
  system: string
  prompt: string
  maxTokens?: number
}) {
  const client = new Anthropic({ apiKey: opts.apiKey })
  const res = await client.messages.create({
    model: opts.model,
    max_tokens: opts.maxTokens ?? 2048,
    system: opts.system,
    messages: [{ role: 'user', content: opts.prompt }],
  })
  const text = res.content
    .filter((b) => b.type === 'text')
    .map((b) => ('text' in b ? b.text : ''))
    .join('\n')
    .trim()
  return { text, usage: res.usage, stopReason: res.stop_reason }
}

export async function recordUsage(opts: {
  userId: string
  conversationId: number | null
  model: string
  usage: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number } | null
  source: 'platform' | 'byok'
}) {
  const p = PRICING[opts.model] ?? { input: 5, output: 25 }
  const input = opts.usage?.input_tokens ?? 0
  const output = opts.usage?.output_tokens ?? 0
  await admin.from('ai_usage').insert({
    user_id: opts.userId,
    conversation_id: opts.conversationId,
    model: opts.model,
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: opts.usage?.cache_read_input_tokens ?? 0,
    key_source: opts.source,
    cost_estimate_usd: (input * p.input + output * p.output) / 1_000_000,
  })
}
