# 🏀 Super Simple Basketball Draft

A lightweight, browser-based basketball draft system for leagues, tournaments, fantasy drafts, school events, and draft-night parties.

Run a complete draft with:

* 🔐 Separate commissioner, team, display, and owner logins
* 👥 Player and team management
* 🔢 Custom draft order
* 📣 A live draft display
* 📱 Support for phones, tablets, and computers
* ☁️ Optional Supabase synchronization
* 🚀 Free hosting through GitHub Pages

> **No frameworks. No build process. No complicated folder structure.**
> Every file stays directly inside the main GitHub repository.

---

## 🎯 How It Works

```text
Commissioner sets up the draft
              ↓
Teams log in and submit their picks
              ↓
Commissioner controls the draft
              ↓
Selections appear on the live display
```

---

## 📄 Pages

| File                | Purpose                                          |
| ------------------- | ------------------------------------------------ |
| `index.html`        | Automatically opens the Commissioner page        |
| `commissioner.html` | Commissioner login and complete draft management |
| `team.html`         | Team login and player selection                  |
| `display.html`      | Password-protected live draft screen             |
| `passwords.html`    | Owner-only password management                   |
| `config.js`         | Supabase configuration and demo-mode settings    |
| `setup.sql`         | Creates the required Supabase database structure |

### Commissioner Workflow

```text
Players → Teams → Draft Order → Draft
```

The commissioner can prepare the player pool, create teams, arrange the draft order, and manage selections from one screen.

---

## 🔑 First-Time Demo Passwords

| Account               | Password                                           |
| --------------------- | -------------------------------------------------- |
| Owner / Password Room | `owner`                                            |
| Commissioner          | `commissioner`                                     |
| Display               | `display`                                          |
| Teams                 | Random four-digit password generated for each team |

All passwords can be changed from:

```text
passwords.html
```

> ⚠️ Change the default passwords before using the application for an actual event.

---

# 🚀 Getting Started

The application supports two operating modes.

## 1. Demo Mode

Demo mode is the fastest way to test the draft.

### Setup

1. Download or clone the repository.
2. Leave `config.js` unchanged.
3. Open `index.html` in your browser.
4. Use the default Commissioner password:

```text
commissioner
```

Demo mode does not require SQL, Supabase, or a server.

You can test the different pages in separate tabs on the **same browser**.

### Demo Mode Limitations

Demo mode saves draft information and passwords inside the browser.

This means:

* It works only in that browser.
* Other phones and computers will not see the draft.
* Clearing browser storage may erase the draft.
* It should not be used for a real private event.

---

## 2. Live Mode

Live mode synchronizes the draft across multiple phones, tablets, and computers using Supabase.

### Step 1 — Create a Supabase Project

Create a free project at Supabase.

### Step 2 — Set Up the Database

Inside your Supabase project:

1. Open **SQL Editor**.
2. Open the repository's `setup.sql` file.
3. Copy the complete SQL script.
4. Paste it into the SQL Editor.
5. Run the script once.

### Step 3 — Get Your API Information

Go to:

```text
Supabase → Project Settings → API
```

Copy these two values:

* Project URL
* Anon public key

### Step 4 — Update `config.js`

Paste the values into the appropriate fields inside `config.js`.

Example:

```javascript
const SUPABASE_URL = "YOUR_SUPABASE_PROJECT_URL";
const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_PUBLIC_KEY";
```

Do not place your Supabase service-role key in this file.

### Step 5 — Upload the Files to GitHub

Upload every project file directly to the root of one GitHub repository.

Your repository should look similar to this:

```text
index.html
commissioner.html
team.html
display.html
passwords.html
config.js
setup.sql
README.md
```

There are no required folders.

### Step 6 — Enable GitHub Pages

Inside your GitHub repository:

1. Open **Settings**.
2. Select **Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select the `main` branch.
5. Select `/ (root)`.
6. Save the settings.

GitHub will generate a public address similar to:

```text
https://your-username.github.io/your-repository/
```

Open that address to launch the Commissioner page.

---

# 🖥️ Using the Draft

## Commissioner

Open:

```text
commissioner.html
```

The commissioner controls the complete draft:

1. Add the available players.
2. Create the teams.
3. Arrange the draft order.
4. Start and manage the draft.
5. Confirm or record selections.

---

## Teams

Open:

```text
team.html
```

Each team signs in using its generated four-digit password and submits its selection when it is their turn.

---

## Live Display

Open:

```text
display.html
```

Use this page on a television, projector, monitor, or shared screen to show the draft.

The display is protected by the Display password.

---

## Password Management

Open:

```text
passwords.html
```

Sign in using the Owner password to change:

* Owner password
* Commissioner password
* Display password
* Individual team passwords

---

# 🔒 Security

The two operating modes handle security differently.

### Live Supabase Mode

In live mode, passwords are validated through the database. This is the recommended option for an actual event involving multiple devices.

### Browser Demo Mode

Demo mode stores passwords and draft information inside the browser.

> 🚨 **Do not use demo mode for a real private event across different devices.**

Demo mode is intended only for:

* Local testing
* Feature demonstrations
* Same-browser tab testing
* Learning how the application works

For an actual draft, configure Supabase and change every default password.

---

# ✅ Draft-Day Checklist

Before the event:

* [ ] Supabase is configured
* [ ] `setup.sql` has been run
* [ ] GitHub Pages is enabled
* [ ] Default passwords have been changed
* [ ] Players have been entered
* [ ] Teams have been created
* [ ] The draft order has been confirmed
* [ ] Every team has tested its login
* [ ] The live display has been tested
* [ ] All devices are connected to the internet

---

# 🧰 Built With

* HTML
* CSS
* JavaScript
* Supabase
* GitHub Pages

No framework, package installation, or build command is required.

---

# 🏆 Perfect For

* Basketball leagues
* Fantasy drafts
* Youth tournaments
* School sports
* Recreation leagues
* Draft-night parties
* Mock drafts

---

## 🏀 Ready to Draft?

Open `index.html`, sign in as the Commissioner, add your players and teams, and start the draft.

**Simple setup. Live selections. One unforgettable draft night.**
