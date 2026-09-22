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
        "You turn a stream-of-consciousness spoken transcript into separate, structured to-do tasks. " +
        "Split run-on sentences into individual tasks, infer category/person/deadline/priority from context " +
        "(not just keyword matching), and keep titles short and in the same language as the transcript. " +
        "Always call the extract_tasks tool with your result.",
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
