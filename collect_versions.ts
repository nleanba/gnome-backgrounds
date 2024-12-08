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

type semverString = string;
type Index = Map<string, Set<semverString>>;
const index: Index = new Map();

function copyBackgrounds(rev: Tag) {
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
    skip: [/badscaling\.jpg/, /defaults\.webp/],
  });
  const destination = `./backgrounds-sorted/${format(rev.sortable)}`;
  ensureDirSync(destination);
  for (const file of files) {
    const indexed = index.get(file.name);
    if (indexed !== undefined) {
      indexed.add(format(rev.sortable));
    } else {
      index.set(file.name, new Set([format(rev.sortable)]));
    }
    Deno.copyFileSync(file.path, `${destination}/${file.name}`);
  }
}

const tags = getTags().sort((a, b) => compare(a.sortable, b.sortable));
for (const tag of tags) {
  copyBackgrounds(tag);
}

console.log(index);
