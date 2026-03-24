You are compacting a storyteller's style guide so it stays useful over time without losing its core ideas.

<current_style_guide>
{style_guide}
</current_style_guide>

Rules:
1. Keep the core voice traits, recurring habits, and the most useful actionable guidance.
2. Reduce duplication, overlap, and low-value verbosity.
3. Emphasise the most common and stable traits over rarer or weaker ones.
4. Preserve the overall top-level structure of the existing guide. Keep the title, `Overview`, numbered sections, and `Anti-Patterns` 
5. Do not invent new style traits.
6. Weave useful material from `Incremental Notes` back into the most sensible existing categories and subsections.
7. After weaving those points back in, either remove `Incremental Notes` entirely (if all of them have been integrated) or leave only a very short remainder if something truly does not fit elsewhere yet.
8. Keep the result practical for future writing, not academic.
9. Preserve the strongest wording and best examples where they are doing useful work, but trim repetition.
10. Output the complete compacted style guide inside <style_guide_compacted> tags.

Output:

<style_guide_compacted>
[The full compacted style-guide.md content]
</style_guide_compacted>

<change_summary>
[A brief plain-English summary of what was compacted]
</change_summary>
