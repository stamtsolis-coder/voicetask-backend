import "dotenv/config";
import express from "express";
import cors from "cors";
import Anthropic from "@anthropic-ai/sdk";

const app = express();
app.use(cors());
app.use(express.json({ limit: "200kb" }));

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// The model does the actual "context, not just transcription" extraction:
// it reads the whole spoken passage and returns separate, structured tasks.
const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5-20251001";

const EXTRACT_TOOL = {
  name: "extract_tasks",
  description:
    "Extract a list of separate, structured to-do tasks from a raw spoken transcript (Greek or English).",
  input_schema: {
    type: "object",
    properties: {
      tasks: {
        type: "array",
        items: {
          type: "object",
          properties: {
            title: {
              type: "string",
              description: "Short, clean task title, written as an action (e.g. 'Αγορά γάλα')."
            },
            category: {
              type: "string",
              enum: ["Δουλειά", "Προσωπικά", "Ψώνια", "Άλλο"],
              description: "Best-fit category for this task."
            },
            person: {
              type: ["string", "null"],
              description: "A named person this task involves, if any, else null."
            },
            deadline: {
              type: ["string", "null"],
              description:
                "A short human-readable deadline phrase mentioned for this task (e.g. 'Παρασκευή', 'αύριο'), else null."
            },
            priority: {
              type: ["string", "null"],
              description: "'Επείγον' if the speaker signals urgency for this task, else null."
            },
            originalText: {
              type: "string",
              description: "The exact original snippet of the transcript this task was extracted from."
            }
          },
          required: ["title", "category", "originalText"]
        }
      }
    },
    required: ["tasks"]
  }
};

app.post("/parse", async (req, res) => {
  const { transcript } = req.body || {};
  if (typeof transcript !== "string" || !transcript.trim()) {
    return res.status(400).json({ error: "Missing 'transcript' string in request body." });
  }

  try {
    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1024,
      system:
        "You turn a spoken or typed transcript into one or more structured to-do tasks.\n\n" +
        "DEFAULT RULE: if the transcript expresses a SINGLE continuous thought, note, complaint, description or " +
        "request — even if it is a long run-on sentence containing words like 'αλλά', 'και', 'ή', 'επειδή', or " +
        "commas used mid-thought — keep it as ONE single task. Do not fragment one idea into several tasks just " +
        "because it has multiple clauses or connecting words. When in doubt, prefer ONE task over splitting.\n\n" +
        "ONLY split into multiple tasks when the speaker is clearly rattling off several separate, unrelated " +
        "errands/appointments back to back — short independent phrases, each with its own distinct action, " +
        "usually said one after another (often, but not only, separated by commas). If removing one clause " +
        "would leave the rest still making complete sense as an unrelated task, they are separate. If the " +
        "clauses depend on each other to make sense (one continuous point being made), they are ONE task.\n\n" +
        "Never combine words from unrelated clauses into a single garbled/nonsensical title. When a transcript " +
        "is a single note or thought, its title should preserve the full meaning (lightly cleaned up, not " +
        "truncated or dropped) — do not aggressively shorten it into a fragment that loses information. When a " +
        "transcript contains several distinct short errands, give each its own short, clean title.\n\n" +
        "Examples:\n" +
        "Input: \"Πάρε τηλέφωνο στον Γιάννη αύριο, αγόρασε ψωμί μέχρι το Σάββατο, ραντεβού στο γραφείο μέχρι τις 5\"\n" +
        "→ THREE separate short errands, one after another → 3 tasks:\n" +
        "1) title: 'Τηλεφώνημα στον Γιάννη', person: 'Γιάννης', deadline: 'αύριο', category: 'Προσωπικά'\n" +
        "2) title: 'Αγορά ψωμί', deadline: 'Σάββατο', category: 'Ψώνια'\n" +
        "3) title: 'Ραντεβού στο γραφείο', deadline: 'μέχρι τις 5', category: 'Δουλειά'\n\n" +
        "Input: \"Να θυμηθώ ότι υπάρχει μεγάλο θέμα με την εφαρμογή, δεν αποθηκεύει σωστά το κείμενο αλλά το " +
        "σπάει σε πολλά κομμάτια\"\n" +
        "→ ONE continuous thought/note about a single problem → 1 task:\n" +
        "1) title: 'Θέμα με την εφαρμογή: δεν αποθηκεύει σωστά το κείμενο, το σπάει σε πολλά κομμάτια', " +
        "category: 'Δουλειά'\n\n" +
        "Infer category/person/deadline/priority from context (not just keyword matching), and keep the same " +
        "language as the transcript. Always call the extract_tasks tool with your result.",
      tools: [EXTRACT_TOOL],
      tool_choice: { type: "tool", name: "extract_tasks" },
      messages: [{ role: "user", content: transcript }]
    });

    const toolUse = message.content.find((block) => block.type === "tool_use");
    if (!toolUse) {
      return res.status(502).json({ error: "Model did not return structured tasks." });
    }

    const tasks = (toolUse.input.tasks || []).map((t, i) => ({
      id: `ai-${Date.now()}-${i}`,
      completed: false,
      person: null,
      deadline: null,
      priority: null,
      ...t
    }));

    res.json({ tasks });
  } catch (err) {
    console.error("[/parse] error:", err);
    res.status(500).json({ error: "Failed to parse transcript." });
  }
});

app.get("/health", (_req, res) => res.json({ ok: true }));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`VoiceTask backend listening on port ${port}`);
});
