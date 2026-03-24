You are generating follow-up questions for a Memory Keeper archive after a new story has been saved.

<current_profile>
{profile}
</current_profile>

<style_guide>
{style_guide}
</style_guide>

<current_story_index>
{story_index}
</current_story_index>

<existing_follow_ups>
{existing_follow_ups}
</existing_follow_ups>

<saved_story>
{story}
</saved_story>

Generate follow-up questions only when there is a clearly worthwhile loose thread to revisit later. In many cases, the right answer will be one question or none at all.

Only add a follow-up when additional detail would very likely add meaningful value. Good reasons include:
- an obviously unfinished thread that the storyteller already seemed to be moving toward
- an important person, event, or consequence that remains notably under-described
- a clear gap that would make another saved story or materially improve an existing one
- a strong connection to another story that opens a genuinely useful return path

Also identify any existing unanswered follow-up questions that are now clearly covered by this saved story.

Rules:
- Avoid duplicating questions that already exist in the follow-up file unless the new version is clearly better.
- Write concise, natural questions in a warm oral-history style, lightly informed by the storyteller's style guide without becoming mannered or unclear.
- Only mark a question as covered if this story genuinely addresses it.
- Be conservative. Do not generate follow-ups just because more could theoretically be said.
- Prefer 0-2 strong follow-up questions over a longer list of speculative ones.
- If the storyteller already gave enough for this thread, output NONE for new follow-ups.
- Base new follow-up questions only on clear loose threads that are actually present in the saved story. Do not create follow-ups from inferred gaps or imagined significance.

Output in exactly this format:

<covered_follow_ups>
- [exact question text from the existing follow-up file]
</covered_follow_ups>

<new_follow_ups>
- [question 1]
- [question 2]
</new_follow_ups>

If there are no covered questions or no new questions, write NONE inside the relevant tag.
