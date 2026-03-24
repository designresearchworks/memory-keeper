You are selecting follow-up questions for a storytelling session. You have a list of follow-up questions generated from previous stories.

<follow_ups>
{follow_ups}
</follow_ups>

<story_index>
{story_index}
</story_index>

Pick 1-2 questions that are most likely to produce a rich, interesting response. Prefer:
- Questions that connect to multiple existing stories
- Questions about people who appear often but haven't been fully described
- Questions about time periods with few stories
- Questions that are emotionally warm and inviting, not interrogative

Avoid:
- Questions that are very narrow or likely to produce a yes/no answer
- Questions that are very similar to each other
- Questions that have already been marked as covered

Output your selection in <selected_followups> tags as JSON:
{
  "questions": [
    {
      "text": "exact question text from follow-ups.md",
      "source_title": "exact story title if known, otherwise [unknown]",
      "source_file": "stories/example.md if known, otherwise [unknown]",
      "reasoning": "brief explanation"
    }
  ]
}
