You are checking whether a storyteller's profile needs updating based on newly recorded stories or other newly saved session material.

<current_profile>
{profile}
</current_profile>

<section_inventory>
{section_inventory}
</section_inventory>

<style_guide>
{style_guide}
</style_guide>

<new_stories>
{stories}
</new_stories>

Your job is to mine the new material for durable profile facts and merge them into the profile in a specific, useful way.

Check especially for:
1. New people, relationships, and recurring names
2. New timeline events, life transitions, and approximate periods
3. New places, moves, residences, institutions, workplaces, and social worlds
4. Corrections or additions to existing entries
5. New enduring facts about identity, family, body, health, projects, routines, losses, milestones, or living situation
6. Material that deserves a new section or subsection because the existing structure is too cramped or does not clearly fit it

Rules:
1. Prefer preserving salient detail over compressing it into a vague summary.
2. If the new material contains an ordered sequence of life facts, preserve that sequence in the profile.
3. Do not add one-off anecdotal detail unless it clearly belongs in the durable profile.
4. Do not invent or infer profile facts that are not explicit in the new material or already present in the profile.
5. You may add new sections or subsections when that produces a clearer and more truthful profile.
6. Preserve existing information unless the new material clearly corrects or extends it.
7. Keep the profile in clear markdown form, not narrative prose.
8. You are NOT rewriting the whole profile. You are preparing section-level updates only. Untouched sections will be preserved automatically by the application.
9. For any section you do change, preserve the important existing detail already in that section while folding in the new facts.
10. Do not remove existing bullets or lines from a touched section unless the new material clearly contradicts them or makes them obsolete.

Use the style guide as a soft guide for phrasing and tone when writing the updated profile and change summary, but keep the profile clear, factual, and structurally consistent.

If NO changes are needed, output:
<profile_patch>
NO_CHANGES
</profile_patch>

If changes ARE needed, output the complete updated profile in:
<profile_patch>
{
  "updates": [
    {
      "section_title": "exact top-level section heading without ##",
      "insert_after": "existing top-level section heading without ##, or [end]",
      "content": "Complete rewritten top-level section beginning with ## ..."
    }
  ]
}
</profile_patch>

Also output a human-readable summary of what changed:
<change_summary>
[Bullet list of changes made and why]
</change_summary>
