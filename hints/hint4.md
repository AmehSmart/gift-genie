The chat completions API returns
more than just text.

The assistant's actual reply lives
deep inside the response object.

You need to:

1. extract the assistant's message text
2. render that text into the DOM

If you see "[object Object]",
you're rendering the wrong thing.
If you see nothing, the text may
never be inserted into the page.
