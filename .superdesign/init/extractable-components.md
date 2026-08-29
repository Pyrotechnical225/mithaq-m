# Extractable components

## SiteHeader
- Source: `src/components/SiteHeader.tsx`
- Category: layout
- Description: Sticky Mithaq public navigation with learning menu, account actions, admin state, and responsive mobile menu.
- Extractable props: activeItem (string, default: "home"), homeHref (string, default: "#"), authHref (string, default: "#"), signedIn (boolean, default: false), isAdmin (boolean, default: false), mobileOpen (boolean, default: false)
- Hardcoded: Mithaq and Arabic brand text, navigation labels, Lucide icon names, all Tailwind classes.

## SiteFooter
- Source: `src/components/SiteFooter.tsx`
- Category: layout
- Description: Three-column public footer with brand promise, anchors, guidance links, and legal line.
- Extractable props: homeHref (string, default: "#")
- Hardcoded: labels, Arabic brand text, copyright pattern, link names, all Tailwind classes.

## BrandName
- Source: `src/components/BrandName.tsx`
- Category: basic
- Description: Text-only Mithaq brand wordmark with inherited sizing.
- Extractable props: none.
- Hardcoded: brand spelling and typography classes.

## AuthenticatedRoute
- Source: `src/routes/_authenticated/route.tsx`
- Category: layout
- Description: Session-aware member shell that protects survey, dashboard, privacy, and introductions.
- Extractable props: none; authentication state is application logic and should not be a draft prop.
- Hardcoded: member navigation and layout structure.

## AdminRoute
- Source: `src/routes/_authenticated/admin/route.tsx`
- Category: layout
- Description: Admin sidebar workspace with profile, compatibility, imam, and membership navigation.
- Extractable props: activeItem (string, default: "overview")
- Hardcoded: navigation labels, icon names, workspace typography, all Tailwind classes.

## ImamRoute
- Source: `src/routes/_authenticated/imam/route.tsx`
- Category: layout
- Description: Imam oversight workspace for suitable matches and supported meetings.
- Extractable props: activeItem (string, default: "introductions")
- Hardcoded: workflow labels, icon names, all Tailwind classes.
