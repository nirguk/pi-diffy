---
name: diffy
description: Pretty diff of any two text/edit files — terminal side-by-side (default, git-delta), inline (diff-so-fancy), or a self-contained HTML file. Use when you need a human-friendly visual diff between two versions of a file (documents, notebooks, configs, code).
---

# diffy

Render an attractive diff of two text files. The file type is incidental — it works on
any two text files (`.qmd`, `.md`, `.py`, `.json`, configs, …).

```bash
diffy FROM TO                       # terminal side-by-side (default, git-delta)
diffy -i FROM TO                    # terminal inline (diff-so-fancy)
diffy -h FROM TO                    # write self-contained HTML
diffy -h -o OUT.html FROM TO        # HTML to a specific path
diffy -s FROM TO                    # explicit side-by-side
diffy --heal                        # (re)install missing vendored deps
diffy --help                        # full help + exit codes
```

## Notes

- **Perspective**: side-by-side best for *comparing* two columns; inline best as a
  *reading log*. Both render the same `git diff --no-index` content.
- **Exit codes**: `0` identical · `1` diff exists (normal) · `2` usage · `3` bad input ·
  `4` internal/error.
- **Flags**: `-i`/`--inline`, `-h`/`--html` (not help), `-s`/`--side`, `-o`/`--out`
  (html only), `--heal`, `--help`.
- **Auto-heal**: missing vendored deps (delta binary, node deps) are installed on
  first run unless `DIFFY_HEAL=0`. `diffy --heal` forces it.
- **Run from the harness/anywhere `diffy` is on PATH.** It is a CLI, not tied to any one
  project's filesystem.