---
name: narrativetrace-feedback
description: "Reports a defect in NarrativeTrace itself — the library, the doctor, an agent skill, or the published install prompt. Use when a doctor finding is wrong or its fix does not work, when a skill step cannot be followed or its verify cannot be met, when the install prompt is wrong, or when the library misbehaves and the project is configured correctly. Drafts the report from this project (the install coordinates, the doctor's own JSON report, and at most one structural trace), refuses to write one that carries a value from your traces and names the rule that refused it, shows you the whole draft, and then asks once whether to file it publicly. Files nothing without your answer and sends nothing anywhere. Say 'report this to NarrativeTrace', 'the doctor's fix did not work', or 'file a bug about this skill' to invoke it."
when_to_use: "Non-obvious triggers: a doctor fix that leaves the same finding failing; a skill step whose verify cannot be met on a correctly configured project; wording in the install prompt that led somewhere wrong."
---

# narrativetrace-feedback

## 1. Gather what the report needs

```bash
npx @narrativetrace/cli doctor || true
```

**verify:** `npx @narrativetrace/cli doctor --json | node -e "const r=JSON.parse(require('fs').readFileSync(0,'utf8')); if(!Array.isArray(r.findings)||r.findings.length!==25) process.exit(1);"`

**failure:** the doctor's JSON output does not parse, or is missing findings — the CLI crashed instead of reporting a finding. Fix: report that crash under the `doctor` category — a crash here is a doctor bug, never a project finding

## 2. Draft the report and let the gate check it

```bash
npx @narrativetrace/cli feedback draft --category <category> --step "<where it happened>" --did "<what you did>" --happened "<what happened>" --expected "<what you expected>"
```

**verify:** `node -e "const fs=require('fs'); if(!fs.existsSync('narrativetrace-output/feedback/feedback-draft.md')||!fs.existsSync('narrativetrace-output/feedback/feedback-body.md')) process.exit(1);"`

**failure:** the command exits 2 saying: unknown category "..." — the category is the part of NarrativeTrace the problem is in, and it is one of four words. Fix: use prompt, skill, doctor or library — the install prompt, an agent skill, a doctor check, or the library itself

**failure:** the command exits 2 naming a vf.* rule — a field carries a value from this project's own run — a rendered call line, an elapsed time, a credential-shaped string, an address. Fix: rewrite that one field to describe what happened instead of pasting it, and draft again; never work around the rule by moving the text to another field

## 3. Show the whole draft, not a summary of it

**Flagged:** judgmental — the whole text of narrativetrace-output/feedback/feedback-draft.md is in the reply, not a summary of it

```bash
node -e "process.stdout.write(require('fs').readFileSync('narrativetrace-output/feedback/feedback-draft.md','utf8'));"
```

## 4. Ask once whether to file it, then stop the turn

**Flagged:** judgmental — the reply ends with the question and nothing after it; the answer is the user's next message, never something assumed in this one. Do not print the issue URL or run gh before the user says yes — showing the URL is the filing.

## 5. Print the way to file it, and nothing else

**Flagged:** judgmental — the printed URL is in the reply, together with the name of narrativetrace-output/feedback/feedback-body.md to paste

```bash
npx @narrativetrace/cli feedback url --category <category> --step "<where it happened>" --did "<what you did>" --happened "<what happened>" --expected "<what you expected>"
```

## Always

- Show the whole draft before asking anything (filing is public and permanent, and a person can only approve what they have actually read)
- Ask in the user's own language (the report may be written in any language, and a question nobody understands is not a question)
- Pass --language with the report's language tag whenever it is not English (the form is English and the report is not, so the language field and label are what lets a maintainer route it to someone who reads it)
- Tell the user that filing is public, under their own account, before they answer (a public issue shows that their project uses NarrativeTrace, and that is their decision to make knowingly)

## Never

- Never attach a rendered trace, a log file or a source file (those carry the values from the user's own run; the structural trace carries the same shape of the same call without any of them, and the verb attaches it on its own)
- Never file in the turn that asked (approval is the user's next message — a yes assumed in the same turn is not one)
- Never edit the draft after showing it (what was approved has to be what is filed, so a changed report is drafted again and shown again)
- Never open the URL or run the printed command (submitting is the user's act, in their own browser or their own shell, under their own account)
- Never route a rule's refusal around the gate (a field that cannot be filed is a field to rewrite, not to move somewhere the rule does not look)
