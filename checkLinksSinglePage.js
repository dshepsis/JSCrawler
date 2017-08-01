/* @incomplete Add support for no robots.txt file (i.e. 404 error) */

/* Settings variables: */
const BANNED_STRINGS = ["drupaldev"];
function containsBannedString(href) {
  for (let i = 0, len = BANNED_STRINGS.length; i < len; ++i) {
    let badStr = BANNED_STRINGS[i];
    if (href.indexOf(badStr) !== -1) return badStr;
    return false;
  }
}

/* Script relevant: */
let visited = {};
let allLinks = {};

let robotsDisallowed = {};
//let redirects = {};
// let notFound = {};
// let forbidden = {};
// let accessDenied = {};
let bannedStrings = {};
// let files = {};
let localFiles = {};
let badProtocol = {};
let ipAddresses = {};

/* Collecting them for reference */
let loggingObjects = {visited, allLinks, robotsDisallowed, bannedStrings, localFiles, badProtocol, ipAddresses};


function classifyLinks(doc, curPageURL, quiet) {
  /* Default "quiet" to false. That is, by default, this function prints A LOT
   * of stuff to console. */
  if (quiet === undefined) quiet = false;

  const LINKS = doc.getElementsByTagName("a");
  const DOMAIN = window.location.origin.toLowerCase();

  /* Contains the URLs of all of the local (same-domain) pages linked to from
   * this page: */
  let localLinksFromThisPage = {};

  /* Loop over links: */
  for (let i = 0, len = LINKS.length; i < len; ++i) {
    let link = LINKS[i];
    let href = link.getAttribute("href");
    /* Handle links with no HREF attribute, such as anchors or those used as
     * buttons: */
    if (href === null) {
      link.style.border = "2px solid orange";
      link.title = (link.title) ? link.title + "\nNull link" : "Null link";
      continue;
    }
    href = href.toLowerCase();
    /* Protocol-relative link correction: */
    if (href.substr(0,2) == "//") {
      let curPageProtocol = /^(\w+?):\/\//i.exec(curPageURL)[1];
      href = curPageProtocol + href;
    }

    /* Function for adding data about a link to data-logging objects: */
    function recordLinkTo(...loggingObjects) {
      let linkData = {};
      linkData[curPageURL] = href;
      for (let i = 0, len = loggingObjects.length; i < len; ++i) {
        let obj = loggingObjects[i];
        if (obj[link.href] !== undefined) obj[link.href].push(linkData);
        else obj[link.href] = [linkData];
      }
    }

    /* If the link contains a banned string, record it: */
    if (containsBannedString(href)) {
      let bannedStr = recordLinkTo(bannedStrings);

      console.error("Found link " + href+ " containing a banned string: " + bannedStr + ".\n\tLinked-to from: " + curPageURL);
      link.style.border = "4px dashed red";
      link.title = (link.title) ? link.title + "\nBANNED WORD LINK" : "BANNED WORD LINK";
    }

    /* PARSING LINK TYPES: */
    /* Absolute internal link: */
    if (href.substr(0, DOMAIN.length) === DOMAIN) {
      recordLinkTo(allLinks);

      if (isPageCrawlable(link.href)) {
        recordLinkTo(localLinksFromThisPage);
      } else {
        recordLinkTo(robotsDisallowed);
        link.style.color = "orange"
        link.title = (link.title) ? link.title + "\nCrawling dissalowed by robots.txt" : "Crawling dissalowed by robots.txt";
      }

      if (!quiet) {
        console.log(link);
        console.log(i + ":Absolute Internal:\t" + href);
      }
    }
    /* Absolute external link: */
    else if (href.substr(0,4) === "http") {
      recordLinkTo(allLinks)

      /* If the link contains a string which resembles an IP address: */
      if (/(?:\d{1,3}\.){3}\d{1,3}/i.test(href)) {
        recordLinkTo(ipAddresses);
      }

      link.style.border = "2px dotted gray";
      link.title = (link.title) ? link.title + "\nAbsolute external link" : "Absolute external link";
    }
    /* Special Link types: */
    else {
      if (href.indexOf("//") !== -1) {
        recordLinkTo(badProtocol);
      }
      /* Anchor Link: */
      if (href.substr(0,1) === "#") {
        link.style.border = "2px solid pink";
        link.title = (link.title) ? link.title + "\nAnchor link" : "Anchor link";
      }
      /* Email link: */
      else if (href.substr(0,6) === "mailto") {
        recordLinkTo(allLinks);

        link.style.border = "2px solid yellow";
        link.title = (link.title) ? link.title + "\nEmail link" : "Email link";
      }
      /* File link: */
      else if (href.substr(0,4) === "file") {
        recordLinkTo(allLinks, localFiles);

        link.style.border = "2px dashed blue";
        link.title = (link.title) ? link.title + "\nFile link" : "File link";
      }
      /* Site-Root-Relative Link: */
      else if (href.substr(0,1) === "/") {
        recordLinkTo(allLinks);

        if (isPageCrawlable(link.href)) {
          recordLinkTo(localLinksFromThisPage);
        } else {
          recordLinkTo(robotsDisallowed);
          link.style.color = "orange"
          link.title = (link.title) ? link.title + "\nCrawling dissalowed by robots.txt" : "Crawling dissalowed by robots.txt";
        }

        if (!quiet) {
          console.log(link);
          console.log(i + ":Root Relative:\t" + href);
        }
      }
      /* Page-Relative and other links: */
      else {
        recordLinkTo(allLinks);

        if (isPageCrawlable(link.href)) {
          recordLinkTo(localLinksFromThisPage);
        } else {
          recordLinkTo(robotsDisallowed);
          link.style.color = "orange"
          link.title = (link.title) ? link.title + "\nCrawling dissalowed by robots.txt" : "Crawling dissalowed by robots.txt";
        }

        if (!quiet) {
          console.log(link);
          console.log(i + ":Page Relative(?):\t" + href);
        }
      }
    } //Close section for parsing non-absolute links
  } //Close for loop iterating over link elements
  return localLinksFromThisPage;
}

/* ROBOTS.TXT PARSING: */
function AJAXTextLoader(responseCallBack, dataURL) {
  let httpRequest = new XMLHttpRequest();
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

function matchesPattern(str, basePattern) {
  let parsedPattern = basePattern;
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

/* Run Script: */
AJAXTextLoader((responseText)=>{
    let robotsTxtData = parseRobotsTxt(responseText)
    console.log(robotsTxtData);
    window.isPageCrawlable = function (fullUrl) {
      const DOMAIN = window.location.origin;
      if (DOMAIN !== fullUrl.substr(0, DOMAIN.length)) {
        throw new Error("Bad URL handed to isPageCrawlable");
      }
      /* The path portion of the fullURL. That is, the part
       * following the ".com" or ".net" or ".edu" or whatever.
       *
       * For example, on a site's homepage, the path is "/", and
       * on an faq page, it might be "/faq.html" */
      let pagePath = fullUrl.substr(DOMAIN.length);

      /* Allow statements supersede disallow statements, so we can
       * check the allowed list first and shortcut to true if we
       * find a match: */
      for (let i = 0, len = robotsTxtData.Allow.length; i < len; ++i) {
        let pattern = robotsTxtData.Allow[i]
        if (matchesPattern(pagePath, pattern)) return true;
      }
      for (let i = 0, len = robotsTxtData.Disallow.length; i < len; ++i) {
        let pattern = robotsTxtData.Disallow[i]
        if (matchesPattern(pagePath, pattern)) return false;
      }
      /* If this page is on neither the allowed nor disallowed
       * list, then we can assume it's allowed*/
      return true;
    }

    let initialPageLinks = classifyLinks(document, window.location.href);
    visited[window.location.href] = [true];
    //
    // visitLinks(window.location.href, initialPageLinks);
  },
  "/robots.txt"
);
