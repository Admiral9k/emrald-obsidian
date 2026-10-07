# EMRALD 1.3.1

A small security release: your EMRALD API key now lives in Obsidian's keychain instead of the plugin's settings file.

Improvements:

- Your API key is stored in Obsidian's keychain, not in the plugin's data file. Existing keys move over automatically the first time the plugin loads; there is nothing to do.
- The keychain belongs to each device. On a new device (or a synced vault), paste your key once in Settings -> EMRALD, and EMRALD will say so if it can't find one.
- Setup keeps your saved key if a new one fails the connection test.

If you roll back to 1.3.0 you will need to paste your key again. `minAppVersion` stays at 1.13.0.
