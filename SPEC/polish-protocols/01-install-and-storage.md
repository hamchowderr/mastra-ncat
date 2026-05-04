# NCA Polish 01 — Install Required Packages + Configure Editor Storage

## Step 1: Install packages

Both packages are required.

```bash
cd C:\Users\HamCh\code\template-mastra-nca
npm install @mastra/editor @mastra/mcp
```

Verify:
```bash
npm list @mastra/editor @mastra/mcp
```

**Pass**: both packages listed. Current versions at the time of writing are `@mastra/editor@0.7.22` and `@mastra/mcp@1.6.0`. Don't pin to a minimum — let npm pick the latest compatible.

## Step 2: Configure editor storage

Open `src/mastra/index.ts`. NCA's `MastraCompositeStore` looks like:

```typescript
storage: new MastraCompositeStore({
  id: 'composite-storage',
  default: new PostgresStore({ id: 'mastra-storage', connectionString: env.SUPABASE_DB_URL }),
  domains: {
    observability: await new DuckDBStore().getStore('observability'),
  },
}),
```

**Important — `editor` is a TOP-LEVEL field on `MastraCompositeStoreConfig`, not a domain.** Do NOT put it inside `domains`. The Mastra type definition exposes `editor?: PostgresStore` as a sibling of `default` and `domains`. Putting it inside `domains` will fail typecheck — `editor` is not a valid key in `Partial<StorageDomains>`.

Required state:

```typescript
storage: new MastraCompositeStore({
  id: 'composite-storage',
  default: new PostgresStore({ id: 'mastra-storage', connectionString: env.SUPABASE_DB_URL }),
  editor: new PostgresStore({ id: 'mastra-editor-storage', connectionString: env.SUPABASE_DB_URL }),
  domains: {
    observability: await new DuckDBStore().getStore('observability'),
  },
}),
```

**Pass**: typecheck passes.

```bash
npm run typecheck
```

## What to capture in PROGRESS.md

```
## NCA Polish 01: Install Packages + Editor Storage
- Status: complete
- Installed: @mastra/editor v<version>, @mastra/mcp v<version>
- File changed: src/mastra/index.ts (added editor as top-level field on MastraCompositeStore)
- nca.ts HTTP client untouched: confirmed
- Verification: typecheck passes
```

Move on to Polish 02.
