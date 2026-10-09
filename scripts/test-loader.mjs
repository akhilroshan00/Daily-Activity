import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import ts from "typescript";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (error.code !== "ERR_MODULE_NOT_FOUND" || !specifier.startsWith(".")) {
      throw error;
    }
    for (const extension of [".ts", ".tsx"]) {
      try {
        return await nextResolve(`${specifier}${extension}`, context);
      } catch (candidateError) {
        if (candidateError.code !== "ERR_MODULE_NOT_FOUND")
          throw candidateError;
      }
    }
    throw error;
  }
}

export async function load(url, context, nextLoad) {
  const pathname = new URL(url).pathname;
  if (!pathname.endsWith(".ts") && !pathname.endsWith(".tsx")) {
    return nextLoad(url, context);
  }
  const source = await readFile(fileURLToPath(url), "utf8");
  const result = ts.transpileModule(source, {
    fileName: fileURLToPath(url),
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
      inlineSourceMap: true,
      inlineSources: true,
    },
  });
  return { format: "module", source: result.outputText, shortCircuit: true };
}
