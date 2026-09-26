# Key page dependency trees

## / (Home)

Entry: `src/routes/index.tsx`

Dependencies:
- `src/routes/index.tsx`
  - `src/components/SiteFooter.tsx`
    - `src/components/BrandName.tsx`
  - `src/components/SiteHeader.tsx`
    - `src/components/BrandName.tsx`
    - `src/integrations/supabase/client.ts`
      - `src/integrations/supabase/client.ts`
      - `src/integrations/supabase/types.ts`
  - `src/integrations/supabase/client.ts`
    - `src/integrations/supabase/client.ts`
    - `src/integrations/supabase/types.ts`

## /auth

Entry: `src/routes/auth.tsx`

Dependencies:
- `src/routes/auth.tsx`
  - `src/components/BrandName.tsx`
  - `src/integrations/lovable/index.ts`
    - `src/integrations/supabase/client.ts`
      - `src/integrations/supabase/client.ts`
      - `src/integrations/supabase/types.ts`
  - `src/integrations/supabase/client.ts`
    - `src/integrations/supabase/client.ts`
    - `src/integrations/supabase/types.ts`

## /dashboard

Entry: `src/routes/_authenticated/dashboard.tsx`

Dependencies:
- `src/routes/_authenticated/dashboard.tsx`
  - `src/components/BrandName.tsx`
  - `src/components/PairingsSection.tsx`
    - `src/lib/meeting-packages.ts`
    - `src/lib/pairings.functions.ts`
      - `src/integrations/supabase/auth-middleware.ts`
        - `src/integrations/supabase/types.ts`
      - `src/integrations/supabase/client.server.ts`
        - `src/integrations/supabase/client.server.ts`
        - `src/integrations/supabase/types.ts`
      - `src/lib/geo.ts`
  - `src/integrations/supabase/client.ts`
    - `src/integrations/supabase/client.ts`
    - `src/integrations/supabase/types.ts`
  - `src/lib/admin.functions.ts`
    - `src/integrations/supabase/auth-middleware.ts`
      - `src/integrations/supabase/types.ts`
    - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/types.ts`
    - `src/lib/matches.functions.ts`
      - `src/integrations/supabase/auth-middleware.ts`
        - `src/integrations/supabase/types.ts`
      - `src/lib/openai-compatibility.server.ts`
      - `src/lib/survey-questions.ts`
  - `src/lib/imam.functions.ts`
    - `src/integrations/supabase/auth-middleware.ts`
      - `src/integrations/supabase/types.ts`
    - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/types.ts`
    - `src/lib/geo.ts`
  - `src/lib/matches.functions.ts`
    - `src/integrations/supabase/auth-middleware.ts`
      - `src/integrations/supabase/types.ts`
    - `src/lib/openai-compatibility.server.ts`
    - `src/lib/survey-questions.ts`
  - `src/lib/privacy.functions.ts`
    - `src/integrations/supabase/auth-middleware.ts`
      - `src/integrations/supabase/types.ts`
    - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/types.ts`
  - `src/lib/survey.functions.ts`
    - `src/integrations/supabase/auth-middleware.ts`
      - `src/integrations/supabase/types.ts`

## /survey

Entry: `src/routes/_authenticated/survey.tsx`

Dependencies:
- `src/routes/_authenticated/survey.tsx`
  - `src/lib/survey-questions.ts`
  - `src/lib/survey.functions.ts`
    - `src/integrations/supabase/auth-middleware.ts`
      - `src/integrations/supabase/types.ts`

## /settings

Entry: `src/routes/_authenticated/settings.tsx`

Dependencies:
- `src/routes/_authenticated/settings.tsx`
  - `src/components/BrandName.tsx`
  - `src/integrations/supabase/client.ts`
    - `src/integrations/supabase/client.ts`
    - `src/integrations/supabase/types.ts`
  - `src/lib/privacy.functions.ts`
    - `src/integrations/supabase/auth-middleware.ts`
      - `src/integrations/supabase/types.ts`
    - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/types.ts`

## /admin

Entry: `src/routes/_authenticated/admin/index.tsx`

Dependencies:
- `src/routes/_authenticated/admin/index.tsx`
  - `src/lib/admin.functions.ts`
    - `src/integrations/supabase/auth-middleware.ts`
      - `src/integrations/supabase/types.ts`
    - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/types.ts`
    - `src/lib/matches.functions.ts`
      - `src/integrations/supabase/auth-middleware.ts`
        - `src/integrations/supabase/types.ts`
      - `src/lib/openai-compatibility.server.ts`
      - `src/lib/survey-questions.ts`

## /admin/compatibility

Entry: `src/routes/_authenticated/admin/compatibility.tsx`

Dependencies:
- `src/routes/_authenticated/admin/compatibility.tsx`
  - `src/lib/admin.functions.ts`
    - `src/integrations/supabase/auth-middleware.ts`
      - `src/integrations/supabase/types.ts`
    - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/types.ts`
    - `src/lib/matches.functions.ts`
      - `src/integrations/supabase/auth-middleware.ts`
        - `src/integrations/supabase/types.ts`
      - `src/lib/openai-compatibility.server.ts`
      - `src/lib/survey-questions.ts`

## /imam

Entry: `src/routes/_authenticated/imam/index.tsx`

Dependencies:
- `src/routes/_authenticated/imam/index.tsx`
  - `src/lib/imam.functions.ts`
    - `src/integrations/supabase/auth-middleware.ts`
      - `src/integrations/supabase/types.ts`
    - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/types.ts`
    - `src/lib/geo.ts`
  - `src/lib/meeting-packages.ts`
  - `src/lib/pairings.functions.ts`
    - `src/integrations/supabase/auth-middleware.ts`
      - `src/integrations/supabase/types.ts`
    - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/client.server.ts`
      - `src/integrations/supabase/types.ts`
    - `src/lib/geo.ts`
