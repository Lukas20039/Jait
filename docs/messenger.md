# Personal Messenger

Jait includes a browser Matrix client at **Messenger** (`/messenger`). It is separate from AI Chat and Settings → Channels. It sends and receives messages as your Matrix account; personal-account bridges translate them to other services.

## Packaging

The client is built into Jait; a plugin is not required. The Matrix SDK, encryption module and UI load on demand. Synapse and bridges run as separate, optional processes. Normal Jait startup and npm installs do not pull images or start them.

The included Docker helper runs a small single-user, non-federated Synapse server with SQLite. Production multi-user deployments should use an independently managed homeserver with PostgreSQL. See [Synapse deployment instructions](https://element-hq.github.io/synapse/latest/setup/installation.html).

## Included behavior and limits

- Password sign-in or device-bound access tokens for existing/SSO accounts.
- Live conversation list, service/network labels from bridge metadata, search, unread counts and filters.
- Read/reply, invitations, earlier history, encrypted Matrix messages and encrypted attachments up to 20 MB.
- Explicit image loading, including bridge QR codes, and authenticated media downloads.
- Bridge setup conversations, Matrix direct conversations, and message-key recovery from server backup.
- Explicitly enabled Jait notifications while the client remains open. Notification previews say “New message.”
- Public Matrix read receipts with reader names and receipt times; unsupported bridge receipts remain unknown.
- Manual mark-as-read/unread synchronized through Matrix account data.
- “Mark as read” on supported notifications, scoped to the notified event so newer messages stay unread.
- Dictation through the shared composer microphone control, using Settings → speech-to-text provider. Click **Dictate**, speak, then **Done**; review the draft before sending. A delayed transcript stays with its original conversation.
- Responsive conversation navigation on narrow screens.

One Matrix account can be connected per Jait user/browser tab. It can aggregate multiple upstream bridge logins if those bridges support them. WhatsApp, Telegram, Signal and Teams require installed/configured bridges and separate account authorization. Service buttons help address setup conversations; they do not claim a service is connected.

Not included: automatic bridge installation, provisioning APIs, simultaneous Matrix accounts, calls, reactions UI, message editing, native Teams activity feeds, guaranteed Teams guest-tenant coverage, push after Jait closes, interactive device verification or cross-signing setup. New direct conversations are encrypted by default. Configure bridge encryption support before opening their setup conversations. Use another Matrix client such as Element for device verification and recovery setup. Bridges requiring verified devices may need that step.

## Connect an existing homeserver

1. Open Messenger and enter your HTTPS homeserver URL and Matrix credentials.
2. For SSO accounts use a device-bound Matrix access token. Use a distinct device for Jait; do not share its crypto store concurrently with another client.
3. Rooms appear during synchronization. Accept bridge invitations as appropriate.
4. Open Connections for bridge setup conversations, notifications or backup-key recovery.

The server must allow browser client access (CORS). Matrix requests go directly from the browser, without a Jait gateway proxy. Encryption and Web Locks require a secure browser context: HTTPS remotely or loopback HTTP locally.

## Run the included server

The helper is also included in the gateway npm package as `jait-matrix`. With an installed package use `jait-matrix <command> --project-root /path/to/your/project`. It requires an explicit project path so private data never lands inside the npm installation.

From the repository root, with Docker available to your regular user:

~~~sh
node scripts/matrix-stack.mjs init --server-name jait.local
node scripts/matrix-stack.mjs start
node scripts/matrix-stack.mjs status
node scripts/matrix-stack.mjs register
~~~

Registration prompts interactively for a Matrix username and password. Do not put credentials in terminal commands. In Messenger, connect to `http://localhost:8008` using that account. Pick a permanent server name during initialization; Matrix account and room identities depend on it.

Initialization pulls the official Synapse image and pins its digest in `.jait/artifacts/matrix/runtime.json`. Use `--image image:tag` to select a release. It generates configuration, a signing key and registration secret, disables public registration/statistics/federation, and limits uploads to 20 MB. The service binds only host loopback. Containers use the invoking UID/GID and writable HOME; root does not write into the project.

Configuration, database, keys, media and appservice registrations live in `.jait/artifacts/matrix/`, anchored to the script's checkout independently of terminal CWD. Protect and back up this directory: it contains private messages and credentials. Keep it out of Git and public artifact exports. Stopping preserves data:

~~~sh
node scripts/matrix-stack.mjs logs
node scripts/matrix-stack.mjs stop
node scripts/matrix-stack.mjs restart
~~~

Use `--port 18008` at initialization if 8008 is occupied. All commands accept `--data-dir .jait/artifacts/<directory>` for isolated runtimes. Paths outside the checkout and symlink escapes are rejected.

For remote access, configure an HTTPS reverse proxy and update Synapse's public URL, keeping its backend on loopback. On a phone, localhost means the phone; use the server's HTTPS address. Federation is disabled by default and requires an explicit deployment decision to enable.

## Connect bridges

The [mautrix setup instructions](https://docs.mau.fi/bridges/general/docker-setup.html) cover WhatsApp, Signal and Telegram prerequisites and registration. Teams support must be proven with your actual accounts and tenants.

1. Select and pin a bridge release. Put its configuration/data in `.jait/artifacts/matrix/bridges/<service>/`.
2. Set its homeserver URL to `http://synapse:8008` and its domain to your permanent server name. Grant bridge permissions to your exact Matrix user, not all users.
3. Generate its appservice registration following that bridge's instructions. Its callback URL must name the bridge's container and port on the network printed by `matrix-stack start`.
4. Run it on that Docker network, with the host UID/GID and writable HOME for project mounts. Some bridge entrypoints change ownership: bypass them using the documented direct binary, or initialize in container-owned storage and export as the host user. Never run root entrypoints against writable project mounts.
5. Register its generated file, then restart Synapse:

~~~sh
node scripts/matrix-stack.mjs register-bridge whatsapp .jait/artifacts/matrix/bridges/whatsapp/registration.yaml
node scripts/matrix-stack.mjs restart
~~~

6. In Connections, enter its exact bot ID and click Open. Send `help` and follow its login steps. Load QR images explicitly.
7. Bridged conversations appear in the shared inbox. Multiple accounts and Teams tenants depend on the bridge and organization policy; Matrix does not grant access.

Trust a bridge before installing its appservice registration: it handles upstream sessions and decrypted messages. Matrix encryption terminates there to translate protocols. See [end-to-bridge encryption](https://docs.mau.fi/bridges/general/end-to-bridge-encryption.html).

## Privacy and lifecycle

Dictation explicitly sends recorded microphone audio to Jait’s configured speech-to-text service (which may be a remote provider). It does not include conversation history or Matrix credentials. It requires Jait authentication and microphone access.

Matrix credentials/messages are not stored in Jait settings, AI chat history, memory or prompts. No agent tools expose this inbox. Password and recovery-key input are cleared after submission. Access tokens live in memory and tab-scoped sessionStorage, partitioned by Jait gateway/user; refresh resumes that tab session. Per-owner/per-device encryption keys persist in browser IndexedDB.

The provider remains mounted across Jait pages, preserving synchronization and notifications. Disconnect stops synchronization, clears local session/conversations and attempts token revocation. Jait logout stops the client and clears the tab session. Browser key stores remain; clear site data to remove them. Keep an independent recovery path before signing out of your only working Matrix device.

Web Locks prevent simultaneous use of a crypto store. Remote messages render as React text. Media tokens go only to the configured homeserver; redirects are rejected, with a 30-second timeout and streamed 20 MB cap. No existing gateway path/SSRF protection is changed. Connection success does not prove any external account or tenant is connected.

## Validation

~~~sh
bun run typecheck
bun run test
bun run test:e2e -- messenger.spec.ts
bun run check:artifacts
~~~

For the opt-in real-Synapse browser test, use an isolated runtime:

~~~sh
node scripts/matrix-stack.mjs init --server-name messenger.test --port 18008 --data-dir .jait/artifacts/matrix-validation
node scripts/matrix-stack.mjs start --data-dir .jait/artifacts/matrix-validation
JAIT_MATRIX_INTEGRATION=1 bun run test:e2e -- messenger.spec.ts
node scripts/matrix-stack.mjs stop --data-dir .jait/artifacts/matrix-validation
~~~

This creates synthetic local accounts, verifies encrypted delivery in both directions and ciphertext on the server, transfers an encrypted attachment, accepts an invitation, checks filters/mobile layout, and resumes a session after refresh. Real messenger accounts are not connected. Keep local test credentials and raw browser traces private. With an HTTP proxy, include localhost and 127.0.0.1 in NO_PROXY for Playwright.

The inbox reuses Jait’s `Conversation`, `Message`, `PromptInput`, `ChatComposerSurface`, and attachment components. Their messenger mode keeps the shared scrolling, keyboard, mobile, and copy behavior while omitting AI controls and project reference chips. File selection, paste, and drop send attachments directly through the Matrix client. Personal conversation text is rendered literally.
