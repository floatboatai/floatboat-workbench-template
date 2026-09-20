// ABOUTME: 不安装依赖、不启动应用即可读取模板内的主题指引，供外部 Agent 按需加载。
import { readFile } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

export const repository = fileURLToPath(new URL("../", import.meta.url));
export const skillRelativePath = ".agents/skills/floatboat-workbench";

export async function guideCatalog(root = repository) {
  const directory = resolve(root, skillRelativePath);
  const catalog = JSON.parse(
    await readFile(resolve(directory, "topics.json"), "utf8"),
  );
  if (!catalog || typeof catalog !== "object" || Array.isArray(catalog))
    throw new Error("GUIDE_CATALOG_INVALID");
  for (const [topic, file] of Object.entries(catalog)) {
    if (
      !/^[a-z][a-z-]*$/u.test(topic) ||
      typeof file !== "string" ||
      !file.endsWith(".md")
    )
      throw new Error("GUIDE_CATALOG_INVALID");
    const path = relative(directory, resolve(directory, file));
    if (isAbsolute(file) || isAbsolute(path) || path.split(sep).includes(".."))
      throw new Error("GUIDE_CATALOG_PATH_INVALID");
  }
  if (!Object.hasOwn(catalog, "overview"))
    throw new Error("GUIDE_OVERVIEW_REQUIRED");
  return { directory, topics: catalog };
}

export async function readGuide(topic = "overview", root = repository) {
  const { directory, topics } = await guideCatalog(root);
  if (!Object.hasOwn(topics, topic))
    throw new Error(
      `UNKNOWN_GUIDE_TOPIC:${topic}\nAvailable: ${Object.keys(topics).join(", ")}`,
    );
  return readFile(resolve(directory, topics[topic]), "utf8");
}

export async function guideCommand(args, root = repository) {
  const { values } = parseArgs({
    args: args.filter((arg) => arg !== "--"),
    options: {
      topic: { type: "string" },
      list: { type: "boolean" },
      help: { type: "boolean" },
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help)
    return "pnpm workbench:guide -- --list | --topic overview\nRead-only; no Floatboat, build or installed packages required.\n";
  if (values.list && values.topic) throw new Error("CHOOSE_LIST_OR_TOPIC");
  if (values.list) {
    const { topics } = await guideCatalog(root);
    return (
      Object.entries(topics)
        .map(([topic, file]) => `${topic}\t${skillRelativePath}/${file}`)
        .join("\n") + "\n"
    );
  }
  return readGuide(values.topic ?? "overview", root);
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  guideCommand(process.argv.slice(2))
    .then((text) => process.stdout.write(text))
    .catch((error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
}
