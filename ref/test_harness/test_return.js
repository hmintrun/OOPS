try {
  new Function('return 1;')(); // inside a function: OK
  console.log('Inside function: OK');
} catch (e) {
  console.error(e);
}

try {
  // eval at top level of script:
  eval('if (false) { return; }');
} catch (e) {
  console.log('eval with return:', e.message);
}
