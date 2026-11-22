# XI Media Deck — updated GitHub project

This package updates the existing XI Media Deck repository. It includes the application source, theme catalog, and the public image files referenced by the theme presets.

## Upload into your existing GitHub repository

1. Download and extract this ZIP on your computer.
2. Open your existing XI Media Deck repository on GitHub.
3. Choose **Add file → Upload files**.
4. Open the extracted folder and select **all files and folders inside it** (including hidden `.github` if your repository needs the workflow). Do not upload the outer ZIP or create a second nested `xi_project` folder.
5. Drop the files into the repository root. Allow GitHub to replace matching files.
6. Commit the changes.
7. Open **Actions → Build desktop installers → Run workflow**.
8. When the run succeeds, download the Windows artifact.

## Theme image paths

Theme presets refer to images under `/assets/images/` and `/assets/aistudio/`. These files are included under `public/assets/`, so Vite copies them into the production build and the desktop app can load them.

## Desktop entry

`package.json` points Electron to `electron/main.cjs`. The desktop workflow uses `npm install --legacy-peer-deps` to accommodate the existing Vite/esbuild peer dependency declarations.

Back up any personal custom theme data before replacing files. This package preserves the source project files and bundled theme artwork, but cannot recover custom data stored only inside an already-installed app.
