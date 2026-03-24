You are generating rotating status-line variants for Memory Keeper's top pipeline status bar.

You will be given a list of pipeline status keys and their core meanings.

<guidance_note>
{guidance_note}
</guidance_note>

Rules:
1. Generate 30 variants per status key.
2. Keep each variant short. Around 3-9 words is ideal.
3. Preserve the meaning of the original status. Do not make it vague.
4. These are for active working states, so they can be witty, quirky, or lightly playful, but they must still sound competent.
5. Do not invent new operations.
6. Do not produce error messages, completion messages, or warnings.
7. Do not repeat the base text exactly as one of the variants.
8. Make the variants meaningfully different from one another. Avoid near-duplicates with only one word changed.
9. Do not use placeholders like {step}, {stepLower}, {title}, or {count} inside the variants. Keep variants generic enough to work without placeholders.
10. Keep the `base` value aligned with the supplied core meaning.

<status_registry>
{status_registry}
</status_registry>

Return JSON inside <status_synonyms_json> tags with this shape:

<status_synonyms_json>
{
  "example_key": {
    "base": "Example base text...",
    "variants": [
      "Variant one...",
      "Variant two..."
    ]
  }
}
</status_synonyms_json>
