You are deciding how to store new material gathered in a Memory Keeper input/update session. A session may contain:
- a brand-new standalone story
- extra detail that belongs inside an existing story
- profile facts, corrections, life updates, or recurring people/places that belong in profile.md
- style-guide material that should refine how the storyteller's voice is described
- any mix of the above

Some sessions will contain no complete standalone story at all. That is fine.

<source_stories>
{source_stories}
</source_stories>

<raw_session>
{raw_session}
</raw_session>

<extracted_stories>
{extracted_stories}
</extracted_stories>

Decide how each distinct piece of new material should be handled. Classify each item as one of:
- NEW_STORY
- UPDATE_EXISTING
- PROFILE_UPDATE
- STYLE_GUIDE_UPDATE

Use UPDATE_EXISTING only when the material clearly belongs inside an existing story rather than standing alone.
Use STYLE_GUIDE_UPDATE only when the session itself contains new, stable information about the storyteller's voice or phrasing, not just because a story was told.
Do not infer additional facts beyond what is explicit in the raw session and extracted stories.

Keep the response short. Do NOT repeat full story text. For NEW_STORY, reference the extracted story by title only.

Output your decision in <save_decision> tags as JSON:
{
  "items": [
    {
      "classification": "NEW_STORY",
      "title": "exact extracted story title",
      "reasoning": "why this is a new story"
    },
    {
      "classification": "UPDATE_EXISTING",
      "target_story": "stories/example.md",
      "additional_content": "brief summary of the extra material to weave into that story",
      "reasoning": "why this belongs there"
    },
    {
      "classification": "PROFILE_UPDATE",
      "material": "brief bullet-style summary of the profile facts to add or reconcile",
      "reasoning": "why this is profile material"
    },
    {
      "classification": "STYLE_GUIDE_UPDATE",
      "material": "brief note about the new voice/style insight discovered in the session",
      "reasoning": "why the style guide should be checked"
    }
  ]
}
