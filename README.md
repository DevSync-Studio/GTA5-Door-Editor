# GTA5 Door Editor

<p align="center">
  <img src="logo.png" alt="GTA5 Door Editor" width="160" />
</p>

## Requirements:
- Windows 10 or 11, 64-bit
- [WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (usually already installed with Edge)
- A few hundred MB free disk for the install


## Download:
Get the latest Windows installer or `.exe` from [Releases](releases).

Windows may warn that the app is unsigned. That is normal for small tools. Prefer builds from this repo's Releases page only.

## App usage:
Pick a tool from the left sidebar (or `Ctrl+1` ... `Ctrl+5`).

Import with the drop zone / open button, or drag a file onto the window.  
**Save** keeps changes in the current session only - it does not overwrite the file on disk.  
**Export** / **Replace import** writes to disk. Back up server resources before you replace live files.

| Shortcut | Action |
|----------|--------|
| `Ctrl+1` ... `Ctrl+5` | Tuning, Type, Audio, Names, Merge |
| `Ctrl+S` | Export (current tool) |
| `Ctrl+W` | Unload / clear (current tool) |

Closing the window with unsaved session edits will ask for confirmation.

### Tuning
Open a `doortuning.ymt` (or XML export). Edit named tunings and model mappings.

You can export a single `.ymt`, or a FiveM resource folder containing `doortuning.ymt`, `gta5.meta`, and `fxmanifest.lua`. There is also a "vanilla" start option if you want a stock baseline instead of importing first.

### Type
Open a door `.ytyp` - binary RSC7 or CodeWalker/OpenIV XML. Change `specialAttribute` (normal, garage, sliding, etc.).

If you have the matching `.ydr` / `.ytd` for the selected archetype, drop them on the preview panel for a simple 3D view. Names should match the archetype (wrong model names are rejected).

### Audio
Work with DAT151 REL `.xml` door audio, or load a presets `.json` catalog. Assign presets to doors and export REL XML again.

### Names
Build a CodeWalker-style `.nametable` from door names (including names pulled from the Audio tool when useful).

### Merge
Load a main `.ymt`, then one or more "incoming" YMTs. The tool union-merges missing tunings/mappings and lists conflicts so you can see what will not auto-merge.

## Build from source:
```bash
bun install
bun run tauri dev
bun run tauri build
bun run test
```

`npm` works too if you prefer. Installer output ends up under `src-tauri/target/release/bundle/nsis/`.

Dev stack: Tauri 2, React, TypeScript, Rust.

```
src/tools/       tool UIs
src/domain/      XML / merge / audio logic
src/lib/         dialogs, toasts, OS helpers
src-tauri/src/   native FS + YTYP / YDR / YTD parsers
```

## Regarding formats: (FYI)
Door tuning lives in `.ymt` (often XML when exported). Door archetypes use `.ytyp` (`specialAttribute` picks the door behaviour). Drawables / textures for preview are `.ydr` / `.ytd`. Audio uses DAT151 REL XML. Nametables are plain name lists CodeWalker can load.

This app edits those files after you already have them on disk. It is not a world viewer and not an RPF browser.

## Credits:

Binary YTYP / YDR / YTD handling in this project is our own Rust code. Layouts and hashes were checked against [CodeWalker](https://github.com/dexyfex/CodeWalker) by dexyfex as a format reference. We do not ship CodeWalker source and are not affiliated with CodeWalker or Rockstar Games.


## Contributing:
Issues and PRs welcome. Keep changes focused.
## License:
[GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

Copyright (c) 2026 DevSync Studio.

Provided as-is. Back up files before overwrite. Expect bugs - report them if you can.

