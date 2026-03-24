import fs from "node:fs/promises";
import path from "node:path";
import { APP_ROOT, ensureArchiveRegistry, getActiveArchivePaths, loadAppConfig } from "./archive-layout.mjs";

const INDEX_HEADER = "# Memory Keeper — Story Index";
const REWRITE_MODEL = "anthropic/claude-opus-4.6";
const SUMMARY_MODEL = "anthropic/claude-sonnet-4.6";

function normalizeLineEndings(text) {
  return String(text || "").replace(/\r\n/g, "\n");
}

function cleanTaggedContent(content) {
  return normalizeLineEndings(content)
    .trim()
    .replace(/^```(?:markdown)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();
}

function extractTaggedBlock(text, tagName) {
  const source = String(text || "");
  const pattern = new RegExp(`<${tagName}>([\\s\\S]*?)<\\/${tagName}>`, "i");
  const match = source.match(pattern);
  return match ? cleanTaggedContent(match[1]) : "";
}

function parseStoryMarkdown(content) {
  const text = normalizeLineEndings(content).trim();
  const title = (text.match(/^# Story:\s*(.+)$/m) || [])[1] || "Untitled Story";
  const toldAt = (text.match(/^Told:\s*(.+)$/m) || [])[1] || "";
  const filePath = (text.match(/^File:\s*(.+)$/m) || [])[1] || "";
  const period = (text.match(/^Period:\s*(.+)$/m) || [])[1] || "[unknown]";
  const people = (text.match(/^People:\s*(.+)$/m) || [])[1] || "[unknown]";
  const places = (text.match(/^Places:\s*(.+)$/m) || [])[1] || "[unknown]";
  const themes = (text.match(/^Themes:\s*(.+)$/m) || [])[1] || "[unknown]";
  const connections = (text.match(/^Connections:\s*(.+)$/m) || [])[1] || "none";
  const summary = (text.match(/^Summary:\s*(.+)$/m) || [])[1] || "";
  const storyMatch = text.match(/\n## Story\s*\n([\s\S]*)$/i);
  const storyText = storyMatch ? storyMatch[1].trim() : "";
  return { title, toldAt, filePath, period, people, places, themes, connections, summary, storyText };
}

function buildStoryMarkdown(story) {
  return [
    `# Story: ${story.title}`,
    "",
    "## Metadata",
    `Told: ${story.toldAt}`,
    `File: ${story.filePath}`,
    `Period: ${story.period}`,
    `People: ${story.people}`,
    `Places: ${story.places}`,
    `Themes: ${story.themes}`,
    `Connections: ${story.connections}`,
    `Summary: ${story.summary}`,
    "",
    "## Story",
    "",
    story.storyText.trim()
  ].join("\n");
}

function parseIndexOrder(content) {
  const matches = [...normalizeLineEndings(content).matchAll(/^File:\s*(stories\/.+\.md)$/gm)];
  return matches.map((match) => match[1].trim());
}

function buildIndex(storytellerName, orderedStories) {
  const sections = orderedStories.map((story) => [
    `### ${story.title}`,
    `File: ${story.filePath}`,
    `Told: ${story.toldAt.split("T")[0] || story.toldAt}`,
    `Period: ${story.period}`,
    `People: ${story.people}`,
    `Places: ${story.places}`,
    `Themes: ${story.themes}`,
    `Connections: ${story.connections}`,
    `Summary: ${story.summary}`
  ].join("\n"));
  return [
    INDEX_HEADER,
    "",
    `# Storyteller: ${storytellerName}`,
    "",
    "---",
    "",
    "## Stories",
    "",
    sections.join("\n\n")
  ].join("\n").trim() + "\n";
}

function withVibesPrompt(basePrompt, vibesPrompt) {
  const base = String(basePrompt || "").trim();
  const vibes = String(vibesPrompt || "").trim();
  if (!base || !vibes) {
    return base;
  }
  return `${base}

<vibes_overlay>
The following vibes prompt is an additional style overlay. Use it to humanize the prose, reduce AI-writing patterns, and keep the text sounding natural and human.

Important:
- The main task instructions and output schema still take priority.
- If the vibes prompt contains workflow or output-format instructions that conflict with this task, ignore those conflicting workflow or output-format instructions.
- Keep all required tags, headings, and file formats exactly as requested by the main task.

${vibes}
</vibes_overlay>`;
}

function stripEmDashes(text) {
  return String(text || "")
    .replace(/\s*—\s*/g, ", ")
    .replace(/,{2,}/g, ",")
    .replace(/\s+,/g, ",")
    .replace(/,\./g, ".")
    .replace(/\s{2,}/g, " ")
    .replace(/ \n/g, "\n")
    .trim();
}

async function readText(filePath) {
  return fs.readFile(filePath, "utf8");
}

async function callOpenRouter({ apiKey, model, systemPrompt, userText }) {
  const requestBody = {
    model,
    max_tokens: 1800,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userText }
    ]
  };

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`,
          "X-Title": "Memory Keeper Batch Reprocess"
        },
        body: JSON.stringify(requestBody)
      });
      if (!response.ok) {
        const body = await response.text();
        throw new Error(`${response.status} ${response.statusText}${body ? `: ${body}` : ""}`);
      }
      const payload = await response.json();
      return payload.choices?.[0]?.message?.content || "";
    } catch (error) {
      if (attempt < 2) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }
      throw error;
    }
  }
  throw new Error("OpenRouter request failed.");
}

async function main() {
  await ensureArchiveRegistry();
  const appConfig = await loadAppConfig();
  const archivePaths = await getActiveArchivePaths(appConfig);
  const archiveConfig = JSON.parse(await readText(archivePaths.archiveConfigPath));
  const apiKey = process.env.OPENROUTER_API_KEY || String(appConfig.openRouterApiKey || "").trim();
  if (!apiKey) {
    throw new Error("No OpenRouter API key available.");
  }

  const updatePromptTemplate = await readText(path.join(APP_ROOT, "system-prompts/update-story.md"));
  const summaryPromptTemplate = await readText(path.join(APP_ROOT, "system-prompts/summary-generation.md"));
  const styleGuide = await readText(path.join(archivePaths.referenceDir, "style-guide.md"));
  const vibes = await readText(path.join(APP_ROOT, "system-prompts/joevibes.md")).catch(() => "");
  const currentIndex = await readText(path.join(archivePaths.metaStoriesDir, "story-index.md"));
  const storytellerNameMatch = currentIndex.match(/^# Storyteller:\s*(.+)$/m);
  const storytellerName = storytellerNameMatch ? storytellerNameMatch[1].trim() : (archiveConfig.storytellerName || "Storyteller");
  const orderedPaths = parseIndexOrder(currentIndex);
  const storyFiles = (await fs.readdir(archivePaths.storiesDir))
    .filter((name) => name.endsWith(".md"))
    .map((name) => `stories/${name}`)
    .sort();
  const fileOrder = [...orderedPaths, ...storyFiles.filter((file) => !orderedPaths.includes(file))];

  const rewrittenStories = [];
  for (const relativePath of fileOrder) {
    const absolutePath = path.join(archivePaths.dataStoreRoot, relativePath);
    const originalContent = await readText(absolutePath);
    const original = parseStoryMarkdown(originalContent);
    console.log(`Reprocessing ${relativePath}...`);

    const rewriteInstruction = [
      "There is no new factual material. This is a standards refresh only.",
      "Rewrite this story only where needed to meet the current standard.",
      "Keep every factual detail that is already present.",
      "Do not add any fact, inference, motivation, quotation, chronology, emotional interpretation, scene detail, or connective detail that is not already in the existing story.",
      "Keep the story entirely in first person from the storyteller's perspective.",
      "Any reference to the storyteller as Joe, he, him, or his should be rewritten into natural first-person narration unless it refers to another person or appears inside a direct quotation that is already in the story.",
      "Remove archive notes, follow-up notes, bracketed unresolved notes, and duplicated internal title lines if they are not part of the actual telling.",
      "Do not mention that the story is unresolved.",
      "Do not use em dashes.",
      "Preserve the actual meaning, uncertainty, and limits of the original telling."
    ].join("\n");

    const rewritePrompt = withVibesPrompt(
      updatePromptTemplate
        .replace("{existing_story}", originalContent)
        .replace("{new_material}", rewriteInstruction)
        .replace("{style_guide}", styleGuide),
      vibes
    );

    const rewriteResponse = await callOpenRouter({
      apiKey,
      model: REWRITE_MODEL,
      systemPrompt: rewritePrompt,
      userText: "Update the story now and output the complete revised story file inside <updated_story> tags."
    });
    const updatedBlock = extractTaggedBlock(rewriteResponse, "updated_story");
    if (!updatedBlock) {
      throw new Error(`No <updated_story> block returned for ${relativePath}`);
    }

    const parsedUpdated = parseStoryMarkdown(updatedBlock);
    const refreshed = {
      ...original,
      storyText: stripEmDashes(parsedUpdated.storyText || original.storyText)
    };

    const summaryPrompt = withVibesPrompt(
      summaryPromptTemplate
        .replace("{story}", refreshed.storyText)
        .replace("{style_guide}", styleGuide),
      vibes
    );

    const summaryResponse = await callOpenRouter({
      apiKey,
      model: SUMMARY_MODEL,
      systemPrompt: summaryPrompt,
      userText: "Write the summary now."
    });
    refreshed.summary = stripEmDashes(cleanTaggedContent(summaryResponse).replace(/^Summary:\s*/i, "").trim());

    await fs.writeFile(absolutePath, buildStoryMarkdown(refreshed) + "\n", "utf8");
    rewrittenStories.push(refreshed);
  }

  const storyByPath = new Map(rewrittenStories.map((story) => [story.filePath, story]));
  const orderedStories = fileOrder.map((relativePath) => storyByPath.get(relativePath)).filter(Boolean);
  const rebuiltIndex = buildIndex(storytellerName, orderedStories);
  await fs.writeFile(path.join(archivePaths.metaStoriesDir, "story-index.md"), rebuiltIndex, "utf8");
  console.log(`Reprocessed ${orderedStories.length} stories and rebuilt story-index.md`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
