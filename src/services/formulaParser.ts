/**
 * Safe expression parser and evaluator for OBD-II formulas.
 * Supports byte variables A, B, C, D, ... (0-indexed byte values 0-255),
 * operators +, -, *, /, %, parentheses, and two's complement signed(...) helper.
 */

// Token types
type TokenType = 'NUMBER' | 'VAR' | 'OP' | 'LPAREN' | 'RPAREN' | 'FUNC';

interface Token {
  type: TokenType;
  value: string | number;
}

export function tokenize(expr: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const s = expr.replace(/\s+/g, '');

  while (i < s.length) {
    const char = s[i];

    // Numbers (integers or decimals)
    if (/[0-9]/.test(char) || (char === '.' && i + 1 < s.length && /[0-9]/.test(s[i + 1]))) {
      let numStr = '';
      while (i < s.length && /[0-9.]/.test(s[i])) {
        numStr += s[i];
        i++;
      }
      tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
      continue;
    }

    // Function call: "signed("
    if (s.startsWith('signed(', i)) {
      tokens.push({ type: 'FUNC', value: 'signed' });
      tokens.push({ type: 'LPAREN', value: '(' });
      i += 7;
      continue;
    }

    // Variables: A, B, C, D, etc. (single uppercase or lowercase letter)
    if (/[a-zA-Z]/.test(char)) {
      tokens.push({ type: 'VAR', value: char.toUpperCase() });
      i++;
      continue;
    }

    // Parentheses
    if (char === '(') {
      tokens.push({ type: 'LPAREN', value: '(' });
      i++;
      continue;
    }
    if (char === ')') {
      tokens.push({ type: 'RPAREN', value: ')' });
      i++;
      continue;
    }

    // Operators
    if (['+', '-', '*', '/', '%'].includes(char)) {
      tokens.push({ type: 'OP', value: char });
      i++;
      continue;
    }

    // Unknown character
    throw new Error(`Unexpected character '${char}' in formula at position ${i}`);
  }

  return tokens;
}

// Convert Infix tokens to Reverse Polish Notation (Shunting-Yard algorithm)
function toRPN(tokens: Token[]): Token[] {
  const output: Token[] = [];
  const opStack: Token[] = [];

  const precedence: Record<string, number> = {
    '+': 1,
    '-': 1,
    '*': 2,
    '/': 2,
    '%': 2,
  };

  for (let idx = 0; idx < tokens.length; idx++) {
    const token = tokens[idx];

    if (token.type === 'NUMBER' || token.type === 'VAR') {
      output.push(token);
    } else if (token.type === 'FUNC') {
      opStack.push(token);
    } else if (token.type === 'OP') {
      // Check for unary minus: e.g. "-40" or "(-1)"
      if (
        token.value === '-' &&
        (idx === 0 || tokens[idx - 1].type === 'LPAREN' || tokens[idx - 1].type === 'OP')
      ) {
        // Push a zero before the minus so it becomes "0 - X"
        output.push({ type: 'NUMBER', value: 0 });
      }

      while (
        opStack.length > 0 &&
        opStack[opStack.length - 1].type === 'OP' &&
        precedence[opStack[opStack.length - 1].value as string] >= precedence[token.value as string]
      ) {
        output.push(opStack.pop()!);
      }
      opStack.push(token);
    } else if (token.type === 'LPAREN') {
      opStack.push(token);
    } else if (token.type === 'RPAREN') {
      while (opStack.length > 0 && opStack[opStack.length - 1].type !== 'LPAREN') {
        output.push(opStack.pop()!);
      }
      if (opStack.length === 0) {
        throw new Error('Mismatched parentheses in formula');
      }
      opStack.pop(); // Remove LPAREN

      if (opStack.length > 0 && opStack[opStack.length - 1].type === 'FUNC') {
        output.push(opStack.pop()!);
      }
    }
  }

  while (opStack.length > 0) {
    const top = opStack.pop()!;
    if (top.type === 'LPAREN' || top.type === 'RPAREN') {
      throw new Error('Mismatched parentheses in formula');
    }
    output.push(top);
  }

  return output;
}

/**
 * Evaluates an RPN token list given an array of byte values [A, B, C, ...].
 */
function evaluateRPN(rpn: Token[], bytes: number[]): number {
  const stack: number[] = [];

  for (const token of rpn) {
    if (token.type === 'NUMBER') {
      stack.push(token.value as number);
    } else if (token.type === 'VAR') {
      const varName = token.value as string;
      const charCode = varName.charCodeAt(0) - 65; // A -> 0, B -> 1, C -> 2...
      const byteVal = bytes[charCode] !== undefined ? bytes[charCode] : 0;
      stack.push(byteVal);
    } else if (token.type === 'FUNC' && token.value === 'signed') {
      if (stack.length < 1) throw new Error('signed() requires an argument');
      const val = stack.pop()!;
      // If 16-bit
      if (val > 32767 && val <= 65535) {
        stack.push(val - 65536);
      } else if (val > 127 && val <= 255) {
        // If 8-bit
        stack.push(val - 256);
      } else {
        stack.push(val);
      }
    } else if (token.type === 'OP') {
      if (stack.length < 2) throw new Error('Invalid expression structure');
      const b = stack.pop()!;
      const a = stack.pop()!;
      switch (token.value) {
        case '+': stack.push(a + b); break;
        case '-': stack.push(a - b); break;
        case '*': stack.push(a * b); break;
        case '/': stack.push(b === 0 ? 0 : a / b); break;
        case '%': stack.push(b === 0 ? 0 : a % b); break;
        default: throw new Error(`Unknown operator ${token.value}`);
      }
    }
  }

  if (stack.length !== 1) {
    throw new Error('Formula produced an incomplete result');
  }

  return stack[0];
}

/**
 * Public evaluation function.
 */
export function evaluateFormula(formula: string, bytes: number[]): number {
  if (!formula || formula.trim() === '') return 0;
  const tokens = tokenize(formula);
  const rpn = toRPN(tokens);
  return evaluateRPN(rpn, bytes);
}

/**
 * Tests formula syntax and returns sample result or error string.
 */
export function testFormulaSyntax(
  formula: string,
  sampleBytes: number[] = [0x1A, 0xF8, 0x05, 0x3E]
): { success: boolean; result?: number; error?: string } {
  try {
    const val = evaluateFormula(formula, sampleBytes);
    if (isNaN(val) || !isFinite(val)) {
      return { success: false, error: 'Formula resulted in NaN or Infinity' };
    }
    return { success: true, result: Math.round(val * 100) / 100 };
  } catch (err: any) {
    return { success: false, error: err.message || 'Invalid formula' };
  }
}
