# Lead Control

Multi-agent cockpit for inbound leads. Configure AI agents, follow their conversations across channels, take over when a human is needed.

Live: **https://leadcontrol.fr**

## What it does

**Agent workspace.** Every agent gets its own dashboard: KPI grid per channel, conversation board sorted by activity, message thread with attachments and pending states, and a composer that posts through a Supabase Edge Function relay.

**Configuration that cannot lie.** The activation switch stays locked until every required field of the selected connector holds a value. Renaming an agent is validated against duplicates. Connector forms are built from the connector definition, so adding a channel does not mean writing another form.

**Capability guards.** A module renders only when the account actually owns the matching agent. `useCrmAccess` and `useScrapingAccess` read the live agent list and redirect, instead of rendering an empty shell to someone who cannot use it.

**Billing.** Stripe subscription plus credit packs, with the customer portal and a confirmation step before cancellation, because cancelling clears the conversation history.

**Auth.** Supabase email and password. Login, signup, password reset and recovery all return the same generic message whether or not the account exists, so the forms never confirm an address to someone probing them.

## Stack

| Layer | Choice |
| --- | --- |
| Front | React 18, TypeScript, Vite |
| UI | MUI 7, CSS Modules, lucide-react |
| Data | TanStack Query v5, Supabase JS v2 |
| Backend | Supabase: Postgres, Auth, Realtime, Storage, Edge Functions |
| Payments | Stripe |

## A few decisions worth explaining

**Realtime channels instead of polling.** Connector state and conversations change from the backend, not from the browser. The pages subscribe to Supabase channels, so a connector that drops updates its row without anyone refreshing.

**Query cache at 5 minutes, no refetch on focus.** An operator switches tabs constantly while handling conversations. Refetching on every focus meant a visible reflow several times a minute, for data that moves through the realtime channel anyway.

**Guards as hooks, not as route metadata.** Access depends on which agents the account owns, which is data, not configuration. Putting it in the route table meant a second source of truth that drifted.

**Optimistic progress bar on long runs.** A scrape run reports through a channel, but the first event lands seconds after the click. The bar starts on the click and reconciles on the first real event, so the button never looks dead.

## Running it locally

```bash
npm install
cp .env.example .env
npm start
```

`npm run build` type-checks with `tsc` before bundling, so a type error fails the build instead of shipping.

Deployed on Netlify, with a catch all redirect to `index.html` so client side routing survives a page refresh on a deep link.

## Environment

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase anonymous key, safe for the browser, all access gated by row level security |
| `VITE_SCRAPING_EDGE_URL` | Base URL of the Edge Functions handling long running jobs |
| `VITE_META_APP_ID` | Meta app id, used by the Instagram OAuth return |
| `VITE_FEEDBACK_KEY` | Key of the in app feedback endpoint |

The front end only ever holds the anonymous key. Row level security decides what an account can read, not the client.

## Status

Shipped and in use. The conversation, agent configuration, connector and billing paths run on live data. The CRM table is still presentation only, pending its data model.

## License

Source available for review. Not licensed for reuse, redistribution or derivative work.
