// Facturation Stripe : checkout coach, packs de crédits, portail, état (/info)
// et webhook idempotent. Mêmes produits et routes que la V1 ; à l'annulation,
// l'assistant est mis en pause et les données sont conservées.
import Stripe from 'https://esm.sh/stripe@14.25.0?target=denonext'
import { admin, corsHeaders, getUser, handleOptions, json, logEvent } from '../_shared/core.ts'

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, { apiVersion: '2024-06-20' })
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!
const PRICE_COACH_BASE = Deno.env.get('STRIPE_PRICE_COACH_BASE') ?? ''
const PRICE_COACH_EXTRA_AGENT = Deno.env.get('STRIPE_PRICE_COACH_EXTRA_AGENT') ?? ''
const PRICE_CREDITS_PACK = Deno.env.get('STRIPE_PRICE_CREDITS_PACK') ?? ''

const SITE = 'https://leadcontrol.fr'
const SUCCESS_URL = `${SITE}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`
const CANCEL_URL = `${SITE}/app/billing?canceled=1`
const PORTAL_RETURN_URL = `${SITE}/app/billing`

const CREDITS_PER_PLAN = 5000
const CREDITS_PER_PACK = 50
const MAX_AGENTS = 5

async function getOrCreateStripeCustomer(userId: string, email?: string | null) {
  const { data, error } = await admin
    .from('paiement_stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (data?.stripe_customer_id) return data.stripe_customer_id
  const customer = await stripe.customers.create({
    email: email ?? undefined,
    metadata: { supabase_user_id: userId },
  })
  await admin
    .from('paiement_stripe_customers')
    .upsert({ user_id: userId, stripe_customer_id: customer.id }, { onConflict: 'user_id' })
  return customer.id
}

async function checkoutCoach(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  let body: { agents_qty?: number } = {}
  try {
    body = await req.json()
  } catch {
    return json(req, { error: 'Invalid JSON body' }, 400)
  }
  const qty = Number(body.agents_qty ?? 1)
  if (!Number.isInteger(qty) || qty < 1 || qty > MAX_AGENTS) {
    return json(req, { error: `agents_qty must be between 1 and ${MAX_AGENTS}` }, 400)
  }
  const customer = await getOrCreateStripeCustomer(user.id, user.email)
  const metadata = {
    supabase_user_id: user.id,
    plan_key: 'coach_basic',
    agents_qty: String(qty),
    credits: String(CREDITS_PER_PLAN),
    cycle: 'monthly',
    stripe_price_agents_id: PRICE_COACH_BASE,
    stripe_price_credits_id: '',
  }
  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer,
    allow_promotion_codes: true,
    success_url: SUCCESS_URL,
    cancel_url: CANCEL_URL,
    subscription_data: { metadata },
    line_items: [
      { price: PRICE_COACH_BASE, quantity: 1 },
      ...(qty > 1 ? [{ price: PRICE_COACH_EXTRA_AGENT, quantity: qty - 1 }] : []),
    ],
    metadata,
  })
  return json(req, { url: session.url, id: session.id })
}

async function checkoutCredits(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  if (!PRICE_CREDITS_PACK) return json(req, { error: 'Credits pack price not configured' }, 500)
  let body: { quantity?: number } = {}
  try {
    body = await req.json()
  } catch {
    // corps optionnel
  }
  const quantity = Number(body.quantity ?? 1)
  if (!Number.isInteger(quantity) || quantity < 1 || quantity > 10) {
    return json(req, { error: 'quantity must be between 1 and 10' }, 400)
  }
  const customer = await getOrCreateStripeCustomer(user.id, user.email)
  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer,
    success_url: SUCCESS_URL,
    cancel_url: CANCEL_URL,
    line_items: [{ price: PRICE_CREDITS_PACK, quantity }],
    metadata: {
      supabase_user_id: user.id,
      pack_credits: String(CREDITS_PER_PACK * quantity),
    },
  })
  return json(req, { url: session.url, id: session.id })
}

async function portal(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  const { data } = await admin
    .from('paiement_stripe_customers')
    .select('stripe_customer_id')
    .eq('user_id', user.id)
    .maybeSingle()
  if (!data?.stripe_customer_id) return json(req, { error: 'no_customer' }, 404)
  const session = await stripe.billingPortal.sessions.create({
    customer: data.stripe_customer_id,
    return_url: PORTAL_RETURN_URL,
  })
  return json(req, { url: session.url })
}

async function info(req: Request) {
  const user = await getUser(req)
  if (!user) return json(req, { error: 'Unauthorized' }, 401)
  const [{ data: profile }, { data: sub }] = await Promise.all([
    admin
      .from('profiles')
      .select('plan_override, credits_consumed_in_period')
      .eq('user_id', user.id)
      .maybeSingle(),
    admin
      .from('paiement_subscriptions')
      .select('status, agents_settings_qty, agents_vocal_qty, credits_monthly, current_period_end, cycle')
      .eq('user_id', user.id)
      .in('status', ['active', 'trialing', 'past_due', 'canceled'])
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const consumed = Number(profile?.credits_consumed_in_period ?? 0)
  const override = profile?.plan_override ?? null
  const hasSub = Boolean(sub && ['active', 'trialing'].includes(sub.status))
  const planKey = hasSub
    ? (sub!.agents_vocal_qty ?? 0) > 0
      ? 'coach_premium'
      : 'coach_basic'
    : override
      ? 'override'
      : 'none'
  const creditsMonthly = hasSub ? Number(sub!.credits_monthly ?? 0) : 0
  return json(req, {
    status: hasSub ? sub!.status : (sub?.status ?? 'inactive'),
    planKey,
    planOverride: override,
    agentsSettingsQty: hasSub ? Number(sub!.agents_settings_qty ?? 0) : override ? 1 : 0,
    agentsVocalQty: hasSub ? Number(sub!.agents_vocal_qty ?? 0) : 0,
    creditsMonthly,
    creditsConsumed: consumed,
    creditsRemaining: override ? null : Math.max(creditsMonthly - consumed, 0),
    currentPeriodEnd: hasSub ? sub!.current_period_end : null,
    cycle: hasSub ? (sub!.cycle ?? null) : null,
    isTrial: sub?.status === 'trialing',
  })
}

type SubPayload = {
  userId: string
  stripeSubscriptionId: string
  status: string
  currentPeriodEnd: string | null
  agentsQty: number
  creditsMonthly: number
  stripePriceAgentsId: string | null
  stripePriceCreditsId: string | null
  cycle: string | null
}

async function writeSubscriptionToDB(p: SubPayload) {
  const existing = await admin
    .from('paiement_subscriptions')
    .select('stripe_subscription_id')
    .eq('stripe_subscription_id', p.stripeSubscriptionId)
    .maybeSingle()
  if (existing.data) {
    await admin
      .from('paiement_subscriptions')
      .update({
        user_id: p.userId,
        status: p.status,
        current_period_end: p.currentPeriodEnd,
        agents_settings_qty: p.agentsQty,
        credits_monthly: p.creditsMonthly,
        stripe_price_agents_id: p.stripePriceAgentsId,
        stripe_price_credits_id: p.stripePriceCreditsId,
        cycle: p.cycle,
        updated_at: new Date().toISOString(),
      })
      .eq('stripe_subscription_id', p.stripeSubscriptionId)
    return
  }
  const active = await admin
    .from('paiement_subscriptions')
    .select('stripe_subscription_id')
    .eq('user_id', p.userId)
    .in('status', ['active', 'trialing'])
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (active.data && active.data.stripe_subscription_id !== p.stripeSubscriptionId) {
    await admin
      .from('paiement_subscriptions')
      .update({ status: 'canceled', updated_at: new Date().toISOString() })
      .eq('stripe_subscription_id', active.data.stripe_subscription_id)
  }
  await admin.from('paiement_subscriptions').insert({
    user_id: p.userId,
    stripe_subscription_id: p.stripeSubscriptionId,
    status: p.status,
    current_period_end: p.currentPeriodEnd,
    agents_settings_qty: p.agentsQty,
    credits_monthly: p.creditsMonthly,
    stripe_price_agents_id: p.stripePriceAgentsId,
    stripe_price_credits_id: p.stripePriceCreditsId,
    cycle: p.cycle,
  })
}

function subToPayload(sub: Stripe.Subscription): SubPayload {
  const meta = sub.metadata ?? {}
  const userId = meta.supabase_user_id
  if (!userId) throw new Error(`Missing supabase_user_id in subscription metadata: ${sub.id}`)
  let cycle: string | null = meta.cycle === 'monthly' || meta.cycle === 'yearly' ? meta.cycle : null
  if (!cycle) {
    const interval = sub.items?.data?.[0]?.price?.recurring?.interval
    cycle = interval === 'year' ? 'yearly' : interval === 'month' ? 'monthly' : null
  }
  return {
    userId,
    stripeSubscriptionId: sub.id,
    status: sub.status ?? 'incomplete',
    currentPeriodEnd: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
    agentsQty: Number(meta.agents_qty ?? 0),
    creditsMonthly: Number(meta.credits ?? 0) || CREDITS_PER_PLAN,
    stripePriceAgentsId: meta.stripe_price_agents_id ?? null,
    stripePriceCreditsId: meta.stripe_price_credits_id ?? null,
    cycle,
  }
}

async function grantPackCredits(session: Stripe.Checkout.Session, eventId: string) {
  const userId = session.metadata?.supabase_user_id ?? null
  const packCredits = Number(session.metadata?.pack_credits ?? 0)
  if (!userId || packCredits <= 0) return
  const seen = await admin
    .from('paiement_credit_transactions')
    .select('id')
    .eq('stripe_event_id', eventId)
    .limit(1)
  if ((seen.data?.length ?? 0) > 0) return
  await admin.from('paiement_credit_transactions').insert({
    user_id: userId,
    type: 'pack_purchase',
    amount: packCredits,
    stripe_event_id: eventId,
  })
  // Un pack rend des crédits dans la période en cours (solde consommé réduit).
  const { data: profile } = await admin
    .from('profiles')
    .select('credits_consumed_in_period')
    .eq('user_id', userId)
    .single()
  await admin
    .from('profiles')
    .update({
      credits_consumed_in_period: Number(profile?.credits_consumed_in_period ?? 0) - packCredits,
    })
    .eq('user_id', userId)
}

async function webhook(req: Request) {
  const sig = req.headers.get('stripe-signature')
  if (!sig) return new Response('missing signature', { status: 400 })
  const rawBody = await req.text()
  let event: Stripe.Event
  try {
    const cryptoProvider = Stripe.createSubtleCryptoProvider()
    event = await stripe.webhooks.constructEventAsync(rawBody, sig, WEBHOOK_SECRET, undefined, cryptoProvider)
  } catch (e) {
    return new Response(`invalid signature: ${String(e).slice(0, 100)}`, { status: 400 })
  }

  // L'événement n'est marqué traité qu'après succès : si le traitement échoue,
  // Stripe réessaiera et retrouvera un événement encore absent de cette table
  // plutôt que de le voir déjà enregistré et de l'ignorer à tort.
  const { data: already } = await admin
    .from('paiement_stripe_webhook_events')
    .select('event_id')
    .eq('event_id', event.id)
    .maybeSingle()
  if (already) return json(req, { received: true })

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session
        if (session.mode === 'subscription' && session.subscription) {
          const sub = await stripe.subscriptions.retrieve(session.subscription as string, {
            expand: ['items.data.price'],
          })
          await writeSubscriptionToDB(subToPayload(sub))
        }
        if (session.mode === 'payment') {
          await grantPackCredits(session, event.id)
        }
        break
      }
      case 'customer.subscription.updated': {
        await writeSubscriptionToDB(subToPayload(event.data.object as Stripe.Subscription))
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription
        await admin
          .from('paiement_subscriptions')
          .update({
            status: 'canceled',
            current_period_end: sub.current_period_end
              ? new Date(sub.current_period_end * 1000).toISOString()
              : null,
            updated_at: new Date().toISOString(),
          })
          .eq('stripe_subscription_id', sub.id)
        const userId = sub.metadata?.supabase_user_id
        if (userId) {
          // L'assistant est mis en pause, rien n'est supprimé (retour possible).
          await admin
            .from('assistants')
            .update({ is_active: false, paused_reason: 'subscription_ended', updated_at: new Date().toISOString() })
            .eq('user_id', userId)
            .eq('is_active', true)
        }
        break
      }
      case 'invoice.paid': {
        const invoice = event.data.object as Stripe.Invoice
        if (invoice.subscription) {
          const sub = await stripe.subscriptions.retrieve(invoice.subscription as string, {
            expand: ['items.data.price'],
          })
          const payload = subToPayload(sub)
          await writeSubscriptionToDB(payload)
          await admin
            .from('profiles')
            .update({
              credits_consumed_in_period: 0,
              credits_period_started_at: new Date().toISOString(),
            })
            .eq('user_id', payload.userId)
        }
        break
      }
      default:
        break
    }
  } catch (e) {
    await logEvent('error', 'billing', `webhook ${event.type} en échec: ${String(e).slice(0, 300)}`)
    return json(req, { error: 'handler_failed' }, 500)
  }
  await admin.from('paiement_stripe_webhook_events').insert({ event_id: event.id, event_type: event.type })
  return json(req, { received: true })
}

Deno.serve(async (req) => {
  const opt = handleOptions(req)
  if (opt) return opt
  const path = new URL(req.url).pathname
  try {
    if (req.method === 'POST' && path.endsWith('/billing/stripe-webhook')) return await webhook(req)
    if (req.method === 'POST' && path.endsWith('/billing/stripe-create-checkout-coach')) return await checkoutCoach(req)
    if (req.method === 'POST' && path.endsWith('/billing/stripe-create-checkout-credits')) return await checkoutCredits(req)
    if (req.method === 'POST' && path.endsWith('/billing/stripe-create-portal')) return await portal(req)
    if (req.method === 'GET' && path.endsWith('/billing/info')) return await info(req)
    return json(req, { error: 'Not found' }, 404)
  } catch (e) {
    await logEvent('error', 'billing', `${path} en échec: ${String(e).slice(0, 300)}`)
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders(req), 'content-type': 'application/json' },
    })
  }
})
