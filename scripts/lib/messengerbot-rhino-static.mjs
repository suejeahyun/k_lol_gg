export function rhinoHasSideEffects(node) {
  if (!node) return false;
  if (
    node.type === "AssignmentExpression" ||
    node.type === "CallExpression" ||
    node.type === "NewExpression" ||
    node.type === "UpdateExpression" ||
    node.type === "FunctionExpression"
  ) return true;
  if (node.type === "UnaryExpression") return node.operator === "delete";
  if (node.type === "SequenceExpression") {
    return rhinoHasSideEffects(node.expressions[node.expressions.length - 1]);
  }
  if (node.type === "LogicalExpression") {
    return rhinoHasSideEffects(node.left) || rhinoHasSideEffects(node.right);
  }
  if (node.type === "ConditionalExpression") {
    return rhinoHasSideEffects(node.consequent) && rhinoHasSideEffects(node.alternate);
  }
  return false;
}

export function analyzeRhinoStatic(program) {
  const statementCandidates = [];
  const unsafeSequenceOperands = [];
  const voidExpressions = [];
  const bareAssignmentConditions = [];
  const inconsistentReturnFunctions = [];
  const conditionRoots = new Set();

  const isFunctionNode = (node) =>
    node?.type === "FunctionDeclaration" ||
    node?.type === "FunctionExpression" ||
    node?.type === "ArrowFunctionExpression";

  const inspectFunctionReturns = (functionNode) => {
    let hasBareReturn = false;
    let hasValueReturn = false;

    const visitFunctionBody = (node) => {
      if (!node || typeof node !== "object") return;
      if (node !== functionNode && isFunctionNode(node)) return;
      if (node.type === "ReturnStatement") {
        if (node.argument) hasValueReturn = true;
        else hasBareReturn = true;
        return;
      }
      for (const [key, value] of Object.entries(node)) {
        if (key === "start" || key === "end" || key === "loc" || key === "range") continue;
        if (Array.isArray(value)) for (const item of value) visitFunctionBody(item);
        else visitFunctionBody(value);
      }
    };

    visitFunctionBody(functionNode.body);
    if (hasBareReturn && hasValueReturn) {
      inconsistentReturnFunctions.push({
        offset: functionNode.start,
        name: functionNode.id?.name ?? "<anonymous>",
      });
    }
  };

  const collectConditions = (node) => {
    if (!node || typeof node !== "object") return;
    if (node.type === "IfStatement" || node.type === "WhileStatement" || node.type === "DoWhileStatement") {
      conditionRoots.add(node.test);
    }
    for (const [key, value] of Object.entries(node)) {
      if (key === "start" || key === "end" || key === "loc" || key === "range") continue;
      if (Array.isArray(value)) for (const item of value) collectConditions(item);
      else collectConditions(value);
    }
  };
  collectConditions(program);

  const visit = (node) => {
    if (!node || typeof node !== "object") return;
    if (isFunctionNode(node)) inspectFunctionReturns(node);
    if (node.type === "ExpressionStatement" && !node.directive && !rhinoHasSideEffects(node.expression)) {
      statementCandidates.push({ offset: node.start, type: node.expression.type });
    }
    if (node.type === "UnaryExpression" && node.operator === "void") voidExpressions.push(node.start);
    if (node.type === "SequenceExpression") {
      for (let index = 0; index < node.expressions.length - 1; index += 1) {
        if (!rhinoHasSideEffects(node.expressions[index])) unsafeSequenceOperands.push(node.expressions[index].start);
      }
    }
    if (node.type === "AssignmentExpression" && conditionRoots.has(node)) bareAssignmentConditions.push(node.start);
    for (const [key, value] of Object.entries(node)) {
      if (key === "start" || key === "end" || key === "loc" || key === "range") continue;
      if (Array.isArray(value)) for (const item of value) visit(item);
      else visit(value);
    }
  };
  visit(program);
  return {
    statementCandidates,
    unsafeSequenceOperands,
    voidExpressions,
    bareAssignmentConditions,
    inconsistentReturnFunctions,
  };
}
