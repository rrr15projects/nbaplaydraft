Add Videos and Images to the NBA Draft Website
This package adds:
MP4 and WebM video uploads on the Commissioner page
JPG, JPEG, PNG, WebP, and GIF image uploads
One combined media library with Preview, Show on Big Screen, and Delete
A Stop Media and Return to Draft button
Automatic return to the draft when a video ends
Images that stay on the display until the commissioner stops them
An option to pause the draft clock before showing media
A browser-only demo mode that works between tabs in the same browser
Files included
`commissioner.html` — replacement file
`display.html` — replacement file
`video-feature.js` — replacement/new file; now handles videos and images
`video-feature.css` — replacement/new file
`video-setup.sql` — updated Supabase migration
Install or upgrade
Back up the current GitHub repository.
Upload these four website files to the repository root:
`commissioner.html`
`display.html`
`video-feature.js`
`video-feature.css`
Replace files with the same names when GitHub asks.
Open Supabase → SQL Editor and run the new `video-setup.sql`.
Run it even if you already ran the earlier video-only SQL. It updates the bucket and upload validation to permit images.
Keep the existing `config.js`, `common.js`, `commissioner.js`, `display.js`, and other files unchanged.
Refresh the GitHub Pages website. A hard refresh may be needed.
Test
Open `display.html` in one tab and log in.
Open `commissioner.html` in another tab and log in.
Go to Step 4: Draft.
Upload a small JPG or PNG.
Press Show on Big Screen.
The image should fill the display and remain there until Stop Media and Return to Draft is pressed.
Upload an MP4 and verify that it returns to the draft automatically when it ends.
Important notes
Images use `object-fit: contain`, so the whole image remains visible without being cropped.
MP4 is the safest video format for TVs and browsers.
Maximum file size is 100 MB.
Some browsers block automatic video sound. The display may start muted and show a Turn On Sound button.
In demo mode, files are stored only in that browser using IndexedDB.
In live mode, files are stored in the existing public Supabase Storage bucket named `draft-videos`; the internal name is retained for compatibility with the first package.
The simple browser upload policy permits anyone who has your public Supabase project credentials to upload/delete objects in this bucket. A hardened public site should move uploads behind a server or Supabase Edge Function.
If you rerun the original destructive `setup.sql`, rerun this `video-setup.sql` afterward.
