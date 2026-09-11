# pi-diffy

Pretty diff of **any two text files** via a single `diffy` command. Delivered as a
[pi coding-agent](https://pi.dev) package (CLI on PATH + a skill so agents reach for it).

Three renderers, one entry point — the file type is incidental (`.md`, `.py`, `.json`,
configs, anything textual).

```bash
diffy FROM TO                       # terminal side-by-side (default, git-delta)
diffy -i FROM TO                    # terminal inline (diff-so-fancy)
diffy -h FROM TO                    # write self-contained HTML
diffy -h -o out.html FROM TO        # HTML to a specific path
diffy --heal                        # (re)install missing vendored deps
diffy --help                        # full help + exit codes
```

## Why three views?

They share one engine — `git diff --no-index --text FROM TO` — and differ only in the
renderer:

| View | Flag | Renderer | Best for |
|------|------|----------|----------|
| Side-by-side | *(default)* / `-s` | [git-delta](https://github.com/dandavison/delta) | comparing two columns |
| Inline | `-i` | [diff-so-fancy](https://github.com/so-fancy/diff-so-fancy) | a top-to-bottom reading log |
| HTML | `-h` | diff2html | a shareable/browser diff (side-by-side ⇌ inline toggle) |

## HTML output

The HTML renderer is **diff2html-owned end-to-end**: diff2html produces the full
self-contained page (word-level `<ins>`/`<del>` marking, file list, row coloring)
and it is embedded verbatim — no regex post-processing, no extra syntax-highlight
layer that fights diff2html's escaping. The page includes a **⇔ Side-by-Side / ⇕ Inline**
toggle for browsing large diffs either way.

## Exit codes

`0` identical · `1` diff exists (normal) · `2` usage · `3` bad input · `4` internal.

## Auto-healing

The repo stays lean: the platform-specific `delta` binary and the npm deps are
**gitignored** and fetched/installed on demand. `pi install` runs `postinstall`
(`diffy --heal`-equivalent), and a missing dep self-heals on first run unless
`DIFFY_HEAL=0` is set. Force a repair with `diffy --heal`.

## Install

As a pi package:

```
pi install git:github.com/nirguk/pi-diffy@v0.1.0
```

Or as an extension in `.pi/settings.json`:

```json
"packages": ["git:github.com/nirguk/pi-diffy@v0.1.0"]
```

## License

MIT