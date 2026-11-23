# cache-warmth

A Claude Code mod that adds a band above the prompt with:

- **Cache warmth**: a heat bar that drains as the prompt cache's lifetime runs out, with the time left and the last cache hit rate.
- **Context size**: a gauge that turns amber, then red at your handoff threshold.
- **Token tally**: tokens read from cache, written to cache, sent fresh and generated over the session, subagents included.

## Install

At the prompt of a terminal session:

```
/plugin install cache-warmth --marketplace PeterSoder/claude-mods
```

Answer `y` to add the marketplace, then pick a scope (user scope is first).

From a shell:

```
claude plugin install cache-warmth --marketplace PeterSoder/claude-mods
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `PeterSoder/claude-mods`, then Add plugin.

## Options

Set during install:

- **Prompt cache TTL**: `1h` (default) or `5m`, matching your cache lifetime.
- **Context handoff threshold**: `300k` (default), `250k`, `400k` or `500k`.
