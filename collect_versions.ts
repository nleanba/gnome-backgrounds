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
    const shortname = file.name.replace(/\.[^\.]*$/, "");
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
  if (hasFiles) {
    for (const shortname of dittoShortnamesLater) {
      const indexed = index.get(shortname);
      if (indexed !== undefined) {
        indexed.push(`${format(rev.sortable)}°ditto`);
      } else {
        index.set(shortname, [`${format(rev.sortable)}°ditto`]);
      }
    }
    revisions.push(rev);
  }
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

const indexArray = Array.from(index.entries()).sort(([a], [b]) =>
  a.localeCompare(b)
);

const rows: string[] = [];
for (const bg of indexArray) {
  const tiles: {
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
          { path: `/backgrounds-sorted/${bg[1][bgIndex]}`, ditto: 1 },
          // `<img loading="lazy" src="/backgrounds-sorted/${bg[1][bgIndex]}">`,
        );
      }
      bgIndex++;
    } else {
      tiles.push(
        { path: undefined, ditto: 1 },
        // `<div></div>`
      );
    }
  }
  rows.push(`<h2>${bg[0]}</h2>${
    tiles.map((t) => {
      if (t.path === undefined) {
        return `<div style="grid-column: span ${t.ditto};"></div>`;
      }
      // return `<img class="bg" style="grid-column: span ${t.ditto};"  loading="lazy" src="${t.path}">`;
      return `<div class="bg" style="grid-column: span ${t.ditto};"><img loading="lazy" src="${t.path}"></div>`;
    }).join("")
  }`);
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
    main {
      grid-template-columns: max-content repeat(${revisions.length}, auto);
      display: grid;
      gap: 8px;

      &>div {
        background: #dddddd;
        border-radius: 8px;
      }
    }

    .bg {
      margin: 28px 0;
      position: relative;
    }

    h2 {
      margin: 0;
      align-self: center;
      font-weight: 400;
    }

    h3 {
      font-size: 0.8rem;
      max-width: 20px;
      margin: 0 auto;
      font-weight: 400;
    }

    img {
      box-shadow: 2px 2px 8px 0px #333333;
      height: 60px;
      /* width: 100%; */
      display: block;
      border-radius: 8px;
      /* object-fit: contain; */
      align-self: center;
      margin: -28px 0;
      background: black;
      position: sticky;
      left: 4px;
      right: 4px;
    }
  </style>
</head>
<body>
  <h1>All Gnome Backgrounds found on GitLab</h1>
  <main>
  <span></span><h3>${
  revisions.map((r) =>
    r.tag.replaceAll("GNOME_BACKRGROUNDS_", "")
      .replaceAll("GNOME_BACKGROUNDS_", "")
      .replaceAll("_", ".")
  ).join("</h3><h3>")
}</h3>
  ${rows.join("")}
  </main>
</body>
</html>
`;

Deno.writeTextFileSync("index.html", html);
