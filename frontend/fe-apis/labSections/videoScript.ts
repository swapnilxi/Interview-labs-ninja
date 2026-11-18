/**
 * fe-apis/labSections/videoScript.ts
 *
 * The AI-written video script of a lab page (a topic's page, or one of its subtopics). Twin of
 * backend/modules/lab_sections/video_script.py: the same table, prompt text (byte for byte), limits and texts, so change both.
 *
 * "Generate Video Script" in the page's "Videos and links" section asks the model for a script a person can record. The latest
 * script is kept per user and page in `lab_video_scripts` (one row, replaced when it is regenerated) so it is still there on
 * return; a page load only reads it. It is deliberately NOT a row of `lab_section_content`: that table feeds the page's
 * "Sections generated" count, the outline and the project knowledge. The routes that call these are at the end of handlers.ts.
 */

import type { Row } from '../todo/_shared';
import { withLabDb } from './db';

// 5-8 minutes of narration with cues is about 1,000-1,500 words; a small budget would cut a script off mid-scene.
export const SCRIPT_MAX_TOKENS = 4096;

export interface SavedScript {
  content: string;
  updatedAt: string;
  projectId: number | null;
}

function scriptRow(row: Row): SavedScript {
  return {
    content: row.content as string,
    updatedAt: row.updated_at as string,
    projectId: (row.project_id as number | null) ?? null,
  };
}

/** The user's saved script for the page, or null. */
export function fetchScript(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string
): SavedScript | null {
  return withLabDb((db) => {
    const row = db.get<Row>(
      'SELECT * FROM lab_video_scripts WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?',
      userId,
      lab,
      topicId,
      subtopicId
    );
    return row ? scriptRow(row) : null;
  });
}

/** Keep this as the page's script (replacing the previous one). Only called with a good response. */
export function saveScript(
  userId: number,
  lab: string,
  topicId: string,
  subtopicId: string,
  content: string,
  projectId: number | null = null
): SavedScript {
  return withLabDb((db) => {
    db.run(
      `INSERT INTO lab_video_scripts (user_id, lab_name, topic_id, subtopic_id, content, project_id)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(user_id, lab_name, topic_id, subtopic_id) DO UPDATE SET
         content = excluded.content,
         project_id = excluded.project_id,
         updated_at = datetime('now')`,
      userId,
      lab,
      topicId,
      subtopicId,
      content,
      projectId
    );
    return scriptRow(
      db.get<Row>(
        'SELECT * FROM lab_video_scripts WHERE user_id = ? AND lab_name = ? AND topic_id = ? AND subtopic_id = ?',
        userId,
        lab,
        topicId,
        subtopicId
      ) as Row
    );
  });
}

/**
 * The prompt. `roleSuffix` and `projectBlocks` come from labProjects/knowledge sectionPromptParts (both '' without a
 * project); `projectName` is the project's name, or '' without one.
 */
export function buildScriptPrompt(a: {
  domain: string;
  audience: string;
  subject: string;
  brief: string;
  standingContext: string;
  promptAddon: string;
  roleSuffix?: string;
  projectBlocks?: string;
  projectName?: string;
}): string {
  const roleSuffix = a.roleSuffix ?? '';
  const projectBlocks = a.projectBlocks ?? '';
  const projectName = a.projectName ?? '';
  const briefLine = a.brief ? `\nTopic summary: ${a.brief}` : '';

  const standing = a.standingContext.trim();
  let standingBlock = '';
  if (standing) {
    standingBlock =
      '\n\nStanding context about the learner (applies to every page of this lab; use it to tailor depth, ' +
      `examples and language):\n"""\n${standing}\n"""`;
  }

  const addon = a.promptAddon.trim();
  const addonBlock = addon ? `\n\nAdditional instructions (prompt add-on):\n${addon}` : '';

  let projectRules = '';
  if (projectName) {
    projectRules =
      `\n\nProject rules (this video is made FOR the project “${projectName}”, not as a generic lesson):\n` +
      "- Take the examples, data and constraints from the project's own domain and tie each scene to the project's " +
      'real situation. Do not read the project description back.\n' +
      '- Do not invent facts about the project that its context above does not give. Where something you need is ' +
      "missing, say so in that scene's narration as an assumption.";
  }

  return `You are a senior ${a.domain} instructor and video producer writing the recording script for one explainer video${roleSuffix}.

Topic: ${a.subject}${briefLine}${projectBlocks}${standingBlock}${addonBlock}

Write the script for a 5-8 minute explainer video about this topic, aimed at ${a.audience}. A person will record it, so write the narration to be spoken aloud: short sentences, plain words, one idea per scene.${projectRules}

Output rules:
- Respond with the script's Markdown ONLY: no preamble, no closing remarks, and do not wrap the whole answer in a code fence.
- Start with exactly these three lines, in this order: **Title:** a working video title, then **Hook:** one line that makes a viewer keep watching, then **Length:** the target length, for example about 6 minutes.
- Then write 5 to 8 scenes. Begin each with a heading line in the form ### Scene 1: Scene name (0:00-0:45). The timestamps are rough, run on from one scene to the next and add up to the target length.
- Under each scene heading write two parts: a line that begins **Narration:** followed by the words to say, then a line that begins **On screen:** followed by one short cue for what to show, draw, type or run.
- End with a last scene headed ### Closing call to action, with the same two parts, telling the viewer the one thing to do next.
- Be concrete and accurate. Put any code the viewer should see in a fenced block with a language tag (\`\`\`python, \`\`\`text) and keep it short. Use Python for code unless the context asks for another language.
- Do not repeat these instructions.`;
}
