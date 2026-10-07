# Models

Four classes. Pick the class from the chunk, then the model from what is installed or what the user names. Default to Opus 5.5 unless a row below fits the chunk better.

| class | use for | models | herdr start |
|---|---|---|---|
| **Workhorse** | coding once the spec is laid out | Opus 5.5 (default) | `--kind claude -- --model claude-opus-5-5` |
| | well-specified, mechanical chunks where speed and cost matter: migrations, test fixes, many parallel chunks. Not for repo-wide judgment calls | Sonnet 5.5 | `--kind claude -- --model claude-sonnet-5-5` |
| | | GPT-6.1 Sol | `--kind codex -- -m gpt-6.1-sol` |
| **Research** | read-only investigation: answer a question, map a codebase, gather docs or API facts | Haiku 5.5 | `--kind claude -- --model claude-haiku-5-5 --permission-mode plan` |
| | | GPT-6 Luna | `--kind codex -- -m gpt-6-luna -s read-only` |
| **Orchestrator** | orchestration, planning, demanding or ambiguous work; a chunk that needs its own breakdown | Fable 5.1 | `--kind claude -- --model claude-fable-5-1` |
| | | GPT-6 Astra | `--kind codex -- -m gpt-6-astra` |
| **Cloud** | long-running tasks, work that should run off this machine, tasks that may need collaboration | Devin Fusion: Opus 5.5 High + SWE-2 (default) | `--kind devin -- --cloud --permission-mode dangerous --model fusion-claude-opus-5-5-high-sidekick-swe-2-medium` |
| | supercharge: hard or ambiguous cloud work, same price as Opus at xhigh | Fusion: Opus 5.5 XHigh | `... --model fusion-claude-opus-5-5-xhigh-sidekick-swe-2-medium` |
| | supercharge: needs Fable-level reasoning | Fusion: Fable 5.1 XHigh | `... --model fusion-claude-fable-5-1-xhigh-sidekick-swe-2-medium` |
| | supercharge: the user wants it back sooner (2x price) | Fusion: Opus 5.5 High Fast | `... --model fusion-claude-opus-5-5-high-fast-sidekick-swe-2-medium` |
| | budget: well-specified cloud chunks (half Opus's price) | Fusion: GPT-6.1 Sol High | `... --model fusion-gpt-6-1-sol-high-sidekick-swe-2-medium` |

Claude rows need `--env CLAUDE_CONFIG_DIR=$HOME/.claude-work` on `tab create` (that is what the `ccw` alias sets). `...` in Devin rows stands for the default row's flags. Fusion pairs the named model with a free SWE-2 sidekick; `devin models list` shows every Fusion combination. Devin cloud sessions need `/repo` picked before the first prompt (space toggles, enter confirms).
