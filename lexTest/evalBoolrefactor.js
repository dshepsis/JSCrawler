function makeRecordFilter(tokens) {
  return function evalRecord(record, subExprStart, subExprEnd) {
    /* Used for recursion without using record.slice(): */
    if (subExprStart === undefined) subExprStart = 0;
    if (subExprEnd === undefined) subExprEnd = tokens.length;

    let runningOr = false; //Analogous to running sum
    let runningAnd = true; //Analogous to running product
    let nextOperandNegated = false;
    for (let i = subExprStart; i < subExprEnd; ++i) {
      const token = tokens[i];
      switch (token.type) {
        case 'label':
          runningAnd = runningAnd && (
            nextOperandNegated !== record.isLabelled(token.match[1])
          );
          nextOperandNegated = false;
          break;
        case 'lParen':
          runningAnd = runningAnd && (
            nextOperandNegated !== evalRecord(record, i + 1, token.closedAt)
          );
          i = token.closedAt;
          nextOperandNegated = false;
          break;
        case 'not':
          nextOperandNegated = true;
          break;
        case 'or':
          runningOr = runningOr || runningAnd;
          runningAnd = true;
          break;
        case 'and': case 'termSpace':
          /* 'and' is assumed by default, so nothing needs to be done: */
          break;
        default:
          throw new Error(`Unsupported token type: '${token.type}'.`);
      }
    }
    return runningOr || runningAnd;
  };
}

/**
 * Test
 */
const nullishDefault = (...vals)=>{
  for (const val of vals) if (val !== null && val !== undefined) return val;
  return null;
};
const linearLex = (grammar)=> {
  const anyType = nullishDefault(
    grammar.DEFAULT_NEXT,
    /* By default, properties in the grammar object are ignored if their value
     * isn't an object containing a regex property: */
    Object.keys(grammar).filter(typeName=>{
      const type = grammar[typeName];
      return (typeof type === 'object' && type.regex !== undefined);
    })
  );
  const startingTypes = nullishDefault(grammar.START, anyType);
  const endingTypes = nullishDefault(grammar.END, anyType);
  return (str)=>{
    const tokens = [];
    const openOperatorStack = [];
    let allowedTypes = startingTypes;
    let lastToken = null;

    /* Run the loop at least once, even if the string is empty (''), to allow
     * for potential matches, e.g. /(\s*)/: */
    let once = true;
    outer: for (let i = 0, len = str.length; once || i < len; once = false) {
      const remainingStr = str.substring(i);
      for (const typeName of allowedTypes) {
        const type = grammar[typeName];
        const match = remainingStr.match(type.regex);
        if (match === null) continue;

        const start = i + match.index;
        const end = start + match[0].length;
        i = end;
        lastToken = {match, type: typeName, start, end};

        /* Handle opening parenthetical operators: */
        /* Note that closing operators are handled first, to make the rare case
         * of something closing and opening the same tag be more useful: */
        let closeTag = type.close;
        if (closeTag !== undefined) {
          if (typeof closeTag === 'function') closeTag = closeTag(match);
          const lastOpener = openOperatorStack.pop();
          const emptyStack = (lastOpener === undefined);
          if (emptyStack || closeTag !== lastOpener.tag) {
            const lastOpenerInfo = emptyStack ?
              '' : ` Last opening operator had tag name "${lastOpener.tag}".`;
            throw new Error(
              `Lexing Error: Unmatched closing parenthetical operator `+
              `"${match[0]}" with tag name "${closeTag}" at character `+
              `${start} of parameter string.${lastOpenerInfo}`
            );
          }
          Object.assign(lastOpener.token, {
            closedAt: tokens.length,
            closingToken: lastToken,
          });
          Object.assign(lastToken, {
            isParenthetical: true,
            isCloser: true,
            closes: lastOpener.tag,
            openedAt: lastOpener.index,
            openingToken: lastOpener.token
          });
        }
        let openTag = type.open;
        if (openTag !== undefined) {
          if (typeof openTag === 'function') openTag = openTag(match);
          openOperatorStack.push({
            tag: openTag,
            token: lastToken,
            index: tokens.length
          });
          Object.assign(lastToken, {
            isParenthetical: true,
            isOpener: true,
            opens: openTag,
          });
        }
        tokens.push(lastToken);
        allowedTypes = type.next;
        if (allowedTypes === undefined || allowedTypes === "*") {
          allowedTypes = anyType;
        }
        continue outer;
      }
      /* If no match was found: */
      let errorLocation;
      if (tokens.length === 0) {
        errorLocation = `at the start of '${remainingStr}'`;
      } else {
        errorLocation = (
          `in '${remainingStr}' following a token of type '${lastToken.type}'`
        );
      }
      throw new Error(
        `Lexing Error: Could not find a match ${errorLocation} among the `+
        `following token types: [${allowedTypes}].`
      );
    }
    if (openOperatorStack.length !== 0) {
      const lastOpener = openOperatorStack[openOperatorStack.length - 1];
      throw new Error(
        `Lexing Error: Unmatched opening parenthetical operator `+
        `"${lastOpener.token.match[0]}" with tag name "${lastOpener.tag}" `+
        `at character ${lastOpener.token.start} of the parameter string.`
      );
    }
    if (endingTypes.indexOf(lastToken.type) === -1) throw new Error(
      `Lexing Error: String terminated with token "${lastToken.match[0]}" of `+
      `type "${lastToken.type}", but only the following types are allowed: `+
      `[${endingTypes}].`
    );
    return tokens;
  };
};

const operand = ['not', 'label', 'lParen'];
const operator = ['and', 'or', 'rParen', 'termSpace'];
const grammar = {
  START: operand,
  END: ['label', 'rParen', 'termSpace'],
  label: {
    regex: /^\s*\b([\w-]+)\b/,
    next: operator
  },
  not: {
    regex: /^\s*(\bnot\b|!)/,
    next: ['label', 'lParen']
  },
  and: {
    regex: /^\s*(\band\b|&&?|\+)/,
    next: operand
  },
  or: {
    regex: /^\s*(\bor\b|\|\|?|,)/,
    next: operand
  },
  lParen: {
    regex: /^\s*(\()/,
    open: 'paren',
    next: operand
  },
  rParen: {
    regex: /^\s*(\))/,
    close: 'paren',
    next: operator
  },
  termSpace: {
    regex: /^\s*$/
  }
};

const testRecord = {
  labels: new Set('ABD'.split('')),
  isLabelled(label) {
    return this.labels.has(label);
  }
};
const lexer = linearLex(grammar);
const expr = '(A|B)&!(C|!D)';
const filter = makeRecordFilter(lexer(expr));
const result = filter(testRecord);

console.log(result);
console.assert(result);
