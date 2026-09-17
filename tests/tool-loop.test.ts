import { describe, expect, it } from 'vitest'
import { finalText, runToolLoop, sumUsage, type LoopResponse, type ToolDefinition } from '../supabase/functions/_shared/tool-loop'

const tool: ToolDefinition = {
  name: 'verifier_creneau',
  description: 'Vérifie un moment.',
  strict: true,
  input_schema: { type: 'object', properties: { debut: { type: 'string' } }, required: ['debut'], additionalProperties: false },
}

const text = (t: string, stop = 'end_turn'): LoopResponse => ({
  content: [{ type: 'thinking' }, { type: 'text', text: t }],
  stop_reason: stop,
  usage: { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 100 },
})

const call = (id: string): LoopResponse => ({
  content: [{ type: 'text', text: 'Je regarde.' }, { type: 'tool_use', id, name: 'verifier_creneau', input: { debut: '2026-09-18T14:00' } }],
  stop_reason: 'tool_use',
  usage: { input_tokens: 20, output_tokens: 7 },
})

function fakeClient(replies: LoopResponse[]) {
  const calls: Record<string, unknown>[] = []
  return {
    calls,
    create: async (params: Record<string, unknown>) => {
      calls.push(params)
      return replies[calls.length - 1]
    },
  }
}

describe('runToolLoop', () => {
  it('garde l’appel d’origine quand aucun outil n’est fourni', async () => {
    const client = fakeClient([text('{"reply_text":"ok"}')])
    const res = await runToolLoop({ create: client.create, params: { model: 'm', max_tokens: 10, system: 's' }, prompt: 'p' })
    expect(client.calls).toEqual([{ model: 'm', max_tokens: 10, system: 's', messages: [{ role: 'user', content: 'p' }] }])
    expect(finalText(res[res.length - 1])).toBe('{"reply_text":"ok"}')
  })

  it('exécute l’outil puis renvoie le tour de l’assistant tel quel', async () => {
    const client = fakeClient([call('t1'), text('{"reply_text":"libre"}')])
    const seen: unknown[] = []
    const res = await runToolLoop({
      create: client.create,
      params: { model: 'm' },
      prompt: 'p',
      tools: [tool],
      runTool: async (name, input) => {
        seen.push([name, input])
        return { content: 'libre' }
      },
    })
    expect(seen).toEqual([['verifier_creneau', { debut: '2026-09-18T14:00' }]])
    expect(client.calls[0].tool_choice).toEqual({ type: 'auto', disable_parallel_tool_use: true })
    expect(client.calls[1].messages).toEqual([
      { role: 'user', content: 'p' },
      { role: 'assistant', content: call('t1').content },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'libre' }] },
    ])
    expect(finalText(res[res.length - 1])).toBe('{"reply_text":"libre"}')
    expect(sumUsage(res.map((r) => r.usage))).toMatchObject({ input_tokens: 30, output_tokens: 12, cache_read_input_tokens: 100 })
  })

  it('interdit les outils au dernier tour', async () => {
    const client = fakeClient([call('t1'), call('t2'), text('{"reply_text":"fin"}')])
    const res = await runToolLoop({
      create: client.create,
      params: {},
      prompt: 'p',
      tools: [tool],
      runTool: async () => ({ content: 'occupé' }),
      maxToolRounds: 2,
    })
    expect(client.calls).toHaveLength(3)
    expect(client.calls[2].tool_choice).toEqual({ type: 'none' })
    expect(res).toHaveLength(3)
  })

  it('transmet une panne d’outil comme une erreur au modèle', async () => {
    const client = fakeClient([call('t1'), text('{}')])
    await runToolLoop({
      create: client.create,
      params: {},
      prompt: 'p',
      tools: [tool],
      runTool: async () => {
        throw new Error('google down')
      },
    })
    const messages = client.calls[1].messages as { content: unknown }[]
    expect(messages[2].content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: 'Outil indisponible pour le moment.', is_error: true },
    ])
  })

  it('n’envoie jamais le texte d’un tour d’outil', async () => {
    const client = fakeClient([call('t1'), { content: [], stop_reason: 'max_tokens', usage: null }])
    const res = await runToolLoop({ create: client.create, params: {}, prompt: 'p', tools: [tool], runTool: async () => ({ content: 'x' }) })
    expect(finalText(res[res.length - 1])).toBe('')
  })
})
