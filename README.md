# Ava-Valt Web Admin

This replaces the Unity **database/importer management** workflow. It does NOT replace the runtime remote loader inside the VRChat world.

## Deploy
1. Create a new GitHub repo for this website and upload these files.
2. Import that repo into Vercel.
3. Add environment variables from `.env.example`.
4. `GITHUB_TOKEN`: fine-grained token limited to `BuzzHiveChat/Ava-Valt-Database`, Contents read/write.
5. Set a strong `ADMIN_PASSWORD` and a long random `SESSION_SECRET`.
6. Deploy, visit `/login`, and use the dashboard.

The browser never receives the GitHub token. GitHub writes happen only in server routes.

## Existing database
Defaults already target:
- owner: BuzzHiveChat
- repo: Ava-Valt-Database
- branch: main
- path: avatar-index.json

## Unity cleanup
After the website successfully adds an avatar to GitHub and the published world can still load the remote database, import `AvaValtUnityImporterCleanup.cs` from the companion folder into Unity and run:
`Ava-Valt > Migration > Remove Unity Database Tools`

The cleanup intentionally preserves your runtime `AvaValt_System` / remote-loading scripts.
