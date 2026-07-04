# Templates

Skeletons for the artifacts that recur across this repo's plugins. Copy the
matching file to its real destination, fill in every placeholder (`<...>`),
and delete any leading HTML-comment instructions before committing.

| Template | Copy to |
|----------|---------|
| [`adr.md`](adr.md) | `plugins/<plugin>/docs/adr/NNNN-slug.md` |
| [`SKILL.md`](SKILL.md) | `plugins/<plugin>/skills/<skill-name>/SKILL.md` |
| [`command.md`](command.md) | `plugins/<plugin>/commands/<command-name>.md` |
| [`CHANGELOG.md`](CHANGELOG.md) | `plugins/<plugin>/CHANGELOG.md` |
| [`plugin.json`](plugin.json) | `plugins/<plugin>/.claude-plugin/plugin.json` |
| [`PLUGIN_AGENTS.md`](PLUGIN_AGENTS.md) | `plugins/<plugin>/AGENTS.md` |

The PR template isn't here — GitHub only picks it up from
[`.github/PULL_REQUEST_TEMPLATE.md`](../.github/PULL_REQUEST_TEMPLATE.md), so
it lives there instead.
