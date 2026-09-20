// ABOUTME: 验证干净副本中的离线指南、主题路由和跨 Agent 入口；不启动模型或触碰业务数据。
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  access,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import {
  guideCatalog,
  guideCommand,
  readGuide,
  repository,
  skillRelativePath,
} from "../tooling/guide.mjs";
import { checkSkill, synchronizeSkill } from "../tooling/workbench-skill.mjs";

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), "workbench-skill-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await cp(join(repository, skillRelativePath), join(root, skillRelativePath), {
    recursive: true,
  });
  await mkdir(join(root, "tooling"));
  await cp(
    join(repository, "tooling/guide.mjs"),
    join(root, "tooling/guide.mjs"),
  );
  await writeFile(
    join(root, "AGENTS.md"),
    `Read ${skillRelativePath}/SKILL.md.\n`,
  );
  return root;
}

test("未安装依赖的副本可以从其他 cwd 读取主题，不生成配置或构建产物", async (t) => {
  const root = await fixture(t);
  const result = spawnSync(
    process.execPath,
    [join(root, "tooling/guide.mjs"), "--topic", "runtime"],
    { cwd: tmpdir(), encoding: "utf8", timeout: 10000 },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.equal(
    result.stdout,
    await readFile(
      join(root, skillRelativePath, "references/runtime.md"),
      "utf8",
    ),
  );
  for (const directory of ["node_modules", ".generated", ".local", "artifacts"])
    await assert.rejects(access(join(root, directory)), { code: "ENOENT" });
});

test("所有列出的主题可读取且导航链接有效，guide 命令与 Skill 使用同一正文", async (t) => {
  const root = await fixture(t);
  await synchronizeSkill(root);
  const { topics } = await guideCatalog(root);
  assert.equal(await checkSkill(root), Object.keys(topics).length);
  const listing = await guideCommand(["--list"], root);
  for (const topic of Object.keys(topics)) {
    assert.ok(
      listing.split("\n").some((line) => line.startsWith(`${topic}\t`)),
    );
    assert.equal(
      await guideCommand(["--", "--topic", topic], root),
      await readGuide(topic, root),
    );
  }
});

test("未知主题、路径和矛盾参数明确失败，不读取任意文件", async (t) => {
  const root = await fixture(t);
  for (const topic of ["not-a-topic", "__proto__", "../AGENTS.md"])
    await assert.rejects(readGuide(topic, root), /UNKNOWN_GUIDE_TOPIC/);
  await assert.rejects(
    guideCommand(["--topic", "runtime", "--list"], root),
    /CHOOSE_LIST_OR_TOPIC/,
  );
  const result = spawnSync(
    process.execPath,
    [join(root, "tooling/guide.mjs"), "--topic", "missing"],
    { encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /UNKNOWN_GUIDE_TOPIC/);
  await writeFile(
    join(root, skillRelativePath, "topics.json"),
    JSON.stringify({ overview: "../../../../AGENTS.md" }),
  );
  await assert.rejects(guideCatalog(root), /GUIDE_CATALOG_PATH_INVALID/);
});

test("Claude 入口同步幂等且保留其他 Skill，源发现信息更新后可检测并修复漂移", async (t) => {
  const root = await fixture(t);
  const unrelated = join(root, ".claude/skills/user-skill");
  await mkdir(unrelated, { recursive: true });
  await writeFile(join(unrelated, "SKILL.md"), "user content");
  await synchronizeSkill(root);
  const target = join(root, ".claude/skills/floatboat-workbench/SKILL.md");
  const original = await readFile(target, "utf8");
  await synchronizeSkill(root);
  assert.equal(await readFile(target, "utf8"), original);
  const source = join(root, skillRelativePath, "SKILL.md");
  await writeFile(
    source,
    (await readFile(source, "utf8")).replace(
      "description: ",
      "description: Updated scope. ",
    ),
  );
  await assert.rejects(checkSkill(root), /SKILL_ENTRY_STALE/);
  await synchronizeSkill(root);
  await checkSkill(root);
  assert.equal(
    await readFile(join(unrelated, "SKILL.md"), "utf8"),
    "user content",
  );
});

test("已有手写 Claude Skill 不会被生成器覆盖", async (t) => {
  const root = await fixture(t);
  const directory = join(root, ".claude/skills/floatboat-workbench");
  await mkdir(directory, { recursive: true });
  const file = join(directory, "SKILL.md");
  await writeFile(file, "existing user skill");
  await assert.rejects(synchronizeSkill(root), /SKILL_ENTRY_NOT_GENERATED/);
  assert.equal(await readFile(file, "utf8"), "existing user skill");
});

test("主题中的断链不会被校验命令报告成功", async (t) => {
  const root = await fixture(t);
  await synchronizeSkill(root);
  const path = join(root, skillRelativePath, "references/runtime.md");
  await writeFile(
    path,
    `${await readFile(path, "utf8")}\n[missing](absent.md)\n`,
  );
  await assert.rejects(checkSkill(root), /SKILL_LINK_MISSING/);
});
