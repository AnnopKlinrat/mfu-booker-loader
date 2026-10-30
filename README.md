# MFU Badminton Booker

An auto-booking helper for the MFU sport complex court site. This repository holds only a small
loader; the program itself is not in the repository.

## Use

1. Install Node.js 20 or newer.
2. Get a license token from the person who runs this service (it looks like
   `MFU-XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX`).
3. Run `npm start` in this folder. The first time, paste the token when asked. It is saved to
   `license.txt` next to `loader.mjs`; do not share that file.
4. Open http://127.0.0.1:3000, add your MFU account(s) under Settings and pick the slots.

Your MFU username/password and settings stay on your computer, in the `data/` folder.

## What the loader does (please read)

- On every start it sends your license token and a random per-computer id to the license server,
  downloads the current program, checks its digital signature, and runs it from memory.
- While running it checks the license again about every 30 minutes. If the license expires or is
  revoked, the program stops. A short internet outage (up to 6 hours) is tolerated.
- A token works on a limited number of computers. Updates arrive automatically at the next start.
- Because the program is downloaded from the license server, it changes whenever the publisher
  releases a new version. Only run it if you trust the publisher.
