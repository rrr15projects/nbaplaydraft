# Super Simple Basketball Draft

Everything stays in the main GitHub repository. There are no folders.

## Pages

- `commissioner.html` — password login, then Players → Teams → Order → Draft
- `team.html` — teams log in and make their pick
- `display.html` — password-locked public screen
- `passwords.html` — owner changes every password
- `index.html` — automatically opens Commissioner

## First-time demo passwords

- Owner / Password Room: `owner`
- Commissioner: `commissioner`
- Display: `display`
- Team passwords: each new team gets a random four-digit password

Change all passwords inside `passwords.html`.

## Demo mode

You do not need SQL for testing in tabs on the same browser. Leave `config.js` unchanged.

## Live mode across phones and computers

1. Create a free Supabase project.
2. Open Supabase → SQL Editor.
3. Paste and run `setup.sql` once.
4. Open Supabase → Project Settings → API.
5. Copy the Project URL and anon public key into `config.js`.
6. Upload every file directly to the root of one GitHub repository.
7. Turn on GitHub Pages from the `main` branch and `/ (root)`.

## Important security note

The Supabase version validates passwords on the database. Demo mode stores data and passwords in the browser and is only for testing. Do not use demo mode for a real private event across different devices.
