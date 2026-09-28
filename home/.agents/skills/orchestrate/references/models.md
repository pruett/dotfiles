# Models

Four classes. Pick the class from the chunk, then the model from what is installed or what the user names.

| class | use for | models | herdr start |
|---|---|---|---|
| **Workhorse** | coding once the spec is laid out; fast and efficient | Opus 5.5 | `--kind claude -- --model claude-opus-5-5` |
| | | GPT-6 Sol | `--kind codex -- -m gpt-6-sol` |
| **Research** | read-only investigation: answer a question, map a codebase, gather docs or API facts | GPT-6 Luna | `--kind codex -- -m gpt-6-luna -s read-only` |
| **Orchestrator** | orchestration, planning, demanding or ambiguous work; a chunk that needs its own breakdown | Fable 5.1 | `--kind claude` |
| | | GPT-6 Astra | `--kind codex` |
| **Cloud** | long-running tasks, work that should run off this machine, tasks that may need collaboration | Devin | `--kind devin -- --cloud --permission-mode dangerous` |

Claude rows need `--env CLAUDE_CONFIG_DIR=$HOME/.claude-work` on `tab create` (that is what the `ccw` alias sets). Devin cloud sessions need `/repo` picked before the first prompt (space toggles, enter confirms).

Only Orchestrator-class models may run this skill; `bin/orch-guard` enforces it.
