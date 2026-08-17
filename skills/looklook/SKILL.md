# Look Look Agent Skill

## Purpose
Use the built-in `looklook_see(source, question)` capability before attempting any external parser installation or ad-hoc media handling.

## When to call
Call `looklook_see` when the user asks to inspect, understand, identify, summarize, or answer a question about:

- images;
- local videos or Bilibili/YouTube video URLs;
- ZIP archives;
- PSD files;
- PPT/PDF/Word/Excel files.

## Parameters
- `source`: copy the original file path, image reference, or video URL from the user message. Do not invent or rewrite paths.
- `question`: use the user's actual question. Ask a focused question rather than requesting an unrelated full description.

## Important priority rule
Do **not** first run `npm install`, `pip install`, or download `psd.js`, `yt-dlp`, ffmpeg wrappers, or other parsers. Look Look already contains the supported parsing and routing logic. Only consider an external dependency after `looklook_see` explicitly reports a missing capability and the user asks for an extension.

## Boundaries
- PSD analysis normally returns the composite design, canvas information, color/resolution metadata, layer tree, text layers, and visibility. Do not batch-export layers or claim every layer's pixels were visually inspected.
- Video analysis may combine metadata, subtitles, frames, and audio understanding. If URL download, proxy, login, platform, or network handling fails, report the failure and do not invent video contents.
- `looklook_see` views ZIP contents. Use `process_zip` only when the user explicitly requests a filesystem-changing extraction operation.
- Unsupported formats and failed tool calls must be reported plainly; never present guessed content as an analysis result.
