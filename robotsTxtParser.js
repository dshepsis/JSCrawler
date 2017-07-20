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
AJAXTextLoader((responseText)=>console.table(parseRobotsTxt(responseText)), "/robots.txt");

function parseRobotsTxt(robotsTxt) {
  let disallowed = [];
  let allowed = [];

  let lines = robotsTxt.split(/[\n\r]/);

  let ignoreUserAgentSection = false;
  for (let i = 0, len = lines.length; i < len; ++i) {
    let line = lines[i].trim();

    /* Skip comment lines: */
    if (line.charAt(0) === "#") continue;

    /* Make sure the user agent matches this crawler: */
    if (line.startsWith("User-agent: ")) {
      if (line.substr(-1) !== "*") {
        ignoreUserAgentSection = true;
      } else {
        ignoreUserAgentSection = false;
      }
    }
    /* Skip the remaining section until a matching user-agent directive is found: */
    if (ignoreUserAgentSection) continue;

    /* If the line is a disallow clause, add the pattern to the array of
     * disallowed patterns: */
    if (line.startsWith("Disallow: ")) {
      const DISALLOW_LEN = 10;
      disallowed.push(line.substr(DISALLOW_LEN));
    }

    /* If the line is an allow clause, add the pattern to the array of
     * allowed patterns: */
    if (line.startsWith("Allow: ")) {
      const ALLOW_LEN = 7;
      disallowed.push(line.substr(ALLOW_LEN));
    }
  }
  let pendRet = {
    Allow: allowed,
    Disallow: disallowed
  }
  return pendRet;
}
