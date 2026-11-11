const fn = new Function('input', 'function solution(x) { return x * 3; }; return solution(input);');
console.log('Result:', fn(4));
