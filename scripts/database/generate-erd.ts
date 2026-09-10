import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

import * as schemaExports from "../../src/platform/db/schema/index";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const schemaDirectory = resolve(projectRoot, "src/platform/db/schema");
const outputPath = resolve(projectRoot, "docs/database/ERD.md");
const checkMode = process.argv.slice(2).includes("--check");

if (process.argv.slice(2).some((argument) => argument !== "--check")) {
  throw new Error("Usage: npm run db:erd [-- --check]");
}

type ColumnModel = {
  name: string;
  sqlType: string;
  notNull: boolean;
  primaryKey: boolean;
  foreignKey: boolean;
  unique: boolean;
};

type TableModel = {
  table: PgTable;
  id: string;
  schemaName: string;
  tableName: string;
  qualifiedName: string;
  columns: ColumnModel[];
  uniqueColumnSets: string[][];
};

type RelationModel = {
  parentId: string;
  childId: string;
  label: string;
  parentCardinality: "||" | "o|";
  childCardinality: "o{" | "o|";
  childSchemaName: string;
};

function qualifiedNameOf(table: PgTable) {
  const config = getTableConfig(table);
  return `${config.schema ?? "public"}.${config.name}`;
}

function mermaidIdentifier(value: string) {
  const normalized = value.replace(/[^A-Za-z0-9_]/g, "_");
  return /^[A-Za-z_]/.test(normalized) ? normalized : `_${normalized}`;
}

function mermaidType(sqlType: string) {
  const normalized = sqlType
    .replace(/\[\]/g, "_array")
    .replace(/[^A-Za-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .toLowerCase();
  return /^[A-Za-z_]/.test(normalized) ? normalized : `type_${normalized}`;
}

function sameColumnSet(left: string[], right: string[]) {
  if (left.length !== right.length) return false;
  const sortedLeft = [...left].sort();
  const sortedRight = [...right].sort();
  return sortedLeft.every((column, index) => column === sortedRight[index]);
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function indexColumnNames(columns: unknown[]) {
  const names: string[] = [];
  for (const column of columns) {
    if (typeof column !== "object" || column === null || !("name" in column)) return null;
    const name = (column as { name?: unknown }).name;
    if (typeof name !== "string") return null;
    names.push(name);
  }
  return names;
}

function collectTables() {
  const tablesByQualifiedName = new Map<string, PgTable>();

  for (const value of Object.values(schemaExports)) {
    if (!is(value, PgTable)) continue;
    const table = value as PgTable;
    const qualifiedName = qualifiedNameOf(table);
    const existing = tablesByQualifiedName.get(qualifiedName);
    if (existing && existing !== table) {
      throw new Error(`Multiple Drizzle tables use the name ${qualifiedName}.`);
    }
    tablesByQualifiedName.set(qualifiedName, table);
  }

  return [...tablesByQualifiedName.entries()]
    .sort(([left], [right]) => compareText(left, right))
    .map(([qualifiedName, table]): TableModel => {
      const config = getTableConfig(table);
      const primaryColumnNames = new Set(
        config.columns.filter((column) => column.primary).map((column) => column.name),
      );
      for (const primaryKey of config.primaryKeys) {
        for (const column of primaryKey.columns) primaryColumnNames.add(column.name);
      }

      const foreignColumnNames = new Set(
        config.foreignKeys.flatMap((foreignKey) =>
          foreignKey.reference().columns.map((column) => column.name),
        ),
      );
      const uniqueColumnSets = [
        ...config.columns.filter((column) => column.primary).map((column) => [column.name]),
        ...config.primaryKeys.map((primaryKey) => primaryKey.columns.map((column) => column.name)),
        ...config.columns.filter((column) => column.isUnique).map((column) => [column.name]),
        ...config.uniqueConstraints.map((constraint) =>
          constraint.columns.map((column) => column.name),
        ),
        ...config.indexes.flatMap((index) => {
          if (!index.config.unique || index.config.where) return [];
          const names = indexColumnNames(index.config.columns);
          return names ? [names] : [];
        }),
      ].filter((columns) => columns.length > 0);
      const singleUniqueColumnNames = new Set(
        uniqueColumnSets.filter((columns) => columns.length === 1).map(([column]) => column),
      );

      return {
        table,
        id: mermaidIdentifier(qualifiedName.replace(".", "__")),
        schemaName: config.schema ?? "public",
        tableName: config.name,
        qualifiedName,
        uniqueColumnSets,
        columns: config.columns.map((column) => ({
          name: column.name,
          sqlType: column.getSQLType(),
          notNull: column.notNull,
          primaryKey: primaryColumnNames.has(column.name),
          foreignKey: foreignColumnNames.has(column.name),
          unique: singleUniqueColumnNames.has(column.name),
        })),
      };
    });
}

function collectRelations(tables: TableModel[]) {
  const tableByQualifiedName = new Map(tables.map((table) => [table.qualifiedName, table]));
  const relations: RelationModel[] = [];

  for (const child of tables) {
    const config = getTableConfig(child.table);
    for (const foreignKey of config.foreignKeys) {
      const reference = foreignKey.reference();
      const parentQualifiedName = qualifiedNameOf(reference.foreignTable);
      const parent = tableByQualifiedName.get(parentQualifiedName);
      if (!parent) {
        throw new Error(
          `${child.qualifiedName} references ${parentQualifiedName}, which is not exported by the schema index.`,
        );
      }

      const childColumnNames = reference.columns.map((column) => column.name);
      const parentColumnNames = reference.foreignColumns.map((column) => column.name);
      const optionalReference = reference.columns.some((column) => !column.notNull);
      const uniqueReference = child.uniqueColumnSets.some((columns) =>
        sameColumnSet(columns, childColumnNames),
      );

      relations.push({
        parentId: parent.id,
        childId: child.id,
        label: childColumnNames
          .map((column, index) => `${column} to ${parentColumnNames[index]}`)
          .join(", "),
        parentCardinality: optionalReference ? "o|" : "||",
        childCardinality: uniqueReference ? "o|" : "o{",
        childSchemaName: child.schemaName,
      });
    }
  }

  return relations.sort((left, right) =>
    compareText(
      [left.childSchemaName, left.parentId, left.childId, left.label].join("\0"),
      [right.childSchemaName, right.parentId, right.childId, right.label].join("\0"),
    ),
  );
}

async function schemaFingerprint() {
  const schemaFiles = (await readdir(schemaDirectory, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".ts"))
    .map((entry) => resolve(schemaDirectory, entry.name))
    .sort((left, right) => compareText(left, right));
  const hash = createHash("sha256");

  for (const file of schemaFiles) {
    const repositoryPath = relative(projectRoot, file).replaceAll("\\", "/");
    const source = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
    hash.update(repositoryPath);
    hash.update("\0");
    hash.update(source);
    hash.update("\0");
  }

  return hash.digest("hex");
}

function renderEntity(table: TableModel) {
  const lines = [`    ${table.id} {`];
  for (const column of table.columns) {
    const keys = [
      column.primaryKey ? "PK" : null,
      column.foreignKey ? "FK" : null,
      column.unique && !column.primaryKey ? "UK" : null,
    ].filter(Boolean);
    const keySuffix = keys.length > 0 ? ` ${keys.join(", ")}` : "";
    const nullability = column.notNull ? "NOT NULL" : "nullable";
    lines.push(
      `        ${mermaidType(column.sqlType)} ${mermaidIdentifier(column.name)}${keySuffix} "${nullability}"`,
    );
  }
  lines.push("    }");
  return lines.join("\n");
}

function renderDocument(tables: TableModel[], relations: RelationModel[], fingerprint: string) {
  const schemaNames = [...new Set(tables.map((table) => table.schemaName))].sort(compareText);
  const lines = [
    "<!-- GENERATED FILE. DO NOT EDIT DIRECTLY. -->",
    "",
    "# Drizzle ERD",
    "",
    "이 문서는 `src/platform/db/schema/*.ts`의 Drizzle 메타데이터만 읽어 생성합니다.",
    "운영 DB, 환경 변수, 외부 서비스에는 연결하지 않습니다.",
    "",
    `- Source: \`src/platform/db/schema/index.ts\``,
    `- Schema SHA-256: \`${fingerprint}\``,
    `- Tables: ${tables.length}`,
    `- Foreign keys: ${relations.length}`,
    "- Regenerate: `npm run db:erd`",
    "- Drift check: `npm run db:erd:check`",
    "",
    "엔터티 이름의 `__` 앞부분은 PostgreSQL schema입니다. 예: `auth__user_accounts`는",
    "`auth.user_accounts`를 뜻합니다. 다른 schema의 부모 테이블은 해당 섹션에 관계용 엔터티로",
    "표시될 수 있으며, 전체 컬럼은 그 테이블의 schema 섹션에서 확인합니다.",
    "",
  ];

  for (const schemaName of schemaNames) {
    const schemaTables = tables.filter((table) => table.schemaName === schemaName);
    const schemaRelations = relations.filter((relation) => relation.childSchemaName === schemaName);
    lines.push(`## ${schemaName}`, "", "```mermaid", "erDiagram");
    for (const table of schemaTables) lines.push(renderEntity(table));
    for (const relation of schemaRelations) {
      lines.push(
        `    ${relation.parentId} ${relation.parentCardinality}--${relation.childCardinality} ${relation.childId} : "${relation.label}"`,
      );
    }
    lines.push("```", "");
  }

  return `${lines.join("\n").trimEnd()}\n`;
}

const tables = collectTables();
if (tables.length === 0) throw new Error("No Drizzle PostgreSQL tables were exported by the schema index.");

const duplicateIds = tables
  .map((table) => table.id)
  .filter((id, index, ids) => ids.indexOf(id) !== index);
if (duplicateIds.length > 0) {
  throw new Error(`Mermaid entity identifier collision: ${[...new Set(duplicateIds)].join(", ")}`);
}

const relations = collectRelations(tables);
const fingerprint = await schemaFingerprint();
const generated = renderDocument(tables, relations, fingerprint);
const existing = await readFile(outputPath, "utf8").catch(() => null);

if (checkMode) {
  if (existing !== generated) {
    console.error("[db:erd] drift detected. Run `npm run db:erd` and commit docs/database/ERD.md.");
    process.exitCode = 1;
  } else {
    console.log(
      `[db:erd] up to date: ${tables.length} tables, ${relations.length} foreign keys, schema sha256 ${fingerprint}`,
    );
  }
} else if (existing === generated) {
  console.log(
    `[db:erd] unchanged: ${tables.length} tables, ${relations.length} foreign keys, schema sha256 ${fingerprint}`,
  );
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, generated, "utf8");
  console.log(
    `[db:erd] wrote docs/database/ERD.md: ${tables.length} tables, ${relations.length} foreign keys, schema sha256 ${fingerprint}`,
  );
}
