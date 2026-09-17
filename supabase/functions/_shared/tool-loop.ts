// Aucun import : testé sous Vitest avec un faux client Anthropic.

export type LoopBlock = { type: string; id?: string; name?: string; input?: unknown; text?: string }

export type LoopUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number } | null
}

export type LoopResponse = { content: LoopBlock[]; stop_reason: string | null; usage: LoopUsage | null }

export type ToolDefinition = {
  name: string
  description: string
  strict: true
  input_schema: { type: 'object'; properties: Record<string, unknown>; required: string[]; additionalProperties: false }
}

export type ToolOutcome = { content: string; isError?: boolean }
export type RunTool = (name: string, input: Record<string, unknown>) => Promise<ToolOutcome>

// Le texte d'un tour qui appelle un outil (« je regarde ») n'est jamais envoyé au prospect,
// même quand ce tour est coupé et devient la dernière réponse.
export function finalText(res: LoopResponse) {
  if (res.content.some((b) => b.type === 'tool_use')) return ''
  return res.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text ?? '')
    .join('\n')
    .trim()
}

export async function runToolLoop(opts: {
  create: (params: Record<string, unknown>) => Promise<LoopResponse>
  params: Record<string, unknown>
  prompt: string
  tools?: ToolDefinition[]
  runTool?: RunTool
  maxToolRounds?: number
  lastRoundNote?: string
  onResponse?: (res: LoopResponse) => void
}): Promise<LoopResponse[]> {
  const messages: Record<string, unknown>[] = [{ role: 'user', content: opts.prompt }]
  if (!opts.tools?.length || !opts.runTool) {
    const res = await opts.create({ ...opts.params, messages: [...messages] })
    opts.onResponse?.(res)
    return [res]
  }
  const maxRounds = opts.maxToolRounds ?? 2
  const responses: LoopResponse[] = []
  for (let round = 0; round <= maxRounds; round++) {
    const res = await opts.create({
      ...opts.params,
      messages: [...messages],
      tools: opts.tools,
      // Une fois les tours épuisés, le modèle doit écrire sa réponse au lieu d'appeler encore.
      tool_choice: round === maxRounds ? { type: 'none' } : { type: 'auto', disable_parallel_tool_use: true },
    })
    responses.push(res)
    opts.onResponse?.(res)
    const uses = res.content.filter((b) => b.type === 'tool_use')
    if (res.stop_reason !== 'tool_use' || uses.length === 0) break

    const results = []
    for (const use of uses) {
      let outcome: ToolOutcome
      try {
        const input = use.input && typeof use.input === 'object' ? (use.input as Record<string, unknown>) : {}
        outcome = await opts.runTool(use.name ?? '', input)
      } catch (_) {
        outcome = { content: 'Outil indisponible pour le moment.', isError: true }
      }
      results.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: outcome.content,
        ...(outcome.isError ? { is_error: true } : {}),
      })
    }
    // Le tour de l'assistant repart tel quel : ses blocs de réflexion doivent suivre.
    messages.push({ role: 'assistant', content: res.content })
    const lastRound = round + 1 === maxRounds
    messages.push({
      role: 'user',
      content: lastRound && opts.lastRoundNote ? [...results, { type: 'text', text: opts.lastRoundNote }] : results,
    })
  }
  return responses
}

export function sumUsage(usages: (LoopUsage | null)[]): LoopUsage {
  const total = {
    input_tokens: 0,
    output_tokens: 0,
    cache_read_input_tokens: 0,
    cache_creation_input_tokens: 0,
    cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
  }
  for (const u of usages) {
    if (!u) continue
    total.input_tokens += u.input_tokens ?? 0
    total.output_tokens += u.output_tokens ?? 0
    total.cache_read_input_tokens += u.cache_read_input_tokens ?? 0
    total.cache_creation_input_tokens += u.cache_creation_input_tokens ?? 0
    total.cache_creation.ephemeral_5m_input_tokens += u.cache_creation?.ephemeral_5m_input_tokens ?? 0
    total.cache_creation.ephemeral_1h_input_tokens += u.cache_creation?.ephemeral_1h_input_tokens ?? 0
  }
  return total
}
