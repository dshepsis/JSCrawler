/* Test on https://developers.google.com/search/reference/robots_txt */

let table = document.querySelector("#gc-wrapper > div.devsite-main-content.clearfix > article > article > div.devsite-article-body.clearfix > div:nth-child(69) > table > tbody");

function matchesPattern(str, basePattern) {
  var parsedPattern = basePattern;
  /* If a pattern ends in "$", the string must with the pattern to pass:
   *
   * E.G. "/*.php" will match "/files/documents/letter.php" but
   * won't match "/files/my.php.data/settings.txt". */
  const REQUIRE_END_WITH_PATTERN = (parsedPattern.charAt(parsedPattern.length-1) === "$");
  if (REQUIRE_END_WITH_PATTERN){
    /* Remove the $ character from the pattern: */
    parsedPattern = parsedPattern.substr(0, parsedPattern.length-1);
  }
  /* Removing trailing asterisks, which are extraneous: */
  for (let i = parsedPattern.length-1; /*@noConditional*/; --i) {
    /* If the entire pattern is asterisks, then anything will match: */
    if (i <= 0) return true;

    if (parsedPattern.charAt(i) !== "*") {
      parsedPattern = parsedPattern.substr(0, i+1);
      break;
    }
  }

  let patternSections = parsedPattern.split("*");
  let patternIndex = 0;
  for (let strIndex = 0, len = str.length; strIndex < len; /*@noIncrement*/) {
    let subPat = patternSections[patternIndex];
    /*Skip empty patterns: */
    if (subPat === "") {
      ++patternIndex;
      continue;
    }
    if (subPat === str.substr(strIndex, subPat.length)) {
      ++patternIndex;
      strIndex += subPat.length;

      /* If we've reached the end of the pattern: */
      if (patternIndex === patternSections.length) {
        if (REQUIRE_END_WITH_PATTERN) {
          return (strIndex === len);
        }
        /* Otherwise, the pattern is definitely a match: */
        return true;
      }
    }
    /* If this sub-pattern didn't match at this point, move 1 character over: */
    else {
      ++strIndex;
    }
  }
  /* If we reached the end of the string without finishing the pattern, it's not
   * a match: */
  return false;
}

let tests = [];
let rows = table.children;
for (let r = 3, len = rows.length; r < len; ++r) {
  let row = rows[r];
  let test = {
    pattern: row.children[0].innerText,
    matches: row.children[1].innerText.split(/[\r\n]+/g),
    fails: row.children[2].innerText.split(/[\r\n]+/g)
  }
  tests.push(test);
}
let i = 0;
for (let test of tests) {
  console.log("Pattern: " + test.pattern);
  for (let match of test.matches) {
    if (!matchesPattern(match, test.pattern)) console.error(i + " Failed to match " + match + " against " + test.pattern);
    else console.log("Passed!");
  }
  for (let fail of test.fails) {
    if (matchesPattern(fail, test.pattern)) console.error(i + " Failed to fail " + fail + " against " + test.pattern);
    else console.log("Passed!");
  }
  ++i;
}
