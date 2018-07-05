const idGet = id => document.getElementById(id);
const input = idGet('in');
const readIn = ()=>input.value;
const dataView = idGet('data');
const output = idGet('out');
const writeOut = text=>{output.innerText += text;};

const removeByValue = (arr, val)=>{
  const valIndex = arr.indexOf(val);
  if(valIndex !== -1) arr.splice(valIndex, 1);
  return arr;
};
const nullishDefault = (...vals)=>{
  for (const val of vals) if (val !== null && val !== undefined) return val;
  return null;
};
const linearLex = (grammar)=> {
  const anyType = removeByValue(Object.keys(grammar), 'start');
  const startingTypes = nullishDefault(grammar.start, anyType);
  const endingTypes = nullishDefault(grammar.end, anyType);
  return (str)=>{
    const tokens = [];
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
        tokens.push(lastToken);
        allowedTypes = type.next;
        if (allowedTypes === undefined || allowedTypes === "*") {
          allowedTypes = anyType;
        }
        continue outer;
      }
      /* If no match was found: */
      let locationInfo;
      if (tokens.length === 0) {
        locationInfo = `at the start of '${remainingStr}'`;
      } else {
        locationInfo = (
          `in '${remainingStr}' following token of type `+
          `'${lastToken.type}'`
        );
      }
      throw new Error(
        `Lexing Error: Could not find a match ${locationInfo} among the `+
        `following token types: [${allowedTypes}].`
      );
    }
    if (endingTypes.indexOf(lastToken.type) === -1) throw new Error(
      `Lexing Error: String terminated with token of type '${lastToken.type}', `+
      `but only the following are allowed: [${endingTypes}].`
    );
    return tokens;
  };
};

const operand = ['not', 'label', 'lParen'];
const operator = ['and', 'or', 'rParen', 'termSpace'];
const grammar = {
  start: operand,
  end: ['label', 'rParen', 'termSpace'],
  label: {
    regex: /^\s*([\w-]+)/,
    next: operator
  },
  not: {
    regex: /^\s*(not|!)/,
    next: ['label', 'lParen']
  },
  and: {
    regex: /^\s*(and|&&?)/,
    next: operand
  },
  or: {
    regex: /^\s*(or|\|\|?|,)/,
    next: operand
  },
  lParen: {
    regex: /^\s*(\()/,
    next: operand
  },
  rParen: {
    regex: /^\s*(\))/,
    next: operator
  },
  termSpace: {
    regex: /^\s*$/
  }
};

const range = (s, e, step = 1)=>{
  if (step <= 0) throw new Error('Step must be a positive number');
  if (s > e) [s, e] = [e, s];
  const length = Math.floor((e - s) / step) + 1;
  const rangeArr = Array.from({length});
  for (let i = 0, v = s; v <= e; ++i, v += step) rangeArr[i] = v;
  return rangeArr;
};
const shuffle = arr => {
  for (let i = 0, len = arr.length; i < len; ++i) {
    const randIndex = Math.floor(Math.random()*(len - i) + i);
    const temp = arr[i];
    arr[i] = arr[randIndex];
    arr[randIndex] = temp;
  }
  return arr;
};
const randSample = (arr, num)=>{
  return shuffle(arr).slice(0, num).sort((a, b)=>a - b);
};

/* Test: */
const NUM_RECORDS = 200000;
const NUM_SETS = 10;
const records = range(0, NUM_RECORDS);

function intToLabel(num) {
  const labelChars = [];
  for (num = Math.floor(num); num >= 0; num = Math.floor(num/26)-1) {
    labelChars.push(String.fromCharCode(num%26+65));
  }
  return labelChars.reverse().join('');
}
const data = {};
for (let i = 0; i < NUM_SETS; ++i) data[intToLabel(i)] = randSample(records, NUM_RECORDS/2);

const dataStr = JSON.stringify(data, (k, v)=>{
  if (!Array.isArray(v)) return v;
  const r = v.slice(0, 20);
  r.push('...');
  return r;
}, 2).replace(/\[[^\]]+\]/g, str=>str.replace(/\n\s+/g, '\t'));
dataView.innerText = dataStr;

const intersection = (a, b)=>{
  if (!(a instanceof Set)) a = new Set(a);
  const inter = [];
  for (const entry of b) if (a.has(entry)) inter.push(entry);
  return inter;
};
const union = (a, b)=>{
  const union = new Set(a);
  for (const entry of b) union.add(entry);
  return union;
};

const negation = s =>{
  if (!(s instanceof Set)) s = new Set(s);
  const neg = [];
  for (const entry of records) if (!s.has(entry)) neg.push(entry);
  return neg;
};

function equalsAny(val, possibleMatches) {
  for (const match of possibleMatches) {
    if (val === match) return true;
  }
  return false;
}

/* Non-testable concept for how to transform evaluateSetExpression to work on
 * individual elements rather than sets, since I think that approach may be
 * better since it allows for just filtering a list of all records, avoiding the
 * many intermediate data structures recquired by the set-based approach: */
const evaluateBoolExpression = (record, tokens)=>{
  const numTokens = tokens.length;

  /* Helper function for allowing labels, parentheses, and not-operators to be
   * treated the same way: */
  const evaluateOperandAtIndex = index => {
    const token = tokens[index];
    const type = token.type;
    switch (type) {
      case 'label': {
        return {value: record.isLabelled(token.match[1]), end: index};
      }
      case 'not': {
        if (index + 1 >= numTokens) throw new Error(
          `Unexpected negation operator at end of expression`
        );
        const {value, end} = evaluateOperandAtIndex(index + 1);
        return {value: !value, end};
      }
      case 'lParen': {
        let unclosedParens = 1;
        let closingIndex = index;
        while (unclosedParens > 0) {
          ++closingIndex;
          if (closingIndex >= numTokens) throw new Error(
            `Unmatched left parenthesis at index ${index}`
          );
          const tokenType = tokens[closingIndex].type;
          if (tokenType === 'lParen') ++unclosedParens;
          else if (tokenType === 'rParen') {
            --unclosedParens;
            if (unclosedParens === 0) break;
          }
        }
        return {
          value: evaluateBoolExpression(record, tokens.slice(index + 1, closingIndex)),
          end: closingIndex
        };
      }
      default:
        throw new Error(`Expecting operand, instead found token of type ${type}`);
    }
  };

  let runningOr = false; //Analogous to running sum
  const {value: firstOperandValue, end: endFirst} = evaluateOperandAtIndex(0);
  let runningAnd = firstOperandValue; //Analogous to running product
  let prevOperator = null;
  for (let i = endFirst + 1; i < numTokens; ++i) {
    const token = tokens[i];
    switch (prevOperator) {
      case null:
        prevOperator = token.type;
        if (!equalsAny(prevOperator, ['and', 'or', 'termSpace'])) {
          throw new Error(
            `Expected operator, found token of type '${prevOperator}' instead.`
          );
        }
        break;
      case 'and': {
        const {value, end} = evaluateOperandAtIndex(i);
        i = end;
        runningAnd = runningAnd && value;
        prevOperator = null;
        break;
      }
      case 'or': {
        runningOr = runningOr || runningAnd;
        ({value: runningAnd, end: i} = evaluateOperandAtIndex(i));
        prevOperator = null;
        break;
      }
      case 'termSpace':
        prevOperator = null;
        break;
      default:
        throw new Error(`Unsupported token type: '${token.type}'.`);
    }
  }
  return runningOr || runningAnd;
};

const evaluateSetExpression = (tokens)=>{
  const numTokens = tokens.length;

  /* Helper function for allowing labels, parentheses, and not-operators to be
   * treated the same way: */
  const evaluateOperandAtIndex = index => {
    const token = tokens[index];
    const type = token.type;
    switch (token.type) {
      case 'label': {
        const value = data[token.match[1]];
        if (value === undefined) throw new Error(
          `"${token.match[1]}" is not a valid data-set label!`
        );
        return {value, end: index};
      }
      case 'not': {
        if (index + 1 >= numTokens) throw new Error(
          `Unexpected negation operator at end of expression`
        );
        const {value, end} = evaluateOperandAtIndex(index + 1);
        return {value: negation(value), end};
      }
      case 'lParen': {
        let unclosedParens = 1;
        let closingIndex = index;
        while (unclosedParens > 0) {
          ++closingIndex;
          if (closingIndex >= numTokens) throw new Error(
            `Unmatched left parenthesis at index ${index}`
          );
          const closeToken = tokens[closingIndex];
          if (closeToken.type === 'lParen') ++unclosedParens;
          else if (closeToken.type === 'rParen') {
            --unclosedParens;
            if (unclosedParens === 0) break;
          }
        }
        return {
          value: evaluateSetExpression(tokens.slice(index + 1, closingIndex)),
          end: closingIndex
        };
      }
      default:
        throw new Error(`Expecting operand, instead found token of type ${type}`);
    }
  };

  let runningUnion = [];
  const {value: firstOperandValue, end: endFirst} = evaluateOperandAtIndex(0);
  let runningIntersection = firstOperandValue;
  let prevOperator = null;
  for (let i = endFirst + 1; i < numTokens; ++i) {
    const token = tokens[i];
    switch (prevOperator) {
      case null:
        prevOperator = token.type;
        if (!equalsAny(prevOperator, ['and', 'or', 'termSpace'])) {
          throw new Error(
            `Expected operator, found token of type '${prevOperator}' instead.`
          );
        }
        break;
      case 'and': {
        const {value, end} = evaluateOperandAtIndex(i);
        i = end;
        runningIntersection = intersection(runningIntersection, value);
        prevOperator = null;
        break;
      }
      case 'or': {
        runningUnion = union(runningUnion, runningIntersection);
        ({value: runningIntersection, end: i} = evaluateOperandAtIndex(i));
        prevOperator = null;
        break;
      }
      case 'termSpace':
        prevOperator = null;
        break;
      default:
        throw new Error(`Unsupported token type: '${token.type}'.`);
    }
  }
  if (prevOperator !== null) throw new Error('tokens ended unexpectedly with operator: ' + prevOperator);
  return union(runningUnion, runningIntersection);
};


const myLexer = linearLex(grammar);
input.addEventListener('keypress', (e)=>{
  if (e.key !== 'Enter') return;
  try {
    const query = readIn();
    const tokens = myLexer(query);
    writeOut(`\n${query}\t->\t${String(Array.from(evaluateSetExpression(tokens)).sort((a, b)=>a - b)).substr(0, 200)}`);
  } catch (e) {
    console.error(e);
  }
});
idGet('clear').addEventListener('click', ()=>{output.innerHTML = '';});
