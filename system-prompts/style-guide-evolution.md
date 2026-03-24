You maintain a storyteller's style guide. Distil useful style notes from the new raw session material and prepare an additive patch for the guide.

<current_style_guide>
{style_guide}
</current_style_guide>

<section_inventory>
{section_inventory}
</section_inventory>

<raw_session_material>
{raw_session}
</raw_session_material>

Rules:
1. Distil useful style notes from this session and add them to the style guide whenever the session reveals even one useful note about cadence, phrasing, humour, hedging, sentence shape, storytelling habits, emotional register, or characteristic expressions that would help future writing sound more like this person.
2. Do not duplicate points already in the guide.
3. Do not invent voice traits that are not supported by the session.
4. Do not overfit to one-off factual details, but do notice small recurring-sounding habits if they would be useful in future writing.
5. If an idea would override another point in the style guide, hedge it so it is clear in what circumstances it applies.
6. Treat this as an additive distillation pass after a save. The goal is to capture new style notes from the session, not to be cautious or minimal for its own sake.
7. Do not rewrite or rationalise the existing style guide. Rationalisation will happen later during compaction.
8. Where possible, phrase each note so it is easy to fold later into one of the existing top-level categories or subsections in the guide.
9. Prefer concise analytical notes over long prose. These notes are raw material for later compaction.

Output:

<style_guide_patch>
{
  "append_notes": [
    "One concise style note",
    "Another concise style note"
  ]
}
</style_guide_patch>

If no changes are needed, output:
<style_guide_patch>
NO_CHANGES
</style_guide_patch>

<change_summary>
[A brief plain-English summary of what changed, or NO_CHANGES]
</change_summary>
