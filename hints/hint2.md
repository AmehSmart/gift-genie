The chat completions API does not
accept raw strings.

It expects a messages array:
an ordered list of objects with
a role and content.

If this feels fuzzy, revisit the structure here:
https://scrimba.com/links/openai-chat-completions

Whatever is inside messages is the
entire context the model sees.
