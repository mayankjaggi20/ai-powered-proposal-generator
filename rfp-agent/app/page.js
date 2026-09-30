"use client";

import { useRef, useState } from "react";

const MAX_PDF_MB = 3; // Vercel caps request bodies at about 4.5 MB

function readFile(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onerror = () => reject(new Error("Could not read the file."));
    if (file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
      r.onload = () => resolve({ kind: "pdf", name: file.name, data: r.result.split(",")[1] });
      r.readAsDataURL(file);
    } else {
      r.onload = () => resolve({ kind: "text", name: file.name, text: r.result });
      r.readAsText(file);
    }
  });
}

function verdictClass(v = "") {
  const s = v.toLowerCase();
  if (s.startsWith("no")) return "nogo";
  if (s.includes("caution")) return "caution";
  return "go";
}

export default function Home() {
  const [file, setFile] = useState(null);
  const [pasted, setPasted] = useState("");
  const [notes, setNotes] = useState("");
  const [rfp, setRfp] = useState(null);

  const [analysis, setAnalysis] = useState(null);
  const [sources, setSources] = useState([]);
  const [answers, setAnswers] = useState({});
  const [draft, setDraft] = useState("");
  const [checkClaims, setCheckClaims] = useState(true);
  const [review, setReview] = useState(null);

  const [busy, setBusy] = useState(""); // "", "analyzing", "drafting"
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const paperRef = useRef(null);

  async function analyze() {
    setError("");
    setAnalysis(null);
    setDraft("");
    let doc;
    try {
      if (file) {
        if (file.size > MAX_PDF_MB * 1024 * 1024) {
          throw new Error(`That file is over ${MAX_PDF_MB} MB. Paste the RFP text instead, or remove appendices from the PDF.`);
        }
        doc = await readFile(file);
      } else if (pasted.trim()) {
        doc = { kind: "text", name: "Pasted RFP", text: pasted };
      } else {
        throw new Error("Upload an RFP file or paste its text.");
      }
    } catch (e) {
      setError(e.message);
      return;
    }

    setRfp(doc);
    setBusy("analyzing");
    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfp: doc, notes }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Analysis failed (${res.status}).`);
      setAnalysis(data.analysis);
      setSources(data.sources || []);
      setCheckClaims(data.checkClaims !== false);
      setAnswers({});
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function factCheck(text) {
    setBusy("checking");
    setReview(null);
    try {
      const res = await fetch("/api/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfp, analysis, answers, draft: text }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Fact-check failed (${res.status}).`);
      setReview(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy("");
    }
  }

  async function writeProposal() {
    setError("");
    setDraft("");
    setReview(null);
    setBusy("drafting");
    let finished = "";
    try {
      const res = await fetch("/api/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rfp, analysis, answers }),
      });
      if (!res.ok || !res.body) throw new Error((await res.text()) || `Drafting failed (${res.status}).`);
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let text = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        text += decoder.decode(value, { stream: true });
        setDraft(text);
      }
      finished = text;
    } catch (e) {
      setError(e.message);
    }
    setBusy("");
    if (finished && checkClaims) await factCheck(finished);
  }

  async function copyDraft() {
    await navigator.clipboard.writeText(draft);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function downloadDraft() {
    const blob = new Blob([draft], { type: "text/plain" });
    const a = document.createElement("a");
    const base = (analysis?.client || "proposal").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.href = URL.createObjectURL(blob);
    a.download = `${base}-proposal-draft.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const questions = analysis?.questions || [];

  return (
    <main>
      <h1>RFP to proposal</h1>
      <p className="lede">
        Upload an RFP. The agent reads it, researches the client, checks our knowledge base, asks what it
        can&apos;t find, then writes a first draft you can edit.
      </p>

      <section className="step">
        <div className="step-head">
          <span className="step-num">1</span>
          <div>
            <h2>Add the RFP</h2>
            <p>PDF, TXT or Markdown up to {MAX_PDF_MB} MB, or paste the text.</p>
          </div>
        </div>

        <label htmlFor="file" style={{ marginTop: 0 }}>RFP file</label>
        <input id="file" type="file" accept=".pdf,.txt,.md" onChange={(e) => setFile(e.target.files?.[0] || null)} />

        <label htmlFor="paste">
          Or paste the RFP text <span className="hint">(used only if no file is chosen)</span>
        </label>
        <textarea id="paste" rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)} />

        <label htmlFor="notes">
          Notes for the agent <span className="hint">(optional: context, angle, competitors)</span>
        </label>
        <textarea id="notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />

        <div className="row">
          <button onClick={analyze} disabled={!!busy}>
            {busy === "analyzing" ? "Analyzing…" : "Analyze RFP"}
          </button>
          {busy === "analyzing" && (
            <span className="status" role="status">Reading the RFP and researching the client. This takes 1 to 3 minutes.</span>
          )}
        </div>
        {error && !analysis && <div className="error" role="alert">{error}</div>}
      </section>

      <section className="step" aria-disabled={!analysis}>
        <div className="step-head">
          <span className="step-num">2</span>
          <div>
            <h2>Answer the agent&apos;s questions</h2>
            <p>Leave any blank and the draft will mark it [TO CONFIRM].</p>
          </div>
        </div>

        {analysis && (
          <>
            <dl className="meta">
              <dt>Client</dt>
              <dd>{analysis.client || "Unknown"}</dd>
              <dt>RFP</dt>
              <dd>{analysis.rfp_title || "Untitled"}</dd>
              <dt>Due</dt>
              <dd>{analysis.due_date || "Not stated"}</dd>
              <dt>Fit</dt>
              <dd>
                <span className={`verdict ${verdictClass(analysis.fit?.verdict)}`}>{analysis.fit?.verdict || "Unrated"}</span>{" "}
                {analysis.fit?.reason}
              </dd>
            </dl>
            <p>{analysis.summary}</p>

            <details>
              <summary>Client research</summary>
              <p style={{ fontSize: 15 }}>{analysis.client_research}</p>
              {sources.length > 0 && (
                <ul>
                  {sources.map((s) => (
                    <li key={s.url}>
                      <a href={s.url} target="_blank" rel="noreferrer">{s.title || s.url}</a>
                    </li>
                  ))}
                </ul>
              )}
            </details>

            {analysis.risks?.length > 0 && (
              <details>
                <summary>Risks and red flags ({analysis.risks.length})</summary>
                <ul>{analysis.risks.map((r, i) => <li key={i}>{r}</li>)}</ul>
              </details>
            )}

            <details>
              <summary>Requirements found ({analysis.requirements?.length || 0})</summary>
              <ul>
                {(analysis.requirements || []).map((r) => (
                  <li key={r.id}>
                    <span className="tag">{r.id}{r.mandatory ? ", mandatory" : ""}</span> {r.text}
                  </li>
                ))}
              </ul>
            </details>

            <details>
              <summary>Required proposal structure</summary>
              <ul>
                {(analysis.response_structure || []).map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </details>

            <div style={{ marginTop: 24 }}>
              {questions.length === 0 && <p className="status">The agent has no questions. Go ahead and write the proposal.</p>}
              {questions.map((q) => (
                <div className="question" key={q.id}>
                  <label htmlFor={q.id}>{q.question}</label>
                  {q.why && <p className="why">{q.why}</p>}
                  <textarea
                    id={q.id}
                    rows={2}
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                  />
                </div>
              ))}
            </div>

            <div className="row">
              <button onClick={writeProposal} disabled={!!busy}>
                {busy === "drafting" ? "Writing…" : draft ? "Rewrite proposal" : "Write proposal"}
              </button>
              {busy === "drafting" && <span className="status" role="status">Writing section by section.</span>}
            </div>
            {error && analysis && <div className="error" role="alert">{error}</div>}
          </>
        )}
      </section>

      <section className="step" aria-disabled={!draft}>
        <div className="step-head">
          <span className="step-num">3</span>
          <div>
            <h2>Review the draft</h2>
            <p>Plain text with a compliance check, then an automatic check for unsupported claims.</p>
          </div>
        </div>

        {draft && (
          <>
            <div className="row" style={{ marginTop: 0 }}>
              <button className="secondary" onClick={copyDraft} disabled={busy === "drafting"}>
                {copied ? "Copied" : "Copy text"}
              </button>
              <button className="secondary" onClick={downloadDraft} disabled={busy === "drafting"}>
                Download .txt
              </button>
              <button className="secondary" onClick={() => factCheck(draft)} disabled={!!busy}>
                {busy === "checking" ? "Checking…" : "Check claims"}
              </button>
            </div>

            {busy === "checking" && (
              <p className="status" role="status">Checking every claim against the knowledge base, RFP and your answers.</p>
            )}
            {review && (
              <div className={`review ${review.issues?.length ? "has-issues" : "clean"}`}>
                <p className="review-title">
                  {review.issues?.length
                    ? `${review.issues.length} claim${review.issues.length > 1 ? "s" : ""} to fix before sending`
                    : "No unsupported claims found"}
                </p>
                {review.issues?.length > 0 && (
                  <ol>
                    {review.issues.map((it, i) => (
                      <li key={i}>
                        <q>{it.claim}</q>
                        <span className="problem">{it.problem}</span>
                        {it.fix && <span className="fix">Fix: {it.fix}</span>}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            )}
            <div className="paper" ref={paperRef}>{draft}</div>
          </>
        )}
      </section>
    </main>
  );
}
