// ABOUTME: 借助类型检查器识别工作台服务端实际使用的 Host SDK 方法与能力特性，供构建生成 requires.operations。
// ABOUTME: 以 SDK 契约中 HostClient 的声明为准，别名、解构与变量转存都能识别；无法确定时偏向多记。

import type tsModule from 'typescript';

type TypeScript = typeof tsModule;

const CONTRACTS = /(?:^|\/)sdk\/host-contracts(?:\.d)?\.mts$/u;
const TEXT_OPERATIONS = new Set(['llm.generateText', 'llm.streamText', 'llm.generateObject']);
/** 旧客户端严格校验会拒收的文本调用字段。 */
const FEATURE_FIELDS: Readonly<Record<string, string>> = {
  images: 'llm.images',
  messages: 'llm.messages',
  tools: 'llm.tools',
  toolChoice: 'llm.tools',
  reasoning: 'llm.reasoning',
};

/** 方法声明位于 HostClient 内时返回点分路径，如 agent.conversations.create。 */
function operationPath(ts: TypeScript, declaration: tsModule.Declaration): string | undefined {
  if (!ts.isMethodSignature(declaration)) return undefined;
  if (!CONTRACTS.test(declaration.getSourceFile().fileName.replaceAll('\\', '/'))) return undefined;
  const names: string[] = [];
  let node: tsModule.Node = declaration;
  while (node) {
    if (ts.isMethodSignature(node) || ts.isPropertySignature(node)) {
      if (!ts.isIdentifier(node.name)) return undefined;
      names.unshift(node.name.text);
    } else if (ts.isInterfaceDeclaration(node)) {
      return node.name.text === 'HostClient' && names.length >= 2 ? names.join('.') : undefined;
    } else if (!ts.isTypeLiteralNode(node)) return undefined;
    node = node.parent;
  }
  return undefined;
}

export function collectWorkbenchHostOperations(
  ts: TypeScript,
  program: tsModule.Program,
  files: readonly tsModule.SourceFile[],
): string[] {
  const checker = program.getTypeChecker();
  const found = new Set<string>();

  const fromSymbol = (symbol: tsModule.Symbol | undefined): string | undefined => {
    let operation: string | undefined;
    for (const declaration of symbol?.declarations ?? []) {
      const path = operationPath(ts, declaration);
      if (path) {
        found.add(path);
        operation ??= path;
      }
    }
    return operation;
  };

  const bindingProperty = (element: tsModule.BindingElement): tsModule.Symbol | undefined => {
    if (!ts.isObjectBindingPattern(element.parent)) return undefined;
    const name = element.propertyName ?? element.name;
    if (!ts.isIdentifier(name) && !ts.isStringLiteral(name)) return undefined;
    return checker.getTypeAtLocation(element.parent).getProperty(name.text);
  };

  /** 解析调用目标；只跟随一层局部变量，覆盖 `const run = host.llm.generateText` 与解构写法。 */
  const resolveCallee = (expression: tsModule.Expression): string | undefined => {
    if (ts.isPropertyAccessExpression(expression)) return fromSymbol(checker.getSymbolAtLocation(expression.name));
    if (ts.isElementAccessExpression(expression) && ts.isStringLiteralLike(expression.argumentExpression))
      return fromSymbol(checker.getSymbolAtLocation(expression.argumentExpression));
    if (!ts.isIdentifier(expression)) return undefined;
    for (const declaration of checker.getSymbolAtLocation(expression)?.declarations ?? []) {
      if (ts.isBindingElement(declaration)) return fromSymbol(bindingProperty(declaration));
      if (ts.isVariableDeclaration(declaration) && declaration.initializer) {
        const initializer = declaration.initializer;
        if (ts.isPropertyAccessExpression(initializer) || ts.isElementAccessExpression(initializer))
          return resolveCallee(initializer);
      }
    }
    return undefined;
  };

  /** 非字面量参数按类型判断：字段类型不只是 undefined/never 即视为可能使用。 */
  const typeUses = (type: tsModule.Type, field: string, location: tsModule.Node): boolean =>
    (type.isUnion() ? type.types : [type]).some((member) => {
      const property = member.getProperty(field);
      if (!property) return false;
      const propertyType = checker.getTypeOfSymbolAtLocation(property, location);
      const parts = propertyType.isUnion() ? propertyType.types : [propertyType];
      return parts.some((part) => !(part.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Never)));
    });

  const recordFeatures = (argument: tsModule.Expression | undefined) => {
    if (!argument) return;
    if (ts.isObjectLiteralExpression(argument)) {
      for (const property of argument.properties) {
        if (ts.isSpreadAssignment(property)) {
          const type = checker.getTypeAtLocation(property.expression);
          for (const [field, feature] of Object.entries(FEATURE_FIELDS))
            if (typeUses(type, field, property)) found.add(feature);
          continue;
        }
        const name = property.name;
        if (name && (ts.isIdentifier(name) || ts.isStringLiteral(name)) && Object.hasOwn(FEATURE_FIELDS, name.text))
          found.add(FEATURE_FIELDS[name.text]!);
      }
      return;
    }
    const type = checker.getTypeAtLocation(argument);
    for (const [field, feature] of Object.entries(FEATURE_FIELDS))
      if (typeUses(type, field, argument)) found.add(feature);
  };

  const visit = (node: tsModule.Node): void => {
    if (ts.isPropertyAccessExpression(node)) fromSymbol(checker.getSymbolAtLocation(node.name));
    else if (ts.isElementAccessExpression(node) && ts.isStringLiteralLike(node.argumentExpression))
      fromSymbol(checker.getSymbolAtLocation(node.argumentExpression));
    else if (ts.isBindingElement(node)) fromSymbol(bindingProperty(node));
    if (ts.isCallExpression(node)) {
      const operation = resolveCallee(node.expression);
      if (operation && TEXT_OPERATIONS.has(operation)) recordFeatures(node.arguments[0]);
    }
    ts.forEachChild(node, visit);
  };
  for (const file of files) visit(file);
  return [...found].sort();
}
