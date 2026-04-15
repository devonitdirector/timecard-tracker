# Timecard Tracker

A lightweight time tracker for keeping personal clock-in and clock-out records without logging into an official work system.

## Features

- One-click `Clock In` and `Clock Out`
- Daily and weekly hours pinned at the top
- Multiple sessions per day
- Editable saved session log
- Installable on a phone home screen as a PWA
- Offline support after the app has been opened once
- Export and import so you can move your data between devices
- Local browser storage so your entries persist on that device

## Desktop Use

Open `index.html` in a browser.

## Publish For Phone Use

The simplest free option is GitHub Pages.

### Option A: Publish without installing Git

1. Create a new GitHub repository on [github.com](https://github.com/) named something like `timecard-tracker`.
2. On the new repo page, choose `uploading an existing file`.
3. Drag all files from this folder into GitHub, including `.nojekyll`.
4. Commit the upload.
5. In the GitHub repo, open `Settings` then `Pages`.
6. Under `Build and deployment`, set:
   - `Source`: `Deploy from a branch`
   - `Branch`: `main`
   - `Folder`: `/ (root)`
7. Save, then wait about 1 to 3 minutes.
8. Your app will appear at a URL like `https://YOUR-GITHUB-NAME.github.io/timecard-tracker/`.

### Option B: Publish with GitHub Desktop

1. Install GitHub Desktop.
2. Create a new repo from this folder.
3. Publish it to GitHub.
4. In the GitHub website, turn on GitHub Pages from the `main` branch root.

## Install On Your Phone

1. Open the GitHub Pages URL on your phone.
2. On iPhone Safari: tap `Share`, then `Add to Home Screen`.
3. On Android Chrome: open the browser menu, then tap `Install app` or `Add to Home Screen`.
4. After opening it once, it should keep working offline.

## Moving Your Data Between Devices

Your phone and computer each keep their own local copy of sessions.

To move existing data:

1. Open the app on the old device.
2. Tap `Export Data`.
3. Send the downloaded JSON file to your other device.
4. Open the app there and tap `Import Data`.
