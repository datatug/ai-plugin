# CLI Install Skill

## Problem Statement

**How might we ensure that after `/plugin install datatug@sneat-co`, the very next `/datatug:*` invocation succeeds — without making the plugin itself own multi-platform binary distribution?**

The plugin README declares the `datatug` CLI a prerequisite, but nothing in the plugin surface helps the user cross that gap. A human runs `/plugin install`, invokes a skill, and gets `command not found: datatug` with no in-context path forward.

## Recommended Direction

Ship a single skill — `/datatug:datatug-install` — that points the user at Homebrew or the `go install` path. Every other skill performs a pre-flight `command -v datatug` check; on miss, it emits a single error referencing the install skill. Reject bundling binaries, reject a SessionStart hook, reject a long-lived "doctor" skill.

The pattern is shared with the sibling [`specscore`](https://github.com/synchestra-io/ai-plugin-specscore), [`synchestra`](https://github.com/synchestra-io/ai-plugin-synchestra), and [`ingitdb`](https://github.com/ingitdb/ingitdb-ai-skills) plugins. The install skill is essentially a template with the CLI name and install commands swapped.

## Explicit Non-goals

- **No bundled binaries.**
- **No `curl … | sh` from inside the skill.**
- **No SessionStart hook auto-installer.**
- **No long-lived "doctor" skill.**
