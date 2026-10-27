/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("node:fs");
const path = require("node:path");
const selectorParser = require("postcss-selector-parser");

/** Give the NEXUS theme a stable, non-hashed class alongside each local class. */
function nexusModuleMarkers({ serviceId = "klol", sourceRoot } = {}) {
  let moduleFiles;

  return {
    postcssPlugin: "nexus-module-markers",
    Once(root, { result, Rule, Declaration }) {
      if (serviceId !== "nexus") return;
      if (!sourceRoot) throw root.error("NEXUS module markers require sourceRoot.");

      const directory = path.resolve(sourceRoot);
      const filename = result.opts.from || root.source?.input.file;
      if (!filename) return;
      const relative = path.relative(directory, path.resolve(filename));
      if (relative.startsWith(`..${path.sep}`) || relative === ".." || path.isAbsolute(relative)) return;
      if (!relative.endsWith(".module.css")) return;

      // All current module basenames are unique. Fail before introducing an
      // ambiguous marker if a future module reuses one, including across folders.
      if (!moduleFiles) {
        moduleFiles = new Map();
        for (const entry of fs.readdirSync(directory, { recursive: true })) {
          if (!entry.endsWith(".module.css")) continue;
          const name = path.basename(entry, ".module.css");
          if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(name)) {
            throw root.error(`Unsupported NEXUS CSS module basename: ${name}`);
          }
          if (moduleFiles.has(name)) {
            throw root.error(`Duplicate NEXUS CSS module basename "${name}": ${moduleFiles.get(name)} and ${entry}`);
          }
          moduleFiles.set(name, entry);
        }
      }

      const basename = path.basename(relative, ".module.css");
      if (moduleFiles.get(basename) !== relative) {
        throw root.error(`NEXUS CSS module inventory changed; restart the build: ${relative}`);
      }

      const classes = new Set();
      root.walkRules((rule) => {
        for (let ancestor = rule.parent; ancestor; ancestor = ancestor.parent) {
          if (ancestor.type === "atrule" && /(?:^|-)keyframes$/i.test(ancestor.name)) return;
        }
        selectorParser((selectors) => {
          selectors.walkPseudos((pseudo) => {
            if ([":global", ":local"].includes(pseudo.value) && !pseudo.nodes.length) {
              throw rule.error("NEXUS CSS modules require functional :global(...) and :local(...) scopes.");
            }
          });
          selectors.walkClasses((localClass) => {
            for (let ancestor = localClass.parent; ancestor; ancestor = ancestor.parent) {
              if (ancestor.type === "pseudo" && ancestor.value === ":global") return;
              if (ancestor.type === "pseudo" && ancestor.value === ":local") break;
            }
            classes.add(localClass.value);
          });
        }).processSync(rule.selector);
      });

      const compositions = [];
      for (const localClass of classes) {
        // The value setter escapes CSS identifiers without copying the whitespace
        // that a class can inherit from its original comma-separated selector.
        const localSelector = selectorParser.className({ value: "" });
        localSelector.value = localClass;
        const markerSelector = selectorParser.className({ value: "" });
        markerSelector.value = `nexus-${basename}--${localClass}`;
        const selector = localSelector.toString();
        const value = `${markerSelector.toString().slice(1)} from global`;
        const present = root.nodes.some((node) => node.type === "rule" && node.selector === selector &&
          node.nodes.some((declaration) => declaration.type === "decl" && declaration.prop === "composes" && declaration.value === value));
        if (present) continue;
        const rule = new Rule({ selector });
        rule.append(new Declaration({ prop: "composes", value }));
        compositions.push(rule);
      }
      if (compositions.length) root.prepend(compositions);
    },
  };
}

nexusModuleMarkers.postcss = true;
module.exports = nexusModuleMarkers;
