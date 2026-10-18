# Project progress

A Claude Code mod that opens a **Project progress** pane in sessions that belong to a Claude project. Each thread in the project gets one row: a progress bar for how far through its checklist it is (a step in progress counts as half done), its status (Working, Needs you, Ready for review, Done, Resolved) and the step it is on now. The pane refreshes every 30 seconds and has a Refresh button. `/progress` reopens it.

It reads the project's threads through the project tools, so outside a Claude project session the pane says it has nothing to read.

## Install

At the prompt of a terminal session:

```
/plugin install project-progress --marketplace talmax1124/claude-project-progress
```

Answer `y` to add the marketplace, then pick a scope.

From a shell:

```
claude plugin install project-progress --marketplace talmax1124/claude-project-progress
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `talmax1124/claude-project-progress`, then Add plugin.

A private repository installs only for people who can read it on GitHub and whose machine already holds a git credential for github.com (an SSH key, or `gh auth login` then `gh auth setup-git`).
