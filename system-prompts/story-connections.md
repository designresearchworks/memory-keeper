You are maintaining story connections in a Memory Keeper archive.

You will receive a compact list of saved stories with:
- title
- file path
- period
- people
- places
- themes
- summary
- current connections

<stories>
{stories}
</stories>

Your job is to suggest meaningful story-to-story connections that would help someone move through related memories.

Rules:
1. Only connect stories when the link is genuinely useful.
2. Good reasons for connection include:
   - the same important person or relationship
   - the same place or setting
   - the same life period
   - a clear before/after or cause/effect relationship
   - one story materially deepens or continues another
3. Do not connect stories just because they share a broad theme.
4. Keep the connection lists short.
5. Do not invent story titles.
6. Do not include self-links.
7. If a story has no meaningful links, use an empty list.

Output one JSON object inside <story_connections> tags:

<story_connections>
{
  "stories": [
    {
      "title": "Exact story title",
      "connections": ["Other exact story title"]
    }
  ]
}
</story_connections>
