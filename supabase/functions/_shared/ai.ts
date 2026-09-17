import Anthropic from 'npm:@anthropic-ai/sdk@0.126.0'
import { admin } from './core.ts'
import { finalText, runToolLoop, sumUsage, type LoopResponse, type RunTool, type ToolDefinition } from './tool-loop.ts'

// La V1 (n8n) tournait sur Claude Sonnet pour les réponses : on reste sur la
// même gamme de modèle pour conserver le coût par message qui a servi à fixer
// les tarifs de l'offre, plutôt que de basculer sur Opus (5x plus cher).
export const AI_MODEL_REPLY = 'claude-sonnet-5'
export const AI_MODEL_SUMMARY = 'claude-haiku-4-5-20251001'

// $ par million de tokens, tarif public Anthropic, à ajuster s'il change.
// Écriture en cache : 1,25x l'entrée sur 5 min, 2x sur 1 h. Lecture : 0,1x.
const PRICING: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-haiku-4-5-20251001': { input: 1, output: 5 },
}

export type SystemInput = string | { text: string; cache: boolean }[]

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
  system: SystemInput
  prompt: string
  maxTokens?: number
  tools?: ToolDefinition[]
  runTool?: RunTool
}) {
  const client = new Anthropic({ apiKey: opts.apiKey })
  const system =
    typeof opts.system === 'string'
      ? opts.system
      : opts.system.map((block) => ({
          type: 'text' as const,
          text: block.text,
          ...(block.cache ? { cache_control: { type: 'ephemeral' as const, ttl: '1h' as const } } : {}),
        }))
  const responses = await runToolLoop({
    create: (params) => client.messages.create(params as any) as unknown as Promise<LoopResponse>,
    params: { model: opts.model, max_tokens: opts.maxTokens ?? 2048, system },
    prompt: opts.prompt,
    tools: opts.tools,
    runTool: opts.runTool,
  })
  const last = responses[responses.length - 1]
  return {
    text: finalText(last),
    usage: sumUsage(responses.map((r) => r.usage)),
    stopReason: last.stop_reason,
    calls: responses.length,
  }
}

export async function recordUsage(opts: {
  userId: string
  conversationId: number | null
  model: string
  usage: {
    input_tokens?: number
    output_tokens?: number
    cache_read_input_tokens?: number | null
    cache_creation_input_tokens?: number | null
    cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null
  } | null
  source: 'platform' | 'byok'
}) {
  const p = PRICING[opts.model] ?? { input: 5, output: 25 }
  const input = opts.usage?.input_tokens ?? 0
  const output = opts.usage?.output_tokens ?? 0
  const cacheRead = opts.usage?.cache_read_input_tokens ?? 0
  const cacheWrite = opts.usage?.cache_creation_input_tokens ?? 0
  const write1h = opts.usage?.cache_creation?.ephemeral_1h_input_tokens ?? 0
  const write5m = Math.max(0, cacheWrite - write1h)
  const inputCost = input + cacheRead * 0.1 + write5m * 1.25 + write1h * 2
  await admin.from('ai_usage').insert({
    user_id: opts.userId,
    conversation_id: opts.conversationId,
    model: opts.model,
    input_tokens: input,
    output_tokens: output,
    cache_read_tokens: cacheRead,
    cache_creation_tokens: cacheWrite,
    key_source: opts.source,
    cost_estimate_usd: (inputCost * p.input + output * p.output) / 1_000_000,
  })
}
