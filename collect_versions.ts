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

function getTagDiff(rev_a: Tag, rev_b: Tag): string[] {
  const command = new Deno.Command("git", {
    args: [
      "diff",
      "--name-only",
      `tags/${rev_a.tag}`,
      `tags/${rev_b.tag}`,
    ],
    cwd: "./backgrounds-git",
  });
  const { code, stdout } = command.outputSync();
  console.assert(code === 0);
  return new TextDecoder().decode(stdout).split("\n").filter((t) => !!t);
}

function copyBackgrounds(prev_rev: Tag, rev: Tag) {
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
  const changed = getTagDiff(prev_rev, rev);
  // console.log(prev_rev, rev, changed);
  const files = walkSync("./backgrounds-git", {
    exts: [".jpg", ".png", ".webp", ".jxl", ".svg"],
    skip: [/badscaling/, /defaults/],
  });
  const destination = `./backgrounds-sorted/${format(rev.sortable)}`;
  ensureDirSync(destination);
  let hasFiles = false;
  const dittoShortnamesLater: string[] = [];
  for (const file of files) {
    let shortname = file.name
      .replace(/\.[^\.]*$/, "")
      .toLocaleLowerCase()
      // .replace("gnome-", "")
      // .replace("symbolics", "symbolic")
      // .replace("-day", "-l")
      // .replace("-night", "-d")
      // .replace("-1", "-l")
      // .replace("-2", "-d");
    if (shortname === "brushstrokes") {
      shortname = "brush-strokes-l";
    } else if (shortname === "blobs") {
      shortname = "blobs-d";
    } else if (["brushstrokes", "disco", "vnc", "wood"].includes(shortname)) {
      shortname += "-l";
    }
    const indexed = index.get(shortname);
    if (changed.includes(file.path.replace("backgrounds-git/", ""))) {
      hasFiles = true;
      // console.log(`Adding`, file.name);
      if (indexed !== undefined) {
        indexed.push(`${format(rev.sortable)}/${file.name}`);
      } else {
        index.set(shortname, [`${format(rev.sortable)}/${file.name}`]);
      }
      Deno.copyFileSync(file.path, `${destination}/${file.name}`);
    } else if (hasFiles) {
      // console.log(`Skipping`, file.name);
      if (indexed !== undefined) {
        indexed.push(`${format(rev.sortable)}°ditto`);
      } else {
        index.set(shortname, [`${format(rev.sortable)}°ditto`]);
      }
    } else {
      dittoShortnamesLater.push(shortname);
    }
  }
  // if (hasFiles) {
  for (const shortname of dittoShortnamesLater) {
    const indexed = index.get(shortname);
    if (indexed !== undefined) {
      indexed.push(`${format(rev.sortable)}°ditto`);
    } else {
      index.set(shortname, [`${format(rev.sortable)}°ditto`]);
    }
  }
  revisions.push(rev);
  // }
}

const tags = getTags().sort((a, b) => compare(a.sortable, b.sortable));
for (let index = 1; index < tags.length; index++) {
  copyBackgrounds(tags[index - 1], tags[index]);
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

const indexArray = Array.from(index.entries())
  .sort(([a], [b]) => a.localeCompare(b));
Deno.writeTextFileSync("index.json", JSON.stringify(indexArray));

const rows: string[] = [];
for (const bg of indexArray) {
  let first: number | undefined;
  let width = 0;
  let tiles: {
    path: string | undefined;
    ditto: number;
  }[] = [];
  let bgIndex = 0;
  for (let index = 0; index < revisions.length; index++) {
    if (
      bg[1].length > bgIndex &&
      bg[1][bgIndex].startsWith(format(revisions[index].sortable))
    ) {
      if (bg[1][bgIndex].endsWith("°ditto")) {
        if (tiles.length) tiles.at(-1)!.ditto++;
        else {
          console.log("Uh OH!", bg[0], bg[1][bgIndex]);
          tiles.push({ path: "broken.jpg", ditto: 1 });
        }
      } else {
        tiles.push(
          { path: `backgrounds-sorted/${bg[1][bgIndex]}`, ditto: 1 },
          // `<img loading="lazy" src="/backgrounds-sorted/${bg[1][bgIndex]}">`,
        );
      }
      if (first === undefined) {
        first = index;
      }
      bgIndex++;
      width++;
    } else if (first !== undefined) {
      tiles.push(
        { path: undefined, ditto: 1 },
        // `<div></div>`
      );
      width++;
    }
  }
  const lastIndex = tiles.findLastIndex((t) => t.path !== undefined);
  width -= tiles.length - lastIndex + 1;
  tiles = tiles.slice(0, lastIndex + 1);
  rows.push(
    //`<div class="row" style="grid-column: ${first};">
    `<div class="row" style="grid-column: ${first! + 1} / span ${width + 2};" title="${bg[0]}">
     ${
      // `<h2>${bg[0]}</h2>`
      tiles.map((t) => {
        if (t.path === undefined) {
          return `<div style="grid-column: span ${t.ditto};"></div>`;
        }
        // return `<img class="bg" style="grid-column: span ${t.ditto};"  loading="lazy" src="${t.path}">`;
        return `<div class="bg" style="grid-column: span ${t.ditto};"><img loading="lazy" src="${t.path}"></div>`;
      }).join("")}</div>`,
  );
}

const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gnome Backgrounds</title>
  <style>
    @font-face {
      font-family: "Besley Condensed";
      src: url("BesleyCondensed-Book.ttf");
      font-weight: 400;
      font-display: swap;
  }
    body {
      font-family: "Besley Condensed", serif;
      font-weight: 400;
    }
    div {
      background: #aaaaaa;
      border-radius: 8px;
    }
    main {
      grid-template-columns: repeat(${revisions.length}, auto);
      display: grid;
      gap: 8px;
      grid-auto-flow: row dense;
    }
    .row {
      display: grid;
      grid-template-columns: subgrid;
      background: #dddddd;
      padding: 2px;
      margin: -2px;
      position: relative;

      &::after {
        content: attr(title);
        position: absolute;
        right: 4px;
        bottom: 4px;
        line-height: 1em;
        background: #dddddd77;
        border-radius: 2px;
      }
    }
    .bg {
      margin: 38px 0;
      height: 4px;
      position: relative;
    }
    h2 {
      font-size: 1rem;
      margin: 0;
      grid-column-end: span 2;
      align-self: center;
      text-align: end;
      font-weight: 400;
      word-break: break-all;
      max-height: 80px;
      line-height: 1rem;
    }
    h3 {
      font-size: 0.8rem;
      margin: 0 auto;
      font-weight: 400;
      position: sticky;
      top: 0;
      z-index: 10;
      background: rgba(255, 255, 255, 0.5);
      border-radius: 2px;
      width: 100%;
      text-align: center;
    }
    img {
      box-shadow: 2px 2px 8px 0px #333333;
      height: 80px;
      /* width: 100%; */
      display: block;
      border-radius: 8px;
      /* object-fit: contain; */
      align-self: center;
      margin: -38px 0;
      background: black;
      position: sticky;
      left: 4px;
      right: 4px;
    }
  </style>
</head>
<body>
  <h1>All Gnome Backgrounds found on GitLab</h1>
  <p>
    This is all backgrounds found in <a href="https://gitlab.gnome.org/GNOME/gnome-backgrounds/">the gnome-backgrounds git repository</a>.
    Each column corresponds to a git tag.
  </p>
  <p>
    Font used is Besley* from <a href="https://indestructibletype.com/Besley.html">indestructibletype.com</a>.
  </p>
  <main>
  <!--<span style="grid-column-end: span 2;"></span>-->
  <h3>${
  revisions.map((r) =>
    r.tag.replaceAll("GNOME_BACKRGROUNDS_", "")
      .replaceAll("GNOME_BACKGROUNDS_", "")
      .replaceAll("_", ".")
  ).join("</h3><h3>")
}</h3>
  ${rows.join("")}
  ${"" /* "<div></div>".repeat(2499) */}
  </main>
</body>
</html>
`;

Deno.writeTextFileSync("index.html", html);
