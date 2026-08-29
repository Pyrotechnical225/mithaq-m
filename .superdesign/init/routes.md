# Route map

| URL | Source | Layout | Purpose |
| --- | --- | --- | --- |
| `/` | `src/routes/index.tsx` | `SiteHeader + SiteFooter` | `Professional public landing page and four-stage journey` |
| `/auth` | `src/routes/auth.tsx` | `Standalone auth split layout` | `Email and Google sign-in/sign-up` |
| `/auth/callback` | `src/routes/auth.callback.tsx` | `Callback route` | `Exchanges OAuth code and restores the session` |
| `/dashboard` | `src/routes/_authenticated/dashboard.tsx` | `Authenticated member shell` | `Survey, privacy, compatibility, and introductions` |
| `/survey` | `src/routes/_authenticated/survey.tsx` | `Authenticated member shell` | `Structured member questionnaire` |
| `/settings` | `src/routes/_authenticated/settings.tsx` | `Authenticated member shell` | `Account and privacy settings` |
| `/membership` | `src/routes/_authenticated/membership.tsx` | `Authenticated member shell` | `Membership status and billing` |
| `/imam-apply` | `src/routes/_authenticated/imam-apply.tsx` | `Authenticated member shell` | `Imam application` |
| `/admin` | `src/routes/_authenticated/admin/index.tsx` | `Admin workspace` | `Admin overview` |
| `/admin/profiles` | `src/routes/_authenticated/admin/profiles.tsx` | `Admin workspace` | `Member profile management` |
| `/admin/profiles/$userId` | `src/routes/_authenticated/admin/profiles.$userId.tsx` | `Admin workspace` | `Member detail and live compatibility` |
| `/admin/compatibility` | `src/routes/_authenticated/admin/compatibility.tsx` | `Admin workspace` | `All-score compatibility audit` |
| `/admin/imams` | `src/routes/_authenticated/admin/imams.tsx` | `Admin workspace` | `Imam account management` |
| `/imam` | `src/routes/_authenticated/imam/index.tsx` | `Imam workspace` | `Suitable-match and meeting oversight` |
| `/nikah` | `src/routes/nikah.tsx` | `SiteHeader + SiteFooter` | `Nikah guidance` |
| `/mahr` | `src/routes/mahr.tsx` | `SiteHeader + SiteFooter` | `Mahr guidance` |
| `/wali` | `src/routes/wali.tsx` | `SiteHeader + SiteFooter` | `Wali guidance` |
| `/halal-relationships` | `src/routes/halal-relationships.tsx` | `SiteHeader + SiteFooter` | `Halal relationship guidance` |
| `/community` | `src/routes/community.tsx` | `SiteHeader + SiteFooter` | `Community and imam directory` |

## `src/router.tsx`

```tsx
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

```
