# RealmMaster — Setup Guide
# GitHub + Cloudflare Pages + Supabase
# No terminal required. ~45 minutes.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 1 — CREATE YOUR GITHUB REPOSITORY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to github.com and sign in (or create account)
2. Click the "+" icon → "New repository"
3. Name it: realmmaster
4. Set to Private
5. Click "Create repository"
6. On the next screen, click "uploading an existing file"
7. Drag and drop ALL files from the realmmaster/ folder
   (make sure to include hidden files like .env.local.example)
8. Click "Commit changes"

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 2 — CREATE YOUR SUPABASE PROJECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to supabase.com → Sign up (free)
2. Click "New Project"
3. Name: realmmaster | Choose region closest to you
4. Set a strong database password → Save it somewhere
5. Wait ~2 minutes for provisioning

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 3 — RUN THE DATABASE SCHEMA
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. In Supabase, click "SQL Editor" (left sidebar)
2. Click "New query"
3. Open supabase/schema.sql from this project
4. Copy the ENTIRE file contents
5. Paste into the SQL editor
6. Click "Run" → Should show "Success. No rows returned."

This creates:
  ✓ worlds, players, messages tables
  ✓ sessions table (tracks each play session)
  ✓ character_knowledge table (the memory ledger)
  ✓ document_files table
  ✓ Row-level security policies
  ✓ Storage buckets for file uploads
  ✓ Helper functions for memory queries

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 4 — GET YOUR SUPABASE API KEYS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

In Supabase → Settings (gear icon) → API:

  NEXT_PUBLIC_SUPABASE_URL
  → "Project URL" — looks like https://abcxyz.supabase.co

  NEXT_PUBLIC_SUPABASE_ANON_KEY
  → "anon / public" key — long string starting with eyJ...

  SUPABASE_SERVICE_ROLE_KEY
  → "service_role / secret" key — another eyJ... string
  → ⚠ Keep this secret. Never commit it to GitHub.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 5 — GET YOUR ANTHROPIC API KEY
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to console.anthropic.com → Sign in
2. Click "API Keys" → "Create Key"
3. Name it "realmmaster"
4. Copy the key (starts with sk-ant-...)
5. Add a payment method and some credits
   (Cost: ~$0.01–0.05 per full session. Very cheap.)

  ANTHROPIC_API_KEY = sk-ant-...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 6 — DEPLOY TO CLOUDFLARE PAGES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. Go to dash.cloudflare.com → Sign up (free)
2. Click "Workers & Pages" in the left sidebar
3. Click "Create application" → "Pages" tab
4. Click "Connect to Git"
5. Authorize GitHub and select your "realmmaster" repo
6. Configure the build:

   Framework preset:     Next.js
   Build command:        npx @cloudflare/next-on-pages@1
   Build output dir:     .vercel/output/static
   Root directory:       (leave blank)

7. Click "Save and Deploy"
   → First build takes 3–5 minutes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 7 — ADD ENVIRONMENT VARIABLES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

This is the most critical step.

1. In Cloudflare Pages, click your project
2. Go to "Settings" → "Environment variables"
3. Under "Production", click "Add variable" for each:

   Variable name                    Value
   ─────────────────────────────────────────────────────
   NEXT_PUBLIC_SUPABASE_URL         https://xxx.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY    eyJ... (anon key)
   SUPABASE_SERVICE_ROLE_KEY        eyJ... (service role key) ← Encrypt this one
   ANTHROPIC_API_KEY                sk-ant-...               ← Encrypt this one

   For SUPABASE_SERVICE_ROLE_KEY and ANTHROPIC_API_KEY:
   → Click the lock icon to mark them as "encrypted"

4. After adding all 4, go to "Deployments" tab
5. Click "Retry deployment" on the latest deployment
6. Wait ~3 minutes

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 8 — CONFIGURE SUPABASE AUTH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

1. In Supabase → Authentication → URL Configuration
2. Set "Site URL" to your Cloudflare Pages URL
   (looks like: https://realmmaster.pages.dev)
3. Under "Redirect URLs" add:
   https://realmmaster.pages.dev/**
4. Click Save

If you set up a custom domain on Cloudflare, also add that URL.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
STEP 9 — FIRST USE (YOUR WORKFLOW)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

As DM:
  1. Visit your Cloudflare Pages URL
  2. Sign up with your email and a password → you're the DM
  3. Go to World tab → Enter world name and lore text → Save
  4. Go to Players tab → Add each player by name
  5. Copy each player's unique link
  6. Send the links to your players

As Player (they receive the link):
  1. Open the link — no account needed
  2. Fill in character name, class, background
  3. Enter what their character knows about the world at start
  4. Paste character sheet if they have one
  5. Save → start chatting

Between sessions (as DM):
  - Go to Knowledge tab → select a player
  - Grant new knowledge they earned this session
  - See their auto-generated session summaries
  - Edit or revoke knowledge entries

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
HOW THE CAMPAIGN MEMORY WORKS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Every chat session, the AI DM receives:
  1. Your full world canon text
  2. The character's sheet + background
  3. ALL past session summaries (in order)
  4. The character's complete knowledge ledger
  5. The last 12 messages for immediate context

When a player clicks "End & Summarize Session":
  → Claude reads the full transcript
  → Generates a 3-5 sentence narrative summary
  → Extracts new facts the character learned
  → Saves them to the knowledge ledger automatically
  → You (DM) can edit/approve/revoke anything in Knowledge tab

This means a character who discovered the hidden cult in Session 2
will still know about it in Session 15. The AI DM remembers everything.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Build fails on Cloudflare:
→ Make sure build command is exactly: npx @cloudflare/next-on-pages@1
→ Check that Node.js compatibility flag is enabled:
   Cloudflare Pages → Settings → Functions → Compatibility flags
   Add: nodejs_compat

Chat doesn't respond:
→ Check ANTHROPIC_API_KEY in Cloudflare env vars
→ Make sure you have Anthropic credits

"Invalid invite link":
→ Copy the full URL — token is the last part after /play/

Session summaries not generating:
→ Need at least 2-3 messages in the session
→ Check Anthropic API key has credits

DM can't log in:
→ Check Supabase Site URL matches your Cloudflare domain exactly
→ Try the "Forgot password" flow

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
FILE STRUCTURE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

realmmaster/
├── pages/
│   ├── index.tsx                  DM Portal (4 tabs)
│   ├── play/[token].tsx           Player Portal
│   ├── _app.tsx
│   └── api/
│       ├── auth/dm.ts             DM login/signup
│       ├── dm/
│       │   ├── worlds.ts          World CRUD
│       │   ├── players.ts         Player management
│       │   ├── knowledge.ts       Knowledge ledger CRUD
│       │   └── logs.ts            Session logs
│       └── player/
│           ├── setup.ts           Character save/load
│           ├── chat.ts            Streaming AI DM chat
│           └── end-session.ts     Summarization + knowledge extraction
├── lib/
│   ├── supabase.ts                DB client (edge compatible)
│   ├── auth.ts                    Auth helper
│   └── memory.ts                  Campaign memory builder + system prompt
├── supabase/
│   └── schema.sql                 Run this in Supabase SQL editor
├── wrangler.toml                  Cloudflare config
├── next.config.js
└── package.json
