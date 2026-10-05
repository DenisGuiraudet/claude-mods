# Claude mods

Mods for Claude Code: plugins of function hooks that change how the app looks.

| Mod | What it does |
| --- | --- |
| [`meadow`](meadow) | Claude's replies as pixel bubbles: a short pixel sky and hill on top of each reply, a strip of grass under its last block. Desktop app only; the terminal keeps its own look. |
| [`bunny-spinner`](bunny-spinner) | The loading line speaks as a bunny: `🐰 Michel: reading the docs`, with `· nom nom…` while a tool runs. The app keeps its timer beside it. The name is a setting. |

## Use them

Load one or both in every session by adding their folders to `~/.claude/settings.json` (paths separated by `:`):

```json
{
  "env": {
    "CLAUDE_CODE_PLUGIN_DIRS": "~/repos/claude-mods/meadow:~/repos/claude-mods/bunny-spinner",
    "CLAUDE_CODE_PLUGIN_DIR_WATCH": "1"
  }
}
```

`CLAUDE_CODE_PLUGIN_DIR_WATCH` reloads a mod when you edit it. Or install them from this repo as a plugin marketplace (`/plugin marketplace add DenisGuiraudet/claude-mods`).

## Check them

```bash
claude plugin validate meadow
```

```bash
bun test meadow/tests
```
