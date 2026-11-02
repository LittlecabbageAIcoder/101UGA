# HKACC No. 101 Squadron

Public website and member portal for Hong Kong Air Cadet Corps No. 101 Squadron (HKUGA College).

**Live site (GitHub Pages):** after the first deploy, open  
`https://<github-username>.github.io/hkacc101/`

## Notes

- Account and form data are stored **only in the visitor’s browser** (encrypted `localStorage` vault). They are **not** stored in this GitHub repository.
- Roles: **cadet** (hand in forms), **officer** (review forms), **admin** (manage accounts).
- Primary admin sign-in is configured in the portal (see squadron officers). Do not commit real production secrets to a public repo beyond what the static app already needs to run.

## Local preview

```bash
python3 -m http.server 4173
```

Then open http://127.0.0.1:4173/
