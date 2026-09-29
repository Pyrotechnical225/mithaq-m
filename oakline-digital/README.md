# Oakline Digital website

A standalone marketing site for Oakline Digital, a studio that builds the online presence of
small businesses. Plain HTML, CSS and JavaScript: no build step and no dependencies.

This folder is separate from the Mithaq app in the rest of this repository and does not affect it.

## Files

| File          | What it is                                              |
| ------------- | ------------------------------------------------------- |
| `index.html`  | All page content and copy                               |
| `styles.css`  | Design tokens (colours, fonts, spacing) and all styling |
| `main.js`     | Menu, diagram, FAQ accordion and enquiry form           |
| `favicon.svg` | Browser tab icon                                        |

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

1. **Connect the enquiry form.** At the top of `main.js`, set `FORM_ENDPOINT` to a URL that
   accepts a JSON `POST` (for example a Formspree form, or your own serverless function).
   Until you do, the form checks what visitors type but sends nothing, and it tells them so.
   The form posts: `name`, `email`, `business`, `phone` (may be empty), `services` (array)
   and `message`.
2. **Contact email.** `info@oaklinedigital.co.uk` has not been confirmed as a working mailbox,
   so it is not shown. Once it works, set `CONTACT_EMAIL` in `main.js` and it appears in the
   footer.
3. **Business details.** No address, company number or legal pages have been added. Add a
   privacy notice before collecting enquiries (the form collects personal data).
4. **Concept projects.** Hearth & Crumb, Little Fig Café, Brightwire Electrical and Studio
   Sable are fictional and labelled as concepts. Replace them with real client work (with
   permission) when you have it.
