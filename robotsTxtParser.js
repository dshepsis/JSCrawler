function AJAXTextLoader(responseCallBack, dataURL) {
  var httpRequest = new XMLHttpRequest();
  httpRequest.onreadystatechange = function() {
    if (httpRequest.readyState === XMLHttpRequest.DONE) {
      if (httpRequest.status === 200) { //Code for "Good"
        responseCallBack(httpRequest.responseText);
      } else {
        console.error("AJAX attempt failed. Error code: " + httpRequest.status);
        console.log("Things might still load, though. Multiple attempts are made per resource.");
      }
    }
  }
  httpRequest.open("GET", dataURL);
  httpRequest.send();
}
AJAXTextLoader((responseText)=>{
    let r1 = parseRobotsTxt(responseText);
    let r2 = parseRobotsTxt2(responseText);
    console.log(r1,r2);
    if (Object.keys(r1).length !== Object.keys(r2).length) console.error("different number of keys!");
    if (r1.Allow.length !== r2.Allow.length) console.error ("different number of Allow!");
    if (r1.Disallow.length !== r2.Disallow.length) console.error ("different number of Disallow!");
    if (r1.Sitemap.length !== r2.Sitemap.length) console.error ("different number of Sitemap!");

    function checkArrEq(arr1, arr2) {
      if (!Array.isArray(arr1)) console.error("arr1 is not an array!");
      if (!Array.isArray(arr2)) console.error("arr2 is not an array!");

      let len = arr1.length;
      if (arr2.length !== len) return false;
      for (let i = 0; i < len; ++i) {
        if (arr1[i] !== arr2[i]) return false;
      }
      return true;
    }
    if (!checkArrEq(r1.Allow, r2.Allow)) console.error("Different Allow arr!");
    if (!checkArrEq(r1.Disallow, r2.Disallow)) console.error("Different Disallow arr!");
    if (!checkArrEq(r1.Sitemap, r2.Sitemap)) console.error("Different Sitemap arr!");
  }, "/robots.txt");

function parseRobotsTxt(robotsTxt) {
  let disallowed = [];
  let allowed = [];
  let sitemap = [];

  let lines = robotsTxt.split(/[\n\r]/);

  /* Do allow/disallow statements in this block apply to us? I.e. are they
   * preceded by a user-agent statement which matches us? */
  let validUserAgentSection = true;
  for (let i = 0, len = lines.length; i < len; ++i) {
    let line = lines[i].trim();

    /* Skip empty and comment lines: */
    if (line.length === 0 || line.charAt(0) === "#") continue;

    /* Check for sitemaps before checking the user agent so that they are always
     * visible to us: */
    else if (/^sitemap: /i.test(line)) {
      const SITEMAP_LEN = 9;
      sitemap.push(line.substr(SITEMAP_LEN));
    }

    /* Make sure the user agent matches this crawler: */
    else if (/^user-agent: /i.test(line)) {
      const USER_AGENT_LENGTH = 12;
      validUserAgentSection = (line.substr(USER_AGENT_LENGTH) === "*");
    }
    /* Skip the remaining section until a matching user-agent directive is found: */
    else if (!validUserAgentSection) continue;

    /* If the line is a disallow clause, add the pattern to the array of
     * disallowed patterns: */
    else if (/^disallow: /i.test(line)) {
      const DISALLOW_LEN = 10;
      disallowed.push(line.substr(DISALLOW_LEN));
    }

    /* If the line is an allow clause, add the pattern to the array of
     * allowed patterns: */
    else if (/^allow: /i.test(line)) {
      const ALLOW_LEN = 7;
      allowed.push(line.substr(ALLOW_LEN));
    }

    /* An empty disallow string is considered equal to a global allow. */
    else if (/^disallow:$/i.test(line)) {
      allowed.push("/");
    }
    else console.error('Don\'t understand: "' + line + '" ' + line.length);
  }
  let pendRet = {
    Allow: allowed,
    Disallow: disallowed,
    Sitemap: sitemap
  }
  return pendRet;
}


function parseRobotsTxt2(robotsTxt) {
  let disallowed = [];
  let allowed = [];
  let sitemap = [];

  let lines = robotsTxt.split(/[\n\r]/);

  /* Do allow/disallow statements in this block apply to us? I.e. are they
   * preceded by a user-agent statement which matches us? */
  let validUserAgentSection = true;
  for (let i = 0, len = lines.length; i < len; ++i) {
    let line = lines[i].trim();

    /* Skip empty and comment lines: */
    if (line.length === 0 || line.charAt(0) === "#") continue;

    let parsedLine = (function() {
      let splitPoint = line.indexOf(":");
      if (splitPoint === -1) {
        return undefined;
      }
      let vals = [line.substring(0, splitPoint)];
      vals[1] = line.substring(splitPoint + 1);
      return vals;
    })();
    if (parsedLine === undefined) {
      console.error(`Don't understand: "${line}"`);
    }
    let clauseType = parsedLine[0].trim().toLowerCase();
    let clauseValue = parsedLine[1].trim();

    /* Check for sitemaps before checking the user agent so that they are always
     * visible to us: */
    //else if (/^sitemap: /i.test(line)) {
    // const SITEMAP_LEN = 9;
    // sitemap.push(line.substr(SITEMAP_LEN));
    //}
    if (clauseType === "sitemap") {
      sitemap.push(clauseValue);
    }

    /* Make sure the user agent matches this crawler: */
    //else if (/^user-agent: /i.test(line)) {
    //   const USER_AGENT_LENGTH = 12;
    //   validUserAgentSection = (line.substr(USER_AGENT_LENGTH) === "*");
    // }
    else if (clauseType === "user-agent") {
      validUserAgentSection = (clauseValue === "*");
    }
    /* Skip the remaining section until a matching user-agent directive is found: */
    else if (!validUserAgentSection) continue;

    /* If the line is a disallow clause, add the pattern to the array of
     * disallowed patterns: */
    // else if (/^disallow: /i.test(line)) {
    //   const DISALLOW_LEN = 10;
    //   disallowed.push(line.substr(DISALLOW_LEN));
    // }
    else if (clauseType === "disallow") {
      /* An empty disallow string is considered equal to a global allow. */
      if (clauseValue === "") {
        allowed.push("/");
      } else {
        disallowed.push(clauseValue);
      }
    }

    /* If the line is an allow clause, add the pattern to the array of
     * allowed patterns: */
    // else if (/^allow: /i.test(line)) {
    //   const ALLOW_LEN = 7;
    //   allowed.push(line.substr(ALLOW_LEN));
    // }

    else if (clauseType === "allow") {
      allowed.push(clauseValue);
    }

    /* An empty disallow string is considered equal to a global allow. */
    // else if (/^disallow:$/i.test(line)) {
    //   allowed.push("/");
    // }
    else console.error(`Unknown clause: "${line}"`);
  }
  let pendRet = {
    Allow: allowed,
    Disallow: disallowed,
    Sitemap: sitemap
  }
  return pendRet;
}
