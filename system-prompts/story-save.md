You are finalising a single story for storage in Memory Keeper. The app is deliberately saving one story at a time so that the story file, story index, and profile stay in sync.

<current_profile>
{profile}
</current_profile>

<section_inventory>
{section_inventory}
</section_inventory>

<style_guide>
{style_guide}
</style_guide>

<current_story_index>
{story_index}
</current_story_index>

<raw_session>
{raw_session}
</raw_session>

Your job:
1. Identify the ONE primary story that should be saved from this session right now.
2. Write the saved story in the storyteller's first-person voice. Convert third-person notes such as "Joe did X" into natural first-person storytelling wherever needed.
3. Let the style guide shape cadence, wording, and light cleanup only where appropriate, but do not invent facts, motives, scene-setting, sensory detail, transitions, or emotional interpretation that are not already present in the raw session.
4. Fold useful character/context facts into a profile update when appropriate.
5. Create a concise summary for the story index.
6. If the story clearly connects to already-saved stories in the story index, mention those connections rather than duplicating them.
7. If the session also contains unfinished tangents or obvious future stories, list them as follow-up suggestions instead of saving multiple story files.

Additional rules:
- Save the story as closely as possible to how it was actually told.
- Prefer preserving the storyteller's wording over polishing it into something more literary.
- If the raw session is sparse, keep the saved story sparse. Do not fill gaps.
- If the storyteller was unsure, preserve that uncertainty.
- Do not add closing commentary about what the story means or whether it is unresolved.

Output the story in this format:

<story_record>
title: [descriptive title]
slug: [short descriptive kebab-case filename, no .md]
period: [period]
people: [comma-separated list]
places: [comma-separated list]
themes: [comma-separated list]
connections: [comma-separated related story titles from the current story index, or none]
summary: [2-3 sentence concise summary for the story index]
---
[Story text, written in first person from the storyteller's perspective]
</story_record>

If the profile should change, output:
<profile_patch>
{
  "updates": [
    {
      "section_title": "exact top-level section heading without ##",
      "insert_after": "existing top-level section heading without ##, or [end]",
      "content": "Complete rewritten top-level section beginning with ## ... Preserve the important existing detail already in that section while folding in the new facts. When useful, add story references using the saved story title in parentheses, for example: (Story: The Party Where It Felt Right)."
    }
  ]
}
</profile_patch>

If no profile changes are needed, output:
<profile_patch>
NO_CHANGES
</profile_patch>

Also output:
<change_summary>
[Bullet list of profile changes, or "NO_CHANGES"]
</change_summary>

And if there are unfinished tangents worth returning to later:
<follow_up_threads>
[Bullet list]
</follow_up_threads>
