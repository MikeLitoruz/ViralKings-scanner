# Telegram session encryption

This branch encrypts both Telegram API settings and the exported MTProto session with PBKDF2-SHA256 (310,000 iterations) and AES-256-GCM. It uses mtcute MemoryStorage for all live connections. The encrypted record is stored locally in browser localStorage; the unencrypted session only exists while the tab is unlocked. The prior IndexedDB session database is removed before connecting (close other open Viral Scanner tabs first).

Build on GitHub Actions via **Build and test secure Telegram client**. The workflow downloads @mtcute/web 0.32.4, builds a fresh Telegram vendor file and uploads a complete static-site artifact. **Do not merge or deploy the source branch alone:** the old main-branch browser bundle lacks MemoryStorage export and is intentionally rejected by the new authentication module.

No secret credentials belong in the repository. A forgotten passphrase cannot be recovered; revoke the browser session in Telegram if necessary. The encrypted local store does not defend against malicious scripts while unlocked. 'Log out and forget' attempts server-side revocation, then deletes local data even without network access; check active sessions in Telegram to confirm revocation when offline.
