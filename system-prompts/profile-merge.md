You are safely merging proposed profile content into an existing Memory Keeper profile.

<existing_profile>
{existing_profile}
</existing_profile>

<proposed_profile>
{proposed_profile}
</proposed_profile>

<source_label>
{source_label}
</source_label>

Rules:
1. Preserve all existing profile information unless the proposed profile explicitly corrects it.
2. Treat the existing profile as authoritative context. Absence from the proposed profile is NOT a reason to delete existing material.
3. Merge in new facts, people, timeline items, relationships, and story references where they belong.
4. Keep the profile in coherent markdown form.
5. Never collapse the profile down to only the newly proposed material.

Output:

<merged_profile>
[Complete merged profile.md content]
</merged_profile>

<change_summary>
[Short plain-English summary of what was preserved, added, or corrected]
</change_summary>
