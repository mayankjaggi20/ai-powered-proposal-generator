RFP to Proposal agent (POC)

Upload an RFP, the agent reads it, searches the web about the client, uses the files in /knowledge,
asks you questions, then writes a plain-text first draft with a compliance check.

Run locally
1. npm install
2. Copy .env.example to .env.local and fill in ANTHROPIC_API_KEY
3. npm run dev, then open http://localhost:3000

Deploy to Vercel
1. Push this folder to a private GitHub repo
2. vercel.com, Add New Project, import the repo (framework: Next.js, detected automatically)
3. Settings, Environment Variables: ANTHROPIC_API_KEY (optional: CLAUDE_MODEL)
4. Deploy

Anthropic Console: web search must be enabled for your organization, or analysis will fail.
