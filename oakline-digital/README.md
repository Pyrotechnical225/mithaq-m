# Oakline Digital website

A standalone marketing site for Oakline Digital, a studio that builds the online presence of
small businesses. Plain HTML, CSS and JavaScript: no build step and no dependencies.

This folder is separate from the Mithaq app in the rest of this repository and does not affect it.

## Files

| File          | What it is                                              |
| ------------- | ------------------------------------------------------- |
| `index.html`     | Home page                                               |
| `faq.html`       | Full FAQ page with search and topics                    |
| `privacy.html`   | Privacy notice (draft: fill in the bracketed details)   |
| `404.html`       | "Page not found" page (most static hosts use it automatically) |
| `site-config.js` | **Your email, phone, WhatsApp and form address: edit this one file** |
| `styles.css`     | Design tokens (colours, fonts, spacing) and all styling |
| `main.js`        | Menu, diagram, FAQs, search, contact links and form     |
| `images/`        | Photos for the mock-ups (see `images/README.md`)        |
| `favicon.svg`    | Browser tab icon                                        |

## Preview locally

```sh
cd oakline-digital
python3 -m http.server 4173
# then open http://localhost:4173
```

Opening `index.html` directly in a browser also works.

## Deploy

Upload the folder to any static host (Netlify, Vercel, Cloudflare Pages, GitHub Pages).
Set the publish directory to `oakline-digital` and leave the build command empty.

## Before going live

1. **Contact details.** In `site-config.js`, set your real email, phone and WhatsApp number.
   The phone number there now (07700 900123) is an Ofcom drama number that never connects.
   Set any value to `""` to hide it.
2. **Connect the enquiry form.** Set `formEndpoint` in `site-config.js` to a URL that accepts a
   JSON `POST` (for example a Formspree form). Until then the form checks what visitors type but
   sends nothing, and says so. It posts `name`, `email`, `business`, `phone`, `services` (array)
   and `message`.
3. **Photos.** Add the photos listed in `images/README.md`. Missing photos fall back to the
   drawn illustrations.
4. **Privacy notice.** Fill in the [bracketed] details in `privacy.html` and delete the draft box.
5. **Business details.** No address, company number or terms have been added.
6. **Free online check-up.** The site offers it, so make sure you can deliver it (see the
   business plan).
7. **Concept projects.** Hearth & Crumb, Little Fig Café, Brightwire Electrical and Studio Sable
   are fictional and labelled as concepts. Replace them with real client work (with permission)
   when you have it.
8. **404 page.** It uses root paths (`/styles.css`), so it works when the site is served from the
   domain root, which is how Netlify, Vercel and Cloudflare Pages serve it.

The business plan is in `../oakline-business/business-plan.md` (kept outside this folder so it is
never published with the site).
