import { compare, format, parse, SemVer } from "@std/semver";
import { ensureDirSync, walkSync } from "@std/fs";

type Tag = {
  tag: string;
  sortable: SemVer;
};

function getTags(): Tag[] {
  const command = new Deno.Command("git", {
    args: [
      "tag",
    ],
    cwd: "./backgrounds-git",
  });
  const { code, stdout } = command.outputSync();
  console.assert(code === 0);
  return new TextDecoder().decode(stdout).split("\n").filter((t) => !!t).map(
    (tag) => {
      const to_parse = tag
        .replaceAll("GNOME_BACKRGROUNDS_", "")
        .replaceAll("GNOME_BACKGROUNDS_", "")
        .replaceAll("_", ".")
        .split(".");
      if (/[a-z]/.test(to_parse.at(-1)!)) {
        const last = "0-" + to_parse.pop()!;
        while (to_parse.length < 2) {
          to_parse.push("0");
        }
        to_parse.push(last);
      } else {
        while (to_parse.length < 3) {
          to_parse.push("0");
        }
      }
      if (to_parse.length > 3) {
        to_parse[2] = to_parse[2] + to_parse.pop();
      }
      return { tag, sortable: parse(to_parse.join(".")) };
    },
  );
}

type Index = Map<string, string[]>;
const index: Index = new Map();
const revisions: Tag[] = [];
// tags.map((t) =>
//   t.tag
//     .replaceAll("GNOME_BACKRGROUNDS_", "")
//     .replaceAll("GNOME_BACKGROUNDS_", "")
//     .replaceAll("_", ".")
// ).toSpliced(0, 1);

function copyBackgrounds(rev: Tag) {
  console.log(`Collecting ${rev.tag} (${format(rev.sortable)})`);
  const command = new Deno.Command("git", {
    args: [
      "checkout",
      `tags/${rev.tag}`,
    ],
    cwd: "./backgrounds-git",
  });
  const { code } = command.outputSync();
  console.assert(code === 0);
  const files = walkSync("./backgrounds-git", {
    exts: [".jpg", ".png", ".webp"],
    skip: [/badscaling/, /defaults/],
  });
  const destination = `./backgrounds-sorted/${format(rev.sortable)}`;
  ensureDirSync(destination);
  let hasFiles = false;
  for (const file of files) {
    hasFiles = true;
    const shortname = file.name.replace(/\.[^\.]*$/, "");
    const indexed = index.get(shortname);
    if (indexed !== undefined) {
      indexed.push(`${format(rev.sortable)}/${file.name}`);
    } else {
      index.set(shortname, [`${format(rev.sortable)}/${file.name}`]);
    }
    Deno.copyFileSync(file.path, `${destination}/${file.name}`);
  }
  if (hasFiles) {
    revisions.push(rev);
  }
}

const tags = getTags().sort((a, b) => compare(a.sortable, b.sortable));
for (const tag of tags) {
  copyBackgrounds(tag);
}

// const indexArray = JSON.stringify(
//   {
//     revisions: tags.map((t) =>
//       t.tag
//         .replaceAll("GNOME_BACKRGROUNDS_", "")
//         .replaceAll("GNOME_BACKGROUNDS_", "")
//         .replaceAll("_", ".")
//     ).toSpliced(0, 1),
//     files: Array.from(index.entries()).sort(([a], [b]) => a.localeCompare(b)),
//   },
// );
// Deno.writeTextFileSync("index.json", indexArray);

const indexArray = Array.from(index.entries()).sort(([a], [b]) =>
  a.localeCompare(b)
);

const rows: string[] = [];
for (const bg of indexArray) {
  const tiles: string[] = [];
  let bgIndex = 0;
  for (let index = 0; index < revisions.length; index++) {
    if (
      bg[1].length > bgIndex &&
      bg[1][bgIndex].startsWith(format(revisions[index].sortable))
    ) {
      tiles.push(
        `<img loading="lazy" src="/backgrounds-sorted/${bg[1][bgIndex]}">`,
      );
      bgIndex++;
    } else {
      tiles.push(`<div></div>`);
    }
  }
  rows.push(`<h2>${bg[0]}</h2>${tiles.join("")}`);
}

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gnome Backgrounds</title>
  <style>
    main {
      grid-template-columns: repeat(${revisions.length + 1}, auto);
      display: grid;
      grid-auto-rows: 200px;
      gap: 4px;

      &>img,
      &>div {
        box-shadow: 2px 2px 8px 0px rgba(145,145,145,1);
      }
    }

    img {
      max-height: 100%;
      min-width: 120px;
      max-width: 100%;
      display: block;
      border-radius: 4px;
      object-fit: contain;
    }
  </style>
</head>
<body>
  <h1>All Gnome Backgrounds found on GitLab</h1>
  <main>
  <span></span><h2>${
  revisions.map((r) =>
    r.tag.replaceAll("GNOME_BACKRGROUNDS_", "")
      .replaceAll("GNOME_BACKGROUNDS_", "")
      .replaceAll("_", ".")
  ).join("</h2><h2>")
}</h2>
  ${rows.join("")}
  </main>
</body>
</html>
`;

Deno.writeTextFileSync("index.html", html);
