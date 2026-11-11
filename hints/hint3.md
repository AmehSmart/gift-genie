A chat completions request
is an asynchronous network call.

Nothing after it should assume
the result exists yet.

If your UI updates too early
or never updates at all,
check that you are using await.

Async control flow matters here:
https://scrimba.com/mdn-async-await
