Agent configuration

Edit these files in GitHub. Vercel redeploys automatically and the agent uses the new version.

settings.json
  model                     Claude model for all steps (e.g. claude-sonnet-5-5, claude-opus-5-5)
  max_web_searches          Web searches allowed per RFP analysis
  max_questions             Most questions the agent may ask you
  blocked_domains           Sites the agent must never use for research, e.g. ["competitor.com"]
  allowed_domains           If filled, research is limited to only these sites. Leave empty for the open web.
                            Use one or the other, not both.
  check_claims_after_draft  true = automatically fact-check every draft against your sources

company-voice.md            How we write: tone, style, words to use and avoid. Applies to every step.
guardrails.md               Hard rules the agent must never break. Applies to every step.
analyst-instructions.md     Step 1: how to read the RFP, research, and what to ask you.
writer-instructions.md      Step 3: how to write the proposal.
reviewer-instructions.md    Fact-check: how strictly to check the draft.

The output formats the app depends on (the JSON structure of the analysis and the fact-check)
are kept in the code so an edit here cannot break the app.
