# Pickle UI colors and typography

Shared values live in `src/index.css`. Components use CSS variables or named
Tailwind text utilities rather than individual color values and pixel sizes.

## Neutral palette

| Role | Color | Use |
| --- | --- | --- |
| Black | #000000 | Overlays and shadows |
| Ink | #1F1F1F | Main text and headings |
| Charcoal | #2A2A2A | Dark surfaces and dividers |
| Strong gray | #444444 | Strong secondary elements |
| Gray | #6F6F6F | Descriptions and secondary text |
| Soft gray | #A0A0A0 | Hints and inactive elements |
| Faint gray | #C7C7C7 | Strong borders and light secondary elements |
| Border | #EAEAEA | Separators and standard borders |
| Surface | #F5F5F5 | Input and card backgrounds |
| White | #FFFFFF | Light surfaces and text over photographs |

Orange remains `--color-primary: #F26B21`. Brand tints derive from this value.
Black and white transparency remains available for photograph overlays and shadows.
Existing light/dark rules share these neutral values.

## Font and sizes

Inter weights 400, 500, 600 and 700 are bundled locally through
`@fontsource/inter`, so the English UI does not depend on Google Fonts requests.
Characters outside Inter's Latin coverage use the shared Noto/system fallback stack.
Normal text uses 400, medium emphasis 500, strong labels 600 and headings 700.

| Utility | Size | Line height | Use |
| --- | ---: | ---: | --- |
| text-micro | 8px | 10px | Reserved for the smallest supporting labels |
| text-tiny | 10px | 14px | Profile recipe-photo titles, view counts and featured descriptions |
| text-caption | 12px | 16px | Counts, badges, dates |
| text-label | 14px | 20px | Supporting text, compact labels |
| text-body | 16px | 24px | Body copy, buttons, fields |
| text-lead | 18px | 26px | Prominent labels and card titles |
| text-section | 20px | 28px | Section headings |
| text-title | 24px | 32px | Large section titles |
| text-page | 28px | 36px | Page titles |
| text-hero | 32px | 40px | Main mobile heading |
| text-display | 40px | 48px | Desktop display heading |
| text-display-xl | 48px | 56px | Large summary figures |

Use the smallest suitable role; do not introduce intermediate font sizes.
Compact profile identity rows and artwork wordmarks retain their purposeful line spacing.
