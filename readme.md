# Gnome Backgrounds over Time

## How to update:
1. clone or pull `https://gitlab.gnome.org/GNOME/gnome-backgrounds.git` into `backgrounds-git`.
2. `deno run --allow-all collect_versions.ts`.

Do not modify `index.html` directly as it gets overwritten by `collect_versions.ts`.