# datatug-install Skill

Install / reinstall / update the [`datatug`](https://github.com/datatug/datatug-cli) CLI. Implementation lives in [`SKILL.md`](SKILL.md), whose `user-invocable` metadata provides the `/datatug:datatug-install` slash command. Design rationale and explicit non-goals live in [`docs/ideas/cli-install-skill.md`](../../docs/ideas/cli-install-skill.md).

## Sister skills

This skill mirrors the install skill in sibling CLI-wrapper plugins:

- [`specscore:specscore-install`](https://github.com/synchestra-io/ai-plugin-specscore/blob/main/skills/specscore-install/SKILL.md)
- [`synchestra:synchestra-install`](https://github.com/synchestra-io/ai-plugin-synchestra/blob/main/skills/synchestra-install/SKILL.md)
- [`ingitdb:ingitdb-install`](https://github.com/ingitdb/ingitdb-ai-skills/blob/main/skills/ingitdb-install/SKILL.md)

**All implementations should remain similar in shape.** Show the user the install commands; do not execute installers from inside the skill. When changing one, consider whether the same change should land in the others.
