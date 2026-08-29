# Mithaq design system

## Product and audience
Mithaq is a privacy-first Muslim matchmaking product for practicing Muslims seeking marriage, with optional wali/family involvement and imam-supported introductions. The primary public task is to understand the supervised process and start a profile with confidence. The member journey is Survey, Privacy, Compatibility, and Introductions.

## Product rules that design must communicate accurately
- Profiles remain anonymous until imam approval; no direct identifiers in match cards.
- Suitable normal matches reach an imam at 70% compatibility or above; admins can audit all eligible scores, including below 70%, while admin and imam accounts are excluded.
- Matching and anonymous profile review are free.
- Payment appears only after both people accept an introduction.
- Meeting packages are one meeting for GBP 50, three for GBP 120, or five for GBP 175.
- Never label deterministic fallback scoring as AI.

## Visual direction
Preserve the current professional editorial language. Use warm ivory rather than pure white, deep evergreen for decisive actions, and a quiet brass accent only for rare emphasis. Prefer strong type, disciplined grids, generous whitespace, thin separators, small 8px corners, and minimal shadows. Avoid gradients, floating glass cards, decorative blobs, oversized icons, fake scores, romantic stock-photo tropes, and generic SaaS dashboard chrome.

## Typography
- Inter: all Latin interface, display, navigation, and editorial copy.
- Amiri / Noto Naskh Arabic: Arabic wordmark only.
- Headings: 600 weight, tight tracking, compact line-height.
- Body: 400–500 weight, comfortable 1.5–1.75 line-height.

## Color tokens
- background: oklch(0.982 0.008 86)
- foreground: oklch(0.23 0.025 155)
- card: oklch(0.997 0.003 86)
- primary: oklch(0.33 0.065 158)
- primary foreground: oklch(0.985 0.008 86)
- secondary: oklch(0.945 0.012 88)
- muted: oklch(0.95 0.009 86)
- muted foreground: oklch(0.47 0.018 155)
- border: oklch(0.87 0.012 88)
- brass accent: oklch(0.62 0.075 78)

## Layout, components, and motion
- Public content uses max-w-7xl, 20px mobile and 32px desktop gutters.
- Primary buttons are compact, solid green, 8px radius, visible label, and arrow only when it clarifies forward movement.
- Secondary actions use quiet borders on card/background surfaces.
- Cards are used only for bounded product information; narrative sections prefer open layout and separators.
- Touch targets remain at least 40–44px. Focus rings are high contrast. Essential content never relies on hover.
- Motion is short and functional. Respect prefers-reduced-motion globally.

## Current target
Improve the public homepage without redesigning the established brand. Clarify what happens after mutual acceptance: matching stays free, payment unlocks only after both people accept, and three meeting-package choices are available. Keep the four-stage process and privacy story dominant; pricing should build trust, not turn the page into a sales funnel.
