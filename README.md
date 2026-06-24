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

## 🏀 Ready to Draft?

Open `index.html`, sign in as the Commissioner, add your players and teams, and start the draft.

**Simple setup. Live selections. One unforgettable draft night.**
