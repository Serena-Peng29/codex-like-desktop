---
name: terminal-dark
description: "Build developer-tool landing pages that read as software: dark-first surfaces, real compiling code as the hero, terminal motifs, hairline borders, and syntax as palette. Use when the user is building a developer tool, CLI, API, infrastructure, database or open-source landing page, mentions dark-first design, terminals, real code in the hero or syntax highlighting, or wants a page that reads as software rather than marketing."
---

# Terminal Dark

A landing-page system for developer tools that makes the page feel like **the product
it is selling**. The tool lives in a terminal, an editor, a dark IDE, so the page is
dark, precise, monospaced where it counts, and built around real code. It respects a
developer's time and assumes technical literacy. Nothing is dumbed down, nothing
glows, nothing is fake.

The failure mode you are guarding against is the "developer" page that is a light
SaaS template with `dark:` variants bolted on. That page has a glowing purple-to-cyan
hero gradient, a "code snippet" that does not compile and demonstrates nothing, body
copy set in monospace because monospace "looks technical", pastel feature cards with
soft shadows, and a hero screenshot of a dashboard nobody asked for. A real developer
closes that tab in two seconds because it was obviously made by someone who has never
shipped code. Everything below exists to pass the scrutiny of a reader who reads code
for a living.

Design dark-first. Light mode is optional and secondary. Read the anti-patterns
(§13) before you write a line, then build the colour system first; every other rule
depends on it.

## 1. The core idea

> Show the code. Respect the reader. Design in the dark.

A developer-tool page earns trust by **demonstrating**, not describing. The hero is
not a value proposition over a gradient; it is the actual command you run or the
actual code you write, shown exactly as it appears in a terminal or editor. Three
consequences drive every other rule:

1. **Real code is the hero visual.** The most persuasive element on the page is a
   code block that compiles and does something a developer recognises. It replaces
   the hero illustration entirely.
2. **Dark is the design, not a toggle.** Surfaces, borders, text tiers and syntax
   colours are chosen together for a dark canvas. Light mode, if it exists, is a
   separate re-derivation, never an inversion.
3. **Density is respect.** Developers scan fast and hate marketing padding. Sections
   are information-dense: tight line-height, real specifics, no airy hero with three
   words and a button floating in 90vh of nothing.

## 2. Page architecture

The canonical order for a developer-tool landing page. Adapt the middle; keep the ends.

| # | Section | Purpose |
|---|---|---|
| 1 | Nav | Wordmark, docs/pricing/GitHub links, star count, one action. `56–64px`, hairline bottom border. |
| 2 | Hero | One-line claim, a real code block or terminal as the visual, install command, two actions. |
| 3 | Install / quickstart | The copy-paste command block that gets the reader running in one line. |
| 4 | How it works | 2–3 real code examples showing the actual API, not marketing bullets. |
| 5 | Feature grid | Dense grid of capabilities, each with a one-line code or config sample. |
| 6 | Terminal / diff demo | A credible terminal session or a diff showing before/after. |
| 7 | Performance / specs | Numbers: benchmarks, bundle size, latency. A dense table, not cards. |
| 8 | Social proof | GitHub stars, real logos of companies using it, a genuine testimonial with a name and a repo. |
| 9 | Pricing / open-source | Tiers, or "free and open source" with a sponsor link. |
| 10 | CTA | Restate the install command. Docs link. `gh` / npm badge. |
| 11 | Footer | Dense sitemap, dark, monospace metadata (version, license, commit hash). |

**Rule of thumb:** if a section could appear unchanged on a project-management SaaS
page, it does not belong here. Every section should show something a developer builds
with.

### 2.1 Vary the rhythm, or the page is a light template in a dark costume

The most common failure is not a colour mistake, it is a **skeleton** mistake: nav,
two-column hero, four-up stat strip, a uniform three-by-two card grid, a two-up, a
table, a footer. That skeleton is the corporate landing page, and painting it
`#0A0B0D` does not change what it is. A reader recognises the shape before they read
a word.

Break it deliberately:

- **No two consecutive sections share a layout.** A full-bleed product surface, then
  three columns split by rules, then a tabbed frame, then a split diff, then a
  definition list. Each one a different shape.
- **Do not repeat the same header block four times.** If every section opens with an
  eyebrow, an `h2` at the same size, and a centred paragraph, the page has one idea
  repeated, not five ideas.
- **Prefer one wide element over three equal ones.** Three equal cards is the default
  a template reaches for; a single wide surface followed by an asymmetric row is not.

### 2.2 The section header

Sections do not open with a centred stack. They open asymmetrically, on the grid:

- **Headline left**, roughly `col-span-6`, `h2` scale, tight tracking, two or three
  lines of real sentence.
- **Description right**, starting around `col-start-8`, `body` in `text-secondary`,
  two or three lines. It carries the detail the headline dropped.
- **An index line** under the description in `code-sm text-tertiary`: `2.0 Migrating →`.
  Numbering the sections is a documentation habit, and it silently tells the reader
  the page has a structure.

Centre a section header only if the section that follows is itself symmetric. In this
style that is almost never true.

### 2.3 The two-tone headline

The hero and each major section headline is **one sentence block in two colours**: the
lead clause in `text-primary`, the continuation in `text-secondary`, inside the same
paragraph so it wraps as one shape.

```html
<h1 class="text-[56px] font-medium tracking-[-0.03em] leading-[1.05]">
  Search that runs inside your process.
  <span class="text-[#9BA1AC]">Full-text and vector in one file you open,
  query, and ship with the app.</span>
</h1>
```

This costs nothing, needs no decoration, and does the work a gradient or a glow is
usually hired to do. Weight stays at `500`; the size and the colour break carry it.

## 3. Colour system

The palette is a **dark layered system plus a syntax theme**. Give the background
depth through layered near-blacks, not through shadows. Every value below is exact.

```
Dark (primary design)
  bg-base        #0A0B0D   canvas: the deepest layer
  bg-surface     #101216   raised surfaces (code blocks, cards-that-arent-cards)
  bg-elevated    #16181D   nav on scroll, popovers, the highest layer
  border-subtle  #1E2127   hairlines between sections and rows
  border-strong  #2A2E37   focused inputs, active tabs, emphasised dividers
  text-primary   #E6E8EB   headings and primary copy
  text-secondary #9BA1AC   body copy, descriptions
  text-tertiary  #6B7280   captions, metadata, inactive
  text-disabled  #454B54   disabled, placeholder

Syntax palette (the ONLY accent colours, used in code AND UI)
  syntax-keyword  #C792EA   keywords, primary action accent
  syntax-string   #C3E88D   strings, success state
  syntax-func     #82AAFF   functions, links
  syntax-number   #F78C6C   numbers, warnings
  syntax-comment  #5C6370   comments (verify 4.5:1)
  syntax-const    #FFCB6B   constants, highlights
  syntax-error    #F07178   errors, destructive
```

**Hard rules:**

- **Depth comes from layers, not shadows.** `bg-base` → `bg-surface` → `bg-elevated`
  are three near-blacks `~6px` apart in lightness. A raised element is *lighter* than
  its parent, edged with a `border-subtle` hairline. Do not add `shadow-lg`.
- **The syntax palette is the entire accent system.** The purple used for keywords in
  the code block is the same purple on the primary button. There is no separate brand
  colour invented outside the theme. This coherence is the whole point.
- **Never `#000000` and never `#FFFFFF` for large surfaces.** Pure black on pure white
  vibrates and reads as unstyled; the canvas is `#0A0B0D`, text is `#E6E8EB`.
- **One accent leads.** Pick one syntax colour (usually `syntax-keyword` or
  `syntax-func`) as the primary UI accent. It carries links, the active tab, focus
  rings, and the one marked row in a figure. The others appear only inside actual
  code and status indicators.
- **The solid primary button is light, not accent-filled.** `bg-[#E6E8EB]` with
  `text-[#0A0B0D]`: text-primary inverted onto the canvas colour. A large accent-filled
  rectangle is the loudest thing on a dark page, and once it exists the same colour can
  no longer do quiet work in links and figures without the page looking like it has two
  competing signals. Keeping the accent off the button is what lets it stay meaningful
  everywhere else. Secondary actions are a hairline border with `text-primary`.
- **No gradients** except one permitted use: a barely-visible radial `<2%` opacity
  behind the hero code block to lift it off the canvas. No purple-to-cyan anything.

## 4. Monospace: when it is right and when it is a mistake

Monospace is a **material**, not a decoration. Using it everywhere is the single
loudest "fake developer page" signal.

**Use monospace for:**
- Code, obviously: every code block, inline `code`, snippet, config.
- Terminal commands and their output.
- Data that is literally code-adjacent: version numbers, commit hashes, file paths,
  package names, environment variables, key bindings, HTTP status codes.
- Small technical labels where the tabular, fixed-width rhythm carries meaning (a
  latency figure, a byte size, a port number).

**Never use monospace for:**
- Body copy, feature descriptions, paragraphs. Monospace at reading length is slow
  and exhausting; it screams costume.
- Headlines and hero claims. A mono H1 is a cliché and reads as low-effort.
- Buttons, nav links, marketing sentences.

The discipline: **monospace marks something the reader could type or that the machine
produced.** If a human wrote it as prose, it is set in the sans UI face.

## 5. Type scale

Two families: a **sans UI face** for everything human-written and a **mono code face**
for everything machine-adjacent. Never a third.

| Token | Desktop | Mobile | Family | Weight | Leading | Use |
|---|---|---|---|---|---|---|
| `h1` | `clamp(36px, 5vw, 60px)` | `32px` | sans | 600 | `1.05` | Hero claim |
| `h2` | `clamp(26px, 3vw, 38px)` | `24px` | sans | 600 | `1.15` | Section headlines |
| `h3` | `20px` | `18px` | sans | 500 | `1.3` | Feature titles |
| `body` | `16px` | `15px` | sans | 400 | `1.6` | Descriptions, paragraphs |
| `small` | `14px` | `14px` | sans | 400 | `1.5` | Captions, meta labels |
| `code` | `14px` | `13px` | mono | 400 | `1.6` | Code blocks, snippets |
| `code-sm` | `13px` | `12px` | mono | 400 | `1.5` | Inline code, install commands, badges |

**Hard rules:**

- **Sans face:** Inter, Geist, or IBM Plex Sans. **Mono face:** JetBrains Mono, Geist
  Mono, IBM Plex Mono, or Berkeley Mono. Pick one of each; never more.
- **Headlines are `font-semibold` (600) max.** Developer aesthetics are precise, not
  loud. No `font-extrabold` display type.
- **Code uses a font with real ligatures off by default.** Enable ligatures only if
  the demo audience expects them; many developers disable them, so do not rely on
  them for meaning.
- **Line-height for code is `1.6`** so wrapped tokens and line numbers stay legible.
  Never set code at `leading-tight`. Dense code needs vertical air.
- Body copy caps at **70 characters** (`max-w-[70ch]`); code blocks are as wide as the
  code demands, with horizontal scroll rather than reflow (see §6).

## 6. Code blocks as the hero

The code block is the most important element in this style. Get it right and the page
is credible; get it wrong and nothing else saves it.

**Framing and chrome:**
- Wrap in `bg-surface` with a `1px border-subtle` and `rounded-lg` (`8px`). No drop
  shadow. The border and the lighter surface provide separation.
- A slim top chrome bar (`36–40px`) with either three window dots *or*, better, a
  filename tab (`utils.ts`) and a language label in `code-sm text-tertiary`. Prefer
  the filename tab; window dots are a cliché unless you are literally showing a
  terminal.
- A **copy button** top-right: an icon that swaps to a check on click, `text-tertiary`
  hover `text-secondary`. This is non-negotiable. A code block a developer cannot
  copy is broken.
- **Line numbers** in `text-disabled`, right-aligned in a `pr-4` gutter, non-selectable
  (`select-none`) so copying grabs only the code.

**Syntax highlighting:**
- Real highlighting with the §3 syntax palette. Use Shiki or a highlighter at build
  time, not a runtime regex that mis-colours. Keywords `syntax-keyword`, strings
  `syntax-string`, functions `syntax-func`, comments `syntax-comment`, numbers
  `syntax-number`.
- Never fake highlighting by hand-colouring random words. A developer spots
  incorrect tokenisation instantly.

**What the code must actually do:**
- **It must compile and demonstrate the product's real API.** Show the three lines
  that import the library, call its main function, and log a result. That is the actual
  developer experience, not pseudocode.
- **8–16 lines in the hero.** Enough to show real usage, short enough to read at a
  glance. A 40-line hero code block is a wall; a 3-line one is a toy.
- Include one comment that adds insight (`// streams tokens as they arrive`), not a
  comment that narrates the obvious (`// import the library`).
- If highlighting a changed line, use a `border-l-2 border-syntax-func` and a
  `bg-syntax-func/5` row tint. Never a bright full-width highlight.

## 7. Terminal and command-line motifs

A terminal block is credible only if it behaves like a terminal.

- **A real prompt glyph:** use `$` for shell, `>` for a REPL, or a styled `user@host`
  in `text-tertiary`, followed by the command in `text-primary` mono.
- **Distinguish input from output.** The typed command is `text-primary`; the output
  is `text-secondary`; success lines may take `syntax-string`, errors `syntax-error`.
  Never colour the whole block one flat green. That is a Hollywood terminal, not a
  real one.
- **Do not animate a fake typing effect that loops.** A one-time type-on when the
  block enters the viewport is acceptable; an infinite typing loop is a toy.
- Keep it accurate: real flags, real output shapes, a real exit. If you show
  `npm install` output, show the plausible resolved/added summary, not invented ASCII
  art.

## 8. The install-command block

The single most-copied element on a developer page. It deserves a dedicated pattern.

```tsx
<div className="flex items-center gap-3 rounded-lg border border-[#1E2127] bg-[#101216] px-4 py-3 font-mono text-[13px]">
  <span className="select-none text-[#6B7280]">$</span>
  <code className="text-[#E6E8EB]">npm install your-tool</code>
  <button
    aria-label="Copy install command"
    className="ml-auto text-[#6B7280] transition-colors hover:text-[#9BA1AC]"
  >
    {/* copy icon → check on click */}
  </button>
</div>
```

- **One line, one command.** The reader should copy it without reading past the end.
- Offer a package-manager toggle (`npm` / `pnpm` / `yarn` / `bun`) as small tabs above
  the block if relevant, but default to the most common and keep it collapsed simple.
- The `$` is `select-none` so a copy grabs the command only.
- Confirm the copy visibly (icon swap + optional `Copied` tooltip). No toast library
  needed.

## 9. Feature sections: dense, not airy

Developer features are proven with specifics, not adjectives.

- **Prefer vertical rules to boxed cards.** Three columns separated by
  `md:border-l border-subtle` with `md:pl-10` read as one continuous idea divided into
  parts. Three bordered rectangles read as three unrelated things a template put in a
  row. Use a boxed grid only when the cells genuinely are independent.
- **When a grid is right, keep it tight** (`grid md:grid-cols-2 lg:grid-cols-3`,
  `gap-px` on a `border-subtle` background so the hairlines form the grid). Each cell:
  a small monochrome icon (stroke, `text-secondary`, not a filled coloured tile), an
  `h3` title, one `body` line, and, as the key move, a one-line code or config sample
  in `code-sm`.
- **A definition list beats a card grid for evidence.** Term left, explanation and a
  one-line code sample right, rows separated by hairlines. It is denser, it is
  scannable, and it is a shape a marketing template never produces.
- **Every feature claim carries evidence.** "Type-safe" is worthless; a two-line
  snippet showing the inferred type in a comment is proof.
- **Numbers get real treatment.** A benchmark is a value in `h2` sans with a
  `small text-tertiary` unit and a source note. Put comparative numbers in a real
  `<table>` with hairline rows, not in three glowing stat cards.
- Density target: a feature section should let a developer evaluate the tool in one
  scroll. If it takes six full viewports to list six features, it is too airy.

## 10. Borders and elevation in a dark UI

This is where most dark pages fail. Shadows are a light-UI device; they are nearly
invisible on `#0A0B0D` and, when made visible, look like grime.

- **Separation comes from three things:** a lighter surface layer, a hairline border,
  and negative space. In that order. Reach for a border before a shadow every time.
- **Hairlines are `1px` at `border-subtle` (`#1E2127`).** They separate sections,
  table rows, card edges, and the nav. A hairline is the workhorse of dark UI depth.
- **Elevation = lightness, not shadow.** A popover or dropdown is `bg-elevated`
  (`#16181D`), one step lighter than the surface behind it, with a `border-strong`
  edge. That lightness difference *is* the elevation cue.
- **If you must suggest a raised code block,** a single inset top highlight
  (`border-t border-white/[0.04]`) reads as a subtle bevel far better than a drop
  shadow. Use sparingly.
- **The one permitted glow:** a `1px` accent ring (`ring-1 ring-syntax-func/40`) on a
  focused input or an active tab. That is a focus cue, not decoration, and it is the
  only place a syntax colour touches a border.

### 10.1 The double border

Give the page exactly **one** structural motif and repeat it: an outer frame holding
an inner surface, with a hairline on both and a `4px` gap between them.

```html
<div class="rounded-[16px] border border-[#1E2127] bg-[#0D0E11] p-1">
  <div class="rounded-[12px] border border-[#1E2127] bg-[#101216] overflow-hidden">
    <!-- code block, terminal, table, diff -->
  </div>
</div>
```

- **Radii must be concentric: `inner = outer − gap`.** `16 − 4 = 12`. Eyeballing this
  produces a visible wobble in the corner where the two arcs disagree. The scale for
  this style is `16` outer frame, `12` inner surface, `10` nested panel, `8` buttons
  and inputs, `6` tabs and chips, `2` inline code.
- **The frame is not a card.** It wraps the things a developer looks *into*: the
  editor, the terminal, the diff, the benchmark table. Prose never gets a frame.
- **Every frame on the page uses the same pair.** Two different frame treatments read
  as two different sites.

### 10.2 Fade a surface out, do not cut it off

A tall code block or product surface that ends mid-content should **mask out**, not
stop at a hard edge:

```css
mask-image: linear-gradient(to bottom, #000 62%, transparent 100%);
```

This is `mask-image`, not `background-image`: no gradient is painted, so it does not
violate the no-gradients rule, and it works identically on any background. It signals
"there is more of this" without a fake scrollbar or a "see more" button.

## 11. Motion

Motion is **precise and functional**, matching the aesthetic of a well-built tool.

- **Fade + short rise on view**, once: `opacity 0 → 1`, `y: 12px → 0`, `400ms`,
  ease-out. Never a dramatic slide.
- **Copy-button feedback:** instant icon swap to a check, `150ms`. This is the most
  important interaction on the page, so make it crisp.
- **Type-on for a terminal or code block:** acceptable *once* when it enters the
  viewport, at a realistic speed (`~30ms` per token, not per character-with-sound).
  Never looping.
- **Tab / package-manager switches:** cross-fade the code content `150ms`, no layout
  jump. Reserve the block height so switching tabs does not shift the page.

| Interaction | Duration | Easing |
|---|---|---|
| Fade-in on view | `400ms` | `cubic-bezier(0.16, 1, 0.3, 1)` |
| Copy feedback | `150ms` | `linear` |
| Tab cross-fade | `150ms` | `ease-out` |
| Nav border on scroll | `200ms` | `linear` |

**Never:** glowing pulsing buttons, aurora/mesh backgrounds, floating particles, a
looping fake terminal, gradient shimmer sweeping across text, count-up benchmark
numbers, parallax on the hero code block, or a cursor trail. A developer tool that
sparkles reads as unserious.

## 12. Imagery and media

- **The primary "image" is code**, rendered as real highlighted text, not a
  screenshot of code. Selectable, copyable, crisp at every DPI. A PNG of a code
  editor is the amateur move.
- If you show the product UI, show a **real, dark, uncluttered** screenshot or an
  actual embedded component, never a fabricated dashboard mockup with fake charts,
  and never a light-mode screenshot on a dark page.
- **No 3D-tilted browser frames, no floating device mockups at an angle.** If a
  screenshot is needed, it sits straight-on in a `bg-surface` frame with a hairline
  border, matching the code-block chrome.
- Diagrams (architecture, data flow) are line diagrams in `text-secondary` strokes on
  the canvas. No gradient-filled boxes, no drop shadows, no clip-art icons.

### 12.1 Draw figures in the character cell

The strongest figure in this style is not an illustration of the system, it is **the
system's own output**: a `<pre>` whose columns are the tool's own fields, with the
quantities drawn to scale beside them.

**Draw the quantity as a 1px rule, not as block glyphs.** `█▉▊▋` looks like the
obvious answer and is a trap: every partial cell has a different cap, the joins notch,
and at any real line-height the run stacks into a chunky rectangle. It reads as a
rendering artefact rather than as a chart. Use a hairline in a track measured in `ch`,
which keeps the bar on the same character grid as the text without going through the
font at all.

```html
<span style="display:inline-block;width:12ch;vertical-align:middle">
  <span style="display:block;width:64%;height:1px;background:#6E7681"></span>
</span>
```

```
OFFSET     EXTENT         SEGMENT   STATE
0x000200   ___________    seg.0000  sealed
0x04a180   _______        seg.0001  sealed
0x0c9a80   __             seg.0004  open      <- accent, 1px, syntax-func
```

- **Compute the width from the real value** (`v / max`), with a small floor so a
  near-zero row still prints a mark. A figure with invented proportions is a drawing,
  and it will read as one.
- **Colour by tier, not by category.** Rules in a mid grey, labels in `text-tertiary`,
  and the accent on exactly the one row or marker that is the point.
- **Give sibling figures the same line count** so their captions share a baseline. Pad
  with blank rows rather than letting one column run long, and set the container to a
  fixed height so the captions never drift apart.
- Set the grid at `11px / 1.8`. Tighter than that and the hairlines crowd; looser and
  the figure stops reading as one object.
- Reach for isometric line art only if the character cell genuinely cannot express the
  idea. Isometric cubes and stacked plates are the house style of several large
  developer-tool sites; using them makes the page look derivative even when it is well
  drawn.

**Corner radius:** follow the pair in §10.1. Never `rounded-3xl` on a technical
surface, and never `rounded-full` on anything but an avatar or a status dot.

## 13. Anti-patterns: what makes a page fail this style

Each alone is enough to break the style. Most are agent defaults.

**Colour and surface**
1. A glowing purple-to-cyan hero gradient (the single clearest "fake dev page" tell).
2. Pure `#000000` canvas or pure `#FFFFFF` surfaces: vibrating, unstyled contrast.
3. `dark:` variants bolted onto a light template instead of a dark-first design.
4. Drop shadows for elevation on a dark canvas (invisible or grimy).
5. A brand accent colour invented outside the syntax palette.
6. More than one leading accent; rainbow feature icons in coloured tiles.
7. Aurora, mesh, or animated-blob backgrounds behind the hero.
8. Neon glows pulsing on buttons or borders.

**Code and terminal**
9. A hero "code snippet" that does not compile or demonstrates nothing real.
10. Pseudocode or lorem-ipsum-in-code instead of the actual API.
11. A screenshot PNG of code instead of real selectable, copyable text.
12. Hand-coloured fake syntax highlighting with wrong tokenisation.
13. A code block with no copy button.
14. A flat all-green Hollywood terminal with no input/output distinction.
15. An infinitely looping fake typing animation.
16. Line numbers that get selected and copied along with the code.
17. A 40-line wall of code in the hero, or a 3-line toy.

**Typography**
18. Body copy, paragraphs, or descriptions set in monospace.
19. A monospace H1 / hero headline.
20. Buttons and nav links in monospace.
21. `font-extrabold` display headlines.
22. Code set at `leading-tight` with no vertical breathing room.
23. Three or more type families.

**Composition and content**
24. A hero screenshot of a dashboard nobody asked for.
25. Airy marketing hero: three words and a button in 90vh of emptiness.
26. Feature cards with pastel backgrounds and soft shadows.
27. A "How it works" 1-2-3 with circular step badges instead of real code.
28. Marketing-speak claims ("supercharge", "seamless", "all-in-one") with no code.
29. Benchmark numbers in three glowing stat cards instead of a real table.
30. A 3D-tilted browser mockup or floating device frame.
31. Fake company logos or invented testimonials without a name or repo.

**Motion**
32. Count-up animations on benchmark numbers.
33. Gradient shimmer sweeping across the headline.
34. Parallax, particles, or a cursor trail on a tool that should feel fast.

**Structure**
35. A corporate skeleton in dark paint: hero, stat strip, three-by-two card grid,
    two-up, table, footer, with a dark palette bolted on (§2.1).
36. The same eyebrow-plus-`h2`-plus-paragraph header repeated at every section.
37. Centred section headers above asymmetric content.
38. Boxed cards where a vertical hairline rule would have done the same job (§9).
39. Two different frame treatments on one page, or an inner radius that is not
    `outer − gap` (§10.1).
40. A surface that ends at a hard horizontal edge mid-content instead of masking out.
41. Isometric line-art figures, stacked plates, or floating cubes: the house style of
    several large developer-tool sites, and instantly recognisable as borrowed (§12.1).
42. A bar or chart whose proportions were drawn rather than computed from the numbers
    beside it.
43. Bars built from block glyphs (`█▉▊`): notched joins, a different cap on every
    partial cell, and a chunky stacked mass. Draw a 1px rule in a `ch`-wide track
    instead (§12.1).

## 14. Responsive behaviour: code on mobile is the hard problem

Code blocks do not reflow, and forcing them to wrap destroys meaning. Solve this
explicitly; do not hope.

- **Never reflow or soft-wrap code to fit narrow screens.** Wrapped code changes
  indentation and reads as broken. Instead, the code block **scrolls horizontally**
  inside its frame (`overflow-x-auto`) with `-webkit-overflow-scrolling: touch`.
- **Drop code font size on mobile** to `13px` (`code`) / `12px` (`code-sm`), one step
  down, no smaller, or it becomes unreadable.
- **Show a scroll affordance:** a subtle right-edge fade (`bg-gradient` mask from
  `bg-surface` to transparent, `24px` wide) that hints more code exists to the right.
  This is the one legitimate gradient in the style.
- **Line numbers stay** but the gutter narrows to `pr-2`. Do not drop them; they
  anchor horizontal scrolling.
- **Consider collapsing long hero code** to its most important 6–8 lines on mobile,
  with a "show full" affordance, rather than a giant scroll region.
- The rest of the page: single column below `md`, feature grid collapses `3 → 2 → 1`,
  section padding drops ~40%, install command stays one line and scrolls if needed.
- Touch targets `44×44px` minimum, especially the copy button.
- Test at **375, 640, 768, 1024, 1280, 1536**. Verify a real code sample horizontally
  scrolls cleanly at 375 without breaking the layout.

## 15. Accessibility

- **Dark-mode contrast is the main risk.** Verify every text tier against its
  background: `text-secondary #9BA1AC` on `bg-base #0A0B0D` is `7.4:1` (passes AAA);
  `text-tertiary #6B7280` on `bg-base` is `4.6:1` (passes AA for `16px`+ only; never
  use it for `12px` metadata on the darkest layer).
- **Syntax colours must clear 4.5:1 on `bg-surface`.** `syntax-comment #5C6370` is the
  danger case. Verify it, and lighten it if a comment fails contrast rather than
  shipping unreadable code.
- **Never invert to pure-black-on-pure-white** for light mode. A true inversion
  produces `#FFFFFF` glare and `#000000` text that vibrates; re-derive light mode with
  `#F7F8FA` surfaces and `#1A1C20` text, and re-pick syntax colours that pass on light.
- Code blocks are real `<pre><code>` with a `lang` attribute; the copy button has an
  `aria-label`; the copied state is announced (`aria-live="polite"`).
- Focus rings are visible: `ring-2 ring-syntax-func` offset `2px`. Do not remove them
  on the dark canvas "because they clash".
- Full `prefers-reduced-motion`: type-on becomes instant full text, fades become
  static, tab switches are immediate.
- Do not convey status by syntax colour alone; pair `syntax-error` with an icon or
  the word `error`.

## 16. Performance

- **Highlight code at build time, not runtime.** Shiki/Prism in the build; ship
  pre-highlighted HTML. A runtime highlighter blocks the main thread and re-tokenises
  on every render.
- **Budget: LCP < 2.0s, CLS < 0.05, JS < 150KB** on the landing route. The hero is
  text (code), so LCP should be trivially fast. Do not sabotage it with a heavy
  above-the-fold animation library.
- **Subset both fonts.** A mono + sans pair in the needed weights is `< 120KB`
  combined. `font-display: swap` with metric-matched fallbacks so the code block does
  not reflow on font load (which would shift every line number).
- **Reserve code-block height** to prevent CLS when tabs switch or highlighting
  hydrates. Set an explicit `min-height` matching the rendered line count.
- Only animate `transform` and `opacity`; the type-on uses `opacity`/`clip`, not width.
- Lazy-load below-the-fold sections and any embedded live demo (`next/dynamic`).

## 17. Implementation notes

Tailwind v4 theme tokens:

```css
@theme {
  --color-bg-base:      #0A0B0D;
  --color-bg-surface:   #101216;
  --color-bg-elevated:  #16181D;
  --color-border-subtle:#1E2127;
  --color-border-strong:#2A2E37;
  --color-text-primary: #E6E8EB;
  --color-text-secondary:#9BA1AC;
  --color-text-tertiary:#6B7280;

  --color-kw:    #C792EA;
  --color-str:   #C3E88D;
  --color-fn:    #82AAFF;
  --color-num:   #F78C6C;
  --color-const: #FFCB6B;
  --color-err:   #F07178;

  --font-sans: "Inter", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;
}
```

Code-block shell with chrome, line numbers, and copy affordance:

```tsx
<figure className="overflow-hidden rounded-lg border border-[#1E2127] bg-[#101216]">
  <figcaption className="flex items-center gap-2 border-b border-[#1E2127] px-4 py-2.5">
    <span className="font-mono text-[13px] text-[#9BA1AC]">stream.ts</span>
    <span className="ml-auto font-mono text-[12px] text-[#6B7280]">TypeScript</span>
    <button aria-label="Copy code" className="text-[#6B7280] transition-colors hover:text-[#9BA1AC]">
      {/* copy → check */}
    </button>
  </figcaption>
  <pre className="overflow-x-auto p-4 text-[14px] leading-[1.6]">
    <code className="font-mono">
      <span className="select-none pr-4 text-[#454B54]">1</span>
      <span className="text-[#C792EA]">import</span>{" "}
      <span className="text-[#E6E8EB]">{"{ stream }"}</span>{" "}
      <span className="text-[#C792EA]">from</span>{" "}
      <span className="text-[#C3E88D]">"your-tool"</span>
      {/* ...real, compiling usage */}
    </code>
  </pre>
</figure>
```

Mobile horizontal-scroll affordance (the one legitimate gradient):

```tsx
<div className="relative">
  <pre className="overflow-x-auto ...">{/* code */}</pre>
  <div
    aria-hidden
    className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-[#101216] to-transparent md:hidden"
  />
</div>
```

## 18. Pairs well with React Bits Pro (optional)

You do **not** need React Bits Pro to use this skill. Build the code block, terminal,
and install pattern from scratch if the project has nothing installed. If the
`@reactbits-pro` and `@reactbits-starter` registries are configured, these accelerate
the build without fighting the aesthetic:

- `@reactbits-starter/code-block-tw`: a syntax-highlighted block with copy affordance;
  restyle its chrome to the §6 filename-tab pattern and the §3 palette.
- `@reactbits-starter/typewriter-tw`: a one-time terminal type-on (§7). Disable
  looping and set a realistic per-token speed.
- `@reactbits-pro/hero-6`, `@reactbits-pro/features-4`: dense, near-compliant dev-tool
  shells. Strip any gradient background and coloured icon tiles before use.

Ignore this section entirely if the registries are not configured. Never add a
dependency on them, and never let a pre-built block reintroduce a hero gradient, fake
code, or monospace body copy.

## 19. Self-verification loop

Re-read the rendered output and check every item. If any fails, fix it and run the
loop again. Do not report completion with known failures.

**Code and terminal**
- [ ] The hero code compiles and demonstrates the real API, not pseudocode.
- [ ] Syntax highlighting is real and correctly tokenised, using the §3 palette.
- [ ] Every code block has a working copy button; line numbers are `select-none`.
- [ ] The terminal distinguishes input from output; nothing loops.
- [ ] Hero code is 8–16 lines, not a wall, not a toy.

**Colour and surface**
- [ ] Canvas is `#0A0B0D`, not `#000000`; text is `#E6E8EB`, not `#FFFFFF`.
- [ ] Depth comes from layered surfaces + hairlines, not shadows.
- [ ] The only accents are syntax-palette colours; one leads the UI.
- [ ] No hero gradient, aurora, mesh, blob, or pulsing glow exists.

**Typography**
- [ ] Body copy, headlines, and buttons are sans; monospace only marks code-adjacent
      content.
- [ ] Two families total (one sans, one mono). No `font-extrabold`.
- [ ] Code is set at `leading-[1.6]`, not `leading-tight`.

**Composition**
- [ ] No fabricated dashboard screenshot, no 3D-tilted browser frame.
- [ ] Feature claims carry code/config evidence; benchmarks live in a real table.
- [ ] No section could appear unchanged on a generic PM SaaS page.

**Structure (§2.1, §10.1, §12.1)**
- [ ] List the sections in order and name each one's shape. No two adjacent sections
      share a shape, and no shape appears three times.
- [ ] Section headers are asymmetric: headline left, description right, numbered index
      line. Not a centred stack repeated down the page.
- [ ] At least one headline is two-tone within a single text block.
- [ ] Every frame uses the same outer/inner pair, and the inner radius equals
      `outer − gap` exactly.
- [ ] Any surface that ends mid-content masks out rather than cutting off, and the
      fade is `mask-image`, so computed `background-image` gradients are still zero.
- [ ] Figures are computed from the numbers printed beside them, siblings have equal
      line counts, and nothing is isometric line art.
- [ ] Quantities are hairline rules in `ch`-wide tracks. Zoom to 400% and confirm no
      notched joins or stepped block edges anywhere in a figure.

**Motion**
- [ ] Nothing loops, shimmers, or counts up. Copy feedback is crisp.
- [ ] `prefers-reduced-motion` renders a fully static, complete page.

**Anti-patterns (§13)**
- [ ] Re-read the full list against the page. Zero hits.
- [ ] Specifically confirm: no purple-cyan gradient, no fake code, no mono body copy,
      no shadow-based elevation, no dashboard hero.

**Responsive, a11y, performance**
- [ ] At 375, a real code sample scrolls horizontally cleanly with a fade affordance;
      it does not reflow or break the layout.
- [ ] Every text tier and syntax colour passes 4.5:1 on its background; comment colour
      verified.
- [ ] Light mode (if present) is re-derived, not a pure inversion.
- [ ] Code highlighted at build time; code-block height reserved to protect CLS.

**Developer smell test**
- [ ] Would an engineer who reads code for a living trust this page, or close it in
      two seconds? If the code is fake or the monospace is everywhere, they close it.
